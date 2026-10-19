// Disposable PostgreSQL/WASM integration tests. No database URL or production
// connector is accepted. Use an installed @electric-sql/pglite package, or point
// TOK_FLOORPLAN_PGLITE_MODULE at its absolute dist/index.js for an isolated run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.TOK_FLOORPLAN_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const outsider = '22222222-2222-4222-8222-222222222222';
const restaurant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreignRestaurant = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const branch = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const foreignBranch = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const t1 = '00000000-0000-4000-8000-000000000001';
const t2 = '00000000-0000-4000-8000-000000000002';
const t3 = '00000000-0000-4000-8000-000000000003';
const r1 = '10000000-0000-4000-8000-000000000001';
const r2 = '10000000-0000-4000-8000-000000000002';
const foreignReservation = '10000000-0000-4000-8000-000000000003';
const date = '2026-10-19';
const geometry = { x: 10, y: 20, w: 140, h: 90, rotation: 0, kind: 'table', shape: 'rect', seat_labels: [1, 2, 3, 4], extension: { preserved: true } };
let passed = 0;

function extractFunction(file, name, schema = 'public') {
  const text = read(file);
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION ${schema}.${name}(`);
  assert.ok(start >= 0, name);
  const end = text.indexOf('$$;', start);
  assert.ok(end >= start, name);
  return text.slice(start, end + 3);
}

await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE SCHEMA private_finance;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true); $$;
CREATE FUNCTION public.commercial_demo_current_user_is_restricted() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.commercial_demo_restricted', true), '') = 'true';
$$;
CREATE TABLE public.restaurants(id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE public.restaurant_branches(id uuid PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES public.restaurants(id));
CREATE FUNCTION public.auth_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false; $$;
CREATE FUNCTION public.auth_owns_restaurant(p_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id = p_id AND r.owner_id = auth.uid());
$$;
CREATE FUNCTION public.auth_can_access_branch(p_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.restaurant_branches b JOIN public.restaurants r ON r.id = b.restaurant_id WHERE b.id = p_id AND r.owner_id = auth.uid());
$$;
CREATE TABLE public.reservation_tables(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES public.restaurant_branches(id), table_number text NOT NULL, capacity integer NOT NULL, is_active boolean, sector text, layout jsonb);
CREATE UNIQUE INDEX ux_reservation_tables_branch_item_name_ci ON public.reservation_tables(branch_id, lower(btrim(table_number)));
CREATE TABLE public.reservations(id uuid PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES public.restaurants(id), branch_id uuid REFERENCES public.restaurant_branches(id), date date NOT NULL, time time NOT NULL, party_size int NOT NULL, status text, metadata jsonb DEFAULT '{}', updated_at timestamptz DEFAULT now());
ALTER TABLE public.reservations
  ADD COLUMN honored_at timestamptz, ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN attributed_table_revenue_chf numeric, ADD COLUMN billing_fee_chf numeric,
  ADD COLUMN acquisition_source text DEFAULT 'tok_marketplace', ADD COLUMN acquisition_channel_id uuid,
  ADD COLUMN reservation_fee_list_cents_snapshot integer, ADD COLUMN reservation_fee_cap_bps_snapshot integer,
  ADD COLUMN reservation_plan_slug_snapshot text, ADD COLUMN reservation_pricing_version text DEFAULT 'flat_2026_07',
  ADD COLUMN reservation_fee_invoice_id uuid, ADD COLUMN reservation_fee_waiver_reason text,
  ADD COLUMN refunded_amount_chf numeric, ADD COLUMN refund_status text;
CREATE TABLE public.restaurant_subscription_plans(id uuid, slug text, acquired_reservation_fee_cents integer, reservation_revenue_cap_bps integer, pricing_version text);
CREATE TABLE public.restaurant_ai_subscriptions(id uuid, plan text, restaurant_subscription_plan_id uuid, restaurant_id uuid, status text, acquired_reservation_fee_cents_snapshot integer, reservation_revenue_cap_bps_snapshot integer, pricing_version_snapshot text);
CREATE TABLE public.reservation_flat_fee_charges(reservation_id uuid PRIMARY KEY REFERENCES public.reservations(id) ON DELETE CASCADE, restaurant_id uuid, acquisition_source_snapshot text, honored_at_snapshot timestamptz, attributed_revenue_cents_snapshot integer, fee_cents integer);
CREATE TABLE public.reservation_fee_charges(id uuid, reservation_id uuid, fee_cents integer);
CREATE TABLE public.reservation_fee_adjustments(reservation_fee_charge_id uuid, adjustment_cents integer);
CREATE TABLE public.reservation_slots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE, table_id uuid NOT NULL REFERENCES public.reservation_tables(id) ON DELETE CASCADE);
CREATE TABLE public.reservation_table_layout_overrides(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_table_id uuid NOT NULL REFERENCES public.reservation_tables(id) ON DELETE CASCADE, branch_id uuid NOT NULL REFERENCES public.restaurant_branches(id), service_date date NOT NULL, layout jsonb NOT NULL, updated_at timestamptz DEFAULT now(), UNIQUE(reservation_table_id, service_date));
CREATE TABLE public.audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, action text, entity_type text, entity_id uuid, old_data jsonb, new_data jsonb);
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_table_layout_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_flat_fee_charges ENABLE ROW LEVEL SECURITY;
INSERT INTO public.restaurants VALUES('${restaurant}', '${owner}'), ('${foreignRestaurant}', '${outsider}');
INSERT INTO public.restaurant_branches VALUES('${branch}', '${restaurant}'), ('${foreignBranch}', '${foreignRestaurant}');
`);
const replayMigration = read('supabase/migrations/20260715031622_floor_plan_v2_reliability.sql');
await db.exec(replayMigration.slice(0, replayMigration.indexOf('CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_workspace_v2')));
await db.exec(extractFunction('supabase/migrations/20260712090000_floor_plan_v2_editor_rpc.sql', 'restaurant_save_floor_plan_assignments'));
const migration = read('supabase/migrations/20261019090000_floor_plan_workspace_v3.sql');
await db.exec(migration);
await db.exec(migration); // New function definitions and grants are rerunnable.
const seatingMigration = read('supabase/migrations/20261019090100_floor_plan_seating_transition.sql');
await db.exec(seatingMigration);
await db.exec(seatingMigration);
const assignmentMigration = read('supabase/migrations/20261019090200_floor_plan_assignment_activity.sql');
await db.exec(assignmentMigration);
await db.exec(assignmentMigration);

const query = async (sql, values = []) => (await db.query(sql, values)).rows;
async function seed() {
  await db.exec('RESET ROLE; TRUNCATE public.reservation_tables, public.reservations, public.reservation_slots, public.reservation_table_layout_overrides, public.audit_log, private.floor_plan_save_operations CASCADE;');
  for (const [id, name] of [[t1, 'Table 1'], [t2, 'Table 2'], [t3, 'Table 3']]) {
    await query('INSERT INTO public.reservation_tables(id, branch_id, table_number, capacity, is_active, sector, layout) VALUES($1, $2, $3, 4, true, $4, $5)', [id, branch, name, 'Salle', JSON.stringify(geometry)]);
  }
  await db.exec(`
    INSERT INTO public.reservations(id,restaurant_id,branch_id,date,time,party_size,status) VALUES
      ('${r1}','${restaurant}','${branch}','${date}','19:00',2,'confirmed'),
      ('${r2}','${restaurant}','${branch}','${date}','19:00',3,'confirmed'),
      ('${foreignReservation}','${foreignRestaurant}','${foreignBranch}','${date}','19:00',2,'confirmed');
    INSERT INTO public.reservation_slots(reservation_id,table_id) VALUES('${r1}','${t1}'),('${r2}','${t2}');
  `);
}
async function snapshot(mode, assignments) {
  return (await query('SELECT private.floor_plan_workspace_snapshot_v3($1, $2, $3, $4::uuid[]) AS value', [branch, mode, date, Object.keys(assignments)]))[0].value;
}
async function request({ mode = 'template', assignments = {}, upserts = [], layouts = [], deletes = [], id = 'test-request' } = {}) {
  return { mode, assignments, upserts, layouts, deletes, id, expected: await snapshot(mode, assignments) };
}
async function invoke(input, actor = owner, role = 'authenticated') {
  await db.exec(`SET request.jwt.claim.sub = '${actor}'; SET ROLE ${role};`);
  try {
    return (await query(`SELECT public.restaurant_save_floor_plan_workspace_v3(
      $1::uuid,$2::text,$3::date,$4::jsonb,$5::text,$6::jsonb,$7::uuid[],$8::jsonb,$9::jsonb,$10::text
    ) AS value`, [branch, input.mode, date, JSON.stringify(input.expected), input.id,
      JSON.stringify(input.upserts), input.deletes, JSON.stringify(input.layouts), JSON.stringify(input.assignments), 'Synthetic integration test']))[0].value;
  } finally {
    await db.exec('RESET ROLE;');
  }
}
async function seat(reservationId = r1, actor = owner, role = 'authenticated') {
  await db.exec(`SET request.jwt.claim.sub = '${actor}'; SET ROLE ${role};`);
  try {
    return (await query('SELECT * FROM public.restaurant_seat_floor_plan_reservation($1::uuid)', [reservationId]))[0];
  } finally { await db.exec('RESET ROLE;'); }
}
const item = (id, clientId, name, layout = geometry, capacity = 4) => ({
  id, client_id: clientId, table_number: name, capacity, is_active: true, sector: 'Salle', layout,
});
async function state() {
  return (await query(`SELECT jsonb_build_object(
    'tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.reservation_tables t),
    'slots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.reservation_slots s),
    'overrides',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM public.reservation_table_layout_overrides o),
    'reservations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.reservations r),
    'fees',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.reservation_id) FROM public.reservation_flat_fee_charges f),
    'audits',(SELECT count(*) FROM public.audit_log),
    'operations',(SELECT count(*) FROM private.floor_plan_save_operations)
  ) AS value`))[0].value;
}
async function test(name, fn) {
  await seed();
  await fn();
  passed++;
  process.stdout.write(`PASS ${name}\n`);
}

try {
  await test('full inventory + furniture + remapped assignment + idempotent response', async () => {
    const customGeometry = { ...geometry, kind: 'stage', w: 800, h: 450, stage_extension: { lights: 'warm' } };
    const input = await request({ upserts: [item(null, 'new-table', 'New table'), item(null, 'new-stage', 'Stage', customGeometry, 0)], assignments: { [r1]: 'new-table' } });
    const result = await invoke(input);
    assert.equal(result.assignments[r1], result.id_map['new-table']);
    assert.deepEqual((await query('SELECT layout FROM public.reservation_tables WHERE id=$1', [result.id_map['new-stage']]))[0].layout, customGeometry);
    assert.deepEqual(result.snapshot, await snapshot(input.mode, input.assignments), 'returned snapshot must see writes from this transaction');
    const after = await state();
    const replay = await invoke(input);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.id_map, result.id_map);
    assert.deepEqual(await state(), after, 'retry must not create duplicate tables, slots or audits');
    await assert.rejects(invoke({ ...input, assignments: { [r1]: t3 } }), /FLOOR_PLAN_REQUEST_ID_REUSED/);
  });

  await test('failed assignment rolls inventory, reservation writes and audit back', async () => {
    const before = await state();
    const input = await request({ upserts: [item(null, 'too-small', 'Too small', geometry, 1)], assignments: { [r1]: 'too-small' } });
    await assert.rejects(invoke(input), /capacity is too low/);
    assert.deepEqual(await state(), before);
  });

  await test('daily furniture layout and assignment share one transaction', async () => {
    await query('UPDATE public.reservation_tables SET capacity=0,layout=$1 WHERE id=$2', [JSON.stringify({ ...geometry, kind: 'booth' }), t3]);
    const moved = { ...geometry, kind: 'booth', x: 400, service_extension: true };
    const before = await state();
    const failed = await request({ mode: 'service', layouts: [{ table_id: t3, layout: moved }], assignments: { [r1]: t2 } });
    await assert.rejects(invoke(failed), /Table already occupied/);
    assert.deepEqual(await state(), before);
    const input = await request({ mode: 'service', layouts: [{ table_id: t3, layout: moved }], assignments: { [r1]: t2, [r2]: t1 } });
    const result = await invoke(input);
    assert.deepEqual(result.snapshot.overrides, [{ reservation_table_id: t3, layout: moved }]);
    assert.deepEqual(result.assignments, { [r1]: t2, [r2]: t1 });
  });

  await test('stale room revision is rejected without losing either revision', async () => {
    const input = await request({ assignments: { [r1]: t3 } });
    await db.exec(`UPDATE public.reservation_tables SET table_number='Changed by colleague' WHERE id='${t3}';`);
    const before = await state();
    await assert.rejects(invoke(input), /FLOOR_PLAN_REVISION_CONFLICT/);
    assert.deepEqual(await state(), before);
  });

  await test('an unrelated colleague assignment is preserved while a delta succeeds', async () => {
    const input = await request({ mode: 'service', assignments: { [r1]: t2 } });
    await db.exec(`UPDATE public.reservation_slots SET table_id='${t3}' WHERE reservation_id='${r2}';`);
    await invoke(input);
    assert.equal((await query('SELECT table_id FROM public.reservation_slots WHERE reservation_id=$1', [r2]))[0].table_id, t3);
    assert.equal((await query('SELECT table_id FROM public.reservation_slots WHERE reservation_id=$1', [r1]))[0].table_id, t2);
  });

  await test('a concurrent change to the same reservation blocks a stale placement', async () => {
    const input = await request({ mode: 'service', assignments: { [r1]: null } });
    await db.exec(`UPDATE public.reservation_slots SET table_id='${t3}' WHERE reservation_id='${r1}';`);
    const before = await state();
    await assert.rejects(invoke(input), /FLOOR_PLAN_REVISION_CONFLICT/);
    assert.deepEqual(await state(), before);
  });

  await test('cancelled reservations and non-reservable furniture cannot be assigned', async () => {
    await db.exec(`UPDATE public.reservations SET status='cancelled' WHERE id='${r1}';`);
    await assert.rejects(invoke(await request({ assignments: { [r1]: t3 } })), /FLOOR_PLAN_RESERVATION_INACTIVE/);
    await db.exec(`UPDATE public.reservations SET status='confirmed' WHERE id='${r1}';`);
    await query('UPDATE public.reservation_tables SET layout=$1 WHERE id=$2', [JSON.stringify({ ...geometry, kind: 'chair' }), t3]);
    await assert.rejects(invoke(await request({ assignments: { [r1]: t3 } })), /reservable table/);
  });

  await test('ownership and execute grants prevent cross-restaurant or anonymous writes', async () => {
    const input = await request();
    await assert.rejects(invoke(input, outsider), /Not allowed/);
    await assert.rejects(invoke(input, ''), /Authentication required/);
    await assert.rejects(invoke(input, owner, 'anon'), /permission denied/);
    await assert.rejects(invoke(await request({ assignments: { [foreignReservation]: t1 } })), /does not belong to this service/);
    await db.exec('SET ROLE authenticated;');
    try {
      await assert.rejects(query('SELECT private.floor_plan_workspace_snapshot_v3($1,$2,$3,$4::uuid[])', [branch, 'template', date, []]), /permission denied/);
    } finally { await db.exec('RESET ROLE;'); }
  });

  await test('midnight overlaps are rejected by the assignment writer and preserve the workspace', async () => {
    await db.exec(`UPDATE public.reservations SET date='2026-10-18',time='23:30' WHERE id='${r1}'; UPDATE public.reservations SET time='00:30' WHERE id='${r2}';`);
    const before = await state();
    await assert.rejects(invoke(await request({ assignments: { [r2]: t1 } })), /FLOOR_PLAN_TABLE_OCCUPIED|Table already occupied/);
    assert.deepEqual(await state(), before);
  });

  await test('capacity reduction and occupied deletion preserve the previous inventory', async () => {
    const before = await state();
    await assert.rejects(invoke(await request({ upserts: [item(t1, t1, 'Renamed', geometry, 1)] })), /FLOOR_PLAN_TABLE_IN_USE/);
    assert.deepEqual(await state(), before);
    await assert.rejects(invoke(await request({ deletes: [t1] })), /FLOOR_PLAN_TABLE_IN_USE/);
    assert.deepEqual(await state(), before);
    const result = await invoke(await request({ deletes: [t1], assignments: { [r1]: t3 } }));
    assert.equal(result.snapshot.tables.length, 2);
    assert.equal(result.assignments[r1], t3);
  });

  await test('table names can be swapped atomically without disabling the unique index', async () => {
    const result = await invoke(await request({ upserts: [item(t1, t1, 'Table 2'), item(t2, t2, 'Table 1')] }));
    assert.equal(result.snapshot.tables.find((table) => table.id === t1).table_number, 'Table 2');
    assert.equal(result.snapshot.tables.find((table) => table.id === t2).table_number, 'Table 1');
  });

  await test('unknown geometry enums are rejected while extension properties remain supported', async () => {
    const before = await state();
    await assert.rejects(invoke(await request({ upserts: [item(null, 'unknown', 'Unknown', { ...geometry, kind: 'unknown-kind' }, 0)] })), /Invalid floor plan item geometry/);
    await assert.rejects(invoke(await request({ upserts: [item(null, 'unknown', 'Unknown', { ...geometry, shape: 'square' })] })), /Invalid floor plan item geometry/);
    assert.deepEqual(await state(), before);
  });

  await test('legacy terminal aliases neither occupy a table nor lose their historical placement', async () => {
    for (const terminal of ['no-show', ' NO_SHOW ', 'expired', 'declined']) {
      await seed();
      await query('UPDATE public.reservations SET status=$1 WHERE id=$2', [terminal, r2]);
      const oldSlot = (await query('SELECT * FROM public.reservation_slots WHERE reservation_id=$1', [r2]))[0];
      await invoke(await request({ assignments: { [r1]: t2 } }));
      assert.deepEqual((await query('SELECT * FROM public.reservation_slots WHERE reservation_id=$1', [r2]))[0], oldSlot);
      const before = await state();
      await assert.rejects(invoke(await request({ id: 'terminal-placement', assignments: { [r2]: t3 } })), /FLOOR_PLAN_RESERVATION_INACTIVE/);
      assert.deepEqual(await state(), before);
    }
  });

  // Load the actual current arrival fee and immutable finance snapshot guards.
  // Seating is exercised with these production SQL bodies active, not a mock
  // that merely assumes finance is unchanged.
  await db.exec(extractFunction('supabase/migrations/20260729160000_flat_fee_on_arrival_and_auto_arrival.sql', 'is_flat_arrival_billing_candidate'));
  await db.exec(extractFunction('supabase/migrations/20260729170000_remove_mon_pack_and_fair_growth_modules.sql', 'apply_flat_reservation_fee_on_arrival', 'private_finance'));
  await db.exec(extractFunction('supabase/migrations/20260718022910_fair_growth_business_model.sql', 'set_reservation_fair_growth_snapshot', 'private_finance'));
  await db.exec(`CREATE TRIGGER apply_flat_reservation_fee_on_arrival BEFORE UPDATE OF status ON public.reservations FOR EACH ROW EXECUTE FUNCTION private_finance.apply_flat_reservation_fee_on_arrival();
    CREATE TRIGGER set_reservation_fair_growth_snapshot BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION private_finance.set_reservation_fair_growth_snapshot();`);

  await test('arrived with an already sealed fee can be seated without a second honoring or fee', async () => {
    await db.exec(`UPDATE public.reservations SET status='arrived' WHERE id='${r1}';`);
    const before = (await query('SELECT honored_at, billing_fee_chf, attributed_table_revenue_chf FROM public.reservations WHERE id=$1', [r1]))[0];
    assert.ok(before.honored_at);
    assert.equal(Number(before.billing_fee_chf), 5);
    assert.equal((await query('SELECT count(*)::int AS count FROM public.reservation_flat_fee_charges'))[0].count, 1);
    assert.deepEqual(await seat(), { updated: true, error_code: null, error_message: null });
    assert.deepEqual((await query('SELECT honored_at, billing_fee_chf, attributed_table_revenue_chf FROM public.reservations WHERE id=$1', [r1]))[0], before);
    assert.equal((await query('SELECT status FROM public.reservations WHERE id=$1', [r1]))[0].status, 'seated');
    assert.equal((await query('SELECT count(*)::int AS count FROM public.reservation_flat_fee_charges'))[0].count, 1);
    const after = await state();
    assert.equal((await seat()).updated, true);
    assert.deepEqual(await state(), after, 'repeated seating must not duplicate its audit or fee');
  });

  await test('seating requires arrival, saved placement, an active table and sufficient capacity', async () => {
    assert.equal((await seat()).error_code, 'invalid_status_transition');
    await db.exec(`UPDATE public.reservations SET status='arrived' WHERE id='${r1}'; DELETE FROM public.reservation_slots WHERE reservation_id='${r1}';`);
    assert.equal((await seat()).error_code, 'not_placed');
    await db.exec(`INSERT INTO public.reservation_slots(reservation_id,table_id) VALUES('${r1}','${t1}'); UPDATE public.reservation_tables SET is_active=false WHERE id='${t1}';`);
    assert.equal((await seat()).error_code, 'invalid_table');
    await db.exec(`UPDATE public.reservation_tables SET is_active=true,capacity=1 WHERE id='${t1}';`);
    assert.equal((await seat()).error_code, 'insufficient_capacity');
    assert.equal((await query('SELECT status FROM public.reservations WHERE id=$1', [r1]))[0].status, 'arrived');
    assert.equal((await query('SELECT count(*)::int AS count FROM public.reservation_flat_fee_charges'))[0].count, 1);
  });

  await test('an auto-placed arrival with a null reservation branch can be seated through its saved table', async () => {
    await db.exec(`UPDATE public.reservations SET branch_id=NULL,status='arrived' WHERE id='${r1}';`);
    const before = (await query('SELECT honored_at, billing_fee_chf, attributed_table_revenue_chf FROM public.reservations WHERE id=$1', [r1]))[0];
    assert.ok(before.honored_at);
    assert.equal((await seat()).updated, true);
    assert.deepEqual((await query('SELECT honored_at, billing_fee_chf, attributed_table_revenue_chf FROM public.reservations WHERE id=$1', [r1]))[0], before);
    assert.deepEqual((await query('SELECT status,branch_id FROM public.reservations WHERE id=$1', [r1]))[0], { status: 'seated', branch_id: null });
    assert.equal((await query('SELECT count(*)::int AS count FROM public.reservation_flat_fee_charges'))[0].count, 1);
  });

  await test('a null-branch reservation cannot use an unrelated establishment to obtain seating permission', async () => {
    await db.exec(`UPDATE public.reservations SET branch_id=NULL,status='arrived' WHERE id='${r1}'; UPDATE public.reservation_tables SET branch_id='${foreignBranch}' WHERE id='${t1}';`);
    const before = await state();
    assert.equal((await seat()).error_code, 'forbidden');
    assert.deepEqual(await state(), before);
  });

  await test('seating rolls back if a noncanonical legacy arrival would change the fee snapshot', async () => {
    await db.exec(`UPDATE public.reservations SET status=' Arrived ' WHERE id='${r1}';`);
    const before = await state();
    await assert.rejects(seat(), /FLOOR_PLAN_SEATING_FINANCE_CHANGED/);
    assert.deepEqual(await state(), before);
  });

  await test('seating enforces ownership, authentication, anon grants and commercial demo isolation', async () => {
    const before = await state();
    assert.equal((await seat(r1, outsider)).error_code, 'forbidden');
    assert.equal((await seat(r1, '')).error_code, 'unauthorized');
    assert.equal((await seat(foreignReservation)).error_code, 'forbidden');
    await assert.rejects(seat(r1, owner, 'anon'), /permission denied/);
    await db.exec("SET test.commercial_demo_restricted='true';");
    try {
      await assert.rejects(seat(), /COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED/);
      await assert.rejects(invoke(await request()), /COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED/);
    } finally { await db.exec("SET test.commercial_demo_restricted='false';"); }
    assert.deepEqual(await state(), before);
  });

  await test('the assignment RPC directly refuses a restricted demo owner before any write', async () => {
    const before = await state();
    await db.exec(`SET test.commercial_demo_restricted='true'; SET request.jwt.claim.sub='${owner}'; SET ROLE authenticated;`);
    try {
      await assert.rejects(query('SELECT public.restaurant_save_floor_plan_assignments($1::uuid,$2::jsonb,$3::text)',
        [branch, JSON.stringify({ [r1]: t3 }), 'Direct synthetic demo call']), /COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED/);
    } finally {
      await db.exec("RESET ROLE; SET test.commercial_demo_restricted='false';");
    }
    assert.deepEqual(await state(), before);
  });

  process.stdout.write(`Verified ${passed} PostgreSQL workspace scenarios in a fresh disposable WASM database. No remote data used.\n`);
} finally {
  await db.close();
}
