ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.restaurants
SET amenities = '{}'::text[]
WHERE amenities IS NULL;
