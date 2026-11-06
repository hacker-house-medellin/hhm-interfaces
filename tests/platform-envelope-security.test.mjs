import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encodePlatformEvent, decodePlatformEvent, validateEnvelope } from "../runtime/platform-protobuf.mjs";

const fixtures = JSON.parse(
  readFileSync(new URL("../conformance/platform/records.json", import.meta.url), "utf8"),
);
const reservation = fixtures.valid.find(({ model }) => model === "ReservationTransition").value;

function envelope(payloadJson) {
  return {
    schemaVersion: "hhaus.platform.event.v1",
    eventId: "14141414-1414-4414-8414-141414141414",
    tenantId: reservation.tenantId,
    locationId: reservation.locationId,
    aggregateId: reservation.reservationId,
    aggregateVersion: "2",
    eventType: "RESERVATION_TRANSITION",
    occurredAt: reservation.occurredAt,
    traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    payloadJson,
  };
}

test("platform event admits an unchanged authoritative object and round trips", () => {
  const input = envelope(Buffer.from(JSON.stringify(reservation)));
  assert.equal(validateEnvelope(input).ok, true);
  const result = decodePlatformEvent(encodePlatformEvent(input));
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, reservation);
});

test("JSON primitives and arrays cannot bypass record and tenant validation", () => {
  for (const value of ["null", "false", "0", "\"\"", "[]", "[{}]"]) {
    const input = envelope(Buffer.from(value));
    const checked = validateEnvelope(input);
    assert.equal(checked.ok, false, `accepted JSON payload ${value}`);
    assert.ok(checked.errors.includes("payloadJson must be a JSON object"), value);
    assert.throws(() => encodePlatformEvent(input), /payloadJson must be a JSON object/);
  }
});

test("malformed UTF-8 is rejected instead of being silently replaced", () => {
  const bytes = Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]);
  const checked = validateEnvelope(envelope(bytes));
  assert.equal(checked.ok, false);
  assert.ok(checked.errors.includes("payloadJson must be UTF-8 JSON"));
});

test("an empty JSON object cannot bypass the required record fields", () => {
  const checked = validateEnvelope(envelope(Buffer.from("{}")));
  assert.equal(checked.ok, false);
  assert.ok(checked.errors.some((error) => error.startsWith("payload: ")));
});

test("event payloads never accept cross-tenant substitution", () => {
  const checked = validateEnvelope({
    ...envelope(Buffer.from(JSON.stringify(reservation))),
    tenantId: "tenant:unrelated",
  });
  assert.equal(checked.ok, false);
  assert.ok(checked.errors.some((error) => error.startsWith("payload: ")));
});
