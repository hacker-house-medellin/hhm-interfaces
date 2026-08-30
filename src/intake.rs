//! Versioned HHaus intake contracts shared by the public site and Rust servers.
//!
//! Authentication-derived subjects are intentionally absent from every create
//! body. Runtimes attach a verified subject after authentication and before
//! persistence.

use chrono::{Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use url::Url;
use uuid::Uuid;

pub const PRIVACY_NOTICE_VERSION: &str = "2026-08-30";
pub const MAX_UPLOAD_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StayPreference {
    ThreeMonths,
    SixMonths,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectStage {
    Idea,
    Prototype,
    EarlyRevenue,
    Growing,
    NonprofitOrOpenSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UploadKind {
    Resume,
    PhotoId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreInterestCreate {
    pub email: String,
    pub linkedin_url: String,
    pub entrepreneurship_idea: String,
    pub stay_preference: StayPreference,
    pub privacy_notice_version: String,
    pub turnstile_token: String,
}

impl PreInterestCreate {
    pub fn validate(&self) -> Result<(), IntakeValidationError> {
        validate_email(&self.email)?;
        validate_linkedin(&self.linkedin_url)?;
        validate_text(
            "entrepreneurshipIdea",
            &self.entrepreneurship_idea,
            40,
            4_000,
        )?;
        validate_notice(&self.privacy_notice_version)?;
        validate_text("turnstileToken", &self.turnstile_token, 1, 4_096)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UploadIntentCreate {
    pub kind: UploadKind,
    pub file_name: String,
    pub content_type: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub turnstile_token: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UploadCompleteCreate {
    pub sha256: String,
    pub turnstile_token: String,
}

impl UploadCompleteCreate {
    pub fn validate(&self) -> Result<(), IntakeValidationError> {
        validate_sha256(&self.sha256)?;
        validate_text("turnstileToken", &self.turnstile_token, 1, 4_096)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadCompletionReceipt {
    pub upload_id: Uuid,
    pub status: UploadCompletionStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UploadCompletionStatus {
    Verified,
}

impl UploadIntentCreate {
    pub fn validate(&self) -> Result<(), IntakeValidationError> {
        validate_text("fileName", &self.file_name, 1, 255)?;
        if self.file_name.contains('/')
            || self.file_name.contains('\\')
            || self.file_name.contains('\0')
        {
            return Err(IntakeValidationError::Invalid("fileName"));
        }
        let allowed = match self.kind {
            UploadKind::Resume => [
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ]
            .as_slice(),
            UploadKind::PhotoId => {
                ["application/pdf", "image/jpeg", "image/png", "image/heic"].as_slice()
            }
        };
        if !allowed.contains(&self.content_type.as_str()) {
            return Err(IntakeValidationError::Invalid("contentType"));
        }
        if !(1..=MAX_UPLOAD_BYTES).contains(&self.size_bytes) {
            return Err(IntakeValidationError::Invalid("sizeBytes"));
        }
        validate_sha256(&self.sha256)?;
        validate_text("turnstileToken", &self.turnstile_token, 1, 4_096)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplicationCreate {
    pub email: String,
    pub linkedin_url: String,
    pub legal_name: String,
    pub date_of_birth: NaiveDate,
    pub nationality: String,
    pub phone: String,
    pub current_city: String,
    pub github_url: Option<String>,
    pub portfolio_url: Option<String>,
    pub entrepreneurship_idea: String,
    pub project_stage: ProjectStage,
    pub stay_preference: StayPreference,
    pub preferred_start_month: NaiveDate,
    pub community_contribution: String,
    pub accessibility_or_accommodation_notes: Option<String>,
    pub resume_upload_id: Uuid,
    pub photo_id_upload_id: Uuid,
    pub age_and_identity_attestation: bool,
    pub privacy_notice_version: String,
    pub turnstile_token: String,
}

impl ApplicationCreate {
    pub fn validate(&self) -> Result<(), IntakeValidationError> {
        validate_email(&self.email)?;
        validate_linkedin(&self.linkedin_url)?;
        validate_text("legalName", &self.legal_name, 2, 200)?;
        validate_adult(self.date_of_birth)?;
        validate_text("nationality", &self.nationality, 2, 120)?;
        validate_text("phone", &self.phone, 7, 32)?;
        validate_text("currentCity", &self.current_city, 2, 160)?;
        validate_optional_https_url("githubUrl", self.github_url.as_deref())?;
        validate_optional_https_url("portfolioUrl", self.portfolio_url.as_deref())?;
        validate_text(
            "entrepreneurshipIdea",
            &self.entrepreneurship_idea,
            80,
            8_000,
        )?;
        validate_text(
            "communityContribution",
            &self.community_contribution,
            40,
            4_000,
        )?;
        if let Some(notes) = self.accessibility_or_accommodation_notes.as_deref() {
            validate_text("accessibilityOrAccommodationNotes", notes, 0, 4_000)?;
        }
        if !self.age_and_identity_attestation {
            return Err(IntakeValidationError::Invalid("ageAndIdentityAttestation"));
        }
        validate_notice(&self.privacy_notice_version)?;
        validate_text("turnstileToken", &self.turnstile_token, 1, 4_096)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReferralCreate {
    pub referee_name: String,
    pub referee_email: String,
    pub referee_linkedin_url: String,
    pub relationship: String,
    pub rationale: String,
    pub stay_preference: Option<StayPreference>,
    pub nominee_consent_confirmed: bool,
}

impl ReferralCreate {
    pub fn validate(&self) -> Result<(), IntakeValidationError> {
        validate_text("refereeName", &self.referee_name, 2, 200)?;
        validate_email(&self.referee_email)?;
        validate_linkedin(&self.referee_linkedin_url)?;
        validate_text("relationship", &self.relationship, 2, 120)?;
        validate_text("rationale", &self.rationale, 40, 4_000)?;
        if !self.nominee_consent_confirmed {
            return Err(IntakeValidationError::Invalid("nomineeConsentConfirmed"));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionReceipt {
    pub submission_id: Uuid,
    pub kind: SubmissionKind,
    pub accepted_at: chrono::DateTime<Utc>,
    pub primary_persistence: PersistenceReceipt,
    pub supabase_persistence: PersistenceReceipt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubmissionKind {
    PreInterest,
    Application,
    Referral,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PersistenceReceipt {
    Stored,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum IntakeValidationError {
    #[error("missing required field {0}")]
    Missing(&'static str),
    #[error("invalid field {0}")]
    Invalid(&'static str),
}

fn validate_email(value: &str) -> Result<(), IntakeValidationError> {
    validate_text("email", value, 3, 320)?;
    let (local, domain) = value
        .rsplit_once('@')
        .ok_or(IntakeValidationError::Invalid("email"))?;
    if local.is_empty()
        || domain.is_empty()
        || !domain.contains('.')
        || value.chars().any(char::is_whitespace)
    {
        return Err(IntakeValidationError::Invalid("email"));
    }
    Ok(())
}

fn validate_linkedin(value: &str) -> Result<(), IntakeValidationError> {
    let parsed = validate_https_url("linkedinUrl", value)?;
    let host = parsed
        .host_str()
        .unwrap_or_default()
        .trim_start_matches("www.");
    if !matches!(host, "linkedin.com" | "linkedin.cn")
        || parsed.username() != ""
        || parsed.password().is_some()
        || !parsed.path().starts_with("/in/")
    {
        return Err(IntakeValidationError::Invalid("linkedinUrl"));
    }
    Ok(())
}

fn validate_optional_https_url(
    field: &'static str,
    value: Option<&str>,
) -> Result<(), IntakeValidationError> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => validate_https_url(field, value).map(|_| ()),
        None => Ok(()),
    }
}

fn validate_https_url(field: &'static str, value: &str) -> Result<Url, IntakeValidationError> {
    let parsed = Url::parse(value).map_err(|_| IntakeValidationError::Invalid(field))?;
    if parsed.scheme() != "https" || parsed.host_str().is_none() || parsed.fragment().is_some() {
        return Err(IntakeValidationError::Invalid(field));
    }
    Ok(parsed)
}

fn validate_notice(value: &str) -> Result<(), IntakeValidationError> {
    if value != PRIVACY_NOTICE_VERSION {
        return Err(IntakeValidationError::Invalid("privacyNoticeVersion"));
    }
    Ok(())
}

fn validate_sha256(value: &str) -> Result<(), IntakeValidationError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(IntakeValidationError::Invalid("sha256"));
    }
    Ok(())
}

fn validate_adult(date_of_birth: NaiveDate) -> Result<(), IntakeValidationError> {
    let today = Utc::now().date_naive();
    let eighteenth_birthday = date_of_birth
        .with_year(date_of_birth.year().saturating_add(18))
        .or_else(|| {
            date_of_birth
                .with_day(28)
                .and_then(|date| date.with_year(date.year() + 18))
        })
        .ok_or(IntakeValidationError::Invalid("dateOfBirth"))?;
    if eighteenth_birthday > today || date_of_birth < NaiveDate::from_ymd_opt(1900, 1, 1).unwrap() {
        return Err(IntakeValidationError::Invalid("dateOfBirth"));
    }
    Ok(())
}

fn validate_text(
    field: &'static str,
    value: &str,
    minimum: usize,
    maximum: usize,
) -> Result<(), IntakeValidationError> {
    let length = value.trim().chars().count();
    if length < minimum || length > maximum || value.chars().any(|character| character == '\0') {
        return Err(IntakeValidationError::Invalid(field));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_pre_interest() -> PreInterestCreate {
        PreInterestCreate {
            email: "builder@example.com".into(),
            linkedin_url: "https://www.linkedin.com/in/example-builder".into(),
            entrepreneurship_idea: "A cooperative platform that helps independent builders share trusted operational knowledge.".into(),
            stay_preference: StayPreference::ThreeMonths,
            privacy_notice_version: PRIVACY_NOTICE_VERSION.into(),
            turnstile_token: "test-proof".into(),
        }
    }

    #[test]
    fn pre_interest_rejects_non_linkedin_and_stale_notice() {
        let mut input = valid_pre_interest();
        input.linkedin_url = "https://example.com/in/builder".into();
        assert_eq!(
            input.validate(),
            Err(IntakeValidationError::Invalid("linkedinUrl"))
        );

        let mut input = valid_pre_interest();
        input.privacy_notice_version = "old".into();
        assert_eq!(
            input.validate(),
            Err(IntakeValidationError::Invalid("privacyNoticeVersion"))
        );
    }

    #[test]
    fn upload_intents_fail_closed_on_type_size_path_and_digest() {
        let base = UploadIntentCreate {
            kind: UploadKind::PhotoId,
            file_name: "identity.jpg".into(),
            content_type: "image/jpeg".into(),
            size_bytes: 1234,
            sha256: "a".repeat(64),
            turnstile_token: "proof".into(),
        };
        assert_eq!(base.validate(), Ok(()));

        for invalid in [
            UploadIntentCreate {
                file_name: "../identity.jpg".into(),
                ..base.clone()
            },
            UploadIntentCreate {
                content_type: "text/html".into(),
                ..base.clone()
            },
            UploadIntentCreate {
                size_bytes: MAX_UPLOAD_BYTES + 1,
                ..base.clone()
            },
            UploadIntentCreate {
                sha256: "A".repeat(64),
                ..base.clone()
            },
        ] {
            assert!(invalid.validate().is_err());
        }
    }

    #[test]
    fn upload_completion_rejects_uppercase_or_missing_proof() {
        assert_eq!(
            UploadCompleteCreate {
                sha256: "A".repeat(64),
                turnstile_token: "proof".into(),
            }
            .validate(),
            Err(IntakeValidationError::Invalid("sha256"))
        );
        assert!(UploadCompleteCreate {
            sha256: "a".repeat(64),
            turnstile_token: String::new(),
        }
        .validate()
        .is_err());
    }

    #[test]
    fn unknown_body_subjects_are_rejected_by_serde() {
        let value = serde_json::json!({
            "email": "builder@example.com",
            "linkedinUrl": "https://www.linkedin.com/in/example-builder",
            "entrepreneurshipIdea": "A cooperative platform that helps independent builders share trusted operational knowledge.",
            "stayPreference": "three_months",
            "privacyNoticeVersion": PRIVACY_NOTICE_VERSION,
            "turnstileToken": "proof",
            "subject": "attacker-selected"
        });
        assert!(serde_json::from_value::<PreInterestCreate>(value).is_err());
    }
}
