-- Backfill: previously the RPC validate_and_create_reservation inserted chef's
-- table reservations as 'pending' and the edge function had to UPDATE them to
-- 'confirmed' afterwards. Some rows were left at 'pending' even though payment
-- was successfully captured (paid=true + checkout_session_id present), which
-- (1) made them appear unconfirmed to the customer and
-- (2) excluded them from accounting (admin + restaurateur), since the
--     payout/accounting logic ignores reservations with status='pending'.
--
-- After migration 20260425150000 new rows are inserted directly as 'confirmed';
-- this script reconciles the existing rows.
--
-- The trigger guard_locked_reservation_status blocks status changes on already
-- paid chef's table reservations (it lacks an exception for the pending →
-- confirmed transition). We disable it for the duration of the backfill, then
-- re-enable it.

ALTER TABLE public.reservations DISABLE TRIGGER guard_locked_reservation_status;

UPDATE public.reservations
SET
  status = 'confirmed',
  updated_at = now()
WHERE feature = 'chefs_table'
  AND status = 'pending'
  AND COALESCE((metadata ->> 'paid')::boolean, false) = true
  AND NULLIF(trim(COALESCE(metadata ->> 'checkout_session_id', '')), '') IS NOT NULL
  AND total_amount > 0;

ALTER TABLE public.reservations ENABLE TRIGGER guard_locked_reservation_status;
