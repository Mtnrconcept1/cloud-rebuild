-- Public buckets serve content via signed/public URLs. The pre-existing
-- broad SELECT policies (Anyone can view *) allowed *listing* the bucket
-- contents, exposing filenames the product never intended to expose
-- (lint 0025_public_bucket_allows_listing). Restrict listing to admins
-- (and to owners for invoice-logos). Public file URLs continue to work
-- via the storage public-render path.

DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view invoice logos" ON storage.objects;

CREATE POLICY "Admins can list images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Restaurant owners can list their invoice logos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-logos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.owner_id = auth.uid()
          AND (storage.foldername(name))[1] = r.id::text
      )
    )
  );
