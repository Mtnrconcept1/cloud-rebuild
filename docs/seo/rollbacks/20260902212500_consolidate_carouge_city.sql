-- Emergency rollback for supabase/migrations/20260902212500_consolidate_carouge_city.sql.
-- Run only if that migration has been applied and a rollback has been explicitly approved.
-- The count guard intentionally aborts if production drift makes the audited rollback unsafe.

BEGIN;

DO $$
DECLARE
  v_migrated_rows integer;
BEGIN
  SELECT count(*)::integer
  INTO v_migrated_rows
  FROM public.restaurants
  WHERE city = 'Carouge'
    AND directory_source = 'commercial_prospect_catalog'
    AND char_length(COALESCE(directory_source_reference, '')) BETWEEN 3 AND 6;

  IF v_migrated_rows <> 214 THEN
    RAISE EXCEPTION
      'Carouge rollback aborted: expected 214 migrated source rows, found %',
      v_migrated_rows;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS normalize_restaurant_city_alias ON public.restaurants;
DROP FUNCTION IF EXISTS public.normalize_restaurant_city_alias();

UPDATE public.restaurants
SET city = 'Carouge GE',
  updated_at = now()
WHERE city = 'Carouge'
  AND directory_source = 'commercial_prospect_catalog'
  AND char_length(COALESCE(directory_source_reference, '')) BETWEEN 3 AND 6;

UPDATE public.restaurants
SET slug = CASE directory_source_reference
    WHEN '2600000037' THEN 'creperie-du-vieux-carouge'
    WHEN '2600000057' THEN 'le-jardin-de-pinchat'
    WHEN '14025' THEN 'chi-le-ma-carouge'
    WHEN '14528' THEN 'mi-piace'
    ELSE slug
  END,
  updated_at = now()
WHERE directory_source = 'commercial_prospect_catalog'
  AND directory_source_reference IN ('2600000037', '2600000057', '14025', '14528');

UPDATE public.restaurants
SET directory_public_name_verified = true,
  directory_public_name_verified_at = '2026-08-31 18:39:44.741586+00'::timestamptz,
  updated_at = now()
WHERE directory_source = 'commercial_prospect_catalog'
  AND directory_source_reference IN ('2600000037', '2600000057');

DO $$
DECLARE
  v_carouge_rows integer;
  v_carouge_ge_rows integer;
BEGIN
  SELECT count(*)::integer INTO v_carouge_rows
  FROM public.restaurants
  WHERE city = 'Carouge';

  SELECT count(*)::integer INTO v_carouge_ge_rows
  FROM public.restaurants
  WHERE city = 'Carouge GE';

  IF v_carouge_rows <> 32 OR v_carouge_ge_rows <> 214 THEN
    RAISE EXCEPTION
      'Carouge rollback verification failed: expected 32 Carouge and 214 Carouge GE rows, found % and %',
      v_carouge_rows,
      v_carouge_ge_rows;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
