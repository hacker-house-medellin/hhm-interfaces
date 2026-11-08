import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";
import { validatePlatformRecord } from "./platform.mjs";

const root = protobuf.loadSync(
  fileURLToPath(new URL("../contracts/platform/protobuf/platform-events.proto", import.meta.url)),
);
const Envelope = root.lookupType("hhaus.platform.v1.PlatformEventEnvelope");

const eventModels = Object.freeze({
  RESERVATION_TRANSITION: { model: "ReservationTransition", aggregateField: "reservationId" },
  GUEST_PASS_TRANSITION: { model: "GuestPassTransition", aggregateField: "guestPassId" },
  VISIT_TRANSITION: { model: "VisitTransition", aggregateField: "visitId" },
  ACCESS_GRANT_TRANSITION: { model: "AccessGrantTransition", aggregateField: "accessGrantId" },
  ACCESS_DECISION: { model: "AccessDecision", aggregateField: "id" },
  SECURITY_OBSERVATION: { model: "SecurityObservation", aggregateField: "id" },
});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const traceparent = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i;
const maxAggregateVersion = 9_223_372_036_854_775_807n;
// 65,536-byte JSON plus bounded envelope metadata, field tags and protobuf lengths.
// Enforce before protobufjs allocates/iterates over an attacker-supplied wire buffer.
const maxEnvelopeWireBytes = 66_560;

function validTraceparent(value) {
  const matched = traceparent.exec(value);
  return matched !== null && !/^0{32}$/.test(matched[1]) && !/^0{16}$/.test(matched[2]);
}

function validRfc3339(value) {
  if (typeof value !== "string") return false;
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!matched) return false;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 &&
    day >= 1 && day <= monthDays[month - 1] && Number.isFinite(Date.parse(value));
}

function normalize(message) {
  return Envelope.toObject(message, {
    longs: String,
    enums: String,
    bytes: Buffer,
    defaults: true,
  });
}

export function encodePlatformEvent(value) {
  // protobufjs fromObject() coerces integer spellings, numbers and strings.
  // Admit the original uncoerced input before conversion can hide an invalid
  // int64 lexeme or another envelope contract violation.
  const raw = validateEnvelope(value);
  if (!raw.ok) throw new TypeError(`invalid platform event: ${raw.errors.join("; ")}`);
  const message = Envelope.fromObject(value);
  const wireError = Envelope.verify(message);
  if (wireError) throw new TypeError(`invalid protobuf envelope: ${wireError}`);
  const checked = validateEnvelope(normalize(message));
  if (!checked.ok) throw new TypeError(`invalid platform event: ${checked.errors.join("; ")}`);
  const bytes = Envelope.encode(message).finish();
  if (bytes.byteLength > maxEnvelopeWireBytes) {
    throw new TypeError("protobuf envelope exceeds bounded wire size");
  }
  return bytes;
}

export function decodePlatformEvent(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return { ok: false, errors: ["protobuf input must be a byte array"] };
  }
  if (bytes.byteLength > maxEnvelopeWireBytes) {
    return { ok: false, errors: ["protobuf envelope exceeds bounded wire size"] };
  }
  let message;
  try {
    message = Envelope.decode(bytes);
  } catch (error) {
    return { ok: false, errors: [`protobuf decode failed: ${error.message}`] };
  }
  return validateEnvelope(normalize(message));
}

export function validateEnvelope(envelope) {
  // Runtime ingress is untrusted: reject invalid roots before property reads.
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { ok: false, errors: ["envelope must be a JSON object"] };
  }
  const errors = [];
  if (envelope.schemaVersion !== "hhaus.platform.event.v1") errors.push("unsupported schemaVersion");
  for (const field of ["eventId", "locationId", "aggregateId"]) {
    if (typeof envelope[field] !== "string" || !uuid.test(envelope[field])) errors.push(`${field} must be a UUID`);
  }
  if (typeof envelope.tenantId !== "string" || envelope.tenantId.length < 1 ||
      envelope.tenantId.length > 128) errors.push("tenantId must contain 1-128 characters");
  const version = envelope.aggregateVersion;
  if (typeof version !== "string" || version.length > 19 ||
      !/^(0|[1-9][0-9]*)$/.test(version) || BigInt(version) > maxAggregateVersion) {
    errors.push("aggregateVersion must be a canonical nonnegative int64 decimal");
  }
  if (!validRfc3339(envelope.occurredAt)) errors.push("occurredAt must be an RFC 3339 timestamp");
  if (envelope.traceparent !== undefined && envelope.traceparent !== "" &&
      (typeof envelope.traceparent !== "string" || !validTraceparent(envelope.traceparent))) {
    errors.push("traceparent is invalid");
  }
  const isBytes = Buffer.isBuffer(envelope.payloadJson) || envelope.payloadJson instanceof Uint8Array;
  if (!isBytes) errors.push("payloadJson must be a byte array");
  const payloadBytes = isBytes ? Buffer.from(envelope.payloadJson) : Buffer.alloc(0);
  if (payloadBytes.length === 0 || payloadBytes.length > 65_536) errors.push("payloadJson must contain 1-65536 bytes");

  // A frozen plain object still inherits Object.prototype methods. Never
  // admit 'constructor'/'toString'/'__proto__' as a model discriminator.
  const event = typeof envelope.eventType === "string" &&
    Object.hasOwn(eventModels, envelope.eventType) ? eventModels[envelope.eventType] : undefined;
  if (!event) errors.push(`unsupported eventType ${envelope.eventType}`);
  let payload;
  if (payloadBytes.length > 0 && payloadBytes.length <= 65_536) {
    try {
      // Buffer.toString("utf8") silently replaces malformed bytes. In an
      // authoritative event boundary that can change the payload being checked.
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes));
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        errors.push("payloadJson must be a JSON object");
      }
    } catch {
      errors.push("payloadJson must be UTF-8 JSON");
    }
  }
  if (event && payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const record = validatePlatformRecord(event.model, payload, {
      tenantId: envelope.tenantId,
      locationId: envelope.locationId,
    });
    if (!record.ok) errors.push(...record.errors.map((error) => `payload: ${error}`));
    if (payload[event.aggregateField] !== envelope.aggregateId) errors.push("aggregateId does not match payload");
  }
  return errors.length ? { ok: false, errors } : { ok: true, envelope, payload, model: event.model };
}

export const platformEventModels = eventModels;
