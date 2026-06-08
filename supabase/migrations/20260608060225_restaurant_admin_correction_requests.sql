-- Admin-to-restaurant correction workflow.
-- Admins can request a correction from the restaurant fiche, the owner sees it
-- on the restaurateur dashboard and can acknowledge completion.

CREATE TABLE IF NOT EXISTS public.restaurant_admin_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  owner_notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT restaurant_admin_correction_requests_status_check
    CHECK (status IN ('open', 'completed', 'cancelled')),
  CONSTRAINT restaurant_admin_correction_requests_reason_not_blank
    CHECK (length(trim(reason)) > 0),
  CONSTRAINT restaurant_admin_correction_requests_completed_state_check
    CHECK (
      (status = 'completed' AND completed_at IS NOT NULL)
      OR (status <> 'completed' AND completed_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_restaurant_admin_correction_requests_restaurant_status
  ON public.restaurant_admin_correction_requests(restaurant_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_restaurant_admin_correction_requests_notification
  ON public.restaurant_admin_correction_requests(owner_notification_id)
  WHERE owner_notification_id IS NOT NULL;

ALTER TABLE public.restaurant_admin_correction_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_admin_correction_requests_admin_select" ON public.restaurant_admin_correction_requests;
CREATE POLICY "restaurant_admin_correction_requests_admin_select"
  ON public.restaurant_admin_correction_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "restaurant_admin_correction_requests_owner_select" ON public.restaurant_admin_correction_requests;
CREATE POLICY "restaurant_admin_correction_requests_owner_select"
  ON public.restaurant_admin_correction_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_admin_correction_requests.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

GRANT SELECT ON public.restaurant_admin_correction_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_record_restaurant_admin_action(
  p_restaurant_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_action text := lower(trim(COALESCE(p_action, '')));
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_owner_id uuid;
  v_restaurant_name text;
  v_notification_id uuid;
  v_correction_request_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF v_action NOT IN ('request_correction', 'reindex_catalog', 'send_notification') THEN
    RAISE EXCEPTION 'Unsupported restaurant admin action: %', p_action USING ERRCODE = '22023';
  END IF;

  IF v_action IN ('request_correction', 'send_notification') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Admin action reason is required.' USING ERRCODE = '22023';
  END IF;

  SELECT r.owner_id, r.name
  INTO v_owner_id, v_restaurant_name
  FROM public.restaurants r
  WHERE r.id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found.' USING ERRCODE = '22023';
  END IF;

  IF v_action IN ('request_correction', 'send_notification') AND v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant owner is required to notify the restaurateur.' USING ERRCODE = '22023';
  END IF;

  IF v_action = 'request_correction' THEN
    v_notification_id := public.enqueue_notification(
      v_owner_id,
      'Correction demandée par TOK',
      v_reason,
      'in_app',
      'admin_restaurant',
      json_build_object(
        'restaurant_id', p_restaurant_id,
        'restaurant_name', v_restaurant_name,
        'admin_action', v_action
      )
    );

    INSERT INTO public.restaurant_admin_correction_requests (
      restaurant_id,
      requested_by,
      reason,
      owner_notification_id
    )
    VALUES (
      p_restaurant_id,
      v_actor_id,
      v_reason,
      v_notification_id
    )
    RETURNING id INTO v_correction_request_id;

    UPDATE public.notifications
    SET data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
      'correction_request_id', v_correction_request_id
    )
    WHERE id = v_notification_id;
  ELSIF v_action = 'send_notification' THEN
    v_notification_id := public.enqueue_notification(
      v_owner_id,
      'Action admin TOK',
      COALESCE(v_reason, 'Une action administrative concerne votre restaurant.'),
      'in_app',
      'admin_restaurant',
      json_build_object(
        'restaurant_id', p_restaurant_id,
        'restaurant_name', v_restaurant_name,
        'admin_action', v_action
      )
    );
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_record_restaurant_admin_action',
    'restaurants',
    p_restaurant_id,
    NULL,
    jsonb_build_object(
      'restaurant_action', v_action,
      'reason', v_reason,
      'notification_id', v_notification_id,
      'correction_request_id', v_correction_request_id
    )
  );

  RETURN jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'action', v_action,
    'notification_id', v_notification_id,
    'correction_request_id', v_correction_request_id,
    'recorded', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_mark_admin_correction_done(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_request public.restaurant_admin_correction_requests%ROWTYPE;
  v_owner_id uuid;
  v_restaurant_name text;
BEGIN
  SELECT acr.*
  INTO v_request
  FROM public.restaurant_admin_correction_requests acr
  WHERE acr.id = p_request_id
  FOR UPDATE OF acr;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request not found.' USING ERRCODE = '22023';
  END IF;

  SELECT r.owner_id, r.name
  INTO v_owner_id, v_restaurant_name
  FROM public.restaurants r
  WHERE r.id = v_request.restaurant_id;

  IF auth.role() <> 'service_role' AND (v_actor_id IS NULL OR v_owner_id IS DISTINCT FROM v_actor_id) THEN
    RAISE EXCEPTION 'Restaurant owner access required.' USING ERRCODE = '42501';
  END IF;

  IF v_request.status <> 'open' THEN
    RETURN jsonb_build_object(
      'correction_request_id', p_request_id,
      'restaurant_id', v_request.restaurant_id,
      'status', v_request.status,
      'updated', false
    );
  END IF;

  UPDATE public.restaurant_admin_correction_requests
  SET
    status = 'completed',
    completed_at = now(),
    completed_by = v_actor_id
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  UPDATE public.notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = v_request.owner_notification_id
    AND user_id = v_owner_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'restaurant_mark_admin_correction_done',
    'restaurants',
    v_request.restaurant_id,
    jsonb_build_object(
      'correction_request_id', p_request_id,
      'status', 'open'
    ),
    jsonb_build_object(
      'correction_request_id', p_request_id,
      'status', v_request.status,
      'completed_at', v_request.completed_at,
      'restaurant_name', v_restaurant_name
    )
  );

  RETURN jsonb_build_object(
    'correction_request_id', p_request_id,
    'restaurant_id', v_request.restaurant_id,
    'status', v_request.status,
    'completed_at', v_request.completed_at,
    'updated', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_record_restaurant_admin_action(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_record_restaurant_admin_action(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_restaurant_admin_action(uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.restaurant_mark_admin_correction_done(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restaurant_mark_admin_correction_done(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restaurant_mark_admin_correction_done(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
