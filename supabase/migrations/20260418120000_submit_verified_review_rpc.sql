-- Verified review submission. A review is "verified" when the author either:
--   (a) honored a reservation at the restaurant (status in 'arrived' or 'no_show'
--       does NOT count - only 'arrived'), OR
--   (b) has a delivered/picked-up order at the restaurant.
-- Prevents duplicate reviews per (user, restaurant).

CREATE OR REPLACE FUNCTION public.submit_verified_review(
  p_restaurant_id uuid,
  p_rating integer,
  p_service_rating integer,
  p_quality_rating integer,
  p_speed_rating integer,
  p_comment text DEFAULT NULL,
  p_tags text[] DEFAULT '{}'::text[],
  p_reservation_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_eligible boolean := false;
  v_review_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF p_rating NOT BETWEEN 1 AND 10
     OR p_service_rating NOT BETWEEN 1 AND 10
     OR p_quality_rating NOT BETWEEN 1 AND 10
     OR p_speed_rating NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'rating_out_of_range';
  END IF;

  -- Eligibility check: explicit reservation provided, OR explicit order provided,
  -- OR any honored reservation/delivered order exists for this user at this restaurant.
  IF p_reservation_id IS NOT NULL THEN
    SELECT TRUE INTO v_eligible
    FROM public.reservations
    WHERE id = p_reservation_id
      AND user_id = v_user
      AND restaurant_id = p_restaurant_id
      AND status = 'arrived';
  END IF;

  IF NOT v_eligible AND p_order_id IS NOT NULL THEN
    SELECT TRUE INTO v_eligible
    FROM public.orders
    WHERE id = p_order_id
      AND user_id = v_user
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(status, '')) IN ('delivered', 'completed', 'ready_for_pickup', 'picked_up');
  END IF;

  IF NOT v_eligible THEN
    SELECT TRUE INTO v_eligible
    FROM public.reservations
    WHERE user_id = v_user
      AND restaurant_id = p_restaurant_id
      AND status = 'arrived'
    LIMIT 1;
  END IF;

  IF NOT v_eligible THEN
    SELECT TRUE INTO v_eligible
    FROM public.orders
    WHERE user_id = v_user
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(status, '')) IN ('delivered', 'completed', 'ready_for_pickup', 'picked_up')
    LIMIT 1;
  END IF;

  IF NOT v_eligible THEN
    RAISE EXCEPTION 'review_not_eligible';
  END IF;

  -- Prevent duplicate review for the same restaurant by the same user.
  IF EXISTS (
    SELECT 1 FROM public.reviews
    WHERE user_id = v_user AND restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'review_already_submitted';
  END IF;

  INSERT INTO public.reviews (
    restaurant_id, user_id, rating, quality_rating, service_rating, speed_rating,
    comment, tags, order_id, status
  )
  VALUES (
    p_restaurant_id, v_user, p_rating, p_quality_rating, p_service_rating, p_speed_rating,
    NULLIF(trim(COALESCE(p_comment, '')), ''),
    COALESCE(p_tags, '{}'::text[]),
    p_order_id,
    'published'
  )
  RETURNING id INTO v_review_id;

  RETURN v_review_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_verified_review(uuid, integer, integer, integer, integer, text, text[], uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_verified_review(uuid, integer, integer, integer, integer, text, text[], uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_verified_review(uuid, integer, integer, integer, integer, text, text[], uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_verified_review(uuid, integer, integer, integer, integer, text, text[], uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
