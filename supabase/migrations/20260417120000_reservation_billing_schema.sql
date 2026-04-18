-- Reservation billing: add confirmation / cancellation / billing tracking columns.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS confirmed_at                timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at                timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by                text,
  ADD COLUMN IF NOT EXISTS cancellation_reason_code    text,
  ADD COLUMN IF NOT EXISTS cancellation_reason_details text,
  ADD COLUMN IF NOT EXISTS billing_fee_chf             numeric NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS restaurant_invoice_id       uuid,
  ADD COLUMN IF NOT EXISTS updated_at                  timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_cancelled_by_check'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_cancelled_by_check
      CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer','restaurant','admin','system'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_invoice_fk'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_invoice_fk
      FOREIGN KEY (restaurant_invoice_id)
      REFERENCES public.restaurant_invoices(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: existing confirmed/arrived/no_show reservations already reached "confirmed" state.
UPDATE public.reservations
SET confirmed_at = COALESCE(confirmed_at, created_at)
WHERE status IN ('confirmed','arrived','no_show')
  AND confirmed_at IS NULL;

-- Backfill: existing cancelled reservations are treated as customer-cancelled (safe default,
-- avoids retroactive billing of data without auditable cancellation reasons).
UPDATE public.reservations
SET cancelled_at = COALESCE(cancelled_at, created_at),
    cancelled_by = COALESCE(cancelled_by, 'customer')
WHERE status = 'cancelled'
  AND cancelled_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_billing_pending
  ON public.reservations(restaurant_id, confirmed_at)
  WHERE confirmed_at IS NOT NULL
    AND restaurant_invoice_id IS NULL
    AND NOT (status = 'cancelled' AND cancelled_by IN ('customer','admin'));

CREATE INDEX IF NOT EXISTS idx_reservations_cancellation_audit
  ON public.reservations(restaurant_id, cancelled_at)
  WHERE cancelled_by = 'restaurant';

NOTIFY pgrst, 'reload schema';
