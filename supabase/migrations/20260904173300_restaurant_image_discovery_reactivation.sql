-- A verified name that becomes active or public again must restart image
-- discovery when no accepted image is present.

CREATE OR REPLACE FUNCTION public.queue_restaurant_image_discovery_after_name_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_was_eligible boolean := false;
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

  INSERT INTO public.restaurant_image_discovery_jobs (
    restaurant_id,
    source_url,
    status,
    next_attempt_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(btrim(NEW.directory_public_name_source_url), ''),
      NULLIF(btrim(NEW.directory_source_reference), '')
    ),
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

NOTIFY pgrst, 'reload schema';
