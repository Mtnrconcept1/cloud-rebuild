CREATE OR REPLACE FUNCTION public.public_restaurant_all_sources_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT flag.is_active FROM public.feature_flags AS flag WHERE flag.name = 'public-restaurants-all-sources' LIMIT 1), true);
$function$;;
