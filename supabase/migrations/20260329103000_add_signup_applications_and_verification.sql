-- Signup applications, role-based document verification, and admin review workflow.

CREATE TABLE IF NOT EXISTS public.signup_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'needs_changes', 'rejected')),
  full_name text NOT NULL,
  phone text,
  city text,
  address text,
  legal_name text,
  business_name text,
  business_registration_number text,
  tax_id text,
  restaurant_name text,
  restaurant_description text,
  vehicle_type text,
  license_plate text,
  iban text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, requested_role)
);

CREATE TABLE IF NOT EXISTS public.signup_application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.signup_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  file_size_bytes integer,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_signup_applications_user_role
  ON public.signup_applications (user_id, requested_role);

CREATE INDEX IF NOT EXISTS idx_signup_applications_status
  ON public.signup_applications (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_signup_application_documents_application
  ON public.signup_application_documents (application_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_signup_applications ON public.signup_applications;
CREATE TRIGGER set_updated_at_signup_applications
  BEFORE UPDATE ON public.signup_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_signup_application_documents ON public.signup_application_documents;
CREATE TRIGGER set_updated_at_signup_application_documents
  BEFORE UPDATE ON public.signup_application_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.signup_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_application_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signup_applications_self_select" ON public.signup_applications;
CREATE POLICY "signup_applications_self_select"
  ON public.signup_applications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "signup_applications_admin_all" ON public.signup_applications;
CREATE POLICY "signup_applications_admin_all"
  ON public.signup_applications
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "signup_application_documents_self_select" ON public.signup_application_documents;
CREATE POLICY "signup_application_documents_self_select"
  ON public.signup_application_documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "signup_application_documents_admin_all" ON public.signup_application_documents;
CREATE POLICY "signup_application_documents_admin_all"
  ON public.signup_application_documents
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-documents', 'verification-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "verification_documents_select" ON storage.objects;
CREATE POLICY "verification_documents_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "verification_documents_insert" ON storage.objects;
CREATE POLICY "verification_documents_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'verification-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "verification_documents_update" ON storage.objects;
CREATE POLICY "verification_documents_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'verification-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "verification_documents_delete" ON storage.objects;
CREATE POLICY "verification_documents_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_role text;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client')
  ON CONFLICT (user_id, role) DO NOTHING;

  v_requested_role := lower(COALESCE(NEW.raw_user_meta_data->>'role', ''));

  IF v_requested_role IN ('restaurateur', 'courier') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, v_requested_role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

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
  IF auth.role() <> 'service_role' AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_role_text NOT IN ('client', 'restaurateur', 'courier') THEN
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

  IF p_requested_role <> 'client' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_actor_id, p_requested_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  INSERT INTO public.signup_applications (
    user_id,
    requested_role,
    status,
    full_name,
    phone,
    city,
    address,
    legal_name,
    business_name,
    business_registration_number,
    tax_id,
    restaurant_name,
    restaurant_description,
    vehicle_type,
    license_plate,
    iban,
    metadata,
    submitted_at,
    reviewed_at,
    reviewed_by,
    review_note
  )
  VALUES (
    v_actor_id,
    p_requested_role,
    'pending_review',
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
    COALESCE(p_metadata, '{}'::jsonb),
    v_now,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (user_id, requested_role) DO UPDATE
    SET status = 'pending_review',
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        city = EXCLUDED.city,
        address = EXCLUDED.address,
        legal_name = EXCLUDED.legal_name,
        business_name = EXCLUDED.business_name,
        business_registration_number = EXCLUDED.business_registration_number,
        tax_id = EXCLUDED.tax_id,
        restaurant_name = EXCLUDED.restaurant_name,
        restaurant_description = EXCLUDED.restaurant_description,
        vehicle_type = EXCLUDED.vehicle_type,
        license_plate = EXCLUDED.license_plate,
        iban = EXCLUDED.iban,
        metadata = EXCLUDED.metadata,
        submitted_at = v_now,
        reviewed_at = NULL,
        reviewed_by = NULL,
        review_note = NULL,
        updated_at = v_now
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
      application_id,
      user_id,
      document_type,
      file_path,
      file_name,
      mime_type,
      file_size_bytes,
      status,
      reviewed_at,
      reviewed_by,
      rejection_reason
    )
    VALUES (
      v_application_id,
      v_actor_id,
      v_doc_type,
      v_doc->>'file_path',
      NULLIF(v_doc->>'file_name', ''),
      NULLIF(v_doc->>'mime_type', ''),
      CASE
        WHEN NULLIF(v_doc->>'file_size_bytes', '') IS NULL THEN NULL
        ELSE GREATEST((v_doc->>'file_size_bytes')::integer, 0)
      END,
      'pending',
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (application_id, document_type) DO UPDATE
      SET file_path = EXCLUDED.file_path,
          file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type,
          file_size_bytes = EXCLUDED.file_size_bytes,
          status = 'pending',
          reviewed_at = NULL,
          reviewed_by = NULL,
          rejection_reason = NULL,
          updated_at = v_now;
  END LOOP;

  SELECT ARRAY_AGG(document_type ORDER BY document_type)
  INTO v_uploaded_docs
  FROM public.signup_application_documents
  WHERE application_id = v_application_id;

  IF COALESCE(v_uploaded_docs, ARRAY[]::text[]) @> v_required_docs IS NOT TRUE THEN
    RAISE EXCEPTION 'Missing required verification documents for role %', p_requested_role;
  END IF;

  IF v_role_text = 'courier' THEN
    INSERT INTO public.couriers (
      user_id,
      first_name,
      last_name,
      phone,
      status,
      vehicle_type,
      license_plate,
      iban,
      is_online,
      updated_at
    )
    VALUES (
      v_actor_id,
      split_part(trim(p_full_name), ' ', 1),
      NULLIF(trim(substr(trim(p_full_name), length(split_part(trim(p_full_name), ' ', 1)) + 1)), ''),
      NULLIF(trim(COALESCE(p_phone, '')), ''),
      'pending_approval',
      v_vehicle_type,
      NULLIF(trim(COALESCE(p_license_plate, '')), ''),
      NULLIF(trim(COALESCE(p_iban, '')), ''),
      false,
      v_now
    )
    ON CONFLICT (user_id) DO UPDATE
      SET first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          phone = EXCLUDED.phone,
          vehicle_type = EXCLUDED.vehicle_type,
          license_plate = EXCLUDED.license_plate,
          iban = EXCLUDED.iban,
          status = CASE
            WHEN public.couriers.status = 'approved' THEN public.couriers.status
            ELSE 'pending_approval'
          END,
          is_online = CASE
            WHEN public.couriers.status = 'approved' THEN public.couriers.is_online
            ELSE false
          END,
          updated_at = v_now
    RETURNING id INTO v_courier_id;
  ELSIF v_role_text = 'restaurateur' THEN
    SELECT r.id
    INTO v_restaurant_id
    FROM public.restaurants r
    WHERE r.owner_id = v_actor_id
    ORDER BY r.created_at ASC
    LIMIT 1;

    IF v_restaurant_id IS NULL THEN
      INSERT INTO public.restaurants (
        owner_id,
        name,
        description,
        legal_name,
        address,
        city,
        phone,
        is_active,
        status
      )
      VALUES (
        v_actor_id,
        COALESCE(NULLIF(trim(COALESCE(p_restaurant_name, '')), ''), NULLIF(trim(COALESCE(p_business_name, '')), ''), 'Restaurant a valider'),
        NULLIF(trim(COALESCE(p_restaurant_description, '')), ''),
        NULLIF(trim(COALESCE(p_legal_name, '')), ''),
        COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), 'Adresse a confirmer'),
        COALESCE(NULLIF(trim(COALESCE(p_city, '')), ''), 'Ville a confirmer'),
        NULLIF(trim(COALESCE(p_phone, '')), ''),
        false,
        'pending'
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

  RETURN QUERY
  SELECT
    v_application_id,
    v_application_status,
    v_restaurant_id,
    v_courier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_signup_application(
  public.app_role,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_signup_application(
  public.app_role,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_signup_application(
  p_application_id uuid,
  p_status text,
  p_review_note text DEFAULT NULL
)
RETURNS TABLE (
  application_id uuid,
  application_status text
)
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
BEGIN
  IF NOT v_is_service_role AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_next_status NOT IN ('approved', 'needs_changes', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review status: %', p_status;
  END IF;

  SELECT *
  INTO v_application
  FROM public.signup_applications
  WHERE id = p_application_id;

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
      rejection_reason = CASE
        WHEN v_next_status = 'approved' THEN NULL
        ELSE NULLIF(trim(COALESCE(p_review_note, '')), '')
      END,
      reviewed_at = now(),
      reviewed_by = CASE WHEN v_is_service_role THEN reviewed_by ELSE v_actor_id END,
      updated_at = now()
  WHERE application_id = p_application_id;

  IF v_application.requested_role = 'courier' THEN
    UPDATE public.couriers
    SET status = CASE
      WHEN v_next_status = 'approved' THEN 'approved'
      WHEN v_next_status = 'rejected' THEN 'rejected'
      ELSE 'pending_approval'
    END,
    is_online = CASE WHEN v_next_status = 'approved' THEN is_online ELSE false END,
    updated_at = now()
    WHERE user_id = v_application.user_id;
  ELSIF v_application.requested_role = 'restaurateur' THEN
    v_restaurant_id := NULLIF(v_application.metadata->>'restaurant_id', '')::uuid;

    IF v_restaurant_id IS NULL THEN
      SELECT id
      INTO v_restaurant_id
      FROM public.restaurants
      WHERE owner_id = v_application.user_id
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    IF v_restaurant_id IS NOT NULL THEN
      UPDATE public.restaurants
      SET status = CASE
            WHEN v_next_status = 'approved' THEN 'active'
            WHEN v_next_status = 'rejected' THEN 'rejected'
            ELSE 'needs_changes'
          END,
          is_active = (v_next_status = 'approved'),
          updated_at = now()
      WHERE id = v_restaurant_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT p_application_id, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_signup_application(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text) TO authenticated;
