-- Reviews must only be created through the verified submission RPC.
-- Direct client mutations previously allowed authenticated users to fabricate
-- reviews for any restaurant as long as user_id matched auth.uid().

CREATE OR REPLACE FUNCTION public.user_has_verified_restaurant_consumption(
  p_user_id uuid,
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND p_restaurant_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.reservations
        WHERE user_id = p_user_id
          AND restaurant_id = p_restaurant_id
          AND status = 'arrived'
      )
      OR EXISTS (
        SELECT 1
        FROM public.orders
        WHERE user_id = p_user_id
          AND restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) IN ('delivered', 'completed', 'ready_for_pickup', 'picked_up')
      )
    );
$$;

DROP FUNCTION IF EXISTS public.get_restaurant_review_submission_state(uuid);
CREATE OR REPLACE FUNCTION public.get_restaurant_review_submission_state(
  p_restaurant_id uuid
)
RETURNS TABLE (
  can_submit boolean,
  has_verified_consumption boolean,
  already_reviewed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_has_verified_consumption boolean := false;
  v_already_reviewed boolean := false;
BEGIN
  IF v_user IS NULL OR p_restaurant_id IS NULL THEN
    RETURN QUERY SELECT false, false, false;
    RETURN;
  END IF;

  v_has_verified_consumption := public.user_has_verified_restaurant_consumption(v_user, p_restaurant_id);

  SELECT EXISTS (
    SELECT 1
    FROM public.reviews
    WHERE user_id = v_user
      AND restaurant_id = p_restaurant_id
  )
  INTO v_already_reviewed;

  RETURN QUERY SELECT
    v_has_verified_consumption AND NOT v_already_reviewed,
    v_has_verified_consumption,
    v_already_reviewed;
END;
$$;

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
  v_verified_order_id uuid;
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

  IF p_reservation_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.reservations
      WHERE id = p_reservation_id
        AND user_id = v_user
        AND restaurant_id = p_restaurant_id
        AND status = 'arrived'
    )
    INTO v_eligible;
  END IF;

  IF NOT v_eligible AND p_order_id IS NOT NULL THEN
    SELECT id
    INTO v_verified_order_id
    FROM public.orders
    WHERE id = p_order_id
      AND user_id = v_user
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(status, '')) IN ('delivered', 'completed', 'ready_for_pickup', 'picked_up')
    LIMIT 1;

    v_eligible := v_verified_order_id IS NOT NULL;
  END IF;

  IF NOT v_eligible THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.reservations
      WHERE user_id = v_user
        AND restaurant_id = p_restaurant_id
        AND status = 'arrived'
    )
    INTO v_eligible;
  END IF;

  IF NOT v_eligible THEN
    SELECT id
    INTO v_verified_order_id
    FROM public.orders
    WHERE user_id = v_user
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(status, '')) IN ('delivered', 'completed', 'ready_for_pickup', 'picked_up')
    ORDER BY COALESCE(actual_delivered_at, delivered_at, picked_up_at, ready_at, updated_at, created_at) DESC
    LIMIT 1;

    v_eligible := v_verified_order_id IS NOT NULL;
  END IF;

  IF NOT v_eligible THEN
    RAISE EXCEPTION 'review_not_eligible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reviews
    WHERE user_id = v_user
      AND restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'review_already_submitted';
  END IF;

  INSERT INTO public.reviews (
    restaurant_id,
    user_id,
    rating,
    quality_rating,
    service_rating,
    speed_rating,
    comment,
    tags,
    order_id,
    status
  )
  VALUES (
    p_restaurant_id,
    v_user,
    p_rating,
    p_quality_rating,
    p_service_rating,
    p_speed_rating,
    NULLIF(trim(COALESCE(p_comment, '')), ''),
    COALESCE(p_tags, '{}'::text[]),
    v_verified_order_id,
    'published'
  )
  RETURNING id INTO v_review_id;

  RETURN v_review_id;
END;
$$;

CREATE INDEX IF NOT EXISTS reviews_user_restaurant_idx
  ON public.reviews (user_id, restaurant_id);

CREATE INDEX IF NOT EXISTS reservations_review_eligibility_idx
  ON public.reservations (user_id, restaurant_id)
  WHERE status = 'arrived';

CREATE INDEX IF NOT EXISTS orders_review_eligibility_idx
  ON public.orders (user_id, restaurant_id, updated_at DESC)
  WHERE lower(COALESCE(status, '')) IN ('delivered', 'completed', 'ready_for_pickup', 'picked_up');

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users manage own reviews" ON public.reviews;
DROP POLICY IF EXISTS "reviews_user_all" ON public.reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Admins can update reviews" ON public.reviews;
DROP POLICY IF EXISTS "Admins can delete reviews" ON public.reviews;
DROP POLICY IF EXISTS "reviews_no_direct_client_insert" ON public.reviews;

CREATE POLICY "reviews_no_direct_client_insert"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

REVOKE INSERT, UPDATE, DELETE ON public.reviews FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reviews FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.user_has_verified_restaurant_consumption(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_verified_restaurant_consumption(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_review_submission_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_review_submission_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_review_submission_state(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.submit_verified_review(uuid, integer, integer, integer, integer, text, text[], uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_verified_review(uuid, integer, integer, integer, integer, text, text[], uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_verified_review(uuid, integer, integer, integer, integer, text, text[], uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_verified_review(uuid, integer, integer, integer, integer, text, text[], uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
