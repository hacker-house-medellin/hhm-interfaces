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
  const message = Envelope.fromObject(value);
  const wireError = Envelope.verify(message);
  if (wireError) throw new TypeError(`invalid protobuf envelope: ${wireError}`);
  const checked = validateEnvelope(normalize(message));
  if (!checked.ok) throw new TypeError(`invalid platform event: ${checked.errors.join("; ")}`);
  return Envelope.encode(message).finish();
}

export function decodePlatformEvent(bytes) {
  let message;
  try {
    message = Envelope.decode(bytes);
  } catch (error) {
    return { ok: false, errors: [`protobuf decode failed: ${error.message}`] };
  }
  return validateEnvelope(normalize(message));
}

export function validateEnvelope(envelope) {
  const errors = [];
  if (envelope.schemaVersion !== "hhaus.platform.event.v1") errors.push("unsupported schemaVersion");
  for (const field of ["eventId", "locationId", "aggregateId"]) {
    if (!uuid.test(envelope[field])) errors.push(`${field} must be a UUID`);
  }
  if (!envelope.tenantId || envelope.tenantId.length > 128) errors.push("tenantId must contain 1-128 characters");
  const version = envelope.aggregateVersion;
  if (typeof version !== "string" || !/^(0|[1-9][0-9]*)$/.test(version) ||
      BigInt(version) > maxAggregateVersion) {
    errors.push("aggregateVersion must be a canonical nonnegative int64 decimal");
  }
  if (!validRfc3339(envelope.occurredAt)) errors.push("occurredAt must be an RFC 3339 timestamp");
  if (envelope.traceparent && !validTraceparent(envelope.traceparent)) errors.push("traceparent is invalid");
  const payloadBytes = Buffer.from(envelope.payloadJson ?? []);
  if (payloadBytes.length === 0 || payloadBytes.length > 65_536) errors.push("payloadJson must contain 1-65536 bytes");

  const event = eventModels[envelope.eventType];
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
