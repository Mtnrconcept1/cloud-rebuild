-- Automate scheduled newsletter campaigns while keeping admin/service-role guards explicit.

CREATE OR REPLACE FUNCTION public.admin_dispatch_notification_campaign(
  p_campaign_id uuid
)
RETURNS TABLE (
  recipients integer,
  notifications_count integer,
  deliveries_total integer,
  deliveries_queued integer,
  deliveries_sent integer,
  deliveries_failed integer,
  in_app_total integer,
  email_total integer,
  push_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_campaign public.notification_campaigns%ROWTYPE;
  v_notification record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT *
  INTO v_campaign
  FROM public.notification_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found.';
  END IF;

  FOR v_notification IN
    INSERT INTO public.notifications (user_id, title, body, type, category, data)
    SELECT
      tu.user_id,
      v_campaign.title,
      v_campaign.body,
      'campaign',
      v_campaign.category,
      jsonb_build_object(
        'campaign_id', v_campaign.id,
        'campaign_title', v_campaign.title,
        'url', '/notifications',
        'requested_channels', jsonb_build_object(
          'in_app', COALESCE((v_campaign.channels ->> 'in_app')::boolean, true),
          'email', COALESCE((v_campaign.channels ->> 'email')::boolean, true),
          'push', COALESCE((v_campaign.channels ->> 'push')::boolean, true)
        )
      )
    FROM (
      SELECT
        au.id AS user_id,
        COALESCE(p.city, '') AS city,
        COALESCE(roles_map.roles, ARRAY['client']::text[]) AS roles
      FROM auth.users au
      LEFT JOIN public.profiles p ON p.user_id = au.id
      LEFT JOIN LATERAL (
        SELECT array_agg(ur.role::text ORDER BY ur.role::text) AS roles
        FROM public.user_roles ur
        WHERE ur.user_id = au.id
      ) AS roles_map ON true
      WHERE (
        COALESCE(array_length(v_campaign.target_roles, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(roles_map.roles, ARRAY['client']::text[])) AS role_name
          WHERE role_name = ANY(v_campaign.target_roles)
        )
      )
      AND (
        COALESCE(array_length(v_campaign.target_cities, 1), 0) = 0
        OR COALESCE(p.city, '') = ANY(v_campaign.target_cities)
      )
    ) AS tu
    RETURNING id, user_id, category, data
  LOOP
    PERFORM public.queue_notification_deliveries(
      v_notification.id,
      v_notification.user_id,
      v_notification.category,
      v_notification.data
    );
  END LOOP;

  UPDATE public.notification_campaigns
  SET status = 'sent', sent_at = now()
  WHERE id = p_campaign_id;

  RETURN QUERY
  SELECT
    stats.recipients,
    stats.notifications_count,
    stats.deliveries_total,
    stats.deliveries_queued,
    stats.deliveries_sent,
    stats.deliveries_failed,
    stats.in_app_total,
    stats.email_total,
    stats.push_total
  FROM public.get_campaign_stats(ARRAY[p_campaign_id]) AS stats;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_due_notification_campaigns(p_limit integer DEFAULT 25)
RETURNS TABLE (
  campaign_id uuid,
  recipients integer,
  notifications_count integer,
  deliveries_total integer,
  deliveries_queued integer,
  deliveries_sent integer,
  deliveries_failed integer,
  in_app_total integer,
  email_total integer,
  push_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  due_campaign record;
  dispatch_result record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  FOR due_campaign IN
    SELECT id
    FROM public.notification_campaigns
    WHERE status = 'scheduled'
      AND scheduled_at <= now()
    ORDER BY scheduled_at ASC, created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
  LOOP
    SELECT *
    INTO dispatch_result
    FROM public.admin_dispatch_notification_campaign(due_campaign.id);

    campaign_id := due_campaign.id;
    recipients := dispatch_result.recipients;
    notifications_count := dispatch_result.notifications_count;
    deliveries_total := dispatch_result.deliveries_total;
    deliveries_queued := dispatch_result.deliveries_queued;
    deliveries_sent := dispatch_result.deliveries_sent;
    deliveries_failed := dispatch_result.deliveries_failed;
    in_app_total := dispatch_result.in_app_total;
    email_total := dispatch_result.email_total;
    push_total := dispatch_result.push_total;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dispatch_notification_campaign(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_dispatch_notification_campaign(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_dispatch_notification_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dispatch_notification_campaign(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.dispatch_due_notification_campaigns(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dispatch_due_notification_campaigns(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.dispatch_due_notification_campaigns(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_notification_campaigns(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
