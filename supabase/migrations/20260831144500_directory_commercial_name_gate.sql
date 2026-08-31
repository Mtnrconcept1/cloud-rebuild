-- Public directory listings must expose a commercial establishment name, never a legal entity name.
-- Unverified directory rows remain available to admins/service workflows but are hidden from every public read path.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS directory_public_name_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS directory_public_name_source text,
  ADD COLUMN IF NOT EXISTS directory_public_name_source_url text,
  ADD COLUMN IF NOT EXISTS directory_public_name_verified_at timestamptz;

COMMENT ON COLUMN public.restaurants.directory_public_name_verified IS
  'True only when an unclaimed directory listing has a verified public-facing commercial establishment name.';
COMMENT ON COLUMN public.restaurants.directory_public_name_source IS
  'Server-owned provenance for the verified commercial display name.';
COMMENT ON COLUMN public.restaurants.directory_public_name_source_url IS
  'Public source URL used to verify the commercial display name when applicable.';
COMMENT ON COLUMN public.restaurants.directory_public_name_verified_at IS
  'Timestamp at which the directory commercial display name was verified.';

CREATE OR REPLACE FUNCTION public.directory_name_looks_legal_entity(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT lower(btrim(COALESCE(p_name, ''))) ~
    '(^|[[:space:],-])((s[.]?[[:space:]]*a[.]?)|s[àa]rl|sagl|gmbh|ag|ltd|llc|inc|snc|association|fondation|holding|investissements?|services?)[[:space:].]*$';
$function$;

-- Preserve the imported legal identity before hiding suspicious directory display names.
UPDATE public.restaurants r
SET legal_name = COALESCE(NULLIF(btrim(r.legal_name), ''), r.name),
    directory_public_name_verified = false,
    directory_public_name_source = 'pending_commercial_name',
    directory_public_name_source_url = NULL,
    directory_public_name_verified_at = NULL
WHERE r.is_directory_listing IS TRUE
  AND public.directory_name_looks_legal_entity(r.name);

-- The public restaurant listing source already carries the establishment-facing name.
UPDATE public.restaurants r
SET directory_public_name_verified = true,
    directory_public_name_source = 'public_restaurant_listing',
    directory_public_name_source_url = NULLIF(btrim(c.website), ''),
    directory_public_name_verified_at = now()
FROM public.marketing_contacts c
WHERE r.is_directory_listing IS TRUE
  AND c.source_system = 'commercial_prospect_catalog'
  AND COALESCE(c.source_objectid::text, c.id::text) = r.directory_source_reference
  AND c.branch = 'Restaurant référencé sur TheFork'
  AND NOT public.directory_name_looks_legal_entity(r.name);

-- SITG's restaurant activity catalogue is accepted only when the imported public label does not look like a legal entity.
UPDATE public.restaurants r
SET directory_public_name_verified = true,
    directory_public_name_source = 'public_restaurant_registry_label',
    directory_public_name_source_url = NULLIF(btrim(c.website), ''),
    directory_public_name_verified_at = now()
FROM public.marketing_contacts c
WHERE r.is_directory_listing IS TRUE
  AND c.source_system = 'commercial_prospect_catalog'
  AND COALESCE(c.source_objectid::text, c.id::text) = r.directory_source_reference
  AND c.branch = 'Restaurants, cafés, snack-bar, tea-rooms et salons de dégustation de glaces'
  AND NOT public.directory_name_looks_legal_entity(r.name);

-- If a legal-entity row has a distinct public restaurant listing at the same address, keep the commercial row and hide the duplicate legal entity permanently.
WITH commercial_addresses AS (
  SELECT DISTINCT
    public.normalize_search_text(COALESCE(c.street_address, '')) AS address_key,
    public.normalize_search_text(COALESCE(NULLIF(btrim(c.city), ''), NULLIF(btrim(c.commune), ''), '')) AS city_key
  FROM public.marketing_contacts c
  WHERE c.source_system = 'commercial_prospect_catalog'
    AND c.branch = 'Restaurant référencé sur TheFork'
    AND NULLIF(btrim(c.display_name), '') IS NOT NULL
)
UPDATE public.restaurants r
SET directory_public_name_verified = false,
    directory_public_name_source = 'duplicate_legal_entity_hidden',
    directory_public_name_source_url = NULL,
    directory_public_name_verified_at = NULL
FROM commercial_addresses a
WHERE r.is_directory_listing IS TRUE
  AND public.directory_name_looks_legal_entity(r.name)
  AND a.address_key = public.normalize_search_text(COALESCE(r.address, ''))
  AND a.city_key = public.normalize_search_text(COALESCE(r.city, ''));

-- All public SELECT policies must enforce the same commercial-name gate. Policies are permissive/ORed,
-- so every broad public/authenticated policy needs the condition, not only restaurants_public_select.
DROP POLICY IF EXISTS restaurants_public_select ON public.restaurants;
CREATE POLICY restaurants_public_select
ON public.restaurants
FOR SELECT
TO anon, authenticated
USING (
  is_active IS TRUE
  AND is_demo IS FALSE
  AND lower(COALESCE(status, '')) = 'active'
  AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
);

DROP POLICY IF EXISTS production_hide_demo_restaurants ON public.restaurants;
CREATE POLICY production_hide_demo_restaurants
ON public.restaurants
FOR SELECT
TO anon, authenticated
USING (
  is_demo IS FALSE
  AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
);

DROP POLICY IF EXISTS scope_production_restaurants_for_commercial_demo_accounts ON public.restaurants;
CREATE POLICY scope_production_restaurants_for_commercial_demo_accounts
ON public.restaurants
FOR SELECT
TO authenticated
USING (
  (
    NOT public.commercial_demo_current_user_is_restricted()
    AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
  )
  OR id = public.commercial_demo_current_restaurant_id()
);

CREATE OR REPLACE FUNCTION public.restaurant_is_publicly_visible(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = p_restaurant_id
      AND restaurant.is_active IS TRUE
      AND restaurant.is_demo IS FALSE
      AND lower(COALESCE(restaurant.status, '')) = 'active'
      AND (
        restaurant.is_directory_listing IS FALSE
        OR restaurant.directory_public_name_verified IS TRUE
      )
  );
$function$;

CREATE TABLE IF NOT EXISTS public.restaurant_directory_name_jobs (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'not_found', 'error', 'duplicate_hidden')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  source_page_url text,
  resolved_name text,
  resolution_source text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_directory_name_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_directory_name_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.restaurant_directory_name_jobs TO service_role;

CREATE INDEX IF NOT EXISTS restaurant_directory_name_jobs_due_idx
  ON public.restaurant_directory_name_jobs(status, next_attempt_at, attempts, created_at)
  WHERE status IN ('pending', 'processing', 'not_found', 'error');

INSERT INTO public.restaurant_directory_name_jobs (restaurant_id, status)
SELECT
  r.id,
  CASE
    WHEN r.directory_public_name_source = 'duplicate_legal_entity_hidden' THEN 'duplicate_hidden'
    ELSE 'pending'
  END
FROM public.restaurants r
WHERE r.is_directory_listing IS TRUE
  AND r.directory_public_name_verified IS FALSE
ON CONFLICT (restaurant_id) DO UPDATE
SET status = CASE
      WHEN EXCLUDED.status = 'duplicate_hidden' THEN 'duplicate_hidden'
      ELSE public.restaurant_directory_name_jobs.status
    END,
    updated_at = now();

UPDATE public.restaurant_directory_name_jobs j
SET status = 'success',
    next_attempt_at = NULL,
    locked_at = NULL,
    last_error = NULL,
    updated_at = now()
FROM public.restaurants r
WHERE r.id = j.restaurant_id
  AND (r.is_directory_listing IS FALSE OR r.directory_public_name_verified IS TRUE)
  AND j.status NOT IN ('success', 'duplicate_hidden');

CREATE OR REPLACE FUNCTION public.service_claim_directory_name_jobs(p_limit integer DEFAULT 3)
RETURNS TABLE(restaurant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 3), 1), 3);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT j.restaurant_id
    FROM public.restaurant_directory_name_jobs j
    JOIN public.restaurants r ON r.id = j.restaurant_id
    WHERE r.is_directory_listing IS TRUE
      AND r.directory_public_name_verified IS FALSE
      AND COALESCE(r.directory_public_name_source, '') <> 'duplicate_legal_entity_hidden'
      AND j.attempts < 3
      AND (
        j.status IN ('pending', 'not_found', 'error')
        OR (j.status = 'processing' AND j.locked_at < now() - interval '15 minutes')
      )
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now())
    ORDER BY COALESCE(j.next_attempt_at, j.created_at), j.attempts, j.restaurant_id
    FOR UPDATE OF j SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.restaurant_directory_name_jobs j
  SET status = 'processing',
      attempts = j.attempts + 1,
      last_attempt_at = now(),
      locked_at = now(),
      next_attempt_at = NULL,
      last_error = NULL,
      updated_at = now()
  FROM candidates c
  WHERE j.restaurant_id = c.restaurant_id
  RETURNING j.restaurant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_claim_directory_name_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_claim_directory_name_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_directory_name_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_directory_listing IS TRUE AND NEW.directory_public_name_verified IS FALSE THEN
    INSERT INTO public.restaurant_directory_name_jobs (restaurant_id, status)
    VALUES (
      NEW.id,
      CASE WHEN NEW.directory_public_name_source = 'duplicate_legal_entity_hidden' THEN 'duplicate_hidden' ELSE 'pending' END
    )
    ON CONFLICT (restaurant_id) DO UPDATE
    SET status = CASE
          WHEN EXCLUDED.status = 'duplicate_hidden' THEN 'duplicate_hidden'
          WHEN public.restaurant_directory_name_jobs.status IN ('success', 'duplicate_hidden') THEN 'pending'
          ELSE public.restaurant_directory_name_jobs.status
        END,
        next_attempt_at = CASE
          WHEN public.restaurant_directory_name_jobs.status IN ('success', 'duplicate_hidden') THEN NULL
          ELSE public.restaurant_directory_name_jobs.next_attempt_at
        END,
        locked_at = NULL,
        updated_at = now();
  ELSE
    UPDATE public.restaurant_directory_name_jobs
    SET status = 'success',
        next_attempt_at = NULL,
        locked_at = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE restaurant_id = NEW.id
      AND status <> 'duplicate_hidden';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS restaurants_sync_directory_name_job ON public.restaurants;
