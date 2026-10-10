#!/usr/bin/env node
// Real PostgreSQL roles; synthetic data only; never a hosted or linked target.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.TOK_ACTUALITES_BILLING_DISPOSABLE !== 'true') {
  throw new Error('Refusing fixtures without TOK_ACTUALITES_BILLING_DISPOSABLE=true');
}
assert.ok(!process.env.PGSERVICE && !process.env.PGSERVICEFILE && !process.env.PGHOSTADDR, 'Connection service/address overrides are forbidden');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST), 'Only explicit loopback PGHOST is accepted');
assert.match(process.env.PGPORT || '', /^\d+$/, 'An explicit local PGPORT is required');
assert.equal(process.env.PGDATABASE, 'postgres', 'PGDATABASE must be the explicit disposable postgres database, never a URI or conninfo');
const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
function sql(input) {
  return execFileSync('psql', args, { input, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }).trim();
}
assert.ok(Number(sql('SHOW server_version_num;')) >= 170000, 'PostgreSQL 17+ required');
assert.equal(sql("SELECT to_regprocedure('public.record_social_feed_event_v2(uuid,text,jsonb)') IS NOT NULL;"), 't');
sql(fs.readFileSync(path.join(root, 'supabase/tests/actualites_billing_identity_fixture.sql'), 'utf8'));
function trackSql(n, event, { source = 'actualites_feed', page = 'actualites', agent = 'fixture-browser', role = 'anon', user = '', call, ip = '192.0.2.10', extra = {} } = {}) {
  const payload = JSON.stringify({ source, page, ...extra, ...(call ? { trackingCallId: call } : {}) });
  const headers = JSON.stringify({ ...(ip ? { 'x-real-ip': ip } : {}), 'user-agent': agent });
  // Values above are fixed fixture literals, never external input.
  return `BEGIN;
    SET LOCAL statement_timeout='40s';
    SET LOCAL lock_timeout='30s';
    SET LOCAL application_name='tok_actualites_billing_contender';
    SET LOCAL ROLE ${role};
    SELECT set_config('request.jwt.claim.role','${role}',true);
    SELECT set_config('request.jwt.claim.sub','${user}',true);
    SELECT set_config('request.jwt.claims','${JSON.stringify({ role, ...(user ? { sub: user } : {}) })}',true);
    SELECT set_config('request.headers','${headers}',true);
    SELECT public.record_social_feed_event_v2('74330000-0000-4000-8000-${String(n).padStart(12, '0')}','${event}','${payload}'::jsonb);
    COMMIT;`;
}
function track(...params) {
  return JSON.parse(sql(trackSql(...params)).split('\n').at(-1));
}
function serviceSql(statement) {
  return sql(`BEGIN; SET LOCAL ROLE service_role;
    SELECT set_config('request.jwt.claim.role','service_role',true);
    SELECT set_config('request.jwt.claim.sub','',true);
    SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
    ${statement}; COMMIT;`).split('\n').at(-1);
}
const reader = { role: 'authenticated', user: '74300000-0000-4000-8000-000000000002' };
const otherReader = { role: 'authenticated', user: '74300000-0000-4000-8000-000000000003' };
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261010224500_actualites_billing_identity.sql'), 'utf8');
const writerDefinition = sql("SELECT pg_get_functiondef('public.record_social_feed_event(uuid,text,jsonb)'::regprocedure);");
const allWriterState = () => sql(`SELECT json_agg(json_build_object('name',proname,'definition',pg_get_functiondef(oid),'acl',proacl) ORDER BY proname)
 FROM pg_proc WHERE oid IN ('public.record_social_feed_event(uuid,text,jsonb)'::regprocedure,'public.record_social_feed_event_v2(uuid,text,jsonb)'::regprocedure,'public.record_ad_campaign_event(uuid,uuid,text,text,uuid,text,text,jsonb,text)'::regprocedure);`);
const beforeDrift = allWriterState();
sql(writerDefinition.replace('DECLARE', 'DECLARE\n-- synthetic unexpected drift'));
assert.throws(() => sql(migration), /actualites_billing_drift/);
assert.equal(sql("SELECT to_regprocedure('private_campaign.actualites_billing_dedupe_key(uuid,uuid,text,uuid,text)') IS NULL;"), 't', 'Failed preflight rolls back the helper');
sql(writerDefinition);
assert.equal(allWriterState(), beforeDrift, 'Drift probe restores the exact baseline');

