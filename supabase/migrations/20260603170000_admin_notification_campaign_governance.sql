-- Govern admin notification campaign mutations through audited RPCs.

DROP POLICY IF EXISTS "Admins can manage campaigns" ON public.notification_campaigns;
DROP POLICY IF EXISTS "notification_campaigns_admin_select" ON public.notification_campaigns;

CREATE POLICY "notification_campaigns_admin_select"
  ON public.notification_campaigns
  FOR SELECT
  TO authenticated
  USING (public.auth_is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.notification_campaigns FROM authenticated;
REVOKE INSERT, DELETE ON public.notifications FROM authenticated;

CREATE OR REPLACE FUNCTION public.admin_normalize_notification_channels(p_channels jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_channels jsonb;
BEGIN
  v_channels := jsonb_build_object(
    'in_app', COALESCE((p_channels ->> 'in_app')::boolean, true),
    'email', COALESCE((p_channels ->> 'email')::boolean, true),
    'push', COALESCE((p_channels ->> 'push')::boolean, false)
  );

  IF NOT (
    COALESCE((v_channels ->> 'in_app')::boolean, false)
    OR COALESCE((v_channels ->> 'email')::boolean, false)
    OR COALESCE((v_channels ->> 'push')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'At least one notification channel is required.' USING ERRCODE = '22023';
  END IF;

  RETURN v_channels;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_normalize_notification_roles(p_roles text[] DEFAULT '{}'::text[])
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_roles text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT role_name ORDER BY role_name), '{}'::text[])
  INTO v_roles
  FROM (
    SELECT lower(trim(role_value)) AS role_name
    FROM unnest(COALESCE(p_roles, '{}'::text[])) AS role_value
    WHERE trim(role_value) <> ''
  ) roles;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_roles) AS role_name
    WHERE role_name NOT IN ('client', 'restaurateur', 'courier', 'admin')
  ) THEN
    RAISE EXCEPTION 'Unsupported notification target role.' USING ERRCODE = '22023';
  END IF;

  RETURN v_roles;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_normalize_notification_cities(p_cities text[] DEFAULT '{}'::text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT left(trim(city_value), 80) ORDER BY left(trim(city_value), 80)), '{}'::text[])
  FROM unnest(COALESCE(p_cities, '{}'::text[])) AS city_value
  WHERE trim(city_value) <> '';
$$;

