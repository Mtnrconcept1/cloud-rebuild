-- Dedicated commercial demo only: presentation AI remains fully server-side and
-- auditable, but no longer stops after an arbitrary daily call/cost allowance.
-- Operational safeguards (kill switch, idempotency, stale-lock recovery,
-- concurrency limits and provider circuit breaker) remain mandatory.

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_claim_request(
  p_request_id uuid,
  p_session_id uuid,
  p_actor_user_id uuid,
  p_commercial_user_id uuid,
  p_demo_restaurant_id uuid,
  p_action text,
  p_tool text,
  p_payload_hash text,
  p_lock_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_existing public.commercial_demo_ai_requests%ROWTYPE;
  v_session_ok boolean := false;
  v_global_processing integer := 0;
  v_session_processing integer := 0;
  v_provider_failures integer := 0;
  v_now timestamptz := now();
  v_minimum_reservation_chf numeric;
  v_request_reservation_chf numeric;
  v_is_new boolean := false;
  v_was_failed boolean := false;
  v_feature_enabled boolean := false;
BEGIN
  IF p_request_id IS NULL OR p_session_id IS NULL OR p_actor_user_id IS NULL
     OR p_commercial_user_id IS NULL OR p_demo_restaurant_id IS NULL OR p_lock_token IS NULL
     OR COALESCE(p_payload_hash, '') !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid commercial demo AI claim' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    (p_action = 'chat' AND p_tool IN ('assistant', 'support_chat'))
    OR
    (p_action = 'visual_generate'
      AND p_tool IN ('marketing_studio', 'photo_studio', 'advisor_visual'))
  ) THEN
    RAISE EXCEPTION 'invalid commercial demo AI action/tool' USING ERRCODE = '22023';
  END IF;

  -- This reservation is accounting metadata only. It keeps per-request cost
  -- observability intact but is never used as a presentation quota.
  v_minimum_reservation_chf := CASE
    WHEN p_action = 'visual_generate' THEN 0.50
    ELSE 0.10
  END;

  SELECT true INTO v_session_ok
  FROM public.commercial_demo_order_sessions session
  JOIN public.commercial_demo_accounts account
    ON account.user_id = session.commercial_user_id
   AND account.demo_restaurant_id = session.demo_restaurant_id
   AND account.is_active
  JOIN public.restaurants restaurant
    ON restaurant.id = session.demo_restaurant_id
   AND restaurant.is_demo
  WHERE session.id = p_session_id
    AND session.status = 'active'
    AND session.commercial_user_id = p_commercial_user_id
    AND session.commercial_user_id = p_actor_user_id
    AND session.demo_restaurant_id = p_demo_restaurant_id
  FOR UPDATE OF session, account, restaurant;
  IF COALESCE(v_session_ok, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'commercial demo AI session is not active or mapped' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-request:' || p_request_id::text, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-global-claim', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-session:' || p_session_id::text, 0)
  );

  SELECT request.* INTO v_existing
  FROM public.commercial_demo_ai_requests request
  WHERE request.request_id = p_request_id
  FOR UPDATE;
  v_is_new := v_existing.id IS NULL;
  v_feature_enabled := COALESCE(
    public.is_feature_flag_active('commercial-demo-openai'), false
  );

  IF NOT v_is_new THEN
    IF v_existing.session_id <> p_session_id
       OR v_existing.commercial_user_id <> p_commercial_user_id
       OR v_existing.demo_restaurant_id <> p_demo_restaurant_id
       OR v_existing.action <> p_action
       OR v_existing.tool <> p_tool
       OR v_existing.payload_hash <> p_payload_hash
    THEN
      RETURN jsonb_build_object('state', 'mismatch');
    END IF;
    IF NOT v_feature_enabled THEN
      RETURN jsonb_build_object('state', 'disabled', 'feature', 'commercial-demo-openai');
    END IF;
    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object(
        'state', 'replay',
        'response', v_existing.response,
        'request_id', v_existing.request_id
      );
    END IF;
    IF v_existing.status = 'processing'
      AND v_existing.locked_at > v_now - interval '3 minutes'
    THEN
      RETURN jsonb_build_object(
        'state', 'in_progress',
        'request_id', v_existing.request_id
      );
    END IF;
    IF v_existing.status NOT IN ('failed', 'processing') THEN
      RETURN jsonb_build_object('state', 'mismatch');
    END IF;
    v_was_failed := v_existing.status = 'failed';
    v_request_reservation_chf := GREATEST(
      v_existing.budget_reserved_chf,
      v_existing.estimated_cost_chf
    ) + v_minimum_reservation_chf;
  ELSE
    v_request_reservation_chf := v_minimum_reservation_chf;
  END IF;

  -- Idempotent replays never bypass the server-side kill switch.
  IF NOT v_feature_enabled THEN
    RETURN jsonb_build_object('state', 'disabled', 'feature', 'commercial-demo-openai');
  END IF;

  UPDATE public.commercial_demo_ai_requests request
  SET status = 'failed',
      error_code = 'request_abandoned',
      completed_at = v_now,
      updated_at = v_now
  WHERE request.status = 'processing'
    AND request.locked_at <= v_now - interval '3 minutes';

  SELECT count(*) INTO v_provider_failures
  FROM public.commercial_demo_ai_provider_failures failure
  WHERE failure.occurred_at > v_now - interval '90 seconds';
  IF v_provider_failures >= 6 THEN
    RETURN jsonb_build_object('state', 'circuit_open', 'retry_after_seconds', 90);
  END IF;

  SELECT count(*) INTO v_global_processing
  FROM public.commercial_demo_ai_requests request
  WHERE request.status = 'processing'
    AND request.request_id <> p_request_id
    AND request.locked_at > v_now - interval '3 minutes';
  SELECT count(*) INTO v_session_processing
  FROM public.commercial_demo_ai_requests request
  WHERE request.status = 'processing'
    AND request.request_id <> p_request_id
    AND request.session_id = p_session_id
    AND request.locked_at > v_now - interval '3 minutes';
  IF v_global_processing >= 12 OR v_session_processing >= 2 THEN
    RETURN jsonb_build_object('state', 'busy', 'retry_after_seconds', 5);
  END IF;

  IF NOT v_is_new THEN
    UPDATE public.commercial_demo_ai_requests request
    SET actor_user_id = p_actor_user_id,
        status = 'processing',
        lock_token = p_lock_token,
        response = NULL,
        error_code = NULL,
        model = NULL,
        provider_response_id = NULL,
        input_tokens = 0,
        output_tokens = 0,
        total_tokens = 0,
        estimated_cost_chf = 0,
        budget_reserved_chf = v_request_reservation_chf,
        provider_attempt_count = request.provider_attempt_count + 1,
        locked_at = v_now,
        completed_at = NULL,
        updated_at = v_now
    WHERE request.id = v_existing.id;
    RETURN jsonb_build_object(
      'state', 'claimed',
      'request_id', p_request_id,
      'retry_after_failure', v_was_failed,
      'recovered_stale_lock', NOT v_was_failed,
      'budget_reserved_chf', v_request_reservation_chf
    );
  END IF;

  INSERT INTO public.commercial_demo_ai_requests (
    request_id, session_id, commercial_user_id, demo_restaurant_id,
    actor_user_id, action, tool, payload_hash, lock_token,
    budget_reserved_chf, provider_attempt_count
  ) VALUES (
    p_request_id, p_session_id, p_commercial_user_id, p_demo_restaurant_id,
    p_actor_user_id, p_action, p_tool, p_payload_hash, p_lock_token,
    v_request_reservation_chf, 1
  );
  RETURN jsonb_build_object(
    'state', 'claimed',
    'request_id', p_request_id,
    'budget_reserved_chf', v_request_reservation_chf
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.commercial_demo_ai_claim_request(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_claim_request(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_claim_request(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid) TO service_role;

DO $postflight$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.commercial_demo_ai_claim_request(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid)'::regprocedure
  ) INTO v_definition;

  IF position('commercial-demo-openai' in v_definition) = 0
     OR position('pg_advisory_xact_lock' in v_definition) = 0
     OR position('v_global_processing >= 12' in v_definition) = 0
     OR position('v_session_processing >= 2' in v_definition) = 0
     OR position('circuit_open' in v_definition) = 0
     OR position('provider_attempt_count' in v_definition) = 0
     OR position('budget_reserved_chf' in v_definition) = 0
  THEN
    RAISE EXCEPTION 'commercial demo AI operational safeguards were not preserved';
  END IF;
END;
$postflight$;
