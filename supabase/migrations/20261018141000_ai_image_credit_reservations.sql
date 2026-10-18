BEGIN;

-- One durable intention, funded by the existing native usage ledger. A reserved
-- row is an admission receipt, not evidence that an image has been generated.
CREATE TABLE IF NOT EXISTS private_finance.ai_image_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN (
    'reserved','provider_started','completed','failed','indeterminate','cleanup_pending'
  )),
  credit_units integer NOT NULL CHECK (credit_units IN (6,12)),
  usage_id uuid NOT NULL UNIQUE REFERENCES public.ai_usage_logs(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  worker_token uuid NOT NULL DEFAULT gen_random_uuid(),
  generation_seed text NOT NULL CHECK (char_length(generation_seed) BETWEEN 1 AND 160),
  available_credits_before numeric NOT NULL,
  result_response jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  provider_started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS ai_image_operations_unresolved_idx
  ON private_finance.ai_image_operations (state,updated_at)
  WHERE state NOT IN ('completed','failed');
ALTER TABLE private_finance.ai_image_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private_finance.ai_image_operations FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS private_finance.ai_image_credit_releases (
  operation_id uuid NOT NULL REFERENCES private_finance.ai_image_operations(id) ON DELETE RESTRICT,
  grant_id uuid NOT NULL REFERENCES private_finance.admin_ai_credit_grants(id) ON DELETE RESTRICT,
  credits integer NOT NULL CHECK (credits > 0),
  original_spent_at timestamptz NOT NULL,
  released_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL,
  PRIMARY KEY (operation_id,grant_id)
);
ALTER TABLE private_finance.ai_image_credit_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private_finance.ai_image_credit_releases FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_image_operation(
  p_user_id uuid,p_restaurant_id uuid,p_idempotency_key text,p_request_hash text,
  p_credit_units integer,p_generation_seed text,p_model text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_operation private_finance.ai_image_operations%ROWTYPE;
  v_operation_id uuid := gen_random_uuid();
  v_usage_id uuid := gen_random_uuid();
  v_available numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'image_operation_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL OR p_restaurant_id IS NULL
    OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_.:-]{8,200}$'
    OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$'
    OR p_credit_units IS NULL OR p_credit_units NOT IN (6,12)
    OR p_generation_seed IS NULL OR char_length(p_generation_seed) NOT BETWEEN 1 AND 160
    OR p_model IS NULL OR char_length(p_model) NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'image_operation_invalid_input' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.id=p_restaurant_id
      AND (r.owner_id=p_user_id OR public.has_role(p_user_id,'admin')
        OR EXISTS (SELECT 1 FROM public.restaurant_staff st
          WHERE st.restaurant_id=r.id AND st.user_id=p_user_id))
  ) THEN RAISE EXCEPTION 'image_operation_forbidden' USING ERRCODE='42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ai_image_key:' || p_user_id::text || ':' || p_idempotency_key)::bigint);
  SELECT * INTO v_operation FROM private_finance.ai_image_operations
    WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_operation.restaurant_id IS DISTINCT FROM p_restaurant_id
      OR v_operation.request_hash IS DISTINCT FROM p_request_hash
      OR v_operation.credit_units IS DISTINCT FROM p_credit_units
    THEN RAISE EXCEPTION 'image_idempotency_conflict' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('claimed',false,'operation_id',v_operation.id,
      'state',v_operation.state,'response',v_operation.result_response,'error_code',v_operation.error_code);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || p_restaurant_id::text)::bigint);
  v_available := public.tok_credit_balance_from_usage(public.get_restaurant_credit_usage(p_restaurant_id));
  IF v_available IS NULL OR v_available < p_credit_units THEN
    RAISE EXCEPTION 'TOK credits exhausted for restaurant %: required %, available %',
      p_restaurant_id,p_credit_units,v_available USING ERRCODE='P0001';
  END IF;
  -- The existing normalization, quota, verified internal grant and admin gift
  -- triggers all run on this insertion under their normal restaurant lock.
  INSERT INTO public.ai_usage_logs (
    id,function_name,action,model,user_id,restaurant_id,status,estimated_cost_chf,metadata,created_at
  ) VALUES (
    v_usage_id,'ai-image-enhance','image_credit_reservation',p_model,p_user_id,p_restaurant_id,
    'success',0,jsonb_build_object('credit_kind','photo_retouch','credit_units',p_credit_units,
      'requested_output_credit_units',p_credit_units,'billing_phase','reserved',
      'image_operation_id',v_operation_id,'generated_image',false),clock_timestamp()
  );
  INSERT INTO private_finance.ai_image_operations (
    id,user_id,restaurant_id,idempotency_key,request_hash,credit_units,usage_id,
    generation_seed,available_credits_before
  ) VALUES (v_operation_id,p_user_id,p_restaurant_id,p_idempotency_key,p_request_hash,
    p_credit_units,v_usage_id,p_generation_seed,v_available) RETURNING * INTO v_operation;
  RETURN jsonb_build_object('claimed',true,'operation_id',v_operation.id,'state',v_operation.state,
    'worker_token',v_operation.worker_token,'asset_id',v_operation.asset_id,'usage_id',v_operation.usage_id,
    'generation_seed',v_operation.generation_seed,'available_credits_before',v_available);
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_ai_image_operation(
  p_operation_id uuid,p_worker_token uuid,p_transition text,p_reason text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_operation private_finance.ai_image_operations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'image_operation_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_operation FROM private_finance.ai_image_operations WHERE id=p_operation_id;
  IF NOT FOUND OR v_operation.worker_token IS DISTINCT FROM p_worker_token THEN
    RAISE EXCEPTION 'image_operation_not_owned' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_operation.restaurant_id::text)::bigint);
  SELECT * INTO v_operation FROM private_finance.ai_image_operations WHERE id=p_operation_id FOR UPDATE;
  IF p_transition='provider_started' AND v_operation.state='reserved' THEN
    UPDATE private_finance.ai_image_operations SET state='provider_started',
      provider_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p_operation_id;
  ELSIF p_transition='indeterminate' AND v_operation.state IN ('provider_started','indeterminate') THEN
    UPDATE private_finance.ai_image_operations SET state='indeterminate',error_code=left(p_reason,200),
      updated_at=clock_timestamp() WHERE id=p_operation_id;
  ELSIF p_transition='cleanup_pending'
    AND v_operation.state IN ('reserved','provider_started','indeterminate','cleanup_pending')
    AND nullif(btrim(p_reason),'') IS NOT NULL THEN
    UPDATE private_finance.ai_image_operations SET state='cleanup_pending',error_code=left(p_reason,200),
      updated_at=clock_timestamp() WHERE id=p_operation_id;
  ELSE RAISE EXCEPTION 'image_operation_invalid_transition' USING ERRCODE='23514'; END IF;
  RETURN p_transition;
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.guard_ai_image_reservation_usage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_operation private_finance.ai_image_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_operation FROM private_finance.ai_image_operations WHERE usage_id=OLD.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  -- AFTER UPDATE deliberately sees every BEFORE normalizer's final values.
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.restaurant_id IS DISTINCT FROM v_operation.restaurant_id
    OR NEW.user_id IS DISTINCT FROM v_operation.user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.function_name IS DISTINCT FROM 'ai-image-enhance'
    OR NEW.metadata->>'credit_units' IS DISTINCT FROM v_operation.credit_units::text
    OR NEW.metadata->>'requested_output_credit_units' IS DISTINCT FROM v_operation.credit_units::text
    OR NEW.estimated_cost_chf IS NULL
    OR NEW.estimated_cost_chf < 0 OR NEW.estimated_cost_chf > v_operation.credit_units * 0.009
    OR (NEW.status='success' AND OLD.status<>'success')
    OR (NEW.status<>'success' AND v_operation.state<>'cleanup_pending')
  THEN RAISE EXCEPTION 'image_reservation_units_immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private_finance.guard_ai_image_reservation_usage()
  FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS zzz_guard_ai_image_reservation_usage ON public.ai_usage_logs;