// Preserve an accepted historical delivery under a different analytics placement.
track(6, 'click', otherReader);
const historical = () => sql("SELECT json_agg(to_jsonb(event) ORDER BY id) FROM public.ad_campaign_events event WHERE campaign_id='74340000-0000-4000-8000-000000000006';");
const historicalBefore = historical();
sql(migration);
const firstApplication = allWriterState();
sql(migration);
assert.equal(allWriterState(), firstApplication, 'Reapplication preserves definitions and grants');
assert.equal(historical(), historicalBefore, 'Migration never rewrites historical paid evidence');
assert.equal(sql("SELECT md5(prosrc) FROM pg_proc WHERE oid='public.record_ad_campaign_event(uuid,uuid,text,text,uuid,text,text,jsonb,text)'::regprocedure;"), 'c3d20403bab2d99bba08b3ea2db6662a', 'Budget/conversion writer is unchanged');
console.log('PASS drift rollback, idempotent application, existing ACL and immutable paid history');
for (const [n, event, variation] of [
  [1, 'impression', { page: 'another-client-page' }],
  [2, 'click', { source: 'another-client-source' }],
  [3, 'impression', { agent: 'another-client-agent' }],
  [4, 'click', { page: 'another-client-page', role: 'authenticated', user: '74300000-0000-4000-8000-000000000002' }],
]) {
  const identity = n === 4 ? { role: 'authenticated', user: variation.user } : {};
  track(n, event, identity);
  track(n, event, { ...identity, ...variation });
}
const observed = JSON.parse(sql(`SELECT json_agg(json_build_object('id',id,'spent',spent,'daily',daily_spent,'impressions',impressions,'clicks',clicks) ORDER BY id)
 FROM public.ad_campaigns WHERE id::text LIKE '74340000-%';`));
console.log('Observed synthetic charges after metadata-only variations:', JSON.stringify(observed));
const expected = [0.01, 1, 0.01, 1];
for (let i = 0; i < expected.length; i += 1) {
  assert.equal(Number(observed[i].spent), expected[i], `Campaign ${i + 1}: metadata variations must not bill the same viewer twice`);
}
console.log('PASS independent billing identity under anonymous/authenticated metadata variations');

const replayId = '74350000-0000-4000-8000-000000000001';
const first = track(2, 'click', { call: replayId });
const replay = track(2, 'click', { call: replayId, page: 'changed', agent: 'changed', ip: '192.0.2.11' });
assert.equal(replay.eventId, first.eventId);
assert.equal(replay.touchToken, first.touchToken);
assert.ok(first.touchToken, 'Deduped paid click still has a valid attribution touch');
const cta = track(2, 'cta_click', { page: 'cta', source: 'cta_surface' });
assert.ok(cta.touchToken, 'CTA alias keeps conversion attribution');
assert.equal(sql("SELECT spent FROM public.ad_campaigns WHERE id='74340000-0000-4000-8000-000000000002';"), '1.000000', 'click/CTA are one billable click');
assert.equal(sql("SELECT count(*) FROM public.social_feed_events WHERE post_id='74330000-0000-4000-8000-000000000002' AND source='another-client-source';"), '1', 'Analytics source remains available');
track(2, 'click', { ...reader, extra: { viewerId: 'forged-browser-viewer' } });
track(2, 'click', otherReader);
assert.equal(Number(sql("SELECT spent FROM public.ad_campaigns WHERE id='74340000-0000-4000-8000-000000000002';")), 3, 'Separate verified accounts remain separately billable');
const internal = track(2, 'click', { role: 'authenticated', user: '74300000-0000-4000-8000-000000000001' });
assert.equal(internal.internalTest, true);
assert.equal(Number(sql("SELECT spent FROM public.ad_campaigns WHERE id='74340000-0000-4000-8000-000000000002';")), 3, 'Owner traffic remains unbilled');
const previous = track(6, 'click', { ...otherReader, source: 'new-placement' });
assert.ok(previous.touchToken, 'Historical accepted click still supports attribution');
assert.equal(historical(), historicalBefore, 'Recognizable old delivery is not billed or rewritten');
assert.throws(() => track(1, 'impression', { ip: '' }), /anonymous_social_identity_unavailable/);
for (const role of ['anon','authenticated']) {
  assert.throws(() => sql(`SET ROLE ${role}; SELECT public.record_social_feed_event('74330000-0000-4000-8000-000000000001','impression','{}');`), /permission denied/);
  assert.throws(() => sql(`SET ROLE ${role}; SELECT private_campaign.actualites_billing_dedupe_key(null,null,'click',null,'x');`), /permission denied/);
}
console.log('PASS transport replay, CTA normalization, analytics retention, account separation, private helper ACL and internal traffic');

