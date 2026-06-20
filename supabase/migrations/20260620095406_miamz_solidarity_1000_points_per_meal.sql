-- miamz_solidarity_1000_points_per_meal

CREATE OR REPLACE FUNCTION public.donate_points_for_meal(points_param integer, description_param text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_points integer;
BEGIN
  IF points_param IS NULL OR points_param <= 0 THEN
    RETURN false;
  END IF;

  SELECT loyalty_points INTO current_points
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF current_points IS NULL OR current_points < points_param THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
  SET loyalty_points = COALESCE(loyalty_points, 0) - points_param
  WHERE user_id = auth.uid();

  INSERT INTO public.loyalty_transactions (user_id, amount, transaction_type, description)
  VALUES (auth.uid(), -points_param, 'donation', description_param);

  INSERT INTO public.solidarity_donations (user_id, points_amount, meals_count)
  VALUES (auth.uid(), points_param, FLOOR(points_param::numeric / 1000)::integer);

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_total_donated_meals()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(FLOOR(SUM(points_amount)::numeric / 1000), 0)::integer
  FROM public.solidarity_donations;
$function$;

CREATE OR REPLACE FUNCTION public.credit_order_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_restaurant_multiplier numeric := 1;
  v_miamz_state jsonb;
  v_miamz_effects jsonb;
  v_miamz_multiplier numeric := 1;
  v_effective_multiplier numeric := 1;
  v_earned integer;
  v_donate boolean;
  v_transaction_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT COALESCE(points_multiplier, 1.0)
    INTO v_restaurant_multiplier
    FROM public.restaurants
    WHERE id = NEW.restaurant_id;

    v_miamz_state := public.resolve_miamz_benefit_state(NEW.user_id);
    v_miamz_effects := COALESCE(v_miamz_state -> 'effects', '{}'::jsonb);
    IF NOT (COALESCE(v_miamz_state -> 'active_benefit_ids', '[]'::jsonb) ? 'welcome_miamz') THEN
      RETURN NEW;
    END IF;

    v_miamz_multiplier := GREATEST(1, COALESCE((v_miamz_effects ->> 'points_multiplier')::numeric, 1));
    v_effective_multiplier := COALESCE(v_restaurant_multiplier, 1) * v_miamz_multiplier;
    v_earned := GREATEST(1, FLOOR(NEW.total_amount * 10 * v_effective_multiplier));
    v_donate := COALESCE((NEW.metadata ->> 'donate_earned_xp')::boolean, false);

    IF v_donate THEN
      INSERT INTO public.loyalty_transactions (
        user_id,
        order_id,
        amount,
        transaction_type,
        description,
        metadata
      )
      VALUES (
        NEW.user_id,
        NEW.id,
        v_earned,
        'donation',
        'Don solidaire automatique (commande)',
        jsonb_build_object(
          'restaurant_multiplier', COALESCE(v_restaurant_multiplier, 1),
          'miamz_points_multiplier', v_miamz_multiplier,
          'effective_multiplier', v_effective_multiplier,
          'miamz_state', v_miamz_state
        )
      )
      ON CONFLICT (user_id, order_id, transaction_type)
      WHERE order_id IS NOT NULL AND transaction_type IN ('order_earned', 'donation')
      DO NOTHING
      RETURNING id INTO v_transaction_id;

      IF v_transaction_id IS NOT NULL THEN
        INSERT INTO public.solidarity_donations (user_id, points_amount, meals_count)
        VALUES (NEW.user_id, v_earned, FLOOR(v_earned::numeric / 1000)::integer);
      END IF;
    ELSE
      INSERT INTO public.loyalty_transactions (
        user_id,
        order_id,
        amount,
        transaction_type,
        description,
        metadata
      )
      VALUES (
        NEW.user_id,
        NEW.id,
        v_earned,
        'order_earned',
        'Points gagnes sur commande (' || v_earned || ' pts, x' || v_effective_multiplier || ')',
        jsonb_build_object(
          'restaurant_multiplier', COALESCE(v_restaurant_multiplier, 1),
          'miamz_points_multiplier', v_miamz_multiplier,
          'effective_multiplier', v_effective_multiplier,
          'miamz_state', v_miamz_state
        )
      )
      ON CONFLICT (user_id, order_id, transaction_type)
      WHERE order_id IS NOT NULL AND transaction_type IN ('order_earned', 'donation')
      DO NOTHING
      RETURNING id INTO v_transaction_id;

      IF v_transaction_id IS NOT NULL THEN
        UPDATE public.profiles
        SET loyalty_points = COALESCE(loyalty_points, 0) + v_earned
        WHERE user_id = NEW.user_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.donate_points_for_meal(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.donate_points_for_meal(integer, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_total_donated_meals() TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.credit_order_loyalty_points() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_order_loyalty_points() TO service_role;

NOTIFY pgrst, 'reload schema';
