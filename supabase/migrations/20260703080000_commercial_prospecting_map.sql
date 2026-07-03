-- Commercial prospecting map.
-- Restaurant prospect details are bundled from outputs/geneve_restaurants_bars_contacts.*
-- and the database stores only operational follow-up state.

DO $$
BEGIN
  CREATE TYPE public.commercial_visit_status AS ENUM (
    'not_visited',
    'visited',
    'in_progress',
    'signed',
    'not_interested'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.commercial_prospect_followups (
  source_objectid bigint PRIMARY KEY,
  status public.commercial_visit_status NOT NULL DEFAULT 'not_visited',
  notes text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_contacted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visited_at timestamptz,
  next_follow_up_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_prospect_followups_source_objectid_positive CHECK (source_objectid > 0)
);

CREATE INDEX IF NOT EXISTS idx_commercial_prospect_followups_status
  ON public.commercial_prospect_followups(status);

CREATE INDEX IF NOT EXISTS idx_commercial_prospect_followups_assigned_to
  ON public.commercial_prospect_followups(assigned_to);

CREATE INDEX IF NOT EXISTS idx_commercial_prospect_followups_next_follow_up
  ON public.commercial_prospect_followups(next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_commercial_prospect_followups ON public.commercial_prospect_followups;
CREATE TRIGGER set_updated_at_commercial_prospect_followups
  BEFORE UPDATE ON public.commercial_prospect_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.commercial_prospect_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_prospect_followups_admin_commercial_select" ON public.commercial_prospect_followups;
CREATE POLICY "commercial_prospect_followups_admin_commercial_select"
  ON public.commercial_prospect_followups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role::text IN ('admin', 'commercial')
    )
  );

DROP POLICY IF EXISTS "commercial_prospect_followups_admin_commercial_insert" ON public.commercial_prospect_followups;
CREATE POLICY "commercial_prospect_followups_admin_commercial_insert"
  ON public.commercial_prospect_followups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role::text IN ('admin', 'commercial')
    )
  );

