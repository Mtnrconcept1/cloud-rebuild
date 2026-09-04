-- Keep image discovery continuous as commercial names become verified.

CREATE OR REPLACE FUNCTION public.queue_restaurant_image_discovery_after_name_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT COALESCE(NEW.is_active, false)
    OR NOT COALESCE(NEW.is_directory_listing, false)
    OR NOT COALESCE(NEW.directory_public_name_verified, false)
    OR NULLIF(btrim(NEW.image_url), '') IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND COALESCE(OLD.directory_public_name_verified, false)
    AND NEW.directory_public_name_source_url IS NOT DISTINCT FROM OLD.directory_public_name_source_url
  THEN
    RETURN NEW;
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

DROP TRIGGER IF EXISTS trg_queue_restaurant_image_discovery_after_name_verification
  ON public.restaurants;
CREATE TRIGGER trg_queue_restaurant_image_discovery_after_name_verification
AFTER INSERT OR UPDATE OF
  directory_public_name_verified,
  directory_public_name_source_url,
  is_active,
  is_directory_listing
ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.queue_restaurant_image_discovery_after_name_verification();

REVOKE ALL ON FUNCTION public.queue_restaurant_image_discovery_after_name_verification()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
