# Resident operations contract v1

This directory contains the two independent authorities for the H/HAUS resident-operations wire contract.

- `main.tsp` is the independently authored TypeSpec source.
- `authored.schema.json` is the independently authored JSON Schema Draft 2020-12 source.
- `instances/` is an independently maintained positive and negative behavior corpus.

TypeSpec may emit a JSON Schema witness, but that witness is comparison evidence only. It never overwrites or becomes the authored JSON Schema. CI pins `ORESoftware/typespec-json-schema-validator` to an exact reviewed commit and fails closed when declarations or validation behavior diverge.

## Covered records

The v1 record set covers guest visits; room, bed, desk, kitchen and shared-space reservations; meal plans; polls and ballots; rent invoices; Stripe payment/refund reconciliation references; agreement acceptance; resumable onboarding; persistence receipts; MIP assignment requests/results; `ores-chat` group references; developer access grants; and telemetry-safe domain events.

## Deliberate boundaries

- Money is represented as integer minor units with an ISO 4217-style three-letter currency code. Floating-point money is not permitted.
- Stripe secrets, raw webhook bodies, cards and bank details are never contract fields. Only opaque provider references are retained after verified reconciliation.
- Browser stores are resumable caches. `local_storage` and `indexed_db` receipts must never set `canonical: true`.
- Agreement proof requires the exact document SHA-256, version, subject, locale and a server-issued receipt. Browser state alone is not proof of acceptance.
- Assignment requests use opaque candidate/resource identifiers. Names, contact data, health data, payment data and legal-document content must not enter the solver cluster.
- Chat records reference an `ores-chat` space; this contract does not duplicate message bodies or membership credentials.
- Developer grants are time-bounded, scoped and auditable. They do not embed GitHub, cloud or database credentials.

## Commands

```bash
npx tsjsv check \
  --typespec=contracts/resident-operations/v1/main.tsp \
  --schema=contracts/resident-operations/v1/authored.schema.json \
  --instances=contracts/resident-operations/v1/instances \
  --report=.typespec-json-schema-validator/resident-operations-v1.json
```

The JSON Schema corpus can also be checked independently with any Draft 2020-12 validator. Cross-field and lifecycle rules that JSON Schema cannot fully express, such as end-after-start, refund-not-greater-than-paid, quorum eligibility, and legal supersession, belong in `hhm-lib-core` and sibling-org acceptance tests.
