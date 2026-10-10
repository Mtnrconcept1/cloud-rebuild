#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';

assert.equal(process.env.TOK_COURIER_ATOMIC_DISPOSABLE, 'true', 'Explicit disposable database opt-in required');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST), 'Only loopback database accepted');
assert.match(process.env.PGPORT || '', /^\d+$/);
assert.equal(process.env.PGDATABASE, 'postgres');
assert.ok(!process.env.PGSERVICE && !process.env.PGSERVICEFILE && !process.env.PGHOSTADDR);
const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
function sql(input) {
  return execFileSync('psql', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 }).trim();
}
function session(input) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = ''; let errors = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('SQL session timed out')); }, 120000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, output, errors }); });
    child.stdin.end(input);
  });
}
async function waitFor(query, expected) {
  for (let n = 0; n < 100; n++) {
    if (Number(sql(query)) === expected) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Expected PostgreSQL concurrency barrier was not observed');
}
async function race(lock, statements) {
  const coordinator = session(`BEGIN; SET LOCAL application_name='courier_atomic_barrier'; ${lock}; SELECT pg_sleep(30); COMMIT;`);
  await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='courier_atomic_barrier' AND wait_event='PgSleep';", 1);
  const results = statements.map(statement => session(`SET application_name='courier_atomic_contender'; ${statement}`));
  await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='courier_atomic_contender' AND wait_event_type='Lock';", statements.length);
  console.log(`PASS observed ${statements.length} PostgreSQL contenders waiting on barrier`);
  assert.equal(sql("SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name='courier_atomic_barrier' AND wait_event='PgSleep';"), 't');
  assert.match((await coordinator).errors, /canceling statement due to user request/);
  return Promise.all(results);
}
assert.ok(Number(sql('SHOW server_version_num;')) >= 170000);
sql(fs.readFileSync('supabase/tests/courier_atomic_fixture.sql', 'utf8'));
// Faithful reproduction of the old Edge protocol: read pending, then write by id.
const redAccept = n => `DO $$ DECLARE seen text; BEGIN
 SELECT status INTO seen FROM public.dispatch_attempts WHERE id='74550000-0000-4000-8000-00000000000${n}';
 PERFORM pg_advisory_xact_lock(745001);
 IF seen='pending' THEN
 UPDATE public.dispatch_attempts SET status='accepted' WHERE id='74550000-0000-4000-8000-00000000000${n}';
 UPDATE public.dispatch_jobs SET courier_id='74530000-0000-4000-8000-00000000000${n}',status='accepted' WHERE id='74540000-0000-4000-8000-000000000001';
 END IF; END $$;`;
assert.ok((await race('SELECT pg_advisory_xact_lock(745001)', [redAccept(1), redAccept(2)])).every(r => r.code === 0));
assert.equal(sql("SELECT count(*) FROM public.dispatch_attempts WHERE dispatch_job_id='74540000-0000-4000-8000-000000000001' AND status='accepted';"), '2');
console.log('RED reproduced: two successful acceptances for one job after both read pending');
const redCreate = `DO $$ DECLARE absent boolean; BEGIN
 SELECT NOT EXISTS(SELECT 1 FROM public.dispatch_jobs WHERE order_id='74520000-0000-4000-8000-000000000002' AND status NOT IN ('delivered','cancelled','expired')) INTO absent;
 PERFORM pg_advisory_xact_lock(745002);
 IF absent THEN INSERT INTO public.dispatch_jobs(order_id,status) VALUES ('74520000-0000-4000-8000-000000000002','searching'); END IF;
 END $$;`;
assert.ok((await race('SELECT pg_advisory_xact_lock(745002)', [redCreate, redCreate])).every(r => r.code === 0));
assert.equal(sql("SELECT count(*) FROM public.dispatch_jobs WHERE order_id='74520000-0000-4000-8000-000000000002';"), '2');
console.log('RED reproduced: two concurrent creations for one order');
// Old timeout writes its cached pending row after an acceptance committed.
sql("UPDATE public.dispatch_attempts SET status='pending' WHERE id='74550000-0000-4000-8000-000000000001';");
const timeoutBarrier = session("BEGIN; SET LOCAL application_name='courier_atomic_barrier'; SELECT pg_advisory_xact_lock(745003); SELECT pg_sleep(30); COMMIT;");
await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='courier_atomic_barrier' AND wait_event='PgSleep';", 1);
const staleExpiry = session(`SET application_name='courier_atomic_stale_timeout'; DO $$ DECLARE seen text; BEGIN
 SELECT status INTO seen FROM public.dispatch_attempts WHERE id='74550000-0000-4000-8000-000000000001';
 PERFORM pg_advisory_xact_lock(745003);
 IF seen='pending' THEN UPDATE public.dispatch_attempts SET status='expired' WHERE id='74550000-0000-4000-8000-000000000001'; END IF;
 END $$;`);
await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='courier_atomic_stale_timeout' AND wait_event_type='Lock';", 1);
sql("UPDATE public.dispatch_attempts SET status='accepted' WHERE id='74550000-0000-4000-8000-000000000001';");
assert.equal(sql("SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name='courier_atomic_barrier' AND wait_event='PgSleep';"), 't');
assert.match((await timeoutBarrier).errors, /canceling statement due to user request/);
assert.equal((await staleExpiry).code, 0);
assert.equal(sql("SELECT status FROM public.dispatch_attempts WHERE id='74550000-0000-4000-8000-000000000001';"), 'expired');
console.log('RED reproduced: id-only stale expiration can overwrite accepted');
