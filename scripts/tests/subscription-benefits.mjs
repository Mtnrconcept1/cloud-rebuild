// Isolated PostgreSQL/WASM tests: never accepts a database URL or credentials.
// Install @electric-sql/pglite@0.5.8 in a temporary directory, then pass its ESM entry.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.argv[2];
if (!modulePath) throw new Error('Pass the local @electric-sql/pglite ESM entry path');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const db = new PGlite();
const root = resolve(import.meta.dirname, '../..');
let checks = 0;
const q = async (sql, params=[]) => (await db.query(sql,params)).rows;
const scalar = async (sql, params=[]) => Object.values((await q(sql,params))[0])[0];
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor = async (n, role='authenticated') => {
  await db.exec('RESET ROLE');
  await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[n ? uid(n) : '',role]);
  if(role==='authenticated') await db.exec('SET ROLE authenticated');
};
try {
 await db.exec(readFileSync(resolve(root,'supabase/tests/subscription_benefits_fixture.sql'),'utf8'));
 for(const name of readdirSync(resolve(root,'supabase/migrations')).filter(n=>n.startsWith('20261011070')).sort()) {
  await db.exec(readFileSync(resolve(root,'supabase/migrations',name),'utf8'));
 }
 await db.exec(`CREATE TABLE public.support_fixture(id uuid default gen_random_uuid(),user_id uuid,category text,priority text,metadata jsonb,order_id uuid,reservation_id uuid);
 CREATE TRIGGER support_fixture BEFORE INSERT ON public.support_fixture FOR EACH ROW EXECUTE FUNCTION public.apply_miamz_priority_to_support();`);
 for(const n of [1,2,3]) await q('insert into auth.users(id) values($1)',[uid(n)]);
 await q("insert into public.user_roles values($1,'admin')",[uid(3)]);
 await q('insert into public.profiles(user_id,loyalty_points) values($1,0),($2,0)',[uid(1),uid(2)]);
 await q("insert into public.user_subscription_plans(id,name,status) values($1,'Tok One','active')",[uid(10)]);
 await q("insert into public.tok_one_subscriptions(id,user_id,plan_id,status,stripe_mode,current_period_end) values($1,$2,$3,'active','test',now()+interval '1 month')",[uid(11),uid(1),uid(10)]);
 await check('test-mode Tok One grants no real entitlement',async()=>assert.equal(await scalar("select public.has_tok_one_benefit($1,'priority_support')",[uid(1)]),false));
 await q("update public.tok_one_subscriptions set stripe_mode='live' where id=$1",[uid(11)]);
 await check('live active Tok One grants support priority',async()=>{
  assert.equal(await scalar("select public.has_tok_one_benefit($1,'priority_support')",[uid(1)]),true);
  const ticket=(await q("insert into public.support_fixture(user_id,priority,category) values($1,'normal','order') returning priority,metadata",[uid(1)]))[0];
  assert.equal(ticket.priority,'high');assert.equal(ticket.metadata.tok_one_priority_boost,true);
 });
 await q("insert into public.subscription_benefits(plan_id,benefit_type,value) values($1,'priority_support','{\"enabled\":false}')",[uid(10)]);
 await check('disabled Tok One benefit is revoked',async()=>assert.equal(await scalar("select public.has_tok_one_benefit($1,'priority_support')",[uid(1)]),false));
 await q("update public.tok_one_subscriptions set current_period_end=now()-interval '1 second' where id=$1",[uid(11)]);
 await check('expired active subscription grants nothing',async()=>assert.equal(await scalar("select public.has_tok_one_benefit($1,'surprise_offers')",[uid(1)]),false));
 await q("update public.tok_one_subscriptions set current_period_end=now()+interval '1 month' where id=$1",[uid(11)]);
 await q("update public.loyalty_tiers set min_points=1500,benefits='{\"miamz_benefits\":{\"delivery_fee_boost\":{\"enabled\":false}}}' where name='silver'");
 await q("update public.profiles set loyalty_points=1200,current_tier='platinum' where user_id=$1",[uid(2)]);
 await check('configured thresholds override stale profile tier',async()=>assert.equal((await scalar('select public.resolve_miamz_benefit_state($1)',[uid(2)])).tier,'bronze'));
 await q('update public.profiles set loyalty_points=3000 where user_id=$1',[uid(2)]);
 await check('disabled inherited benefit remains disabled at Gold',async()=>assert.equal((await scalar('select public.resolve_miamz_benefit_state($1)',[uid(2)])).active_benefit_ids.includes('delivery_fee_boost'),false));
 await q('update public.profiles set loyalty_points=0 where user_id=$1',[uid(2)]);
 await q("insert into public.restaurants(id,owner_id,name,is_demo,points_multiplier) values($1,$2,'Fixture',false,1)",[uid(20),uid(1)]);
 await q("insert into public.orders(id,user_id,restaurant_id,status,payment_status,total_amount,type) values($1,$2,$3,'delivered','paid',100,'delivery')",[uid(30),uid(2),uid(20)]);
 await check('completed paid order earns original MIAMZ',async()=>assert.equal(await scalar('select loyalty_points from public.profiles where user_id=$1',[uid(2)]),1000));
 await q("update public.orders set refunded_amount_chf=25,refund_status='partial_refund' where id=$1",[uid(30)]);
 await check('partial refund removes proportional MIAMZ',async()=>assert.equal(await scalar('select loyalty_points from public.profiles where user_id=$1',[uid(2)]),750));
 await q("update public.orders set refunded_amount_chf=25 where id=$1",[uid(30)]);
 await check('repeated refund event is idempotent',async()=>assert.equal(await scalar('select loyalty_points from public.profiles where user_id=$1',[uid(2)]),750));
 await q("update public.orders set refunded_amount_chf=100,payment_status='refunded',refund_status='fully_refunded' where id=$1",[uid(30)]);
 await check('partial then full refund nets exactly zero',async()=>assert.equal(await scalar('select loyalty_points from public.profiles where user_id=$1',[uid(2)]),0));
 await q("insert into public.restaurant_ai_subscriptions(id,restaurant_id,plan,status,stripe_mode,current_period_start,current_period_end,monthly_ai_tool_credits,monthly_text_tool_limit,monthly_campaign_credit_chf,included_establishments_snapshot,additional_establishment_price_cents_snapshot,stripe_subscription_id) values($1,$2,'elite','active','live',now()-interval '1 day',now()+interval '1 month',100,50,0,3,14900,'sub_fixture')",[uid(21),uid(20)]);
 const allowance = async n=>(await scalar('select public.get_restaurant_credit_usage($1)',[uid(n)])).credits[0].included_allowance;
 await check('active restaurant gets configured included credits',async()=>assert.equal(await allowance(20),100));
 await q("update public.restaurant_ai_subscriptions set status='cancelled' where id=$1",[uid(21)]);
 await check('cancelled restaurant loses included credits and quota',async()=>{
  assert.equal(await allowance(20),0);assert.equal((await scalar("select public.check_restaurant_ai_quota($1,'ai_sales_insights')",[uid(20)])).allowed,false);
 });
 await q("update public.restaurant_ai_subscriptions set status='active' where id=$1",[uid(21)]);
 for(const n of [22,23,24]) await q("insert into public.restaurants(id,owner_id,name,is_demo) values($1,$2,'Child',false)",[uid(n),uid(1)]);
 await actor(1,'service_role');
 for(const n of [22,23]) {
  const req=await scalar('select public.prepare_restaurant_seat($1,$2,$3)',[uid(20),uid(n),uid(1)]);
  assert.equal(req.extra_quantity,0);await q('select public.complete_restaurant_seat($1,null)',[req.id]);
 }
 await check('included child sites share a single allowance',async()=>{
  assert.equal(await allowance(22),100);assert.equal(await allowance(23),100);
  await q("insert into public.ai_usage_logs(restaurant_id,status,metadata,feature_name) values($1,'success','{\"credit_units\":7}','ai_sales_insights')",[uid(22)]);
  const a=await scalar('select public.get_restaurant_credit_usage($1)',[uid(20)]);
  const b=await scalar('select public.get_restaurant_credit_usage($1)',[uid(23)]);
  assert.deepEqual(a.credits,b.credits);assert.equal(a.credits[0].spent,7);
  assert.equal((await scalar("select public.check_restaurant_ai_quota($1,'ai_sales_insights')",[uid(23)])).used,1);
 });
 const fourth=await scalar('select public.prepare_restaurant_seat($1,$2,$3)',[uid(20),uid(24),uid(1)]);
 await check('fourth site requires paid Stripe capacity',async()=>{
  assert.equal(fourth.extra_quantity,1);await assert.rejects(q('select public.complete_restaurant_seat($1,$2)',[fourth.id,'si_fake']),/Paid capacity required/);
  await q('select public.sync_restaurant_extra_capacity($1,$2,1)',[uid(21),'sub_fixture']);
  await q('select public.complete_restaurant_seat($1,$2)',[fourth.id,'si_fixture']);
  assert.equal(await allowance(24),100);
 });
 await check('repeated attachment never duplicates a seat',async()=>{
  await q('select public.complete_restaurant_seat($1,$2)',[fourth.id,'si_fixture']);
  assert.equal(await scalar('select count(*)::int from public.restaurant_subscription_establishments'),3);
 });
 await q('select public.sync_restaurant_extra_capacity($1,$2,0)',[uid(21),'sub_fixture']);
 await check('removed paid capacity revokes only the extra site',async()=>{
  assert.equal(await allowance(24),0);assert.equal(await allowance(22),100);assert.equal(await allowance(23),100);
 });
 await actor(2);
 await check('another owner cannot read credits or attach sites',async()=>{
  await assert.rejects(q('select public.get_restaurant_credit_usage($1)',[uid(20)]),/Forbidden/);
  await assert.rejects(q('select public.prepare_restaurant_seat($1,$2,$3)',[uid(20),uid(24),uid(2)]),/permission denied/);
  assert.equal(await scalar('select count(*)::int from public.restaurant_subscription_entitlements'),0);
 });
 await actor(3);
 const code=await scalar('select public.admin_save_promo_code(null,$1,$2)',[JSON.stringify({code:'MEMBER10',type:'fixed',value:10,is_active:true,required_tok_one_benefit:'surprise_offers'}),'Integration fixture']);
 const campaign=await scalar('select public.admin_save_member_campaign(null,$1,$2)',[JSON.stringify({title:'Member surprise',description:'Fixture collection details',audience:'tok_one',benefit:'surprise_offers',ends_at:'2099-01-01T00:00:00Z',promo_code_id:code,is_active:true}),'Integration fixture']);
 await actor(2);
 await check('nonmembers cannot see, claim or use a reserved offer',async()=>{
  assert.equal(await scalar('select public.promo_code_is_eligible($1)',[code]),false);
  assert.equal((await q('select * from public.get_my_benefit_campaigns()')).length,0);
  await assert.rejects(q('select public.claim_member_benefit($1)',[campaign]),/not eligible/);
  await assert.rejects(q('select public.admin_save_promo_code(null,$1,$2)',['{}','Not administrator']),/Admin access/);
 });
 await actor(1);
 await check('eligible claim reveals code exactly once',async()=>{
  assert.equal((await q('select * from public.get_my_benefit_campaigns()'))[0].code,null);
  await q('select public.claim_member_benefit($1)',[campaign]);await q('select public.claim_member_benefit($1)',[campaign]);
  assert.equal((await q('select * from public.get_my_benefit_campaigns()'))[0].code,'MEMBER10');
  assert.equal(await scalar('select count(*)::int from public.member_benefit_claims'),1);
 });
 await check('member cannot mark a physical benefit as fulfilled',async()=>await assert.rejects(q('select public.admin_fulfill_member_benefit($1,$2,$3)',[campaign,uid(1),'Self fulfillment']),/Admin access/));
 await actor(3);
 await check('admin fulfillment is audited and idempotent',async()=>{
  await q('select public.admin_fulfill_member_benefit($1,$2,$3)',[campaign,uid(1),'Received in person']);
  await q('select public.admin_fulfill_member_benefit($1,$2,$3)',[campaign,uid(1),'Received in person']);
  const claims=await q('select * from public.admin_member_campaign_claims($1)',[campaign]);
  assert.ok(claims[0].fulfilled_at);
 });
 await actor(1);
 await check('owner reads inherited entitlements through RLS',async()=>assert.equal(await scalar('select count(*)::int from public.restaurant_subscription_entitlements'),3));
 await actor(3,'service_role');
 const silverId=await scalar("select id from public.loyalty_tiers where name='silver'");
 await actor(3);
 await check('admin cannot invert tier thresholds',async()=>await assert.rejects(q('select public.admin_save_loyalty_tier($1,$2,$3)',[
  silverId,JSON.stringify({name:'silver',min_points:6000,multiplier:1.1,status:'active'}),'Invalid thresholds']),/thresholds must increase/));
 await actor(1,'service_role');
 await check('historical partial refunds can be repaired without replaying order side effects',async()=>{
  await q("insert into public.orders(id,user_id,restaurant_id,status,payment_status,total_amount,type) values($1,$2,$3,'completed','paid',50,'delivery')",[uid(31),uid(2),uid(20)]);
  await db.exec('ALTER TABLE public.orders DISABLE TRIGGER zz_reconcile_refunded_order_miamz');
  await q("update public.orders set refunded_amount_chf=25 where id=$1",[uid(31)]);
  await db.exec('ALTER TABLE public.orders ENABLE TRIGGER zz_reconcile_refunded_order_miamz');
  assert.equal(await scalar('select loyalty_points from public.profiles where user_id=$1',[uid(2)]),500);
  await q('select * from public.reconcile_refunded_order_miamz_batch(null,100)');
  assert.equal(await scalar('select loyalty_points from public.profiles where user_id=$1',[uid(2)]),250);
  const replay=await q('select * from public.reconcile_refunded_order_miamz_batch(null,100)');
  assert.ok(replay.every(row=>row.adjustment===0));
 });
 await check('donation rewards are also adjusted proportionally',async()=>{
  await q("insert into public.orders(id,user_id,restaurant_id,status,payment_status,total_amount,type,donate_earned_xp) values($1,$2,$3,'completed','paid',100,'delivery',true)",[uid(32),uid(2),uid(20)]);
  await q("update public.orders set refunded_amount_chf=40 where id=$1",[uid(32)]);
  assert.equal(await scalar('select sum(points_amount)::int from public.solidarity_donations where user_id=$1',[uid(2)]),600);
  assert.equal(await scalar('select loyalty_points from public.profiles where user_id=$1',[uid(2)]),250);
 });
 console.log(`${checks} behavioral SQL checks passed; seven migrations executed in isolated PostgreSQL.`);
} catch (error) { console.error(error.message, error.where || "", error.query || ""); process.exitCode=1; } finally { await db.close(); }
