-- Clear the last function_search_path_mutable warning on the instance.
--
-- The security advisor reports 247 *_security_definer_function_executable
-- warnings alongside it, and those are deliberate: this codebase exposes admin
-- RPCs over /rest/v1/rpc and gates them inside the body (marketing_require_admin,
-- marketing_require_service_role, ...). Narrowing the anon grants among them is
-- governed by docs/supabase/anon-security-definer-audit.md and belongs to that
-- workflow, not here.
--
-- The body of this function compares its own parameters and resolves no table,
-- so nothing is hijackable today. It is pinned rather than argued about: an
-- IMMUTABLE function whose search_path follows the caller is a latent hazard
-- the moment someone adds a table or operator reference to it.
ALTER FUNCTION public.is_flat_arrival_billing_candidate(text, text, timestamp with time zone)
  SET search_path = '';
