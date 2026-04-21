CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_order_charge_once
  ON public.payment_transactions (order_id, stripe_checkout_session_id, type)
  WHERE order_id IS NOT NULL
    AND stripe_checkout_session_id IS NOT NULL
    AND type = 'charge'
    AND status = 'succeeded';

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_code_uses_order_once
  ON public.promo_code_uses (promo_code_id, user_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_transactions_redeem_once
  ON public.loyalty_transactions (user_id, order_id, transaction_type)
  WHERE order_id IS NOT NULL
    AND transaction_type = 'redeem';

CREATE OR REPLACE FUNCTION public.apply_checkout_benefits(
  p_user_id uuid,
  p_order_id uuid,
  p_points_to_redeem integer DEFAULT 0,
  p_promo_code_id uuid DEFAULT NULL,
  p_discount_applied numeric DEFAULT 0,
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
  v_order_record public.orders%ROWTYPE;
  v_order_metadata jsonb;
  v_current_points integer := 0;
  v_points_applied integer := 0;
  v_existing_promo_use public.promo_code_uses%ROWTYPE;
  v_existing_uses integer := 0;
  v_non_failed_orders integer := 0;
  v_promo public.promo_codes%ROWTYPE;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_promo_discount numeric := 0;
BEGIN
  IF p_user_id IS NULL OR p_order_id IS NULL THEN
    RAISE EXCEPTION 'user_id et order_id requis';
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
  INTO v_order_record
  FROM public.orders
  WHERE id = p_order_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  v_order_metadata := COALESCE(v_order_record.metadata, '{}'::jsonb);

  IF COALESCE(p_points_to_redeem, 0) > 0 THEN
    SELECT COALESCE(abs(amount), 0)
    INTO v_points_applied
    FROM public.loyalty_transactions
    WHERE user_id = p_user_id
      AND order_id = p_order_id
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

      BEGIN
        UPDATE public.profiles
        SET loyalty_points = loyalty_points - p_points_to_redeem
        WHERE user_id = p_user_id;

        INSERT INTO public.loyalty_transactions (
          user_id,
          order_id,
          amount,
          transaction_type,
          description
        )
        VALUES (
          p_user_id,
          p_order_id,
          -p_points_to_redeem,
          'redeem',
          COALESCE(p_description, format('Paiement commande %s', COALESCE(v_order_record.order_number, p_order_id::text)))
        );

        v_points_applied := p_points_to_redeem;
      EXCEPTION
        WHEN unique_violation THEN
          SELECT COALESCE(abs(amount), 0)
          INTO v_points_applied
          FROM public.loyalty_transactions
          WHERE user_id = p_user_id
            AND order_id = p_order_id
            AND transaction_type = 'redeem'
          LIMIT 1;
      END;
    END IF;
  END IF;

  IF p_promo_code_id IS NOT NULL THEN
    SELECT *
    INTO v_existing_promo_use
    FROM public.promo_code_uses
    WHERE promo_code_id = p_promo_code_id
      AND user_id = p_user_id
      AND order_id = p_order_id
    LIMIT 1;

    IF FOUND THEN
      v_promo_discount := COALESCE(v_existing_promo_use.discount_applied, 0);
    ELSE
      SELECT *
      INTO v_promo
      FROM public.promo_codes
      WHERE id = p_promo_code_id
        AND is_active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Code promo introuvable';
      END IF;

      IF v_promo.valid_from IS NOT NULL AND v_promo.valid_from > now() THEN
        RAISE EXCEPTION 'Ce code promo n''est pas encore actif';
      END IF;

      IF v_promo.valid_until IS NOT NULL AND v_promo.valid_until < now() THEN
        RAISE EXCEPTION 'Ce code promo a expire';
      END IF;

      IF v_promo.restaurant_id IS NOT NULL AND v_promo.restaurant_id IS DISTINCT FROM v_order_record.restaurant_id THEN
        RAISE EXCEPTION 'Ce code promo n''est pas valable pour ce restaurant';
      END IF;

      SELECT count(*)
      INTO v_existing_uses
      FROM public.promo_code_uses
      WHERE promo_code_id = p_promo_code_id
        AND user_id = p_user_id;

      IF v_promo.per_user_limit IS NOT NULL AND v_existing_uses >= v_promo.per_user_limit THEN
        RAISE EXCEPTION 'Ce code promo a deja ete utilise';
      END IF;

      IF v_promo.max_uses IS NOT NULL AND COALESCE(v_promo.current_uses, 0) >= v_promo.max_uses THEN
        RAISE EXCEPTION 'Ce code promo a atteint sa limite d''utilisation';
      END IF;

      SELECT count(*)
      INTO v_non_failed_orders
      FROM public.orders
      WHERE user_id = p_user_id
        AND id <> p_order_id
        AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed', 'pending_payment');

      IF COALESCE(v_promo.is_first_order_only, false) AND v_non_failed_orders > 0 THEN
        RAISE EXCEPTION 'Ce code promo est reserve a la premiere commande';
      END IF;

      v_subtotal := GREATEST(
        COALESCE(NULLIF(v_order_metadata ->> 'pre_discount_subtotal', '')::numeric, 0),
        COALESCE(v_order_record.total_amount, 0)
      );
      v_delivery_fee := GREATEST(COALESCE(v_order_record.delivery_fee, 0), 0);

      IF COALESCE(v_promo.min_order_amount, 0) > 0 AND v_subtotal < v_promo.min_order_amount THEN
        RAISE EXCEPTION 'Le montant minimum du code promo n''est pas atteint';
      END IF;

      IF v_promo.type = 'percentage' THEN
        v_promo_discount := round((v_subtotal * COALESCE(v_promo.value, 0) / 100.0)::numeric, 2);
        IF v_promo.max_discount IS NOT NULL THEN
          v_promo_discount := LEAST(v_promo_discount, v_promo.max_discount);
        END IF;
      ELSIF v_promo.type = 'fixed' THEN
        v_promo_discount := LEAST(v_subtotal, COALESCE(v_promo.value, 0));
      ELSIF v_promo.type = 'free_delivery' THEN
        v_promo_discount := v_delivery_fee;
      END IF;

      v_promo_discount := GREATEST(v_promo_discount, COALESCE(p_discount_applied, 0), 0);

      BEGIN
        INSERT INTO public.promo_code_uses (
          promo_code_id,
          user_id,
          order_id,
          discount_applied
        )
        VALUES (
          p_promo_code_id,
          p_user_id,
          p_order_id,
          v_promo_discount
        );

        UPDATE public.promo_codes
        SET current_uses = COALESCE(current_uses, 0) + 1
        WHERE id = p_promo_code_id;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;

      SELECT *
      INTO v_existing_promo_use
      FROM public.promo_code_uses
      WHERE promo_code_id = p_promo_code_id
        AND user_id = p_user_id
        AND order_id = p_order_id
      LIMIT 1;

      v_promo_discount := COALESCE(v_existing_promo_use.discount_applied, v_promo_discount, 0);
    END IF;
  END IF;

  IF COALESCE(v_points_applied, 0) > 0 OR COALESCE(v_promo_discount, 0) > 0 THEN
    UPDATE public.orders
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'points_redeemed', COALESCE(v_points_applied, 0),
      'promo_code_id', p_promo_code_id,
      'promo_code_discount_amount', COALESCE(v_promo_discount, 0)
    ),
        updated_at = now()
    WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'points_applied', COALESCE(v_points_applied, 0),
    'promo_discount_applied', COALESCE(v_promo_discount, 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_checkout_benefits(uuid, uuid, integer, uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_checkout_benefits(uuid, uuid, integer, uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_checkout_benefits(uuid, uuid, integer, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_checkout_benefits(uuid, uuid, integer, uuid, numeric, text) TO service_role;

NOTIFY pgrst, 'reload schema';
