import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { nativeImageCreditFixtureSql, imageCreditMigrationSql } from './ai-image-credit-fixture.mjs';

// No provider call or production access. PGlite stays in memory; the psql mode
// accepts only an explicitly named fresh loopback fixture database.
const mode = process.argv[2];
if (!['--pglite', '--postgres'].includes(mode)) {
  throw new Error('Use --pglite or --postgres for a disposable video-credit fixture');
}
const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261105203000_tok_video_gift_refunds.sql');
const owner = '98100000-0000-4000-8000-000000000001';
const restaurant = n => `98200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db;
let execute;
let rows;
if (mode === '--pglite') {
  const module = process.env.TOK_PGLITE_MODULE;
  const { PGlite } = await import(module ? pathToFileURL(module).href : '@electric-sql/pglite');
  db = new PGlite();
  execute = source => db.exec(source);
  rows = async source => (await db.query(source)).rows;
} else {
  if (process.env.TOK_AI_SECURITY_DISPOSABLE !== 'true') throw new Error('Set TOK_AI_SECURITY_DISPOSABLE=true');
  if (!['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST || '')) throw new Error('PGHOST must be explicit loopback');
  if (!/^\d{1,5}$/.test(process.env.PGPORT || '') || Number(process.env.PGPORT) > 65535) throw new Error('PGPORT must be explicit');
  if (!/^tok_(?:ai_security|security_ai)_video[a-z0-9_]*$/.test(process.env.PGDATABASE || '')) throw new Error('Use a dedicated tok_ai_security_video fixture database');
  if (['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'DATABASE_URL'].some(key => process.env[key])) throw new Error('Connection overrides are forbidden');
  const psql = source => execFileSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: source, encoding: 'utf8', timeout: 55_000, maxBuffer: 4 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  execute = async source => psql(source);
  rows = async source => JSON.parse(psql(`SELECT coalesce(json_agg(fixture_row),'[]') FROM (${source.replace(/;\s*$/, '')}) fixture_row;`));
}

try {
  const [fresh] = await rows("SELECT to_regclass('public.restaurants') IS NULL AND to_regnamespace('private_finance') IS NULL AS fresh");
  assert.equal(fresh.fresh, true, 'Database must be fresh');
  // Reuse the exact native wallet, grant, reservation and normalization triggers,
  // not a stand-in balance calculator. Only unrelated auth/storage helpers stub.
  await execute(nativeImageCreditFixtureSql());
  await execute(imageCreditMigrationSql());
  await execute(`
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE public.restaurant_media(id uuid PRIMARY KEY,restaurant_id uuid REFERENCES public.restaurants(id),storage_bucket text,storage_path text,media_type text);
    CREATE FUNCTION public.tok_connect_oauth_request_allowed() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.launch_table_allowed(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.fixture_video_cases(label text PRIMARY KEY,job_id uuid NOT NULL);
    CREATE TABLE public.fixture_video_checks(label text PRIMARY KEY);
    CREATE FUNCTION public.fixture_video_assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'video refund fixture: %',message; END IF; END $$;
    INSERT INTO auth.users(id,email) VALUES ('${owner}','owner@example.invalid');
    INSERT INTO public.restaurants(id,owner_id,name)
      SELECT ('98200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'${owner}','Synthetic video-credit fixture'
      FROM generate_series(1,9) n;
    INSERT INTO public.restaurant_ai_subscriptions(restaurant_id,status,activated_at,current_period_start,current_period_end,monthly_photo_retouch_credits)
      SELECT id,'cancelled',now()-interval '40 days',now()-interval '40 days',now()-interval '10 days',0 FROM public.restaurants;
    UPDATE public.restaurant_ai_subscriptions SET status='active',activated_at=now()-interval '1 day',
      current_period_start=now()-interval '1 day',current_period_end=now()+interval '20 days',monthly_photo_retouch_credits=1000
      WHERE restaurant_id='${restaurant(1)}';
    INSERT INTO private_finance.admin_ai_credit_grants(restaurant_id,granted_by,request_id,amount,remaining,reason,granted_at,expires_at)
      SELECT id,'${owner}',gen_random_uuid(),CASE WHEN id='${restaurant(2)}' THEN 1000 ELSE 500 END,
        CASE WHEN id='${restaurant(2)}' THEN 1000 ELSE 500 END,'Synthetic gift allocation',now()-interval '1 day',now()+interval '2 days'
      FROM public.restaurants WHERE id<>'${restaurant(1)}';
    INSERT INTO private_finance.admin_ai_credit_grants(restaurant_id,granted_by,request_id,amount,remaining,reason,granted_at,expires_at)
      VALUES ('${restaurant(2)}','${owner}',gen_random_uuid(),100,100,'Synthetic first-expiring gift',now()-interval '1 day',now()+interval '1 day'),
        ('${restaurant(6)}','${owner}',gen_random_uuid(),100,100,'Synthetic first-expiring gift',now()-interval '1 day',now()+interval '1 day');
    INSERT INTO public.restaurant_media VALUES ('98500000-0000-4000-8000-000000000006','${restaurant(6)}',
      'restaurant-images','${restaurant(6)}/photo.webp','photo');
  `);
  await execute(read('supabase/migrations/20261104220801_tok_higgsfield_video_studio.sql'));
  await execute(read('supabase/migrations/20261105035500_tok_video_quota_ignore_failed.sql'));
  await execute(read('supabase/migrations/20261105153000_tok_brand_video_references.sql'));
  await execute(`
    BEGIN;
    SET LOCAL request.jwt.claim.role='service_role';
    DO $$ DECLARE j public.restaurant_video_generations; n integer; BEGIN
      FOR n IN 1..3 LOOP
        SELECT * INTO j FROM public.reserve_restaurant_video_generation('${restaurant(2)}','${owner}',gen_random_uuid(),
          'Synthetic historical rejected request',5,'720p','9:16',false,NULL,177);
        PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_access_denied');
        INSERT INTO public.fixture_video_cases VALUES ('historic_failed_'||n,j.id);
      END LOOP;
      SELECT * INTO j FROM public.reserve_restaurant_video_generation('${restaurant(3)}','${owner}',gen_random_uuid(),
        'Synthetic historical success',5,'720p','9:16',false,NULL,177);
      PERFORM public.finish_restaurant_video_generation(j.id,'fixture-success','completed','fixture-success.mp4',NULL);
      INSERT INTO public.fixture_video_cases VALUES ('historic_success',j.id);
      SELECT * INTO j FROM public.reserve_restaurant_video_generation('${restaurant(4)}','${owner}',gen_random_uuid(),
        'Synthetic uncertain submission',5,'720p','9:16',false,NULL,177);
      PERFORM public.finish_restaurant_video_generation(j.id,NULL,'needs_review',NULL,'video_submission_unconfirmed');
      INSERT INTO public.fixture_video_cases VALUES ('historic_uncertain',j.id);
      SELECT * INTO j FROM public.reserve_restaurant_video_generation('${restaurant(5)}','${owner}',gen_random_uuid(),
        'Synthetic ledger mismatch',5,'720p','9:16',false,NULL,177);
      PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_access_denied');
      UPDATE public.ai_usage_logs SET metadata=metadata||'{"video_job_id":"mismatched-fixture"}' WHERE id=j.usage_log_id;
      INSERT INTO public.fixture_video_cases VALUES ('historic_mismatched',j.id);
      PERFORM public.fixture_video_assert((SELECT sum(remaining)=569 FROM private_finance.admin_ai_credit_grants
        WHERE restaurant_id='${restaurant(2)}'),'legacy bug must reproduce before the migration');
    END $$;
    CREATE TABLE public.fixture_video_grant_before AS SELECT * FROM private_finance.admin_ai_credit_grants;
    COMMIT;
  `);
  console.log('PASS reproduced 531 gift credits stranded by three native legacy video failures');
  await execute(migration);
  await execute('CREATE TABLE public.fixture_video_release_after AS SELECT * FROM private_finance.ai_video_credit_releases;');
  await execute(migration);
  await execute(read('src/test/sql/tok_video_gift_refunds_smoke.sql'));
  for (const check of await rows('SELECT label FROM public.fixture_video_checks ORDER BY label')) console.log(`PASS ${check.label}`);
  console.log('PASS native video gift ledger integration; no provider call or production mutation');
  console.log('LIMIT independent PostgreSQL-session races are not exercised by this sequential fixture');
} finally {
  if (db) await db.close();
}
