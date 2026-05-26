BEGIN;

-- Lock financial RPCs behind server-side callers. The Edge Function
-- generate-invoices already checks role and restaurant ownership before using
-- the service-role client, so direct PostgREST access is unnecessary.
REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice(uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice_rpc(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice_rpc(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice_rpc(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_restaurant_payout_invoice_rpc(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) TO service_role;

-- Supabase advisor 0011: keep helper function resolution deterministic.
ALTER FUNCTION public.is_special_paid_reservation_locked(text, text, numeric, jsonb) SET search_path = public;
ALTER FUNCTION public.is_special_paid_order_locked(uuid, text, jsonb) SET search_path = public;

-- Restrict public image buckets to bounded image uploads and path ownership.
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id IN ('images', 'invoice-logos');

DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;

CREATE POLICY "Users can upload images in their folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update images in their folder"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete images in their folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Restaurant owners can upload invoice logos" ON storage.objects;
DROP POLICY IF EXISTS "Restaurant owners can delete their logos" ON storage.objects;
DROP POLICY IF EXISTS "Restaurant owners can list their invoice logos" ON storage.objects;

CREATE POLICY "Restaurant owners can upload invoice logos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-logos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.restaurants r
        WHERE r.owner_id = auth.uid()
          AND (storage.foldername(name))[1] = r.id::text
      )
    )
  );

CREATE POLICY "Restaurant owners can list their invoice logos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-logos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.restaurants r
        WHERE r.owner_id = auth.uid()
          AND (storage.foldername(name))[1] = r.id::text
      )
    )
  );

CREATE POLICY "Restaurant owners can delete their logos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoice-logos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.restaurants r
        WHERE r.owner_id = auth.uid()
          AND (storage.foldername(name))[1] = r.id::text
      )
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
