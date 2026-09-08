import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validatePlatformRecord, transitionFor, platformStateMachines } from "../runtime/platform.mjs";
import { jsonSchemaModelNames, validateJsonSchemaRecord } from "../runtime/platform-json-schema.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (relative) => JSON.parse(readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"));
const contract = readJson("contracts/platform/json-schema/contract.schema.json");
const conformance = readJson("conformance/platform/records.json");
const receipt = readJson("target/ores-contracts/platform/receipt.json");

const expectedModels = [
  "AccessDecision",
  "AccessGrant",
  "AccessGrantTransition",
  "Account",
  "GuestPass",
  "GuestPassTransition",
  "HousekeepingTask",
  "Location",
  "MaintenanceTicket",
  "NetworkCredential",
  "Organization",
  "Reservation",
  "ReservationTransition",
  "SecurityObservation",
  "Space",
  "Visit",
  "VisitTransition",
].sort();

test("dual authorities compile and produce seven byte-identical artifact lanes", () => {
  assert.equal(receipt.status, "passed");
  assert.deepEqual(receipt.findings, []);
  assert.equal(receipt.authorities.typespec.tspCompile, "ok");
  assert.match(receipt.authorities.typespec.sha256, /^[0-9a-f]{64}$/);
  assert.match(receipt.authorities["json-schema"].sha256, /^[0-9a-f]{64}$/);
  assert.notEqual(receipt.authorities.typespec.sha256, receipt.authorities["json-schema"].sha256);
  assert.deepEqual([...receipt.authorities.typespec.models].sort(), expectedModels);
  assert.deepEqual([...receipt.authorities["json-schema"].models].sort(), expectedModels);
  assert.equal(Object.keys(receipt.artifacts).length, 7);
  assert.ok(Object.values(receipt.artifacts).every((artifact) => artifact.byteParity === true));

  for (const relative of Object.keys(receipt.artifacts)) {
    const path = `${root}generated/platform/${relative}`;
    assert.ok(existsSync(path), `${relative} was not generated`);
    assert.match(readFileSync(path, "utf8"), /from both authorities \(parity-checked\)/);
  }
});

test("every persisted model has a positive conformance fixture in both runtime validators", () => {
  assert.deepEqual(jsonSchemaModelNames, expectedModels);
  assert.deepEqual(conformance.valid.map(({ model }) => model).sort(), expectedModels);
  for (const fixture of conformance.valid) {
    assert.deepEqual(validateJsonSchemaRecord(fixture.model, fixture.value), { ok: true, value: fixture.value });
    assert.deepEqual(validatePlatformRecord(fixture.model, fixture.value), { ok: true, value: fixture.value });
  }
});

test("every persisted model is tenant-scoped and every generated table stays in the HHM namespace", () => {
  for (const model of expectedModels) {
    const definition = contract.$defs[model];
    assert.ok(definition.required.includes("tenantId"), `${model} must require tenantId`);
    assert.equal(definition.properties.tenantId.type, "string");
    assert.equal(definition.properties.tenantId.maxLength, 128);
    if (model !== "Organization") {
      assert.equal(definition.properties.tenantId["x-ores-references"], "Organization.tenantId");
    }
  }

  const sql = readFileSync(`${root}generated/platform/sql/schema.sql`, "utf8");
  const tables = [...sql.matchAll(/^CREATE TABLE ([a-z0-9_]+) \(/gm)].map((match) => match[1]);
  assert.equal(tables.length, expectedModels.length);
  assert.ok(tables.every((table) => table.startsWith("hhm_")), tables.join(", "));
  assert.ok(tables.includes("hhm_space_reservations"));
  assert.equal(tables.includes("hhm_reservations"), false, "legacy reservation storage must not be redefined");
  assert.match(sql, /CREATE TABLE hhm_organizations[\s\S]*UNIQUE \(tenant_id\)/);
});

test("negative conformance fixtures fail closed with stable semantic evidence", () => {
  for (const fixture of conformance.invalid) {
    const source = conformance.valid[fixture.validIndex];
    assert.equal(source.model, fixture.model, `${fixture.name} points at the wrong valid fixture`);
    const value = { ...source.value, ...fixture.patch };
    const result = validatePlatformRecord(fixture.model, value, fixture.context);
    assert.equal(result.ok, false, fixture.name);
    assert.ok(result.errors.some((error) => error.includes(fixture.errorIncludes)), `${fixture.name}: ${result.errors.join("; ")}`);
  }
});

test("state-machine graphs exactly cover authority enums and have no terminal exits", () => {
  for (const [name, machine] of Object.entries(platformStateMachines)) {
    const states = contract.$defs[machine.stateEnum].enum;
    const transitionKinds = contract.$defs[machine.transitionEnum].enum;
    const graphStates = new Set([
      ...machine.initialStates,
      ...machine.terminalStates,
      ...machine.edges.flatMap((edge) => [edge.from, edge.to]),
    ]);
    assert.deepEqual([...graphStates].sort(), [...states].sort(), `${name} state coverage`);
    assert.deepEqual(machine.edges.map((edge) => edge.kind).sort(), [...transitionKinds].sort(), `${name} transition coverage`);
    assert.equal(new Set(machine.edges.map((edge) => edge.kind)).size, machine.edges.length, `${name} duplicate transition kind`);
    for (const terminal of machine.terminalStates) {
      assert.equal(machine.edges.some((edge) => edge.from === terminal), false, `${name}.${terminal} must be terminal`);
    }
  }
});

test("transition executor accepts only the declared origin state", () => {
  assert.deepEqual(transitionFor("Reservation", "confirmed", "confirmed_to_checked_in"), {
    ok: true,
    nextState: "checked_in",
  });
  assert.deepEqual(transitionFor("Reservation", "requested", "confirmed_to_checked_in"), {
    ok: false,
    error: "confirmed_to_checked_in requires confirmed, not requested",
  });
  assert.deepEqual(transitionFor("Reservation", "completed", "requested_to_held"), {
    ok: false,
    error: "Reservation state completed is terminal",
  });
});

test("privacy boundary excludes raw credential, camera, biometric, and bearer payload fields", () => {
  const forbidden = /(^|_)(password|token|secret|camera_frame|audio|biometric|document_image|raw_sensor)(_|$)/i;
  for (const [model, definition] of Object.entries(contract.$defs)) {
    if (Array.isArray(definition.enum)) continue;
    for (const field of Object.keys(definition.properties)) {
      assert.equal(forbidden.test(field), false, `${model}.${field} violates the privacy boundary`);
    }
  }
});
