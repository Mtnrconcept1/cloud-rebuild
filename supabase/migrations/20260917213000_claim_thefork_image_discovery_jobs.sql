BEGIN;

-- Complete the TheFork directory image pipeline without exposing Vault secrets
-- or allowing the generic directory worker to compete for the same rows.
--
-- The generic worker already tried these records up to three times. This
-- migration isolates the remaining TheFork rows, schedules the image-truth
-- verifier that was missing from pg_cron, and gives the dedicated recovery
-- worker a SKIP LOCKED claim RPC.

CREATE OR REPLACE FUNCTION public.service_claim_thefork_image_discovery_jobs(
  p_limit integer DEFAULT 5
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
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 15);
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
      AND job.status IN ('not_found', 'error')
      AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= now())
      AND COALESCE(job.last_error, '') NOT LIKE 'thefork_recovery:permanent:%'
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

-- Environment-bound internal edge invocation. marketing_edge_url is already a
-- per-environment Vault secret; only its Supabase base URL is reused here.
CREATE OR REPLACE FUNCTION public.invoke_directory_image_truth_worker(
  p_limit integer DEFAULT 10
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_base_url text;
  v_cron_secret text;
  v_request_id bigint;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
BEGIN
  SELECT regexp_replace(
    btrim(secret.decrypted_secret),
    '/functions/v1/marketing-orchestrator$',
    ''
  )
  INTO v_base_url
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name = 'marketing_edge_url'
  LIMIT 1;

  SELECT btrim(secret.decrypted_secret)
  INTO v_cron_secret
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name = 'internal_cron_secret'
  LIMIT 1;

  IF NULLIF(v_cron_secret, '') IS NULL
     OR COALESCE(v_base_url ~ '^https://[a-z0-9-]+[.]supabase[.]co$', false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_base_url || '/functions/v1/verify-directory-image-truth',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-cron-secret', v_cron_secret
    ),
    body := jsonb_build_object(
      'mode', 'process_batch',
      'limit', v_limit,
      'source', 'directory-image-truth-cron'
    ),
    timeout_milliseconds := 55000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.invoke_directory_image_truth_worker(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_directory_image_truth_worker(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_thefork_image_recovery_worker(
  p_limit integer DEFAULT 6
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_base_url text;
  v_cron_secret text;
  v_request_id bigint;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 6), 1), 15);
BEGIN
  SELECT regexp_replace(
    btrim(secret.decrypted_secret),
    '/functions/v1/marketing-orchestrator$',
    ''
  )
  INTO v_base_url
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name = 'marketing_edge_url'
  LIMIT 1;

  SELECT btrim(secret.decrypted_secret)
  INTO v_cron_secret
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name = 'internal_cron_secret'
  LIMIT 1;

  IF NULLIF(v_cron_secret, '') IS NULL
     OR COALESCE(v_base_url ~ '^https://[a-z0-9-]+[.]supabase[.]co$', false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_base_url || '/functions/v1/enrich-thefork-images',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-cron-secret', v_cron_secret
    ),
    body := jsonb_build_object(
      'mode', 'process_batch',
      'limit', v_limit,
      'source', 'thefork-image-recovery-cron'
    ),
    timeout_milliseconds := 55000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.invoke_thefork_image_recovery_worker(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_thefork_image_recovery_worker(integer)
  TO service_role;

-- Prevent the generic image cron from consuming the TheFork recovery backlog.
-- The dedicated claim RPC intentionally does not reject attempts=3.
UPDATE public.restaurant_directory_image_jobs AS job
SET
  status = 'not_found',
  attempts = 3,
  locked_at = NULL,
  next_attempt_at = now(),
  last_error = CASE
    WHEN COALESCE(job.last_error, '') LIKE 'thefork_recovery:%' THEN job.last_error
    ELSE NULL
  END,
  updated_at = now()
FROM public.restaurants AS restaurant
WHERE restaurant.id = job.restaurant_id
  AND restaurant.is_directory_listing IS TRUE
  AND restaurant.is_active IS TRUE
  AND NULLIF(btrim(COALESCE(restaurant.image_url, '')), '') IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.marketing_contacts AS contact
    WHERE contact.source_objectid::text = restaurant.directory_source_reference
      AND contact.branch = 'Restaurant référencé sur TheFork'
  )
  AND job.status <> 'processing';

DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'tok-directory-image-truth-verifier',
      'tok-thefork-image-recovery'
    )
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'tok-directory-image-truth-verifier',
    '* * * * *',
    'SELECT public.invoke_directory_image_truth_worker(15);'
  );

  PERFORM cron.schedule(
    'tok-thefork-image-recovery',
    '* * * * *',
    'SELECT public.invoke_thefork_image_recovery_worker(6);'
  );
END;
$do$;

COMMIT;
