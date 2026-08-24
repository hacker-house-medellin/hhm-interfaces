# hhm-interfaces

Canonical Hacker House Medellin OpenAPI, AsyncAPI, JSON Schema, member, stay, room, event, and project contracts.

Initialized through `DEN-1950` as a testable `interfaces` foundation. Product behavior continues through focused pull requests.

Visitor check-in, check-out, minute-rotating QR issuance, and stable error payloads are defined in `schemas/visitor-access.json` and exposed by both `openapi.yaml` and `openapi/openapi.json`. QR issuance accepts either Shared Auth bearer authentication or the Supabase token header at the transport layer; HHM services must still apply product-owned authorization to the verified provider, tenant, and subject tuple.

The visitor contract deliberately contains no camera, audio, biometric, transcript, or activity-inference payload. Those data classes require a separately reviewed privacy and security interface before an ingestion endpoint can exist.

The native resident-app and automatic-presence threat model is documented in [`docs/mobile-presence-boundary.md`](docs/mobile-presence-boundary.md). Bluetooth or location alone is never accepted as proof of a doorway crossing.

Authenticated, consented peer sessions over Bluetooth or another nearby transport are defined by [`schemas/peer-session.json`](schemas/peer-session.json), [`fixtures/peer-session.json`](fixtures/peer-session.json), and [`docs/p2p-bluetooth-boundary.md`](docs/p2p-bluetooth-boundary.md). BLE discovery, signal strength, OS pairing, and remembered devices never establish trust. The v1 contract requires a Shared Auth–bound device attestation, an authenticated ephemeral-key transcript, replay/expiry checks, allowlisted encrypted payload types, bounded envelopes, and signed anti-rollback update metadata. Peers cannot authorize users, unlock doors, transmit credentials, or cause peer-supplied code to execute.

```bash
python3 scripts/verify_repo.py
```
