BEGIN;

CREATE OR REPLACE FUNCTION public.service_claim_thefork_official_site_discovery_jobs(
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  restaurant_id uuid,
  restaurant_name text,
  restaurant_address text,
  restaurant_city text,
  directory_source_reference text,
  attempt_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 15);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.restaurant_id
    FROM public.restaurant_directory_image_jobs AS job
    JOIN public.restaurants AS restaurant
      ON restaurant.id = job.restaurant_id
    WHERE restaurant.is_directory_listing IS TRUE
      AND restaurant.is_active IS TRUE
      AND restaurant.directory_public_name_verified IS TRUE
      AND NULLIF(btrim(COALESCE(restaurant.image_url, '')), '') IS NULL
      AND job.status = 'not_found'
      AND (
        job.last_error = 'thefork_recovery:permanent:no_verified_official_image'
        OR (
          job.last_error = 'thefork_site_discovery:retry'
          AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= now())
        )
      )
      AND EXISTS (
        SELECT 1
        FROM public.marketing_contacts AS contact
        WHERE contact.source_objectid::text = restaurant.directory_source_reference
          AND contact.branch = 'Restaurant référencé sur TheFork'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.restaurant_image_truth_reviews AS review
        WHERE review.restaurant_id = restaurant.id
          AND review.status IN ('queued', 'processing', 'retry')
      )
    ORDER BY COALESCE(job.last_attempt_at, job.updated_at), job.restaurant_id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT v_limit
  ), claimed AS (
    UPDATE public.restaurant_directory_image_jobs AS job
    SET
      status = 'processing',
      locked_at = now(),
      last_attempt_at = now(),
      next_attempt_at = NULL,
      last_error = 'thefork_site_discovery:processing',
      updated_at = now()
    FROM candidates
    WHERE job.restaurant_id = candidates.restaurant_id
    RETURNING job.restaurant_id, job.attempts
  )
  SELECT
    restaurant.id,
    restaurant.name,
    restaurant.address,
    restaurant.city,
    restaurant.directory_source_reference,
    claimed.attempts
  FROM claimed
  JOIN public.restaurants AS restaurant
    ON restaurant.id = claimed.restaurant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_claim_thefork_official_site_discovery_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_claim_thefork_official_site_discovery_jobs(integer)
  TO service_role;

COMMIT;
