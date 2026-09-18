BEGIN;

CREATE OR REPLACE FUNCTION public.prioritize_thefork_image_truth_reviews()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_updated integer := 0;
BEGIN
  -- Called only from the private SECURITY DEFINER cron invoker. Access is
  -- restricted by REVOKE/GRANT below, so no request JWT is required here.
  WITH prioritized AS (
    UPDATE public.restaurant_image_truth_reviews AS review
    SET
      next_attempt_at = LEAST(
        review.next_attempt_at,
        timestamptz '2000-01-01 00:00:00+00'
      ),
      updated_at = now()
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = review.restaurant_id
      AND review.status IN ('queued', 'retry')
      AND EXISTS (
        SELECT 1
        FROM public.marketing_contacts AS contact
        WHERE contact.source_objectid::text = restaurant.directory_source_reference
          AND contact.branch = 'Restaurant référencé sur TheFork'
      )
      AND review.next_attempt_at > timestamptz '2000-01-01 00:00:00+00'
    RETURNING review.id
  )
  SELECT count(*)::integer INTO v_updated FROM prioritized;

  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.prioritize_thefork_image_truth_reviews()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prioritize_thefork_image_truth_reviews()
  TO service_role;

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
  -- Keep the existing generic SKIP LOCKED claim intact, but make currently
  -- actionable TheFork reviews sort before the historical global backlog.
  PERFORM public.prioritize_thefork_image_truth_reviews();

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

COMMIT;
