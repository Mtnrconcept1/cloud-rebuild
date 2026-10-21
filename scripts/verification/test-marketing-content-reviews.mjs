// Disposable PostgreSQL execution, no production connection or dependency added.
// TOK_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node this-file.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const foundation = readFileSync(resolve(root, 'supabase/migrations/20260801190000_marketing_operations_center.sql'), 'utf8');

export function extractMarketingFunction(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const tail = source.slice(start);
  const opening = /\bAS\s+(\$[a-zA-Z0-9_]*\$)/.exec(tail);
  assert.ok(opening, `missing function body ${name}`);
  const end = tail.indexOf(opening[1] + ';', opening.index + opening[0].length);
  assert.notEqual(end, -1, `missing function end ${name}`);
  return tail.slice(0, end + opening[1].length + 1);
}

/** Actual source table definitions and auth guards; external services are inert
 * fixtures. Returns an open PGlite database for publication-gate integration tests.
 * PGlite serializes client queries; real multi-session deadlock tests need PostgreSQL.
 */
export async function createMarketingReviewFixture() {
  const { PGlite } = await import(process.env.TOK_PGLITE_MODULE || '@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(auth.jwt()->>'sub','')::uuid $$;
    CREATE TABLE public.feature_flags(name text PRIMARY KEY,is_active boolean NOT NULL);
    CREATE TABLE public.user_roles(user_id uuid,role text);
    CREATE TABLE public.marketing_admin_web_sessions(sid_hash text PRIMARY KEY,csrf_hash text,user_id uuid,
      revoked_at timestamptz,expires_at timestamptz,revoke_reason text);
    CREATE TABLE public.audit_log(id bigserial PRIMARY KEY,user_id uuid,action text,entity_type text,entity_id uuid,new_data jsonb);
    CREATE TABLE public.notification_campaigns(id uuid PRIMARY KEY);
    CREATE TABLE public.social_posts(id uuid PRIMARY KEY);
    CREATE TABLE public.ad_campaigns(id uuid PRIMARY KEY);
    CREATE TABLE public.marketing_daily_series(id uuid PRIMARY KEY,publication_mode text,status text,auto_authorized_at timestamptz);
    CREATE TABLE public.marketing_daily_runs(id uuid PRIMARY KEY,series_id uuid,status text,created_at timestamptz DEFAULT now(),last_error text);
    CREATE SCHEMA vault;
    CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
    CREATE SCHEMA cron;
    CREATE TABLE cron.job(jobid bigserial PRIMARY KEY,jobname text,schedule text,command text,active boolean DEFAULT true);
    CREATE FUNCTION cron.schedule(p_name text,p_schedule text,p_command text) RETURNS bigint LANGUAGE sql AS $$
      INSERT INTO cron.job(jobname,schedule,command) VALUES(p_name,p_schedule,p_command) RETURNING jobid $$;
    CREATE SCHEMA net;
    CREATE TABLE net.requests(id bigserial PRIMARY KEY,url text,body jsonb,headers jsonb,timeout_milliseconds integer);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 1000)
      RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.requests(url,body,headers,timeout_milliseconds)
        VALUES(url,body,headers,timeout_milliseconds) RETURNING id $$;
    CREATE FUNCTION public.service_get_marketing_web_session(p_sid_hash text,p_csrf_hash text,p_mutation boolean) RETURNS jsonb LANGUAGE sql AS $$
      SELECT to_jsonb(s) FROM public.marketing_admin_web_sessions s WHERE s.sid_hash=p_sid_hash AND s.revoked_at IS NULL
        AND s.expires_at>clock_timestamp() AND (NOT p_mutation OR s.csrf_hash=p_csrf_hash) $$;
    INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');
    INSERT INTO public.user_roles VALUES ('11111111-1111-4111-8111-111111111111','admin');
    INSERT INTO public.feature_flags VALUES ('admin-marketing-operations',true);
    INSERT INTO public.marketing_admin_web_sessions(sid_hash,csrf_hash,user_id,expires_at)
      VALUES(repeat('a',64),repeat('b',64),'11111111-1111-4111-8111-111111111111',now()+interval '1 day');
    INSERT INTO vault.decrypted_secrets VALUES
      ('marketing_edge_url','https://fixture.supabase.co/functions/v1/marketing-orchestrator'),
      ('internal_cron_secret','fixture-secret-with-at-least-32-characters');
    SELECT set_config('request.jwt.claims','{"role":"service_role","sub":"11111111-1111-4111-8111-111111111111"}',false);
    SELECT set_config('app.marketing_actor_user_id','11111111-1111-4111-8111-111111111111',false);
    SELECT set_config('app.marketing_web_session_sid_hash',repeat('a',64),false);
  `);
  for (const name of ['marketing_actor_user_id','marketing_require_service_role','marketing_require_admin','marketing_touch_version']) {
    await db.exec(extractMarketingFunction(foundation, name));
  }
  for (const name of ['marketing_campaigns','marketing_integrations','marketing_calendar_items']) {
    const start = foundation.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`);
    assert.notEqual(start, -1);
    await db.exec(foundation.slice(start, foundation.indexOf('\n);', start) + 3));
  }
  await db.exec(extractMarketingFunction(foundation, 'service_execute_marketing_admin_operation'));
  await db.exec(`
    CREATE TRIGGER fixture_campaign_touch BEFORE UPDATE ON public.marketing_campaigns
      FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();
    CREATE TRIGGER fixture_item_touch BEFORE UPDATE ON public.marketing_calendar_items
      FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();
    GRANT USAGE ON SCHEMA public,auth TO service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.marketing_campaigns,public.marketing_calendar_items,public.marketing_integrations TO service_role;
    INSERT INTO public.marketing_integrations(id,provider,name,channel,status,public_configuration)
      VALUES('00000000-0000-4000-8000-000000001003','instagram','TOK Instagram','instagram','connected',
        '{"ig_user_id":"17840000000000000","page_id":"1400000000000000","instagram_username":"thetok","access_token":"DO_NOT_COPY"}');
    INSERT INTO public.marketing_campaigns(id,name,channels)
      VALUES('00000000-0000-4000-8000-000000001001','Historique',ARRAY['instagram']);
    INSERT INTO public.marketing_calendar_items(id,campaign_id,integration_id,title,channel,scheduled_at,content)
      VALUES('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001001',
        '00000000-0000-4000-8000-000000001003','Historique','instagram',now()+interval '1 day',
        '{"body":"Ancien contenu","visual_url":"https://fixture.supabase.co/storage/v1/object/public/marketing/old.png","visual_status":"ready"}');
  `);
  const migration = readFileSync(resolve(root, 'supabase/migrations/20261021020000_marketing_content_reviews.sql'), 'utf8');
  await db.exec(migration);
  // New migration must be replay-safe and must not enqueue the old calendar.
  await db.exec(migration);
  await db.exec(`CREATE TRIGGER fixture_daily_publication AFTER UPDATE OF status ON public.marketing_daily_runs
    FOR EACH ROW WHEN (NEW.status='succeeded' AND OLD.status IS DISTINCT FROM 'succeeded')
    EXECUTE FUNCTION public.marketing_schedule_authorized_daily_post();`);
  return db;
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const db = await createMarketingReviewFixture();
  try {
    await db.exec(readFileSync(resolve(root, 'src/test/sql/marketing_content_reviews_smoke.sql'), 'utf8'));
    await db.exec(`INSERT INTO public.marketing_calendar_items(id,title,channel,scheduled_at,content)
      VALUES('90000000-0000-4000-8000-000000000001','Concurrent callbacks','facebook',now(),'{"body":"Exact content"}');
      UPDATE public.marketing_content_review_targets SET next_attempt_at=now(); SET ROLE service_role;`);
    const claims = await Promise.all(['d','e'].map(token => db.query('SELECT public.claim_marketing_content_review($1,$2) AS value', [token.repeat(64),'123'])));
    assert.equal(claims.filter(result => result.rows[0].value !== null).length, 1, 'one worker claim wins');
    const winner = claims.findIndex(result => result.rows[0].value !== null);
    const review = claims[winner].rows[0].value;
    await db.query('SELECT public.record_marketing_content_review_delivery($1,ARRAY[1,2]::bigint[],2,true)', [review.id]);
    const decisions = await Promise.all(['approved','rejected'].map(decision => db.query(
      'SELECT public.decide_marketing_content_review($1,$2,2,$3,$4) AS value',
      [['d','e'][winner].repeat(64),'123',decision,'telegram:456'])));
    assert.equal(decisions.filter(result => result.rows[0].value !== null).length, 1, 'one callback decision wins');
    await db.exec('RESET ROLE');
    assert.equal((await db.query("SELECT status || '/' || approval_status AS state FROM public.marketing_calendar_items WHERE id='90000000-0000-4000-8000-000000000001'")).rows[0].state, 'draft/pending');
    console.log('PASS: migration replay, real-role denial, bounds/bundles/visuals, material revisions, membership/cancellation, privacy, ACK/CAS/replay/expiry/retry, competing calls, delivery gate, daily drafts, cron.');
  } finally { await db.close(); }
}
