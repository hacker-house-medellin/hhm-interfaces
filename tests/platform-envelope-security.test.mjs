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
    tenantId: "tenant:acme",
    locationId: "11111111-1111-4111-8111-111111111111",
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

test("aggregate versions are canonical signed-int64 nonnegative decimals", () => {
  for (const version of ["", "-1", "+1", "01", "0x10", "1.0", "9223372036854775808", 1, null]) {
    const checked = validateEnvelope({ ...envelope(Buffer.from(JSON.stringify(reservation))), aggregateVersion: version });
    assert.equal(checked.ok, false, `accepted aggregateVersion ${String(version)}`);
    assert.ok(checked.errors.some((error) => error.startsWith("aggregateVersion must")), String(version));
  }
  for (const version of ["0", "1", "9223372036854775807"]) {
    assert.equal(
      validateEnvelope({ ...envelope(Buffer.from(JSON.stringify(reservation))), aggregateVersion: version }).ok,
      true,
      version,
    );
  }
});

test("occurredAt requires a real calendar date and explicit RFC 3339 offset", () => {
  for (const occurredAt of [
    "2026-02-30T12:34:56Z",
    "2025-02-29T12:34:56Z",
    "2026-01-01 12:34:56Z",
    "2026-01-01T12:34:56",
    "2026-13-01T12:34:56Z",
    "2026-01-01T25:34:56Z",
    "2026-01-01T12:34:56+24:00",
    null,
  ]) {
    const checked = validateEnvelope({ ...envelope(Buffer.from(JSON.stringify(reservation))), occurredAt });
    assert.equal(checked.ok, false, `accepted occurredAt ${occurredAt}`);
    assert.ok(checked.errors.includes("occurredAt must be an RFC 3339 timestamp"));
  }
  for (const occurredAt of ["2024-02-29T12:34:56Z", "2026-11-06T12:34:56.123-05:00"]) {
    assert.equal(
      validateEnvelope({ ...envelope(Buffer.from(JSON.stringify(reservation))), occurredAt }).ok,
      true,
      occurredAt,
    );
  }
});

test("encoder does not normalize invalid caller aggregate versions into valid protobuf", () => {
  for (const version of ["01", "+1", "0x10", 1, "9223372036854775808"]) {
    assert.throws(
      () => encodePlatformEvent({ ...envelope(Buffer.from(JSON.stringify(reservation))), aggregateVersion: version }),
      /aggregateVersion must be a canonical nonnegative int64 decimal/,
      String(version),
    );
  }
});

test("traceparent rejects reserved versions and zero trace/span identifiers", () => {
  const traceId = "0123456789abcdef0123456789abcdef";
  const spanId = "0123456789abcdef";
  for (const traceparent of [
    `00-${"0".repeat(32)}-${spanId}-01`,
    `00-${traceId}-${"0".repeat(16)}-01`,
    `ff-${traceId}-${spanId}-01`,
    `01-${traceId}-${spanId}-01`,
    `00-${traceId}-${spanId}-zz`,
  ]) {
    const checked = validateEnvelope({ ...envelope(Buffer.from(JSON.stringify(reservation))), traceparent });
    assert.equal(checked.ok, false, `accepted traceparent ${traceparent}`);
    assert.ok(checked.errors.includes("traceparent is invalid"));
  }
});


test("envelope root admission rejects null, primitives and arrays without throwing", () => {
  for (const input of [null, undefined, false, 0, 7, "", "{}", [], [envelope(Buffer.from("{}"))]]) {
    let result;
    assert.doesNotThrow(() => { result = validateEnvelope(input); });
    assert.deepEqual(result, { ok: false, errors: ["envelope must be a JSON object"] });
    assert.throws(() => encodePlatformEvent(input), /envelope must be a JSON object/);
  }
});

test("event discriminator never resolves inherited Object prototype properties", () => {
  const bytes = Buffer.from(JSON.stringify(reservation));
  for (const eventType of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
    const input = { ...envelope(bytes), eventType };
    const checked = validateEnvelope(input);
    assert.equal(checked.ok, false, eventType);
    assert.ok(checked.errors.includes("unsupported eventType " + eventType), eventType);
    assert.throws(() => encodePlatformEvent(input), /unsupported eventType/, eventType);
  }
});

test("untrusted strings cannot be forged by object, boolean or numeric coercion", () => {
  const bytes = Buffer.from(JSON.stringify(reservation));
  const cases = [
    ["eventId", { toString: () => "14141414-1414-4414-8414-141414141414" }, /eventId must be a UUID/],
    ["locationId", ["11111111-1111-4111-8111-111111111111"], /locationId must be a UUID/],
    ["aggregateId", { toString: () => reservation.reservationId }, /aggregateId must be a UUID/],
    ["tenantId", 1234, /tenantId must contain/],
    ["tenantId", ["tenant:acme"], /tenantId must contain/],
    ["tenantId", "x".repeat(129), /tenantId must contain/],
    ["traceparent", 1, /traceparent is invalid/],
    ["traceparent", null, /traceparent is invalid/],
  ];
  for (const [field, value, diagnostic] of cases) {
    const input = { ...envelope(bytes), [field]: value };
    const checked = validateEnvelope(input);
    assert.equal(checked.ok, false, field);
    assert.ok(checked.errors.some((message) => diagnostic.test(message)), field);
    assert.throws(() => encodePlatformEvent(input), /invalid platform event/, field);
  }
});

