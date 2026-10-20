-- Keep an explicitly repaired discovery source ahead of an older candidate page.
-- Only HTTP(S) sources cross the claim boundary; publication still requires truth review.

CREATE OR REPLACE FUNCTION public.claim_restaurant_image_discovery_jobs_for_edge(
  p_limit integer DEFAULT 1
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
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1), 1), 3);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT jobs.restaurant_id
    FROM public.restaurant_image_discovery_jobs AS jobs
    JOIN public.restaurants AS restaurant
      ON restaurant.id = jobs.restaurant_id
    LEFT JOIN public.restaurant_directory_image_jobs AS image_jobs
      ON image_jobs.restaurant_id = jobs.restaurant_id
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
      AND (
        NULLIF(btrim(image_jobs.source_page_url), '') ~* '^https?://[^[:space:]]+$'
        OR NULLIF(btrim(jobs.source_url), '') ~* '^https?://[^[:space:]]+$'
        OR NULLIF(btrim(restaurant.directory_public_name_source_url), '') ~* '^https?://[^[:space:]]+$'
      )
    ORDER BY
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.marketing_contacts AS contact
          WHERE contact.source_objectid::text = restaurant.directory_source_reference
            AND contact.branch = 'Restaurant référencé sur TheFork'
        ) THEN 0
        ELSE 1
      END,
      CASE jobs.status
        WHEN 'queued' THEN 0
        WHEN 'retry' THEN 1
        ELSE 2
      END,
      CASE
        WHEN NULLIF(btrim(image_jobs.source_page_url), '') ~* '^https?://[^[:space:]]+$' THEN 0
        ELSE 1
      END,
      jobs.next_attempt_at,
      jobs.updated_at,
      jobs.restaurant_id
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
      CASE WHEN btrim(claimed.source_url) ~* '^https?://[^[:space:]]+$'
        THEN btrim(claimed.source_url) END,
      CASE WHEN btrim(image_jobs.source_page_url) ~* '^https?://[^[:space:]]+$'
        THEN btrim(image_jobs.source_page_url) END,
      CASE WHEN btrim(restaurant.directory_public_name_source_url) ~* '^https?://[^[:space:]]+$'
        THEN btrim(restaurant.directory_public_name_source_url) END
    ),
    claimed.attempts
  FROM claimed
  JOIN public.restaurants AS restaurant
    ON restaurant.id = claimed.restaurant_id
  LEFT JOIN public.restaurant_directory_image_jobs AS image_jobs
    ON image_jobs.restaurant_id = claimed.restaurant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_restaurant_image_discovery_jobs_for_edge(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_image_discovery_jobs_for_edge(integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
