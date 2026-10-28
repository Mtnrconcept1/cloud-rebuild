import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Supplied by the verification environment; never a production dependency.
const { PGlite } = await import(process.env.TOK_PGLITE_MODULE || '@electric-sql/pglite');
const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const base = read('supabase/migrations/20260801190000_marketing_operations_center.sql');
const autopilot = read('supabase/migrations/20261003070000_marketing_autopilot_foundation.sql');
const ai = read('supabase/migrations/20260802230000_marketing_ai_agent.sql');
const analytics = read('supabase/migrations/20261022000000_marketing_analytics_evidence.sql');
const conversions = read('supabase/migrations/20260729090000_campaign_tracking_and_reservation_fee_integrity.sql');
const internalActor = read('supabase/migrations/20260531163600_actualites_internal_actor_helper.sql');
const migration = read('supabase/migrations/20261027220000_marketing_first_touch_attribution.sql');

function block(source, marker, terminator) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing source marker: ${marker}`);
  assert.equal(source.indexOf(marker, start + marker.length), -1, `Ambiguous marker: ${marker}`);
  const end = source.indexOf(terminator, start);
  assert.ok(end >= 0, `Missing terminator: ${marker}`);
  return source.slice(start, end + terminator.length);
}
const fn = (source, name, quote = '$$') => block(source, `CREATE OR REPLACE FUNCTION public.${name}(`, `\n${quote};`);
const table = (source, name) => block(source, `CREATE TABLE IF NOT EXISTS public.${name} (`, '\n);');
const tables = [
  'marketing_campaigns', 'marketing_integrations', 'marketing_automations',
  'marketing_calendar_items', 'marketing_contacts', 'marketing_deliveries',
  'marketing_events', 'marketing_admin_web_sessions',
];

const ADMIN = '11111111-1111-4111-8111-111111111111';
const VISITOR = '22222222-2222-4222-8222-222222222222';
const FORGED = '33333333-3333-4333-8333-333333333333';
const BIO = '44444444-4444-4444-8444-444444444444';
const CUSTOMER = '55555555-5555-4555-8555-555555555555';
const LATE = '66666666-6666-4666-8666-666666666666';
const OWNER = '77777777-7777-4777-8777-777777777777';
const RESTAURANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAMPAIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PUBLISHED_ITEM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DRAFT_ITEM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const db = new PGlite();
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const asService = async (sql, params) => {
  await db.exec(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  try {
    return await one(sql, params);
  } finally {
    await db.exec(`SELECT set_config('request.jwt.claims', '', false)`);
  }
};
const bind = (userId, touch) => asService(
  `SELECT public.service_record_marketing_acquisition_touch($1::uuid, $2::jsonb, 'cookies-2026-07-v3') AS result`,
  [userId, JSON.stringify(touch)],
).then((row) => row.result);
const facts = async (filter = '') => (await db.query(`
  SELECT source_fact_id, fact_type, campaign_id, utm_plan_id, value_minor, currency, subject_hash, metadata
  FROM public.marketing_attribution_facts ${filter} ORDER BY source_fact_id`)).rows;
const iso = (offsetMinutes = 0) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();

try {
  // Identity and transactional tables are reduced to the columns the
  // producer reads. Marketing tables, helpers and the dashboard are real SQL.
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (auth.jwt() ->> 'sub')::uuid;
    $$;
    CREATE TABLE public.user_roles (user_id uuid REFERENCES auth.users(id), role text, PRIMARY KEY(user_id, role));
    CREATE FUNCTION public.has_role(_user_id uuid, _role text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id AND r.role = _role);
    $$;
    CREATE TABLE public.feature_flags (name text PRIMARY KEY, label text, is_active boolean);
    CREATE TABLE public.notification_campaigns (id uuid PRIMARY KEY);
    CREATE TABLE public.social_posts (id uuid PRIMARY KEY);
    CREATE TABLE public.ad_campaigns (id uuid PRIMARY KEY);
    CREATE TABLE public.audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, action text,
      entity_type text, entity_id uuid, old_data jsonb, new_data jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.restaurants (id uuid PRIMARY KEY, owner_id uuid);
    CREATE TABLE public.reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, restaurant_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'pending', acquisition_source text NOT NULL DEFAULT 'tok_marketplace',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, restaurant_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'pending', payment_status text, total_amount numeric NOT NULL DEFAULT 0,
      currency text, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.signup_applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, requested_role text NOT NULL,
      submitted_at timestamptz NOT NULL DEFAULT now()
    );
    GRANT INSERT, UPDATE, SELECT ON public.reservations, public.orders, public.signup_applications TO service_role;
  `);
  for (const name of ['marketing_actor_user_id', 'marketing_normalize_swiss_phone']) await db.exec(fn(base, name));
  for (const name of tables) await db.exec(table(base, name));
  await db.exec(table(ai, 'marketing_ai_runs'));
  for (const name of [
    'marketing_require_service_role', 'service_get_marketing_web_session',
    'marketing_require_admin', 'marketing_runtime_enabled', 'marketing_touch_version',
    'marketing_write_audit', 'marketing_log_delivery_transition', 'marketing_events_append_only',
    'marketing_delivery_status_rank', 'record_marketing_provider_event',
  ]) await db.exec(fn(base, name));
  for (const name of tables) {
    await db.exec(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE public.${name} FROM PUBLIC, anon, authenticated, service_role;`);
  }
  await db.exec(autopilot);
  await db.exec(analytics);
  await db.exec(fn(conversions, 'ad_campaign_conversion_entity_state', '$function$'));
  await db.exec(block(internalActor, 'CREATE OR REPLACE FUNCTION public.is_restaurant_internal_actor(', '\n$$;'));
  await db.exec(migration);
  await db.exec(migration);

  // ---------------------------------------------------------------- access
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const { allowed } = await one(`SELECT has_table_privilege('${role}', 'public.marketing_acquisition_touches', 'SELECT') AS allowed`);
    assert.equal(allowed, false, `${role} must not read touches directly`);
    for (const signature of [
      'public.marketing_record_first_touch_facts(uuid,text,uuid)',
      'public.marketing_first_touch_conversion_trigger()',
    ]) {
      const { allowed: internal } = await one(`SELECT has_function_privilege('${role}', '${signature}', 'EXECUTE') AS allowed`);
      assert.equal(internal, false, `${role} must not execute ${signature}`);
    }
  }
  for (const signature of [
    'public.service_record_marketing_acquisition_touch(uuid,jsonb,text)',
    'public.service_forget_marketing_acquisition_touch(uuid)',
  ]) {
    for (const role of ['anon', 'authenticated']) {
      const { allowed } = await one(`SELECT has_function_privilege('${role}', '${signature}', 'EXECUTE') AS allowed`);
      assert.equal(allowed, false, `${role} must not execute ${signature}`);
    }
    const { allowed, definer, config } = await one(`
      SELECT has_function_privilege('service_role', '${signature}', 'EXECUTE') AS allowed,
        prosecdef AS definer, proconfig AS config FROM pg_proc WHERE oid = '${signature}'::regprocedure`);
    assert.equal(allowed, true);
    assert.equal(definer, true);
    assert.ok(config.includes('search_path=""'));
  }
  await assert.rejects(
    db.query(`SELECT public.service_record_marketing_acquisition_touch('${VISITOR}', '{}'::jsonb, 'cookies-2026-07-v3')`),
    /Service role required/,
  );
  console.log('PASS first-touch: touches deny direct roles; only service_role binds through definer functions');

  // ----------------------------------------------------------------- setup
  await db.exec(`
    INSERT INTO auth.users(id, email, created_at) VALUES
      ('${ADMIN}', 'admin@example.invalid', now() - interval '1 year'),
      ('${OWNER}', 'owner@example.invalid', now() - interval '1 year'),
      ('${CUSTOMER}', 'customer@example.invalid', now() - interval '30 days');
    INSERT INTO public.restaurants(id, owner_id) VALUES ('${RESTAURANT}', '${OWNER}');
    INSERT INTO public.marketing_campaigns(id, name, status, approved_at)
      VALUES ('${CAMPAIGN}', 'Guide Carouge terrasses', 'active', now() - interval '2 days');
    INSERT INTO public.marketing_calendar_items(id, campaign_id, title, channel, scheduled_at, status,
        approval_status, provider_external_id, published_at)
      VALUES ('${PUBLISHED_ITEM}', '${CAMPAIGN}', 'Guide', 'instagram', now() - interval '1 day', 'published',
        'approved', '17890000000000001', now() - interval '1 day'),
      ('${DRAFT_ITEM}', '${CAMPAIGN}', 'Brouillon', 'instagram', now() + interval '1 day', 'draft',
        'pending', NULL, NULL);
    INSERT INTO public.marketing_utm_plans(campaign_id, channel, utm_source, utm_medium, utm_campaign)
      VALUES ('${CAMPAIGN}', 'instagram', 'instagram', 'bio', 'guide_carouge-terrasses_202610');
  `);
  const metaTouch = {
    utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'guide-carouge-terrasses_202610',
    utm_content: PUBLISHED_ITEM, referrer_host: 'l.instagram.com', landing_path: '/zero-attente',
    touched_at: iso(-3),
  };

  // ------------------------------------------- anonymous visit, then sign-up
  await db.exec(`INSERT INTO auth.users(id, email) VALUES ('${VISITOR}', 'visitor@example.invalid')`);
  let result = await bind(VISITOR, metaTouch);
  assert.equal(result.recorded, true);
  let touch = await one(`SELECT * FROM public.marketing_acquisition_touches WHERE user_id = $1`, [VISITOR]);
  assert.equal(touch.utm_source, 'instagram');
  assert.equal(touch.referrer_host, 'l.instagram.com');
  assert.equal(touch.landing_path, '/zero-attente');
  assert.equal(touch.campaign_id, CAMPAIGN);
  assert.equal(touch.calendar_item_id, PUBLISHED_ITEM);
  let rows = await facts(`WHERE source_fact_id = 'lead:account:${VISITOR}'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fact_type, 'lead');
  assert.equal(rows[0].campaign_id, CAMPAIGN);
  assert.match(rows[0].subject_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(rows[0].metadata).includes(VISITOR), 'facts never carry the account id');
  assert.equal(rows[0].metadata.utm_content, PUBLISHED_ITEM);
  result = await bind(VISITOR, { ...metaTouch, utm_source: 'facebook', touched_at: iso(-1) });
  assert.equal(result.recorded, false);
  assert.equal(result.reason, 'first_touch_already_recorded');
  touch = await one(`SELECT utm_source FROM public.marketing_acquisition_touches WHERE user_id = $1`, [VISITOR]);
  assert.equal(touch.utm_source, 'instagram');
  assert.equal((await facts(`WHERE fact_type = 'lead'`)).length, 1);
  console.log('PASS first-touch: anonymous UTM visit bound after sign-up gives one lead; later touches never replace it');

  // ------------------------------------------------------------ reservation
  await db.exec(`SET ROLE service_role`);
  const { id: reservationId } = await one(
    `INSERT INTO public.reservations(user_id, restaurant_id) VALUES ($1, $2) RETURNING id`, [VISITOR, RESTAURANT],
  );
  await db.exec(`RESET ROLE`);
  assert.equal((await facts(`WHERE fact_type = 'conversion'`)).length, 0, 'a pending reservation is not a conversion');
  await db.exec(`SET ROLE service_role`);
  await db.query(`UPDATE public.reservations SET status = 'confirmed' WHERE id = $1`, [reservationId]);
  await db.query(`UPDATE public.reservations SET status = 'confirmed' WHERE id = $1`, [reservationId]);
  await db.exec(`RESET ROLE`);
  rows = await facts(`WHERE source_fact_id = 'conversion:reservation:${reservationId}'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.subject_type, 'reservation');
  assert.equal(rows[0].metadata.utm_source, 'instagram');
  await db.exec(`
    INSERT INTO public.reservations(user_id, restaurant_id, status, acquisition_source)
      VALUES ('${VISITOR}', '${RESTAURANT}', 'confirmed', 'customer_file');
    INSERT INTO public.reservations(user_id, restaurant_id, status, created_at)
      VALUES ('${VISITOR}', '${RESTAURANT}', 'confirmed', now() - interval '1 day');
  `);
  assert.equal((await facts(`WHERE fact_type = 'conversion'`)).length, 1,
    'restaurant-entered and pre-touch reservations are not attributed');
  console.log('PASS first-touch: a confirmed reservation shows its source server-side once, through a non-owner role');

  // ------------------------------------------------------------------ order
  const { id: orderId } = await one(`
    INSERT INTO public.orders(user_id, restaurant_id, status, payment_status, total_amount)
    VALUES ($1, $2, 'pending', 'requires_payment', 42.5) RETURNING id`, [VISITOR, RESTAURANT]);
  assert.equal((await facts(`WHERE source_fact_id LIKE '%order%'`)).length, 0, 'an unpaid order is not a conversion');
  await db.query(`UPDATE public.orders SET status = 'confirmed', payment_status = 'paid' WHERE id = $1`, [orderId]);
  await db.query(`UPDATE public.orders SET status = 'preparing' WHERE id = $1`, [orderId]);
  rows = await facts(`WHERE source_fact_id LIKE '%:order:${orderId}'`);
  assert.deepEqual(rows.map((row) => row.fact_type), ['conversion', 'revenue']);
  assert.equal(Number(rows[1].value_minor), 4250);
  assert.equal(rows[1].currency, 'CHF');
  assert.equal(rows[1].metadata.revenue_basis, 'order_total_amount');
  const { id: ownerOrder } = await one(`
    INSERT INTO public.orders(user_id, restaurant_id, status, payment_status, total_amount)
    VALUES ($1, $2, 'confirmed', 'paid', 10) RETURNING id`, [OWNER, RESTAURANT]);
  await bind(OWNER, { ...metaTouch, touched_at: iso(-2) });
  assert.equal((await facts(`WHERE source_fact_id LIKE '%:order:${ownerOrder}'`)).length, 0,
    'restaurant staff ordering in their own restaurant are not acquisitions');
  console.log('PASS first-touch: a paid order adds conversion and server-side revenue once, in minor units');

  // ---------------------------------------------------------- application
  const { id: applicationId } = await one(`
    INSERT INTO public.signup_applications(user_id, requested_role) VALUES ($1, 'restaurateur') RETURNING id`, [VISITOR]);
  rows = await facts(`WHERE source_fact_id = 'conversion:signup_application:${applicationId}'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.requested_role, 'restaurateur');
  console.log('PASS first-touch: a partner application is a conversion of the identified campaign');

  // ------------------------------------------------ untrusted campaign hints
  await db.exec(`INSERT INTO auth.users(id, email) VALUES ('${FORGED}', 'forged@example.invalid')`);
  result = await bind(FORGED, { ...metaTouch, utm_content: DRAFT_ITEM, campaign_id: CAMPAIGN });
  assert.equal(result.recorded, true);
  touch = await one(`SELECT campaign_id, utm_source FROM public.marketing_acquisition_touches WHERE user_id = $1`, [FORGED]);
  assert.equal(touch.campaign_id, null, 'an unpublished item or browser campaign id never identifies a campaign');
  assert.equal(touch.utm_source, 'instagram', 'the source remains visible server-side');
  await db.exec(`INSERT INTO public.reservations(user_id, restaurant_id, status) VALUES ('${FORGED}', '${RESTAURANT}', 'confirmed')`);
  assert.equal((await facts(`WHERE subject_hash = encode(sha256(convert_to('tok-first-touch:${FORGED}', 'UTF8')), 'hex')`)).length, 0);

  await db.exec(`INSERT INTO auth.users(id, email) VALUES ('${BIO}', 'bio@example.invalid')`);
  await bind(BIO, { utm_source: 'Instagram', utm_medium: 'bio', utm_campaign: 'guide_carouge-terrasses_202610', touched_at: iso(-1) });
  rows = await facts(`WHERE source_fact_id = 'lead:account:${BIO}'`);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].utm_plan_id, 'a marketing UTM plan identifies the campaign of a bio link');

  for (const [touchInput, reason] of [
    [{ utm_source: 'Instagram Ads', touched_at: iso(-1) }, 'touch_source_missing'],
    [{ utm_source: 'instagram', touched_at: iso(60) }, 'touch_time_invalid'],
    [{ utm_source: 'instagram', touched_at: new Date(Date.now() - 91 * 86_400_000).toISOString() }, 'touch_time_invalid'],
    [{ referrer_host: 'https://evil.example/path?q=1', touched_at: iso(-1) }, 'touch_source_missing'],
  ]) {
    await db.exec(`DELETE FROM public.marketing_acquisition_touches WHERE user_id = '${CUSTOMER}'`);
    result = await bind(CUSTOMER, touchInput);
    assert.equal(result.recorded, false);
    assert.equal(result.reason, reason);
  }
  await bind(CUSTOMER, { ...metaTouch, landing_path: '/zero-attente?email=a@b.ch', touched_at: iso(-1) });
  touch = await one(`SELECT landing_path FROM public.marketing_acquisition_touches WHERE user_id = $1`, [CUSTOMER]);
  assert.equal(touch.landing_path, null, 'a landing path with a query string is never stored');
  assert.equal((await facts(`WHERE source_fact_id = 'lead:account:${CUSTOMER}'`)).length, 0,
    'an account older than the touch is not a lead');
  console.log('PASS first-touch: campaigns come from published items or UTM plans; invalid touches and personal data are refused');

  // --------------------------------- conversion before binding, then binding
  await db.exec(`
    INSERT INTO auth.users(id, email) VALUES ('${LATE}', 'late@example.invalid');
    INSERT INTO public.reservations(user_id, restaurant_id, status) VALUES ('${LATE}', '${RESTAURANT}', 'confirmed');
  `);
  await bind(LATE, { ...metaTouch, touched_at: iso(-2) });
  assert.equal((await facts(`WHERE source_fact_id LIKE 'conversion:reservation:%' AND metadata->>'utm_source' = 'instagram'`)).length, 2);
  console.log('PASS first-touch: binding after a conversion reconciles it idempotently');

  // ---------------------------------------- attribution never blocks a sale
  await db.exec(`
    ALTER FUNCTION public.ad_campaign_conversion_entity_state(text, uuid, uuid, uuid) RENAME TO ad_campaign_conversion_entity_state_saved;
    CREATE FUNCTION public.ad_campaign_conversion_entity_state(text, uuid, uuid, uuid) RETURNS text
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated attribution failure'; END; $$;
  `);
  const before = (await facts()).length;
  await db.exec(`INSERT INTO public.reservations(user_id, restaurant_id, status) VALUES ('${VISITOR}', '${RESTAURANT}', 'confirmed')`);
  assert.equal(Number((await one(`SELECT count(*) AS n FROM public.reservations WHERE user_id = '${VISITOR}'`)).n), 4);
  assert.equal((await facts()).length, before);
  await db.exec(`
    DROP FUNCTION public.ad_campaign_conversion_entity_state(text, uuid, uuid, uuid);
    ALTER FUNCTION public.ad_campaign_conversion_entity_state_saved(text, uuid, uuid, uuid) RENAME TO ad_campaign_conversion_entity_state;
  `);
  console.log('PASS first-touch: an attribution failure is skipped and the reservation is still committed');

  // ------------------------------------------------------ analytics contract
  await db.exec(`
    INSERT INTO public.user_roles(user_id, role) VALUES ('${ADMIN}', 'admin');
    INSERT INTO public.feature_flags(name, label, is_active) VALUES ('admin-marketing-operations', 'First touch', true);
    INSERT INTO public.marketing_admin_web_sessions(sid_hash, csrf_hash, user_id, mfa_verified_at, expires_at)
      VALUES (repeat('a',64), repeat('b',64), '${ADMIN}', now(), now() + interval '1 hour');
  `);
  const { snapshot } = await asService(`SELECT public.service_execute_marketing_autopilot_operation(
    repeat('a',64), repeat('b',64), 'admin_get_marketing_autopilot_dashboard',
    jsonb_build_object('p_from', now() - interval '1 day', 'p_to', now() + interval '1 day')) AS snapshot`);
  const metric = (key) => snapshot.analytics.metrics.find((entry) => entry.key === key);
  assert.ok(metric('leads').value >= 1, 'Analytics shows a non-null attributed lead');
  assert.ok(metric('business_conversions').value >= 3);
  assert.equal(Number(metric('revenue').value), 42.5);
  assert.equal(metric('revenue').unit, 'CHF');
  console.log(`PASS first-touch: Analytics reads ${metric('leads').value} leads, ${metric('business_conversions').value} conversions, CHF ${metric('revenue').value}`);

  // ------------------------------------------------- withdrawal and erasure
  const factCount = (await facts()).length;
  assert.equal((await asService(`SELECT public.service_forget_marketing_acquisition_touch($1::uuid) AS forgotten`, [VISITOR])).forgotten, true);
  assert.equal(await one(`SELECT 1 AS present FROM public.marketing_acquisition_touches WHERE user_id = $1`, [VISITOR]), undefined);
  await db.exec(`INSERT INTO public.reservations(user_id, restaurant_id, status) VALUES ('${VISITOR}', '${RESTAURANT}', 'confirmed')`);
  assert.equal((await facts()).length, factCount, 'no attribution after consent withdrawal');
  await db.exec(`DELETE FROM auth.users WHERE id = '${BIO}'`);
  assert.equal(await one(`SELECT 1 AS present FROM public.marketing_acquisition_touches WHERE user_id = $1`, [BIO]), undefined);
  await assert.rejects(db.query(`DELETE FROM public.marketing_attribution_facts`), /append-only/);
  console.log('PASS first-touch: withdrawal and account deletion erase the touch; pseudonymous facts stay append-only');

  const { version } = await one('SELECT version() AS version');
  console.log(`PASS first-touch: migration replayed twice; ${version}`);
  console.log('Scope: disposable PGlite marketing backend with reduced transactional tables, not a full Supabase replay or production test.');
} finally {
  await db.close();
}
