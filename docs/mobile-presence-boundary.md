# Resident mobile presence boundary

Status: contract and native application implementation required. The HHM GitHub organization does not currently contain an `hhm-flutter` or equivalent resident-app repository.

The resident app should make arrival and departure convenient, but a phone's Bluetooth proximity, geofence, or motion estimate is not proof that a person crossed a door. Radio signals can be relayed, replayed, copied, obstructed, or observed through walls; mobile operating systems may suspend background work. The server must never mark a resident present or absent from a client assertion alone.

## Product rules

- Shared Auth establishes the principal. HHM separately verifies an active resident membership for the relevant house; roles or email-domain checks are not substitutes.
- Each enrolled app installation has a unique device ID and hardware-backed signing key where the platform supports it. Device enrollment, replacement, loss, revocation, and resident move-out are explicit lifecycle events.
- Automatic presence is opt-in, visible, reversible, and accompanied by a manual in-app control and the rotating QR flow. Residents without a compatible phone need an equally practical alternative.
- The app may use coarse geofencing locally to decide when to scan, but it must not upload continuous location history. Raw GPS tracks, nearby-device inventories, and unrelated Bluetooth identifiers are prohibited.
- A visitor is not required to install the resident app. Visitor access remains a separate, short-lived capability flow.
- “Every resident has enrolled or received an approved alternative” is an operational rollout metric, not an authentication or authorization rule.

## Door challenge protocol

Each managed doorway broadcasts a short-lived, authenticated challenge through Bluetooth Low Energy and makes the same challenge available through a local NFC or QR fallback. A challenge is bound to the house, door, beacon device, key version, validity window, and a high-entropy nonce. Beacons rotate frequently and never broadcast a resident or visitor identifier.

When the app believes a crossing occurred, it submits the observed challenge over TLS with:

- a fresh server-issued submission nonce;
- its registered device ID and app/protocol version;
- the claimed direction, local observation time, and bounded signal-quality bucket;
- the signed door challenge;
- a signature from the enrolled device key over the complete request;
- platform attestation when available.

The authenticated resident identity comes from the verified session, never from a subject or email supplied in the request body. The server checks house membership, device status, challenge signature and key version, door assignment, time window, server nonce, device signature, attestation policy, exact audience, and replay cache before accepting a transition.

A door controller or a second independent signal should confirm direction. If direction or timing is ambiguous, the server records `presence_confirmation_required` and asks the resident rather than guessing. Geofencing may suppress obviously implausible attempts, but it is not a positive access credential.

## Presence state machine

```text
absent -> entry_pending -> present -> exit_pending -> absent
                  \-> confirmation_required <-/
```

Only the server owns the current state and monotonic sequence number. Every accepted transition has a globally unique event ID, idempotency key, previous sequence, source, door, server timestamp, device ID, and policy version. Duplicate requests return the original result. Conflicting events enter confirmation instead of using last-write-wins.

The mobile app keeps a bounded offline outbox using Opto Sync causal envelopes. It may retry an observation, but an expired door challenge can never be made valid by offline synchronization. The server returns a stable rejection reason so the app can offer QR or manual confirmation.

## Proposed interfaces

The canonical API should eventually provide:

- `POST /v1/resident-devices/enrollment-challenges`
- `POST /v1/resident-devices`
- `DELETE /v1/resident-devices/{device_id}`
- `POST /v1/presence/submission-nonces`
- `POST /v1/presence/observations`
- `GET /v1/presence/current`
- `POST /v1/presence/confirmations/{event_id}`

These routes must not be implemented until the resident membership permission model, door-device trust chain, signed challenge format, platform attestation policy, replay store, and durable presence ledger are specified together. Enrollment and revocation require stronger assurance than an ordinary background refresh session.

## Privacy and retention

The durable ledger records the minimum transition evidence needed for safety and operations. It does not store continuous location, raw Bluetooth scans, contact graphs, advertising IDs, or motion history. Signal strength should be reduced to a bounded bucket before upload. Operational logs contain opaque event, device, door, and policy identifiers, never location trails, nearby-device data, authorization tokens, or signed challenges.

HHM must publish the purpose, data fields, recipients, retention period, and correction/deletion process before enrollment. Access to individual presence history is a separate HHM product permission with an audit trail. Aggregate occupancy should be derived with privacy-preserving thresholds rather than exposing a resident-by-resident feed.

## Native application requirements

The application needs real Android and iOS background-mode testing; a WebView or WASM bundle cannot provide reliable cross-platform BLE scanning by itself. Flutter may host the shared UI and API client, while small audited platform adapters own BLE, NFC, secure key storage, attestation, notifications, and background scheduling.

The release gate includes:

- cold-start, already-running, offline, low-power, denied-permission, revoked-device, lost-phone, clock-skew, and OS-killed scenarios;
- relay, replay, cloned-beacon, rooted/jailbroken-device, stale-challenge, cross-house, wrong-door, duplicate-event, and out-of-order-event tests;
- accessible QR/manual fallback and a resident-visible presence history with correction flow;
- battery and false-transition measurement inside and outside every actual doorway;
- an incident kill switch for a door key, app version, device, house, or the entire automatic-presence feature.

Until these pieces exist, the mobile clients should consume the visitor QR and HTML component contracts only for explicit user-driven flows and must not claim automatic sign-in or sign-out.
