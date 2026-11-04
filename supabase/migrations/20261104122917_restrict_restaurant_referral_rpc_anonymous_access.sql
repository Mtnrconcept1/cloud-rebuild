-- Limit private referral dashboards and support actions to authenticated callers.
-- The functions already check auth.uid() and ownership/admin role internally;
-- anonymous EXECUTE was nevertheless granted explicitly by database defaults.
-- Public code validation is intentionally left available to anon signups.
REVOKE EXECUTE ON FUNCTION public.get_restaurant_referral_dashboard(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_admin_restaurant_referrals(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_admin_restaurant_referral(uuid, text) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
