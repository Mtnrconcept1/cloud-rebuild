-- Remove daily-dish-specific advisor findings without exposing private rows.

BEGIN;

CREATE POLICY restaurant_daily_dish_settings_service_role_all
  ON public.restaurant_daily_dish_settings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY restaurant_daily_dish_runs_service_role_all
  ON public.restaurant_daily_dish_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY restaurant_daily_dish_variants_service_role_all
  ON public.restaurant_daily_dish_variants
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX restaurant_daily_dish_settings_activated_by_idx
  ON public.restaurant_daily_dish_settings (activated_by);
CREATE INDEX restaurant_daily_dish_runs_requested_by_idx
  ON public.restaurant_daily_dish_runs (requested_by);
CREATE INDEX restaurant_daily_dish_variants_created_by_idx
  ON public.restaurant_daily_dish_variants (created_by);
CREATE INDEX restaurant_daily_dishes_published_by_idx
  ON public.restaurant_daily_dishes (published_by);

REVOKE ALL ON FUNCTION public._guard_restaurant_daily_dish_service_day()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._guard_restaurant_daily_dish_service_day()
  TO service_role;

COMMIT;
