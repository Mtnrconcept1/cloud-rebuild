-- Prevent non-admin users from spoofing TOK/admin messages in public support threads.
DROP POLICY IF EXISTS "support_messages_insert_related" ON public.support_incident_messages;

CREATE POLICY "support_messages_insert_related"
  ON public.support_incident_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_support_incident(incident_id)
    AND author_id = auth.uid()
    AND (
      (
        author_role = 'admin'
        AND public.has_role(auth.uid(), 'admin')
      )
      OR (
        author_role = 'client'
        AND EXISTS (
          SELECT 1
          FROM public.support_incidents si
          WHERE si.id = support_incident_messages.incident_id
            AND si.opened_by = auth.uid()
        )
      )
      OR (
        author_role = 'restaurateur'
        AND EXISTS (
          SELECT 1
          FROM public.support_incidents si
          WHERE si.id = support_incident_messages.incident_id
            AND public.auth_owns_restaurant(si.restaurant_id)
        )
      )
      OR (
        author_role = 'courier'
        AND public.has_role(auth.uid(), 'courier')
      )
    )
    AND (
      visibility = 'public'
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.support_incidents si
        WHERE si.id = support_incident_messages.incident_id
          AND public.auth_owns_restaurant(si.restaurant_id)
      )
    )
  );
