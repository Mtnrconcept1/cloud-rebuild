-- Harden admin tooling with explicit policies and helper RPCs.

-- Allow admins to moderate review visibility without deleting rows.
DROP POLICY IF EXISTS "Admins can update reviews" ON public.reviews;
CREATE POLICY "Admins can update reviews" ON public.reviews
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage review replies" ON public.review_replies;
CREATE POLICY "Admins can manage review replies" ON public.review_replies
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to inspect profile data from the client where needed.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all user_profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all user_profiles" ON public.user_profiles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin-facing user listing with aggregated roles and email access.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  city text,
  roles text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    au.id AS user_id,
    COALESCE(
      NULLIF(trim(COALESCE(p.full_name, '')), ''),
      NULLIF(trim(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), ''),
      split_part(COALESCE(au.email, au.id::text), '@', 1)
    ) AS full_name,
    au.email::text AS email,
    COALESCE(p.city, NULL) AS city,
    COALESCE(roles_map.roles, ARRAY['client']::text[]) AS roles
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN public.user_profiles up ON up.user_id = au.id
  LEFT JOIN LATERAL (
    SELECT array_agg(ur.role::text ORDER BY ur.role::text) AS roles
    FROM public.user_roles ur
    WHERE ur.user_id = au.id
  ) AS roles_map ON true
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY COALESCE(
    NULLIF(trim(COALESCE(p.full_name, '')), ''),
    NULLIF(trim(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), ''),
    COALESCE(au.email, au.id::text)
  );
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Admin-facing role assignment preserving multi-role support.
CREATE OR REPLACE FUNCTION public.admin_set_user_roles(
  p_user_id uuid,
  p_roles public.app_role[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_roles public.app_role[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  v_roles := COALESCE(p_roles, ARRAY['client'::public.app_role]);
  IF array_length(v_roles, 1) IS NULL THEN
    v_roles := ARRAY['client'::public.app_role];
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  FOREACH v_role IN ARRAY v_roles LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated;

-- Queue notifications and deliveries for a campaign.
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

  WITH target_users AS (
    SELECT
      au.id AS user_id,
      au.email::text AS email,
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
  ),
  inserted_notifications AS (
    INSERT INTO public.notifications (user_id, title, body, type, category, data)
    SELECT
      tu.user_id,
      v_campaign.title,
      v_campaign.body,
      'campaign',
      v_campaign.category,
      jsonb_build_object('campaign_id', v_campaign.id, 'campaign_title', v_campaign.title)
    FROM target_users tu
    RETURNING id, user_id
  ),
  inserted_deliveries AS (
    INSERT INTO public.notification_deliveries (notification_id, channel, status, target, scheduled_at, sent_at)
    SELECT
      n.id,
      delivery.channel,
      delivery.status,
      delivery.target,
      CASE WHEN delivery.status = 'queued' THEN now() ELSE NULL END,
      CASE WHEN delivery.status = 'sent' THEN now() ELSE NULL END
    FROM inserted_notifications n
    JOIN auth.users au ON au.id = n.user_id
    CROSS JOIN LATERAL (
      SELECT 'in_app'::text AS channel, 'sent'::text AS status, NULL::text AS target
      WHERE COALESCE((v_campaign.channels ->> 'in_app')::boolean, true)
      UNION ALL
      SELECT 'email'::text AS channel, 'queued'::text AS status, au.email::text AS target
      WHERE COALESCE((v_campaign.channels ->> 'email')::boolean, true)
        AND au.email IS NOT NULL
      UNION ALL
      SELECT 'push'::text AS channel, 'queued'::text AS status, NULL::text AS target
      WHERE COALESCE((v_campaign.channels ->> 'push')::boolean, true)
    ) AS delivery
    RETURNING channel, status
  )
  UPDATE public.notification_campaigns
  SET status = 'sent', sent_at = now()
  WHERE id = p_campaign_id;

  RETURN QUERY
  SELECT *
  FROM public.get_campaign_stats(ARRAY[p_campaign_id]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_dispatch_notification_campaign(uuid) TO authenticated;

-- Replace placeholder notification stats with actual aggregates.
CREATE OR REPLACE FUNCTION public.get_campaign_stats(campaign_ids uuid[] DEFAULT NULL)
RETURNS TABLE(
  campaign_id uuid,
  recipients integer,
  notifications_count integer,
  read_count integer,
  deliveries_total integer,
  deliveries_queued integer,
  deliveries_sent integer,
  deliveries_failed integer,
  in_app_total integer,
  email_total integer,
  push_total integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH campaign_scope AS (
    SELECT nc.id
    FROM public.notification_campaigns nc
    WHERE campaign_ids IS NULL OR nc.id = ANY(campaign_ids)
  ),
  campaign_notifications AS (
    SELECT
      n.id,
      n.user_id,
      n.read_at,
      (n.data ->> 'campaign_id')::uuid AS campaign_id
    FROM public.notifications n
    WHERE (n.data ->> 'campaign_id') IS NOT NULL
  ),
  scoped_notifications AS (
    SELECT cn.*
    FROM campaign_notifications cn
    JOIN campaign_scope cs ON cs.id = cn.campaign_id
  ),
  scoped_deliveries AS (
    SELECT
      d.notification_id,
      d.channel,
      d.status,
      sn.campaign_id
    FROM public.notification_deliveries d
    JOIN scoped_notifications sn ON sn.id = d.notification_id
  )
  SELECT
    cs.id AS campaign_id,
    COUNT(DISTINCT sn.user_id)::integer AS recipients,
    COUNT(DISTINCT sn.id)::integer AS notifications_count,
    COUNT(DISTINCT CASE WHEN sn.read_at IS NOT NULL THEN sn.id END)::integer AS read_count,
    COUNT(sd.notification_id)::integer AS deliveries_total,
    COUNT(CASE WHEN sd.status = 'queued' THEN 1 END)::integer AS deliveries_queued,
    COUNT(CASE WHEN sd.status = 'sent' THEN 1 END)::integer AS deliveries_sent,
    COUNT(CASE WHEN sd.status = 'failed' THEN 1 END)::integer AS deliveries_failed,
    COUNT(CASE WHEN sd.channel = 'in_app' THEN 1 END)::integer AS in_app_total,
    COUNT(CASE WHEN sd.channel = 'email' THEN 1 END)::integer AS email_total,
    COUNT(CASE WHEN sd.channel = 'push' THEN 1 END)::integer AS push_total
  FROM campaign_scope cs
  LEFT JOIN scoped_notifications sn ON sn.campaign_id = cs.id
  LEFT JOIN scoped_deliveries sd ON sd.campaign_id = cs.id
  GROUP BY cs.id
  ORDER BY cs.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_stats(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
