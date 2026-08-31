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

CREATE OR REPLACE FUNCTION public.directory_claim_mark_signup_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_restaurant_id uuid;
BEGIN
  IF NEW.requested_role <> 'restaurateur' THEN
    RETURN NEW;
  END IF;

  SELECT c.restaurant_id
  INTO v_restaurant_id
  FROM public.restaurant_directory_claim_requests c
  WHERE c.requester_id = NEW.user_id
    AND c.status = 'awaiting_signup'
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_restaurant_id IS NOT NULL THEN
    UPDATE public.restaurant_directory_claim_requests
    SET status = 'pending_review', updated_at = now()
    WHERE requester_id = NEW.user_id
      AND restaurant_id = v_restaurant_id
      AND status = 'awaiting_signup';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS signup_application_directory_claim_ready ON public.signup_applications;
CREATE TRIGGER signup_application_directory_claim_ready
AFTER INSERT OR UPDATE OF status ON public.signup_applications
FOR EACH ROW EXECUTE FUNCTION public.directory_claim_mark_signup_ready();

COMMENT ON TABLE public.restaurant_directory_claim_requests IS
  'Ownership claims for unclaimed public restaurant directory listings. Claim approval is manual and never grants control before the restaurateur verification dossier is reviewed.';
COMMENT ON TABLE public.restaurant_directory_removal_requests IS
  'Authenticated removal requests for unclaimed directory listings. A minimum of two private ownership evidence documents is required; no automatic deletion occurs.';

NOTIFY pgrst, 'reload schema';
