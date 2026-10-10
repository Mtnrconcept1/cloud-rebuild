#!/usr/bin/env node
// No dependencies, no production credentials, no implicit database reset.
// The database must be disposable and already contain the BASE main schema.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const container = process.env.TOK_PRINT_PROTOCOL_CONTAINER || '';
const migration = path.join(root, 'supabase/migrations/20261010203000_print_fulfillment_protocol.sql');
if (process.env.TOK_PRINT_PROTOCOL_DISPOSABLE !== 'true') {
  throw new Error('Refusing fixtures without TOK_PRINT_PROTOCOL_DISPOSABLE=true. Use a fresh isolated database.');
}
if (container) {
  assert.match(container, /^tok-print-protocol-[a-z0-9-]+$/);
  const network = execFileSync('docker', ['inspect', container, '--format', '{{.HostConfig.NetworkMode}}'], { encoding: 'utf8' }).trim();
  assert.equal(network, 'none', 'Docker test target must have no network');
} else {
  assert.ok(!process.env.PGSERVICE && !process.env.PGSERVICEFILE && !process.env.PGHOSTADDR, 'Connection service/address overrides are forbidden');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST), 'Only explicit loopback PGHOST is accepted');
  assert.match(process.env.PGPORT || '', /^\d+$/, 'An explicit local PGPORT is required');
  assert.equal(process.env.PGDATABASE, 'postgres', 'PGDATABASE must be the explicit disposable postgres database, never a URI or conninfo');
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
assert.ok(Number(sql('SHOW server_version_num;')) >= 170000, 'PostgreSQL 17+ required');
assert.equal(sql("SELECT to_regprocedure('public.claim_print_fulfillment_jobs(integer,text,integer)') IS NOT NULL;"), 't');
assert.equal(sql("SELECT count(*) FROM pg_attribute WHERE attrelid='public.print_orders'::regclass AND attname='submission_started_at' AND NOT attisdropped;"), '0', 'Start from the pre-migration base');
sql(fs.readFileSync(path.join(root, 'supabase/tests/print_fulfillment_protocol_fixture.sql'), 'utf8'));
sql(fs.readFileSync(migration, 'utf8'));
const backfill = "SELECT submission_started_at IS NOT NULL FROM public.print_orders WHERE id='73260000-0000-4000-8000-000000000011';";
assert.equal(sql(backfill), 't', 'Historical attempted orders must be reconciliation-only');
assert.equal(sql("SELECT submission_started_at IS NULL FROM public.print_orders WHERE id='73260000-0000-4000-8000-000000000001';"), 't');
sql("UPDATE public.print_fulfillment_jobs SET attempt_count=1 WHERE operation_key LIKE 'fixture-%';");
sql(fs.readFileSync(migration, 'utf8'));
assert.equal(sql("SELECT submission_started_at IS NULL FROM public.print_orders WHERE id='73260000-0000-4000-8000-000000000001';"), 't', 'Reapplication must not change new work');
sql(fs.readFileSync(path.join(root, 'supabase/tests/print_fulfillment_protocol_assertions.sql'), 'utf8'));
console.log('PASS transition/reapplication, permissions, expired/replaced leases, exhausted jobs, cancellation, advanced=false and atomic finish');
const prepare = (suffix) => `BEGIN;
 SET LOCAL lock_timeout='20s'; SET LOCAL statement_timeout='40s'; SET LOCAL ROLE service_role;
 SELECT public.prepare_print_fulfillment_submission('73270000-0000-4000-8000-${suffix}','73280000-0000-4000-8000-${suffix}')->>'action';
 COMMIT;`;
const results = await Promise.all(['000000000012','000000000013'].map((suffix) => concurrentSql(prepare(suffix))));
assert.ok(results.every((result) => result.code === 0), JSON.stringify(results));
assert.deepEqual(results.map((result) => result.output.trim()).sort(), ['create','reconcile_only']);
console.log('PASS two concurrent jobs for one order: exactly one automatic send authorized; other job lookup-only');
console.log('No provider call occurred. Fixtures are confined to the disposable database.');
