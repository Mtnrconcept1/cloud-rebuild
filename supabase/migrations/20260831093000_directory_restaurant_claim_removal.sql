CREATE TABLE IF NOT EXISTS public.restaurant_directory_claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_name text NOT NULL,
  restaurant_address text,
  restaurant_city text,
  status text NOT NULL DEFAULT 'awaiting_signup' CHECK (status IN ('awaiting_signup', 'pending_review', 'approved', 'rejected', 'cancelled')),
  review_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, requester_id)
);

CREATE TABLE IF NOT EXISTS public.restaurant_directory_removal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  requester_phone text,
  reason text,
  document_paths text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  review_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_directory_claim_requests_status
  ON public.restaurant_directory_claim_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_directory_removal_requests_status
  ON public.restaurant_directory_removal_requests(status, created_at DESC);

ALTER TABLE public.restaurant_directory_claim_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_directory_removal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_claim_requester_read" ON public.restaurant_directory_claim_requests;
CREATE POLICY "directory_claim_requester_read"
ON public.restaurant_directory_claim_requests
FOR SELECT TO authenticated
USING (requester_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "directory_claim_requester_insert" ON public.restaurant_directory_claim_requests;
CREATE POLICY "directory_claim_requester_insert"
ON public.restaurant_directory_claim_requests
FOR INSERT TO authenticated
WITH CHECK (
  requester_id = auth.uid()
  AND status = 'awaiting_signup'
  AND EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_id
      AND r.is_directory_listing IS TRUE
      AND r.is_active IS TRUE
      AND lower(COALESCE(r.status, '')) = 'active'
  )
);

DROP POLICY IF EXISTS "directory_claim_admin_update" ON public.restaurant_directory_claim_requests;
CREATE POLICY "directory_claim_admin_update"
ON public.restaurant_directory_claim_requests
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "directory_removal_requester_read" ON public.restaurant_directory_removal_requests;
CREATE POLICY "directory_removal_requester_read"
ON public.restaurant_directory_removal_requests
FOR SELECT TO authenticated
USING (requester_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "directory_removal_requester_insert" ON public.restaurant_directory_removal_requests;
CREATE POLICY "directory_removal_requester_insert"
ON public.restaurant_directory_removal_requests
FOR INSERT TO authenticated
WITH CHECK (
  requester_id = auth.uid()
  AND status = 'pending'
  AND cardinality(document_paths) >= 2
  AND EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_id
      AND r.is_directory_listing IS TRUE
  )
);

DROP POLICY IF EXISTS "directory_removal_admin_update" ON public.restaurant_directory_removal_requests;
CREATE POLICY "directory_removal_admin_update"
ON public.restaurant_directory_removal_requests
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'restaurant-removal-evidence',
  'restaurant-removal-evidence',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "restaurant_removal_evidence_insert_own" ON storage.objects;
CREATE POLICY "restaurant_removal_evidence_insert_own"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-removal-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "restaurant_removal_evidence_read_own" ON storage.objects;
CREATE POLICY "restaurant_removal_evidence_read_own"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'restaurant-removal-evidence'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "restaurant_removal_evidence_delete_own_pending" ON storage.objects;
CREATE POLICY "restaurant_removal_evidence_delete_own_pending"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'restaurant-removal-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Reuse the indexed restaurant id during onboarding so a claim never creates a
-- second restaurant page. The indexed row stays untouched/public until an admin
-- approves the restaurateur dossier; only signup metadata points at it.
DO $patch_signup$
DECLARE
  v_definition text;
  v_patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'sync_signup_application'
  LIMIT 1;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'sync_signup_application() is missing';
  END IF;

  IF position('restaurant_directory_claim_requests AS directory_claim' in v_definition) = 0 THEN
    v_patched := replace(
      v_definition,
      $old_select$
  ELSIF v_role_text = 'restaurateur' THEN
    SELECT restaurant.id
    INTO v_restaurant_id
    FROM public.restaurants AS restaurant
    WHERE restaurant.owner_id = v_actor_id
    ORDER BY restaurant.created_at ASC
    LIMIT 1;

    IF v_restaurant_id IS NULL THEN
$old_select$,
      $new_select$
  ELSIF v_role_text = 'restaurateur' THEN
    SELECT directory_claim.restaurant_id
    INTO v_restaurant_id
    FROM public.restaurant_directory_claim_requests AS directory_claim
    JOIN public.restaurants AS claimed_restaurant
      ON claimed_restaurant.id = directory_claim.restaurant_id
    WHERE directory_claim.requester_id = v_actor_id
      AND directory_claim.status IN ('awaiting_signup', 'pending_review')
      AND claimed_restaurant.is_directory_listing IS TRUE
    ORDER BY directory_claim.created_at DESC
    LIMIT 1;

    IF v_restaurant_id IS NULL THEN
      SELECT restaurant.id
      INTO v_restaurant_id
      FROM public.restaurants AS restaurant
      WHERE restaurant.owner_id = v_actor_id
      ORDER BY restaurant.created_at ASC
      LIMIT 1;
    END IF;

    IF v_restaurant_id IS NULL THEN
$new_select$
    );

    IF v_patched = v_definition THEN
      RAISE EXCEPTION 'sync_signup_application restaurant selection drifted';
    END IF;

    v_definition := v_patched;
    v_patched := replace(
      v_definition,
      $old_update$
      RETURNING restaurants.id INTO v_restaurant_id;
    ELSE
      UPDATE public.restaurants AS restaurant
$old_update$,
      $new_update$
      RETURNING restaurants.id INTO v_restaurant_id;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.restaurant_directory_claim_requests AS directory_claim
      WHERE directory_claim.requester_id = v_actor_id
        AND directory_claim.restaurant_id = v_restaurant_id
        AND directory_claim.status IN ('awaiting_signup', 'pending_review')
    ) THEN
      UPDATE public.restaurants AS restaurant
