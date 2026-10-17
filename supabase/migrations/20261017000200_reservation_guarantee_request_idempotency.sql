-- Persist the intent before creating Stripe objects. Parallel/retried requests
-- always reuse the same setup UUID and therefore the same Stripe keys.
ALTER TABLE public.reservation_card_guarantee_setups
  ADD COLUMN IF NOT EXISTS request_key text,
  ADD COLUMN IF NOT EXISTS request_payload jsonb,
  ADD COLUMN IF NOT EXISTS stripe_checkout_url text;
CREATE UNIQUE INDEX IF NOT EXISTS reservation_guarantee_request_user_key_uidx
  ON public.reservation_card_guarantee_setups(user_id, request_key)
  WHERE request_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_reservation_guarantee_request(
  p_user_id uuid, p_request_key text, p_request_payload jsonb, p_create boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_saved public.reservation_card_guarantee_setups%ROWTYPE;
  v_metadata jsonb := COALESCE(p_request_payload->'p_metadata', '{}'::jsonb) - '_internal_user_id';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Server guarantee authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid guarantee request key' USING ERRCODE = '22023';
  END IF;
  IF p_create THEN
    INSERT INTO public.reservation_card_guarantee_setups(
      user_id, restaurant_id, date, time, party_size, feature, metadata, notes,
      progressive_offer_id, acquisition_source, acquisition_channel_token,
      fee_amount_cents, request_key, request_payload)
    VALUES(p_user_id, (p_request_payload->>'p_restaurant_id')::uuid,
      (p_request_payload->>'p_date')::date, (p_request_payload->>'p_time')::time,
      (p_request_payload->>'p_party_size')::integer, p_request_payload->>'p_feature',
      v_metadata, p_request_payload->>'p_notes',
      (p_request_payload->>'p_progressive_offer_id')::uuid,
      v_metadata->>'acquisition_source', p_request_payload->>'acquisition_channel_token',
      (p_request_payload->>'p_party_size')::integer * 1000,
      p_request_key, p_request_payload)
    ON CONFLICT (user_id, request_key) WHERE request_key IS NOT NULL DO NOTHING;
  END IF;
  SELECT * INTO v_saved FROM public.reservation_card_guarantee_setups
    WHERE user_id = p_user_id AND request_key = p_request_key FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_saved.request_payload IS DISTINCT FROM p_request_payload THEN
    RAISE EXCEPTION 'guarantee_idempotency_conflict' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('id', v_saved.id, 'status', v_saved.status,
    'error_code', v_saved.error_code,
    'reservation_id', v_saved.reservation_id, 'checkout_url', v_saved.stripe_checkout_url,
    'fee_amount_cents', v_saved.fee_amount_cents);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_reservation_guarantee_request(uuid,text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reservation_guarantee_request(uuid,text,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_reservation_guarantee_request_result(p_request_key text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('status', s.status, 'reservation_id', s.reservation_id,
    'error_code', s.error_code,
    'checkout_url', s.stripe_checkout_url, 'fee_amount_cents', s.fee_amount_cents,
    'requires_card_guarantee', s.reservation_id IS NULL,
    'restaurant_id', s.restaurant_id, 'date', s.date, 'time', s.time, 'party_size', s.party_size)
  FROM public.reservation_card_guarantee_setups s
  WHERE s.user_id = auth.uid() AND s.request_key = p_request_key;
$$;
REVOKE ALL ON FUNCTION public.get_my_reservation_guarantee_request_result(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_reservation_guarantee_request_result(text) TO authenticated;