test("payload is byte-only and bounded; strings and ArrayBuffer-shaped objects are denied", () => {
  const bytes = Buffer.from(JSON.stringify(reservation));
  for (const payloadJson of [
    "{}",
    JSON.stringify(reservation),
    { type: "Buffer", data: Array.from(bytes) },
    Array.from(bytes),
    {},
    null,
    Buffer.alloc(0),
    Buffer.alloc(65_537),
  ]) {
    const input = envelope(payloadJson);
    const checked = validateEnvelope(input);
    assert.equal(checked.ok, false, "accepted payload type or size: " + typeof payloadJson);
    assert.ok(checked.errors.some((error) => error.startsWith("payloadJson must")), typeof payloadJson);
    assert.throws(() => encodePlatformEvent(input), /payloadJson must/);
  }
  const exactMaximum = Buffer.from(JSON.stringify(reservation).padEnd(65_536, " "));
  assert.equal(exactMaximum.length, 65_536);
  const canonical = envelope(exactMaximum);
  assert.equal(validateEnvelope(canonical).ok, true);
  assert.equal(decodePlatformEvent(encodePlatformEvent(canonical)).ok, true);
  const u8 = new Uint8Array(bytes);
  assert.equal(validateEnvelope(envelope(u8)).ok, true);
});

test("overlong version numbers reject before arbitrary-precision coercion", () => {
  for (const version of ["9".repeat(20), "1".repeat(50_000), "-0", " 1", "1 "]) {
    const input = {
      ...envelope(Buffer.from(JSON.stringify(reservation))),
      aggregateVersion: version,
    };
    const checked = validateEnvelope(input);
    assert.equal(checked.ok, false);
    assert.ok(checked.errors.some((error) => error.startsWith("aggregateVersion must")));
    assert.throws(() => encodePlatformEvent(input), /aggregateVersion must/);
  }
});

test("all six declared event types round-trip without cross-tenant or aggregate substitution", () => {
  const models = {
    RESERVATION_TRANSITION: "reservationId",
    GUEST_PASS_TRANSITION: "guestPassId",
    VISIT_TRANSITION: "visitId",
    ACCESS_GRANT_TRANSITION: "accessGrantId",
    ACCESS_DECISION: "id",
    SECURITY_OBSERVATION: "id",
  };
  assert.deepEqual(Object.keys(models).sort(), [
    "ACCESS_DECISION", "ACCESS_GRANT_TRANSITION", "GUEST_PASS_TRANSITION",
    "RESERVATION_TRANSITION", "SECURITY_OBSERVATION", "VISIT_TRANSITION",
  ]);
  for (const [eventType, aggregateField] of Object.entries(models)) {
    const modelName = eventType.split("_").map((part) =>
      part.charAt(0) + part.slice(1).toLowerCase()).join("");
    const fixture = fixtures.valid.find((entry) => entry.model === modelName);
    assert.ok(fixture, "missing conformance fixture: " + modelName);
    const value = fixture.value;
    const data = envelope(Buffer.from(JSON.stringify(value)));
    data.eventType = eventType;
    data.aggregateId = value[aggregateField];
    data.tenantId = value.tenantId;
    data.locationId = value.locationId || data.locationId;
    data.occurredAt = value.occurredAt;
    const checked = validateEnvelope(data);
    assert.equal(checked.ok, true, eventType + ": " + checked.errors?.join(", "));
    const roundTrip = decodePlatformEvent(encodePlatformEvent(data));
    assert.equal(roundTrip.ok, true, eventType + ": " + roundTrip.errors?.join(", "));
    assert.deepEqual(roundTrip.payload, value);
    for (const invalid of [
      { tenantId: "tenant:external" },
      { aggregateId: data.aggregateId === "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
        ? "ffffffff-ffff-4fff-8fff-ffffffffffff"
        : "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
    ]) {
      const denied = validateEnvelope({ ...data, ...invalid });
      assert.equal(denied.ok, false, eventType + " unauthorized context");
      assert.throws(() => encodePlatformEvent({ ...data, ...invalid }), /invalid platform event/);
    }
  }
});


test("pre-decode wire admission rejects non-byte inputs without ever invoking protobuf", () => {
  for (const input of [undefined, null, "", "{}", [], {}, new ArrayBuffer(2), 123]) {
    let result;
    assert.doesNotThrow(() => { result = decodePlatformEvent(input); });
    assert.deepEqual(result, { ok: false, errors: ["protobuf input must be a byte array"] });
  }
});

test("oversized wire frames are denied before parsing, including unknown-field padding", () => {
  for (const input of [Buffer.alloc(66_561), new Uint8Array(70_000), Buffer.alloc(1_000_000)]) {
    let result;
    assert.doesNotThrow(() => { result = decodePlatformEvent(input); });
    assert.deepEqual(result, {
      ok: false,
      errors: ["protobuf envelope exceeds bounded wire size"],
    });
  }
});

test("maximum admitted JSON payload remains encodable and below the wire budget", () => {
  const json = JSON.stringify(reservation).padEnd(65_536, " ");
  const raw = Buffer.from(json, "utf8");
  assert.equal(raw.byteLength, 65_536);
  const bytes = encodePlatformEvent(envelope(raw));
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.byteLength <= 66_560, "wire size exceeds the reviewed budget");
  const result = decodePlatformEvent(bytes);
  assert.equal(result.ok, true, result.errors?.join("; "));
  assert.deepEqual(result.payload, reservation);
});


