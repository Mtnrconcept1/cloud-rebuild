-- Atomic persistence and server-side validation for the lightweight floor-plan editor.

CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_template(
  p_branch_id uuid,
  p_upserts jsonb,
  p_delete_ids uuid[] DEFAULT '{}'::uuid[],
  p_reason text DEFAULT 'floor_plan_template_save'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_branch record;
  v_item jsonb;
  v_existing record;
  v_id uuid;
  v_id_text text;
  v_client_id text;
  v_name text;
  v_zone text;
  v_capacity integer;
  v_is_active boolean;
  v_layout jsonb;
  v_delete_id uuid;
  v_id_map jsonb := '{}'::jsonb;
  v_previous_tables jsonb := '[]'::jsonb;
  v_next_tables jsonb := '[]'::jsonb;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch id is required';
  END IF;
  IF jsonb_typeof(COALESCE(p_upserts, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Tables must be a JSON array';
  END IF;

  SELECT rb.id, rb.restaurant_id
  INTO v_branch
  FROM public.restaurant_branches rb
  WHERE rb.id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;
  IF NOT public.auth_can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Not allowed to update this floor plan';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_template:' || p_branch_id::text, 0));

  v_count := jsonb_array_length(COALESCE(p_upserts, '[]'::jsonb));
  IF v_count > 200 OR COALESCE(array_length(p_delete_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'Too many floor plan tables';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_upserts, '[]'::jsonb)) item
    GROUP BY lower(btrim(item->>'table_number'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Table names must be unique';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_upserts, '[]'::jsonb)) item
    GROUP BY btrim(item->>'client_id')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate table identifier';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(rt) ORDER BY rt.table_number), '[]'::jsonb)
  INTO v_previous_tables
  FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id;

  -- Validate every requested row and every destructive effect before changing data.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_upserts, '[]'::jsonb))
  LOOP
    v_client_id := btrim(COALESCE(v_item->>'client_id', ''));
    v_id_text := NULLIF(btrim(COALESCE(v_item->>'id', '')), '');
    v_name := btrim(COALESCE(v_item->>'table_number', ''));
    v_zone := btrim(COALESCE(v_item->>'sector', ''));
    v_layout := v_item->'layout';

    IF v_client_id = '' OR length(v_client_id) > 100 THEN
      RAISE EXCEPTION 'Invalid client table identifier';
    END IF;
    IF v_name = '' OR length(v_name) > 40 THEN
      RAISE EXCEPTION 'Table name must contain between 1 and 40 characters';
    END IF;
    IF v_zone = '' OR length(v_zone) > 60 THEN
      RAISE EXCEPTION 'Table sector must contain between 1 and 60 characters';
    END IF;
    IF COALESCE(v_item->>'capacity', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Invalid table capacity for %', v_name;
    END IF;
    v_capacity := (v_item->>'capacity')::integer;
    IF v_capacity < 1 OR v_capacity > 30 THEN
      RAISE EXCEPTION 'Table capacity must be between 1 and 30 for %', v_name;
    END IF;
    BEGIN
      v_is_active := COALESCE((v_item->>'is_active')::boolean, true);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid active state for %', v_name;
    END;
    IF jsonb_typeof(v_layout) <> 'object' THEN
      RAISE EXCEPTION 'Invalid table layout for %', v_name;
    END IF;
    IF COALESCE(v_layout->>'kind', 'table') <> 'table' THEN
      RAISE EXCEPTION 'Only reservable tables can be edited in Plan de salle 2';
    END IF;
    IF COALESCE(v_layout->>'shape', '') NOT IN ('round', 'rect') THEN
      RAISE EXCEPTION 'Invalid table shape for %', v_name;
    END IF;
    IF COALESCE(v_layout->>'x', '') !~ '^-?[0-9]+([.][0-9]+)?$'
       OR COALESCE(v_layout->>'y', '') !~ '^-?[0-9]+([.][0-9]+)?$'
       OR (v_layout->>'x')::numeric < 0 OR (v_layout->>'x')::numeric > 1040
       OR (v_layout->>'y')::numeric < 0 OR (v_layout->>'y')::numeric > 760 THEN
      RAISE EXCEPTION 'Invalid table position for %', v_name;
    END IF;

    v_id := NULL;
    IF v_id_text IS NOT NULL THEN
      BEGIN
        v_id := v_id_text::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid persisted table identifier';
      END;

      SELECT rt.id, rt.table_number, rt.branch_id, rt.capacity, rt.is_active, rt.layout
      INTO v_existing
      FROM public.reservation_tables rt
      WHERE rt.id = v_id
        AND rt.branch_id = p_branch_id
        AND COALESCE(rt.layout->>'kind', 'table') = 'table'
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Table does not belong to this branch';
      END IF;
      IF v_id = ANY(COALESCE(p_delete_ids, '{}'::uuid[])) THEN
        RAISE EXCEPTION 'A table cannot be updated and deleted together';
      END IF;

      IF (NOT v_is_active OR v_capacity < COALESCE(v_existing.capacity, 0)) AND EXISTS (
        SELECT 1
        FROM public.reservation_slots rs
        JOIN public.reservations r ON r.id = rs.reservation_id
        WHERE rs.table_id = v_id
          AND (NOT v_is_active OR COALESCE(r.party_size, 0) > v_capacity)
      ) THEN
        RAISE EXCEPTION 'Retirez d''abord les clients incompatibles de la table %', v_existing.table_number;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.reservation_tables rt
      WHERE rt.branch_id = p_branch_id
        AND lower(btrim(rt.table_number)) = lower(v_name)
        AND (v_id IS NULL OR rt.id <> v_id)
        AND NOT (rt.id = ANY(COALESCE(p_delete_ids, '{}'::uuid[])))
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(p_upserts, '[]'::jsonb)) requested
          WHERE requested->>'id' = rt.id::text
        )
    ) THEN
      RAISE EXCEPTION 'A table named % already exists in this branch', v_name;
    END IF;
  END LOOP;

  FOREACH v_delete_id IN ARRAY COALESCE(p_delete_ids, '{}'::uuid[])
  LOOP
    SELECT rt.id, rt.table_number, rt.branch_id, rt.layout
    INTO v_existing
    FROM public.reservation_tables rt
    WHERE rt.id = v_delete_id
      AND rt.branch_id = p_branch_id
      AND COALESCE(rt.layout->>'kind', 'table') = 'table'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Table to delete does not belong to this branch';
    END IF;
    IF EXISTS (SELECT 1 FROM public.reservation_slots rs WHERE rs.table_id = v_delete_id) THEN
      RAISE EXCEPTION 'Retirez d''abord les clients placés sur la table %', v_existing.table_number;
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_upserts, '[]'::jsonb))
  LOOP
    v_client_id := btrim(v_item->>'client_id');
    v_id_text := NULLIF(btrim(COALESCE(v_item->>'id', '')), '');
    v_name := btrim(v_item->>'table_number');
    v_zone := btrim(v_item->>'sector');
    v_capacity := (v_item->>'capacity')::integer;
    v_is_active := COALESCE((v_item->>'is_active')::boolean, true);
    v_layout := v_item->'layout';

    IF v_id_text IS NOT NULL THEN
      v_id := v_id_text::uuid;
      UPDATE public.reservation_tables
      SET table_number = v_name,
          capacity = v_capacity,
          is_active = v_is_active,
          sector = v_zone,
          layout = v_layout
      WHERE id = v_id AND branch_id = p_branch_id;
    ELSE
      INSERT INTO public.reservation_tables (
        branch_id, table_number, capacity, is_active, sector, layout
      ) VALUES (
        p_branch_id, v_name, v_capacity, v_is_active, v_zone, v_layout
      )
      RETURNING id INTO v_id;
    END IF;

    v_id_map := v_id_map || jsonb_build_object(v_client_id, v_id);
  END LOOP;

  IF COALESCE(array_length(p_delete_ids, 1), 0) > 0 THEN
    DELETE FROM public.reservation_tables rt
    WHERE rt.branch_id = p_branch_id
      AND rt.id = ANY(p_delete_ids);
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(rt) ORDER BY rt.table_number), '[]'::jsonb)
  INTO v_next_tables
  FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_save_floor_plan_template',
    'restaurant_branch',
    p_branch_id,
    jsonb_build_object('tables', v_previous_tables),
    jsonb_build_object(
      'tables', v_next_tables,
      'deleted_ids', to_jsonb(COALESCE(p_delete_ids, '{}'::uuid[])),
      'reason', btrim(COALESCE(p_reason, ''))
    )
  );

  RETURN jsonb_build_object(
    'upserted_count', v_count,
    'deleted_count', COALESCE(array_length(p_delete_ids, 1), 0),
    'id_map', v_id_map
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_layouts(
  p_branch_id uuid,
  p_service_date date,
  p_layouts jsonb,
  p_reason text DEFAULT 'floor_plan_service_layout_save'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_branch record;
  v_item jsonb;
  v_table_id uuid;
  v_layout jsonb;
  v_previous jsonb := '[]'::jsonb;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_branch_id IS NULL OR p_service_date IS NULL THEN
    RAISE EXCEPTION 'Branch id and service date are required';
  END IF;
  IF jsonb_typeof(COALESCE(p_layouts, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Layouts must be a JSON array';
  END IF;

  SELECT rb.id, rb.restaurant_id
  INTO v_branch
  FROM public.restaurant_branches rb
  WHERE rb.id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;
  IF NOT public.auth_can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Not allowed to update this floor plan';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'floor_plan_layouts:' || p_branch_id::text || ':' || p_service_date::text,
    0
  ));

  v_count := jsonb_array_length(COALESCE(p_layouts, '[]'::jsonb));
  IF v_count > 200 THEN
    RAISE EXCEPTION 'Too many floor plan layouts';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_layouts, '[]'::jsonb)) item
    GROUP BY item->>'table_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate table layout';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.reservation_table_id), '[]'::jsonb)
  INTO v_previous
  FROM public.reservation_table_layout_overrides o
  WHERE o.branch_id = p_branch_id AND o.service_date = p_service_date;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_layouts, '[]'::jsonb))
  LOOP
    BEGIN
      v_table_id := (v_item->>'table_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid table id';
    END;
    v_layout := v_item->'layout';

    IF NOT EXISTS (
      SELECT 1
      FROM public.reservation_tables rt
      WHERE rt.id = v_table_id
        AND rt.branch_id = p_branch_id
        AND COALESCE(rt.layout->>'kind', 'table') = 'table'
    ) THEN
      RAISE EXCEPTION 'Table does not belong to this branch';
    END IF;

    IF jsonb_typeof(v_layout) <> 'null' THEN
      IF jsonb_typeof(v_layout) <> 'object'
         OR COALESCE(v_layout->>'kind', 'table') <> 'table'
         OR COALESCE(v_layout->>'shape', '') NOT IN ('round', 'rect')
         OR COALESCE(v_layout->>'x', '') !~ '^-?[0-9]+([.][0-9]+)?$'
         OR COALESCE(v_layout->>'y', '') !~ '^-?[0-9]+([.][0-9]+)?$'
         OR (v_layout->>'x')::numeric < 0 OR (v_layout->>'x')::numeric > 1040
         OR (v_layout->>'y')::numeric < 0 OR (v_layout->>'y')::numeric > 760 THEN
        RAISE EXCEPTION 'Invalid table layout';
      END IF;
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_layouts, '[]'::jsonb))
  LOOP
    v_table_id := (v_item->>'table_id')::uuid;
    v_layout := v_item->'layout';

    IF jsonb_typeof(v_layout) = 'null' THEN
      DELETE FROM public.reservation_table_layout_overrides
      WHERE reservation_table_id = v_table_id AND service_date = p_service_date;
    ELSE
      INSERT INTO public.reservation_table_layout_overrides (
        reservation_table_id, branch_id, service_date, layout, updated_at
      ) VALUES (
        v_table_id, p_branch_id, p_service_date, v_layout, now()
      )
      ON CONFLICT (reservation_table_id, service_date)
      DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        layout = EXCLUDED.layout,
        updated_at = now();
    END IF;
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_save_floor_plan_layouts',
    'restaurant_branch',
    p_branch_id,
    jsonb_build_object('service_date', p_service_date, 'layouts', v_previous),
    jsonb_build_object(
      'service_date', p_service_date,
      'layouts', COALESCE(p_layouts, '[]'::jsonb),
      'reason', btrim(COALESCE(p_reason, ''))
    )
  );

  RETURN jsonb_build_object('saved_count', v_count);
