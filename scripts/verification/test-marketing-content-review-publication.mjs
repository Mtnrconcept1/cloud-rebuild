// Runs real Marketing claim functions and publish guards in disposable Postgres.
// TOK_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node this-file.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createMarketingReviewFixture, extractMarketingFunction } from './test-marketing-content-reviews.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sql = name => readFileSync(resolve(root, `supabase/migrations/${name}`), 'utf8');
const foundation = sql('20260801190000_marketing_operations_center.sql');
const ai = sql('20260802230000_marketing_ai_agent.sql');
const cadence = sql('20260803150000_marketing_email_cadence.sql');
const gate = sql('20261021020001_marketing_content_review_publication_gate.sql');
const db = await createMarketingReviewFixture();
const integration = '00000000-0000-4000-8000-000000001003';
const admin = '11111111-1111-4111-8111-111111111111';

try {
  await db.exec(extractMarketingFunction(foundation, 'marketing_normalize_swiss_phone'));
  for (const name of ['marketing_contacts', 'marketing_deliveries', 'marketing_automations']) {
    const start = foundation.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`);
    assert.ok(start >= 0);
    await db.exec(foundation.slice(start, foundation.indexOf('\n);', start) + 3));
  }
  await db.exec(`
    CREATE TABLE public.notification_preferences(user_id uuid,categories jsonb,channels jsonb);
    CREATE TABLE public.notifications(id uuid,user_id uuid,title text,body text,type text,category text,data jsonb);
  `);
  for (const [source, name] of [
    [foundation, 'marketing_runtime_enabled'], [foundation, 'claim_due_marketing_items'],
    [foundation, 'claim_marketing_item'], [cadence, 'claim_marketing_deliveries'],
    [ai, 'service_prepare_marketing_email_delivery'], [foundation, 'service_send_marketing_in_app_delivery'],
  ]) await db.exec(extractMarketingFunction(source, name));
  await db.exec(gate);
  await db.exec(gate);
  await db.exec(`
    GRANT EXECUTE ON FUNCTION public.claim_marketing_item(uuid,text,integer),public.claim_due_marketing_items(integer,text,integer) TO service_role;
    INSERT INTO public.marketing_automations(automation_key,name,status,conditions)
      VALUES('global_runtime','Fixture','active','{"global_pause":false}');
    -- Simulate a historical item whose schedule pre-dates the feature install.
    ALTER TABLE public.marketing_calendar_items DISABLE TRIGGER marketing_item_content_review;
    UPDATE public.marketing_calendar_items SET status='scheduled',approval_status='approved',approved_by='${admin}',approved_at=now(),scheduled_at=now()-interval '5 minutes'
      WHERE id='00000000-0000-4000-8000-000000001002';
    ALTER TABLE public.marketing_calendar_items ENABLE TRIGGER marketing_item_content_review;
    UPDATE public.marketing_campaigns SET approved_at=now(),approved_by='${admin}' WHERE id='00000000-0000-4000-8000-000000001001';
  `);
  assert.equal((await db.query('SELECT public.marketing_runtime_enabled() AS ready')).rows[0].ready, true);

  async function createItem(suffix) {
    const campaign = `90000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
    const item = `91000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
    await db.query(`INSERT INTO public.marketing_campaigns(id,name,objective,content,channels,approved_at,approved_by)
      VALUES($1,'Genève','Prospection','{"body":"TOK à Genève"}',ARRAY['instagram'],now(),$2)`, [campaign, admin]);
    await db.query(`INSERT INTO public.marketing_calendar_items(id,campaign_id,integration_id,title,channel,scheduled_at,status,approval_status,approved_at,approved_by,content)
      VALUES($1,$2,$3,'Publication Genève','instagram',now()-interval '5 minutes','scheduled','approved',now(),$4,
        '{"caption":"Découvrez TOK à Genève","visual_status":"ready","visual_url":"https://fixture.supabase.co/storage/v1/object/public/social-post-media/marketing-ai/geneve.jpg"}')`,
    [item, campaign, integration, admin]);
    return { item, campaign };
  }
  async function approve(campaign, char) {
    await db.query("UPDATE public.marketing_content_review_targets SET next_attempt_at=now() WHERE target_type='campaign' AND target_id=$1", [campaign]);
    const hash = char.repeat(64);
    const result = await db.query('SELECT public.claim_marketing_content_review($1,\'123\') AS review', [hash]);
    const review = result.rows[0].review;
    assert.equal(review.target_id, campaign);
    await db.query("SELECT public.record_marketing_content_review_delivery($1,ARRAY[31,32,33]::bigint[],NULL,true,'delivered')", [review.id]);
    await db.query("SELECT public.record_marketing_content_review_delivery($1,'{}'::bigint[],34,true,'delivered')", [review.id]);
    const decided = await db.query("SELECT public.decide_marketing_content_review($1,'123',34,'approved','telegram:456') AS review", [hash]);
    assert.equal(decided.rows[0].review.status, 'approved');
    // Advance the fixture past the chat cooldown; transport pacing is covered
    // in the dedicated review smoke test, without real sleeps or messages.
    await db.query("UPDATE public.marketing_content_reviews SET transport_lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [review.id]);
  }

  const first = await createItem(1);
  await db.exec('SET ROLE service_role');
  assert.equal((await db.query("SELECT * FROM public.claim_marketing_item($1,'fixture',120)", [first.item])).rows.length, 0,
    'Native scheduling alone must not claim unreviewed new content');
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT attempt_count FROM public.marketing_calendar_items WHERE id=$1', [first.item])).rows[0].attempt_count, 0,
    'Waiting for review must not consume publication attempts');
  await approve(first.campaign, 'a');
  await db.exec('SET ROLE service_role');
  assert.equal((await db.query("SELECT * FROM public.claim_marketing_item($1,'fixture',120)", [first.item])).rows.length, 1,
    'Content approval plus native schedule is claimable');
  await assert.rejects(
    db.query("UPDATE public.marketing_calendar_items SET content=content||'{\"caption\":\"Contenu jamais présenté\"}',result_summary=jsonb_build_object('meta_publish_started_at',now()) WHERE id=$1", [first.item]),
    error => error.code === '42501' && error.message === 'Marketing content Telegram approval required',
    'One statement cannot edit material and consume its old approval',
  );
  await db.query("UPDATE public.marketing_calendar_items SET result_summary=jsonb_build_object('meta_publish_started_at',now()) WHERE id=$1", [first.item]);
  await db.exec('RESET ROLE');

  const second = await createItem(2);
  await approve(second.campaign, 'b');
  assert.equal((await db.query("SELECT * FROM public.claim_marketing_item($1,'fixture',120)", [second.item])).rows.length, 1);
  await db.query("UPDATE public.marketing_campaigns SET objective='Objectif révisé après la réservation' WHERE id=$1", [second.campaign]);
  await db.exec('SET ROLE service_role');
  await assert.rejects(
    db.query("UPDATE public.marketing_calendar_items SET result_summary=jsonb_build_object('meta_publish_started_at',now()) WHERE id=$1", [second.item]),
    error => error.code === '42501' && error.message === 'Marketing content Telegram approval required',
    'A parent edit after claim must stop the Meta publish marker',
  );
  await db.exec('RESET ROLE');
  assert.equal((await db.query("SELECT result_summary->>'meta_publish_started_at' AS marker FROM public.marketing_calendar_items WHERE id=$1", [second.item])).rows[0].marker, null);

  const third = await createItem(3);
  await db.exec('SET ROLE service_role');
  const due = (await db.query("SELECT id FROM public.claim_due_marketing_items(25,'fixture',120)")).rows.map(row => row.id);
  assert.deepEqual(due, ['00000000-0000-4000-8000-000000001002'],
    'Due worker keeps historical approval while excluding unreviewed new content');
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT attempt_count FROM public.marketing_calendar_items WHERE id=$1', [third.item])).rows[0].attempt_count, 0);

  // The complete native email and in-app functions were compiled and amended
  // above. Verify their final side-effect guard is present, alongside executable
  // claim/marker coverage; no mail, push, Meta or Telegram provider is contacted.
  for (const name of ['service_prepare_marketing_email_delivery', 'service_send_marketing_in_app_delivery']) {
    const def = (await db.query("SELECT pg_get_functiondef(to_regprocedure($1)) AS body", [`public.${name}(uuid,uuid)`])).rows[0].body;
    assert.ok(def.includes('PERFORM public.marketing_require_content_review_delivery(v_item.id);'));
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const allowed = (await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',
      [role, 'public.marketing_require_content_review_delivery(uuid)'])).rows[0].allowed;
    assert.equal(allowed, false, 'Internal gate must not expose a new public RPC');
  }
  console.log('PASS: native claim/item and due gates, historical compatibility, no attempt loss, approval release, stale parent before Meta marker, native email/in-app guard compilation, migration replay, private helper.');
} catch (error) {
  console.error('FAIL:', error.code || error.name, error.message, error.where || '');
  process.exitCode = 1;
} finally { await db.close(); }
