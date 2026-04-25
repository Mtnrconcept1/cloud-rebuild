ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE public.orders
SET cancelled_at = COALESCE(cancelled_at, updated_at, created_at)
WHERE lower(COALESCE(status, '')) = 'cancelled'
  AND cancelled_at IS NULL;

NOTIFY pgrst, 'reload schema';
