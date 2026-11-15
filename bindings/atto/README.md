# AttoLang interface bindings

This directory contains **source-level**, typed pure AttoLang descriptors; it adds no new API endpoint and does not replace the authoritative OpenAPI/JSON Schema documents.

- `src/visitor_access.atto`: method/path descriptor functions for visitor QR issuance, check-in/out, and managed-doorway submissions; the `{action}` template must be resolved and safely URL-encoded by the caller, never concatenated from untrusted input.
- `src/reservation_status.atto`: reservation lifecycle status strings, mirroring `schemas/reservation.json`.

All functions use portable AttoLang `pub fnc name(): string { return "..."; }` syntax. `npm run test:atto` uses Node to compare them against the authority sources and rejects missing/duplicate functions or drift. **It is not an Atto compiler/runtime test.** Actual Atto support needs a pinned compiler, target-specific positive and negative execution tests, and a separately reviewed injected HTTP transport.

## Security and privacy boundary

Do not treat BLE signal strength, doorway evidence, or QR generation as authentication. A backend must independently authorize any visit, identity, location, or access change. No face/audio/location data, resident secrets, or credentials are emitted here. Do not weaken the consent, replay, expiry, or device attestation rules in the existing schemas.
