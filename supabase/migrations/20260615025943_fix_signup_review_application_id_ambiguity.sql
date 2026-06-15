-- Fix admin signup review ambiguity.
-- In PL/pgSQL, RETURNS TABLE output columns are variables. The output
-- `application_id` collides with signup_application_documents.application_id
-- when it is unqualified in WHERE clauses. Qualify every table column in the
-- review RPC so approve / reject / needs_changes works for restaurateur
-- dossiers.

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
BEGIN
  IF NOT v_is_service_role AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_next_status NOT IN ('approved', 'needs_changes', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review status: %', p_status;
  END IF;

  SELECT sa.* INTO v_application
  FROM public.signup_applications AS sa
  WHERE sa.id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup application not found';
  END IF;

  IF v_next_status = 'approved'
    AND v_application.requested_role = 'restaurateur'
    AND public.signup_restaurateur_onboarding_payment_ready(p_application_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding payment required before approval';
  END IF;

  UPDATE public.signup_applications AS sa
  SET status = v_next_status,
      review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
      reviewed_at = now(),
      reviewed_by = CASE WHEN v_is_service_role THEN sa.reviewed_by ELSE v_actor_id END,
      updated_at = now()
  WHERE sa.id = p_application_id;

  UPDATE public.signup_application_documents AS sad
  SET status = CASE WHEN v_next_status = 'approved' THEN 'approved' ELSE 'rejected' END,
      rejection_reason = CASE WHEN v_next_status = 'approved' THEN NULL
                              ELSE NULLIF(trim(COALESCE(p_review_note, '')), '') END,
      reviewed_at = now(),
      reviewed_by = CASE WHEN v_is_service_role THEN sad.reviewed_by ELSE v_actor_id END,
      updated_at = now()
  WHERE sad.application_id = p_application_id;

  IF v_next_status = 'approved' AND v_application.requested_role <> 'client' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_application.user_id, v_application.requested_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF v_application.requested_role = 'courier' THEN
    DELETE FROM public.user_roles AS ur
    WHERE ur.user_id = v_application.user_id
      AND ur.role = v_application.requested_role;
  END IF;

  IF v_application.requested_role = 'courier' THEN
    UPDATE public.couriers AS c
    SET status = CASE WHEN v_next_status = 'approved' THEN 'approved'
                      WHEN v_next_status = 'rejected' THEN 'rejected'
                      ELSE 'pending_approval' END,
        is_online = CASE WHEN v_next_status = 'approved' THEN c.is_online ELSE false END,
        updated_at = now()
    WHERE c.user_id = v_application.user_id;
  ELSIF v_application.requested_role = 'restaurateur' THEN
    v_restaurant_id := NULLIF(v_application.metadata->>'restaurant_id', '')::uuid;

    IF v_restaurant_id IS NULL THEN
      SELECT r.id INTO v_restaurant_id
      FROM public.restaurants AS r
      WHERE r.owner_id = v_application.user_id
      ORDER BY r.created_at ASC
      LIMIT 1;
    END IF;

    IF v_restaurant_id IS NOT NULL THEN
      UPDATE public.restaurants AS r
      SET status = CASE WHEN v_next_status = 'approved' THEN 'active'
                        WHEN v_next_status = 'rejected' THEN 'rejected'
                        ELSE 'needs_changes' END,
          is_active = (v_next_status = 'approved'),
          updated_at = now()
      WHERE r.id = v_restaurant_id;
    END IF;
  END IF;

  SELECT au.email INTO v_applicant_email
  FROM auth.users AS au
  WHERE au.id = v_application.user_id;

  IF v_applicant_email IS NOT NULL THEN
    v_role_label := CASE WHEN v_application.requested_role = 'courier' THEN 'livreur' ELSE 'restaurateur' END;

    INSERT INTO public.email_queue (to_email, subject, body_text, metadata)
    VALUES (
      v_applicant_email,
      CASE v_next_status
        WHEN 'approved' THEN 'Votre compte ' || v_role_label || ' est valide'
        WHEN 'needs_changes' THEN 'Corrections demandees sur votre dossier ' || v_role_label
        ELSE 'Votre demande ' || v_role_label || ' a ete refusee'
      END,
      CASE v_next_status
        WHEN 'approved' THEN 'Bonne nouvelle : votre dossier ' || v_role_label ||
          ' a ete approuve. Vous pouvez desormais acceder a votre espace.'
        WHEN 'needs_changes' THEN 'Votre dossier necessite des corrections : ' ||
          COALESCE(NULLIF(trim(p_review_note), ''), 'voir le detail dans l''application') ||
          '. Reprenez votre dossier dans la rubrique onboarding.'
        ELSE 'Votre demande ' || v_role_label || ' a ete refusee.' ||
          CASE WHEN NULLIF(trim(p_review_note), '') IS NOT NULL THEN ' ' || trim(p_review_note) ELSE '' END
      END,
      jsonb_build_object('application_id', p_application_id, 'kind', 'signup_decision', 'status', v_next_status)
    );
  END IF;

  RETURN QUERY
  SELECT p_application_id AS application_id,
         v_next_status AS application_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_signup_application(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
