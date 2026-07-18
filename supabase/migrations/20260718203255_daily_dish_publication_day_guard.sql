-- Preserve the immutable daily_dish_ai migration while adding a defense in
-- depth: an old proposal can never be re-published as today's active dish.

BEGIN;

CREATE OR REPLACE FUNCTION public._guard_restaurant_daily_dish_service_day()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_generation_date date;
  v_timezone text;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT
    run.generation_date,
    COALESCE(setting.timezone, 'Europe/Zurich')
  INTO v_generation_date, v_timezone
  FROM public.restaurant_daily_dish_variants variant
  JOIN public.restaurant_daily_dish_runs run
    ON run.id = variant.run_id
   AND run.restaurant_id = variant.restaurant_id
  LEFT JOIN public.restaurant_daily_dish_settings setting
    ON setting.restaurant_id = variant.restaurant_id
  WHERE variant.id = NEW.variant_id
    AND variant.restaurant_id = NEW.restaurant_id
    AND run.status = 'completed';

  IF v_generation_date IS NULL
     OR NEW.service_date <> v_generation_date
     OR NEW.service_date <> (now() AT TIME ZONE COALESCE(v_timezone, 'Europe/Zurich'))::date THEN
    RAISE EXCEPTION 'daily dish must use today''s completed proposal'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS restaurant_daily_dishes_service_day_guard
  ON public.restaurant_daily_dishes;
CREATE TRIGGER restaurant_daily_dishes_service_day_guard
BEFORE INSERT OR UPDATE OF service_date, variant_id, status
ON public.restaurant_daily_dishes
FOR EACH ROW
EXECUTE FUNCTION public._guard_restaurant_daily_dish_service_day();

COMMIT;