DROP POLICY IF EXISTS "commercial_prospect_followups_admin_commercial_update" ON public.commercial_prospect_followups;
CREATE POLICY "commercial_prospect_followups_admin_commercial_update"
  ON public.commercial_prospect_followups
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role::text IN ('admin', 'commercial')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role::text IN ('admin', 'commercial')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.commercial_prospect_followups TO authenticated;

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'commercial-prospection',
  'Prospection commerciale',
  'Carte terrain pour suivre les restaurants visités par les commerciaux TOK.',
  true
)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_role text := lower(COALESCE(NEW.raw_user_meta_data->>'role', 'client'));
  v_signup_role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
        updated_at = now();

  v_signup_role := CASE
    WHEN v_requested_role = 'restaurateur' THEN 'restaurateur'::public.app_role
    WHEN v_requested_role IN ('courier', 'livreur') THEN 'courier'::public.app_role
    WHEN v_requested_role = 'commercial' THEN 'commercial'::public.app_role
    ELSE 'client'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_signup_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_signup_application(
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
RETURNS TABLE (
  application_id uuid,
  application_status text,
  restaurant_id uuid,
  courier_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_application_id uuid;
  v_application_status text;
  v_required_docs text[] := ARRAY[]::text[];
  v_uploaded_docs text[] := ARRAY[]::text[];
  v_doc jsonb;
  v_doc_type text;
  v_now timestamptz := now();
  v_restaurant_id uuid;
  v_courier_id uuid;
  v_vehicle_type text := lower(COALESCE(NULLIF(trim(p_vehicle_type), ''), 'bicycle'));
  v_role_text text := lower(p_requested_role::text);
BEGIN
  IF auth.role() <> 'service_role' AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_role_text NOT IN ('client', 'restaurateur', 'courier', 'commercial') THEN
    RAISE EXCEPTION 'Unsupported signup role: %', p_requested_role;
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
    v_actor_id,
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
  VALUES (v_actor_id, 'client')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_role_text = 'restaurateur' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_actor_id, 'restaurateur')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF v_role_text = 'commercial' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_actor_id, 'commercial')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  INSERT INTO public.signup_applications (
    user_id, requested_role, status, full_name, phone, city, address,
    legal_name, business_name, business_registration_number, tax_id,
    restaurant_name, restaurant_description, vehicle_type, license_plate, iban,
    metadata, submitted_at, reviewed_at, reviewed_by, review_note
  )
  VALUES (
    v_actor_id, p_requested_role,
    CASE WHEN v_role_text = 'client' THEN 'approved' ELSE 'pending_review' END,
    trim(p_full_name),
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
    COALESCE(p_metadata, '{}'::jsonb), v_now,
    CASE WHEN v_role_text = 'client' THEN v_now ELSE NULL END,
    NULL, NULL
  )
  ON CONFLICT (user_id, requested_role) DO UPDATE
    SET status = CASE WHEN v_role_text = 'client' THEN 'approved' ELSE 'pending_review' END,
        full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, city = EXCLUDED.city,
        address = EXCLUDED.address, legal_name = EXCLUDED.legal_name,
        business_name = EXCLUDED.business_name,
        business_registration_number = EXCLUDED.business_registration_number,
        tax_id = EXCLUDED.tax_id, restaurant_name = EXCLUDED.restaurant_name,
        restaurant_description = EXCLUDED.restaurant_description,
        vehicle_type = EXCLUDED.vehicle_type, license_plate = EXCLUDED.license_plate,
        iban = EXCLUDED.iban, metadata = EXCLUDED.metadata, submitted_at = v_now,
        reviewed_at = CASE WHEN v_role_text = 'client' THEN v_now ELSE NULL END,
        reviewed_by = NULL, review_note = NULL, updated_at = v_now
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
      v_application_id, v_actor_id, v_doc_type, v_doc->>'file_path',
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

  IF array_length(v_required_docs, 1) IS NOT NULL THEN
    SELECT ARRAY_AGG(document_type ORDER BY document_type)
    INTO v_uploaded_docs
    FROM public.signup_application_documents
    WHERE application_id = v_application_id;

    IF COALESCE(v_uploaded_docs, ARRAY[]::text[]) @> v_required_docs IS NOT TRUE THEN
      RAISE EXCEPTION 'Missing required verification documents for role %', p_requested_role;
    END IF;
  END IF;

  IF v_role_text = 'courier' THEN
    INSERT INTO public.couriers (
      user_id, first_name, last_name, phone, status, vehicle_type,
      license_plate, iban, is_online, updated_at
    )
    VALUES (
      v_actor_id, split_part(trim(p_full_name), ' ', 1),
      NULLIF(trim(substr(trim(p_full_name), length(split_part(trim(p_full_name), ' ', 1)) + 1)), ''),
      NULLIF(trim(COALESCE(p_phone, '')), ''), 'pending_approval', v_vehicle_type,
      NULLIF(trim(COALESCE(p_license_plate, '')), ''), NULLIF(trim(COALESCE(p_iban, '')), ''),
      false, v_now
    )
    ON CONFLICT (user_id) DO UPDATE
      SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, phone = EXCLUDED.phone,
          vehicle_type = EXCLUDED.vehicle_type, license_plate = EXCLUDED.license_plate, iban = EXCLUDED.iban,
          status = CASE WHEN public.couriers.status = 'approved' THEN public.couriers.status ELSE 'pending_approval' END,
          is_online = CASE WHEN public.couriers.status = 'approved' THEN public.couriers.is_online ELSE false END,
          updated_at = v_now
    RETURNING id INTO v_courier_id;
  ELSIF v_role_text = 'restaurateur' THEN
    SELECT r.id INTO v_restaurant_id
    FROM public.restaurants r
    WHERE r.owner_id = v_actor_id
    ORDER BY r.created_at ASC
    LIMIT 1;

    IF v_restaurant_id IS NULL THEN
      INSERT INTO public.restaurants (
        owner_id, name, description, legal_name, address, city, phone, is_active, status
      )
      VALUES (
        v_actor_id,
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
          status = CASE WHEN public.restaurants.is_active THEN public.restaurants.status ELSE 'pending' END,
          is_active = CASE WHEN public.restaurants.is_active THEN public.restaurants.is_active ELSE false END,
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
  v_required_docs text[] := ARRAY[]::text[];
  v_uploaded_docs text[] := ARRAY[]::text[];
  v_doc jsonb;
  v_doc_type text;
  v_now timestamptz := now();
  v_restaurant_id uuid;
  v_courier_id uuid;
  v_vehicle_type text := lower(COALESCE(NULLIF(trim(p_vehicle_type), ''), 'bicycle'));
  v_role_text text := lower(p_requested_role::text);
  v_email_confirmed boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: service role required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF v_role_text NOT IN ('restaurateur', 'courier', 'commercial') THEN
    RAISE EXCEPTION 'Unsupported draft role: %', p_requested_role;
  END IF;

  IF NULLIF(trim(COALESCE(p_full_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;

  IF jsonb_typeof(COALESCE(p_documents, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Documents payload must be an array';
  END IF;

  SELECT (u.email_confirmed_at IS NOT NULL) INTO v_email_confirmed
  FROM auth.users u
  WHERE u.id = p_user_id;

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
    p_user_id, trim(p_full_name),
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
  VALUES (p_user_id, p_requested_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role = 'client'::public.app_role;

  INSERT INTO public.signup_applications (
    user_id, requested_role, status, full_name, phone, city, address,
    legal_name, business_name, business_registration_number, tax_id,
    restaurant_name, restaurant_description, vehicle_type, license_plate, iban,
    metadata, submitted_at, reviewed_at, reviewed_by, review_note
  )
  VALUES (
    p_user_id, p_requested_role, CASE WHEN v_email_confirmed THEN 'pending_review' ELSE 'awaiting_email' END, trim(p_full_name),
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
    SET status = CASE WHEN v_email_confirmed THEN 'pending_review' ELSE 'awaiting_email' END,
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
    ON CONFLICT ON CONSTRAINT signup_application_documents_application_id_document_type_key DO UPDATE
      SET file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type, file_size_bytes = EXCLUDED.file_size_bytes,
          status = 'pending', reviewed_at = NULL, reviewed_by = NULL,
          rejection_reason = NULL, updated_at = v_now;
  END LOOP;

  IF array_length(v_required_docs, 1) IS NOT NULL THEN
    SELECT ARRAY_AGG(document_type ORDER BY document_type) INTO v_uploaded_docs
    FROM public.signup_application_documents sad
    WHERE sad.application_id = v_application_id;

    IF COALESCE(v_uploaded_docs, ARRAY[]::text[]) @> v_required_docs IS NOT TRUE THEN
      RAISE EXCEPTION 'Missing required verification documents for role %', p_requested_role;
    END IF;
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
    SELECT r.id INTO v_restaurant_id
    FROM public.restaurants r
    WHERE r.owner_id = p_user_id
    ORDER BY r.created_at ASC
    LIMIT 1;

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
          status = CASE WHEN public.restaurants.is_active THEN public.restaurants.status ELSE 'pending' END,
          is_active = CASE WHEN public.restaurants.is_active THEN public.restaurants.is_active ELSE false END,
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

REVOKE ALL ON FUNCTION public.sync_signup_application(
  public.app_role, text, text, text, text, text, text, text, text,
  text, text, text, text, text, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_signup_application(
  public.app_role, text, text, text, text, text, text, text, text,
  text, text, text, text, text, jsonb, jsonb
) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_submit_signup_application(
  uuid, public.app_role, text, text, text, text, text, text, text,
  text, text, text, text, text, text, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_submit_signup_application(
  uuid, public.app_role, text, text, text, text, text, text, text,
  text, text, text, text, text, text, jsonb, jsonb
) TO service_role;

NOTIFY pgrst, 'reload schema';
