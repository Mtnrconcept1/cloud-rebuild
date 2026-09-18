BEGIN;

-- Dedicated lease-based claim for TheFork image truth reviews.
-- This keeps the deterministic verifier scoped to the current TheFork backfill
-- and leaves the generic global review queue untouched.
CREATE OR REPLACE FUNCTION public.service_claim_thefork_image_truth_reviews(
  p_limit integer DEFAULT 15
)
RETURNS TABLE (
  review_id uuid,
  lease_token uuid,
  restaurant_id uuid,
  restaurant_name text,
  restaurant_address text,
  restaurant_city text,
  candidate_url text,
  source_url text,
  directory_source text,
  attempt_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 15), 1), 25);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT review.id
    FROM public.restaurant_image_truth_reviews AS review
    JOIN public.restaurants AS restaurant
      ON restaurant.id = review.restaurant_id
    WHERE (
      (
        review.status IN ('queued', 'retry')
        AND review.next_attempt_at <= now()
      ) OR (
        review.status = 'processing'
        AND review.lease_expires_at < now()
      )
    )
      AND EXISTS (
        SELECT 1
        FROM public.marketing_contacts AS contact
        WHERE contact.source_objectid::text = restaurant.directory_source_reference
          AND contact.branch = 'Restaurant référencé sur TheFork'
      )
    ORDER BY review.next_attempt_at, review.created_at, review.id
    FOR UPDATE OF review SKIP LOCKED
    LIMIT v_limit
  ), claimed AS (
    UPDATE public.restaurant_image_truth_reviews AS review
    SET
      status = 'processing',
      attempts = LEAST(review.attempts + 1, 20),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '15 minutes',
      updated_at = now()
    FROM candidates
    WHERE review.id = candidates.id
    RETURNING review.*
  )
  SELECT
    claimed.id,
    claimed.lease_token,
    restaurant.id,
    restaurant.name,
    restaurant.address,
    restaurant.city,
    claimed.candidate_url,
    COALESCE(
      claimed.source_url,
      restaurant.directory_public_name_source_url,
      restaurant.directory_source_reference
    ),
    restaurant.directory_source,
    claimed.attempts
  FROM claimed
  JOIN public.restaurants AS restaurant
    ON restaurant.id = claimed.restaurant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_claim_thefork_image_truth_reviews(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_claim_thefork_image_truth_reviews(integer)
  TO service_role;

COMMIT;
