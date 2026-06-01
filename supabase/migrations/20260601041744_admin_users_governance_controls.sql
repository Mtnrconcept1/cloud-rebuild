-- Admin user governance: audited role changes, account state, anomalies and full user detail.

CREATE TABLE IF NOT EXISTS public.admin_user_account_states (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  reason text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_user_account_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view user account states" ON public.admin_user_account_states;
CREATE POLICY "Admins can view user account states"
ON public.admin_user_account_states
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage user account states" ON public.admin_user_account_states;
CREATE POLICY "Admins can manage user account states"
ON public.admin_user_account_states
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  city text,
  roles text[],
  created_at timestamptz,
  email_confirmed_at timestamptz,
  account_status text,
  application_status text,
  courier_status text,
  anomalies text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base_users AS (
    SELECT
      au.id AS user_id,
      COALESCE(
        NULLIF(trim(COALESCE(p.full_name, '')), ''),
        NULLIF(trim(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), ''),
        split_part(COALESCE(au.email, au.id::text), '@', 1)
      ) AS full_name,
      au.email::text AS email,
      COALESCE(p.city, NULL) AS city,
      COALESCE(roles_map.roles, ARRAY['client']::text[]) AS roles,
      COALESCE(roles_map.role_count, 0) AS role_count,
      au.created_at,
      au.email_confirmed_at,
      COALESCE(account_state.status, 'active') AS account_status,
      latest_application.status AS application_status,
      latest_courier.status AS courier_status
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.user_id = au.id
    LEFT JOIN public.user_profiles up ON up.user_id = au.id
    LEFT JOIN public.admin_user_account_states account_state ON account_state.user_id = au.id
    LEFT JOIN LATERAL (
      SELECT array_agg(ur.role::text ORDER BY ur.role::text) AS roles, count(*) AS role_count
      FROM public.user_roles ur
      WHERE ur.user_id = au.id
    ) AS roles_map ON true
    LEFT JOIN LATERAL (
      SELECT sa.status
      FROM public.signup_applications sa
      WHERE sa.user_id = au.id
      ORDER BY sa.submitted_at DESC NULLS LAST, sa.created_at DESC
      LIMIT 1
    ) AS latest_application ON true
    LEFT JOIN LATERAL (
      SELECT c.status
      FROM public.couriers c
      WHERE c.user_id = au.id
      ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
      LIMIT 1
    ) AS latest_courier ON true
  )
  SELECT
    bu.user_id,
    bu.full_name,
    bu.email,
    bu.city,
    bu.roles,
    bu.created_at,
    bu.email_confirmed_at,
    bu.account_status,
    bu.application_status,
    bu.courier_status,
    array_remove(ARRAY[
      CASE WHEN bu.role_count = 0 THEN 'user_without_role' END,
      CASE WHEN 'restaurateur' = ANY(bu.roles)
        AND NOT EXISTS (
          SELECT 1 FROM public.restaurants r WHERE r.owner_id = bu.user_id
        )
        THEN 'restaurateur_without_restaurant'
      END,
      CASE WHEN 'courier' = ANY(bu.roles)
        AND NOT EXISTS (
          SELECT 1 FROM public.couriers c WHERE c.user_id = bu.user_id
        )
        THEN 'courier_without_profile'
      END,
      CASE WHEN bu.email_confirmed_at IS NULL THEN 'email_unconfirmed' END,
      CASE WHEN bu.account_status = 'suspended' THEN 'account_suspended' END
    ]::text[], NULL) AS anomalies
  FROM base_users bu
  ORDER BY bu.full_name;
END;
$$;

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
  v_actor_id uuid := auth.uid();
  v_role public.app_role;
  v_roles public.app_role[];
  v_old_roles public.app_role[];
  v_last_admin_removal boolean;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT role_name
    FROM unnest(COALESCE(p_roles, ARRAY['client'::public.app_role])) AS role_name
    WHERE role_name IS NOT NULL
    ORDER BY role_name::text
  )
  INTO v_roles;

  IF COALESCE(array_length(v_roles, 1), 0) = 0 THEN
    v_roles := ARRAY['client'::public.app_role];
  END IF;

  PERFORM 1
  FROM public.user_roles
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT COALESCE(array_agg(ur.role ORDER BY ur.role::text), ARRAY[]::public.app_role[])
  INTO v_old_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;

  v_last_admin_removal :=
    'admin'::public.app_role = ANY(v_old_roles)
    AND NOT ('admin'::public.app_role = ANY(v_roles))
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.role = 'admin'::public.app_role
        AND ur.user_id <> p_user_id
    );

  IF v_last_admin_removal THEN
    RAISE EXCEPTION 'Cannot remove the last admin role.';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  FOREACH v_role IN ARRAY v_roles LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_set_user_roles',
    'user_roles',
    p_user_id,
    jsonb_build_object('roles', COALESCE(to_jsonb(v_old_roles), '[]'::jsonb)),
    jsonb_build_object('roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_account_status(
  p_user_id uuid,
  p_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_next_status text := lower(trim(COALESCE(p_status, '')));
  v_before public.admin_user_account_states%ROWTYPE;
  v_after public.admin_user_account_states%ROWTYPE;
  v_target_roles public.app_role[];
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Unsupported account status: %', p_status;
  END IF;

  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required for account status changes.';
  END IF;

  SELECT COALESCE(array_agg(ur.role), ARRAY[]::public.app_role[])
  INTO v_target_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;

  IF v_next_status = 'suspended'
    AND 'admin'::public.app_role = ANY(v_target_roles)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      LEFT JOIN public.admin_user_account_states aus ON aus.user_id = ur.user_id
      WHERE ur.role = 'admin'::public.app_role
        AND ur.user_id <> p_user_id
        AND COALESCE(aus.status, 'active') = 'active'
    )
  THEN
    RAISE EXCEPTION 'Cannot suspend the last active admin.';
  END IF;

  SELECT *
  INTO v_before
  FROM public.admin_user_account_states
  WHERE user_id = p_user_id;

  INSERT INTO public.admin_user_account_states (user_id, status, reason, updated_by, updated_at)
  VALUES (p_user_id, v_next_status, NULLIF(trim(COALESCE(p_reason, '')), ''), v_actor_id, now())
  ON CONFLICT (user_id) DO UPDATE
  SET status = EXCLUDED.status,
      reason = EXCLUDED.reason,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  RETURNING * INTO v_after;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_set_user_account_status',
    'admin_user_account_states',
    p_user_id,
    COALESCE(to_jsonb(v_before), '{}'::jsonb),
    to_jsonb(v_after)
  );

  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_admin_detail(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_user jsonb;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT to_jsonb(listed_user)
  INTO v_user
  FROM public.admin_list_users() listed_user
  WHERE listed_user.user_id = p_user_id
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  RETURN jsonb_build_object(
    'user', v_user,
    'orders_summary', (
      SELECT jsonb_build_object(
        'total', count(*),
        'open', count(*) FILTER (WHERE o.status NOT IN ('delivered', 'cancelled', 'refunded')),
        'last_at', max(o.created_at),
        'amount_chf', COALESCE(sum(o.total_amount), 0)
      )
      FROM public.orders o
      WHERE o.user_id = p_user_id
    ),
    'reservations_summary', (
      SELECT jsonb_build_object(
        'total', count(*),
        'open', count(*) FILTER (WHERE r.status NOT IN ('completed', 'cancelled', 'no_show')),
        'last_at', max(r.created_at),
        'amount_chf', COALESCE(sum(r.total_amount), 0)
      )
      FROM public.reservations r
      WHERE r.user_id = p_user_id
    ),
    'incidents_summary', (
      SELECT jsonb_build_object(
        'total', count(*),
        'open', count(*) FILTER (WHERE st.status NOT IN ('resolved', 'closed')),
        'critical', count(*) FILTER (WHERE st.priority IN ('critical', 'high')),
        'last_at', max(st.created_at)
      )
      FROM public.support_tickets st
      WHERE st.user_id = p_user_id
    ),
    'restaurants', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'status', r.status,
          'is_active', r.is_active,
          'city', r.city,
          'created_at', r.created_at
        )
        ORDER BY r.created_at DESC
      )
      FROM public.restaurants r
      WHERE r.owner_id = p_user_id
    ), '[]'::jsonb),
    'courier_profile', (
      SELECT to_jsonb(courier_row)
      FROM (
        SELECT c.id, c.status, c.vehicle_type, c.phone, c.rating, c.total_deliveries, c.is_online, c.updated_at
        FROM public.couriers c
        WHERE c.user_id = p_user_id
        ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
        LIMIT 1
      ) AS courier_row
    ),
    'applications', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sa.id,
          'requested_role', sa.requested_role,
          'status', sa.status,
          'review_note', sa.review_note,
          'submitted_at', sa.submitted_at,
          'reviewed_at', sa.reviewed_at,
          'documents', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', sad.id,
                'document_type', sad.document_type,
                'status', sad.status,
                'reviewed_at', sad.reviewed_at,
                'rejection_reason', sad.rejection_reason
              )
              ORDER BY sad.created_at ASC
            )
            FROM public.signup_application_documents sad
            WHERE sad.application_id = sa.id
          ), '[]'::jsonb)
        )
        ORDER BY sa.submitted_at DESC NULLS LAST, sa.created_at DESC
      )
      FROM public.signup_applications sa
      WHERE sa.user_id = p_user_id
    ), '[]'::jsonb),
    'recent_history', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', history.id,
          'action', history.action,
          'entity_type', history.entity_type,
          'entity_id', history.entity_id,
          'old_data', history.old_data,
          'new_data', history.new_data,
          'created_at', history.created_at,
          'admin_id', history.user_id
        )
        ORDER BY history.created_at DESC
      )
      FROM (
        SELECT al.*
        FROM public.audit_log al
        WHERE al.entity_id = p_user_id
          OR al.old_data ->> 'user_id' = p_user_id::text
          OR al.new_data ->> 'user_id' = p_user_id::text
          OR al.old_data ->> 'target_user_id' = p_user_id::text
          OR al.new_data ->> 'target_user_id' = p_user_id::text
        ORDER BY al.created_at DESC
        LIMIT 25
      ) AS history
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_governance_alerts()
RETURNS TABLE (
  alert_key text,
  severity text,
  user_id uuid,
  title text,
  description text,
  anomaly text,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    concat(listed_user.user_id::text, ':', anomaly_name)::text AS alert_key,
    CASE
      WHEN anomaly_name IN ('restaurateur_without_restaurant', 'courier_without_profile', 'account_suspended') THEN 'critical'
      ELSE 'warning'
    END AS severity,
    listed_user.user_id,
    CASE anomaly_name
      WHEN 'restaurateur_without_restaurant' THEN 'Restaurateur sans restaurant'
      WHEN 'courier_without_profile' THEN 'Livreur sans profil'
      WHEN 'user_without_role' THEN 'Utilisateur sans rôle'
      WHEN 'email_unconfirmed' THEN 'Email non confirmé'
      WHEN 'account_suspended' THEN 'Compte suspendu'
      ELSE 'Anomalie utilisateur'
    END AS title,
    CASE anomaly_name
      WHEN 'restaurateur_without_restaurant' THEN 'Le rôle restaurateur existe sans fiche restaurant liée.'
      WHEN 'courier_without_profile' THEN 'Le rôle livreur existe sans profil coursier.'
      WHEN 'user_without_role' THEN 'Aucun rôle applicatif explicite n est rattaché au compte.'
      WHEN 'email_unconfirmed' THEN 'L adresse email n est pas encore confirmée.'
      WHEN 'account_suspended' THEN 'Le compte est suspendu par décision admin.'
      ELSE 'Signal à vérifier dans la fiche utilisateur.'
    END AS description,
    anomaly_name AS anomaly,
    jsonb_build_object(
      'email', listed_user.email,
      'full_name', listed_user.full_name,
      'roles', listed_user.roles,
      'city', listed_user.city,
      'account_status', listed_user.account_status,
      'application_status', listed_user.application_status,
      'courier_status', listed_user.courier_status
    ) AS metadata
  FROM public.admin_list_users() listed_user
  CROSS JOIN LATERAL unnest(listed_user.anomalies) AS anomaly_name
  ORDER BY severity, listed_user.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_signup_application(
  p_application_id uuid,
  p_status text,
  p_review_note text DEFAULT NULL
)
RETURNS TABLE (application_id uuid, application_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_application public.signup_applications%ROWTYPE;
  v_next_status text := lower(trim(COALESCE(p_status, '')));
  v_restaurant_id uuid;
  v_applicant_email text;
  v_role_label text;
  v_documents_count integer;
BEGIN
  IF NOT v_is_service_role AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_next_status NOT IN ('approved', 'needs_changes', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review status: %', p_status;
  END IF;

  SELECT * INTO v_application FROM public.signup_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup application not found';
  END IF;

  UPDATE public.signup_applications
  SET status = v_next_status,
      review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
      reviewed_at = now(),
      reviewed_by = CASE WHEN v_is_service_role THEN reviewed_by ELSE v_actor_id END,
      updated_at = now()
  WHERE id = p_application_id;

  UPDATE public.signup_application_documents
  SET status = CASE WHEN v_next_status = 'approved' THEN 'approved' ELSE 'rejected' END,
      rejection_reason = CASE WHEN v_next_status = 'approved' THEN NULL
                              ELSE NULLIF(trim(COALESCE(p_review_note, '')), '') END,
      reviewed_at = now(),
      reviewed_by = CASE WHEN v_is_service_role THEN reviewed_by ELSE v_actor_id END,
      updated_at = now()
  WHERE application_id = p_application_id;

  GET DIAGNOSTICS v_documents_count = ROW_COUNT;

  IF v_next_status = 'approved' AND v_application.requested_role <> 'client' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_application.user_id, v_application.requested_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF v_application.requested_role <> 'client' THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_application.user_id AND role = v_application.requested_role;
  END IF;

  IF v_application.requested_role = 'courier' THEN
    UPDATE public.couriers
    SET status = CASE WHEN v_next_status = 'approved' THEN 'approved'
                      WHEN v_next_status = 'rejected' THEN 'rejected'
                      ELSE 'pending_approval' END,
        is_online = CASE WHEN v_next_status = 'approved' THEN is_online ELSE false END,
        updated_at = now()
    WHERE user_id = v_application.user_id;
  ELSIF v_application.requested_role = 'restaurateur' THEN
    v_restaurant_id := NULLIF(v_application.metadata->>'restaurant_id', '')::uuid;
    IF v_restaurant_id IS NULL THEN
      SELECT id INTO v_restaurant_id FROM public.restaurants
      WHERE owner_id = v_application.user_id ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF v_restaurant_id IS NOT NULL THEN
      UPDATE public.restaurants
      SET status = CASE WHEN v_next_status = 'approved' THEN 'active'
                        WHEN v_next_status = 'rejected' THEN 'rejected'
                        ELSE 'needs_changes' END,
          is_active = (v_next_status = 'approved'),
          updated_at = now()
      WHERE id = v_restaurant_id;
    END IF;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    CASE WHEN v_is_service_role THEN NULL ELSE v_actor_id END,
    'admin_review_signup_application',
    'signup_applications',
    p_application_id,
    jsonb_build_object(
      'status', v_application.status,
      'review_note', v_application.review_note,
      'user_id', v_application.user_id,
      'requested_role', v_application.requested_role
    ),
    jsonb_build_object(
      'status', v_next_status,
      'review_note', NULLIF(trim(COALESCE(p_review_note, '')), ''),
      'user_id', v_application.user_id,
      'requested_role', v_application.requested_role,
      'documents_count', v_documents_count,
      'restaurant_id', v_restaurant_id
    )
  );

  SELECT email INTO v_applicant_email FROM auth.users WHERE id = v_application.user_id;
  IF v_applicant_email IS NOT NULL THEN
    v_role_label := CASE WHEN v_application.requested_role = 'courier' THEN 'livreur' ELSE 'restaurateur' END;
    INSERT INTO public.email_queue (to_email, subject, body_text, metadata)
    VALUES (
      v_applicant_email,
      CASE v_next_status
        WHEN 'approved' THEN 'Votre compte ' || v_role_label || ' est validé'
        WHEN 'needs_changes' THEN 'Corrections demandées sur votre dossier ' || v_role_label
        ELSE 'Votre demande ' || v_role_label || ' a été refusée'
      END,
      CASE v_next_status
        WHEN 'approved' THEN 'Bonne nouvelle : votre dossier ' || v_role_label ||
          ' a été approuvé. Vous pouvez désormais accéder à votre espace.'
        WHEN 'needs_changes' THEN 'Votre dossier nécessite des corrections : ' ||
          COALESCE(NULLIF(trim(p_review_note), ''), 'voir le détail dans l''application') ||
          '. Reprenez votre dossier dans la rubrique onboarding.'
        ELSE 'Votre demande ' || v_role_label || ' a été refusée.' ||
          CASE WHEN NULLIF(trim(p_review_note), '') IS NOT NULL THEN ' ' || trim(p_review_note) ELSE '' END
      END,
      jsonb_build_object('application_id', p_application_id, 'kind', 'signup_decision', 'status', v_next_status)
    );
  END IF;

  RETURN QUERY SELECT p_application_id, v_next_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_account_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_admin_detail(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_governance_alerts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_account_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_admin_detail(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_governance_alerts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
