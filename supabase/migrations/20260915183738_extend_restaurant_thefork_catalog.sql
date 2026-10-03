ALTER TABLE public.restaurant_thefork_catalog ADD COLUMN IF NOT EXISTS restaurant_id uuid;
ALTER TABLE public.restaurant_thefork_catalog ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_restaurant_thefork_catalog_restaurant_id ON public.restaurant_thefork_catalog (restaurant_id);;
