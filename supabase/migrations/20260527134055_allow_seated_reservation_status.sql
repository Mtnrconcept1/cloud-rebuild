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

  IF v_status NOT IN ('pending', 'confirmed', 'arrived', 'seated', 'no_show') THEN
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
            AND v_status IN ('confirmed','arrived','seated','no_show')
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
