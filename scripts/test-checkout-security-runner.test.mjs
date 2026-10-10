import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const runner = fileURLToPath(new URL('./test-checkout-security-postgres.mjs', import.meta.url));
function rejected(overrides, message) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('PG') || key.startsWith('TOK_SECURITY_710_')) delete env[key];
  }
  const result = spawnSync(process.execPath, [runner], {
    env: { ...env, ...overrides }, encoding: 'utf8', timeout: 10_000, windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, message);
}
test('fixtures require explicit disposable target opt-in', () => {
  rejected({}, /Refusing fixtures without TOK_SECURITY_710_DISPOSABLE/);
});
test('remote database is refused before psql runs', () => {
  rejected({ TOK_SECURITY_710_DISPOSABLE: 'true', PGHOST: 'db.example.test', PGPORT: '5432' }, /Only explicit loopback/);
});
test('ambient connection service cannot override the loopback guard', () => {
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR']) {
    rejected({ TOK_SECURITY_710_DISPOSABLE: 'true', PGHOST: '127.0.0.1', PGPORT: '5432', [key]: 'untrusted' }, /overrides are forbidden/);
  }
});
test('shared Docker container names are refused before Docker runs', () => {
  rejected({ TOK_SECURITY_710_DISPOSABLE: 'true', TOK_SECURITY_710_CONTAINER: 'supabase_db_shared' }, /tok-security-710-/);
});
test('implicit database ports are refused', () => {
  rejected({ TOK_SECURITY_710_DISPOSABLE: 'true', PGHOST: '127.0.0.1' }, /explicit local PGPORT/);
});
