BEGIN;

CREATE OR REPLACE FUNCTION public.service_claim_thefork_image_discovery_jobs(
  p_limit integer DEFAULT 2
)
RETURNS TABLE (
  restaurant_id uuid,
  restaurant_name text,
  restaurant_address text,
  restaurant_city text,
  directory_source_reference text,
  website text,
  email text,
  attempt_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 2), 1), 3);
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
      AND (
        (
          job.status IN ('not_found', 'error')
          AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= now())
          AND COALESCE(job.last_error, '') NOT LIKE 'thefork_recovery:permanent:%'
        )
        OR (
          job.status = 'processing'
          AND job.locked_at < now() - interval '15 minutes'
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
    ORDER BY
      CASE WHEN job.source_page_url IS NOT NULL THEN 0 ELSE 1 END,
      COALESCE(job.next_attempt_at, job.updated_at),
      job.restaurant_id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT v_limit
  ), claimed AS (
    UPDATE public.restaurant_directory_image_jobs AS job
    SET
      status = 'processing',
      attempts = LEAST(GREATEST(job.attempts, 0), 3),
      last_attempt_at = now(),
      locked_at = now(),
      next_attempt_at = NULL,
      last_error = NULL,
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
    contact.website,
    contact.email,
    claimed.attempts
  FROM claimed
  JOIN public.restaurants AS restaurant
    ON restaurant.id = claimed.restaurant_id
  LEFT JOIN LATERAL (
    SELECT
      NULLIF(btrim(marketing.website), '') AS website,
      NULLIF(btrim(marketing.email), '') AS email
    FROM public.marketing_contacts AS marketing
    WHERE marketing.source_objectid::text = restaurant.directory_source_reference
      AND marketing.branch = 'Restaurant référencé sur TheFork'
    ORDER BY marketing.updated_at DESC NULLS LAST, marketing.id
    LIMIT 1
  ) AS contact ON true;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_claim_thefork_image_discovery_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_claim_thefork_image_discovery_jobs(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.service_claim_thefork_official_site_discovery_jobs(
  p_limit integer DEFAULT 1
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
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1), 1), 2);
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
      AND (
        (
          job.status = 'not_found'
          AND job.last_error = 'thefork_recovery:permanent:no_verified_official_image'
        )
        OR (
          job.status = 'not_found'
          AND job.last_error = 'thefork_site_discovery:retry'
          AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= now())
        )
        OR (
          job.status = 'processing'
          AND job.last_error = 'thefork_site_discovery:processing'
          AND job.locked_at < now() - interval '15 minutes'
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

DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('tok-thefork-image-recovery', 'tok-directory-image-truth-verifier')
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'tok-thefork-image-recovery',
    '* * * * *',
    'SELECT public.invoke_thefork_image_recovery_worker(2);'
  );

  PERFORM cron.schedule(
    'tok-directory-image-truth-verifier',
    '* * * * *',
    'SELECT public.invoke_directory_image_truth_worker(6);'
  );
END;
$do$;

COMMIT;
