use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;
use uuid::Uuid;

pub const PEER_PROTOCOL_VERSION: &str = "hhm.p2p.v1";
pub const PEER_UPDATE_MANIFEST_SCHEMA: &str = "hhm.update-manifest.v1";
pub const PEER_MAX_ENCODED_CIPHERTEXT_BYTES: usize = 87_384;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReservationStatus {
    #[default]
    Requested,
    Confirmed,
    CheckedIn,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reservation {
    pub id: Uuid,
    pub title: String,
    pub summary: String,
    pub member_name: String,
    pub space_name: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub status: ReservationStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReservation {
    pub title: String,
    #[serde(default)]
    pub summary: String,
    pub member_name: String,
    pub space_name: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
}

impl CreateReservation {
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.title.trim().is_empty() {
            return Err(ValidationError("title must not be empty".into()));
        }
        if self.summary.len() > 4_000 {
            return Err(ValidationError("summary exceeds 4000 bytes".into()));
        }
        if self.member_name.trim().is_empty() {
            return Err(ValidationError("member_name must not be empty".into()));
        }
        if self.space_name.trim().is_empty() {
            return Err(ValidationError("space_name must not be empty".into()));
        }
        Ok(())
    }

    pub fn into_record(self, id: Uuid, now: DateTime<Utc>) -> Result<Reservation, ValidationError> {
        self.validate()?;
        Ok(Reservation {
            id,
            title: self.title,
            summary: self.summary,
            member_name: self.member_name,
            space_name: self.space_name,
            starts_at: self.starts_at,
            ends_at: self.ends_at,
            status: ReservationStatus::default(),
            created_at: now,
            updated_at: now,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReservationEvent {
    pub event_id: Uuid,
    pub event_type: String,
    pub occurred_at: DateTime<Utc>,
    pub data: Reservation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PeerCapability {
    ResidentMessage,
    ContactCard,
    FileManifest,
    UpdateManifest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PeerDecision {
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PeerRejectionCode {
    ConsentDeclined,
    Expired,
    Replayed,
    AttestationInvalid,
    CapabilityDenied,
    RateLimited,
    UnsupportedVersion,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PeerPayloadType {
    #[serde(rename = "hhm.resident-message.v1")]
    ResidentMessage,
    #[serde(rename = "hhm.contact-card.v1")]
    ContactCard,
    #[serde(rename = "hhm.file-manifest.v1")]
    FileManifest,
    #[serde(rename = "hhm.update-manifest.v1")]
    UpdateManifest,
    #[serde(rename = "hhm.receipt.v1")]
    Receipt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerHandshakeRequest {
    pub protocol_version: String,
    pub session_id: Uuid,
    pub offer_id: Uuid,
    pub challenge_nonce: String,
    pub ephemeral_public_key: String,
    pub device_key_id: String,
    /// Opaque, nonce-bound proof for verification by the official Shared Auth client.
    pub device_attestation: String,
    pub requested_capabilities: Vec<PeerCapability>,
    pub expires_at: DateTime<Utc>,
}

impl PeerHandshakeRequest {
    pub fn validate_shape(&self, now: DateTime<Utc>) -> Result<(), ValidationError> {
        validate_protocol(&self.protocol_version)?;
        validate_base64url("challenge_nonce", &self.challenge_nonce, 22, 86)?;
        validate_base64url("ephemeral_public_key", &self.ephemeral_public_key, 43, 86)?;
        validate_key_id(&self.device_key_id)?;
        validate_base64url("device_attestation", &self.device_attestation, 64, 4096)?;
        validate_capabilities(&self.requested_capabilities, false)?;
        validate_short_expiry(self.expires_at, now)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerHandshakeResponse {
    pub protocol_version: String,
    pub session_id: Uuid,
    pub offer_id: Uuid,
    pub decision: PeerDecision,
    pub selected_capabilities: Vec<PeerCapability>,
    pub ephemeral_public_key: Option<String>,
    pub device_key_id: Option<String>,
    /// Opaque, nonce-bound proof for verification by the official Shared Auth client.
    pub device_attestation: Option<String>,
    pub transcript_signature: Option<String>,
    pub rejection_code: Option<PeerRejectionCode>,
    pub expires_at: DateTime<Utc>,
}

impl PeerHandshakeResponse {
    pub fn validate_shape(&self, now: DateTime<Utc>) -> Result<(), ValidationError> {
        validate_protocol(&self.protocol_version)?;
        validate_capabilities(&self.selected_capabilities, true)?;
        validate_short_expiry(self.expires_at, now)?;

        match self.decision {
            PeerDecision::Accepted => {
                if self.selected_capabilities.is_empty() {
                    return Err(ValidationError(
                        "accepted handshake requires a selected capability".into(),
                    ));
                }
                if self.rejection_code.is_some() {
                    return Err(ValidationError(
                        "accepted handshake must not include rejection_code".into(),
                    ));
                }
                validate_base64url(
                    "ephemeral_public_key",
                    required(&self.ephemeral_public_key, "ephemeral_public_key")?,
                    43,
                    86,
                )?;
                validate_key_id(required(&self.device_key_id, "device_key_id")?)?;
                validate_base64url(
                    "device_attestation",
                    required(&self.device_attestation, "device_attestation")?,
                    64,
                    4096,
                )?;
                validate_base64url(
                    "transcript_signature",
                    required(&self.transcript_signature, "transcript_signature")?,
                    64,
                    512,
                )
            }
            PeerDecision::Rejected => {
                if self.rejection_code.is_none() || !self.selected_capabilities.is_empty() {
                    return Err(ValidationError(
                        "rejected handshake needs a code and no capabilities".into(),
                    ));
                }
                if self.ephemeral_public_key.is_some()
                    || self.device_key_id.is_some()
                    || self.device_attestation.is_some()
                    || self.transcript_signature.is_some()
                {
                    return Err(ValidationError(
                        "rejected handshake must not include authenticated-session material".into(),
                    ));
                }
                Ok(())
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerEncryptedEnvelope {
    pub protocol_version: String,
    pub session_id: Uuid,
    pub message_id: Uuid,
    pub sequence: u32,
    pub payload_type: PeerPayloadType,
    pub nonce: String,
    pub ciphertext: String,
    pub sender_key_id: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

impl PeerEncryptedEnvelope {
    pub fn validate_shape(&self, now: DateTime<Utc>) -> Result<(), ValidationError> {
        validate_protocol(&self.protocol_version)?;
        validate_base64url("nonce", &self.nonce, 16, 64)?;
        validate_base64url(
            "ciphertext",
            &self.ciphertext,
            1,
            PEER_MAX_ENCODED_CIPHERTEXT_BYTES,
        )?;
        validate_key_id(&self.sender_key_id)?;
        if self.created_at > now || self.expires_at <= now || self.expires_at <= self.created_at {
            return Err(ValidationError(
                "peer envelope timestamps are expired or out of order".into(),
            ));
        }
        if self.expires_at - self.created_at > chrono::Duration::minutes(10) {
            return Err(ValidationError(
                "peer envelope lifetime exceeds 10 minutes".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PeerApplication {
    #[serde(rename = "hhm-flutter")]
    HhmFlutter,
    #[serde(rename = "hhm-desktop-app.rs")]
    HhmDesktopAppRs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PeerPlatform {
    Android,
    Ios,
    Linux,
    Macos,
    Windows,
    Web,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReleaseChannel {
    Stable,
    Beta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedUpdateManifest {
    pub schema: String,
    pub app_id: PeerApplication,
    pub platform: PeerPlatform,
    pub channel: ReleaseChannel,
    pub version: String,
    pub anti_rollback_counter: u64,
    pub artifact_size: u64,
    pub artifact_sha256: String,
    pub artifact_url: String,
    pub signing_key_id: String,
    pub signature: String,
    pub published_at: DateTime<Utc>,
}

impl SignedUpdateManifest {
    /// Validates the bounded wire shape only. The caller must verify the signature,
    /// pinned release key, official origin, platform signature, and rollback state.
    pub fn validate_shape(&self) -> Result<(), ValidationError> {
        if self.schema != PEER_UPDATE_MANIFEST_SCHEMA {
            return Err(ValidationError("unsupported update manifest schema".into()));
        }
        if !is_semver_shape(&self.version) {
            return Err(ValidationError(
                "update version is not semver-shaped".into(),
            ));
        }
        if self.anti_rollback_counter == 0 || self.artifact_size == 0 {
            return Err(ValidationError(
                "update counter and artifact size must be positive".into(),
            ));
        }
        if self.artifact_size > 2_147_483_648 {
            return Err(ValidationError("update artifact exceeds 2 GiB".into()));
        }
        if self.artifact_sha256.len() != 64
            || !self
                .artifact_sha256
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(ValidationError(
                "artifact_sha256 must be lowercase hexadecimal".into(),
            ));
        }
        if !self.artifact_url.starts_with("https://") {
            return Err(ValidationError("artifact_url must use HTTPS".into()));
        }
        validate_key_id(&self.signing_key_id)?;
        validate_base64url("signature", &self.signature, 64, 512)
    }
}

fn validate_protocol(value: &str) -> Result<(), ValidationError> {
    if value != PEER_PROTOCOL_VERSION {
        return Err(ValidationError("unsupported peer protocol version".into()));
    }
    Ok(())
}

fn validate_base64url(
    name: &str,
    value: &str,
    minimum: usize,
    maximum: usize,
) -> Result<(), ValidationError> {
    if !(minimum..=maximum).contains(&value.len())
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err(ValidationError(format!(
            "{name} must be bounded unpadded base64url"
        )));
    }
    Ok(())
}

fn validate_key_id(value: &str) -> Result<(), ValidationError> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
    {
        return Err(ValidationError("invalid peer key identifier".into()));
    }
    Ok(())
}

fn validate_capabilities(
    capabilities: &[PeerCapability],
    empty_allowed: bool,
) -> Result<(), ValidationError> {
    if capabilities.len() > 4 || (!empty_allowed && capabilities.is_empty()) {
        return Err(ValidationError("invalid peer capability count".into()));
    }
    let unique: HashSet<_> = capabilities.iter().collect();
    if unique.len() != capabilities.len() {
        return Err(ValidationError("duplicate peer capability".into()));
    }
    Ok(())
}

fn validate_short_expiry(
    expires_at: DateTime<Utc>,
    now: DateTime<Utc>,
) -> Result<(), ValidationError> {
    if expires_at <= now || expires_at - now > chrono::Duration::minutes(2) {
        return Err(ValidationError(
            "peer handshake must expire within 2 minutes".into(),
        ));
    }
    Ok(())
}

fn required<'a>(value: &'a Option<String>, name: &str) -> Result<&'a str, ValidationError> {
    value
        .as_deref()
        .ok_or_else(|| ValidationError(format!("accepted handshake requires {name}")))
}

fn is_semver_shape(value: &str) -> bool {
    let core = value.split_once('-').map_or(value, |(core, _)| core);
    let mut parts = core.split('.');
    let valid = (&mut parts)
        .take(3)
        .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()));
    valid && core.matches('.').count() == 2
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationError(pub String);

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ValidationError {}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn status_serializes_as_wire_value() {
        let value = serde_json::to_string(&ReservationStatus::default()).unwrap();
        assert_eq!(value, serde_json::to_string(&"requested").unwrap());
    }

    #[test]
    fn desktop_application_id_keeps_the_repository_dot_suffix() {
        let value = serde_json::to_string(&PeerApplication::HhmDesktopAppRs).unwrap();
        assert_eq!(value, serde_json::to_string(&"hhm-desktop-app.rs").unwrap());
    }

    fn accepted_handshake(now: DateTime<Utc>) -> PeerHandshakeResponse {
        PeerHandshakeResponse {
            protocol_version: PEER_PROTOCOL_VERSION.into(),
            session_id: Uuid::new_v4(),
            offer_id: Uuid::new_v4(),
            decision: PeerDecision::Accepted,
            selected_capabilities: vec![PeerCapability::ResidentMessage],
            ephemeral_public_key: Some("e".repeat(43)),
            device_key_id: Some("device:key-1".into()),
            device_attestation: Some("a".repeat(64)),
            transcript_signature: Some("s".repeat(64)),
            rejection_code: None,
            expires_at: now + chrono::Duration::seconds(30),
        }
    }

    #[test]
    fn accepted_peer_handshake_requires_authenticated_material() {
        let now = Utc::now();
        let mut response = accepted_handshake(now);
        assert!(response.validate_shape(now).is_ok());
        response.device_attestation = None;
        assert!(response.validate_shape(now).is_err());
        response.device_attestation = Some("a".repeat(64));
        response.selected_capabilities.clear();
        assert!(response.validate_shape(now).is_err());
    }

    #[test]
    fn rejected_peer_handshake_cannot_grant_capabilities() {
        let now = Utc::now();
        let mut response = PeerHandshakeResponse {
            protocol_version: PEER_PROTOCOL_VERSION.into(),
            session_id: Uuid::new_v4(),
            offer_id: Uuid::new_v4(),
            decision: PeerDecision::Rejected,
            selected_capabilities: Vec::new(),
            ephemeral_public_key: None,
            device_key_id: None,
            device_attestation: None,
            transcript_signature: None,
            rejection_code: Some(PeerRejectionCode::ConsentDeclined),
            expires_at: now + chrono::Duration::seconds(30),
        };
        assert!(response.validate_shape(now).is_ok());
        response
            .selected_capabilities
            .push(PeerCapability::ResidentMessage);
        assert!(response.validate_shape(now).is_err());
    }

    #[test]
    fn peer_envelope_fails_closed_on_oversize_or_expiry() {
        let now = Utc::now();
        let mut envelope = PeerEncryptedEnvelope {
            protocol_version: PEER_PROTOCOL_VERSION.into(),
            session_id: Uuid::new_v4(),
            message_id: Uuid::new_v4(),
            sequence: 1,
            payload_type: PeerPayloadType::ResidentMessage,
            nonce: "n".repeat(16),
            ciphertext: "c".repeat(64),
            sender_key_id: "device:key-1".into(),
            created_at: now - chrono::Duration::seconds(1),
            expires_at: now + chrono::Duration::minutes(1),
        };
        assert!(envelope.validate_shape(now).is_ok());
        envelope.ciphertext = "c".repeat(PEER_MAX_ENCODED_CIPHERTEXT_BYTES + 1);
        assert!(envelope.validate_shape(now).is_err());
        envelope.ciphertext = "c".repeat(64);
        envelope.expires_at = now - chrono::Duration::seconds(1);
        assert!(envelope.validate_shape(now).is_err());
    }

    #[test]
    fn update_manifest_shape_requires_https_digest_and_counter() {
        let mut manifest = SignedUpdateManifest {
            schema: PEER_UPDATE_MANIFEST_SCHEMA.into(),
            app_id: PeerApplication::HhmFlutter,
            platform: PeerPlatform::Android,
            channel: ReleaseChannel::Stable,
            version: "1.2.3".into(),
            anti_rollback_counter: 7,
            artifact_size: 1024,
            artifact_sha256: "a".repeat(64),
            artifact_url: "https://releases.example.invalid/hhm-flutter.apk".into(),
            signing_key_id: "release:key-1".into(),
            signature: "s".repeat(64),
            published_at: Utc::now(),
        };
        assert!(manifest.validate_shape().is_ok());
        manifest.artifact_url = "http://nearby-peer/update".into();
        assert!(manifest.validate_shape().is_err());
        manifest.artifact_url = "https://releases.example.invalid/hhm-flutter.apk".into();
        manifest.anti_rollback_counter = 0;
        assert!(manifest.validate_shape().is_err());
    }

    #[test]
    fn canonical_peer_fixture_deserializes_and_validates() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../fixtures/peer-session.json")).unwrap();
        let now = Utc::now();

        let mut request: PeerHandshakeRequest =
            serde_json::from_value(fixture["handshake_request"].clone()).unwrap();
        request.expires_at = now + chrono::Duration::seconds(30);
        assert!(request.validate_shape(now).is_ok());

        let mut response: PeerHandshakeResponse =
            serde_json::from_value(fixture["handshake_response"].clone()).unwrap();
        response.expires_at = now + chrono::Duration::seconds(30);
        assert!(response.validate_shape(now).is_ok());

        let mut envelope: PeerEncryptedEnvelope =
            serde_json::from_value(fixture["encrypted_envelope"].clone()).unwrap();
        envelope.created_at = now - chrono::Duration::seconds(1);
        envelope.expires_at = now + chrono::Duration::minutes(1);
        assert!(envelope.validate_shape(now).is_ok());

        let manifest: SignedUpdateManifest =
            serde_json::from_value(fixture["signed_update_manifest"].clone()).unwrap();
        assert!(manifest.validate_shape().is_ok());
    }
}
