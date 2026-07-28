-- Stable accent-insensitive normalization used by deterministic data repairs.
CREATE OR REPLACE FUNCTION public.immutable_unaccent_lower(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT translate(
    lower(coalesce(p_value, '')),
    'àáâãäåæçèéêëìíîïñòóôõöœùúûüýÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖŒÙÚÛÜÝ',
    'aaaaaaaceeeeiiiinoooooouuuuyyAAAAAAACEEEEIIIINOOOOOOUUUUY'
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.immutable_unaccent_lower(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.immutable_unaccent_lower(text)
TO service_role;