// The unchanged paid writer must still enforce both budgets and daily rollover.
serviceSql("UPDATE public.ad_campaigns SET total_budget=1.5,budget_daily=50 WHERE id='74340000-0000-4000-8000-000000000004'");
assert.equal(track(4, 'click', otherReader).touchToken, null);
serviceSql("UPDATE public.ad_campaigns SET total_budget=100,budget_daily=1.5 WHERE id='74340000-0000-4000-8000-000000000004'");
assert.equal(track(4, 'click', otherReader).touchToken, null);
assert.equal(Number(sql("SELECT spent FROM public.ad_campaigns WHERE id='74340000-0000-4000-8000-000000000004';")), 1);
serviceSql("UPDATE public.ad_campaigns SET daily_spent_date=current_date-1 WHERE id='74340000-0000-4000-8000-000000000004'");
assert.ok(track(4, 'click', otherReader).touchToken);
assert.equal(sql("SELECT spent=2 AND daily_spent=1 AND daily_spent_date=current_date FROM public.ad_campaigns WHERE id='74340000-0000-4000-8000-000000000004';"), 't');
console.log('PASS total/daily budget caps and day rollover');

function concurrentSql(input) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '', errors = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Concurrent SQL timed out')); }, 60_000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); resolve({ code, output, errors }); });
    child.stdin.end(input);
  });
}
async function waitUntil(query, expected) {
  for (let attempt=0; attempt<50; attempt+=1) {
    if (Number(sql(query)) === expected) return;
    await new Promise(resolve => setTimeout(resolve,100));
  }
  throw new Error('Expected PostgreSQL contention was not observed');
}
const coordinator = concurrentSql("BEGIN; SET LOCAL application_name='tok_actualites_billing_coordinator'; SELECT 1 FROM public.ad_campaigns WHERE id='74340000-0000-4000-8000-000000000005' FOR UPDATE; SELECT pg_sleep(20); COMMIT;");
await waitUntil("SELECT count(*) FROM pg_stat_activity WHERE application_name='tok_actualites_billing_coordinator' AND wait_event='PgSleep';",1);
const contenders = Array.from({length:6}, (_,i) => concurrentSql(trackSql(5,'impression',{...reader,page:`concurrent-${i}`,agent:`agent-${i}`})));
await waitUntil("SELECT count(*) FROM pg_stat_activity WHERE application_name='tok_actualites_billing_contender' AND wait_event_type='Lock';",6);
assert.equal(sql("SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name='tok_actualites_billing_coordinator' AND wait_event='PgSleep';"),'t');
assert.match((await coordinator).errors,/canceling statement due to user request/);
const results = await Promise.all(contenders);
assert.ok(results.every(result=>result.code===0),JSON.stringify(results));
assert.equal(sql("SELECT spent=0.01 AND impressions=1 FROM public.ad_campaigns WHERE id='74340000-0000-4000-8000-000000000005';"),'t');
assert.equal(sql("SELECT count(*) FROM public.social_feed_events WHERE post_id='74330000-0000-4000-8000-000000000005';"),'6');
console.log('PASS six observed concurrent writers: one paid delivery and six analytics events');

// Use the accepted touch after a metadata-only duplicate for a real conversion.
track(7,'click',reader);
const conversionTouch = track(7,'click',{...reader,page:'second-placement'});
assert.ok(conversionTouch.touchToken);
serviceSql(`INSERT INTO public.orders(id,user_id,restaurant_id,delivery_address,total_amount,delivery_fee,status,payment_status,metadata)
 VALUES ('74360000-0000-4000-8000-000000000001','${reader.user}','74310000-0000-4000-8000-000000000001','Synthetic',100,0,'pending','pending','{"payment_method":"card"}')`);
assert.equal(serviceSql(`SELECT public.record_ad_campaign_event('74340000-0000-4000-8000-000000000007','74310000-0000-4000-8000-000000000001','conversion','synthetic-conversion','${reader.user}','fixture','actualites',
 '{"entity_id":"74360000-0000-4000-8000-000000000001","touch_token":"${conversionTouch.touchToken}","viewer_id":"${reader.user}"}','order')`),'t');
assert.equal(sql("SELECT count(*) FROM public.ad_campaign_pending_conversions WHERE entity_id='74360000-0000-4000-8000-000000000001' AND status='pending';"),'1');
assert.equal(Number(sql("SELECT spent FROM public.ad_campaigns WHERE id='74340000-0000-4000-8000-000000000007';")),0);
serviceSql("UPDATE public.orders SET payment_status='paid',status='confirmed' WHERE id='74360000-0000-4000-8000-000000000001'");
assert.equal(sql("SELECT spent=0.5 AND conversions=1 FROM public.ad_campaigns WHERE id='74340000-0000-4000-8000-000000000007';"),'t');
console.log('PASS pending conversion becomes confirmed once, with a charge capped by the remaining budget');
