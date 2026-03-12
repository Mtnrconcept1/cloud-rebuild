ALTER TABLE public.proof_of_delivery
  ADD COLUMN IF NOT EXISTS verification_method text NOT NULL DEFAULT 'manual_code',
  ADD COLUMN IF NOT EXISTS verification_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'proof_of_delivery_verification_method_check'
  ) THEN
    ALTER TABLE public.proof_of_delivery
      ADD CONSTRAINT proof_of_delivery_verification_method_check
      CHECK (verification_method IN ('qr', 'manual_code'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_of_delivery_dispatch_job_unique
  ON public.proof_of_delivery(dispatch_job_id);

ALTER TABLE public.proof_of_delivery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Require auth for proof_of_delivery" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_courier_select" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_courier_insert" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_courier_update" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_client_select" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_restaurant_select" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_admin_all" ON public.proof_of_delivery;

CREATE POLICY "proof_of_delivery_courier_select"
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = proof_of_delivery.courier_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "proof_of_delivery_courier_insert"
  ON public.proof_of_delivery
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = proof_of_delivery.courier_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "proof_of_delivery_courier_update"
  ON public.proof_of_delivery
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = proof_of_delivery.courier_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = proof_of_delivery.courier_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "proof_of_delivery_client_select"
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      WHERE dj.id = proof_of_delivery.dispatch_job_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "proof_of_delivery_restaurant_select"
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE dj.id = proof_of_delivery.dispatch_job_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "proof_of_delivery_admin_all"
  ON public.proof_of_delivery
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';
