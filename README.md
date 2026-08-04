# hhm-interfaces

Canonical Rust, JSON Schema, OpenAPI, AsyncAPI, and PostgreSQL contracts for Hacker House Medellín.

**Product:** Hacker House Medellín — Operations software for an entrepreneur coliving and coworking community.

Run rooms, desks, member stays, community events, access workflows, and day-to-day operations for a hacker house in Medellín, Colombia.

## Safety and production boundary

The bootstrap does not implement payments, identity verification, door-control hardware, or Colombian lodging compliance. Add those only after security and local regulatory review.

This repository is an executable bootstrap, not a production deployment. Before live
use, add authentication, tenant authorization, rate limits, durable migrations,
observability, backups, incident response, dependency review, and secret management.
## Contract authority

- `src/lib.rs` is the Rust model and validation surface.
- `schemas/` contains JSON Schema Draft 2020-12 wire contracts.
- `openapi.yaml` defines REST endpoints.
- `asyncapi.yaml` defines WebSocket event envelopes.
- `sql/` provides a deny-by-default PostgreSQL/Supabase migration baseline.
- `fixtures/` provides cross-language conformance examples.

Downstream services should consume a tagged release and run fixture compatibility
tests before deployment.
