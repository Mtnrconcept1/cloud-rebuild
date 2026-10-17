-- The request/result and the native booking commit in the same transaction.
-- Concurrent requests lock one actor/key row; never infer a result from similar bookings.
CREATE TABLE IF NOT EXISTS public.reservation_request_idempotency (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 8 AND 200),
  request_payload jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_key)
);
ALTER TABLE public.reservation_request_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reservation_request_idempotency FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.reservation_request_idempotency TO service_role;

CREATE OR REPLACE FUNCTION public.validate_and_create_reservation_idempotent(
  p_request_key text, p_user_id uuid, p_restaurant_id uuid, p_date date, p_time time,
  p_party_size integer, p_feature text DEFAULT 'classique',
  p_metadata jsonb DEFAULT '{}'::jsonb, p_notes text DEFAULT NULL,
  p_progressive_offer_id uuid DEFAULT NULL, p_replay_only boolean DEFAULT false
) RETURNS TABLE(reservation_id uuid, error_code text, error_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := p_user_id;
  v_payload jsonb;
  v_saved public.reservation_request_idempotency%ROWTYPE;
  v_result record;
BEGIN
  -- Only the authenticated Edge handler may invoke native booking after its
  -- pricing/card-guarantee checks. Never reopen the hardened direct SQL path.
  IF auth.role() IS DISTINCT FROM 'service_role' OR v_uid IS NULL THEN
    RAISE EXCEPTION 'Server booking authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('restaurant_id', p_restaurant_id, 'date', p_date,
    'time', p_time, 'party_size', p_party_size, 'feature', p_feature,
    'metadata', COALESCE(p_metadata, '{}'::jsonb) - '_internal_user_id',
    'notes', p_notes, 'progressive_offer_id', p_progressive_offer_id);
  IF NOT p_replay_only THEN
    INSERT INTO public.reservation_request_idempotency(user_id, request_key, request_payload)
    VALUES (v_uid, p_request_key, v_payload) ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO v_saved FROM public.reservation_request_idempotency
  WHERE user_id = v_uid AND request_key = p_request_key FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_saved.request_payload IS DISTINCT FROM v_payload THEN
    RETURN QUERY SELECT NULL::uuid, 'idempotency_conflict'::text,
      'Cette clé a déjà été utilisée pour une autre demande.'::text;
    RETURN;
  END IF;
  IF v_saved.result IS NULL THEN
    IF p_replay_only THEN RETURN; END IF;
    SELECT * INTO v_result FROM public.validate_and_create_reservation_safe(
      p_restaurant_id, p_date, p_time, p_party_size, p_feature,
      (COALESCE(p_metadata, '{}'::jsonb) - '_internal_user_id') || jsonb_build_object('_internal_user_id', v_uid),
      p_notes, p_progressive_offer_id);
    UPDATE public.reservation_request_idempotency SET result = to_jsonb(v_result)
    WHERE user_id = v_uid AND request_key = p_request_key RETURNING result INTO v_saved.result;
  END IF;
  RETURN QUERY SELECT (v_saved.result->>'reservation_id')::uuid,
    v_saved.result->>'error_code', v_saved.result->>'error_message';
END;
$$;
REVOKE ALL ON FUNCTION public.validate_and_create_reservation_idempotent(text, uuid, uuid, date, time, integer, text, jsonb, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation_idempotent(text, uuid, uuid, date, time, integer, text, jsonb, text, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_reservation_request_result(p_request_key text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT result FROM public.reservation_request_idempotency
  WHERE user_id = auth.uid() AND request_key = p_request_key;
$$;
REVOKE ALL ON FUNCTION public.get_my_reservation_request_result(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_reservation_request_result(text) TO authenticated;
