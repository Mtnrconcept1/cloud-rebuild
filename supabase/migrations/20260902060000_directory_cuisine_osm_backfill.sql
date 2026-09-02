-- Second-pass cuisine enrichment for directory restaurants that remain unresolved.
-- OpenStreetMap evidence is accepted only after strong identity matching in the Edge Function.
-- This migration is additive and does not remove or replace any existing cuisine assignment.

BEGIN;

CREATE TABLE IF NOT EXISTS public.restaurant_directory_cuisine_osm_jobs (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'not_found', 'error')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  priority smallint NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  source_page_url text,
  evidence_count integer NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_directory_cuisine_osm_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_directory_cuisine_osm_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.restaurant_directory_cuisine_osm_jobs TO service_role;

CREATE INDEX IF NOT EXISTS restaurant_directory_cuisine_osm_jobs_due_idx
  ON public.restaurant_directory_cuisine_osm_jobs(priority DESC, status, next_attempt_at, attempts, created_at)
  WHERE status IN ('pending', 'processing', 'not_found', 'error');

-- Public/verified directory names are processed first because these records are already visible to users.
INSERT INTO public.restaurant_directory_cuisine_osm_jobs (restaurant_id, status, priority)
SELECT
  r.id,
  'pending',
  CASE WHEN r.directory_public_name_verified IS TRUE THEN 100 ELSE 0 END
FROM public.restaurants r
WHERE r.is_directory_listing IS TRUE
  AND r.is_active IS TRUE
  AND r.latitude IS NOT NULL
  AND r.longitude IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.restaurant_cuisines rc
    WHERE rc.restaurant_id = r.id
  )
ON CONFLICT (restaurant_id) DO UPDATE
SET priority = GREATEST(
      public.restaurant_directory_cuisine_osm_jobs.priority,
      EXCLUDED.priority
    ),
    updated_at = now();

-- If another trusted enrichment path already resolved a restaurant, stop spending network work on it.
UPDATE public.restaurant_directory_cuisine_osm_jobs job
SET status = 'success',
    evidence_count = GREATEST(
      job.evidence_count,
      (SELECT count(*)::integer FROM public.restaurant_cuisines rc WHERE rc.restaurant_id = job.restaurant_id)
    ),
    next_attempt_at = NULL,
    locked_at = NULL,
    last_error = NULL,
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM public.restaurant_cuisines rc
  WHERE rc.restaurant_id = job.restaurant_id
);

