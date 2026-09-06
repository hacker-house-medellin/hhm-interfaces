# Resident operations v1 architecture

`resident-operations/v1` is the contract foundation for Hacker House Medellín and the global H/HAUS platform. It is intentionally narrower than a database schema and broader than one HTTP API: every server, client, sync worker and acceptance suite must agree on these records before transport-specific operations are admitted.

## Authority model

TypeSpec and JSON Schema are peer authorities. Neither is generated from or subordinate to the other.

1. Authors change `contracts/resident-operations/v1/main.tsp` and `authored.schema.json` independently.
2. The official TypeSpec emitter produces comparison-only JSON Schema B in an ignored evidence directory.
3. `ORESoftware/typespec-json-schema-validator` inventories top-level declarations, compares normalized shapes and executes both authorities over the same corpus.
4. Any unexplained declaration or instance-verdict difference stops evaluation. A generated file never rewrites either source.

## Product domains

| Domain | Canonical record | Primary implementation owner |
| --- | --- | --- |
| Guests | `GuestVisit` | public API + house-manager admin UI |
| Rooms/shared spaces | `ResourceReservation` | API, web/mobile clients, assignment service |
| Cooking and meals | `MealPlan` + kitchen reservation | resident UI + manager moderation |
| Polls/forms | `CommunityPoll`, `PollVote` | public/private API + immutable result snapshots |
| Rent and refunds | `RentInvoice`, `PaymentRecord` | admin API + Stripe webhook reconciler |
| Legal onboarding | `AgreementAcceptance`, `OnboardingCheckpoint` | web/mobile onboarding + legal document service |
| Offline sync | `PersistenceReceipt` | `hhm-sync`/`hhaus-sync` through `opto-sync` |
| Assignment | `AssignmentRequest`, `AssignmentResult` | MIP adapter to `ORESoftware/mip-solver-node.rs` on `ORESoftware/k8s-cluster` |
| Chat | `ChatGroupReference` | `ores-chat` resident/admin surfaces |
| Developer access | `DeveloperAccessGrant` | owner/admin access review workflow |
| Telemetry | `ResidentOperationsEvent` | `ores-otel`; no sensitive payload fields |

## Persistence and synchronization

The browser may write a minimal navigation hint to local storage and a structured, encrypted pending checkpoint to IndexedDB. `opto-sync` queues the same revision for Supabase and the canonical Neon/PostgreSQL API. Every write is idempotent and produces a `PersistenceReceipt`.

Authority order is explicit:

1. Neon/PostgreSQL server record and server receipt are canonical.
2. Supabase is a tenant-isolated synchronization/read model and durable retry surface, not the rent or legal ledger.
3. IndexedDB is an offline work queue/cache.
4. localStorage contains only non-sensitive flow/version pointers and must be safe to delete.

Conflicts are resolved by aggregate revision and server policy in `*-lib-core`; clients never silently choose a legal or financial winner. Raw identity documents, Stripe payloads, secrets and signed agreement documents are excluded from browser storage.

## Service integration requirements

- **Authentication:** `shared-auth` derives tenant, subject, role and device trust. Request bodies cannot assert their own actor identity.
- **Middleware:** `ores-middleware` owns authentication, tenant binding, idempotency, request limits, error mapping and trace context in a deterministic order.
- **Rate limiting:** `ores-rate-limit` consumes route policies from central runtime configuration. Guest, vote, payment and webhook routes use separate buckets.
- **Runtime configuration:** encrypted files live only under `env/enc` through `ores-sops`; `ores-redis-lru-cache` distributes validated, versioned runtime config and supports bounded reloads.
- **Telemetry:** `ores-otel` records trace IDs and low-cardinality outcomes. It must not record agreement bodies, ballots, dietary detail, payment payloads or credentials.
- **Routing:** `ores-edge-router` separates public, authenticated, admin and Stripe-webhook ingress and preserves verified trace/idempotency headers.
- **Dependency management:** reusable repos publish `.zpkg.toml`; resolved locks pin immutable revisions. Locks are not hand-synthesized when the registry is unavailable.
- **Web preload:** marketing and web shells use `ores-wasm-loaders` to prefetch loaders safely; preloading does not authenticate, accept an agreement or start a payment.

## Assignment solver boundary

The API creates an `AssignmentRequest` using opaque, tenant-scoped candidate and resource IDs plus a versioned constraint set. A dedicated adapter sends that problem to the MIP service through an authenticated internal route on the k8s cluster. Solver output is advisory until the application service validates tenant scope, current revisions, capacity, hard constraints and authorization and then records an accepted assignment.

The solver never receives names, email addresses, phone numbers, document contents, Stripe references, chat messages, legal acceptances or resident-level medical/accommodation text. Accommodation requirements are converted to reviewed categorical constraints before pseudonymization.

## Payments and refunds

All amounts are integer minor units. The admin API creates Stripe Checkout/PaymentIntent operations with a stable application idempotency key. Webhooks are accepted only after signature, timestamp, replay and event-id checks. Reconciliation is append-only; refunds and disputes create state transitions and provider references rather than rewriting history. A refund cannot exceed the settled amount, and provider success alone cannot bypass tenant/invoice checks.

## Poll and ballot safety

Eligibility is derived from the authenticated tenant membership snapshot. Anonymous-to-members and secret-until-close modes retain a separate eligibility receipt so the service can enforce one active ballot without exposing identity in the result set. Closing creates an immutable result snapshot. Quorum, tie, recusal, delegation and vote-replacement rules are versioned policies in core code and tested in the sibling test organization.

## Legal acceptance

The onboarding UI displays a versioned document supplied by the legal/document service. A checkpoint may be mirrored while the user navigates, but acceptance becomes effective only after the canonical API records subject, agreement type/version, exact SHA-256, locale, server time and receipt ID. Superseded agreements remain immutable. External resident/member/guest/payment/privacy/e-sign terms and internal owner/manager/developer/vendor policies must be maintained in `ores-legal` and the relevant `*-docs/docs/legal/{external,internal}` trees.

## Administration and developer access

`*-admin-web-server.rs` exposes role-specific house-manager, owner and administrator workflows. The normal web server cannot acquire admin scope by rendering a hidden control. Developer access is requested, approved by a different authorized subject, scoped to named resources, expires automatically and is revoked on offboarding. Production database, GitHub, cloud and secret access require separate grants and auditable receipts.

## Remaining implementation gates

The contract does not claim runtime completion. Follow-up changes must add Diesel and SeaORM parity models, migrations, route adapters, Stripe reconciliation, sync conflict tests, solver canaries, `ores-chat` membership enforcement, admin authorization tests, legal document publication and hhaus-org-test/hacker-house-medellin-test acceptance coverage. Production merge remains blocked until exact-head hosted checks and independent review pass.
