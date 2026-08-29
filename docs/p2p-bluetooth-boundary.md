# Authenticated peer sessions over nearby transports

HHM may use Bluetooth Low Energy to discover another opted-in application and
carry bounded protocol frames. A radio observation is not identity, trust,
authentication, authorization, resident status, door access, or evidence that
a person is physically present. OS pairing, a familiar device name, RSSI, a
remembered peer, and a successful BLE connection do not raise assurance.

The canonical wire objects are defined in
[`schemas/peer-session.json`](../schemas/peer-session.json) under protocol
version `hhm.p2p.v1`.

## Consent and discovery

- Discovery and advertising are off by default and require a foreground,
  purpose-specific user action. A user selects the peer and the capability set.
- Advertisements use frequently rotated, unlinkable random offers. They contain
  no resident identifier, role, household, email, phone number, stable device
  identifier, access token, or authorization claim.
- The app stops discovery, advertising, and active sessions on logout, consent
  withdrawal, background expiry, account switch, or policy change.
- A visitor is never required to participate. Door presence remains governed by
  the independent, corroborated presence boundary.

## Authenticated session establishment

After discovery, both peers create fresh ephemeral key pairs and a high-entropy
challenge. Each side presents a short-lived Shared Auth–bound device
attestation covering the protocol version, both offers, both challenges, the
ephemeral keys, the intended HHM audience/client, the requested capabilities,
and the expiry. The peer verifies the official signed result and product-owned
authorization independently; a protected-introspection service credential is
never placed in a native app or sent over BLE.

The final session key is derived from an authenticated ephemeral key agreement
and the complete transcript. The transcript is signed by both device-bound
keys. A session fails closed when any signature, issuer, audience, client,
subject/device binding, capability, expiry, nonce, sequence, or protocol
version is missing, ambiguous, replayed, or invalid. Authentication success
does not itself authorize a payload; HHM product policy must allow each
capability for that peer and resource.

No password, access code, OTP/TOTP value or seed, bearer/session token, service
credential, private key, biometric, payment material, door challenge, or
protected-introspection response may be transmitted as a peer payload.

## Data sharing

Every payload uses an `EncryptedEnvelope` with an allowlisted versioned type,
session identifier, unique message identifier, monotonic sequence, authenticated
expiry, sender key identifier, nonce, and end-to-end ciphertext. Implementations
must enforce these ceilings before allocation or decryption:

- 64 KiB decoded ciphertext per envelope;
- 32 envelopes per second and 256 queued envelopes per session;
- 10-minute maximum idle session and 30-minute absolute session lifetime;
- one use per handshake offer/challenge and one acceptance per message ID and
  sequence;
- no arbitrary content type, dynamic telemetry attribute map, or implicit file
  transfer.

Files use a signed manifest and explicit recipient confirmation before any
bounded chunk transfer is enabled by a later contract. The v1 schema contains
only `file_manifest`; raw file chunks are intentionally not standardized yet.
Logs and Ores OTEL events record opaque outcome/reason buckets and protocol
versions only. They exclude peer advertisements, key identifiers, attestations,
payloads, ciphertext, device names, contact graphs, exact radio measurements,
and location.

## Application updates

Nearby peers may announce or cache a `SignedUpdateManifest`; they are an
untrusted discovery and transport hint. The receiver must:

1. validate the manifest with a pinned HHM release-signing public key whose
   rotation is delivered through an independently trusted application release;
2. require the exact application ID, platform, release channel, canonical
   serialization, artifact digest, artifact size, and monotonically increasing
   anti-rollback counter;
3. obtain/install the artifact through the OS application store or an
   allowlisted official HTTPS release origin, applying platform signature and
   notarization checks; and
4. reject downgrades, expired/unknown signing keys, ambiguous versions, digest
   mismatches, unsupported platforms, and any package that would execute from a
   peer-controlled location.

The protocol never loads scripts, WASM modules, native libraries, UI blobs, or
executables merely because a peer delivered them. Web/Flutter component blobs
remain inert presentation contracts and are not an update mechanism.

## Release gate

Production use requires interoperable hostile and positive fixtures in
`hhm-interfaces`, `hhm-flutter`, and `hhm-desktop-app.rs`; official Shared Auth
client availability; reviewed platform permissions and background behavior;
device-key revocation and recovery; fuzzing of framing and canonicalization;
rate-limit/load evidence; and a privacy/legal review for the operating region.
Until those gates pass, builds may expose a disabled experimental screen but
must not claim trusted P2P sharing or peer-assisted updates.
