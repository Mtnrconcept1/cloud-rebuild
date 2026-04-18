-- Ensure confirmed_at is set whenever a reservation reaches a confirmed-equivalent
-- state, regardless of whether the change goes through an RPC or a direct UPDATE
-- (Stripe webhook + create-zero-attente-reservation update reservations directly).
-- Without this trigger, zero-attente reservations escape the 5.- billing because
-- confirmed_at stays NULL.

CREATE OR REPLACE FUNCTION public.tg_reservations_set_confirmed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('confirmed','arrived','no_show')
     AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_set_confirmed_at ON public.reservations;
CREATE TRIGGER reservations_set_confirmed_at
  BEFORE INSERT OR UPDATE OF status ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_reservations_set_confirmed_at();

-- Backfill: any reservation already in a confirmed-equivalent state but without
-- confirmed_at gets it set to created_at (best-effort timestamp).
UPDATE public.reservations
SET confirmed_at = COALESCE(confirmed_at, created_at)
WHERE status IN ('confirmed','arrived','no_show')
  AND confirmed_at IS NULL;

NOTIFY pgrst, 'reload schema';
