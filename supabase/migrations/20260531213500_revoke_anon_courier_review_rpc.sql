-- Lock the courier profile review RPC to signed-in/admin flows.
-- The function body still enforces admin role checks; this removes direct anon exposure.

REVOKE EXECUTE ON FUNCTION public.admin_review_courier_profile(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_review_courier_profile(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_review_courier_profile(uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
