-- Reconstructed from the production catalog on 2026-04-17.
-- The original migration file is missing from the repository, but this
-- version reproduces the production schema needed to reconcile migration
-- history for project wwcrtyoueexyxkkikaos.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS restaurant_invoice_id uuid;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS restaurant_invoice_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_restaurant_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_restaurant_invoice_id_fkey
      FOREIGN KEY (restaurant_invoice_id)
      REFERENCES public.restaurant_invoices(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_restaurant_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_restaurant_invoice_id_fkey
      FOREIGN KEY (restaurant_invoice_id)
      REFERENCES public.restaurant_invoices(id)
      ON DELETE SET NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
