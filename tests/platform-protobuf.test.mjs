import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodePlatformEvent,
  encodePlatformEvent,
  platformEventModels,
  validateEnvelope,
} from "../runtime/platform-protobuf.mjs";

const conformance = JSON.parse(
  readFileSync(new URL("../conformance/platform/records.json", import.meta.url), "utf8"),
);
const reservationTransition = conformance.valid.find(({ model }) => model === "ReservationTransition").value;

function envelope(overrides = {}) {
  return {
    schemaVersion: "hhaus.platform.event.v1",
    eventId: "14141414-1414-4414-8414-141414141414",
    tenantId: "tenant:acme",
    locationId: "11111111-1111-4111-8111-111111111111",
    aggregateId: reservationTransition.reservationId,
    aggregateVersion: "2",
    eventType: "RESERVATION_TRANSITION",
    occurredAt: reservationTransition.occurredAt,
    traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    payloadJson: Buffer.from(JSON.stringify(reservationTransition)),
    ...overrides,
  };
}

test("protobuf realtime envelope round-trips a parity-validated payload", () => {
  const bytes = encodePlatformEvent(envelope());
  const decoded = decodePlatformEvent(bytes);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.model, "ReservationTransition");
  assert.deepEqual(decoded.payload, reservationTransition);
  assert.equal(decoded.envelope.aggregateVersion, "2");
});

test("protobuf envelope rejects cross-aggregate substitution", () => {
  assert.throws(
    () => encodePlatformEvent(envelope({ aggregateId: "15151515-1515-4515-8515-151515151515" })),
    /aggregateId does not match payload/,
  );
});

test("protobuf envelope rejects malformed trace context and invalid JSON", () => {
  const malformed = validateEnvelope(envelope({ traceparent: "not-a-traceparent", payloadJson: Buffer.from("{") }));
  assert.equal(malformed.ok, false);
  assert.ok(malformed.errors.includes("traceparent is invalid"));
  assert.ok(malformed.errors.includes("payloadJson must be UTF-8 JSON"));
});

test("protobuf event mapping is bounded and unspecified events fail closed", () => {
  assert.deepEqual(Object.keys(platformEventModels).sort(), [
    "ACCESS_DECISION",
    "ACCESS_GRANT_TRANSITION",
    "GUEST_PASS_TRANSITION",
    "RESERVATION_TRANSITION",
    "SECURITY_OBSERVATION",
    "VISIT_TRANSITION",
  ]);
  const result = validateEnvelope(envelope({ eventType: "PLATFORM_EVENT_TYPE_UNSPECIFIED" }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("unsupported eventType PLATFORM_EVENT_TYPE_UNSPECIFIED"));
});

test("protobuf decoder rejects malformed wire bytes", () => {
  const result = decodePlatformEvent(Uint8Array.from([255, 255, 255]));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /^protobuf decode failed:/);
});
