import assert from 'node:assert/strict';

export const ownerId = '98100000-0000-4000-8000-000000000001';
export const staffId = '98100000-0000-4000-8000-000000000002';
export const otherId = '98100000-0000-4000-8000-000000000003';
export const restaurantId = n => `98200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const quoted = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${quoted(JSON.stringify(value))}::jsonb`;
export const service = statement => `BEGIN; SET LOCAL ROLE service_role; SET LOCAL request.jwt.claim.role='service_role'; ${statement}; COMMIT;`;
export const claimStatement = (restaurant, key, user = ownerId, hash = 'a'.repeat(64), units = 6) =>
  `SELECT public.claim_ai_image_operation('${user}','${restaurant}',${quoted(key)},'${hash}',${units},'fixture-seed','gpt-image-2')`;

export const seedSql = `
INSERT INTO auth.users (id,email) VALUES ('${ownerId}','owner@example.invalid'),
  ('${staffId}','staff@example.invalid'),('${otherId}','other@example.invalid');
INSERT INTO public.restaurants(id,owner_id,name)
  SELECT ('98200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'${ownerId}','Synthetic AI fixture'
  FROM generate_series(1,8) n;
INSERT INTO public.restaurant_staff(restaurant_id,user_id)
  VALUES ('${restaurantId(3)}','${staffId}'),('${restaurantId(4)}','${staffId}');
-- Active plan: exactly six credits. Gifts-only restaurant: prior activation,
-- expired subscription, therefore no weekly trial credits.
INSERT INTO public.restaurant_ai_subscriptions(restaurant_id,status,activated_at,current_period_start,current_period_end,monthly_photo_retouch_credits)
VALUES ('${restaurantId(2)}','active',now()-interval '1 day',now()-interval '1 day',now()+interval '20 days',6),
  ('${restaurantId(3)}','cancelled',now()-interval '40 days',now()-interval '40 days',now()-interval '10 days',0),
  ('${restaurantId(4)}','cancelled',now()-interval '40 days',now()-interval '40 days',now()-interval '10 days',0);
INSERT INTO private_finance.admin_ai_credit_grants(id,restaurant_id,granted_by,request_id,amount,remaining,reason,granted_at,expires_at)
VALUES ('98300000-0000-4000-8000-000000000001','${restaurantId(3)}','${ownerId}',gen_random_uuid(),3,3,'Synthetic gift one',now()-interval '1 day',now()+interval '1 day'),
  ('98300000-0000-4000-8000-000000000002','${restaurantId(3)}','${ownerId}',gen_random_uuid(),9,9,'Synthetic gift two',now()-interval '1 day',now()+interval '2 days');
INSERT INTO private_finance.internal_unlimited_openai_grants(user_id,restaurant_id,granted_at,reason)
  VALUES ('${ownerId}','${restaurantId(4)}',now()-interval '1 hour','Synthetic verified owner');
`;

/** Sequential integration checks use actual native PostgreSQL functions and
 * triggers. The separate psql runner adds independent concurrent sessions. */
