-- PostgREST does not support overloaded functions with the same argument names.
-- We currently keep both legacy signatures of generate_restaurant_payout_invoice:
--   (uuid, date) and (uuid, text)
-- which makes REST/RPC calls ambiguous (PGRST203) from Edge Functions.
--
-- Expose a stable, unambiguous wrapper for server-side callers.

CREATE OR REPLACE FUNCTION public.generate_restaurant_payout_invoice_rpc(
  p_restaurant_id uuid,
  p_month text DEFAULT NULL::text
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.generate_restaurant_payout_invoice(p_restaurant_id, p_month::text);
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice_rpc(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice_rpc(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice_rpc(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice_rpc(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
