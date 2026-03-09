
-- Tighten audit_log INSERT: only authenticated users
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_log;
CREATE POLICY "Authenticated can insert audit logs" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- Tighten email_queue INSERT: only authenticated users
DROP POLICY IF EXISTS "Authenticated can insert emails" ON public.email_queue;
CREATE POLICY "Authenticated can insert emails" ON public.email_queue FOR INSERT TO authenticated WITH CHECK (true);
