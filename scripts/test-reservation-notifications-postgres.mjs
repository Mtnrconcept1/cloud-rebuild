// Integration test against an explicitly disposable, empty loopback PostgreSQL.
// Native validation is a fixture: this verifies transactionality, not capacity/pricing.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

assert.equal(process.env.TOK_RESERVATION_NOTIFICATIONS_DISPOSABLE, 'true');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST));
assert.match(process.env.PGPORT || '', /^\d+$/);
assert.equal(process.env.PGDATABASE, 'postgres');
assert.ok(!process.env.PGSERVICE && !process.env.PGSERVICEFILE && !process.env.PGHOSTADDR);
const executable = process.env.PSQL_BIN || 'psql';
const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-w'];
function sql(query) {
  return execFileSync(executable, args, { input: query, encoding: 'utf8', timeout: 30000, windowsHide: true }).trim();
}
function concurrent(query) {
  return new Promise((yes, no) => {
    const child = spawn(executable, args, { windowsHide: true });
    let output = '', errors = '';
    child.stdout.on('data', chunk => output += chunk);
    child.stderr.on('data', chunk => errors += chunk);
    child.on('error', no);
    child.on('close', code => code === 0 ? yes(output.trim()) : no(new Error(errors)));
    child.stdin.end(query);
  });
}
const root = process.cwd();
const read = file => readFileSync(resolve(root, file), 'utf8');
function functionSql(file, name) {
  const text = read(file);
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, name);
  const end = text.indexOf('$$;', start);
  assert.ok(end >= 0, name);
  return text.slice(start, end + 3);
}
assert.equal(sql("SELECT to_regclass('public.reservations') IS NULL;"), 't', 'Database must be fresh, never a shared/test instance with application data');
sql(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.restaurants(id uuid PRIMARY KEY, owner_id uuid, name text);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, full_name text);
CREATE TABLE public.reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, user_id uuid, date date, time time, party_size int, feature text, notes text, status text DEFAULT 'pending');
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,title text,body text,type text,category text,data jsonb);
CREATE TABLE public.notification_preferences(user_id uuid,channels jsonb,categories jsonb);
CREATE TABLE public.notification_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid,channel text,status text,target text,provider text,attempts int DEFAULT 0,max_attempts int DEFAULT 5,last_error text,scheduled_at timestamptz,sent_at timestamptz,created_at timestamptz DEFAULT now(),next_attempt_at timestamptz,lease_token uuid,lease_expires_at timestamptz);
CREATE TABLE public.email_queue(id uuid);
CREATE FUNCTION public.validate_and_create_reservation_safe(uuid,date,time,integer,text,jsonb,text,uuid)
RETURNS TABLE(reservation_id uuid,error_code text,error_message text) LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_sleep(0.05);
  INSERT INTO public.reservations(restaurant_id,user_id,date,time,party_size,feature,notes)
  VALUES($1,($6->>'_internal_user_id')::uuid,$2,$3,$4,$5,$7) RETURNING id INTO reservation_id;
  RETURN NEXT;
