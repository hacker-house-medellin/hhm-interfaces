# Platform contracts v1

## Authority ownership

`contracts/platform/typespec/main.tsp` and
`contracts/platform/json-schema/contract.schema.json` are independent,
human-authored authorities. Neither file may be generated from, overwritten by,
or silently preferred over the other. The pinned `ores-contracts` checker:

1. parses both authorities into separate normalized models;
2. compiles the TypeSpec authority with TypeSpec 1.15;
3. reports every structural disagreement;
4. emits all seven language/database artifacts from each authority separately;
5. byte-compares the two artifact lanes; and
6. writes agreed artifacts only when every gate passes.

`generated/platform/receipt.json` is intentionally not versioned because its
check timestamp is nondeterministic. CI asserts the receipt in
`target/ores-contracts/platform/receipt.json`, while every deterministic
artifact in `generated/platform/` is committed and drift-checked.

The protobuf document owns only the bounded realtime transport envelope. Its
JSON payload is decoded and validated as the model selected by the event type.
It does not compete with TypeSpec or JSON Schema for persistence semantics.

## Transactional invariants

Shape validation alone is insufficient. Services and database capabilities
must enforce these invariants transactionally:

- capacity and organization seat limits are positive;
- reservation, guest, access, network, and housekeeping windows are ordered;
- reservation occupancy never exceeds the selected space capacity;
- active reservations for the same space do not overlap;
- lifecycle commands use the declared edge and compare `expectedVersion` with
  the current aggregate version in the same transaction;
- an idempotency key cannot be replayed with a different canonical request;
- transition and access-decision ledgers are append-only;
- an allow decision requires a matching active grant, exact principal,
  location and space, a current validity window, accepted evidence, and a
  current policy version;
- missing identity, unavailable policy, malformed evidence, replay, ambiguity,
  or rate limiting always yields a denied decision;
- public callers never supply authoritative account, organization, tenant, or
  membership identity in a request body; those values come from verified
  Shared Auth context; and
- row-level security and named ORM capabilities preserve tenant isolation.

The generated SQL is a declarative input, not a production migration. Advanced
PostgreSQL constraints such as exclusion-based overlap prevention, row-level
security, immutable-ledger triggers, grants, and least-privilege roles belong
in reviewed additive migrations in `hhm-lib-core` and must have live PostgreSQL
witnesses before deployment.

The normalized operational `Reservation` persists to
`hhm_space_reservations`. The distinct name deliberately preserves the legacy
`hhm_reservations` persistence boundary and prevents generated schema adoption
from silently redefining its incompatible row shape.

## Privacy and security boundary

Canonical platform records never contain passwords, bearer or door tokens,
raw credential material, government-document images, camera frames, audio,
biometrics, transcripts, or raw sensor traces. Opaque provider references and
digests may identify evidence stored behind a separately authorized retention
boundary. A security observation records classification and disposition; it is
not itself a surveillance-media payload.

Access and network provider failures do not grant access. A digest or provider
reference proves neither identity nor authorization by itself. Doorway evidence
must continue to satisfy the independently documented presence boundary.

## Realtime envelope

`PlatformEventEnvelope` is suitable for authenticated WebSocket or private TCP
delivery only after a service adds transport controls. Required controls are:

- a short-lived, one-use, tenant-bound connection ticket;
- a bounded first authentication frame for private TCP;
- a maximum 64 KiB payload and bounded connection queues;
- monotonically checked aggregate versions and durable outbox event IDs;
- acknowledgement, resume cursor, replay protection, heartbeat, deadline, and
  slow-consumer policy;
- per-principal and per-tenant connection quotas; and
- explicit origin, audience, scope, tenant, and subscription authorization.

The current public in-memory WebSocket implementations do not meet those gates
and must not be represented as production realtime delivery.

## Downstream adoption order

1. Publish an immutable `hhm-interfaces` production SHA.
2. Consume generated SQL, SeaORM, Diesel, and Rust artifacts in `hhm-lib-core`;
   add RLS, overlap prevention, CAS, immutable ledgers, and migrations.
3. Expose only named tenant-scoped capabilities through `hhm-orm-core`.
4. Pin both immutable SHAs in the API and admin API services.
5. Project the generated public types and validators into `hhm-pub-lib-core`
   and client SDKs rather than copying schemas.
6. Add authenticated B2B/B2C onboarding before enabling realtime mutations.
7. Deploy only after Cloudflare, Shared Auth, database, VPC, and private admin
   connectivity are independently read back and tested outside-in.

No generated artifact, green unit test, pull request, or desired-state manifest
alone is evidence that production providers or public routes are deployed.