CREATE TRIGGER zzz_guard_ai_image_reservation_usage AFTER UPDATE ON public.ai_usage_logs
  FOR EACH ROW EXECUTE FUNCTION private_finance.guard_ai_image_reservation_usage();

CREATE OR REPLACE FUNCTION public.finalize_ai_image_operation(
  p_operation_id uuid,p_worker_token uuid,p_asset jsonb,p_usage jsonb,p_metadata jsonb,p_response jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_operation private_finance.ai_image_operations%ROWTYPE;
  v_cost numeric := (p_usage->>'estimated_cost_chf')::numeric;
  v_metadata jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'image_operation_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_operation FROM private_finance.ai_image_operations WHERE id=p_operation_id;
  IF NOT FOUND OR v_operation.worker_token IS DISTINCT FROM p_worker_token THEN
    RAISE EXCEPTION 'image_operation_not_owned' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_operation.restaurant_id::text)::bigint);
  SELECT * INTO v_operation FROM private_finance.ai_image_operations WHERE id=p_operation_id FOR UPDATE;
  IF v_operation.state='completed' THEN RETURN v_operation.result_response; END IF;
  IF v_operation.state NOT IN ('provider_started','indeterminate') THEN
    RAISE EXCEPTION 'image_operation_invalid_transition' USING ERRCODE='23514'; END IF;
  IF v_cost IS NULL OR v_cost < 0 OR v_cost > v_operation.credit_units * 0.009
    OR p_metadata->>'credit_units' IS DISTINCT FROM v_operation.credit_units::text
    OR p_response->>'assetId' IS DISTINCT FROM v_operation.asset_id::text
    OR p_response->>'credit_units' IS DISTINCT FROM v_operation.credit_units::text
    OR p_response->>'status' IS DISTINCT FROM 'stored'
    OR p_asset->>'storage_path' IS DISTINCT FROM
      'ai-generated/' || v_operation.restaurant_id::text || '/' || v_operation.asset_id::text || '.png'
  THEN RAISE EXCEPTION 'image_reservation_units_immutable' USING ERRCODE='23514'; END IF;

  INSERT INTO public.ai_generated_assets (
    id,restaurant_id,user_id,source_image_url,asset_url,storage_bucket,storage_path,
    asset_type,model,prompt,title,status,metadata
  ) VALUES (
    v_operation.asset_id,v_operation.restaurant_id,v_operation.user_id,p_asset->>'source_image_url',
    p_asset->>'asset_url',p_asset->>'storage_bucket',p_asset->>'storage_path',p_asset->>'asset_type',
    p_asset->>'model',p_asset->>'prompt',p_asset->>'title','stored',
    coalesce(p_asset->'metadata','{}'::jsonb) || jsonb_build_object('image_operation_id',v_operation.id)
  );
  SELECT metadata INTO v_metadata FROM public.ai_usage_logs WHERE id=v_operation.usage_id FOR UPDATE;
  -- The gift trigger returns immediately for OLD.status=success. Preserve its
  -- real allocation marker; client/provider metadata cannot fabricate a gift.
  UPDATE public.ai_usage_logs SET action='image_enhance',generated_asset_id=v_operation.asset_id,
    provider_request_id=left(p_usage->>'provider_request_id',200),estimated_cost_chf=v_cost,
    input_tokens=coalesce((p_usage->>'input_tokens')::integer,0),
    output_tokens=coalesce((p_usage->>'output_tokens')::integer,0),
    total_tokens=coalesce((p_usage->>'total_tokens')::integer,0),
    metadata=(coalesce(p_metadata,'{}'::jsonb)-'admin_ai_gift_used')
      || CASE WHEN v_metadata ? 'admin_ai_gift_used'
        THEN jsonb_build_object('admin_ai_gift_used',v_metadata->'admin_ai_gift_used') ELSE '{}'::jsonb END
      || jsonb_build_object('credit_kind','photo_retouch','credit_units',v_operation.credit_units,
        'requested_output_credit_units',v_operation.credit_units,'billing_phase','completed',
        'image_operation_id',v_operation.id,'generated_image',true)
  WHERE id=v_operation.usage_id;
  UPDATE private_finance.ai_image_operations SET state='completed',result_response=p_response,
    error_code=NULL,completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p_operation_id;
  RETURN p_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ai_image_operation(
  p_operation_id uuid,p_worker_token uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_operation private_finance.ai_image_operations%ROWTYPE;
  v_spend record;
  v_response jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'image_operation_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_operation FROM private_finance.ai_image_operations WHERE id=p_operation_id;
  IF NOT FOUND OR v_operation.worker_token IS DISTINCT FROM p_worker_token THEN
    RAISE EXCEPTION 'image_operation_not_owned' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_operation.restaurant_id::text)::bigint);
  SELECT * INTO v_operation FROM private_finance.ai_image_operations WHERE id=p_operation_id FOR UPDATE;
  IF v_operation.state='failed' THEN RETURN v_operation.result_response; END IF;
  IF v_operation.state<>'cleanup_pending' OR nullif(btrim(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'image_operation_invalid_transition' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_generated_assets WHERE id=v_operation.asset_id) THEN
    RAISE EXCEPTION 'image_operation_asset_already_committed' USING ERRCODE='23514'; END IF;
  FOR v_spend IN SELECT * FROM private_finance.admin_ai_credit_spends
    WHERE usage_id=v_operation.usage_id ORDER BY grant_id FOR UPDATE
  LOOP
    INSERT INTO private_finance.ai_image_credit_releases (operation_id,grant_id,credits,original_spent_at,reason)
      VALUES (v_operation.id,v_spend.grant_id,v_spend.credits,v_spend.created_at,left(p_reason,200));
    -- Restore exactly the original lots, including their unchanged expiry.
    UPDATE private_finance.admin_ai_credit_grants SET remaining=remaining+v_spend.credits
      WHERE id=v_spend.grant_id;
  END LOOP;
  DELETE FROM private_finance.admin_ai_credit_spends WHERE usage_id=v_operation.usage_id;
  UPDATE public.ai_usage_logs SET status='failure',metadata=coalesce(metadata,'{}'::jsonb)
    || jsonb_build_object('billing_phase','released','generated_image',false,'failure_reason',left(p_reason,200))
    WHERE id=v_operation.usage_id;
  v_response := jsonb_build_object('error','image_generation_failed','operation_id',v_operation.id,
    'state','failed','retry_safe',true);
  UPDATE private_finance.ai_image_operations SET state='failed',result_response=v_response,
    error_code=left(p_reason,200),completed_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=p_operation_id;
  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_image_operation(uuid,uuid,text,text,integer,text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.advance_ai_image_operation(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_ai_image_operation(uuid,uuid,jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.release_ai_image_operation(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_image_operation(uuid,uuid,text,text,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_ai_image_operation(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_ai_image_operation(uuid,uuid,jsonb,jsonb,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_image_operation(uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
