BEGIN;

-- Internal mutations are called by authenticated Edge Functions through their
-- service-role client. PUBLIC revocation alone leaves explicit role grants intact.
-- Do not change function bodies, public catalog RPCs or global default privileges.
REVOKE EXECUTE ON FUNCTION public.advance_print_order_state(uuid, text, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_print_order_state(uuid, text, text, text, text, text, text, text, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.advance_print_reorder_state(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_print_reorder_state(uuid, text, text, text, text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_print_fulfillment_jobs(integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_print_fulfillment_jobs(integer, text, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_print_fulfillment_job(uuid, uuid, text, text, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_print_fulfillment_job(uuid, uuid, text, text, text, jsonb, timestamptz) TO service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_paid_print_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_print_order(uuid, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_print_provider_event(text, text, text, text, text, text, text, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_print_provider_event(text, text, text, text, text, text, text, timestamptz, text, jsonb) TO service_role;

-- Abort the whole migration if inherited privileges still expose an internal RPC.
DO $verify$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.advance_print_order_state(uuid,text,text,text,text,text,text,text,jsonb)',
    'public.advance_print_reorder_state(uuid,text,text,text,text,text,text)',
    'public.claim_print_fulfillment_jobs(integer,text,integer)',
    'public.complete_print_fulfillment_job(uuid,uuid,text,text,text,jsonb,timestamptz)',
    'public.finalize_paid_print_order(uuid,uuid,text)',
    'public.record_print_provider_event(text,text,text,text,text,text,text,timestamptz,text,jsonb)'
  ] LOOP
    IF has_function_privilege('anon', signature, 'EXECUTE')
      OR has_function_privilege('authenticated', signature, 'EXECUTE')
      OR NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'print_rpc_privilege_postcondition_failed: %', signature;
    END IF;
  END LOOP;
END;
$verify$;

NOTIFY pgrst, 'reload schema';
COMMIT;
