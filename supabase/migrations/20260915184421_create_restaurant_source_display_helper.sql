CREATE OR REPLACE FUNCTION public.restaurant_source_is_publicly_displayable(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.public_restaurant_all_sources_enabled() OR public.restaurant_is_thefork_catalog_member(p_restaurant_id);
$function$;;
