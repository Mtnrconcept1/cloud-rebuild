
-- Fix the permissive INSERT policy on audit_log - restrict to authenticated users only
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;
CREATE POLICY "Authenticated can insert audit logs" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