CREATE OR REPLACE FUNCTION public.service_claim_directory_cuisine_osm_jobs(p_limit integer DEFAULT 18)
RETURNS TABLE(restaurant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 18), 1), 24);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  UPDATE public.restaurant_directory_cuisine_osm_jobs job
  SET status = 'success',
      evidence_count = GREATEST(
        job.evidence_count,
        (SELECT count(*)::integer FROM public.restaurant_cuisines rc WHERE rc.restaurant_id = job.restaurant_id)
      ),
      next_attempt_at = NULL,
      locked_at = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE job.status <> 'success'
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_cuisines rc
      WHERE rc.restaurant_id = job.restaurant_id
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT job.restaurant_id
    FROM public.restaurant_directory_cuisine_osm_jobs job
    JOIN public.restaurants r ON r.id = job.restaurant_id
    WHERE r.is_directory_listing IS TRUE
      AND r.is_active IS TRUE
      AND r.latitude IS NOT NULL
      AND r.longitude IS NOT NULL
      AND job.attempts < 5
      AND NOT EXISTS (
        SELECT 1
        FROM public.restaurant_cuisines rc
        WHERE rc.restaurant_id = job.restaurant_id
      )
      AND (
        job.status IN ('pending', 'not_found', 'error')
        OR (job.status = 'processing' AND job.locked_at < now() - interval '15 minutes')
      )
      AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= now())
    ORDER BY job.priority DESC,
             job.attempts ASC,
             COALESCE(job.next_attempt_at, job.created_at) ASC,
             job.restaurant_id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.restaurant_directory_cuisine_osm_jobs job
  SET status = 'processing',
      attempts = job.attempts + 1,
      last_attempt_at = now(),
      next_attempt_at = NULL,
      locked_at = now(),
      last_error = NULL,
      updated_at = now()
  FROM candidates candidate
  WHERE job.restaurant_id = candidate.restaurant_id
  RETURNING job.restaurant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_claim_directory_cuisine_osm_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_claim_directory_cuisine_osm_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.service_apply_directory_cuisine_osm_evidence(
  p_restaurant_id uuid,
  p_source_url text,
  p_assignments jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE id = p_restaurant_id
      AND is_directory_listing IS TRUE
  ) THEN
    RAISE EXCEPTION 'directory restaurant not found';
  END IF;

  IF jsonb_typeof(p_assignments) <> 'array'
     OR jsonb_array_length(p_assignments) = 0
     OR jsonb_array_length(p_assignments) > 12 THEN
    RAISE EXCEPTION 'invalid cuisine assignments';
  END IF;

  WITH submitted AS (
    SELECT DISTINCT
      NULLIF(btrim(item.slug), '') AS slug,
      NULLIF(btrim(item.label), '') AS label,
      LEAST(GREATEST(COALESCE(item.confidence, 0.9), 0), 1)::numeric(4, 3) AS confidence,
      COALESCE(item.evidence, '{}'::jsonb) AS evidence
    FROM jsonb_to_recordset(p_assignments) AS item(
      slug text,
      label text,
      confidence numeric,
      evidence jsonb
    )
    WHERE NULLIF(btrim(item.slug), '') IS NOT NULL
  ), inserted AS (
    INSERT INTO public.restaurant_cuisine_evidence (
      restaurant_id,
      cuisine_id,
      source_kind,
      source_url,
      source_label,
      confidence,
      evidence,
      verified_at,
      updated_at
    )
    SELECT
      p_restaurant_id,
      cuisine.id,
      'openstreetmap_live',
      p_source_url,
      submitted.label,
      submitted.confidence,
      submitted.evidence,
      now(),
      now()
    FROM submitted
    JOIN public.cuisines cuisine
      ON cuisine.slug = submitted.slug
     AND cuisine.archived_at IS NULL
    ON CONFLICT (restaurant_id, cuisine_id, source_kind) DO UPDATE
    SET source_url = EXCLUDED.source_url,
        source_label = EXCLUDED.source_label,
        confidence = EXCLUDED.confidence,
        evidence = EXCLUDED.evidence,
        verified_at = EXCLUDED.verified_at,
        updated_at = now()
    RETURNING restaurant_id, cuisine_id
  )
  INSERT INTO public.restaurant_cuisines (restaurant_id, cuisine_id)
  SELECT restaurant_id, cuisine_id
  FROM inserted
  ON CONFLICT (restaurant_id, cuisine_id) DO NOTHING;

  SELECT count(*)::integer
  INTO v_count
  FROM public.restaurant_cuisine_evidence
  WHERE restaurant_id = p_restaurant_id;

  UPDATE public.restaurant_directory_cuisine_osm_jobs
  SET status = CASE WHEN v_count > 0 THEN 'success' ELSE 'not_found' END,
      evidence_count = v_count,
      source_page_url = p_source_url,
      next_attempt_at = CASE WHEN v_count > 0 THEN NULL ELSE now() + interval '14 days' END,
      locked_at = NULL,
      last_error = CASE WHEN v_count > 0 THEN NULL ELSE 'no_verified_osm_cuisine' END,
      updated_at = now()
  WHERE restaurant_id = p_restaurant_id;

  -- The first-pass official-site queue no longer needs to retry once any trusted cuisine exists.
  UPDATE public.restaurant_directory_cuisine_jobs
  SET status = CASE WHEN v_count > 0 THEN 'success' ELSE status END,
      evidence_count = GREATEST(evidence_count, v_count),
      next_attempt_at = CASE WHEN v_count > 0 THEN NULL ELSE next_attempt_at END,
      locked_at = CASE WHEN v_count > 0 THEN NULL ELSE locked_at END,
      last_error = CASE WHEN v_count > 0 THEN NULL ELSE last_error END,
      updated_at = now()
  WHERE restaurant_id = p_restaurant_id;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_apply_directory_cuisine_osm_evidence(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_apply_directory_cuisine_osm_evidence(uuid, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.restaurants_enqueue_directory_cuisine_osm_research()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_directory_listing IS TRUE
     AND NEW.is_active IS TRUE
     AND NEW.latitude IS NOT NULL
     AND NEW.longitude IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.restaurant_cuisines rc WHERE rc.restaurant_id = NEW.id
     ) THEN
    INSERT INTO public.restaurant_directory_cuisine_osm_jobs (
      restaurant_id,
      status,
      priority,
      attempts,
      next_attempt_at,
      locked_at,
      last_error,
      updated_at
    )
    VALUES (
      NEW.id,
      'pending',
      CASE WHEN NEW.directory_public_name_verified IS TRUE THEN 100 ELSE 0 END,
      0,
      NULL,
      NULL,
      NULL,
      now()
    )
    ON CONFLICT (restaurant_id) DO UPDATE
    SET status = CASE
          WHEN public.restaurant_directory_cuisine_osm_jobs.status = 'success' THEN 'success'
          ELSE 'pending'
        END,
        priority = GREATEST(
          public.restaurant_directory_cuisine_osm_jobs.priority,
          EXCLUDED.priority
        ),
        attempts = CASE
          WHEN public.restaurant_directory_cuisine_osm_jobs.status = 'success'
            THEN public.restaurant_directory_cuisine_osm_jobs.attempts
          ELSE 0
        END,
        next_attempt_at = NULL,
        locked_at = NULL,
        last_error = NULL,
        updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS restaurants_enqueue_directory_cuisine_osm_research ON public.restaurants;
CREATE TRIGGER restaurants_enqueue_directory_cuisine_osm_research
AFTER INSERT OR UPDATE OF is_directory_listing, is_active, latitude, longitude, directory_public_name_verified
ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.restaurants_enqueue_directory_cuisine_osm_research();

CREATE OR REPLACE FUNCTION public.restaurant_cuisines_mark_osm_job_satisfied()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.restaurant_directory_cuisine_osm_jobs
  SET status = 'success',
      evidence_count = GREATEST(
        evidence_count,
        (SELECT count(*)::integer FROM public.restaurant_cuisines rc WHERE rc.restaurant_id = NEW.restaurant_id)
      ),
      next_attempt_at = NULL,
      locked_at = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE restaurant_id = NEW.restaurant_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS restaurant_cuisines_mark_osm_job_satisfied ON public.restaurant_cuisines;
CREATE TRIGGER restaurant_cuisines_mark_osm_job_satisfied
AFTER INSERT ON public.restaurant_cuisines
FOR EACH ROW
EXECUTE FUNCTION public.restaurant_cuisines_mark_osm_job_satisfied();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $schedule$
DECLARE
  v_secret text;
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  SELECT decrypted_secret
  INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_cron_secret'
  LIMIT 1;

  IF NULLIF(v_secret, '') IS NULL THEN
    RAISE NOTICE 'Vault secret internal_cron_secret absent: tok-directory-cuisine-osm-enrichment not scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('tok-directory-cuisine-osm-enrichment')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'tok-directory-cuisine-osm-enrichment'
  );

  PERFORM cron.schedule(
    'tok-directory-cuisine-osm-enrichment',
    '* * * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-cron-secret', %L
        ),
        body := '{"mode":"process_batch","limit":24,"source":"cron"}'::jsonb,
        timeout_milliseconds := 55000
      );
    $cron$, v_base || '/enrich-directory-cuisines-osm', v_secret)
  );
