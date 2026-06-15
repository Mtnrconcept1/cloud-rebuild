-- Meal formula service limits.
-- The classic reservation formulas store their quota in meal_formulas.availability
-- as availability.maxTablesPerService. The quota is counted per restaurant,
-- formula, service day and service period, then resets on the next service.

CREATE OR REPLACE FUNCTION public.get_meal_formula_service_key(p_time time)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN EXTRACT(HOUR FROM p_time) < 15 THEN 'lunch' ELSE 'dinner' END;
$$;

CREATE OR REPLACE FUNCTION public.read_meal_formula_max_tables_per_service(p_availability jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH raw_limit AS (
    SELECT NULLIF(
      COALESCE(
        p_availability ->> 'maxTablesPerService',
        p_availability ->> 'max_tables_per_service'
      ),
      ''
    ) AS value
  )
  SELECT CASE
    WHEN value ~ '^[0-9]+$' THEN LEAST(GREATEST(value::integer, 1), 200)
    ELSE NULL
  END
  FROM raw_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_meal_formula_service_availability(
  p_restaurant_id uuid,
  p_date date,
  p_time time
)
RETURNS TABLE (
  formula_id uuid,
  formula_name text,
  max_tables integer,
  reserved_tables integer,
  remaining_tables integer,
  available boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_key text := public.get_meal_formula_service_key(p_time);
BEGIN
  RETURN QUERY
  WITH scoped_formulas AS (
    SELECT
      mf.id,
      mf.name,
      public.read_meal_formula_max_tables_per_service(mf.availability) AS formula_max_tables
    FROM public.meal_formulas mf
    WHERE mf.restaurant_id = p_restaurant_id
      AND mf.is_active = true
      AND mf.applies_to IN ('reservation', 'both', 'dine_in')
  )
  SELECT
    sf.id AS formula_id,
    sf.name AS formula_name,
    sf.formula_max_tables AS max_tables,
    usage.reserved_tables,
    CASE
      WHEN sf.formula_max_tables IS NULL THEN NULL
      ELSE GREATEST(sf.formula_max_tables - usage.reserved_tables, 0)
    END AS remaining_tables,
    sf.formula_max_tables IS NULL OR usage.reserved_tables < sf.formula_max_tables AS available
  FROM scoped_formulas sf
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS reserved_tables
    FROM public.reservations r
    WHERE r.restaurant_id = p_restaurant_id
      AND r.date = p_date
      AND lower(COALESCE(r.feature, '')) = 'promo-formule'
      AND r.status NOT IN ('cancelled', 'no_show', 'pending_payment')
      AND public.get_meal_formula_service_key(r.time) = v_service_key
      AND (
        NULLIF(r.metadata ->> 'formula_id', '') = sf.id::text
        OR (
          NULLIF(r.metadata ->> 'formula_id', '') IS NULL
          AND lower(NULLIF(r.metadata ->> 'formula_applied', '')) = lower(sf.name)
        )
      )
  ) usage;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_meal_formula_service_capacity(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_formula public.meal_formulas%ROWTYPE;
  v_formula_id uuid;
  v_formula_name text := NULLIF(trim(COALESCE(p_metadata ->> 'formula_applied', p_metadata ->> 'formula_name', '')), '');
  v_formula_key text := NULLIF(trim(COALESCE(p_metadata ->> 'formula_key', '')), '');
  v_service_key text := public.get_meal_formula_service_key(p_time);
  v_max_tables integer;
  v_reserved_tables integer := 0;
BEGIN
  IF COALESCE(p_metadata ->> 'formula_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_formula_id := (p_metadata ->> 'formula_id')::uuid;
  END IF;

  SELECT mf.*
  INTO v_formula
  FROM public.meal_formulas mf
  WHERE mf.restaurant_id = p_restaurant_id
    AND mf.is_active = true
    AND mf.applies_to IN ('reservation', 'both', 'dine_in')
    AND (
      (v_formula_id IS NOT NULL AND mf.id = v_formula_id)
      OR (v_formula_id IS NULL AND v_formula_key IS NOT NULL AND mf.formula_key = v_formula_key)
      OR (v_formula_id IS NULL AND v_formula_key IS NULL AND v_formula_name IS NOT NULL AND lower(mf.name) = lower(v_formula_name))
    )
  ORDER BY CASE WHEN v_formula_id IS NOT NULL AND mf.id = v_formula_id THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Formule promotionnelle introuvable.';
  END IF;

  v_max_tables := public.read_meal_formula_max_tables_per_service(v_formula.availability);

  IF v_max_tables IS NULL THEN
    RETURN jsonb_build_object(
      'formula_id', v_formula.id,
      'formula_applied', v_formula.name,
      'formula_service', v_service_key
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('meal-formula-service:' || p_restaurant_id::text || ':' || p_date::text || ':' || v_service_key || ':' || v_formula.id::text));

  SELECT count(*)::integer
  INTO v_reserved_tables
  FROM public.reservations r
  WHERE r.restaurant_id = p_restaurant_id
    AND r.date = p_date
    AND lower(COALESCE(r.feature, '')) = 'promo-formule'
    AND r.status NOT IN ('cancelled', 'no_show', 'pending_payment')
    AND public.get_meal_formula_service_key(r.time) = v_service_key
    AND (
      NULLIF(r.metadata ->> 'formula_id', '') = v_formula.id::text
      OR (
        NULLIF(r.metadata ->> 'formula_id', '') IS NULL
        AND lower(NULLIF(r.metadata ->> 'formula_applied', '')) = lower(v_formula.name)
      )
    );

  IF v_reserved_tables >= v_max_tables THEN
    RAISE EXCEPTION 'Cette formule n''est plus disponible pour ce service.';
  END IF;

  RETURN jsonb_build_object(
    'formula_id', v_formula.id,
    'formula_applied', v_formula.name,
    'formula_service', v_service_key,
    'formula_max_tables_per_service', v_max_tables,
    'formula_reserved_tables', v_reserved_tables + 1,
    'formula_remaining_tables', GREATEST(v_max_tables - v_reserved_tables - 1, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_and_create_reservation_safe(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_feature text,
  p_metadata jsonb,
  p_notes text,
  p_progressive_offer_id uuid
)
RETURNS TABLE (
  reservation_id uuid,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  BEGIN
    IF lower(COALESCE(p_feature, '')) = 'promo-formule' THEN
      v_metadata := v_metadata || public.assert_meal_formula_service_capacity(
        p_restaurant_id,
        p_date,
        p_time,
        v_metadata
      );
    END IF;

    reservation_id := public.validate_and_create_reservation(
      p_restaurant_id,
      p_date,
      p_time,
      p_party_size,
      CASE WHEN p_progressive_offer_id IS NOT NULL THEN 'promo-progressive' ELSE COALESCE(p_feature, 'classique') END,
      v_metadata,
      p_notes
    );

    IF p_progressive_offer_id IS NOT NULL THEN
      UPDATE public.reservations
      SET progressive_offer_id = p_progressive_offer_id,
          feature = 'promo-progressive',
          metadata = COALESCE(metadata, '{}'::jsonb)
            || jsonb_build_object('progressive_offer_id', p_progressive_offer_id)
      WHERE id = reservation_id;
    END IF;

    error_code := NULL;
    error_message := NULL;
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      reservation_id := NULL;
      error_code := 'validation_error';
      error_message := SQLERRM;
      RETURN NEXT;
      RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_meal_formula_service_key(time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_meal_formula_service_key(time) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.read_meal_formula_max_tables_per_service(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_meal_formula_max_tables_per_service(jsonb) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_meal_formula_service_availability(uuid, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_meal_formula_service_availability(uuid, date, time) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.assert_meal_formula_service_capacity(uuid, date, time, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_meal_formula_service_capacity(uuid, date, time, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
