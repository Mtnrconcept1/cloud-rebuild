import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

assert.equal(process.env.TOK_RESERVATION_GUARANTEE_DISPOSABLE, 'true');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST));
assert.match(process.env.PGPORT || '', /^\d+$/);
assert.equal(process.env.PGDATABASE, 'postgres');
assert.ok(!process.env.PGSERVICE && !process.env.PGSERVICEFILE && !process.env.PGHOSTADDR);
const executable = process.env.PSQL_BIN || 'psql';
const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-w'];
const sql = query => execFileSync(executable, args, { input: query, encoding: 'utf8', timeout: 30000, windowsHide: true }).trim();
function concurrent(query) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true }); let output = '', errors = '';
    child.stdout.on('data', value => output += value); child.stderr.on('data', value => errors += value);
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
    child.stdin.end(query);
  });
}
assert.equal(sql("SELECT to_regclass('public.reservation_card_guarantee_setups') IS NULL"), 't', 'Requires fresh disposable database');
sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE TABLE public.reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, restaurant_id uuid, date date, time time, party_size integer, status text);
CREATE TABLE public.reservation_card_guarantee_setups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,restaurant_id uuid NOT NULL,date date NOT NULL,time time NOT NULL,party_size integer NOT NULL,feature text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}',notes text,progressive_offer_id uuid,acquisition_source text,acquisition_channel_token text,fee_amount_cents integer NOT NULL,policy_version text NOT NULL DEFAULT 'v1',consented_at timestamptz DEFAULT now(),stripe_customer_id text,stripe_checkout_session_id text UNIQUE,stripe_setup_intent_id text UNIQUE,stripe_payment_method_id text,reservation_id uuid UNIQUE,status text NOT NULL DEFAULT 'pending',error_code text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),confirmed_at timestamptz);
ALTER TABLE public.reservation_card_guarantee_setups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_card_guarantee_setups FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.reservation_card_guarantee_setups TO service_role;
CREATE FUNCTION public.validate_and_create_reservation_safe(uuid,date,time,integer,text,jsonb,text,uuid) RETURNS TABLE(reservation_id uuid,error_code text,error_message text) LANGUAGE plpgsql AS $$
DECLARE v_id uuid; BEGIN
IF $6->>'_internal_user_id' IS NULL THEN RAISE EXCEPTION 'owner missing'; END IF;
INSERT INTO public.reservations(user_id,restaurant_id,date,time,party_size,status) VALUES(($6->>'_internal_user_id')::uuid,$1,$2,$3,$4,'pending') RETURNING id INTO v_id;
RETURN QUERY SELECT v_id,NULL::text,NULL::text; END $$;`);
const migration = readFileSync('supabase/migrations/20261017000200_reservation_guarantee_request_idempotency.sql', 'utf8');
sql(migration); sql(migration);
const old = readFileSync('supabase/migrations/20261012130000_reservation_card_guarantees.sql', 'utf8');
const start = old.indexOf('CREATE OR REPLACE FUNCTION public.finalize_reservation_card_guarantee(');
sql(old.slice(start, old.indexOf('$$;', start) + 3));
const user = '11111111-1111-4111-8111-111111111111';
const payload = { p_restaurant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p_date: '2027-01-02', p_time: '19:00', p_party_size: 7, p_feature: 'classique', p_metadata: { acquisition_source: 'tok_marketplace', _internal_user_id: user }, p_notes: null, p_progressive_offer_id: null, acquisition_channel_token: null };
const server = "SET request.jwt.claim.role='service_role'; SET ROLE service_role;";
const client = `SET request.jwt.claim.sub='${user}'; SET ROLE authenticated;`;
const claim = (value = payload, key = 'guarantee-request-1', create = true) => `SELECT public.claim_reservation_guarantee_request('${user}','${key}','${JSON.stringify(value)}'::jsonb,${create})::text;`;
assert.equal(sql(server + claim(payload, 'missing-request', false)), '');
const rows = await Promise.all(Array.from({ length: 8 }, () => concurrent(server + claim())));
const ids = rows.map(value => JSON.parse(value).id);
assert.equal(new Set(ids).size, 1); const setup = ids[0];
assert.equal(sql('SELECT count(*) FROM public.reservation_card_guarantee_setups'), '1');
assert.throws(() => sql(server + claim({ ...payload, p_party_size: 8 })));
assert.throws(() => sql(client + claim()));
assert.throws(() => sql('SET ROLE anon;' + claim()));
assert.throws(() => sql(client + 'SELECT * FROM public.reservation_card_guarantee_setups;'));
sql(`UPDATE public.reservation_card_guarantee_setups SET stripe_customer_id='cus_test',stripe_checkout_session_id='cs_test',stripe_checkout_url='https://checkout.stripe.com/c/pay/test',status='checkout_ready' WHERE id='${setup}';`);
const owned = JSON.parse(sql(client + "SELECT public.get_my_reservation_guarantee_request_result('guarantee-request-1')::text;"));
assert.equal(owned.checkout_url, 'https://checkout.stripe.com/c/pay/test');
assert.ok(!('stripe_customer_id' in owned) && !('request_payload' in owned));
assert.equal(sql("SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; SET ROLE authenticated; SELECT public.get_my_reservation_guarantee_request_result('guarantee-request-1')::text;"), '');
const finalized = await Promise.all(Array.from({ length: 8 }, () => concurrent(server + `SELECT row_to_json(r)::text FROM public.finalize_reservation_card_guarantee('${setup}','cs_test','cus_test','seti_test','pm_test') r;`)));
assert.equal(new Set(finalized.map(value => JSON.parse(value).reservation_id)).size, 1);
assert.equal(finalized.filter(value => JSON.parse(value).newly_confirmed).length, 1);
assert.equal(sql('SELECT count(*) FROM public.reservations'), '1');
assert.equal(sql(`SELECT user_id::text FROM public.reservations`), user);
console.log('PASS guarantee migration replay twice; eight concurrent intent claims and native finalizations; changed body rejection; actor isolation and ACL; one setup and one reservation. Native capacity/pricing is a fixture; no Stripe request.');
