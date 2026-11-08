import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const load = (name) => JSON.parse(readFileSync(new URL("../" + name, import.meta.url), "utf8"));
const text = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const packageJson = load("package.json");
const lock = load("package-lock.json");
const workflow = text(".github/workflows/platform-contracts.yml");

const approved = Object.freeze({
  undici: Object.freeze({
    version: "7.30.1",
    resolved: "https://registry.npmjs.org/undici/-/undici-7.30.1.tgz",
    integrity: "sha512-03KrMbjIFDWQR5RNPrSw3bd1r12JpyFQl9/yxjUbJtqkjmllqC5lFjZh6ujeuJCKr8EOQvRW872Oy/az+nLYxg==",
  }),
  "fast-uri": Object.freeze({
    version: "3.1.9",
    resolved: "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.9.tgz",
    integrity: "sha512-hS/0Wt3Ya043oKXs0sIxrMpKQITXhMLIrVAKKXi4gozGC9v7YRWVnXIZzjNPTO02M9BdxLCWqK1yRXgNziVyJQ==",
  }),
});

function verifyDependencySecurity(manifest, snapshot) {
  assert.equal(snapshot.lockfileVersion, 3, "npm v3 lock must remain unchanged");
  assert.equal(snapshot.packages?.[""]?.name, manifest.name, "root name differs from lock");
  assert.equal(manifest.overrides?.undici, approved.undici.version,
    "exact undici override is required while Scalar pins a vulnerable release");
  assert.equal(manifest.scripts?.["test:dependency-security"],
    "node --test tests/platform-dependency-security.test.mjs",
    "do not remove the dependency policy regression suite");

  const allPackages = Object.entries(snapshot.packages ?? {});
  for (const [name, floor] of Object.entries(approved)) {
    const found = allPackages.filter(([path]) =>
      path === "node_modules/" + name || path.endsWith("/node_modules/" + name));
    assert.equal(found.length, 1, name + ": exactly one audited instance must be installed");
    assert.equal(found[0][0], "node_modules/" + name, name + ": no hidden nested copies");
    const meta = found[0][1];
    assert.equal(meta.version, floor.version, name + ": pinned patched version");
    assert.equal(meta.resolved, floor.resolved, name + ": registry provenance mismatch");
    assert.equal(meta.integrity, floor.integrity, name + ": archive digest mismatch");
  }

  assert.equal(snapshot.packages["node_modules/@scalar/json-magic"].dependencies.undici,
    "7.24.4", "review this override again when Scalar releases a compatible dependency");
  assert.equal(snapshot.packages["node_modules/@typespec/openapi3"].version,
    "1.16.0", "do not combine this audit fix with an unrelated TypeSpec upgrade");
}

function verifyWorkflowPolicy(source) {
  assert.match(source, /npm ci --ignore-scripts/,
    "installation must use frozen lock and disallow lifecycle scripts");
  assert.match(source, /npm run test:dependency-security/,
    "mandatory offline dependency floor test must execute");
  assert.match(source, /npm ls undici fast-uri --all/,
    "full installed graph must be checked for nested vulnerable copies");
  assert.match(source, /npm audit --audit-level=moderate/,
    "external advisory database audit must remain a hard gate");
  assert.doesNotMatch(source, /--audit=false|--no-audit|--omit=dev|--production|npm audit.*\|\|\s*(true|:)/,
    "never bypass the full direct and development dependency audit");
}

test("lockfile has verified patched archives for all affected npm dependencies", () => {
  verifyDependencySecurity(packageJson, lock);
});

test("no lockfile downgrade, nested stale package, or forged archive digest can pass", () => {
  for (const name of Object.keys(approved)) {
    const outdated = structuredClone(lock);
    outdated.packages["node_modules/" + name].version = name === "undici" ? "7.24.4" : "3.1.8";
    assert.throws(() => verifyDependencySecurity(packageJson, outdated), /pinned patched version/);

    const corrupted = structuredClone(lock);
    corrupted.packages["node_modules/" + name].integrity = "sha512-FAKE";
    assert.throws(() => verifyDependencySecurity(packageJson, corrupted), /archive digest mismatch/);

    const nested = structuredClone(lock);
    nested.packages["node_modules/@scalar/json-magic/node_modules/" + name] = {
      ...nested.packages["node_modules/" + name], version: "0.0.1",
    };
    assert.throws(() => verifyDependencySecurity(packageJson, nested), /exactly one audited instance/);
  }
});

test("root override and lock identity cannot be silently removed or widened", () => {
  for (const overrides of [{}, { undici: "^7.30.1" }, { undici: "7.24.4" }]) {
    const manifest = { ...packageJson, overrides };
    assert.throws(() => verifyDependencySecurity(manifest, lock), /exact undici override/);
  }
  const altered = structuredClone(lock);
  altered.packages["node_modules/@typespec/openapi3"].version = "1.17.0";
  assert.throws(() => verifyDependencySecurity(packageJson, altered), /unrelated TypeSpec upgrade/);
});

test("CI cannot skip frozen install, graph integrity, or live security audit", () => {
  verifyWorkflowPolicy(workflow);
  const mutations = [
    workflow.replace("npm ci --ignore-scripts", "npm install"),
    workflow.replace("npm run test:dependency-security", "echo ignored"),
    workflow.replace("npm ls undici fast-uri --all", "echo nested ignored"),
    workflow.replace("npm audit --audit-level=moderate", "echo skipped"),
    workflow + "\n# rejected mutation\nnpm audit --audit-level=moderate || true\n",
    workflow + "\n# rejected mutation\nnpm audit --omit=dev\n",
  ];
  for (const candidate of mutations) {
    assert.throws(() => verifyWorkflowPolicy(candidate), undefined,
      "security gate mutation was incorrectly admitted");
  }
});