CREATE OR REPLACE FUNCTION public.admin_save_notification_campaign(
  p_title text,
  p_body text,
  p_category text DEFAULT 'marketing',
  p_status text DEFAULT 'draft',
  p_scheduled_at timestamptz DEFAULT NULL,
  p_target_roles text[] DEFAULT '{}'::text[],
  p_target_cities text[] DEFAULT '{}'::text[],
  p_channels jsonb DEFAULT '{"in_app": true, "email": true, "push": false}'::jsonb,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_title text := left(trim(COALESCE(p_title, '')), 180);
  v_body text := left(trim(COALESCE(p_body, '')), 5000);
  v_category text := lower(trim(COALESCE(p_category, 'marketing')));
  v_status text := lower(trim(COALESCE(p_status, 'draft')));
  v_channels jsonb := public.admin_normalize_notification_channels(COALESCE(p_channels, '{}'::jsonb));
  v_target_roles text[] := public.admin_normalize_notification_roles(p_target_roles);
  v_target_cities text[] := public.admin_normalize_notification_cities(p_target_cities);
  v_campaign_id uuid;
  v_old public.notification_campaigns%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF length(v_title) < 3 THEN
    RAISE EXCEPTION 'Campaign title is required.' USING ERRCODE = '22023';
  END IF;

  IF length(v_body) < 10 THEN
    RAISE EXCEPTION 'Campaign body is required.' USING ERRCODE = '22023';
  END IF;

  IF v_category NOT IN ('marketing', 'transactional', 'product', 'system') THEN
    RAISE EXCEPTION 'Unsupported notification category.' USING ERRCODE = '22023';
  END IF;

  IF p_scheduled_at IS NOT NULL THEN
    v_status := 'scheduled';
  END IF;

  IF v_status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Campaign can only be saved as draft or scheduled.' USING ERRCODE = '22023';
  END IF;

  IF p_campaign_id IS NULL THEN
    INSERT INTO public.notification_campaigns (
      title,
      body,
      category,
      status,
      scheduled_at,
      created_by,
      target_roles,
      target_cities,
      channels
    )
    VALUES (
      v_title,
      v_body,
      v_category,
      v_status,
      p_scheduled_at,
      v_actor_id,
      v_target_roles,
      v_target_cities,
      v_channels
    )
    RETURNING id INTO v_campaign_id;
  ELSE
    SELECT *
    INTO v_old
    FROM public.notification_campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Campaign not found.' USING ERRCODE = '22023';
    END IF;

    IF v_old.status NOT IN ('draft', 'scheduled') THEN
      RAISE EXCEPTION 'Dispatched campaigns cannot be modified.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.notification_campaigns
    SET title = v_title,
        body = v_body,
        category = v_category,
        status = v_status,
        scheduled_at = p_scheduled_at,
        target_roles = v_target_roles,
        target_cities = v_target_cities,
        channels = v_channels
    WHERE id = p_campaign_id
    RETURNING id INTO v_campaign_id;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_save_notification_campaign',
    'notification_campaigns',
    v_campaign_id,
    CASE WHEN p_campaign_id IS NULL THEN NULL ELSE to_jsonb(v_old) END,
    jsonb_build_object(
      'title', v_title,
      'category', v_category,
      'status', v_status,
      'scheduled_at', p_scheduled_at,
      'target_roles', v_target_roles,
      'target_cities', v_target_cities,
      'channels', v_channels
    )
  );

  RETURN jsonb_build_object('campaign_id', v_campaign_id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_duplicate_notification_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_source public.notification_campaigns%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_source
  FROM public.notification_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notification_campaigns (
    title,
    body,
    category,
    status,
    scheduled_at,
    created_by,
    target_roles,
    target_cities,
    channels,
    image_url
  )
  VALUES (
    left(v_source.title || ' - copie', 180),
    v_source.body,
    v_source.category,
    'draft',
    NULL,
    v_actor_id,
    COALESCE(v_source.target_roles, '{}'::text[]),
    COALESCE(v_source.target_cities, '{}'::text[]),
    COALESCE(v_source.channels, '{"in_app": true, "email": true, "push": false}'::jsonb),
    v_source.image_url
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_duplicate_notification_campaign',
    'notification_campaigns',
    v_new_id,
    jsonb_build_object('source_campaign_id', p_campaign_id),
    jsonb_build_object('duplicated_campaign_id', v_new_id)
  );

  RETURN jsonb_build_object('campaign_id', v_new_id, 'source_campaign_id', p_campaign_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_notification_campaign(
  p_campaign_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_reason text := left(trim(COALESCE(p_reason, '')), 1000);
  v_old public.notification_campaigns%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Cancellation reason is required.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_old
  FROM public.notification_campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found.' USING ERRCODE = '22023';
  END IF;

  IF v_old.status IN ('sent', 'running') THEN
    RAISE EXCEPTION 'Sent or running campaigns cannot be cancelled.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notification_campaigns
  SET status = 'cancelled'
  WHERE id = p_campaign_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_cancel_notification_campaign',
    'notification_campaigns',
    p_campaign_id,
    to_jsonb(v_old),
    jsonb_build_object('status', 'cancelled', 'reason', v_reason)
  );

  RETURN jsonb_build_object('campaign_id', p_campaign_id, 'status', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_send_test_notification_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_campaign public.notification_campaigns%ROWTYPE;
  v_notification_id uuid;
  v_requested_channels jsonb := '{"in_app": true, "email": false, "push": false}'::jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated admin required.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_campaign
  FROM public.notification_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, category, data)
  VALUES (
    v_actor_id,
    '[TEST] ' || v_campaign.title,
    v_campaign.body,
    'campaign_test',
    v_campaign.category,
    jsonb_build_object(
      'campaign_id', v_campaign.id,
      'test', true,
      'requested_channels', v_requested_channels
    )
  )
  RETURNING id INTO v_notification_id;

  PERFORM public.queue_notification_deliveries(
    v_notification_id,
    v_actor_id,
    v_campaign.category,
    jsonb_build_object(
      'campaign_id', v_campaign.id,
      'test', true,
      'requested_channels', v_requested_channels
    )
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_send_test_notification_campaign',
    'notification_campaigns',
    p_campaign_id,
    NULL,
    jsonb_build_object('notification_id', v_notification_id)
  );

  RETURN jsonb_build_object('campaign_id', p_campaign_id, 'notification_id', v_notification_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_normalize_notification_channels(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_normalize_notification_roles(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_normalize_notification_cities(text[]) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.admin_save_notification_campaign(text, text, text, text, timestamptz, text[], text[], jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_save_notification_campaign(text, text, text, text, timestamptz, text[], text[], jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_save_notification_campaign(text, text, text, text, timestamptz, text[], text[], jsonb, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_duplicate_notification_campaign(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_duplicate_notification_campaign(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_duplicate_notification_campaign(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_notification_campaign(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_notification_campaign(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_notification_campaign(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_send_test_notification_campaign(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_send_test_notification_campaign(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_send_test_notification_campaign(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
