import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/source-policy-lint.yml', import.meta.url), 'utf8');
const platformWorkflow = readFileSync(
  new URL('../.github/workflows/platform-contracts.yml', import.meta.url), 'utf8');
const approvedCandidate = '97ca3010d02bf9af2b6d13c4deb7064d4e2cad2c';
const expr = '$' + '{{ github.event.pull_request.head.sha || github.sha }}';

function assertCallerSecurity(source) {
  assert.match(source, /^permissions:\n  contents: read$/m,
    'caller must not escalate the GitHub token');
  assert.match(source, /^\s+uses: ores-otel\/\.github\/\.github\/workflows\/source-policy-lint\.yml@[a-f0-9]{40}$/m,
    'policy must be called by immutable full-SHA reusable workflow');
  assert.equal(source.split('uses: ores-otel/.github/.github/workflows/source-policy-lint.yml@' +
    approvedCandidate).length, 2, 'the staged and reviewed upstream policy pin must occur exactly once');
  assert.match(source, /^\s+source-policy:\n\s+#[^\n]*\n\s+uses: ores-otel\//m,
    'workflow must keep the direct reusable source-policy job');
  assert.match(source, /^\s+caller-pin-contract:\n\s+runs-on: ubuntu-24\.04$/m,
    'caller SHA and policy-pin contract must remain a blocking job');
  assert.ok(source.includes('          ref: ' + expr),
    'admission checkout must select the original PR head');
  assert.ok(source.includes('          EXPECTED_SHA: ' + expr),
    'admission must bind its expected SHA to the PR head');
  assert.ok(source.includes('          test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"'),
    'admission must compare actual checkout to expected head');
  assert.ok(source.includes("          git rev-parse 'HEAD^{tree}'"),
    'admission must print source tree identity');
  const checkouts = source.match(/^\s+- uses: actions\/checkout@[^\s]+$/gm) || [];
  assert.equal(checkouts.length, 1, 'single immutable test-job checkout expected');
  assert.match(checkouts[0], /actions\/checkout@[a-f0-9]{40}$/,
    'test-job checkout must use immutable full SHA');
  assert.equal((source.match(/^\s+persist-credentials: false$/gm) || []).length, 1,
    'test checkout must explicitly disable credential retention');
  assert.ok(source.includes('          node --test tests/source-policy-caller.test.mjs'),
    'this policy admission test must run on each caller change');
  assert.doesNotMatch(source, /secrets:\s*inherit|contents:\s*write|continue-on-error:\s*true|persist-credentials:\s*true/,
    'caller must not broaden token privileges or permit a bypass');
}

test('source-policy caller pins reviewed candidate and enforces exact PR head', () => {
  assertCallerSecurity(workflow);
});

test('negative mutation: stale, mutable and unreviewed policy refs are rejected', () => {
  for (const override of ['main', 'v1', 'c417efc488bb4ca84e078fad9626f55b374913dd',
    'cbfd81cd53bf139ae3552932ca05ee30686d1460']) {
    const oldRef = 'source-policy-lint.yml@' + approvedCandidate;
    const mutant = workflow.replace(oldRef, 'source-policy-lint.yml@' + override);
    assert.notEqual(mutant, workflow, 'expected policy ref mutation');
    assert.throws(() => assertCallerSecurity(mutant), undefined, override);
  }
});

test('negative mutation: merged-ref checkout, missing gate and credential bypass fail closed', () => {
  const changes = [
    ['ref: ' + expr, 'ref: ' + '$' + '{{ github.sha }}'],
    ['EXPECTED_SHA: ' + expr, 'EXPECTED_SHA: ' + '$' + '{{ github.sha }}'],
    ['test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"', 'echo skip head assertion'],
    ["git rev-parse 'HEAD^{tree}'", 'echo skip tree proof'],
    ['node --test tests/source-policy-caller.test.mjs', 'echo skip contract tests'],
    ['actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803', 'actions/checkout@v4'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['permissions:\n  contents: read', 'permissions:\n  contents: write'],
    ['caller-pin-contract:', 'caller-pin-contract-disabled:'],
  ];
  for (const [i, [needle, replacement]] of changes.entries()) {
    assert.ok(workflow.includes(needle), 'missing mutation anchor ' + i);
    assert.throws(() => assertCallerSecurity(workflow.replace(needle, replacement)),
      undefined, 'security bypass mutation was admitted: ' + i);
  }
  for (const extra of [
    '\nsecrets: inherit\n',
    '\n    continue-on-error: true\n',
    '\n          persist-credentials: true\n',
  ]) {
    assert.throws(() => assertCallerSecurity(workflow + extra));
  }
});


function assertPlatformAdmission(source) {
  for (const path of [
    '      - ".github/workflows/source-policy-lint.yml"',
    '      - "tests/source-policy-caller.test.mjs"',
    '      - ".github/workflows/platform-contracts.yml"',
  ]) {
    assert.ok(source.includes(path), 'full platform/security CI must trigger on: ' + path);
  }
  const expr = '$' + '{{ github.event.pull_request.head.sha || github.sha }}';
  assert.ok(source.includes('          ref: ' + expr),
    'platform admission must check out reviewed head');
  assert.ok(source.includes('          EXPECTED_HEAD: ' + expr),
    'platform admission must independently assert reviewed head');
  assert.ok(source.includes('test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"'),
    'platform admission must enforce identical checkout SHA');
  for (const gate of [
    'npm ci --ignore-scripts',
    'npm run test:dependency-security',
    'npm ls undici fast-uri --all',
    'npm audit --audit-level=moderate',
    'cargo check --locked',
  ]) {
    assert.ok(source.includes(gate),
      'source-policy caller edits must also pass full platform gate: ' + gate);
  }
  assert.doesNotMatch(source,
    /continue-on-error:\s*true|--omit=dev|--audit=false|--no-audit|npm audit[^\n]*\|\|\s*(?:true|:)/,
    'platform gate must not suppress dependency advisories');
}

test('source-policy caller pin changes must trigger exact-head platform and dependency security', () => {
  assertPlatformAdmission(platformWorkflow);
});

test('negative mutation: platform security skipped on caller changes is rejected', () => {
  const mutations = [
    ['      - ".github/workflows/source-policy-lint.yml"', '      - "unused.yml"'],
    ['      - "tests/source-policy-caller.test.mjs"', '      - "unused.test.mjs"'],
    ['          ref: ' + expr, '          ref: ' + '$' + '{{ github.sha }}'],
    ['          EXPECTED_HEAD: ' + expr, '          EXPECTED_HEAD: ' + '$' + '{{ github.sha }}'],
    ['test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"', 'echo skip head check'],
    ['npm ci --ignore-scripts', 'npm install'],
    ['npm run test:dependency-security', 'echo skip lock tests'],
    ['npm ls undici fast-uri --all', 'echo skip nested installs'],
    ['npm audit --audit-level=moderate', 'echo skip advisory database'],
    ['cargo check --locked', 'echo skip Rust contracts'],
  ];
  for (const [i, [needle, replacement]] of mutations.entries()) {
    assert.ok(platformWorkflow.includes(needle), 'missing platform mutation anchor ' + i);
    assert.throws(() => assertPlatformAdmission(platformWorkflow.replace(needle, replacement)),
      undefined, 'platform audit mutation was admitted: ' + i);
  }
});
