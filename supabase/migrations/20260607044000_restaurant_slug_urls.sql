-- Stable restaurant slugs for indexable public URLs.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.tok_slugify(value text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT trim(
    both '-' from regexp_replace(
      lower(extensions.unaccent(COALESCE(value, ''))),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
$$;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.restaurants
SET slug = public.tok_slugify(name)
WHERE NULLIF(trim(COALESCE(slug, '')), '') IS NULL
  AND NULLIF(trim(COALESCE(name, '')), '') IS NOT NULL;

WITH ranked AS (
  SELECT
    id,
    slug,
    row_number() OVER (
      PARTITION BY lower(COALESCE(city, '')), slug
      ORDER BY created_at NULLS LAST, id
    ) AS slug_rank
  FROM public.restaurants
  WHERE NULLIF(trim(COALESCE(slug, '')), '') IS NOT NULL
)
UPDATE public.restaurants r
SET slug = ranked.slug || '-' || left(r.id::text, 8)
FROM ranked
WHERE r.id = ranked.id
  AND ranked.slug_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_city_slug_unique
  ON public.restaurants (lower(COALESCE(city, '')), slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurants_slug_active
  ON public.restaurants (slug)
  WHERE is_active = true AND slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_restaurant_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
BEGIN
  IF NULLIF(trim(COALESCE(NEW.slug, '')), '') IS NULL THEN
    NEW.slug := public.tok_slugify(NEW.name);
  ELSE
    NEW.slug := public.tok_slugify(NEW.slug);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_restaurant_slug ON public.restaurants;
CREATE TRIGGER set_restaurant_slug
  BEFORE INSERT OR UPDATE OF name, slug ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.set_restaurant_slug();

REVOKE EXECUTE ON FUNCTION public.set_restaurant_slug() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
