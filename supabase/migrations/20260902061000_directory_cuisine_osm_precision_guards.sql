-- Precision and privilege hardening for the OSM cuisine second pass.
-- `cuisine=regional` is intentionally not converted into a national cuisine:
-- a regional restaurant in Geneva is not sufficient evidence for "Suisse".

BEGIN;

CREATE OR REPLACE FUNCTION public.restaurant_cuisine_evidence_reject_generic_osm_regional()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source_kind = 'openstreetmap_live'
     AND NEW.evidence ->> 'matched_osm_value' = 'regional' THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS restaurant_cuisine_evidence_reject_generic_osm_regional
  ON public.restaurant_cuisine_evidence;
CREATE TRIGGER restaurant_cuisine_evidence_reject_generic_osm_regional
BEFORE INSERT OR UPDATE ON public.restaurant_cuisine_evidence
FOR EACH ROW
EXECUTE FUNCTION public.restaurant_cuisine_evidence_reject_generic_osm_regional();

REVOKE ALL ON FUNCTION public.restaurant_cuisine_evidence_reject_generic_osm_regional()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restaurants_enqueue_directory_cuisine_osm_research()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restaurant_cuisines_mark_osm_job_satisfied()
  FROM PUBLIC, anon, authenticated;

DO $postflight$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.restaurants_enqueue_directory_cuisine_osm_research()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.restaurants_enqueue_directory_cuisine_osm_research()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.restaurant_cuisines_mark_osm_job_satisfied()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.restaurant_cuisines_mark_osm_job_satisfied()',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'OSM cuisine trigger functions must not be publicly executable';
  END IF;
END;
$postflight$;

COMMIT;