$new_update$
    );

    IF v_patched = v_definition THEN
      RAISE EXCEPTION 'sync_signup_application restaurant update branch drifted';
    END IF;

    EXECUTE v_patched;
  END IF;
END;
$patch_signup$;

CREATE OR REPLACE FUNCTION public.directory_claim_follow_signup_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_claim public.restaurant_directory_claim_requests%ROWTYPE;
BEGIN
  IF NEW.requested_role <> 'restaurateur'::public.app_role THEN
    RETURN NEW;
  END IF;

  SELECT claim.*
  INTO v_claim
  FROM public.restaurant_directory_claim_requests AS claim
  WHERE claim.requester_id = NEW.user_id
    AND claim.status IN ('awaiting_signup', 'pending_review')
    AND (
      NEW.metadata->>'restaurant_id' IS NULL
      OR claim.restaurant_id::text = NEW.metadata->>'restaurant_id'
    )
  ORDER BY claim.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'pending_review' THEN
    UPDATE public.restaurant_directory_claim_requests
    SET status = 'pending_review', updated_at = now()
    WHERE id = v_claim.id
      AND status = 'awaiting_signup';
    RETURN NEW;
  END IF;

  IF NEW.status = 'rejected' THEN
    UPDATE public.restaurant_directory_claim_requests
    SET status = 'rejected',
        review_notes = COALESCE(NEW.review_note, review_notes),
        reviewed_by = NEW.reviewed_by,
        reviewed_at = COALESCE(NEW.reviewed_at, now()),
        updated_at = now()
    WHERE id = v_claim.id;
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'directory_claim_requires_reviewed_signup';
    END IF;
    IF NEW.metadata->>'restaurant_id' IS DISTINCT FROM v_claim.restaurant_id::text THEN
      RAISE EXCEPTION 'directory_claim_restaurant_mismatch';
    END IF;

    UPDATE public.restaurants AS restaurant
    SET owner_id = NEW.user_id,
        is_directory_listing = false,
        name = COALESCE(NULLIF(btrim(NEW.restaurant_name), ''), restaurant.name),
        description = COALESCE(NULLIF(btrim(NEW.restaurant_description), ''), restaurant.description),
        legal_name = COALESCE(NULLIF(btrim(NEW.legal_name), ''), restaurant.legal_name),
        address = COALESCE(NULLIF(btrim(NEW.address), ''), restaurant.address),
        city = COALESCE(NULLIF(btrim(NEW.city), ''), restaurant.city),
        phone = COALESCE(NULLIF(btrim(NEW.phone), ''), restaurant.phone),
        updated_at = now()
    WHERE restaurant.id = v_claim.restaurant_id
      AND restaurant.is_directory_listing IS TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'directory_claim_listing_not_available';
    END IF;

    UPDATE public.restaurant_directory_claim_requests
    SET status = 'approved',
        review_notes = COALESCE(NEW.review_note, review_notes),
        reviewed_by = NEW.reviewed_by,
        reviewed_at = NEW.reviewed_at,
        updated_at = now()
    WHERE id = v_claim.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS signup_application_directory_claim_review ON public.signup_applications;
CREATE TRIGGER signup_application_directory_claim_review
AFTER INSERT OR UPDATE OF status, metadata ON public.signup_applications
FOR EACH ROW EXECUTE FUNCTION public.directory_claim_follow_signup_review();

COMMENT ON TABLE public.restaurant_directory_claim_requests IS
  'Ownership claims for unclaimed public restaurant directory listings. The indexed page id is reused during onboarding and ownership transfers only after the restaurateur signup application is explicitly approved.';
COMMENT ON TABLE public.restaurant_directory_removal_requests IS
  'Authenticated removal requests for unclaimed directory listings. A minimum of two private ownership evidence documents is required; no automatic deletion occurs.';

NOTIFY pgrst, 'reload schema';
