import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Supplied by the verification environment; never a production dependency.
const { PGlite } = await import(process.env.TOK_PGLITE_MODULE || '@electric-sql/pglite');
const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const base = read('supabase/migrations/20260801190000_marketing_operations_center.sql');
const autopilot = read('supabase/migrations/20261003070000_marketing_autopilot_foundation.sql');
const ai = read('supabase/migrations/20260802230000_marketing_ai_agent.sql');
const migration = read('supabase/migrations/20261022000000_marketing_analytics_evidence.sql');

function block(source, marker, terminator) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing source marker: ${marker}`);
  assert.equal(source.indexOf(marker, start + marker.length), -1, `Ambiguous marker: ${marker}`);
  const end = source.indexOf(terminator, start);
  assert.ok(end >= 0, `Missing terminator: ${marker}`);
  return source.slice(start, end + terminator.length);
}
const fn = (source, name) => block(source, `CREATE OR REPLACE FUNCTION public.${name}(`, '\n$$;');
const table = (source, name) => block(source, `CREATE TABLE IF NOT EXISTS public.${name} (`, '\n);');
const tables = [
  'marketing_campaigns', 'marketing_integrations', 'marketing_automations',
  'marketing_calendar_items', 'marketing_contacts', 'marketing_deliveries',
  'marketing_events', 'marketing_admin_web_sessions',
];
const db = new PGlite();
try {
  // Only identity infrastructure and unrelated FK targets are stubbed.
  // Marketing tables, session checks, triggers, dispatcher and RPC are real SQL.
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (auth.jwt() ->> 'sub')::uuid;
    $$;
    CREATE TABLE public.user_roles (user_id uuid REFERENCES auth.users(id), role text, PRIMARY KEY(user_id, role));
    CREATE TABLE public.feature_flags (name text PRIMARY KEY, label text, is_active boolean);
    CREATE TABLE public.notification_campaigns (id uuid PRIMARY KEY);
    CREATE TABLE public.social_posts (id uuid PRIMARY KEY);
    CREATE TABLE public.ad_campaigns (id uuid PRIMARY KEY);
    CREATE TABLE public.audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, action text,
      entity_type text, entity_id uuid, old_data jsonb, new_data jsonb,
      created_at timestamptz DEFAULT now()
    );
  `);
  for (const name of ['marketing_actor_user_id', 'marketing_normalize_swiss_phone']) {
    await db.exec(fn(base, name));
  }
  for (const name of tables) await db.exec(table(base, name));
  await db.exec(table(ai, 'marketing_ai_runs'));
  for (const name of [
    'marketing_require_service_role', 'service_get_marketing_web_session',
    'marketing_require_admin', 'marketing_runtime_enabled', 'marketing_touch_version',
    'marketing_write_audit', 'marketing_log_delivery_transition', 'marketing_events_append_only',
    'marketing_delivery_status_rank', 'record_marketing_provider_event',
  ]) await db.exec(fn(base, name));
  await db.exec(`
    CREATE TRIGGER marketing_delivery_events AFTER INSERT OR UPDATE OF status ON public.marketing_deliveries
      FOR EACH ROW EXECUTE FUNCTION public.marketing_log_delivery_transition();
    CREATE TRIGGER marketing_events_no_update BEFORE UPDATE OR DELETE ON public.marketing_events
      FOR EACH ROW EXECUTE FUNCTION public.marketing_events_append_only();
    CREATE UNIQUE INDEX marketing_events_provider_unique ON public.marketing_events(provider, provider_event_id)
      WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;
  `);
  for (const name of tables) {
    await db.exec(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE public.${name} FROM PUBLIC, anon, authenticated, service_role;`);
  }
  await db.exec(autopilot);
  await db.exec(migration);
  await db.exec(migration);

  const signature = 'public.admin_get_marketing_autopilot_dashboard(timestamptz,timestamptz)';
  const { rows: [definition] } = await db.query(`
    SELECT prosecdef, proconfig FROM pg_proc WHERE oid = '${signature}'::regprocedure;
  `);
  assert.equal(definition.prosecdef, true);
  assert.ok(definition.proconfig.includes('search_path=""'));
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const { rows: [access] } = await db.query(`SELECT has_function_privilege('${role}', '${signature}', 'EXECUTE') AS allowed`);
    assert.equal(access.allowed, false, `${role} must not execute the internal dashboard directly`);
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT public.admin_get_marketing_autopilot_dashboard()'), /permission denied/);
    await db.exec('RESET ROLE');
  }
  await db.exec(`SET ROLE service_role; SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await assert.rejects(db.query(`SELECT public.service_execute_marketing_autopilot_operation(
    repeat('a',64), repeat('b',64), 'admin_get_marketing_autopilot_dashboard', '{}'::jsonb
  )`), /Active marketing BFF session/);
  await db.exec('RESET ROLE');

  const result = await db.exec(read('scripts/verification/fixtures/marketing-analytics-evidence.sql'));
  const passes = result.flatMap((entry) => entry.rows ?? [])
    .flatMap((row) => Object.values(row)).filter((value) => String(value).startsWith('PASS analytics:'));
  assert.equal(passes.length, 8, 'All eight SQL evidence groups must run');
  for (const pass of passes) console.log(pass);
  const { rows: [version] } = await db.query('SELECT version() AS version');
  console.log(`PASS analytics: migration replayed twice; direct roles denied; ${version.version}`);
  console.log('Scope: disposable PGlite marketing backend, not a full Supabase migration replay or production test.');
} finally {
  await db.close();
}
