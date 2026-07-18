-- Public clients need the dish, not internal proposal, asset, post or actor IDs.

BEGIN;

REVOKE SELECT ON public.restaurant_daily_dishes FROM anon, authenticated;

GRANT SELECT (
  id,
  restaurant_id,
  service_date,
  name,
  description,
  price_cents,
  image_url,
  status,
  published_at,
  created_at,
  updated_at
) ON public.restaurant_daily_dishes TO anon, authenticated;

COMMIT;