END;
$$;

-- Add overlap validation under the same branch lock used for assignment writes.
CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_assignments(
  p_branch_id uuid,
  p_assignments jsonb,
  p_reason text DEFAULT 'floor_plan_assignment_save'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_branch record;
  v_assignment record;
  v_reservation record;
  v_table record;
  v_conflict record;
  v_reservation_id uuid;
  v_table_id uuid;
  v_duration integer;
  v_previous_slots jsonb := '[]'::jsonb;
  v_assignment_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Branch id is required'; END IF;
  IF jsonb_typeof(COALESCE(p_assignments, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Assignments must be a JSON object';
  END IF;

  SELECT rb.id, rb.restaurant_id INTO v_branch
  FROM public.restaurant_branches rb WHERE rb.id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF NOT public.auth_can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Not allowed to update this floor plan';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_assignments:' || p_branch_id::text, 0));
  SELECT count(*) INTO v_assignment_count FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb));
  IF v_assignment_count > 500 THEN RAISE EXCEPTION 'Too many floor plan assignments'; END IF;

  -- First pass: validate every identifier, ownership and capacity.
  FOR v_assignment IN
    SELECT key AS reservation_id_text, value AS table_id_value
    FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb))
  LOOP
    BEGIN
      v_reservation_id := v_assignment.reservation_id_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid reservation id';
    END;
    IF jsonb_typeof(v_assignment.table_id_value) = 'null' THEN
      v_table_id := NULL;
    ELSE
      BEGIN
        v_table_id := NULLIF(v_assignment.table_id_value #>> '{}', '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid table id';
      END;
    END IF;

    SELECT r.id, r.restaurant_id, r.branch_id, r.date, r.time, r.party_size, r.status, r.metadata
    INTO v_reservation
    FROM public.reservations r WHERE r.id = v_reservation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
    IF v_reservation.restaurant_id <> v_branch.restaurant_id THEN
      RAISE EXCEPTION 'Reservation does not belong to this restaurant';
    END IF;

    IF v_table_id IS NOT NULL THEN
      SELECT rt.id, rt.branch_id, rt.capacity, rt.is_active, rt.table_number
      INTO v_table
      FROM public.reservation_tables rt WHERE rt.id = v_table_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Table not found'; END IF;
      IF v_table.branch_id <> p_branch_id THEN RAISE EXCEPTION 'Table does not belong to this branch'; END IF;
      IF COALESCE(v_table.is_active, true) IS NOT TRUE THEN RAISE EXCEPTION 'Table is inactive'; END IF;
      IF COALESCE(v_table.capacity, 0) < COALESCE(v_reservation.party_size, 0) THEN
        RAISE EXCEPTION 'Table capacity is too low for this reservation';
      END IF;
    END IF;
  END LOOP;

  -- Second pass: compare the complete requested state against existing and requested slots.
  FOR v_assignment IN
    SELECT key AS reservation_id_text, value AS table_id_value
    FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb))
    WHERE jsonb_typeof(value) <> 'null'
  LOOP
    v_reservation_id := v_assignment.reservation_id_text::uuid;
    v_table_id := NULLIF(v_assignment.table_id_value #>> '{}', '')::uuid;
    IF v_table_id IS NULL THEN CONTINUE; END IF;

    SELECT r.id, r.date, r.time, r.status, r.metadata
    INTO v_reservation
    FROM public.reservations r WHERE r.id = v_reservation_id;
    v_duration := CASE
      WHEN COALESCE(v_reservation.metadata->>'duration_minutes', v_reservation.metadata->>'durationMinutes', '') ~ '^[0-9]+$'
        THEN GREATEST(30, COALESCE(v_reservation.metadata->>'duration_minutes', v_reservation.metadata->>'durationMinutes')::integer)
      ELSE 120
    END;

    SELECT r.id, r.time INTO v_conflict
    FROM public.reservation_slots rs
    JOIN public.reservations r ON r.id = rs.reservation_id
    WHERE rs.table_id = v_table_id
      AND r.id <> v_reservation_id
      AND NOT (COALESCE(p_assignments, '{}'::jsonb) ? r.id::text)
      AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'canceled', 'no_show', 'completed', 'archived')
      AND r.date = v_reservation.date
      AND (v_reservation.date + v_reservation.time::time)
          < (r.date + r.time::time) + make_interval(mins => CASE
              WHEN COALESCE(r.metadata->>'duration_minutes', r.metadata->>'durationMinutes', '') ~ '^[0-9]+$'
                THEN GREATEST(30, COALESCE(r.metadata->>'duration_minutes', r.metadata->>'durationMinutes')::integer)
              ELSE 120 END)
      AND (r.date + r.time::time)
          < (v_reservation.date + v_reservation.time::time) + make_interval(mins => v_duration)
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Table already occupied around %', left(v_conflict.time::text, 5);
    END IF;

    SELECT r.id, r.time INTO v_conflict
    FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb)) requested
    JOIN public.reservations r ON r.id = requested.key::uuid
    WHERE requested.key::uuid <> v_reservation_id
      AND jsonb_typeof(requested.value) <> 'null'
      AND NULLIF(requested.value #>> '{}', '')::uuid = v_table_id
      AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'canceled', 'no_show', 'completed', 'archived')
      AND r.date = v_reservation.date
      AND (v_reservation.date + v_reservation.time::time)
          < (r.date + r.time::time) + make_interval(mins => CASE
              WHEN COALESCE(r.metadata->>'duration_minutes', r.metadata->>'durationMinutes', '') ~ '^[0-9]+$'
                THEN GREATEST(30, COALESCE(r.metadata->>'duration_minutes', r.metadata->>'durationMinutes')::integer)
              ELSE 120 END)
      AND (r.date + r.time::time)
          < (v_reservation.date + v_reservation.time::time) + make_interval(mins => v_duration)
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Table already occupied around %', left(v_conflict.time::text, 5);
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reservation_id', rs.reservation_id, 'table_id', rs.table_id)), '[]'::jsonb)
  INTO v_previous_slots
  FROM public.reservation_slots rs
  WHERE rs.reservation_id IN (SELECT key::uuid FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb)));

  DELETE FROM public.reservation_slots rs
  WHERE rs.reservation_id IN (SELECT key::uuid FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb)));

  FOR v_assignment IN
    SELECT key AS reservation_id_text, value AS table_id_value
    FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb))
  LOOP
    v_reservation_id := v_assignment.reservation_id_text::uuid;
    v_table_id := CASE WHEN jsonb_typeof(v_assignment.table_id_value) = 'null'
      THEN NULL ELSE NULLIF(v_assignment.table_id_value #>> '{}', '')::uuid END;
    UPDATE public.reservations SET branch_id = p_branch_id, updated_at = now() WHERE id = v_reservation_id;
    IF v_table_id IS NOT NULL THEN
      INSERT INTO public.reservation_slots (reservation_id, table_id) VALUES (v_reservation_id, v_table_id);
      v_inserted_count := v_inserted_count + 1;
    END IF;
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_save_floor_plan_assignments',
    'restaurant_branch',
    p_branch_id,
    jsonb_build_object('reservation_slots', v_previous_slots),
    jsonb_build_object(
      'assignments', COALESCE(p_assignments, '{}'::jsonb),
      'assignment_count', v_assignment_count,
      'inserted_count', v_inserted_count,
      'reason', v_reason
    )
  );

  RETURN jsonb_build_object('assignment_count', v_assignment_count, 'inserted_count', v_inserted_count);
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_template(uuid, jsonb, uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_layouts(uuid, date, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_assignments(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_template(uuid, jsonb, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_layouts(uuid, date, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_assignments(uuid, jsonb, text) TO authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.reservation_tables FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.reservation_table_layout_overrides FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.reservation_slots FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.floor_plan_variants FROM authenticated;

NOTIFY pgrst, 'reload schema';
