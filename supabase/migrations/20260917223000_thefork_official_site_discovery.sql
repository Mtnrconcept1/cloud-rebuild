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
      AND job.last_error = 'thefork_recovery:permanent:no_verified_official_image'
      AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= now())
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

CREATE OR REPLACE FUNCTION public.invoke_thefork_official_site_discovery_worker(
  p_limit integer DEFAULT 8
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
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 15);
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
    url := v_base_url || '/functions/v1/discover-thefork-official-sites',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-cron-secret', v_cron_secret
    ),
    body := jsonb_build_object(
      'mode', 'process_batch',
      'limit', v_limit,
      'source', 'thefork-official-site-discovery-cron'
    ),
    timeout_milliseconds := 55000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.invoke_thefork_official_site_discovery_worker(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_thefork_official_site_discovery_worker(integer)
  TO service_role;

DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'tok-thefork-official-site-discovery'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'tok-thefork-official-site-discovery',
    '* * * * *',
    'SELECT public.invoke_thefork_official_site_discovery_worker(8);'
  );
END;
$do$;

COMMIT;
