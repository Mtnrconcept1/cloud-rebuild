BEGIN;

-- A restaurant created outside the reviewed onboarding must start private.
ALTER TABLE public.restaurants
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN is_active SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.restaurant_is_approved_for_publication(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants AS restaurant
    JOIN public.signup_applications AS application
      ON application.user_id = restaurant.owner_id
     AND application.requested_role = 'restaurateur'::public.app_role
     AND application.status = 'approved'
     AND application.metadata->>'restaurant_id' = restaurant.id::text
    WHERE restaurant.id = p_restaurant_id
      AND restaurant.is_demo IS FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.restaurant_is_approved_for_publication(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_is_approved_for_publication(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_restaurant_moderation_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := COALESCE(public.has_role(v_actor_id, 'admin'::public.app_role), false);
  v_publication_transition boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_actor_id IS NOT NULL AND NOT v_actor_is_admin THEN
      NEW.owner_id := v_actor_id;
      NEW.status := 'pending';
      NEW.is_active := false;
      NEW.is_demo := false;
    END IF;
    v_publication_transition := NEW.is_active IS TRUE OR lower(COALESCE(NEW.status, '')) = 'active';
  ELSE
    IF v_actor_id = OLD.owner_id AND NOT v_actor_is_admin THEN
      IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.is_active IS DISTINCT FROM OLD.is_active
        OR NEW.is_demo IS DISTINCT FROM OLD.is_demo
      THEN
        RAISE EXCEPTION 'Les champs de publication sont réservés à la validation administrative.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_publication_transition := (
      (OLD.is_active IS DISTINCT FROM TRUE AND NEW.is_active IS TRUE)
      OR (
        lower(COALESCE(OLD.status, '')) IS DISTINCT FROM 'active'
        AND lower(COALESCE(NEW.status, '')) = 'active'
      )
    );
  END IF;

  IF v_publication_transition
    AND NEW.is_demo IS FALSE
    AND NOT public.restaurant_is_approved_for_publication(NEW.id)
  THEN
    RAISE EXCEPTION 'Le restaurant ne peut être publié qu''après validation du dossier restaurateur.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_restaurant_moderation_state ON public.restaurants;
CREATE TRIGGER protect_restaurant_moderation_state
BEFORE INSERT OR UPDATE OF owner_id, status, is_active, is_demo
ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.protect_restaurant_moderation_state();

DROP POLICY IF EXISTS "Owners can manage their restaurants" ON public.restaurants;
DROP POLICY IF EXISTS restaurants_owner_all ON public.restaurants;
DROP POLICY IF EXISTS restaurants_owner_select ON public.restaurants;
DROP POLICY IF EXISTS restaurants_owner_insert ON public.restaurants;
DROP POLICY IF EXISTS restaurants_owner_update ON public.restaurants;
DROP POLICY IF EXISTS restaurants_owner_delete ON public.restaurants;

CREATE POLICY restaurants_owner_select
ON public.restaurants
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY restaurants_owner_insert
ON public.restaurants
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  AND is_active IS FALSE
  AND lower(COALESCE(status, '')) = 'pending'
  AND is_demo IS FALSE
);

CREATE POLICY restaurants_owner_update
ON public.restaurants
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY restaurants_owner_delete
ON public.restaurants
FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS restaurants_public_select ON public.restaurants;
CREATE POLICY restaurants_public_select
ON public.restaurants
FOR SELECT
TO anon, authenticated
USING (
  (
    is_active IS TRUE
    AND is_demo IS FALSE
    AND lower(COALESCE(status, '')) = 'active'
  )
  OR owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- This restrictive helper is shared by menu/media/promotion policies. Pending
-- rows remain readable to their owner/admin, never to a client or anonymous user.
CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_restaurant(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT restaurant.is_demo IS FALSE
      AND (
        (
          restaurant.is_active IS TRUE
          AND lower(COALESCE(restaurant.status, '')) = 'active'
        )
        OR restaurant.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = p_restaurant_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.can_view_commercial_demo_restaurant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_commercial_demo_restaurant(uuid)
  TO anon, authenticated, service_role;

DROP POLICY IF EXISTS hide_unapproved_restaurant_daily_dishes ON public.restaurant_daily_dishes;
CREATE POLICY hide_unapproved_restaurant_daily_dishes
ON public.restaurant_daily_dishes
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (public.can_view_commercial_demo_restaurant(restaurant_id));

-- Owners keep their pending workspace, but a restaurant role is exclusive at
-- onboarding time so a half-created account does not remain in the client space.
CREATE OR REPLACE FUNCTION public.enforce_restaurateur_signup_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requested_role = 'restaurateur'::public.app_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'restaurateur'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    DELETE FROM public.user_roles
    WHERE user_id = NEW.user_id
      AND role = 'client'::public.app_role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_restaurateur_signup_role ON public.signup_applications;
CREATE TRIGGER enforce_restaurateur_signup_role
AFTER INSERT OR UPDATE OF requested_role
ON public.signup_applications
FOR EACH ROW
EXECUTE FUNCTION public.enforce_restaurateur_signup_role();

-- Final moderation decisions require an authenticated admin identity. Service
-- jobs may prepare dossiers and payments, but cannot approve documents/accounts.
CREATE OR REPLACE FUNCTION public.guard_human_signup_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status IN ('approved', 'needs_changes', 'rejected')
  THEN
    IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'Une validation humaine administrateur est requise.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.reviewed_by IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION 'Le validateur humain doit être enregistré dans reviewed_by.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_human_signup_review ON public.signup_applications;
CREATE TRIGGER guard_human_signup_review
BEFORE UPDATE OF status, reviewed_by
ON public.signup_applications
FOR EACH ROW
EXECUTE FUNCTION public.guard_human_signup_review();

CREATE OR REPLACE FUNCTION public.admin_review_signup_application(
  p_application_id uuid,
  p_status text,
  p_review_note text DEFAULT NULL
)
RETURNS TABLE(application_id uuid, application_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_application public.signup_applications%ROWTYPE;
  v_next_status text := lower(trim(COALESCE(p_status, '')));
  v_restaurant_id uuid;
  v_applicant_email text;
  v_role_label text;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_next_status NOT IN ('approved', 'needs_changes', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review status: %', p_status;
  END IF;

  SELECT application.*
  INTO v_application
  FROM public.signup_applications AS application
  WHERE application.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup application not found';
  END IF;

  IF v_next_status = 'approved'
    AND v_application.requested_role = 'restaurateur'::public.app_role
    AND public.signup_restaurateur_onboarding_payment_ready(p_application_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding payment required before approval';
  END IF;

  UPDATE public.signup_applications AS application
  SET status = v_next_status,
      review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
      reviewed_at = now(),
      reviewed_by = v_actor_id,
      updated_at = now()
  WHERE application.id = p_application_id;

  UPDATE public.signup_application_documents AS document
  SET status = CASE WHEN v_next_status = 'approved' THEN 'approved' ELSE 'rejected' END,
      rejection_reason = CASE
        WHEN v_next_status = 'approved' THEN NULL
        ELSE NULLIF(trim(COALESCE(p_review_note, '')), '')
      END,
      reviewed_at = now(),
      reviewed_by = v_actor_id,
      updated_at = now()
  WHERE document.application_id = p_application_id;

  IF v_next_status = 'approved' AND v_application.requested_role <> 'client'::public.app_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_application.user_id, v_application.requested_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF v_application.requested_role = 'courier'::public.app_role THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_application.user_id
      AND role = v_application.requested_role;
  END IF;

  IF v_application.requested_role = 'courier'::public.app_role THEN
    UPDATE public.couriers AS courier
    SET status = CASE
          WHEN v_next_status = 'approved' THEN 'approved'
          WHEN v_next_status = 'rejected' THEN 'rejected'
          ELSE 'pending_approval'
        END,
        is_online = CASE WHEN v_next_status = 'approved' THEN courier.is_online ELSE false END,
        updated_at = now()
    WHERE courier.user_id = v_application.user_id;
  ELSIF v_application.requested_role = 'restaurateur'::public.app_role THEN
    v_restaurant_id := CASE
      WHEN COALESCE(v_application.metadata->>'restaurant_id', '') ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      THEN (v_application.metadata->>'restaurant_id')::uuid
      ELSE NULL
    END;

    IF v_restaurant_id IS NULL THEN
      SELECT restaurant.id
      INTO v_restaurant_id
      FROM public.restaurants AS restaurant
      WHERE restaurant.owner_id = v_application.user_id
      ORDER BY restaurant.created_at ASC
      LIMIT 1;
    END IF;

    IF v_restaurant_id IS NOT NULL THEN
      UPDATE public.restaurants AS restaurant
      SET status = CASE
            WHEN v_next_status = 'approved' THEN 'active'
            WHEN v_next_status = 'rejected' THEN 'rejected'
            ELSE 'needs_changes'
          END,
          is_active = (v_next_status = 'approved'),
          updated_at = now()
      WHERE restaurant.id = v_restaurant_id;
    END IF;
  END IF;

  SELECT account.email
  INTO v_applicant_email
  FROM auth.users AS account
  WHERE account.id = v_application.user_id;

  IF v_applicant_email IS NOT NULL THEN
    v_role_label := CASE
      WHEN v_application.requested_role = 'courier'::public.app_role THEN 'livreur'
      ELSE 'restaurateur'
    END;

    INSERT INTO public.email_queue (to_email, subject, body_text, metadata)
    VALUES (
      v_applicant_email,
      CASE v_next_status
        WHEN 'approved' THEN 'Votre compte ' || v_role_label || ' est validé'
        WHEN 'needs_changes' THEN 'Corrections demandées sur votre dossier ' || v_role_label
        ELSE 'Votre demande ' || v_role_label || ' a été refusée'
      END,
      CASE v_next_status
        WHEN 'approved' THEN 'Votre dossier a été validé. Votre espace et votre fiche peuvent maintenant être publiés.'
        WHEN 'needs_changes' THEN 'Votre dossier nécessite des corrections : ' ||
          COALESCE(NULLIF(trim(p_review_note), ''), 'consultez le détail dans votre dashboard') || '.'
        ELSE 'Votre demande a été refusée.' ||
          CASE WHEN NULLIF(trim(p_review_note), '') IS NULL THEN '' ELSE ' ' || trim(p_review_note) END
      END,
      jsonb_build_object(
        'application_id', p_application_id,
        'kind', 'signup_decision',
        'status', v_next_status,
        'reviewed_by', v_actor_id
      )
    );
  END IF;

  RETURN QUERY SELECT p_application_id, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_signup_application(uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text)
  TO authenticated;

DROP POLICY IF EXISTS signup_applications_admin_all ON public.signup_applications;
DROP POLICY IF EXISTS signup_applications_admin_select ON public.signup_applications;
CREATE POLICY signup_applications_admin_select
ON public.signup_applications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS signup_application_documents_admin_all ON public.signup_application_documents;
DROP POLICY IF EXISTS signup_application_documents_admin_select ON public.signup_application_documents;
CREATE POLICY signup_application_documents_admin_select
ON public.signup_application_documents
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.validate_signup_document_manifest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_application_user_id uuid;
  v_storage_metadata jsonb;
  v_storage_mime text;
  v_storage_size bigint;
BEGIN
  SELECT application.user_id
  INTO v_application_user_id
  FROM public.signup_applications AS application
  WHERE application.id = NEW.application_id;

  IF v_application_user_id IS NULL OR v_application_user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Le document ne correspond pas au propriétaire du dossier.'
      USING ERRCODE = '23514';
  END IF;

  IF split_part(NEW.file_path, '/', 1) IS DISTINCT FROM NEW.user_id::text THEN
    RAISE EXCEPTION 'Chemin de document invalide.' USING ERRCODE = '23514';
  END IF;

  SELECT object.metadata
  INTO v_storage_metadata
  FROM storage.objects AS object
  WHERE object.bucket_id = 'verification-documents'
    AND object.name = NEW.file_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document privé introuvable dans le stockage.' USING ERRCODE = '23514';
  END IF;

  v_storage_mime := lower(COALESCE(v_storage_metadata->>'mimetype', NEW.mime_type, ''));
  v_storage_size := COALESCE(
    NULLIF(v_storage_metadata->>'size', '')::bigint,
    NEW.file_size_bytes,
    0
  );

  IF v_storage_mime NOT IN (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ) THEN
    RAISE EXCEPTION 'Type de document non autorisé.' USING ERRCODE = '23514';
  END IF;

  IF v_storage_size <= 0 OR v_storage_size > 15728640 THEN
    RAISE EXCEPTION 'Taille de document non autorisée.' USING ERRCODE = '23514';
  END IF;

  NEW.mime_type := v_storage_mime;
  NEW.file_size_bytes := v_storage_size::integer;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_signup_document_manifest ON public.signup_application_documents;
CREATE TRIGGER validate_signup_document_manifest
BEFORE INSERT OR UPDATE OF application_id, user_id, file_path, mime_type, file_size_bytes
ON public.signup_application_documents
FOR EACH ROW
EXECUTE FUNCTION public.validate_signup_document_manifest();

-- Private documents are constrained server-side. These checks do not inspect,
-- classify or extract document content; the final decision remains human.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]::text[]
WHERE id = 'verification-documents';

CREATE OR REPLACE FUNCTION public.verification_document_is_committed(p_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.signup_application_documents AS document
    WHERE document.file_path = p_file_path
  );
$$;

REVOKE ALL ON FUNCTION public.verification_document_is_committed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verification_document_is_committed(text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS verification_documents_update ON storage.objects;
CREATE POLICY verification_documents_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      auth.uid()::text = (storage.foldername(name))[1]
      AND NOT public.verification_document_is_committed(name)
    )
  )
)
WITH CHECK (
  bucket_id = 'verification-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS verification_documents_delete ON storage.objects;
CREATE POLICY verification_documents_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      auth.uid()::text = (storage.foldername(name))[1]
      AND NOT public.verification_document_is_committed(name)
    )
  )
);

COMMENT ON FUNCTION public.admin_review_signup_application(uuid, text, text) IS
  'Human-only signup review. Requires an authenticated admin and records reviewed_by.';
COMMENT ON COLUMN public.signup_application_documents.file_path IS
  'Private document path for manual admin review; no OCR or automated identity analysis.';

NOTIFY pgrst, 'reload schema';

COMMIT;
