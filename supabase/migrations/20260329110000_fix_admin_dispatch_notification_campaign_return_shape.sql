-- Fix admin campaign dispatch RPC: its declared return shape must match the
-- subset consumed by the frontend. The previous implementation returned
-- SELECT * from get_campaign_stats(), which includes extra columns.

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
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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

GRANT EXECUTE ON FUNCTION public.admin_dispatch_notification_campaign(uuid) TO authenticated;
