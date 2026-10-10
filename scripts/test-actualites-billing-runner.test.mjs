import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const runner = fileURLToPath(new URL('./test-actualites-billing-postgres.mjs', import.meta.url));
function rejected(overrides, message) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('PG') || key.startsWith('TOK_ACTUALITES_BILLING_')) delete env[key];
  }
  const result = spawnSync(process.execPath, [runner], {
    env: { ...env, ...overrides }, encoding: 'utf8', timeout: 10_000, windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, message);
}
const local = { TOK_ACTUALITES_BILLING_DISPOSABLE: 'true', PGHOST: '127.0.0.1', PGPORT: '54322', PGDATABASE: 'postgres' };
test('requires explicit disposable database opt-in', () => rejected({}, /Refusing fixtures without/));
test('refuses remote hosts before running psql', () => rejected({ ...local, PGHOST: 'db.example.test' }, /Only explicit loopback/));
test('rejects ambient address and service overrides', () => {
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR']) rejected({ ...local, [key]: 'untrusted' }, /overrides are forbidden/);
});
test('requires an explicit port', () => rejected({ ...local, PGPORT: '' }, /explicit local PGPORT/));
test('rejects database URIs, conninfo and other databases', () => {
  for (const database of ['', 'shared', 'postgresql://db.example.test/postgres', 'host=db.example.test dbname=postgres']) {
    rejected({ ...local, PGDATABASE: database }, /PGDATABASE must be/);
  }
});
