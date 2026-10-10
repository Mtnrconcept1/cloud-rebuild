#!/usr/bin/env node
// No dependencies, no production credentials, no implicit database reset.
// The database must be disposable and already contain the BASE main schema.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const container = process.env.TOK_SECURITY_710_CONTAINER || '';
const migration = path.join(root, 'supabase/migrations/20261010194510_checkout_benefits_and_public_menu_security.sql');
if (process.env.TOK_SECURITY_710_DISPOSABLE !== 'true') {
  throw new Error('Refusing fixtures without TOK_SECURITY_710_DISPOSABLE=true. Use a fresh isolated database.');
}
if (container) {
  assert.match(container, /^tok-security-710-[a-z0-9-]+$/);
  const network = execFileSync('docker', ['inspect', container, '--format', '{{.HostConfig.NetworkMode}}'], { encoding: 'utf8' }).trim();
  assert.equal(network, 'none', 'Docker test target must have no network');
} else {
  assert.ok(!process.env.PGSERVICE && !process.env.PGSERVICEFILE && !process.env.PGHOSTADDR, 'Connection service/address overrides are forbidden');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST), 'Only explicit loopback PGHOST is accepted');
  assert.match(process.env.PGPORT || '', /^\d+$/, 'An explicit local PGPORT is required');
}
const executable = container ? 'docker' : (process.env.PSQL_BIN || 'psql');
const args = [...(container ? ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres'] : []), '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
function sql(input) {
  return execFileSync(executable, args, { input, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }).trim();
}
function concurrentSql(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    let errors = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Concurrent SQL timed out')); }, 120_000);
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (code) => { clearTimeout(timeout); resolve({ code, output, errors }); });
    child.stdin.end(input);
  });
}
const functionQuery = "SELECT pg_get_functiondef('public.apply_checkout_benefits(uuid,uuid,integer,uuid,numeric,text)'::regprocedure);";
const demoPolicyQuery = `SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname)::text
 FROM pg_policies p WHERE schemaname='public' AND
 (policyname LIKE '%commercial_demo%' OR policyname LIKE '%production_access_for_commercial_demo%');`;
const historyQuery = "SELECT row_to_json(p)::text FROM public.promo_code_uses p WHERE id='71050000-0000-4000-8000-000000000001';";
assert.ok(Number(sql('SHOW server_version_num;')) >= 170000, 'PostgreSQL 17+ is required');
assert.equal(sql("SELECT to_regprocedure('public.commercial_demo_shared_restaurant_id()') IS NOT NULL;"), 't', 'Base schema must include the October inert-demo migration');
assert.equal(sql("SELECT qual LIKE '%directory_image_verified%' FROM pg_policies WHERE schemaname='public' AND tablename='restaurants' AND policyname='restaurants_public_select';"), 't', 'Base schema must include current restaurant image restrictions');

const beforeFunction = sql(functionQuery);
const beforeDemoPolicies = sql(demoPolicyQuery);
const unsafe = 'v_promo_discount := GREATEST(v_promo_discount, COALESCE(p_discount_applied, 0), 0);';
const safe = 'v_promo_discount := GREATEST(v_promo_discount, 0);';
assert.ok(beforeFunction.includes(unsafe), 'Test must start from the vulnerable base schema, not a previously patched database');
sql(fs.readFileSync(path.join(root, 'supabase/tests/checkout_security_710_fixture.sql'), 'utf8'));
const beforeHistory = sql(historyQuery);
assert.notEqual(beforeHistory, '', 'Historical fixture must exist before migration');
sql(fs.readFileSync(migration, 'utf8'));
assert.equal(sql(functionQuery), beforeFunction.replace(unsafe, safe), 'Only the unsafe discount floor may change');
assert.equal(sql(demoPolicyQuery), beforeDemoPolicies, 'Every existing demo policy must remain unchanged');
assert.equal(sql(historyQuery), beforeHistory, 'Existing promotion history must remain unchanged');
const afterFunction = sql(functionQuery);
sql(fs.readFileSync(migration, 'utf8'));
assert.equal(sql(functionQuery), afterFunction, 'Migration reapplication must be idempotent');
assert.equal(sql(demoPolicyQuery), beforeDemoPolicies);
assert.equal(sql(historyQuery), beforeHistory);
console.log('PASS migration transition, reapplication, history and demo-policy preservation');

sql(fs.readFileSync(path.join(root, 'supabase/tests/checkout_security_710_assertions.sql'), 'utf8'));
console.log('PASS real-role permissions, publication boundaries, cash/zero-balance, forged amounts and demo isolation');

function benefitsSql(user, order, promo, points = 0) {
  return `BEGIN;
 SET LOCAL lock_timeout='20s'; SET LOCAL statement_timeout='40s';
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub','${user}',true);
 SELECT set_config('request.jwt.claim.role','authenticated',true);
 SELECT set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true);
 SELECT public.apply_checkout_benefits('${user}','${order}',${points},'${promo}',999999);
 COMMIT;`;
}
const repeated = benefitsSql('71000000-0000-4000-8000-000000000002', '71020000-0000-4000-8000-000000000006', '71030000-0000-4000-8000-000000000001', 20);
const replayResults = await Promise.all(Array.from({ length: 6 }, () => concurrentSql(repeated)));
assert.ok(replayResults.every((result) => result.code === 0), JSON.stringify(replayResults));
assert.equal(sql("SELECT count(*) FROM public.promo_code_uses WHERE order_id='71020000-0000-4000-8000-000000000006';"), '1');
assert.equal(sql("SELECT count(*) FROM public.loyalty_transactions WHERE order_id='71020000-0000-4000-8000-000000000006' AND transaction_type='redeem';"), '1');
assert.equal(sql("SELECT loyalty_points FROM public.profiles WHERE user_id='71000000-0000-4000-8000-000000000002';"), '80');
assert.equal(sql("SELECT discount_applied::numeric=10 FROM public.promo_code_uses WHERE order_id='71020000-0000-4000-8000-000000000006';"), 't');
const raceResults = await Promise.all([
  concurrentSql(benefitsSql('71000000-0000-4000-8000-000000000002', '71020000-0000-4000-8000-000000000007', '71030000-0000-4000-8000-000000000006')),
  concurrentSql(benefitsSql('71000000-0000-4000-8000-000000000003', '71020000-0000-4000-8000-000000000008', '71030000-0000-4000-8000-000000000006')),
]);
assert.equal(raceResults.filter((result) => result.code === 0).length, 1, JSON.stringify(raceResults));
assert.match(raceResults.find((result) => result.code !== 0).errors, /limite d'utilisation/);
assert.equal(sql("SELECT current_uses FROM public.promo_codes WHERE id='71030000-0000-4000-8000-000000000006';"), '1');
assert.equal(sql("SELECT count(*) FROM public.promo_code_uses WHERE promo_code_id='71030000-0000-4000-8000-000000000006';"), '1');
assert.equal(sql(historyQuery), beforeHistory);
console.log('PASS concurrent replay: one redemption/discount, no loyalty double debit, one winner for last promo use');
console.log('Synthetic fixtures remain only in the disposable database; destroy that isolated database after review.');
