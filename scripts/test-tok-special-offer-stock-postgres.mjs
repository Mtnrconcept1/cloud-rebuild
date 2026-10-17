import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
assert.equal(process.env.TOK_SPECIAL_OFFER_STOCK_DISPOSABLE, 'true');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST));
assert.match(process.env.PGPORT || '', /^\d+$/); assert.equal(process.env.PGDATABASE, 'postgres');
assert.ok(!process.env.PGSERVICE && !process.env.PGSERVICEFILE && !process.env.PGHOSTADDR);
const executable = process.env.PSQL_BIN || 'psql', args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-w'];
const sql = query => execFileSync(executable, args, { input: query, encoding: 'utf8', timeout: 30000, windowsHide: true }).trim();
const concurrent = query => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { windowsHide: true }); let out = '', error = '';
  child.stdout.on('data', value => out += value); child.stderr.on('data', value => error += value); child.on('error', reject);
  child.on('close', code => resolve({ code, out: out.trim(), error })); child.stdin.end(query);
});
const fn = (file, name, terminator = '$$;') => {
  const text = readFileSync(file, 'utf8'), start = text.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
  assert.ok(start >= 0); return text.slice(start, text.indexOf(terminator, start) + terminator.length);
};
assert.equal(sql("SELECT to_regclass('public.orders') IS NULL"), 't', 'Requires a fresh disposable database');
sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE FUNCTION public.is_feature_flag_active(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.commercial_demo_current_user_is_restricted() RETURNS boolean LANGUAGE sql AS $$ SELECT COALESCE(current_setting('test.commercial_demo_restricted',true),'false')='true' $$;
CREATE TABLE public.restaurants(id uuid PRIMARY KEY, delivery_available boolean, supports_pickup boolean, disabled_payment_methods text[]);
CREATE TABLE public.menu_items(id uuid PRIMARY KEY,restaurant_id uuid,price numeric,is_available boolean);
CREATE TABLE public.anti_waste_offers(id uuid PRIMARY KEY,restaurant_id uuid,discounted_price numeric,quantity_available integer CHECK(quantity_available>=0),is_active boolean);
CREATE TABLE public.flash_sales(LIKE public.anti_waste_offers INCLUDING ALL);
CREATE TABLE public.orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,restaurant_id uuid,delivery_address text,total_amount numeric,delivery_fee numeric,notes text,metadata jsonb,checkout_id uuid,idempotency_key text UNIQUE,original_total numeric,discount_amount numeric,status text DEFAULT 'pending_payment',payment_status text DEFAULT 'pending');
CREATE TABLE public.order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,menu_item_id uuid,restaurant_id uuid,quantity integer,unit_price numeric,total_price numeric,metadata jsonb);
INSERT INTO public.restaurants VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,true,'{}');
INSERT INTO public.anti_waste_offers VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',8,3,true);
INSERT INTO public.flash_sales VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',9,5,true);`);
sql(fn('supabase/migrations/20260330120000_global_feature_flag_enforcement.sql', 'create_order_with_items', '$function$;'));
sql(fn('supabase/migrations/20260715060000_payment_integrity_state_machine.sql', 'create_order_with_items_idempotent'));
sql(readFileSync('supabase/migrations/20260603114000_restore_special_offer_stock.sql', 'utf8'));
sql(readFileSync('supabase/migrations/20261017004243_atomic_order_special_offer_stock_restore.sql', 'utf8'));
sql(readFileSync('supabase/migrations/20261017004243_atomic_order_special_offer_stock_restore.sql', 'utf8')); // migration replay must preserve the provenance table
sql(`REVOKE ALL ON FUNCTION public.create_order_with_items_idempotent(uuid,text,numeric,numeric,text,json,json,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_order_with_items(uuid,text,numeric,numeric,text,json,json,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items_idempotent(uuid,text,numeric,numeric,text,json,json,uuid) TO service_role;`);
const server = "SET request.jwt.claim.role='service_role'; SET ROLE service_role;";
const request = (key, kind = 'anti_waste', quantity = 1) => {
  const id = kind === 'anti_waste' ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const metadata = { _internal_user_id: '11111111-1111-4111-8111-111111111111', checkout_request_fingerprint: 'a'.repeat(64), payment_method: 'card' };
  const items = [{ menu_item_id: null, quantity, unit_price: 0, metadata: { [kind === 'anti_waste' ? 'anti_waste_offer_id' : 'flash_sale_id']: id } }];
  return `SELECT public.create_order_with_items_idempotent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','',0,0,NULL,'${JSON.stringify(items)}'::json,'${JSON.stringify(metadata)}'::json,'${key}')::text;`;
};
assert.throws(()=>sql("SET test.commercial_demo_restricted='true';"+server+request('fafafafa-fafa-4afa-8afa-fafafafafafa')));
assert.equal(sql('SELECT count(*) FROM public.orders'),'0');
const distinct = await Promise.all(Array.from({ length: 8 }, (_, index) => concurrent(server + request(`00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`))));
assert.equal(distinct.filter(value => value.code === 0).length, 3);
assert.equal(sql('SELECT quantity_available FROM public.anti_waste_offers'), '0');
assert.equal(sql('SELECT count(*) FROM public.orders'), '3');
assert.equal(sql('SELECT bool_and(unit_price=8) FROM public.order_items'), 't', 'Native SQL must ignore forged unit_price=0');
const repeated = await Promise.all(Array.from({ length: 8 }, () => concurrent(server + request('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'flash_sale', 2))));
assert.ok(repeated.every(value => value.code === 0)); assert.equal(new Set(repeated.map(value => value.out)).size, 1);
assert.equal(sql('SELECT quantity_available FROM public.flash_sales'), '3');
assert.throws(() => sql('SET ROLE authenticated;' + request('ffffffff-ffff-4fff-8fff-ffffffffffff')));
assert.throws(() => sql('SET ROLE anon;' + request('ffffffff-ffff-4fff-8fff-ffffffffffff')));

const flashOrder=repeated[0].out;
const restore=server+"SELECT public.restore_order_special_offer_stock('"+flashOrder+"');";
// Transaction rollback after all increments must leave both ledger and stock unchanged.
sql('BEGIN;'+restore+'ROLLBACK;');
assert.equal(sql('SELECT quantity_available FROM public.flash_sales'),'3');
const restored=await Promise.all(Array.from({length:8},()=>concurrent(restore)));
assert.ok(restored.every(value=>value.code===0));
assert.equal(sql('SELECT quantity_available FROM public.flash_sales'),'5');
sql(restore); assert.equal(sql('SELECT quantity_available FROM public.flash_sales'),'5');
// A late paid webhook re-reserves exactly once; paid orders can never be restored.
sql("UPDATE public.orders SET status='confirmed',payment_status='captured' WHERE id='"+flashOrder+"';");
assert.equal(sql('SELECT quantity_available FROM public.flash_sales'),'3');
assert.throws(()=>sql(restore));
assert.equal(sql('SELECT quantity_available FROM public.flash_sales'),'3');
// Race a paid finalization against eight cancellations on a fresh native reservation.
const racingOrder=sql(server+request('abababab-abab-4bab-8bab-abababababab','flash_sale',1));
await Promise.all([
 concurrent("UPDATE public.orders SET status='confirmed',payment_status='captured' WHERE id='"+racingOrder+"';"),
 ...Array.from({length:8},()=>concurrent(server+"SELECT public.restore_order_special_offer_stock('"+racingOrder+"');"))
]);
assert.equal(sql("SELECT payment_status FROM public.orders WHERE id='"+racingOrder+"'"),'captured');
assert.equal(sql('SELECT quantity_available FROM public.flash_sales'),'2');
// Stock sold after restoration cannot be invented by a late paid webhook.
const unavailableOrder=sql(server+request('acacacac-acac-4cac-8cac-acacacacacac','flash_sale',2));
sql(server+"SELECT public.restore_order_special_offer_stock('"+unavailableOrder+"');");
sql(server+request('adadadad-adad-4dad-8dad-adadadadadad','flash_sale',2));
assert.throws(()=>sql("UPDATE public.orders SET status='confirmed',payment_status='captured' WHERE id='"+unavailableOrder+"';"));
assert.equal(sql('SELECT quantity_available FROM public.flash_sales'),'0');
assert.equal(sql("SELECT payment_status FROM public.orders WHERE id='"+unavailableOrder+"'"),'pending');
// A regular native menu item with forged offer metadata did not debit offer stock.
sql("INSERT INTO public.menu_items VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',12,true);");
const forged=request('ffffffff-ffff-4fff-8fff-ffffffffffff','flash_sale',1).replace('"menu_item_id":null','"menu_item_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"');
const normalOrder=sql(server+forged);
sql(server+"SELECT public.restore_order_special_offer_stock('"+normalOrder+"');");
assert.equal(sql('SELECT quantity_available FROM public.flash_sales'),'0');
assert.equal(sql("SELECT count(*) FROM public.order_special_offer_stock_reservations WHERE order_id='"+normalOrder+"'"),'0');
assert.throws(()=>sql("SET ROLE authenticated;DELETE FROM public.order_special_offer_stock_reservations;"));
assert.throws(()=>sql("SET ROLE authenticated;SELECT public.restore_order_special_offer_stock('"+normalOrder+"');"));
console.log('PASS native SQL: competing purchases enforce stock, same-key retries debit once, server prices prevail, eight cancellations restore once, transaction rollback restores nothing, paid orders never restock, late payment re-reserves, forged menu metadata creates no ledger, clients denied. No external payment.');
