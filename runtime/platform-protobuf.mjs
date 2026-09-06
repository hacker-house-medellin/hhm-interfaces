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
const traceparent = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i;

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
  try {
    if (BigInt(envelope.aggregateVersion || "0") < 0n) errors.push("aggregateVersion must not be negative");
  } catch {
    errors.push("aggregateVersion must be an integer");
  }
  if (Number.isNaN(Date.parse(envelope.occurredAt))) errors.push("occurredAt must be an RFC 3339 timestamp");
  if (envelope.traceparent && !traceparent.test(envelope.traceparent)) errors.push("traceparent is invalid");
  const payloadBytes = Buffer.from(envelope.payloadJson ?? []);
  if (payloadBytes.length === 0 || payloadBytes.length > 65_536) errors.push("payloadJson must contain 1-65536 bytes");

  const event = eventModels[envelope.eventType];
  if (!event) errors.push(`unsupported eventType ${envelope.eventType}`);
  let payload;
  if (payloadBytes.length > 0 && payloadBytes.length <= 65_536) {
    try {
      payload = JSON.parse(payloadBytes.toString("utf8"));
    } catch {
      errors.push("payloadJson must be UTF-8 JSON");
    }
  }
  if (event && payload) {
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
