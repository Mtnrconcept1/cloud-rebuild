CREATE OR REPLACE FUNCTION public.validate_and_create_reservation_safe(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_feature text DEFAULT 'classique',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  reservation_id uuid,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    reservation_id := public.validate_and_create_reservation(
      p_restaurant_id,
      p_date,
      p_time,
      p_party_size,
      p_feature,
      p_metadata,
      p_notes
    );
    error_code := NULL;
    error_message := NULL;
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      reservation_id := NULL;
      error_code := 'validation_error';
      error_message := SQLERRM;
      RETURN NEXT;
      RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text) TO service_role;

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
  IF v_status NOT IN ('pending', 'confirmed', 'arrived', 'cancelled', 'no_show') THEN
    updated := false;
    error_code := 'invalid_status';
    error_message := 'Statut de reservation invalide.';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT *
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    updated := false;
    error_code := 'not_found';
    error_message := 'Reservation introuvable.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF auth.role() <> 'service_role'
    AND NOT public.auth_is_admin()
    AND NOT public.auth_owns_restaurant(v_reservation.restaurant_id) THEN
    updated := false;
    error_code := 'forbidden';
    error_message := 'Acces refuse.';
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.reservations
    SET status = v_status,
        updated_at = now()
    WHERE id = p_reservation_id;

    updated := true;
    error_code := NULL;
    error_message := NULL;
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      updated := false;
      error_code := 'validation_error';
      error_message := SQLERRM;
      RETURN NEXT;
      RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
