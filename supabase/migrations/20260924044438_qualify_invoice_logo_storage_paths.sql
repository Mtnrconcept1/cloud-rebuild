BEGIN;

-- Inside the restaurant subquery, an unqualified name resolves to r.name.
-- Bind the ownership check explicitly to the OUTER Storage object, not to a
-- restaurant's editable display name. Preserve user-folder and admin access.
ALTER POLICY "Restaurant owners can upload invoice logos" ON storage.objects
WITH CHECK (
  bucket_id = 'invoice-logos'
  AND (
    (storage.foldername(storage.objects.name))[1] = (SELECT auth.uid())::text
    OR public.has_role((SELECT auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.owner_id = (SELECT auth.uid())
        AND (storage.foldername(storage.objects.name))[1] = r.id::text
    )
  )
);

ALTER POLICY "Restaurant owners can list their invoice logos" ON storage.objects
USING (
  bucket_id = 'invoice-logos'
  AND (
    public.has_role((SELECT auth.uid()), 'admin')
    OR (storage.foldername(storage.objects.name))[1] = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.owner_id = (SELECT auth.uid())
        AND (storage.foldername(storage.objects.name))[1] = r.id::text
    )
  )
);

ALTER POLICY "Restaurant owners can delete their logos" ON storage.objects
USING (
  bucket_id = 'invoice-logos'
  AND (
    public.has_role((SELECT auth.uid()), 'admin')
    OR (storage.foldername(storage.objects.name))[1] = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.owner_id = (SELECT auth.uid())
        AND (storage.foldername(storage.objects.name))[1] = r.id::text
    )
  )
);

NOTIFY pgrst, 'reload schema';
COMMIT;
