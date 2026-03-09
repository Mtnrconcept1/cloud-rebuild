
-- 1. Function: credit loyalty points after an order is confirmed
-- Uses restaurant points_multiplier, 10 pts/CHF base rate
-- Also handles donate_earned_xp flag
CREATE OR REPLACE FUNCTION public.credit_order_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_multiplier numeric;
  v_earned integer;
  v_donate boolean;
BEGIN
  -- Only credit when status changes TO a non-cancelled delivered/confirmed state
  -- Credit on 'pending' (order just created) since payment is upfront
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    -- Get restaurant multiplier
    SELECT COALESCE(points_multiplier, 1.0) INTO v_multiplier
    FROM restaurants WHERE id = NEW.restaurant_id;

    -- 10 pts per CHF * multiplier
    v_earned := GREATEST(1, FLOOR(NEW.total_amount * 10 * v_multiplier));

    -- Check if user wants to donate
    v_donate := COALESCE((NEW.metadata->>'donate_earned_xp')::boolean, false);

    IF v_donate THEN
      -- Donate to solidarity
      INSERT INTO solidarity_donations (user_id, points_amount, meals_count)
      VALUES (NEW.user_id, v_earned, GREATEST(1, v_earned / 100));

      INSERT INTO loyalty_transactions (user_id, amount, transaction_type, description)
      VALUES (NEW.user_id, v_earned, 'donation', 'Don solidaire automatique (commande)');
    ELSE
      -- Credit to user
      UPDATE profiles SET loyalty_points = COALESCE(loyalty_points, 0) + v_earned
      WHERE user_id = NEW.user_id;

      INSERT INTO loyalty_transactions (user_id, amount, transaction_type, description)
      VALUES (NEW.user_id, v_earned, 'order_earned', 'Points gagnés sur commande (' || v_earned || ' pts, x' || v_multiplier || ')');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Trigger on orders table
DROP TRIGGER IF EXISTS trg_credit_order_loyalty ON orders;
CREATE TRIGGER trg_credit_order_loyalty
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION credit_order_loyalty_points();

-- 3. Function: credit loyalty points after a reservation is confirmed
CREATE OR REPLACE FUNCTION public.credit_reservation_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_multiplier numeric;
  v_earned integer;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT COALESCE(points_multiplier, 1.0) INTO v_multiplier
    FROM restaurants WHERE id = NEW.restaurant_id;

    -- Base 100 pts per reservation * multiplier
    v_earned := GREATEST(1, FLOOR(100 * v_multiplier));

    UPDATE profiles SET loyalty_points = COALESCE(loyalty_points, 0) + v_earned
    WHERE user_id = NEW.user_id;

    INSERT INTO loyalty_transactions (user_id, amount, transaction_type, description)
    VALUES (NEW.user_id, v_earned, 'reservation_earned', 'Points gagnés sur réservation (' || v_earned || ' pts)');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_reservation_loyalty ON reservations;
CREATE TRIGGER trg_credit_reservation_loyalty
  AFTER INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION credit_reservation_loyalty_points();

-- 4. Function: auto-update tier when loyalty_points changes
CREATE OR REPLACE FUNCTION public.update_loyalty_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_tier loyalty_tier;
BEGIN
  IF NEW.loyalty_points >= 5000 THEN
    v_new_tier := 'platinum';
  ELSIF NEW.loyalty_points >= 2500 THEN
    v_new_tier := 'gold';
  ELSIF NEW.loyalty_points >= 1000 THEN
    v_new_tier := 'silver';
  ELSE
    v_new_tier := 'bronze';
  END IF;

  IF NEW.current_tier IS DISTINCT FROM v_new_tier THEN
    NEW.current_tier := v_new_tier;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_loyalty_tier ON profiles;
CREATE TRIGGER trg_update_loyalty_tier
  BEFORE UPDATE OF loyalty_points ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_loyalty_tier();
