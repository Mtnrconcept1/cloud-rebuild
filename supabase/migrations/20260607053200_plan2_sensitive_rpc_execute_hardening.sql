-- plan2_sensitive_rpc_execute_hardening
-- Restrict direct API execution on sensitive SECURITY DEFINER helpers while
-- keeping intentionally public aggregate and availability RPCs untouched.

DO $$
BEGIN
  IF to_regprocedure('public.get_order_customers(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_order_customers(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_order_customers(uuid) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.get_reservation_customers(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_reservation_customers(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_reservation_customers(uuid) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.has_role(uuid, public.app_role)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.is_feature_flag_active(text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.is_feature_flag_active(text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.is_feature_flag_active(text) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.log_audit()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.log_audit() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.log_audit() TO service_role;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
