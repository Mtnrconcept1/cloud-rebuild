-- Admin review workflow for courier profiles.
-- Keeps the courier operational status and the application role in sync.

CREATE OR REPLACE FUNCTION public.admin_review_courier_profile(
  p_courier_id uuid,
  p_status text,
  p_review_note text DEFAULT NULL
)
RETURNS TABLE (courier_id uuid, courier_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_next_status text := lower(trim(COALESCE(p_status, '')));
  v_courier public.couriers%ROWTYPE;
  v_application_id uuid;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF v_next_status NOT IN ('approved', 'pending_approval', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported courier status: %', p_status;
  END IF;

  SELECT * INTO v_courier
  FROM public.couriers
  WHERE id = p_courier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Courier profile not found.';
  END IF;

  UPDATE public.couriers
  SET status = v_next_status,
      is_online = CASE WHEN v_next_status = 'approved' THEN is_online ELSE false END,
      updated_at = now()
  WHERE id = p_courier_id;

  IF v_next_status = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_courier.user_id, 'courier'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = v_courier.user_id
      AND role = 'courier'::public.app_role;
  END IF;

  SELECT id INTO v_application_id
  FROM public.signup_applications
  WHERE user_id = v_courier.user_id
    AND requested_role = 'courier'
  ORDER BY submitted_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_application_id IS NOT NULL AND v_next_status IN ('approved', 'pending_approval', 'rejected') THEN
    UPDATE public.signup_applications
    SET status = CASE
          WHEN v_next_status = 'approved' THEN 'approved'
          WHEN v_next_status = 'rejected' THEN 'rejected'
          ELSE 'pending_review'
        END,
        review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
        reviewed_at = CASE WHEN v_next_status = 'pending_approval' THEN reviewed_at ELSE now() END,
        reviewed_by = CASE WHEN v_next_status = 'pending_approval' THEN reviewed_by ELSE v_actor_id END,
        updated_at = now()
    WHERE id = v_application_id;

    UPDATE public.signup_application_documents
    SET status = CASE
          WHEN v_next_status = 'approved' THEN 'approved'
          WHEN v_next_status = 'rejected' THEN 'rejected'
          ELSE 'pending'
        END,
        rejection_reason = CASE
          WHEN v_next_status = 'rejected' THEN NULLIF(trim(COALESCE(p_review_note, '')), '')
          ELSE NULL
        END,
        reviewed_at = CASE WHEN v_next_status = 'pending_approval' THEN NULL ELSE now() END,
        reviewed_by = CASE WHEN v_next_status = 'pending_approval' THEN NULL ELSE v_actor_id END,
        updated_at = now()
    WHERE application_id = v_application_id;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_review_courier_profile',
    'couriers',
    p_courier_id,
    jsonb_build_object('status', v_courier.status, 'is_online', v_courier.is_online),
    jsonb_build_object(
      'status', v_next_status,
      'review_note', NULLIF(trim(COALESCE(p_review_note, '')), ''),
      'application_id', v_application_id
    )
  );

  RETURN QUERY SELECT p_courier_id, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_courier_profile(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_courier_profile(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
