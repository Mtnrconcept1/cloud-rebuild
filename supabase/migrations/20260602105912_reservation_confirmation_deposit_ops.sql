-- Operationalize reservation confirmation, optional deposits and no-show
-- follow-up without relying on frontend-only metadata.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reservation_confirmation_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_review_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_deposit_amount_non_negative'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_deposit_amount_non_negative
      CHECK (deposit_amount_chf >= 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_reservations_apply_confirmation_deposit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_metadata jsonb := COALESCE(NEW.metadata, '{}'::jsonb);
  v_feature text := lower(COALESCE(NEW.feature, ''));
  v_status text := lower(COALESCE(NEW.status, ''));
  v_paid boolean := false;
  v_confirmation_required boolean := false;
  v_confirmation_minutes integer := 15;
  v_deposit_amount numeric := COALESCE(NEW.deposit_amount_chf, 0);
  v_deadline_text text := NULLIF(trim(COALESCE(v_metadata ->> 'reservation_confirmation_deadline_at', '')), '');
  v_no_show_review_text text := NULLIF(trim(COALESCE(v_metadata ->> 'no_show_review_at', '')), '');
BEGIN
  IF lower(COALESCE(v_metadata ->> 'paid', 'false')) IN ('true', '1', 'yes', 'y', 'on') THEN
    v_paid := true;
  END IF;

  IF lower(COALESCE(v_metadata ->> 'deposit_paid', 'false')) IN ('true', '1', 'yes', 'y', 'on') THEN
    v_paid := true;
  END IF;

  IF NULLIF(trim(COALESCE(v_metadata ->> 'checkout_session_id', '')), '') IS NOT NULL THEN
    v_paid := true;
  END IF;

  IF v_metadata ? 'restaurant_confirmation_required' THEN
    v_confirmation_required := lower(COALESCE(v_metadata ->> 'restaurant_confirmation_required', 'false')) IN ('true', '1', 'yes', 'y', 'on');
  ELSE
    v_confirmation_required := v_status = 'pending'
      AND v_feature NOT IN ('zero-attente', 'chefs_table');
  END IF;

  IF NULLIF(trim(COALESCE(v_metadata ->> 'confirmation_deadline_minutes', '')), '') IS NOT NULL THEN
    BEGIN
      v_confirmation_minutes := GREATEST((v_metadata ->> 'confirmation_deadline_minutes')::integer, 1);
    EXCEPTION WHEN invalid_text_representation THEN
      v_confirmation_minutes := 15;
    END;
  END IF;

  IF NULLIF(trim(COALESCE(v_metadata ->> 'deposit_amount_chf', '')), '') IS NOT NULL THEN
    BEGIN
      v_deposit_amount := GREATEST((v_metadata ->> 'deposit_amount_chf')::numeric, 0);
    EXCEPTION WHEN invalid_text_representation THEN
      v_deposit_amount := COALESCE(NEW.deposit_amount_chf, 0);
    END;
  ELSIF NULLIF(trim(COALESCE(v_metadata ->> 'deposit_amount', '')), '') IS NOT NULL THEN
    BEGIN
      v_deposit_amount := GREATEST((v_metadata ->> 'deposit_amount')::numeric, 0);
    EXCEPTION WHEN invalid_text_representation THEN
      v_deposit_amount := COALESCE(NEW.deposit_amount_chf, 0);
    END;
  END IF;

  NEW.deposit_amount_chf := COALESCE(v_deposit_amount, 0);

  IF v_status IN ('confirmed', 'arrived', 'seated', 'no_show') THEN
    NEW.restaurant_confirmation_required := false;
    NEW.reservation_confirmation_deadline_at := NULL;
    IF NEW.restaurant_confirmed_at IS NULL THEN
      NEW.restaurant_confirmed_at := now();
    END IF;
  ELSE
    NEW.restaurant_confirmation_required := v_confirmation_required;
    IF v_confirmation_required AND NEW.reservation_confirmation_deadline_at IS NULL THEN
      IF v_deadline_text IS NOT NULL THEN
        BEGIN
          NEW.reservation_confirmation_deadline_at := v_deadline_text::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
          NEW.reservation_confirmation_deadline_at := now() + make_interval(mins => v_confirmation_minutes);
        END;
      ELSE
        NEW.reservation_confirmation_deadline_at := now() + make_interval(mins => v_confirmation_minutes);
      END IF;
    END IF;
  END IF;

  IF NEW.deposit_amount_chf > 0 THEN
    IF v_status = 'no_show' THEN
      NEW.deposit_status := CASE
        WHEN COALESCE(NEW.deposit_status, 'not_required') IN ('paid', 'pending') THEN 'forfeited'
        ELSE COALESCE(NEW.deposit_status, 'forfeited')
      END;
    ELSIF v_paid THEN
      NEW.deposit_status := 'paid';
    ELSIF COALESCE(NEW.deposit_status, 'not_required') = 'not_required' THEN
      NEW.deposit_status := 'pending';
    END IF;
  ELSE
    NEW.deposit_status := 'not_required';
  END IF;

  IF v_status = 'no_show' AND NEW.no_show_review_at IS NULL THEN
    IF v_no_show_review_text IS NOT NULL THEN
      BEGIN
        NEW.no_show_review_at := v_no_show_review_text::timestamptz;
      EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
        NEW.no_show_review_at := now();
      END;
    ELSE
      NEW.no_show_review_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_apply_confirmation_deposit ON public.reservations;
CREATE TRIGGER reservations_apply_confirmation_deposit
BEFORE INSERT OR UPDATE OF status, metadata, total_amount, deposit_amount_chf, deposit_status
ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.tg_reservations_apply_confirmation_deposit();

REVOKE EXECUTE ON FUNCTION public.tg_reservations_apply_confirmation_deposit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_reservations_apply_confirmation_deposit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_reservations_apply_confirmation_deposit() FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_reservations_confirmation_deadline_active
  ON public.reservations (restaurant_id, reservation_confirmation_deadline_at)
  WHERE restaurant_confirmation_required = true
    AND lower(COALESCE(status, '')) = 'pending';

CREATE INDEX IF NOT EXISTS idx_reservations_no_show_review
  ON public.reservations (restaurant_id, no_show_review_at)
  WHERE no_show_review_at IS NOT NULL
    AND lower(COALESCE(status, '')) = 'no_show';

UPDATE public.reservations
SET metadata = COALESCE(metadata, '{}'::jsonb),
    updated_at = now()
WHERE lower(COALESCE(status, '')) IN ('pending', 'confirmed', 'arrived', 'seated', 'no_show')
  AND (
    restaurant_confirmation_required = false
    OR reservation_confirmation_deadline_at IS NULL
    OR deposit_status = 'not_required'
  );

NOTIFY pgrst, 'reload schema';
