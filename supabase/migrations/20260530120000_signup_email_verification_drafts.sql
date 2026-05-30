-- Durcissement inscription :
-- - statut 'awaiting_email' pour les brouillons restaurateur/livreur (avant confirmation email)
-- - RPC service-role admin_submit_signup_application (brouillon sans session, p_user_id explicite)
-- - trigger de promotion awaiting_email -> pending_review a la confirmation d'email + alerte admin
-- - email au demandeur depuis admin_review_signup_application

-- 1. Etendre la contrainte de statut
ALTER TABLE public.signup_applications
  DROP CONSTRAINT IF EXISTS signup_applications_status_check;
ALTER TABLE public.signup_applications
  ADD CONSTRAINT signup_applications_status_check
  CHECK (status IN ('awaiting_email', 'pending_review', 'approved', 'needs_changes', 'rejected'));

-- 2. RPC service-role : ecrit le brouillon (application + documents + restaurant/courier) au statut awaiting_email
CREATE OR REPLACE FUNCTION public.admin_submit_signup_application(
  p_user_id uuid,
  p_requested_role public.app_role,
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_legal_name text DEFAULT NULL,
  p_business_name text DEFAULT NULL,
  p_business_registration_number text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_restaurant_name text DEFAULT NULL,
  p_restaurant_description text DEFAULT NULL,
  p_vehicle_type text DEFAULT NULL,
  p_license_plate text DEFAULT NULL,
  p_iban text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_documents jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (application_id uuid, application_status text, restaurant_id uuid, courier_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application_id uuid;
  v_application_status text;
  v_required_docs text[] := ARRAY['identity_document'];
  v_uploaded_docs text[] := ARRAY[]::text[];
  v_doc jsonb;
  v_doc_type text;
  v_now timestamptz := now();
  v_restaurant_id uuid;
  v_courier_id uuid;
  v_vehicle_type text := lower(COALESCE(NULLIF(trim(p_vehicle_type), ''), 'bicycle'));
  v_role_text text := lower(p_requested_role::text);
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: service role required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF v_role_text NOT IN ('restaurateur', 'courier') THEN
    RAISE EXCEPTION 'Unsupported draft role: %', p_requested_role;
  END IF;

  IF NULLIF(trim(COALESCE(p_full_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;

  IF jsonb_typeof(COALESCE(p_documents, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Documents payload must be an array';
  END IF;

  IF v_role_text = 'courier' THEN
    v_required_docs := ARRAY['identity_document', 'work_permit', 'iban_proof'];
    IF v_vehicle_type IN ('scooter', 'car') THEN
      v_required_docs := v_required_docs || ARRAY['vehicle_registration'];
    END IF;
  ELSIF v_role_text = 'restaurateur' THEN
    v_required_docs := ARRAY['identity_document', 'business_registration', 'iban_proof'];
  END IF;

  INSERT INTO public.profiles (user_id, full_name, phone, city, address)
  VALUES (
    p_user_id,
    trim(p_full_name),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_city, '')), ''),
    NULLIF(trim(COALESCE(p_address, '')), '')
  )
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        city = COALESCE(EXCLUDED.city, public.profiles.city),
        address = COALESCE(EXCLUDED.address, public.profiles.address),
        updated_at = v_now;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'client')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.signup_applications (
    user_id, requested_role, status, full_name, phone, city, address,
    legal_name, business_name, business_registration_number, tax_id,
    restaurant_name, restaurant_description, vehicle_type, license_plate, iban,
    metadata, submitted_at, reviewed_at, reviewed_by, review_note
  )
  VALUES (
    p_user_id, p_requested_role, 'awaiting_email', trim(p_full_name),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_city, '')), ''),
    NULLIF(trim(COALESCE(p_address, '')), ''),
    NULLIF(trim(COALESCE(p_legal_name, '')), ''),
    NULLIF(trim(COALESCE(p_business_name, '')), ''),
    NULLIF(trim(COALESCE(p_business_registration_number, '')), ''),
    NULLIF(trim(COALESCE(p_tax_id, '')), ''),
    NULLIF(trim(COALESCE(p_restaurant_name, '')), ''),
    NULLIF(trim(COALESCE(p_restaurant_description, '')), ''),
    CASE WHEN v_role_text = 'courier' THEN v_vehicle_type ELSE NULL END,
    NULLIF(trim(COALESCE(p_license_plate, '')), ''),
    NULLIF(trim(COALESCE(p_iban, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb), v_now, NULL, NULL, NULL
  )
  ON CONFLICT (user_id, requested_role) DO UPDATE
    SET status = 'awaiting_email',
        full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, city = EXCLUDED.city,
        address = EXCLUDED.address, legal_name = EXCLUDED.legal_name,
        business_name = EXCLUDED.business_name,
        business_registration_number = EXCLUDED.business_registration_number,
        tax_id = EXCLUDED.tax_id, restaurant_name = EXCLUDED.restaurant_name,
        restaurant_description = EXCLUDED.restaurant_description,
        vehicle_type = EXCLUDED.vehicle_type, license_plate = EXCLUDED.license_plate,
        iban = EXCLUDED.iban, metadata = EXCLUDED.metadata, submitted_at = v_now,
        reviewed_at = NULL, reviewed_by = NULL, review_note = NULL, updated_at = v_now
  RETURNING id, status INTO v_application_id, v_application_status;

  FOR v_doc IN SELECT value FROM jsonb_array_elements(COALESCE(p_documents, '[]'::jsonb))
  LOOP
    v_doc_type := lower(COALESCE(v_doc->>'document_type', ''));
    IF v_doc_type = '' THEN
      RAISE EXCEPTION 'document_type is required for every uploaded document';
    END IF;
    IF COALESCE(v_doc->>'file_path', '') = '' THEN
      RAISE EXCEPTION 'file_path is required for document %', v_doc_type;
    END IF;

    INSERT INTO public.signup_application_documents (
      application_id, user_id, document_type, file_path, file_name,
      mime_type, file_size_bytes, status, reviewed_at, reviewed_by, rejection_reason
    )
    VALUES (
      v_application_id, p_user_id, v_doc_type, v_doc->>'file_path',
      NULLIF(v_doc->>'file_name', ''), NULLIF(v_doc->>'mime_type', ''),
      CASE WHEN NULLIF(v_doc->>'file_size_bytes', '') IS NULL THEN NULL
           ELSE GREATEST((v_doc->>'file_size_bytes')::integer, 0) END,
      'pending', NULL, NULL, NULL
    )
    ON CONFLICT (application_id, document_type) DO UPDATE
      SET file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type, file_size_bytes = EXCLUDED.file_size_bytes,
          status = 'pending', reviewed_at = NULL, reviewed_by = NULL,
          rejection_reason = NULL, updated_at = v_now;
  END LOOP;

  SELECT ARRAY_AGG(document_type ORDER BY document_type) INTO v_uploaded_docs
  FROM public.signup_application_documents WHERE application_id = v_application_id;

  IF COALESCE(v_uploaded_docs, ARRAY[]::text[]) @> v_required_docs IS NOT TRUE THEN
    RAISE EXCEPTION 'Missing required verification documents for role %', p_requested_role;
  END IF;

  IF v_role_text = 'courier' THEN
    INSERT INTO public.couriers (
      user_id, first_name, last_name, phone, status, vehicle_type, license_plate, iban, is_online, updated_at
    )
    VALUES (
      p_user_id, split_part(trim(p_full_name), ' ', 1),
      NULLIF(trim(substr(trim(p_full_name), length(split_part(trim(p_full_name), ' ', 1)) + 1)), ''),
      NULLIF(trim(COALESCE(p_phone, '')), ''), 'pending_approval', v_vehicle_type,
      NULLIF(trim(COALESCE(p_license_plate, '')), ''), NULLIF(trim(COALESCE(p_iban, '')), ''), false, v_now
    )
    ON CONFLICT (user_id) DO UPDATE
      SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, phone = EXCLUDED.phone,
          vehicle_type = EXCLUDED.vehicle_type, license_plate = EXCLUDED.license_plate, iban = EXCLUDED.iban,
          status = CASE WHEN public.couriers.status = 'approved' THEN public.couriers.status ELSE 'pending_approval' END,
          is_online = CASE WHEN public.couriers.status = 'approved' THEN public.couriers.is_online ELSE false END,
          updated_at = v_now
    RETURNING id INTO v_courier_id;
  ELSIF v_role_text = 'restaurateur' THEN
    SELECT r.id INTO v_restaurant_id FROM public.restaurants r
    WHERE r.owner_id = p_user_id ORDER BY r.created_at ASC LIMIT 1;

    IF v_restaurant_id IS NULL THEN
      INSERT INTO public.restaurants (owner_id, name, description, legal_name, address, city, phone, is_active, status)
      VALUES (
        p_user_id,
        COALESCE(NULLIF(trim(COALESCE(p_restaurant_name, '')), ''), NULLIF(trim(COALESCE(p_business_name, '')), ''), 'Restaurant a valider'),
        NULLIF(trim(COALESCE(p_restaurant_description, '')), ''),
        NULLIF(trim(COALESCE(p_legal_name, '')), ''),
        COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), 'Adresse a confirmer'),
        COALESCE(NULLIF(trim(COALESCE(p_city, '')), ''), 'Ville a confirmer'),
        NULLIF(trim(COALESCE(p_phone, '')), ''), false, 'pending'
      )
      RETURNING id INTO v_restaurant_id;
    ELSE
      UPDATE public.restaurants
      SET legal_name = COALESCE(NULLIF(trim(COALESCE(p_legal_name, '')), ''), public.restaurants.legal_name),
          phone = COALESCE(NULLIF(trim(COALESCE(p_phone, '')), ''), public.restaurants.phone),
          description = COALESCE(NULLIF(trim(COALESCE(p_restaurant_description, '')), ''), public.restaurants.description),
          updated_at = v_now
      WHERE id = v_restaurant_id;
    END IF;

    UPDATE public.signup_applications
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('restaurant_id', v_restaurant_id)
    WHERE id = v_application_id;
  END IF;

  RETURN QUERY SELECT v_application_id, v_application_status, v_restaurant_id, v_courier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_submit_signup_application(
  uuid, public.app_role, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_submit_signup_application(
  uuid, public.app_role, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb
) TO service_role;

-- 3. Trigger de promotion a la confirmation d'email + alerte admin
CREATE OR REPLACE FUNCTION public.handle_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
  v_subject text;
  v_body text;
BEGIN
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_app IN
    UPDATE public.signup_applications
    SET status = 'pending_review', submitted_at = now(), updated_at = now()
    WHERE user_id = NEW.id AND status = 'awaiting_email'
    RETURNING id, requested_role, full_name
  LOOP
    BEGIN
      v_subject := 'Nouvelle candidature ' || v_app.requested_role || ' a verifier';
      v_body := 'Une candidature ' || v_app.requested_role || ' (' || COALESCE(v_app.full_name, '') ||
                ') vient d''etre confirmee et attend votre revue dans l''espace admin.';
      INSERT INTO public.email_queue (to_email, subject, body_text, metadata)
      SELECT u.email, v_subject, v_body,
             jsonb_build_object('application_id', v_app.id, 'kind', 'signup_admin_alert')
      FROM public.user_roles ur
      JOIN auth.users u ON u.id = ur.user_id
      WHERE ur.role = 'admin' AND u.email IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_email_confirmation: admin alert enqueue failed (%, %)', SQLERRM, SQLSTATE;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_email_confirmation();

-- 4. admin_review_signup_application : email au demandeur (sinon comportement inchange)
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

  SELECT email INTO v_applicant_email FROM auth.users WHERE id = v_application.user_id;
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

  RETURN QUERY SELECT p_application_id, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_signup_application(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
