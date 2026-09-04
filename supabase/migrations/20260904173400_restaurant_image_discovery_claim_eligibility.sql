-- Apply restaurant eligibility guards to every claimable discovery status.
--
-- PostgreSQL gives AND a higher precedence than OR. The previous definition
-- therefore applied the restaurant filters only to the expired-processing
-- branch. This additive replacement groups both job-state branches before
-- checking that the restaurant is active, public-name verified, still a
-- directory listing and still missing an image.

CREATE OR REPLACE FUNCTION public.claim_restaurant_image_discovery_jobs(
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  restaurant_id uuid,
  lease_token uuid,
  restaurant_name text,
  restaurant_address text,
  restaurant_city text,
  source_url text,
  attempt_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT jobs.restaurant_id
    FROM public.restaurant_image_discovery_jobs AS jobs
    JOIN public.restaurants AS restaurant ON restaurant.id = jobs.restaurant_id
    WHERE (
      (
        jobs.status IN ('queued', 'retry', 'no_candidate')
        AND jobs.next_attempt_at <= now()
      ) OR (
        jobs.status = 'processing'
        AND jobs.lease_expires_at < now()
      )
    )
      AND COALESCE(restaurant.is_active, false)
      AND COALESCE(restaurant.is_directory_listing, false)
      AND COALESCE(restaurant.directory_public_name_verified, false)
      AND NULLIF(btrim(restaurant.image_url), '') IS NULL
    ORDER BY jobs.next_attempt_at, jobs.updated_at, jobs.restaurant_id
    FOR UPDATE OF jobs SKIP LOCKED
    LIMIT v_limit
  ), claimed AS (
    UPDATE public.restaurant_image_discovery_jobs AS jobs
    SET
      status = 'processing',
      attempts = LEAST(jobs.attempts + 1, 50),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '15 minutes',
      updated_at = now()
    FROM candidates
    WHERE jobs.restaurant_id = candidates.restaurant_id
    RETURNING jobs.*
  )
  SELECT
    restaurant.id,
    claimed.lease_token,
    restaurant.name,
    restaurant.address,
    restaurant.city,
    COALESCE(
      claimed.source_url,
      restaurant.directory_public_name_source_url,
      restaurant.directory_source_reference
    ),
    claimed.attempts
  FROM claimed
  JOIN public.restaurants AS restaurant ON restaurant.id = claimed.restaurant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_restaurant_image_discovery_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_image_discovery_jobs(integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
