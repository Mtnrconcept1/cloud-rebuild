
-- Dedicated lease-based claim for TheFork image truth reviews.
-- The existing deterministic verifier may additionally consume one explicitly
-- marked technical retry batch. All other global reviews remain untouched.
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
      AND (
        EXISTS (
        SELECT 1
        FROM public.marketing_contacts AS contact
        WHERE contact.source_objectid::text = restaurant.directory_source_reference
          AND contact.branch = 'Restaurant référencé sur TheFork'
        ) OR (
          review.evidence ->> 'technical_retry_batch' = 'tok_openai_400_20261021'
          AND COALESCE(restaurant.is_active, false)
          AND COALESCE(restaurant.is_directory_listing, false)
          AND COALESCE(restaurant.directory_public_name_verified, false)
          AND NULLIF(btrim(restaurant.image_url), '') IS NULL
        )
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



-- Old OpenAI request failures are transport errors, not image decisions.
-- Recheck at most the 35 existing failures through the current deterministic
-- verifier; preserve original evidence/reason and do not publish any image here.
WITH technical_failures AS (
  SELECT review.id
  FROM public.restaurant_image_truth_reviews AS review
  JOIN public.restaurants AS restaurant ON restaurant.id = review.restaurant_id
  WHERE review.status = 'rejected'
    AND review.decision_reason = 'openai_http_400'
    AND NOT (review.evidence ? 'technical_retry_batch')
    AND NOT EXISTS (
      SELECT 1 FROM public.restaurant_image_truth_reviews AS prior_batch
      WHERE prior_batch.evidence ->> 'technical_retry_batch' = 'tok_openai_400_20261021'
    )
    AND review.candidate_url ~* '^https?://[^[:space:]]+$'
    AND review.source_url ~* '^https?://[^[:space:]]+$'
    AND COALESCE(restaurant.is_active, false)
    AND COALESCE(restaurant.is_directory_listing, false)
    AND COALESCE(restaurant.directory_public_name_verified, false)
    AND NULLIF(btrim(restaurant.image_url), '') IS NULL
  ORDER BY review.created_at, review.id
  FOR UPDATE OF review SKIP LOCKED
  LIMIT 35
)
UPDATE public.restaurant_image_truth_reviews AS review
SET status = 'queued',
    next_attempt_at = now(),
    lease_token = NULL,
    lease_expires_at = NULL,
    evidence = review.evidence || jsonb_build_object(
      'technical_retry_batch', 'tok_openai_400_20261021',
      'technical_retry_previous_reason', review.decision_reason,
      'technical_retry_queued_at', now()
    ),
    updated_at = now()
FROM technical_failures
WHERE review.id = technical_failures.id
  AND review.status = 'rejected'
  AND review.decision_reason = 'openai_http_400';

NOTIFY pgrst, 'reload schema';
