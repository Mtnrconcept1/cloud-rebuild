#!/usr/bin/env node
// Real PostgreSQL roles; synthetic data only; never a hosted or linked target.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.TOK_ACTUALITES_BILLING_DISPOSABLE !== 'true') {
  throw new Error('Refusing fixtures without TOK_ACTUALITES_BILLING_DISPOSABLE=true');
}
assert.ok(!process.env.PGSERVICE && !process.env.PGSERVICEFILE && !process.env.PGHOSTADDR, 'Connection service/address overrides are forbidden');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST), 'Only explicit loopback PGHOST is accepted');
assert.match(process.env.PGPORT || '', /^\d+$/, 'An explicit local PGPORT is required');
assert.equal(process.env.PGDATABASE, 'postgres', 'PGDATABASE must be the explicit disposable postgres database, never a URI or conninfo');
const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
function sql(input) {
  return execFileSync('psql', args, { input, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }).trim();
}
assert.ok(Number(sql('SHOW server_version_num;')) >= 170000, 'PostgreSQL 17+ required');
assert.equal(sql("SELECT to_regprocedure('public.record_social_feed_event_v2(uuid,text,jsonb)') IS NOT NULL;"), 't');
sql(fs.readFileSync(path.join(root, 'supabase/tests/actualites_billing_identity_fixture.sql'), 'utf8'));
function track(n, event, { source = 'actualites_feed', page = 'actualites', agent = 'fixture-browser', role = 'anon', user = '' } = {}) {
  const payload = JSON.stringify({ source, page });
  const headers = JSON.stringify({ 'x-real-ip': '192.0.2.10', 'user-agent': agent });
  // Values above are fixed fixture literals, never external input.
  return sql(`BEGIN;
    SET LOCAL statement_timeout='20s';
    SET LOCAL ROLE ${role};
    SELECT set_config('request.jwt.claim.role','${role}',true);
    SELECT set_config('request.jwt.claim.sub','${user}',true);
    SELECT set_config('request.jwt.claims','${JSON.stringify({ role, ...(user ? { sub: user } : {}) })}',true);
    SELECT set_config('request.headers','${headers}',true);
    SELECT public.record_social_feed_event_v2('74330000-0000-4000-8000-${String(n).padStart(12, '0')}','${event}','${payload}'::jsonb);
    COMMIT;`);
}
for (const [n, event, variation] of [
  [1, 'impression', { page: 'another-client-page' }],
  [2, 'click', { source: 'another-client-source' }],
  [3, 'impression', { agent: 'another-client-agent' }],
  [4, 'click', { page: 'another-client-page', role: 'authenticated', user: '74300000-0000-4000-8000-000000000002' }],
]) {
  const identity = n === 4 ? { role: 'authenticated', user: variation.user } : {};
  track(n, event, identity);
  track(n, event, { ...identity, ...variation });
}
const observed = JSON.parse(sql(`SELECT json_agg(json_build_object('id',id,'spent',spent,'daily',daily_spent,'impressions',impressions,'clicks',clicks) ORDER BY id)
 FROM public.ad_campaigns WHERE id::text LIKE '74340000-%';`));
console.log('Observed synthetic charges after metadata-only variations:', JSON.stringify(observed));
const expected = [0.01, 1, 0.01, 1];
for (let i = 0; i < expected.length; i += 1) {
  assert.equal(Number(observed[i].spent), expected[i], `Campaign ${i + 1}: metadata variations must not bill the same viewer twice`);
}
console.log('PASS independent billing identity under anonymous/authenticated metadata variations');
