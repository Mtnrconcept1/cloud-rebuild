-- Discovery sources must be URLs, never numeric directory identifiers.
-- Keep publication behind the existing official-source truth-review pipeline.

CREATE OR REPLACE FUNCTION public.queue_restaurant_image_discovery_after_name_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_was_eligible boolean := false;
  v_source_url text;
BEGIN
  IF NOT COALESCE(NEW.is_active, false)
    OR NOT COALESCE(NEW.is_directory_listing, false)
    OR NOT COALESCE(NEW.directory_public_name_verified, false)
    OR NULLIF(btrim(NEW.image_url), '') IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_was_eligible := COALESCE(OLD.is_active, false)
      AND COALESCE(OLD.is_directory_listing, false)
      AND COALESCE(OLD.directory_public_name_verified, false)
      AND NULLIF(btrim(OLD.image_url), '') IS NULL;

    IF v_old_was_eligible
      AND NEW.directory_public_name_source_url IS NOT DISTINCT FROM OLD.directory_public_name_source_url
    THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT source.url INTO v_source_url
  FROM (
    SELECT 0 AS priority, image_job.source_page_url AS url
    FROM public.restaurant_directory_image_jobs AS image_job
    WHERE image_job.restaurant_id = NEW.id
    UNION ALL
    SELECT 1, NEW.directory_public_name_source_url
    UNION ALL
    SELECT 2, contact.website
    FROM public.marketing_contacts AS contact
    WHERE contact.source_objectid::text = NEW.directory_source_reference
      OR contact.source_reference = NEW.directory_source_reference
  ) AS source
  WHERE NULLIF(btrim(source.url), '') ~* '^https?://[^[:space:]]+$'
  ORDER BY source.priority, source.url
  LIMIT 1;

  INSERT INTO public.restaurant_image_discovery_jobs (
    restaurant_id,
    source_url,
    status,
    next_attempt_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_source_url,
    'queued',
    now(),
    now()
  )
  ON CONFLICT (restaurant_id) DO UPDATE
  SET
    source_url = COALESCE(
      EXCLUDED.source_url,
      public.restaurant_image_discovery_jobs.source_url
    ),
    status = CASE
      WHEN public.restaurant_image_discovery_jobs.status = 'processing'
        THEN public.restaurant_image_discovery_jobs.status
      ELSE 'queued'
    END,
    next_attempt_at = CASE
      WHEN public.restaurant_image_discovery_jobs.status = 'processing'
        THEN public.restaurant_image_discovery_jobs.next_attempt_at
      ELSE now()
    END,
    updated_at = now();

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_restaurant_image_discovery_after_name_verification()
  FROM PUBLIC, anon, authenticated;

-- Repair only jobs stranded on a missing/non-URL source when the catalogue
-- already provides an HTTP(S) website. Never touch a restaurant photo, an active
-- lease, or a valid source selected previously by an operator/worker.
WITH sources AS (
  SELECT DISTINCT ON (restaurant.id)
    restaurant.id AS restaurant_id,
    btrim(contact.website) AS website
  FROM public.restaurants AS restaurant
  JOIN public.marketing_contacts AS contact
    ON contact.source_objectid::text = restaurant.directory_source_reference
      OR contact.source_reference = restaurant.directory_source_reference
  JOIN public.restaurant_image_discovery_jobs AS jobs
    ON jobs.restaurant_id = restaurant.id
  WHERE COALESCE(restaurant.is_active, false)
    AND COALESCE(restaurant.is_directory_listing, false)
    AND COALESCE(restaurant.directory_public_name_verified, false)
    AND NULLIF(btrim(restaurant.image_url), '') IS NULL
    AND jobs.status <> 'processing'
    AND COALESCE(jobs.source_url, '') !~* '^https?://[^[:space:]]+$'
    AND btrim(contact.website) ~* '^https?://[^[:space:]]+$'
  ORDER BY restaurant.id, contact.website
)
UPDATE public.restaurant_image_discovery_jobs AS jobs
SET source_url = sources.website,
    status = 'queued',
    next_attempt_at = now(),
    last_error = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
FROM sources
WHERE jobs.restaurant_id = sources.restaurant_id
  AND jobs.status <> 'processing'
  AND COALESCE(jobs.source_url, '') !~* '^https?://[^[:space:]]+$';

NOTIFY pgrst, 'reload schema';

