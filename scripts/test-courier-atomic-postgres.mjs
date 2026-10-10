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
// Commit a privileged mutation after the RPC read, while its row lock waits.
// Catch only the deliberate sleep cancellation; locks were acquired outside it.
async function mutateWhileRpcWaits(attemptId, mutation, expression) {
  const mutator = session(`BEGIN; SET LOCAL application_name='courier_atomic_mutator';
    SELECT 1 FROM public.dispatch_attempts WHERE id='${attemptId}' FOR UPDATE;
    DO $$ BEGIN PERFORM pg_sleep(30); EXCEPTION WHEN query_canceled THEN NULL; END $$;
    ${mutation}; COMMIT;`);
  await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='courier_atomic_mutator' AND wait_event='PgSleep';", 1);
  const contender = session(`SET application_name='courier_atomic_revalidation'; ${service(`SELECT to_jsonb(${expression})`)}`);
  await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='courier_atomic_revalidation' AND wait_event_type='Lock';", 1);
  assert.equal(sql("SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name='courier_atomic_mutator' AND wait_event='PgSleep';"), 't');
  const mutationResult = await mutator;
  assert.equal(mutationResult.code, 0, mutationResult.errors);
  const result = await contender;
  assert.equal(result.code, 0, result.errors);
  return JSON.parse(result.output.trim());
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

const migration = fs.readFileSync('supabase/migrations/20261010223000_courier_dispatch_atomic.sql', 'utf8');
// The incompatible history above must abort deployment instead of being erased.
assert.throws(() => sql(migration), /duplicate key|could not create unique index/);
assert.equal(sql("SELECT to_regprocedure('public.respond_courier_dispatch_attempt(uuid,uuid,text)') IS NULL;"), 't');
console.log('PASS inconsistent pre-existing history aborts migration atomically');
// Only resolve this runner's deliberately corrupted synthetic RED rows.
sql("UPDATE public.dispatch_attempts SET status='declined' WHERE dispatch_job_id='74540000-0000-4000-8000-000000000001'; UPDATE public.dispatch_jobs SET status='cancelled' WHERE order_id IN ('74520000-0000-4000-8000-000000000001','74520000-0000-4000-8000-000000000002');");
const history = sql("SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.dispatch_jobs j;");
sql(migration);
sql(migration);
assert.equal(sql("SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.dispatch_jobs j;"), history);
console.log('PASS migration reapplication preserves historical jobs');
const order = n => `74520000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const courier = n => `74530000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = n => `74500000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const service = statement => `BEGIN; SET LOCAL ROLE service_role; SET LOCAL request.jwt.claim.role='service_role'; SET LOCAL request.jwt.claims='{"role":"service_role"}'; ${statement}; COMMIT;`;
const value = statement => JSON.parse(sql(service(`SELECT to_jsonb(${statement})`)));
const ensure = n => value(`public.ensure_courier_dispatch_job('${order(n)}')`);
const offers = (job, couriers) => value(`public.offer_courier_dispatch_attempts('${job}', '${JSON.stringify(couriers.map(n => ({ courier_id: courier(n), timeout_seconds: 3600, estimated_earnings: 5, distance_to_pickup_meters: 800 })))}'::jsonb)`);
const respond = (attempt, courierNo, decision = 'accept') => `public.respond_courier_dispatch_attempt('${attempt}','${user(courierNo + 2)}','${decision}')`;
const errors = async (statement, pattern) => { const result = await session(statement); assert.notEqual(result.code, 0); assert.match(result.errors, pattern); };
for (const role of ['anon', 'authenticated']) {
  for (const expression of [
    `public.ensure_courier_dispatch_job('${order(3)}')`,
    "public.set_courier_dispatch_search_state('74540000-0000-4000-8000-000000000001','searching',NULL)",
    "public.offer_courier_dispatch_attempts('74540000-0000-4000-8000-000000000001','[]')",
    "public.respond_courier_dispatch_attempt('74550000-0000-4000-8000-000000000001',NULL,'accept')",
    "public.expire_courier_dispatch_attempt('74550000-0000-4000-8000-000000000001')",
  ]) await errors(`SET ROLE ${role}; SELECT ${expression};`, /permission denied/);
  for (const table of ['dispatch_jobs', 'dispatch_attempts']) {
    await errors(`SET ROLE ${role}; UPDATE public.${table} SET status='accepted';`, /permission denied/);
    await errors(`SET ROLE ${role}; DELETE FROM public.${table};`, /permission denied/);
    await errors(`SET ROLE ${role}; INSERT INTO public.${table}(id) VALUES(gen_random_uuid());`, /permission denied/);
  }
}
console.log('PASS real anon/authenticated roles cannot call service RPCs or bypass transitions');
const creators = await race(`SELECT 1 FROM public.orders WHERE id='${order(3)}' FOR NO KEY UPDATE`,
  Array.from({ length: 6 }, () => service(`SELECT public.ensure_courier_dispatch_job('${order(3)}')`)));
assert.ok(creators.every(r => r.code === 0), creators.map(r => r.errors).join('\n'));
assert.equal(new Set(creators.map(r => JSON.parse(r.output.trim()).id)).size, 1);
const job3 = JSON.parse(creators[0].output.trim());
console.log('PASS six creators receive one active job for the same order');
const offerPayload = JSON.stringify([1, 2].map(n => ({ courier_id: courier(n), timeout_seconds: 3600, estimated_earnings: 5 })));
const offerRace = await race(`SELECT 1 FROM public.dispatch_jobs WHERE id='${job3.id}' FOR NO KEY UPDATE`,
  Array.from({ length: 3 }, () => service(`SELECT public.offer_courier_dispatch_attempts('${job3.id}','${offerPayload}')`)));
assert.ok(offerRace.every(r => r.code === 0), offerRace.map(r => r.errors).join('\n'));
assert.equal(offerRace.reduce((n, r) => n + JSON.parse(r.output.trim()).length, 0), 2);
const attempts3 = JSON.parse(sql(`SELECT jsonb_agg(to_jsonb(a) ORDER BY courier_id) FROM public.dispatch_attempts a WHERE dispatch_job_id='${job3.id}';`));
const acceptRace = await race(`SELECT 1 FROM public.orders WHERE id='${order(3)}' FOR NO KEY UPDATE`,
  attempts3.map((a, i) => service(`SELECT ${respond(a.id, i + 1)}`)));
assert.ok(acceptRace.every(r => r.code === 0), acceptRace.map(r => r.errors).join('\n'));
const acceptResults = acceptRace.map(r => JSON.parse(r.output.trim()));
assert.equal(acceptResults.filter(r => r.status === 'accepted').length, 1);
assert.equal(acceptResults.filter(r => r.http_status === 409).length, 1);
const winner = acceptResults.find(r => r.status === 'accepted');
const winnerNo = Number(winner.dispatch_job.courier_id.slice(-1));
const winnerAttempt = attempts3.find(a => a.courier_id === courier(winnerNo));
assert.equal(sql(`SELECT courier_id='${courier(winnerNo)}' FROM public.orders WHERE id='${order(3)}';`), 't');
assert.equal(sql(`SELECT count(*) FROM public.delivery_tracking WHERE order_id='${order(3)}';`), '1');
const notificationCount = () => sql(`SELECT count(*) FROM public.notifications WHERE type='dispatch' AND data->>'dispatch_job_id'='${job3.id}';`);
assert.equal(notificationCount(), '2');
assert.equal(value(respond(winnerAttempt.id, winnerNo)).changed, false);
assert.equal(notificationCount(), '2');
assert.equal(value(`public.expire_courier_dispatch_attempt('${winnerAttempt.id}')`), false);
assert.equal(value(`public.set_courier_dispatch_search_state('${job3.id}','no_courier','late failure')`), false);
assert.equal(value(`public.set_courier_dispatch_search_state('${job3.id}','searching',NULL)`), false);
assert.deepEqual(offers(job3.id, [3]), []);
assert.equal(value(respond(winnerAttempt.id, winnerNo === 1 ? 2 : 1)).http_status, 404);
console.log('PASS one acceptance, coherent order/tracking, durable notifications, replay and stale-writer protection');

const job4 = ensure(4); const job5 = ensure(5);
const attempt4 = offers(job4.id, [3])[0]; const attempt5 = offers(job5.id, [3])[0];
const sameCourier = await race(`SELECT 1 FROM public.couriers WHERE id='${courier(3)}' FOR NO KEY UPDATE`,
  [attempt4, attempt5].map(a => service(`SELECT ${respond(a.id, 3)}`)));
assert.ok(sameCourier.every(r => r.code === 0), sameCourier.map(r => r.errors).join('\n'));
const sameResults = sameCourier.map(r => JSON.parse(r.output.trim()));
assert.equal(sameResults.filter(r => r.status === 'accepted').length, 1);
assert.equal(sameResults.filter(r => r.error === 'courier_already_busy').length, 1);
console.log('PASS one courier cannot accept two simultaneous jobs');

const freeCourier = winnerNo === 1 ? 2 : 1;
const job6 = ensure(6); const attempt6 = offers(job6.id, [freeCourier])[0];
sql(`UPDATE public.dispatch_attempts SET offered_at=now()-interval '2 hours' WHERE id='${attempt6.id}';`);
const beforeRate = Number(sql(`SELECT acceptance_rate FROM public.couriers WHERE id='${courier(freeCourier)}';`));
const expirers = await race(`SELECT 1 FROM public.dispatch_jobs WHERE id='${job6.id}' FOR NO KEY UPDATE`,
  Array.from({ length: 3 }, () => service(`SELECT public.expire_courier_dispatch_attempt('${attempt6.id}')`)));
assert.ok(expirers.every(r => r.code === 0), expirers.map(r => r.errors).join('\n'));
assert.equal(expirers.filter(r => r.output.trim() === 't').length, 1);
assert.equal(Number(sql(`SELECT acceptance_rate FROM public.couriers WHERE id='${courier(freeCourier)}';`)), Math.max(0, beforeRate - 2));
assert.equal(value(respond(attempt6.id, freeCourier)).http_status, 409);
assert.equal(value(`public.expire_courier_dispatch_attempt('${attempt6.id}')`), false);
console.log('PASS concurrent expiry penalizes once and expired offers cannot be accepted');

const job7 = ensure(7); const attempt7 = offers(job7.id, [freeCourier])[0];
// A failure at the last transaction effect must roll back all prior effects.
sql(`CREATE FUNCTION public.courier_atomic_test_notification_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='dispatch' THEN RAISE EXCEPTION 'synthetic notification persistence failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER courier_atomic_test_notification_failure BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.courier_atomic_test_notification_failure();`);
await errors(service(`SELECT ${respond(attempt7.id, freeCourier)}`), /synthetic notification persistence failure/);
assert.equal(sql(`SELECT status FROM public.dispatch_jobs WHERE id='${job7.id}';`), 'searching');
assert.equal(sql(`SELECT status FROM public.dispatch_attempts WHERE id='${attempt7.id}';`), 'pending');
assert.equal(sql(`SELECT courier_id IS NULL FROM public.orders WHERE id='${order(7)}';`), 't');
assert.equal(sql(`SELECT count(*) FROM public.delivery_tracking WHERE order_id='${order(7)}';`), '0');
sql('DROP TRIGGER courier_atomic_test_notification_failure ON public.notifications; DROP FUNCTION public.courier_atomic_test_notification_failure();');
const declined = value(respond(attempt7.id, freeCourier, 'decline'));
assert.equal(declined.status, 'declined'); assert.equal(declined.redispatch, true);
assert.equal(value(respond(attempt7.id, freeCourier, 'decline')).changed, false);
console.log('PASS notification failure rolls back acceptance, then decline and retry are idempotent');
const job8 = ensure(8); const attempt8 = offers(job8.id, [freeCourier])[0];
sql(`UPDATE public.dispatch_attempts SET offered_at=now()-interval '2 hours' WHERE id='${attempt8.id}';`);
assert.equal(value(respond(attempt8.id, freeCourier)).error, 'attempt_expired');
assert.equal(sql(`SELECT status FROM public.dispatch_attempts WHERE id='${attempt8.id}';`), 'pending');
console.log('PASS response deadline is checked by the database even before the timeout worker runs');

// Guard the second read, not just the first snapshot of the offer.
const job9 = ensure(9); const attempt9 = offers(job9.id, [freeCourier])[0];
const deletedResponse = await mutateWhileRpcWaits(attempt9.id,
  `DELETE FROM public.dispatch_attempts WHERE id='${attempt9.id}'`, respond(attempt9.id, freeCourier));
assert.equal(deletedResponse.http_status, 404);
assert.equal(sql(`SELECT courier_id IS NULL AND status='searching' FROM public.dispatch_jobs WHERE id='${job9.id}';`), 't');
assert.equal(sql(`SELECT courier_id IS NULL FROM public.orders WHERE id='${order(9)}';`), 't');
assert.equal(sql(`SELECT count(*) FROM public.delivery_tracking WHERE order_id='${order(9)}';`), '0');
console.log('PASS deleted offer while acceptance waits cannot assign the order');

const job10 = ensure(10); const attempt10 = offers(job10.id, [freeCourier])[0];
sql(`UPDATE public.dispatch_attempts SET offered_at=now()-interval '2 hours' WHERE id='${attempt10.id}';`);
const courierRates = () => sql('SELECT jsonb_agg(jsonb_build_array(id,acceptance_rate) ORDER BY id) FROM public.couriers;');
const ratesBeforeDeletion = courierRates();
const deletedExpiry = await mutateWhileRpcWaits(attempt10.id,
  `DELETE FROM public.dispatch_attempts WHERE id='${attempt10.id}'`, `public.expire_courier_dispatch_attempt('${attempt10.id}')`);
assert.equal(deletedExpiry, false);
assert.equal(courierRates(), ratesBeforeDeletion);
console.log('PASS deleted offer while expiry waits is not counted or penalized');

const job11 = ensure(11); const attempt11 = offers(job11.id, [freeCourier])[0];
const reassignedResponse = await mutateWhileRpcWaits(attempt11.id,
  `UPDATE public.dispatch_attempts SET courier_id='${courier(winnerNo)}' WHERE id='${attempt11.id}'`, respond(attempt11.id, freeCourier));
assert.equal(reassignedResponse.http_status, 404);
assert.equal(sql(`SELECT courier_id IS NULL AND status='searching' FROM public.dispatch_jobs WHERE id='${job11.id}';`), 't');
assert.equal(sql(`SELECT status FROM public.dispatch_attempts WHERE id='${attempt11.id}';`), 'pending');
console.log('PASS reassigned offer while acceptance waits rejects the former actor');

const job12 = ensure(12); const attempt12 = offers(job12.id, [freeCourier])[0];
sql(`UPDATE public.dispatch_attempts SET offered_at=now()-interval '2 hours' WHERE id='${attempt12.id}';`);
const ratesBeforeReassignment = courierRates();
const reassignedExpiry = await mutateWhileRpcWaits(attempt12.id,
  `UPDATE public.dispatch_attempts SET courier_id='${courier(winnerNo)}' WHERE id='${attempt12.id}'`, `public.expire_courier_dispatch_attempt('${attempt12.id}')`);
assert.equal(reassignedExpiry, false, 'Stale expiry must not penalize a newly assigned courier whose row was not locked');
assert.equal(courierRates(), ratesBeforeReassignment);
assert.equal(sql(`SELECT status FROM public.dispatch_attempts WHERE id='${attempt12.id}';`), 'pending');
console.log('PASS reassigned offer while expiry waits leaves both couriers unpenalized');
console.log('PASS courier atomic PostgreSQL protocol');
