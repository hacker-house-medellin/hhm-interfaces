# hhm-interfaces

Canonical Hacker House Medellin OpenAPI, AsyncAPI, JSON Schema, member, stay, room, event, and project contracts.

The public and authenticated intake surfaces are defined from one TypeSpec source in `typespec/main.tsp`. It covers pre-interest, application, private resume/photo-ID upload intents, authenticated referrals, durable dual-persistence receipts, and the append-only user-points contract. Generated OpenAPI and JSON Schema artifacts live under `generated/`; privacy, retention, idempotency, and dual-write behavior are documented in `docs/intake-privacy-boundary.md`.

```bash
npm ci
npm run generate:intake
```

The platform operations kernel is a separate additive lane. Its TypeSpec and
JSON Schema documents are independently human-authored authorities; neither is
generated from the other. A pinned `ores-contracts` revision parses and emits
both lanes independently, rejects structural or byte-level disagreement, and
publishes the agreed PostgreSQL, Rust, SeaORM, Diesel, TypeScript, and Dart
artifacts under `generated/platform/`.

The v1 kernel covers B2B organizations and B2C accounts, locations and spaces,
reservations, guest passes and visits, access grants and fail-closed decisions,
network credentials, maintenance, housekeeping, and privacy-safe security
observations. Lifecycle mutations use version-checked append-only transition
records. A bounded Protobuf envelope transports only payloads that pass the
agreed runtime validator; Protobuf is not a third persistence authority.

```bash
npm ci
npm run verify:platform
cargo check --locked --manifest-path tests/platform-rust-witness/Cargo.toml
```

See [`docs/platform-contracts.md`](docs/platform-contracts.md) for ownership,
privacy, transactional invariants, and downstream adoption gates.

Initialized through `DEN-1950` as a testable `interfaces` foundation. Product behavior continues through focused pull requests.

Visitor check-in, check-out, minute-rotating QR issuance, and stable error payloads are defined in `schemas/visitor-access.json` and exposed by both `openapi.yaml` and `openapi/openapi.json`. QR issuance accepts either Shared Auth bearer authentication or the Supabase token header at the transport layer; HHM services must still apply product-owned authorization to the verified provider, tenant, and subject tuple.

The visitor contract deliberately contains no camera, audio, biometric, transcript, or activity-inference payload. Those data classes require a separately reviewed privacy and security interface before an ingestion endpoint can exist.

The native resident-app and automatic-presence threat model is documented in [`docs/mobile-presence-boundary.md`](docs/mobile-presence-boundary.md). Bluetooth or location alone is never accepted as proof of a doorway crossing.

Authenticated, consented peer sessions over Bluetooth or another nearby transport are defined by [`schemas/peer-session.json`](schemas/peer-session.json), [`schemas/p2p-json-records.json`](schemas/p2p-json-records.json), their fixtures, and [`docs/p2p-bluetooth-boundary.md`](docs/p2p-bluetooth-boundary.md). BLE discovery, signal strength, OS pairing, and remembered devices never establish trust. The v1 contract requires a Shared Auth–bound device attestation, an authenticated ephemeral-key transcript, replay/expiry checks, allowlisted encrypted payload types, bounded envelopes, and signed anti-rollback update metadata. The only v1 JSON records are bounded contact cards, plain-text resident messages, and receipts; arbitrary JSON, HTML, credentials, and executable payloads are not supported. Peers cannot authorize users, unlock doors, transmit credentials, or cause peer-supplied code to execute.

Managed-doorway observations are defined by [`schemas/doorway-observation.json`](schemas/doorway-observation.json) and [`fixtures/doorway-observation.json`](fixtures/doorway-observation.json). An observation combines a registered beacon's signed challenge, a separately keyed corroboration proof, a backend submission nonce, and an enrolled device signature. It can establish that an enrolled device observed valid managed-doorway evidence; it does not establish biometric identity, a person's exact location, or door-unlock authorization. Ambiguous or contradictory direction evidence requires resident confirmation.

## Resident operations v1

[`contracts/resident-operations/v1`](contracts/resident-operations/v1) adds the peer-authority contract for guests, rooms and shared spaces, cooking and meals, polls, rent, Stripe reconciliation references, refunds, legal onboarding checkpoints, offline persistence receipts, MIP assignments, `ores-chat` groups and time-bounded developer access. The matching architecture and data-authority boundaries are documented in [`docs/resident-operations-v1.md`](docs/resident-operations-v1.md).

Unlike the older intake generation lane, this contract deliberately keeps TypeSpec and authored JSON Schema Draft 2020-12 as independent authorities. Hosted CI generates comparison-only evidence with an exact-revision pin of `ORESoftware/typespec-json-schema-validator` and executes both authorities over the checked-in positive/negative corpus.

```bash
npx tsjsv check \
  --typespec=contracts/resident-operations/v1/main.tsp \
  --schema=contracts/resident-operations/v1/authored.schema.json \
  --instances=contracts/resident-operations/v1/instances
```

```bash
python3 scripts/verify_repo.py
```
