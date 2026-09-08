import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validate as validateGeneratedShape } from "../generated/platform/typescript/validate.mjs";

const machines = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../contracts/platform/state-machines.json", import.meta.url)),
    "utf8",
  ),
).machines;

const transitionModels = new Set([
  "ReservationTransition",
  "GuestPassTransition",
  "VisitTransition",
  "AccessGrantTransition",
]);

function isBefore(start, end) {
  return Date.parse(start) < Date.parse(end);
}

function exactlyOne(value, fields) {
  return fields.filter((field) => value[field] !== undefined && value[field] !== null).length === 1;
}

export function validatePlatformRecord(model, value, context = {}) {
  const shape = validateGeneratedShape(model, value);
  if (!shape.ok) return shape;

  const errors = [];
  if (!value.tenantId || value.tenantId.length > 128) errors.push("tenantId must contain 1-128 characters");
  if (context.tenantId && value.tenantId !== context.tenantId) errors.push("tenantId does not match verified context");
  if (context.locationId && value.locationId && value.locationId !== context.locationId) {
    errors.push("locationId does not match verified context");
  }
  const positiveFields = {
    Organization: ["seatLimit"],
    Space: ["capacity"],
    Reservation: ["occupantCount"],
  };
  for (const field of positiveFields[model] ?? []) {
    if (value[field] <= 0) errors.push(`${field} must be greater than zero`);
  }

  if (model === "Reservation") {
    if (!isBefore(value.startsAt, value.endsAt)) errors.push("startsAt must be before endsAt");
    if (value.guestCount < 0) errors.push("guestCount must not be negative");
  }
  if (model === "GuestPass" || model === "AccessGrant" || model === "NetworkCredential") {
    if (!isBefore(value.validFrom, value.validUntil)) errors.push("validFrom must be before validUntil");
  }
  if (model === "Visit") {
    if (!exactlyOne(value, ["accountId", "guestPassId"])) {
      errors.push("visit must identify exactly one accountId or guestPassId");
    }
    if (value.checkedInAt && value.checkedOutAt && !isBefore(value.checkedInAt, value.checkedOutAt)) {
      errors.push("checkedInAt must be before checkedOutAt");
    }
  }
  if (model === "AccessGrant" && !exactlyOne(value, ["accountId", "guestPassId"])) {
    errors.push("access grant must identify exactly one accountId or guestPassId");
  }
  if (model === "AccessDecision") {
    if (!exactlyOne(value, ["accountId", "guestPassId"])) {
      errors.push("access decision must identify exactly one accountId or guestPassId");
    }
    if (!/^[0-9a-f]{64}$/i.test(value.evidenceDigestSha256)) {
      errors.push("evidenceDigestSha256 must be a 64-character hexadecimal digest");
    }
    if (value.outcome === "allowed") {
      if (value.reason !== "matching_active_grant") errors.push("allowed decisions require matching_active_grant");
      if (!value.accessGrantId) errors.push("allowed decisions require accessGrantId");
    } else if (value.reason === "matching_active_grant") {
      errors.push("denied decisions cannot use matching_active_grant");
    }
  }
  if (model === "MaintenanceTicket" && value.status === "resolved" && !value.resolvedAt) {
    errors.push("resolved maintenance tickets require resolvedAt");
  }
  if (model === "HousekeepingTask") {
    if (!isBefore(value.scheduledFrom, value.scheduledUntil)) {
      errors.push("scheduledFrom must be before scheduledUntil");
    }
    if (value.status === "completed" && !value.completedAt) {
      errors.push("completed housekeeping tasks require completedAt");
    }
  }
  if ("version" in value && value.version < 0) errors.push("version must not be negative");
  if (transitionModels.has(model) && value.expectedVersion < 0) {
    errors.push("expectedVersion must not be negative");
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function transitionFor(machineName, currentState, transitionKind) {
  const machine = machines[machineName];
  if (!machine) return { ok: false, error: `unknown state machine ${machineName}` };
  if (machine.terminalStates.includes(currentState)) {
    return { ok: false, error: `${machineName} state ${currentState} is terminal` };
  }
  const edge = machine.edges.find((candidate) => candidate.kind === transitionKind);
  if (!edge) return { ok: false, error: `unknown ${machineName} transition ${transitionKind}` };
  if (edge.from !== currentState) {
    return { ok: false, error: `${transitionKind} requires ${edge.from}, not ${currentState}` };
  }
  return { ok: true, nextState: edge.to };
}

export const platformStateMachines = Object.freeze(machines);
