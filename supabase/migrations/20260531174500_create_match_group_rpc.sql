CREATE OR REPLACE FUNCTION public.create_match_group(
  p_restaurant_id uuid,
  p_area text,
  p_scheduled_at timestamptz,
  p_max_members integer DEFAULT 6
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_time_slot text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant requis';
  END IF;

  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Choisissez un horaire au moins 5 minutes dans le futur.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND COALESCE(r.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'Restaurant indisponible';
  END IF;

  v_time_slot := to_char(p_scheduled_at AT TIME ZONE 'Europe/Zurich', 'DD Mon HH24:MI');

  INSERT INTO public.order_groups (
    restaurant_id,
    creator_id,
    area,
    time_slot,
    max_members,
    discount_percentage,
    expires_at,
    scheduled_at,
    lock_at,
    status,
    is_active,
    min_discount_percentage,
    max_discount_percentage,
    discount_step_percentage
  )
  VALUES (
    p_restaurant_id,
    v_user_id,
    COALESCE(NULLIF(p_area, ''), 'Ma position'),
    v_time_slot,
    LEAST(GREATEST(COALESCE(p_max_members, 6), 2), 12),
    5,
    p_scheduled_at,
    p_scheduled_at,
    p_scheduled_at,
    'open',
    true,
    5,
    30,
    5
  )
  RETURNING id INTO v_group_id;

  RETURN v_group_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_match_group(uuid, text, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_match_group(uuid, text, timestamptz, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
