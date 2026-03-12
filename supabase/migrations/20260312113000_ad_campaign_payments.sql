ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_campaigns_payment_status_check'
  ) THEN
    ALTER TABLE public.ad_campaigns
      ADD CONSTRAINT ad_campaigns_payment_status_check
      CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'cancelled'));
  END IF;
END $$;

UPDATE public.ad_campaigns
SET
  payment_status = CASE
    WHEN COALESCE(total_budget, 0) <= 0 THEN 'unpaid'
    WHEN status = 'active' THEN 'paid'
    ELSE COALESCE(payment_status, 'unpaid')
  END,
  paid_amount = CASE
    WHEN status = 'active' AND COALESCE(paid_amount, 0) = 0 THEN COALESCE(total_budget, 0)
    ELSE COALESCE(paid_amount, 0)
  END,
  activated_at = CASE
    WHEN status = 'active' AND activated_at IS NULL THEN now()
    ELSE activated_at
  END
WHERE true;
