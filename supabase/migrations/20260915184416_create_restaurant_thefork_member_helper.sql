CREATE OR REPLACE FUNCTION public.restaurant_is_thefork_catalog_member(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.restaurant_thefork_catalog AS membership WHERE membership.restaurant_id = p_restaurant_id);
$function$;;
