import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const here = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, here), 'utf8');
const json = path => JSON.parse(read(path));
const access = read('bindings/atto/src/visitor_access.atto');
const reservation = read('bindings/atto/src/reservation_status.atto');

function descriptors(source) {
  const matches = [...source.matchAll(/pub\s+fnc\s+([a-z_]+)\(\):\s*string\s*\{\s*return\s+"([^"\n]+)";\s*\}/g)];
  const names = new Set(matches.map(([, name]) => name));
  assert.equal(names.size, matches.length, 'duplicate Atto functions');
  return Object.fromEntries(matches.map(([, name, value]) => [name, value]));
}

test('Atto visitor route descriptors match exact OpenAPI path and method authorities', () => {
  const expected = {
    visitor_qr: '/v1/visitor-qr/{action}',
    visit_check_in: '/v1/visits/check-in',
    visit_check_out: '/v1/visits/check-out',
    presence_submission_nonce: '/v1/presence/submission-nonces',
    presence_observation: '/v1/presence/observations'
  };
  const methods = descriptors(access);
  const wanted = Object.keys(expected).flatMap(key => [key + '_path', key + '_method']).sort();
  assert.deepEqual(Object.keys(methods).sort(), wanted);
  const authority = json('openapi/openapi.json').paths;
  for (const [key, path] of Object.entries(expected)) {
    assert.equal(methods[key + '_path'], path);
    assert.equal(methods[key + '_method'], 'POST');
    assert.ok(authority[path]?.post, 'missing POST operation: ' + path);
  }
});

test('Atto reservation lifecycle names and values exactly match authored JSON Schema', () => {
  const values = descriptors(reservation);
  const schema = json('schemas/reservation.json');
  const statuses = schema.properties.status.enum;
  assert.deepEqual(Object.keys(values).sort(), statuses.map(s => 'reservation_' + s).sort());
  assert.deepEqual(Object.values(values).sort(), [...statuses].sort());
  assert.equal(new Set(statuses).size, statuses.length);
  assert.equal(schema.properties.status.type, 'string');
});
