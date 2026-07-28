-- A single business entity must never be billed twice for the same campaign,
-- even when browser attribution, server last-click attribution and Actualites
-- attribution reach the database in the same transaction window.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_ad_campaign_conversion_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id text;
  v_lock_key bigint;
BEGIN
  IF NEW.event_type <> 'conversion' THEN
    RETURN NEW;
  END IF;

  v_entity_id := NULLIF(trim(COALESCE(NEW.payload->>'entity_id', '')), '');
  IF v_entity_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_lock_key := hashtextextended(
    concat_ws('|', NEW.campaign_id::text, COALESCE(NEW.conversion_type, ''), v_entity_id),
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF EXISTS (
    SELECT 1
    FROM public.ad_campaign_events existing
    WHERE existing.campaign_id = NEW.campaign_id
      AND existing.restaurant_id = NEW.restaurant_id
      AND existing.event_type = 'conversion'
      AND existing.conversion_type IS NOT DISTINCT FROM NEW.conversion_type
      AND existing.payload->>'entity_id' = v_entity_id
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_duplicate_ad_campaign_conversion_entity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_duplicate_ad_campaign_conversion_entity() TO service_role;

DROP TRIGGER IF EXISTS prevent_duplicate_ad_campaign_conversion_entity ON public.ad_campaign_events;
CREATE TRIGGER prevent_duplicate_ad_campaign_conversion_entity
BEFORE INSERT ON public.ad_campaign_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_ad_campaign_conversion_entity();
