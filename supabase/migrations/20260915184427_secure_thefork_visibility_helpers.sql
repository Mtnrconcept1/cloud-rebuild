REVOKE ALL ON FUNCTION public.public_restaurant_all_sources_enabled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_is_thefork_catalog_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_source_is_publicly_displayable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_restaurant_all_sources_enabled() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_is_thefork_catalog_member(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_source_is_publicly_displayable(uuid) TO anon, authenticated, service_role;;
