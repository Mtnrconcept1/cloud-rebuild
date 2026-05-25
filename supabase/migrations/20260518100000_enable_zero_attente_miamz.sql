ALTER TABLE public.loyalty_transactions
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_transactions_reservation_redeem_once
  ON public.loyalty_transactions (user_id, reservation_id, transaction_type)
  WHERE reservation_id IS NOT NULL AND transaction_type = 'redeem';

CREATE OR REPLACE FUNCTION public.apply_reservation_loyalty_points(
  p_user_id uuid,
  p_reservation_id uuid,
  p_points_to_redeem integer DEFAULT 0,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_reservation_record public.reservations%ROWTYPE;
  v_current_points integer := 0;
  v_points_applied integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'user_id et reservation_id requis';
  END IF;

  IF NOT v_is_service_role THEN
    IF v_actor_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_user_id IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  SELECT *
  INTO v_reservation_record
  FROM public.reservations
  WHERE id = p_reservation_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation introuvable';
  END IF;

  IF COALESCE(p_points_to_redeem, 0) > 0 THEN
    SELECT COALESCE(abs(amount), 0)
    INTO v_points_applied
    FROM public.loyalty_transactions
    WHERE user_id = p_user_id
      AND reservation_id = p_reservation_id
      AND transaction_type = 'redeem'
    LIMIT 1;

    IF COALESCE(v_points_applied, 0) = 0 THEN
      SELECT loyalty_points
      INTO v_current_points
      FROM public.profiles
      WHERE user_id = p_user_id
      FOR UPDATE;

      IF COALESCE(v_current_points, 0) < p_points_to_redeem THEN
        RAISE EXCEPTION 'Points de fidelite insuffisants';
      END IF;

      INSERT INTO public.loyalty_transactions (
        user_id,
        reservation_id,
        amount,
        transaction_type,
        description
      )
      VALUES (
        p_user_id,
        p_reservation_id,
        -p_points_to_redeem,
        'redeem',
        COALESCE(p_description, format('Paiement reservation %s', p_reservation_id::text))
      )
      ON CONFLICT (user_id, reservation_id, transaction_type)
      WHERE reservation_id IS NOT NULL AND transaction_type = 'redeem'
      DO NOTHING
      RETURNING abs(amount) INTO v_points_applied;

      IF COALESCE(v_points_applied, 0) > 0 THEN
        UPDATE public.profiles
        SET loyalty_points = loyalty_points - v_points_applied
        WHERE user_id = p_user_id;
      ELSE
        SELECT COALESCE(abs(amount), 0)
        INTO v_points_applied
        FROM public.loyalty_transactions
        WHERE user_id = p_user_id
          AND reservation_id = p_reservation_id
          AND transaction_type = 'redeem'
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF COALESCE(v_points_applied, 0) > 0 THEN
    UPDATE public.reservations
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'points_redeemed', COALESCE(v_points_applied, 0),
      'points_discount_amount', round((COALESCE(v_points_applied, 0) / 100.0)::numeric, 2),
      'points_discount', round((COALESCE(v_points_applied, 0) / 100.0)::numeric, 2)
    ),
        updated_at = now()
    WHERE id = p_reservation_id;
  END IF;

  RETURN jsonb_build_object(
    'reservation_id', p_reservation_id,
    'points_applied', COALESCE(v_points_applied, 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_reservation_loyalty_points(uuid, uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_reservation_loyalty_points(uuid, uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_reservation_loyalty_points(uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_reservation_loyalty_points(uuid, uuid, integer, text) TO service_role;

NOTIFY pgrst, 'reload schema';
