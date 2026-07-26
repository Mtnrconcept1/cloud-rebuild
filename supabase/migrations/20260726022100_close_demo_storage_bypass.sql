-- Remove the dedicated commercial demo bypass from private storage.
-- Owner-, restaurant- and bucket-scoped policies remain authoritative.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtext('tok-demo:storage-objects-isolation:v1')
);

DO $preflight$
DECLARE
  v_policy record;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'storage.objects is missing';
  END IF;

  IF NOT (
    SELECT c.relrowsecurity
    FROM pg_class AS c
    WHERE c.oid = 'storage.objects'::regclass
  ) THEN
    RAISE EXCEPTION 'RLS is disabled on storage.objects';
  END IF;

  SELECT permissive, roles, cmd, qual, with_check
  INTO v_policy
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'dedicated_commercial_demo_full_access';

  IF FOUND AND (
    v_policy.permissive IS DISTINCT FROM 'PERMISSIVE'
    OR v_policy.roles IS DISTINCT FROM ARRAY['authenticated']::name[]
    OR v_policy.cmd IS DISTINCT FROM 'ALL'
    OR v_policy.qual IS DISTINCT FROM 'is_dedicated_commercial_demo_actor()'
    OR v_policy.with_check IS DISTINCT FROM 'is_dedicated_commercial_demo_actor()'
  ) THEN
    RAISE EXCEPTION 'Unexpected demo policy shape on storage.objects';
  END IF;
END;
$preflight$;

DROP POLICY IF EXISTS dedicated_commercial_demo_full_access
  ON storage.objects;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'dedicated_commercial_demo_full_access'
  ) THEN
    RAISE EXCEPTION 'The blanket demo policy remains on storage.objects';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        COALESCE(qual, '') ILIKE '%dedicated_commercial_demo%'
        OR COALESCE(with_check, '') ILIKE '%dedicated_commercial_demo%'
      )
  ) THEN
    RAISE EXCEPTION 'A dedicated demo bypass remains on storage.objects';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'verification_documents_select'
      AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'restaurant_images_storage_owner_select'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Expected scoped storage policies are missing';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
