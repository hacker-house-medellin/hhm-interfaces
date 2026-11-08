import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodePlatformEvent, encodePlatformEvent, validateEnvelope } from "../runtime/platform-protobuf.mjs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const contractWorkflow = read(".github/workflows/platform-contracts.yml");
const envelopeWorkflow = read(".github/workflows/platform-envelope-security.yml");

function verifyIntegratedAdmission(manifest, contracts, envelope) {
  assert.equal(manifest.overrides?.undici, "7.30.1",
    "hardened protobuf tests must run with the patched Undici dependency");
  assert.equal(lock.packages["node_modules/undici"].version, "7.30.1");
  assert.equal(lock.packages["node_modules/fast-uri"].version, "3.1.9");
  const platformTests = manifest.scripts?.["test:platform"];
  assert.match(platformTests, /tests\/platform-contracts\.test\.mjs/);
  assert.match(platformTests, /tests\/platform-protobuf\.test\.mjs/);
  assert.match(platformTests, /tests\/platform-envelope-security\.test\.mjs/);
  assert.match(platformTests, /tests\/platform-integration-security\.test\.mjs/);
  assert.equal(manifest.scripts?.["test:dependency-security"],
    "node --test tests/platform-dependency-security.test.mjs");
  assert.ok(contracts.includes("npm run test:dependency-security"),
    "integrated Platform contracts must run npm supply-chain regressions");
  assert.ok(contracts.includes("npm run test:platform"),
    "integrated Platform contracts must execute all envelope regressions");
  assert.ok(contracts.includes("npm ls undici fast-uri --all"),
    "integrated Platform contracts must verify installed transitive graph");
  assert.ok(contracts.includes("npm audit --audit-level=moderate"),
    "integrated Platform contracts must enforce the live npm advisory gate");
  assert.ok(envelope.includes("npm run test:platform"),
    "independent envelope CI must exercise the full platform test suite");
  for (const workflow of [contracts, envelope]) {
    assert.ok(workflow.includes("npm ci --ignore-scripts"),
      "workflow must use script-free frozen npm installation");
    assert.ok(workflow.includes("github.event.pull_request.head.sha || github.sha"),
      "workflow must bind checkout to the exact PR head");
    assert.ok(workflow.includes("persist-credentials: false"),
      "workflow checkout cannot retain GitHub credentials");
    assert.doesNotMatch(workflow,
      /--omit=dev|--no-audit|--audit=false|npm audit[^\n]*\|\|\s*(?:true|:)/,
      "workflow cannot bypass audits by omission or fallback");
  }
}

test("dependency repair and envelope boundary are enforced in the same exact-head CI graph", () => {
  verifyIntegratedAdmission(packageJson, contractWorkflow, envelopeWorkflow);
});

test("mutation probes fail if either security suite, audit or exact-head checkout is weakened", () => {
  const probe = (manifest = packageJson, contracts = contractWorkflow,
    envelope = envelopeWorkflow) => verifyIntegratedAdmission(manifest, contracts, envelope);

  const remove = (script, term) => script.replace(term, "");
  for (const term of [
    "tests/platform-envelope-security.test.mjs",
    "tests/platform-integration-security.test.mjs",
    "tests/platform-protobuf.test.mjs",
  ]) {
    const bad = structuredClone(packageJson);
    bad.scripts["test:platform"] = remove(bad.scripts["test:platform"], term);
    assert.throws(() => probe(bad), undefined, "platform gate admitted missing: " + term);
  }
  const disabledDependencies = structuredClone(packageJson);
  disabledDependencies.scripts["test:dependency-security"] = "echo skipped";
  assert.throws(() => probe(disabledDependencies), undefined, "dependency suite was bypassed");
  for (const term of [
    "npm run test:dependency-security",
    "npm run test:platform",
    "npm ls undici fast-uri --all",
    "npm audit --audit-level=moderate",
    "npm ci --ignore-scripts",
    "github.event.pull_request.head.sha || github.sha",
    "persist-credentials: false",
  ]) {
    assert.throws(() => probe(packageJson, remove(contractWorkflow, term)),
      undefined, "contracts workflow admitted missing: " + term);
  }
  for (const term of [
    "npm run test:platform", "npm ci --ignore-scripts",
    "github.event.pull_request.head.sha || github.sha", "persist-credentials: false",
  ]) {
    assert.throws(() => probe(packageJson, contractWorkflow, remove(envelopeWorkflow, term)),
      undefined, "envelope workflow admitted missing: " + term);
  }
});

test("patched-graph runtime rejects deterministic malformed protobuf frames without throwing", () => {
  let seed = 0x7f23ac11;
  for (let n = 0; n < 192; n++) {
    const bytes = new Uint8Array(1 + (n * 73) % 1024);
    for (let j = 0; j < bytes.length; j++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      bytes[j] = seed & 255;
    }
    const result = decodePlatformEvent(bytes);
    assert.equal(result.ok, false, "malformed frame admitted at seed #" + n);
    assert.ok(Array.isArray(result.errors) && result.errors.length > 0);
  }
  assert.deepEqual(decodePlatformEvent(new Uint8Array(66_561)), {
    ok: false, errors: ["protobuf envelope exceeds bounded wire size"],
  });
});

test("patched-graph runtime still round-trips an authorized reservation transition", () => {
  const fixture = JSON.parse(read("conformance/platform/records.json"));
  const reservation = fixture.valid.find((entry) => entry.model === "ReservationTransition").value;
  const envelope = {
    schemaVersion: "hhaus.platform.event.v1",
    eventId: "14141414-1414-4414-8414-141414141414",
    tenantId: reservation.tenantId,
    locationId: "11111111-1111-4111-8111-111111111111",
    aggregateId: reservation.reservationId,
    aggregateVersion: "2",
    eventType: "RESERVATION_TRANSITION",
    occurredAt: reservation.occurredAt,
    traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    payloadJson: Buffer.from(JSON.stringify(reservation)),
  };
  assert.equal(validateEnvelope(envelope).ok, true);
  const wire = encodePlatformEvent(envelope);
  assert.ok(wire.byteLength < 66_560);
  const decoded = decodePlatformEvent(wire);
  assert.equal(decoded.ok, true, decoded.errors?.join("; "));
  assert.deepEqual(decoded.payload, reservation);
});
