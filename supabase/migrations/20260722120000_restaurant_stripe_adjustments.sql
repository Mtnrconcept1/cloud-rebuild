CREATE TABLE IF NOT EXISTS public.restaurant_stripe_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 10000000),
  currency text NOT NULL DEFAULT 'chf' CHECK (currency = 'chf'),
  reason_code text NOT NULL CHECK (reason_code IN (
    'subscription_issue',
    'duplicate_topup',
    'commission_overpayment',
    'billing_error',
    'commercial_gesture',
    'other'
  )),
  reason_details text NOT NULL CHECK (char_length(btrim(reason_details)) BETWEEN 12 AND 1000),
  idempotency_key uuid NOT NULL UNIQUE,
  stripe_account_id text NOT NULL,
  stripe_transfer_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_stripe_adjustments_restaurant_created
  ON public.restaurant_stripe_adjustments(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_restaurant_stripe_adjustments_status_created
  ON public.restaurant_stripe_adjustments(status, created_at DESC);

ALTER TABLE public.restaurant_stripe_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS restaurant_stripe_adjustments_admin_read ON public.restaurant_stripe_adjustments;
CREATE POLICY restaurant_stripe_adjustments_admin_read
  ON public.restaurant_stripe_adjustments
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE ALL ON TABLE public.restaurant_stripe_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.restaurant_stripe_adjustments TO authenticated;
GRANT ALL ON TABLE public.restaurant_stripe_adjustments TO service_role;

COMMENT ON TABLE public.restaurant_stripe_adjustments IS
  'Versements correctifs Stripe Connect déclenchés par un admin, idempotents et auditables.';