END $$;
INSERT INTO auth.users VALUES
('11111111-1111-4111-8111-111111111111','client@example.test'),
('22222222-2222-4222-8222-222222222222','owner@example.test'),
('33333333-3333-4333-8333-333333333333','other@example.test');
INSERT INTO public.restaurants VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Gazelle Test');
`);
sql(functionSql('supabase/migrations/20260329140000_fix_notification_pipeline_newsletter_column.sql', 'queue_notification_deliveries'));
for (const name of ['claim_notification_deliveries', 'settle_notification_delivery']) {
  sql(functionSql('supabase/migrations/20260907011600_notification_delivery_reliability.sql', name));
}
const migrations = [
  'supabase/migrations/20261016234805_reservation_transactional_notifications.sql',
  'supabase/migrations/20261016234832_reservation_request_idempotency.sql',
];
for (let replay = 0; replay < 2; replay++) for (const file of migrations) sql(read(file));
sql(`CREATE TRIGGER after_reservation_notification AFTER INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.trigger_reservation_notifications();`);
const client = "SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'; SET request.jwt.claim.role='authenticated'; SET ROLE authenticated;";
const other = "SET request.jwt.claim.sub='33333333-3333-4333-8333-333333333333'; SET request.jwt.claim.role='authenticated'; SET ROLE authenticated;";
const server = "SET request.jwt.claim.role='service_role'; SET ROLE service_role;";
const request = (key, size = 7, user = '11111111-1111-4111-8111-111111111111', replay = false) => `SELECT row_to_json(r)::text FROM public.validate_and_create_reservation_idempotent('${key}','${user}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2027-01-02','19:00',${size}${replay ? ', p_replay_only => true' : ''}) r;`;
assert.equal(sql(server + request('unknown-replay-only', 7, undefined, true)), '');
assert.equal(sql('SELECT count(*) FROM public.reservation_request_idempotency'), '0');
const results = await Promise.all(Array.from({ length: 8 }, () => concurrent(server + request('concurrent-booking-1'))));
const ids = results.map(result => JSON.parse(result).reservation_id);
assert.equal(new Set(ids).size, 1, 'Concurrent retries must create one reservation');
const id = ids[0];
assert.equal(sql('SELECT count(*) FROM public.reservations'), '1');
assert.equal(JSON.parse(sql(server + request('concurrent-booking-1', 7, undefined, true))).reservation_id, id);
assert.equal(JSON.parse(sql(server + request('concurrent-booking-1', 5, undefined, true))).error_code, 'idempotency_conflict');
assert.equal(sql("SELECT count(*) FROM public.notification_deliveries WHERE channel='email' AND status='queued'"), '2');
assert.equal(sql("SELECT bool_and(title NOT LIKE '%confirmée%') FROM public.notifications"), 't');
assert.equal(JSON.parse(sql(server + request('concurrent-booking-1', 5))).error_code, 'idempotency_conflict');
assert.equal(sql(client + "SELECT get_my_reservation_request_result('concurrent-booking-1')->>'reservation_id'"), id);
assert.equal(sql(other + "SELECT get_my_reservation_request_result('concurrent-booking-1') IS NULL"), 't');
assert.notEqual(JSON.parse(sql(server + request('concurrent-booking-1', 7, '33333333-3333-4333-8333-333333333333'))).reservation_id, id, 'Keys are scoped by verified actor');
sql(`UPDATE public.reservations SET status='confirmed' WHERE id='${id}';`);
assert.equal(sql("SELECT count(*) FROM public.notifications WHERE title='Réservation confirmée'"), '2');
const beforeNoop = sql('SELECT count(*) FROM public.notifications');
sql(`UPDATE public.reservations SET status='confirmed' WHERE id='${id}';`);
assert.equal(sql('SELECT count(*) FROM public.notifications'), beforeNoop);
sql(`UPDATE public.reservations SET time='20:00',party_size=5 WHERE id='${id}';`);
assert.equal(sql("SELECT count(*) FROM public.notifications WHERE data->>'event'='modified'"), '2');
for (const status of ['rejected', 'cancelled']) sql(`UPDATE public.reservations SET status='${status}' WHERE id='${id}'`);
assert.equal(sql("SELECT count(*) FROM public.notification_deliveries WHERE channel='email'"), '12');
const beforeRollback = sql('SELECT count(*) FROM public.notifications');
sql(`BEGIN; UPDATE public.reservations SET notes='rolled back' WHERE id='${id}'; ROLLBACK;`);
assert.equal(sql('SELECT count(*) FROM public.notifications'), beforeRollback, 'No delivery intent may survive booking rollback');
sql('ALTER TABLE public.notifications ADD CONSTRAINT fixture_outbox_failure CHECK(false) NOT VALID;');
assert.throws(() => sql(server + request('outbox-storage-outage')));
sql('ALTER TABLE public.notifications DROP CONSTRAINT fixture_outbox_failure;');
assert.equal(sql("SELECT count(*) FROM public.reservation_request_idempotency WHERE request_key='outbox-storage-outage'"), '0');
assert.equal(sql('SELECT count(*) FROM public.reservations'), '2', 'Outbox storage failure must roll back booking and retry result atomically');
assert.equal(sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.reservation_request_idempotency'::regclass"), 't');
for (const query of [
  'SET ROLE anon; SELECT public.get_my_reservation_request_result(\'concurrent-booking-1\');',
  client + 'SELECT * FROM public.reservation_request_idempotency;',
  client + 'SELECT public.trigger_reservation_notifications();',
  client + request('direct-client-bypass'),
  'SET ROLE anon;' + request('direct-anon-bypass'),
  "SET request.jwt.claim.role='authenticated';" + request('server-role-required'),
]) assert.throws(() => sql(query));
const claimed = JSON.parse(sql("SET request.jwt.claim.role='service_role'; SELECT row_to_json(d) FROM public.claim_notification_deliveries('email',1,NULL,30) d;"));
sql(`SET request.jwt.claim.role='service_role'; SELECT public.settle_notification_delivery('${claimed.id}','${claimed.lease_token}',false,false,'failed','temporary provider failure','resend');`);
assert.equal(sql(`SELECT status FROM public.notification_deliveries WHERE id='${claimed.id}'`), 'retrying');
sql(`UPDATE public.notification_deliveries SET next_attempt_at=now()-interval '1 second' WHERE id='${claimed.id}';`);
sql(`UPDATE public.notification_deliveries SET next_attempt_at=now()+interval '1 hour' WHERE id<>'${claimed.id}' AND channel='email';`);
const retry = JSON.parse(sql("SET request.jwt.claim.role='service_role'; SELECT row_to_json(d) FROM public.claim_notification_deliveries('email',1,NULL,30) d;"));
assert.equal(retry.id, claimed.id, 'Provider idempotency key must survive worker retries');
assert.notEqual(retry.lease_token, claimed.lease_token);
assert.throws(() => sql(`SET request.jwt.claim.role='service_role'; SELECT public.settle_notification_delivery('${claimed.id}','${claimed.lease_token}',true);`));
sql(`SET request.jwt.claim.role='service_role'; SELECT public.settle_notification_delivery('${retry.id}','${retry.lease_token}',true);`);
assert.equal(sql(`SELECT status FROM public.notification_deliveries WHERE id='${retry.id}'`), 'sent');
console.log('PASS PostgreSQL replay twice; eight concurrent retries; actor/body isolation; native creation/status/reschedule/cancellation intents for both recipients; no-op/rollback; ACL; leased retry and stale-worker rejection. No external email sent.');
