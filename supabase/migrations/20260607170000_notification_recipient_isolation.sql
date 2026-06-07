-- Keep personal notification rows scoped to their recipient.
-- Admin campaign supervision stays available through audited SECURITY DEFINER RPCs.

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_recipient_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_recipient_update" ON public.notifications;

CREATE POLICY "notifications_recipient_select"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "notifications_recipient_update"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view their notification deliveries" ON public.notification_deliveries;
DROP POLICY IF EXISTS "notification_deliveries_recipient_select" ON public.notification_deliveries;

CREATE POLICY "notification_deliveries_recipient_select"
  ON public.notification_deliveries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.id = notification_deliveries.notification_id
        AND n.user_id = (SELECT auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