test("oversized payloads are rejected before Buffer.from could clone attacker-sized bytes", () => {
  const oversized = [
    Buffer.alloc(4 * 1024 * 1024, 0x20),
    new Uint8Array(3 * 1024 * 1024),
  ];
  const originalFrom = Buffer.from;
  Buffer.from = function (value, ...args) {
    if (oversized.includes(value)) {
      throw new Error("an oversized payload was copied before checking the budget");
    }
    return Reflect.apply(originalFrom, this, [value, ...args]);
  };
  try {
    for (const payloadJson of oversized) {
      const input = envelope(payloadJson);
      let checked;
      assert.doesNotThrow(() => { checked = validateEnvelope(input); });
      assert.equal(checked.ok, false);
      assert.ok(checked.errors.includes("payloadJson must contain 1-65536 bytes"));
      assert.throws(() => encodePlatformEvent(input),
        /invalid platform event: .*payloadJson must contain 1-65536 bytes/);
    }
  } finally {
    Buffer.from = originalFrom;
  }
});

test("encoder snapshots accessor fields once so validation and wire conversion cannot diverge", () => {
  const input = envelope(Buffer.from(JSON.stringify(reservation)));
  let accesses = 0;
  Object.defineProperty(input, "eventId", {
    enumerable: true,
    get() {
      accesses++;
      return "14141414-1414-4414-8414-141414141414";
    },
  });
  const wire = encodePlatformEvent(input);
  assert.equal(accesses, 1, "caller-supplied getter was evaluated more than once");
  const decoded = decodePlatformEvent(wire);
  assert.equal(decoded.ok, true, decoded.errors?.join("; "));
  assert.deepEqual(decoded.payload, reservation);
});

test("extreme RFC3339 fractional seconds fail the bounded metadata gate", () => {
  const raw = Buffer.from(JSON.stringify(reservation));
  const occurredAt = "2026-11-07T12:00:00." + "0".repeat(100_000) + "Z";
  const checked = validateEnvelope({ ...envelope(raw), occurredAt });
  assert.equal(checked.ok, false);
  assert.ok(checked.errors.includes("occurredAt must be an RFC 3339 timestamp"));
  assert.throws(() => encodePlatformEvent({ ...envelope(raw), occurredAt }),
    /occurredAt must be an RFC 3339 timestamp/);
});


test("authoritative envelope metadata cannot be inherited from a prototype", () => {
  const raw = Buffer.from(JSON.stringify(reservation));
  const required = [
    "schemaVersion", "eventId", "tenantId", "locationId", "aggregateId",
    "aggregateVersion", "eventType", "occurredAt", "payloadJson",
  ];
  for (const field of required) {
    const input = envelope(raw);
    const inherited = input[field];
    delete input[field];
    Object.setPrototypeOf(input, { [field]: inherited });
    let result;
    assert.doesNotThrow(() => { result = validateEnvelope(input); }, field);
    assert.equal(result.ok, false, field);
    assert.ok(result.errors.includes(field + " must be an own property"), field);
    assert.throws(() => encodePlatformEvent(input), /invalid platform event/, field);
  }

  const nullProto = Object.assign(Object.create(null), envelope(raw));
  assert.equal(validateEnvelope(nullProto).ok, true,
    "own keys on null-prototype JSON objects are still valid");
});

test("hostile event discriminators cannot trigger stringification or gigantic diagnostics", () => {
  const raw = Buffer.from(JSON.stringify(reservation));
  const hostile = [
    Object.create(null),
    { toString() { throw Error("attacker-controlled toString executed"); } },
    { [Symbol.toPrimitive]() { throw Error("attacker-controlled toPrimitive executed"); } },
    Symbol("evil"),
    "A".repeat(256_000),
  ];
  for (const eventType of hostile) {
    const input = { ...envelope(raw), eventType };
    let checked;
    assert.doesNotThrow(() => { checked = validateEnvelope(input); });
    assert.equal(checked.ok, false);
    assert.ok(checked.errors.includes("unsupported eventType"));
    assert.ok(checked.errors.every((error) => error.length < 512),
      "unbounded diagnostic amplification");
    assert.throws(() => encodePlatformEvent(input), /unsupported eventType/);
  }
});
