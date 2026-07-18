-- Daily-dish demo research uses the existing atomic commercial OpenAI claim
-- budget. Complete it without polluting the normal assistant conversation.

BEGIN;

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_complete_daily_dish_request(
  p_request_id uuid,
  p_lock_token uuid,
  p_model text,
  p_result_hash text,
  p_variant_count integer,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_estimated_cost_chf numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.commercial_demo_ai_requests%ROWTYPE;
  v_response jsonb;
  v_session_active boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  SELECT request.* INTO v_request
  FROM public.commercial_demo_ai_requests request
  WHERE request.request_id = p_request_id
  FOR UPDATE;

  IF v_request.status = 'completed' THEN
    RETURN v_request.response;
  END IF;

  SELECT true INTO v_session_active
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = v_request.session_id
    AND session.status = 'active'
  FOR UPDATE;

  IF COALESCE(v_session_active, false) IS NOT TRUE
     OR v_request.id IS NULL
     OR v_request.status <> 'processing'
     OR v_request.lock_token <> p_lock_token
     OR v_request.action <> 'chat'
     OR v_request.tool <> 'assistant'
     OR char_length(btrim(COALESCE(p_model, ''))) NOT BETWEEN 1 AND 120
     OR COALESCE(p_result_hash, '') !~ '^[0-9a-f]{64}$'
     OR p_variant_count NOT BETWEEN 1 AND 3
     OR COALESCE(p_input_tokens, -1) < 0
     OR COALESCE(p_output_tokens, -1) < 0
     OR COALESCE(p_total_tokens, -1) < greatest(p_input_tokens, p_output_tokens)
     OR COALESCE(p_estimated_cost_chf, -1) < 0 THEN
    RAISE EXCEPTION 'invalid commercial demo daily dish completion' USING ERRCODE = '22023';
  END IF;

  v_response := jsonb_build_object(
    'request_id', p_request_id,
    'tool', 'daily_dish',
    'result_hash', p_result_hash,
    'variant_count', p_variant_count,
    'model', btrim(p_model),
    'input_tokens', p_input_tokens,
    'output_tokens', p_output_tokens,
    'total_tokens', p_total_tokens,
    'credit_units', 0,
    'estimated_cost_chf', p_estimated_cost_chf,
    'replayed', false,
    'created_at', now()
  );

  UPDATE public.commercial_demo_ai_requests
  SET status = 'completed',
      response = v_response,
      model = btrim(p_model),
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      total_tokens = p_total_tokens,
      estimated_cost_chf = p_estimated_cost_chf,
      completed_at = now(),
      updated_at = now()
  WHERE id = v_request.id;

  RETURN v_response;
END
$$;

REVOKE ALL ON FUNCTION public.commercial_demo_ai_complete_daily_dish_request(
  uuid, uuid, text, text, integer, integer, integer, integer, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_complete_daily_dish_request(
  uuid, uuid, text, text, integer, integer, integer, integer, numeric
) TO service_role;

COMMIT;