END;
$schedule$;

DO $postflight$
DECLARE
  v_missing integer;
  v_queued integer;
  v_priority_missing integer;
BEGIN
  SELECT count(*)::integer
  INTO v_missing
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND r.is_active IS TRUE
    AND r.latitude IS NOT NULL
    AND r.longitude IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.restaurant_cuisines rc WHERE rc.restaurant_id = r.id
    );

  SELECT count(*)::integer
  INTO v_queued
  FROM public.restaurant_directory_cuisine_osm_jobs job
  JOIN public.restaurants r ON r.id = job.restaurant_id
  WHERE r.is_directory_listing IS TRUE
    AND r.is_active IS TRUE
    AND r.latitude IS NOT NULL
    AND r.longitude IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.restaurant_cuisines rc WHERE rc.restaurant_id = r.id
    );

  IF v_queued < v_missing THEN
    RAISE EXCEPTION 'OSM cuisine queue incomplete: % queued for % unresolved restaurants', v_queued, v_missing;
  END IF;

  SELECT count(*)::integer
  INTO v_priority_missing
  FROM public.restaurant_directory_cuisine_osm_jobs job
  JOIN public.restaurants r ON r.id = job.restaurant_id
  WHERE r.directory_public_name_verified IS TRUE
    AND r.is_directory_listing IS TRUE
    AND r.is_active IS TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.restaurant_cuisines rc WHERE rc.restaurant_id = r.id
    )
    AND job.priority < 100;

  IF v_priority_missing > 0 THEN
    RAISE EXCEPTION 'Verified public restaurants missing OSM cuisine priority: %', v_priority_missing;
  END IF;

  IF has_table_privilege('anon', 'public.restaurant_directory_cuisine_osm_jobs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.restaurant_directory_cuisine_osm_jobs', 'SELECT') THEN
    RAISE EXCEPTION 'OSM cuisine queue must remain service-only';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
