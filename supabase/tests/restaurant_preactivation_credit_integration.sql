-- Run after fixture + migration on disposable PostgreSQL only.
\set ON_ERROR_STOP on

CREATE TRIGGER guard_tok_credit_spend_ai_usage_logs
BEFORE INSERT OR UPDATE OF restaurant_id,status,metadata
ON public.ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_restaurant_tok_credit_spend();

CREATE TRIGGER guard_tok_credit_spend_ad_campaigns
BEFORE INSERT OR UPDATE OF restaurant_id,payment_method,payment_status,total_budget,spent,paid_amount
ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION public.guard_restaurant_tok_credit_spend();

DO $test$
DECLARE
  v_usage jsonb;
  v_allowed jsonb;
  v_blocked boolean;
  v_week timestamptz := date_trunc('week',now() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich';
  v_last_week timestamptz := (date_trunc('week',now() AT TIME ZONE 'Europe/Zurich') - interval '1 week') AT TIME ZONE 'Europe/Zurich';
BEGIN
  IF has_function_privilege('anon', 'private_finance.get_restaurant_preactivation_credit_usage(uuid,timestamptz,boolean)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'private_finance.get_restaurant_preactivation_credit_usage(uuid,timestamptz,boolean)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Private replay helper exposed to client roles';
  END IF;

  -- Restaurant 1: 15 trial credits, then strict 402-like DB denial.
  v_usage := public.get_restaurant_credit_usage('00000000-0000-4000-8000-000000000001');
  IF (v_usage->'credits'->0->>'balance')::numeric <> 15
    OR (v_usage->'credits'->0->>'included_allowance')::numeric <> 15
    OR (v_usage->'credits'->0->>'topup_balance')::numeric <> 0
  THEN RAISE EXCEPTION 'Trial opening balance incorrect: %',v_usage; END IF;

  INSERT INTO public.ai_usage_logs(restaurant_id,status,metadata)
    VALUES ('00000000-0000-4000-8000-000000000001','success','{"credit_units":15}');
  v_usage := public.get_restaurant_credit_usage('00000000-0000-4000-8000-000000000001');
  IF (v_usage->'credits'->0->>'balance')::numeric <> 0
  THEN RAISE EXCEPTION 'Trial overspending before block: %',v_usage; END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO public.ai_usage_logs(restaurant_id,status,metadata)
      VALUES ('00000000-0000-4000-8000-000000000001','success','{"credit_units":1}');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION '16th free AI credit was accepted'; END IF;

  -- A missing or zero credit_units field must never bypass the transaction
  -- trigger (the actual ledger counts such logs as at least one credit).
  v_blocked := false;
  BEGIN
    INSERT INTO public.ai_usage_logs(restaurant_id,status,metadata)
      VALUES ('00000000-0000-4000-8000-000000000001','success','{}');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Missing credit units bypassed guard'; END IF;
  v_blocked := false;
  BEGIN
    INSERT INTO public.ai_usage_logs(restaurant_id,status,metadata)
      VALUES ('00000000-0000-4000-8000-000000000001','success','{"credit_units":0}');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Zero credit units bypassed guard'; END IF;

  v_allowed := public.check_restaurant_ai_quota(
    '00000000-0000-4000-8000-000000000001','ai_sales_insights',1);
  IF (v_allowed->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Quota RPC did not block exhausted trial: %',v_allowed;
  END IF;

  -- Restaurant 2: a paid six-credit pack can be consumed immediately, beyond
  -- its fifteen free credits, but cannot be spent twice.
  INSERT INTO public.restaurant_credit_purchases(restaurant_id,status,ai_tool_credits,paid_at)
    VALUES ('00000000-0000-4000-8000-000000000002','paid',6,now()-interval '3 minutes');
  INSERT INTO public.ai_usage_logs(restaurant_id,status,metadata)
    VALUES ('00000000-0000-4000-8000-000000000002','success','{"credit_units":15}');
  v_usage := public.get_restaurant_credit_usage('00000000-0000-4000-8000-000000000002');
  IF (v_usage->'credits'->0->>'balance')::numeric <> 6
    OR (v_usage->'credits'->0->>'topup_balance')::numeric <> 6
  THEN RAISE EXCEPTION 'Paid credits unavailable after free allowance: %',v_usage; END IF;
  INSERT INTO public.ai_usage_logs(restaurant_id,status,metadata)
    VALUES ('00000000-0000-4000-8000-000000000002','success','{"credit_units":6}');
  v_usage := public.get_restaurant_credit_usage('00000000-0000-4000-8000-000000000002');
  IF (v_usage->'credits'->0->>'balance')::numeric <> 0
  THEN RAISE EXCEPTION 'Paid pack double counted: %',v_usage; END IF;

  -- Restaurant 3: free AI credits cannot fund a paid campaign.
  v_blocked := false;
  BEGIN
    INSERT INTO public.ad_campaigns(restaurant_id,payment_method,payment_status,total_budget)
      VALUES ('00000000-0000-4000-8000-000000000003','credits','paid',1);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Free trial credits funded a campaign'; END IF;

  INSERT INTO public.restaurant_credit_purchases(restaurant_id,status,ai_tool_credits,paid_at)
    VALUES ('00000000-0000-4000-8000-000000000003','paid',15,now()-interval '2 minutes');
  INSERT INTO public.ad_campaigns(restaurant_id,payment_method,payment_status,total_budget)
    VALUES ('00000000-0000-4000-8000-000000000003','credits','paid',1);
  v_usage := public.get_restaurant_credit_usage('00000000-0000-4000-8000-000000000003');
  IF (v_usage->'credits'->0->'metadata'->>'campaign_spendable_balance')::numeric <> 0
    OR (v_usage->'credits'->0->>'balance')::numeric <> 15
  THEN RAISE EXCEPTION 'Paid campaign wrongly spent free AI credits: %',v_usage; END IF;

  -- Restaurant 4: unactivated subscription gets trial, and only verified
  -- activation changes the allowance path; paid pack is preserved.
  INSERT INTO public.restaurant_ai_subscriptions(restaurant_id,status)
    VALUES ('00000000-0000-4000-8000-000000000004','awaiting_payment_method');
  INSERT INTO public.restaurant_credit_purchases(restaurant_id,status,ai_tool_credits,paid_at)
    VALUES ('00000000-0000-4000-8000-000000000004','paid',40,now()-interval '3 hours');
  INSERT INTO public.ai_usage_logs(restaurant_id,status,metadata,created_at)
    VALUES ('00000000-0000-4000-8000-000000000004','success','{"credit_units":5}',now()-interval '2 hours');
  v_usage := public.get_restaurant_credit_usage('00000000-0000-4000-8000-000000000004');
  IF (v_usage->'credits'->0->>'balance')::numeric <> 50
    OR (v_usage->'credits'->0->>'included_allowance')::numeric <> 15
  THEN RAISE EXCEPTION 'Inactive plan improperly credited: %',v_usage; END IF;

  UPDATE public.restaurant_ai_subscriptions
  SET status='active',activated_at=now()-interval '1 hour',current_period_start=now()-interval '1 hour',
    current_period_end=now()+interval '1 month'
  WHERE restaurant_id='00000000-0000-4000-8000-000000000004';
  v_usage := public.get_restaurant_credit_usage('00000000-0000-4000-8000-000000000004');
  IF (v_usage->'credits'->0->>'included_allowance')::numeric <> 100
    OR (v_usage->'credits'->0->>'topup_balance')::numeric <> 35
  THEN RAISE EXCEPTION 'Active plan or paid topup missing at activation: %',v_usage; END IF;

  -- Restaurant 5: usage from the previous Swiss civil week does not consume
  -- this week's 15 credits; a free weekly allowance never accumulates to 30.
  INSERT INTO public.ai_usage_logs(restaurant_id,status,metadata,created_at)
    VALUES ('00000000-0000-4000-8000-000000000005','success','{"credit_units":15}',v_last_week+interval '2 hours');
  v_usage := public.get_restaurant_credit_usage('00000000-0000-4000-8000-000000000005');
  IF (v_usage->'credits'->0->>'balance')::numeric <> 15
    OR (v_usage->'period'->>'start')::timestamptz <> v_week
  THEN RAISE EXCEPTION 'Weekly reset or week boundary incorrect: %',v_usage; END IF;

  -- The oldest settled pack is used first, and an expired pack cannot be used.
  INSERT INTO public.restaurant_credit_purchases(restaurant_id,status,ai_tool_credits,paid_at)
  VALUES ('00000000-0000-4000-8000-000000000007','paid',7,now()-interval '13 months');
  v_usage := public.get_restaurant_credit_usage('00000000-0000-4000-8000-000000000007');
  IF (v_usage->'credits'->0->>'topup_balance')::numeric <> 0
  THEN RAISE EXCEPTION 'Expired pack incorrectly made available: %',v_usage; END IF;

  RAISE NOTICE 'SQL integration assertions passed: weekly cap, topups, campaigns, activation, expiry';
END
$test$;

-- Separate restaurant ID for the parallel-client transaction check.
-- Its first 10-credit request and a concurrent 10-credit request must not
-- both succeed while its free-only allowance is 15 credits.
