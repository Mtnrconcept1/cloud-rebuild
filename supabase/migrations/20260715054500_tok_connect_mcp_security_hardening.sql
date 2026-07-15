-- This SECURITY DEFINER helper is used only by service-role Edge Functions.
-- Keeping it callable by authenticated users would expose a boolean oracle for
-- partner/restaurant scopes even though it does not grant data access itself.

revoke all on function public.tok_connect_restaurant_grant_enabled(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.tok_connect_restaurant_grant_enabled(uuid, uuid, text)
  to service_role;
