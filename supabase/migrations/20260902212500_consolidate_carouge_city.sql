-- Consolidate the duplicate Carouge city labels behind one canonical public city.
--
-- Production audit on 2026-09-02 found:
--   * 32 rows stored as `Carouge`;
--   * 214 rows stored as `Carouge GE`;
--   * 4 cross-city slug collisions, including 2 already-hidden directory duplicates;
--   * 108 public rows before deduplication, 106 unique public restaurants after consolidation.
--
-- The migration fails closed if the audited `Carouge GE` population has drifted.

CREATE OR REPLACE FUNCTION public.normalize_restaurant_city_alias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
BEGIN
  IF public.tok_slugify(NEW.city) = 'carouge-ge' THEN
    NEW.city := 'Carouge';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_restaurant_city_alias() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS normalize_restaurant_city_alias ON public.restaurants;
CREATE TRIGGER normalize_restaurant_city_alias
  BEFORE INSERT OR UPDATE OF city ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_restaurant_city_alias();

DO $$
DECLARE
  v_carouge_ge_rows integer;
BEGIN
  SELECT count(*)::integer
  INTO v_carouge_ge_rows
  FROM public.restaurants
  WHERE city = 'Carouge GE';

  IF v_carouge_ge_rows NOT IN (0, 214) THEN
    RAISE EXCEPTION
      'Carouge consolidation aborted: expected 214 Carouge GE rows from the audited snapshot, found %',
      v_carouge_ge_rows;
  END IF;
END;
$$;

-- Give the four known duplicate records an internal unique slug before both city
-- populations share the same city-scoped unique index. Stable source references
-- are used instead of generated UUIDs.
UPDATE public.restaurants
SET slug = CASE directory_source_reference
    WHEN '2600000037' THEN 'creperie-du-vieux-carouge-duplicate-2600000037'
    WHEN '2600000057' THEN 'le-jardin-de-pinchat-duplicate-2600000057'
    WHEN '14025' THEN 'chi-le-ma-carouge-duplicate-14025'
    WHEN '14528' THEN 'mi-piace-duplicate-14528'
    ELSE slug
  END,
  updated_at = now()
WHERE directory_source = 'commercial_prospect_catalog'
  AND directory_source_reference IN ('2600000037', '2600000057', '14025', '14528');

-- Keep the richer, independently verified rows public for the two collisions
-- where both copies were previously exposed. The duplicate rows are retained in
-- the database for provenance but no longer qualify for public directory reads.
UPDATE public.restaurants
SET directory_public_name_verified = false,
  directory_public_name_verified_at = NULL,
  updated_at = now()
WHERE directory_source = 'commercial_prospect_catalog'
  AND directory_source_reference IN ('2600000037', '2600000057');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.restaurants AS carouge
    JOIN public.restaurants AS carouge_ge
      ON carouge_ge.slug = carouge.slug
    WHERE carouge.city = 'Carouge'
      AND carouge_ge.city = 'Carouge GE'
      AND carouge.slug IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Carouge consolidation aborted: cross-city slug collisions remain';
  END IF;
END;
$$;

UPDATE public.restaurants
SET city = 'Carouge',
  updated_at = now()
WHERE city = 'Carouge GE';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE city = 'Carouge GE'
  ) THEN
    RAISE EXCEPTION 'Carouge consolidation failed: Carouge GE rows remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE city = 'Carouge'
      AND slug IS NOT NULL
    GROUP BY slug
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Carouge consolidation failed: duplicate city-scoped slugs remain';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
