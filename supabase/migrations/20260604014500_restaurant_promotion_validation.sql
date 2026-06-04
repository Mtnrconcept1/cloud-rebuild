-- Server-side validation for restaurant promotions.
-- Constraints are NOT VALID so existing legacy rows do not block the migration,
-- while all new inserts/updates must satisfy the business rules.
DO $$
BEGIN
  IF to_regclass('public.restaurant_promotions') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.restaurant_promotions
    DROP CONSTRAINT IF EXISTS restaurant_promotions_type_check;
  ALTER TABLE public.restaurant_promotions
    ADD CONSTRAINT restaurant_promotions_type_check
    CHECK (promotion_type IN ('percentage', 'fixed', 'free_delivery')) NOT VALID;

  ALTER TABLE public.restaurant_promotions
    DROP CONSTRAINT IF EXISTS restaurant_promotions_target_check;
  ALTER TABLE public.restaurant_promotions
    ADD CONSTRAINT restaurant_promotions_target_check
    CHECK (target IN ('all', 'new', 'returning')) NOT VALID;

  ALTER TABLE public.restaurant_promotions
    DROP CONSTRAINT IF EXISTS restaurant_promotions_value_check;
  ALTER TABLE public.restaurant_promotions
    ADD CONSTRAINT restaurant_promotions_value_check
    CHECK (
      (promotion_type = 'percentage' AND promotion_value > 0 AND promotion_value <= 100)
      OR (promotion_type = 'fixed' AND promotion_value > 0 AND promotion_value <= 1000)
      OR (promotion_type = 'free_delivery' AND promotion_value = 0)
    ) NOT VALID;

  ALTER TABLE public.restaurant_promotions
    DROP CONSTRAINT IF EXISTS restaurant_promotions_period_check;
  ALTER TABLE public.restaurant_promotions
    ADD CONSTRAINT restaurant_promotions_period_check
    CHECK (end_at >= start_at) NOT VALID;
END $$;