export async function exerciseImageCreditLedger(sql) {
  const pass = [];
  const run = statement => sql(service(statement));
  const balance = async r => Number(await run(`SELECT public.tok_credit_balance_from_usage(public.get_restaurant_credit_usage('${r}'))`));
  const claim = async (r, key, user = ownerId, hash = 'a'.repeat(64), units = 6) => JSON.parse(await run(claimStatement(r, key, user, hash, units)));
  const advance = (op, state) => run(`SELECT public.advance_ai_image_operation('${op.operation_id}','${op.worker_token}','${state}','synthetic proof')`);
  const release = op => run(`SELECT public.release_ai_image_operation('${op.operation_id}','${op.worker_token}','synthetic cleanup confirmed')`);
  const finalize = (op, r, overrides = {}) => {
    const asset = { storage_path: `ai-generated/${r}/${op.asset_id}.png`, storage_bucket: 'ai-generated-assets',
      source_image_url: null, asset_url: 'https://example.invalid/synthetic.png',asset_type: 'image',model: 'gpt-image-2',prompt: 'Synthetic prompt',title: 'Fixture' };
    const usage = { estimated_cost_chf: 0.05, input_tokens: 10, output_tokens: 20, total_tokens: 30, provider_request_id: 'fixture-provider-1', ...overrides.usage };
    const metadata = { credit_units: 6, requested_output_credit_units: 6, admin_ai_gift_used: 9999, ...overrides.metadata };
    const response = { assetId: op.asset_id, credit_units: 6, status: 'stored', generated_image_url: 'https://example.invalid/synthetic.png', ...overrides.response };
    return run(`SELECT public.finalize_ai_image_operation('${op.operation_id}','${op.worker_token}',${json(asset)},${json(usage)},${json(metadata)},${json(response)})`);
  };

  await sql(seedSql);
  assert.equal(await balance(restaurantId(1)), 15);
  const op = await claim(restaurantId(1), 'fixture-first-image');
  assert.equal(op.claimed, true);
  assert.equal(await balance(restaurantId(1)), 9);
  const replay = await claim(restaurantId(1), 'fixture-first-image');
  assert.equal(replay.claimed, false);
  assert.equal(replay.state, 'reserved');
  assert.equal(replay.worker_token, undefined);
  assert.equal(await balance(restaurantId(1)), 9);
  assert.equal(await sql(`SELECT action='image_credit_reservation' AND status='success'
    AND metadata->>'billing_phase'='reserved' AND metadata->>'generated_image'='false'
    FROM public.ai_usage_logs WHERE id='${op.usage_id}';`), 't');
  await assert.rejects(() => claim(restaurantId(1), 'fixture-first-image', ownerId, 'b'.repeat(64)), /image_idempotency_conflict/);
  await assert.rejects(() => claim(restaurantId(2), 'fixture-first-image'), /image_idempotency_conflict/);
  await assert.rejects(() => claim(restaurantId(1), 'fixture-other-user', otherId), /image_operation_forbidden/);
  await assert.rejects(() => finalize(op, restaurantId(1)), /image_operation_invalid_transition/);
  await assert.rejects(() => run(`SELECT public.advance_ai_image_operation('${op.operation_id}','00000000-0000-4000-8000-000000000000','provider_started',null)`), /image_operation_not_owned/);
  await advance(op, 'provider_started');
  await assert.rejects(() => advance(op, 'provider_started'), /image_operation_invalid_transition/);
  await assert.rejects(() => finalize(op, restaurantId(1), { usage: { estimated_cost_chf: 0.06 } }), /image_reservation_units_immutable/);
  await assert.rejects(() => finalize(op, restaurantId(1), { metadata: { credit_units: 7 } }), /image_reservation_units_immutable/);
  // The AFTER trigger catches values enlarged by the existing BEFORE normalizer.
  await assert.rejects(() => run(`UPDATE public.ai_usage_logs SET estimated_cost_chf=0.06 WHERE id='${op.usage_id}'`), /image_reservation_units_immutable/);
  await assert.rejects(() => run(`UPDATE public.ai_usage_logs SET metadata=metadata||'{"credit_units":7}' WHERE id='${op.usage_id}'`), /image_reservation_units_immutable/);
  await assert.rejects(() => run(`DELETE FROM public.ai_usage_logs WHERE id='${op.usage_id}'`), /foreign key/);
  const completed = await finalize(op, restaurantId(1));
  assert.equal(await finalize(op, restaurantId(1)), completed);
  assert.equal((await claim(restaurantId(1), 'fixture-first-image')).state, 'completed');
  assert.equal(await balance(restaurantId(1)), 9);
  assert.equal(await sql(`SELECT count(*) FROM public.ai_generated_assets WHERE id='${op.asset_id}';`), '1');
  assert.equal(await sql(`SELECT metadata->>'admin_ai_gift_used' IS NULL AND metadata->>'billing_phase'='completed'
    AND metadata->>'generated_image'='true' AND estimated_cost_chf=0.05 FROM public.ai_usage_logs WHERE id='${op.usage_id}';`), 't');
  pass.push('durable claim/replay, same-row finalize, immutable units/cost, actor and worker isolation');

  const last = await claim(restaurantId(2), 'fixture-last-plan');
  assert.equal(await balance(restaurantId(2)), 0);
  await assert.rejects(() => claim(restaurantId(2), 'fixture-no-budget'), /TOK credits exhausted/);
  await advance(last, 'provider_started');
  await advance(last, 'indeterminate');
  assert.equal((await claim(restaurantId(2), 'fixture-last-plan')).state, 'indeterminate');
  await assert.rejects(() => release(last), /image_operation_invalid_transition/);
  await advance(last, 'cleanup_pending');
  assert.equal(await balance(restaurantId(2)), 0);
  const failed = await release(last);
  assert.equal(await release(last), failed);
  assert.equal(await balance(restaurantId(2)), 6);
  assert.equal((await claim(restaurantId(2), 'fixture-last-plan')).state, 'failed');
  assert.equal((await claim(restaurantId(2), 'fixture-last-plan')).claimed, false);
  await assert.rejects(() => run(`UPDATE public.ai_usage_logs SET status='success' WHERE id='${last.usage_id}'`), /image_reservation_units_immutable/);
  pass.push('last active-plan credit held through uncertainty; explicit cleanup releases once without reopening the key');

  const gifted = await claim(restaurantId(3), 'fixture-gift-finalize', staffId);
  assert.equal(await balance(restaurantId(3)), 6);
  const giftSpends = await sql(`SELECT json_agg(json_build_object('grant_id',grant_id,'credits',credits) ORDER BY grant_id)
    FROM private_finance.admin_ai_credit_spends WHERE usage_id='${gifted.usage_id}';`);
  assert.deepEqual(JSON.parse(giftSpends).map(row => row.credits), [3,3]);
  await advance(gifted, 'provider_started');
  await finalize(gifted, restaurantId(3));
  await finalize(gifted, restaurantId(3));
  assert.equal(await sql(`SELECT json_agg(json_build_object('grant_id',grant_id,'credits',credits) ORDER BY grant_id)
    FROM private_finance.admin_ai_credit_spends WHERE usage_id='${gifted.usage_id}';`), giftSpends);
  assert.equal(await sql(`SELECT metadata->>'admin_ai_gift_used' FROM public.ai_usage_logs WHERE id='${gifted.usage_id}';`), '6');
  assert.equal(await balance(restaurantId(3)), 6);
  const restored = await claim(restaurantId(3), 'fixture-gift-release', staffId);
  assert.equal(await balance(restaurantId(3)), 0);
  await sql(`UPDATE private_finance.admin_ai_credit_grants SET expires_at=clock_timestamp()-interval '1 minute'
    WHERE restaurant_id='${restaurantId(3)}';`);
  await advance(restored, 'cleanup_pending');
  await release(restored); await release(restored);
  assert.equal(await balance(restaurantId(3)), 0, 'Expired gifts do not become current balance');
  assert.equal(await sql(`SELECT sum(remaining) FROM private_finance.admin_ai_credit_grants WHERE restaurant_id='${restaurantId(3)}';`), '6');
  assert.equal(await sql(`SELECT sum(credits) FROM private_finance.ai_image_credit_releases WHERE operation_id='${restored.operation_id}';`), '6');
  assert.equal(await sql(`SELECT count(*) FROM private_finance.admin_ai_credit_spends WHERE usage_id='${restored.usage_id}';`), '0');
  pass.push('split gift allocations finalize unchanged and restore exactly the same expired lots once');

  assert.equal(await balance(restaurantId(4)), 2_000_000_000);
  for (let index=0; index<4; index+=1) assert.equal((await claim(restaurantId(4), `fixture-internal-${index}`)).claimed, true);
  assert.equal(await balance(restaurantId(4)), 2_000_000_000);
  await assert.rejects(() => claim(restaurantId(4), 'fixture-staff-no-grant', staffId), /TOK credits exhausted/);
  await assert.rejects(() => run(`INSERT INTO public.ad_campaigns(restaurant_id,payment_method,payment_status,total_budget)
    VALUES ('${restaurantId(4)}','credits','paid',1)`), /TOK credits exhausted/);
  pass.push('verified MTNR owner allowance retained; staff and sponsored campaigns cannot inherit it');

  for (const role of ['anon','authenticated']) {
    await assert.rejects(() => sql(`BEGIN; SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claim.role='${role}';
      ${claimStatement(restaurantId(1), 'fixture-unauthorized')}; COMMIT;`), /permission denied/);
    await assert.rejects(() => sql(`BEGIN; SET LOCAL ROLE ${role}; SELECT * FROM private_finance.ai_image_operations; COMMIT;`), /permission denied/);
  }
  assert.equal(await sql(`SELECT relrowsecurity FROM pg_class WHERE oid='private_finance.ai_image_operations'::regclass;`), 't');
  assert.equal(await sql(`SELECT has_function_privilege('service_role','public.claim_ai_image_operation(uuid,uuid,text,text,integer,text,text)','EXECUTE');`), 't');
  pass.push('new registry RLS and service-only RPC grants');
  return pass;
}
