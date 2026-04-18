-- Lock reservation and special order status changes after cancellation or payment.

CREATE OR REPLACE FUNCTION public.is_truthy_text(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(COALESCE(p_value, ''))) IN ('1', 'true', 'yes', 'oui');
$$;

CREATE OR REPLACE FUNCTION public.is_special_paid_reservation_locked(
  p_feature text,
  p_status text,
  p_total_amount numeric,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_feature text := lower(COALESCE(trim(p_feature), ''));
  v_status text := lower(COALESCE(trim(p_status), ''));
BEGIN
  IF v_feature NOT IN ('zero-attente', 'chefs_table') THEN
    RETURN false;
  END IF;

  IF public.is_truthy_text(COALESCE(p_metadata ->> 'paid', NULL)) THEN
    RETURN true;
  END IF;

  RETURN COALESCE(p_total_amount, 0) > 0
    AND v_status NOT IN ('pending', 'pending_payment');
END;
$$;

CREATE OR REPLACE FUNCTION public.is_special_paid_order_locked(
  p_order_id uuid,
  p_payment_status text,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_status text := lower(COALESCE(trim(p_payment_status), ''));
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_feature text := lower(COALESCE(trim(v_metadata ->> 'feature'), ''));
BEGIN
  IF v_payment_status NOT IN ('captured', 'paid') THEN
    RETURN false;
  END IF;

  IF v_feature IN (
    'anti-gaspi',
    'anti_waste',
    'zero-gaspi',
    'ventes-flash',
    'ventes_flash',
    'flash_sale',
    'flash-sale'
  ) THEN
    RETURN true;
  END IF;

  IF public.is_truthy_text(v_metadata ->> 'has_anti_gaspi')
     OR public.is_truthy_text(v_metadata ->> 'is_anti_waste')
     OR NULLIF(trim(COALESCE(v_metadata ->> 'anti_waste_offer_id', '')), '') IS NOT NULL THEN
    RETURN true;
  END IF;

  IF public.is_truthy_text(v_metadata ->> 'has_flash_sale')
     OR public.is_truthy_text(v_metadata ->> 'is_flash_sale')
     OR NULLIF(trim(COALESCE(v_metadata ->> 'flash_sale_id', '')), '') IS NOT NULL THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND (
        oi.anti_waste_offer_id IS NOT NULL
        OR NULLIF(trim(COALESCE(oi.metadata ->> 'flash_sale_id', '')), '') IS NOT NULL
        OR public.is_truthy_text(oi.metadata ->> 'is_anti_waste')
        OR public.is_truthy_text(oi.metadata ->> 'is_flash_sale')
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_guard_locked_reservation_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF lower(COALESCE(OLD.status, '')) = 'cancelled' THEN
    RAISE EXCEPTION 'Cette reservation a deja ete annulee et son statut est verrouille.';
  END IF;

  IF public.is_special_paid_reservation_locked(
    OLD.feature,
    OLD.status,
    OLD.total_amount,
    OLD.metadata
  ) THEN
    RAISE EXCEPTION 'Cette reservation payee ne peut plus changer de statut.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_locked_reservation_status ON public.reservations;
CREATE TRIGGER guard_locked_reservation_status
  BEFORE UPDATE OF status ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_guard_locked_reservation_status();

CREATE OR REPLACE FUNCTION public.tg_guard_locked_order_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF public.is_special_paid_order_locked(
    OLD.id,
    OLD.payment_status,
    OLD.metadata
  ) THEN
    RAISE EXCEPTION 'Cette commande speciale payee ne peut plus changer de statut.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_locked_order_status ON public.orders;
CREATE TRIGGER guard_locked_order_status
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_guard_locked_order_status();

CREATE OR REPLACE FUNCTION public.cancel_reservation_by_customer(
  p_reservation_id uuid
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_effective_dt timestamptz;
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    ok := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    RETURN NEXT; RETURN;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_res.user_id THEN
    ok := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_res.status = 'cancelled' THEN
    ok := false; error_code := 'cancelled_locked';
    error_message := 'Cette reservation a deja ete annulee et son statut est verrouille.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_res.status = 'no_show' THEN
    ok := false; error_code := 'invalid_state'; error_message := 'Reservation deja terminee.';
    RETURN NEXT; RETURN;
  END IF;

  IF public.is_special_paid_reservation_locked(
    v_res.feature,
    v_res.status,
    v_res.total_amount,
    v_res.metadata
  ) THEN
    ok := false; error_code := 'paid_locked';
    error_message := 'Cette reservation payee ne peut plus changer de statut.';
    RETURN NEXT; RETURN;
  END IF;

  v_effective_dt := (v_res.date::timestamp + v_res.time::time) AT TIME ZONE 'UTC';
  IF v_effective_dt - now() < interval '2 hours' THEN
    ok := false; error_code := 'too_late';
    error_message := 'Annulation impossible moins de 2h avant la reservation.';
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'customer',
      cancellation_reason_code = NULL,
      cancellation_reason_details = NULL,
      updated_at = now()
  WHERE id = p_reservation_id;

  ok := true; error_code := NULL; error_message := NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_reservation_by_restaurant(
  p_reservation_id uuid,
  p_reason_code text,
  p_reason_details text DEFAULT NULL
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_allowed text[] := ARRAY['closure','overbooking','kitchen_issue',
                            'customer_unreachable','private_event','duplicate_error','other'];
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    ok := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    RETURN NEXT; RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(v_res.restaurant_id) THEN
    ok := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_res.status = 'cancelled' THEN
    ok := false; error_code := 'cancelled_locked';
    error_message := 'Cette reservation a deja ete annulee et son statut est verrouille.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_res.status = 'no_show' THEN
    ok := false; error_code := 'invalid_state'; error_message := 'Reservation deja terminee.';
    RETURN NEXT; RETURN;
  END IF;

  IF public.is_special_paid_reservation_locked(
    v_res.feature,
    v_res.status,
    v_res.total_amount,
    v_res.metadata
  ) THEN
    ok := false; error_code := 'paid_locked';
    error_message := 'Cette reservation payee ne peut plus changer de statut.';
    RETURN NEXT; RETURN;
  END IF;

  IF p_reason_code IS NULL OR NOT (p_reason_code = ANY (v_allowed)) THEN
    ok := false; error_code := 'invalid_reason';
    error_message := 'Raison d''annulation invalide.';
    RETURN NEXT; RETURN;
  END IF;

  IF p_reason_code = 'other'
     AND (p_reason_details IS NULL OR length(trim(p_reason_details)) < 3) THEN
    ok := false; error_code := 'missing_details';
    error_message := 'Les details sont requis pour la raison "Autre".';
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'restaurant',
      cancellation_reason_code = p_reason_code,
      cancellation_reason_details = NULLIF(trim(COALESCE(p_reason_details,'')), ''),
      updated_at = now()
  WHERE id = p_reservation_id;

  ok := true; error_code := NULL; error_message := NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_restaurant(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_restaurant(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_restaurant(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_restaurant(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_restaurant_reservation_status_safe(
  p_reservation_id uuid,
  p_status text
)
RETURNS TABLE (
  updated boolean,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_status text := lower(COALESCE(trim(p_status), ''));
BEGIN
  IF v_status = 'cancelled' THEN
    updated := false; error_code := 'use_cancel_rpc';
    error_message := 'Utilisez cancel_reservation_by_restaurant avec une raison.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_status NOT IN ('pending', 'confirmed', 'arrived', 'no_show') THEN
    updated := false; error_code := 'invalid_status';
    error_message := 'Statut de reservation invalide.';
    RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    updated := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    RETURN NEXT; RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(v_reservation.restaurant_id) THEN
    updated := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_reservation.status = 'cancelled' THEN
    updated := false; error_code := 'cancelled_locked';
    error_message := 'Cette reservation a deja ete annulee et son statut est verrouille.';
    RETURN NEXT; RETURN;
  END IF;

  IF public.is_special_paid_reservation_locked(
    v_reservation.feature,
    v_reservation.status,
    v_reservation.total_amount,
    v_reservation.metadata
  ) THEN
    updated := false; error_code := 'paid_locked';
    error_message := 'Cette reservation payee ne peut plus changer de statut.';
    RETURN NEXT; RETURN;
  END IF;

  BEGIN
    UPDATE public.reservations
    SET status = v_status,
        confirmed_at = CASE
          WHEN v_reservation.confirmed_at IS NULL
            AND v_status IN ('confirmed','arrived','no_show')
          THEN now()
          ELSE v_reservation.confirmed_at
        END,
        updated_at = now()
    WHERE id = p_reservation_id;

    updated := true; error_code := NULL; error_message := NULL;
    RETURN NEXT; RETURN;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'Cette reservation a deja ete annulee et son statut est verrouille.' THEN
        updated := false; error_code := 'cancelled_locked'; error_message := SQLERRM;
      ELSIF SQLERRM = 'Cette reservation payee ne peut plus changer de statut.' THEN
        updated := false; error_code := 'paid_locked'; error_message := SQLERRM;
      ELSE
        updated := false; error_code := 'validation_error'; error_message := SQLERRM;
      END IF;
      RETURN NEXT; RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