CREATE TRIGGER restaurants_sync_directory_name_job
AFTER INSERT OR UPDATE OF is_directory_listing, directory_public_name_verified, directory_public_name_source
ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.sync_directory_name_job();

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
    RAISE NOTICE 'Vault secret internal_cron_secret absent: tok-directory-commercial-name-verification not scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('tok-directory-commercial-name-verification')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tok-directory-commercial-name-verification');

  PERFORM cron.schedule('tok-directory-commercial-name-verification', '* * * * *', format($cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', %L
      ),
      body := '{"mode":"process_batch","limit":3,"source":"cron"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$, v_base || '/verify-directory-commercial-names', v_secret));
END;
$schedule$;

DO $postflight$
DECLARE
  v_directory integer;
  v_verified integer;
  v_verified_legal integer;
  v_visible_unverified integer;
BEGIN
  SELECT count(*)::integer,
         count(*) FILTER (WHERE directory_public_name_verified IS TRUE)::integer,
         count(*) FILTER (
           WHERE directory_public_name_verified IS TRUE
             AND public.directory_name_looks_legal_entity(name)
         )::integer
  INTO v_directory, v_verified, v_verified_legal
  FROM public.restaurants
  WHERE is_directory_listing IS TRUE;

  SELECT count(*)::integer
  INTO v_visible_unverified
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND r.directory_public_name_verified IS FALSE
    AND public.restaurant_is_publicly_visible(r.id);

  IF v_verified_legal <> 0 THEN
    RAISE EXCEPTION 'Directory commercial-name gate left % verified legal-entity names', v_verified_legal;
  END IF;

  IF v_visible_unverified <> 0 THEN
    RAISE EXCEPTION 'Directory commercial-name gate left % unverified rows publicly visible', v_visible_unverified;
  END IF;

  IF v_directory >= 4000 AND v_verified < 2500 THEN
    RAISE EXCEPTION 'Directory commercial-name gate unexpectedly hid too much inventory: verified=% directory=%', v_verified, v_directory;
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
