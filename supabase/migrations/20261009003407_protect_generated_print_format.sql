-- The print contract is written by ai-image-enhance with service_role.
-- Preserve existing client INSERT rights for ordinary AI assets, but never let
-- an authenticated browser manufacture, replace or remove this server contract.
BEGIN;

CREATE OR REPLACE FUNCTION public.protect_generated_print_format()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- Check the effective database role, not client-controlled metadata/JWT claims.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.metadata ? 'marketing_output_target' THEN
      RAISE EXCEPTION 'PRINT_GENERATION_FORMAT_SERVER_ONLY' USING ERRCODE = '42501';
    END IF;
  ELSIF (NEW.metadata -> 'marketing_output_target')
      IS DISTINCT FROM (OLD.metadata -> 'marketing_output_target') THEN
    RAISE EXCEPTION 'PRINT_GENERATION_FORMAT_SERVER_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_generated_print_format() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_generated_print_format ON public.ai_generated_assets;
CREATE TRIGGER protect_generated_print_format
BEFORE INSERT OR UPDATE ON public.ai_generated_assets
FOR EACH ROW EXECUTE FUNCTION public.protect_generated_print_format();

COMMENT ON FUNCTION public.protect_generated_print_format() IS
  'Reserves generated print format provenance for server database roles; leaves other asset metadata and existing RLS unchanged.';

COMMIT;
