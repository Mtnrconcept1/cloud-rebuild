CREATE OR REPLACE FUNCTION public.create_reservation_hold(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source_channel text DEFAULT 'web'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_slot record;
  v_hold_id uuid;
  v_guest_profile_id uuid;
  v_branch_id uuid := public.get_restaurant_primary_branch_id(p_restaurant_id);
  v_shift_turn_minutes integer := 120;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.reservation_holds
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at <= now();

  SELECT *
  INTO v_slot
  FROM public.quote_reservation_availability(
    p_restaurant_id,
    p_date,
    p_party_size,
    COALESCE(p_source_channel, 'web')
  )
  WHERE slot_time = p_time
  LIMIT 1;

  IF v_slot.slot_time IS NULL OR NOT COALESCE(v_slot.available, false) THEN
    RETURN NULL;
  END IF;

  IF v_slot.shift_id IS NOT NULL THEN
    SELECT turn_time_minutes
    INTO v_shift_turn_minutes
    FROM public.service_shifts
    WHERE id = v_slot.shift_id;
  END IF;

  v_guest_profile_id := public.ensure_guest_profile(p_restaurant_id, v_user_id, p_source_channel);

  INSERT INTO public.reservation_holds (
    restaurant_id,
    branch_id,
    shift_id,
    user_id,
    guest_profile_id,
    reservation_date,
    reservation_time,
    party_size,
    turn_time_minutes,
    source_channel,
    guarantee_policy,
    inventory_assignment,
    risk_snapshot,
    metadata,
    expires_at
  )
  VALUES (
    p_restaurant_id,
    v_branch_id,
    v_slot.shift_id,
    v_user_id,
    v_guest_profile_id,
    p_date,
    p_time,
    p_party_size,
    COALESCE(v_shift_turn_minutes, 120),
    COALESCE(p_source_channel, 'web'),
    jsonb_build_object(
      'requires_guarantee', v_slot.requires_guarantee,
      'requires_deposit', v_slot.requires_deposit,
      'deposit_amount', v_slot.deposit_amount,
      'no_show_fee', v_slot.no_show_fee
    ),
    jsonb_build_object(
      'mode', 'capacity_pool',
      'capacity_remaining', v_slot.capacity_remaining
    ),
    jsonb_build_object(
      'risk_level', v_slot.risk_level
    ),
    COALESCE(p_metadata, '{}'::jsonb),
    now() + interval '10 minutes'
  )
  RETURNING id INTO v_hold_id;

  RETURN v_hold_id;
END;
$$;
