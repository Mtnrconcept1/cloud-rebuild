-- Extend Plan de salle 2 with persistent furniture while keeping the V1/V2 shared model.
CREATE UNIQUE INDEX IF NOT EXISTS ux_reservation_tables_branch_item_name_ci
  ON public.reservation_tables (branch_id, lower(btrim(table_number)));

CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_furniture(
  p_branch_id uuid,
  p_objects jsonb,
  p_delete_ids uuid[] DEFAULT '{}'::uuid[],
  p_reason text DEFAULT 'floor_plan_furniture_save'
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
  v_kind text;
  v_v2_type text;
  v_expected_kind text;
  v_layout jsonb;
  v_x numeric;
  v_y numeric;
  v_width numeric;
  v_height numeric;
  v_rotation numeric;
  v_z_index integer;
  v_delete_id uuid;
  v_id_map jsonb := '{}'::jsonb;
  v_previous jsonb := '[]'::jsonb;
  v_next jsonb := '[]'::jsonb;
  v_saved_count integer := 0;
  v_deleted_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Branch id is required'; END IF;
  IF p_objects IS NULL OR jsonb_typeof(p_objects) <> 'array' THEN
    RAISE EXCEPTION 'Furniture must be an explicit JSON array';
  END IF;
  IF jsonb_array_length(p_objects) > 250
    OR COALESCE(array_length(p_delete_ids, 1), 0) > 250 THEN
    RAISE EXCEPTION 'Too many furniture objects';
  END IF;

  SELECT rb.id, rb.restaurant_id INTO v_branch
  FROM public.restaurant_branches rb
  WHERE rb.id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF NOT public.auth_can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Not allowed to update this floor plan';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_template:' || p_branch_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_objects) item
    GROUP BY btrim(item->>'client_id')
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Duplicate furniture identifier'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_objects) item
    GROUP BY lower(btrim(item->>'table_number'))
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Furniture names must be unique'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_objects) item
    WHERE NULLIF(btrim(COALESCE(item->>'id', '')), '') IS NOT NULL
    GROUP BY btrim(item->>'id')
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Duplicate persisted furniture identifier'; END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_delete_ids, '{}'::uuid[])) id
    GROUP BY id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Duplicate furniture deletion identifier'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_objects) item
    WHERE NULLIF(btrim(COALESCE(item->>'id', '')), '')::uuid
      = ANY(COALESCE(p_delete_ids, '{}'::uuid[]))
  ) THEN RAISE EXCEPTION 'Furniture cannot be updated and deleted together'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(rt) ORDER BY rt.table_number), '[]'::jsonb)
  INTO v_previous
  FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id
    AND COALESCE(rt.layout->>'kind', 'table') <> 'table';

  -- Validate every destructive effect before changing data.
  FOREACH v_delete_id IN ARRAY COALESCE(p_delete_ids, '{}'::uuid[])
  LOOP
    SELECT rt.id, rt.table_number, rt.branch_id, rt.layout INTO v_existing
    FROM public.reservation_tables rt
    WHERE rt.id = v_delete_id
      AND rt.branch_id = p_branch_id
      AND COALESCE(rt.layout->>'kind', 'table') <> 'table'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Furniture to delete does not belong to this branch'; END IF;
    IF EXISTS (SELECT 1 FROM public.reservation_slots rs WHERE rs.table_id = v_delete_id) THEN
      RAISE EXCEPTION 'Remove assignments from % before deleting it', v_existing.table_number;
    END IF;
  END LOOP;

  -- Validate all upserts before changing data.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_objects)
  LOOP
    v_client_id := btrim(COALESCE(v_item->>'client_id', ''));
    v_id_text := NULLIF(btrim(COALESCE(v_item->>'id', '')), '');
    v_name := btrim(COALESCE(v_item->>'table_number', ''));
    v_zone := btrim(COALESCE(v_item->>'sector', ''));
    v_layout := v_item->'layout';

    IF v_client_id = '' OR length(v_client_id) > 100 THEN RAISE EXCEPTION 'Invalid furniture identifier'; END IF;
    IF v_name = '' OR length(v_name) > 40 THEN RAISE EXCEPTION 'Furniture name must contain between 1 and 40 characters'; END IF;
    IF v_zone = '' OR length(v_zone) > 60 THEN RAISE EXCEPTION 'Furniture sector must contain between 1 and 60 characters'; END IF;
    IF jsonb_typeof(v_layout) <> 'object' THEN RAISE EXCEPTION 'Invalid furniture layout for %', v_name; END IF;

    v_kind := COALESCE(v_layout->>'kind', '');
    v_v2_type := COALESCE(v_layout->>'v2_object_type', '');
    v_expected_kind := CASE
      WHEN v_v2_type IN ('wall', 'door', 'window', 'divider') THEN 'divider'
      WHEN v_v2_type = 'bar' THEN 'bar'
      WHEN v_v2_type = 'plant' THEN 'plant'
      WHEN v_v2_type IN ('service_station', 'buffet') THEN 'service-station'
      WHEN v_v2_type = 'host_stand' THEN 'host-stand'
      WHEN v_v2_type = 'sofa' THEN 'banquette'
      ELSE NULL
    END;
    IF v_expected_kind IS NULL OR v_kind <> v_expected_kind THEN
      RAISE EXCEPTION 'Invalid furniture type mapping for %', v_name;
    END IF;

    IF COALESCE(v_layout->>'x', '') !~ '^-?[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_layout->>'y', '') !~ '^-?[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_layout->>'w', '') !~ '^[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_layout->>'h', '') !~ '^[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_layout->>'rotation', '0') !~ '^-?[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_layout->>'v2_z_index', '') !~ '^-?[0-9]+$'
      OR COALESCE(jsonb_typeof(v_layout->'v2_locked'), '') <> 'boolean' THEN
      RAISE EXCEPTION 'Invalid furniture geometry for %', v_name;
    END IF;

    v_x := (v_layout->>'x')::numeric;
    v_y := (v_layout->>'y')::numeric;
    v_width := (v_layout->>'w')::numeric;
    v_height := (v_layout->>'h')::numeric;
    v_rotation := (v_layout->>'rotation')::numeric;
    v_z_index := (v_layout->>'v2_z_index')::integer;
    IF v_x < 0 OR v_y < 0
      OR v_width < 24 OR v_width > 520
      OR v_height < 16 OR v_height > 360
      OR v_x + v_width > 1040 OR v_y + v_height > 760
      OR v_rotation < -3600 OR v_rotation > 3600
      OR v_z_index < -100 OR v_z_index > 100 THEN
      RAISE EXCEPTION 'Furniture geometry is out of bounds for %', v_name;
    END IF;

    v_id := NULL;
    IF v_id_text IS NOT NULL THEN
      BEGIN
        v_id := v_id_text::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid persisted furniture identifier';
      END;
      SELECT rt.id, rt.branch_id, rt.layout INTO v_existing
      FROM public.reservation_tables rt
      WHERE rt.id = v_id
        AND rt.branch_id = p_branch_id
        AND COALESCE(rt.layout->>'kind', 'table') <> 'table'
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Furniture does not belong to this branch'; END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.reservation_tables rt
      WHERE rt.branch_id = p_branch_id
        AND lower(btrim(rt.table_number)) = lower(v_name)
        AND (v_id IS NULL OR rt.id <> v_id)
        AND NOT (rt.id = ANY(COALESCE(p_delete_ids, '{}'::uuid[])))
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_objects) requested
          WHERE NULLIF(btrim(COALESCE(requested->>'id', '')), '') = rt.id::text
        )
    ) THEN RAISE EXCEPTION 'An item named % already exists in this branch', v_name; END IF;
  END LOOP;

  IF COALESCE(array_length(p_delete_ids, 1), 0) > 0 THEN
    DELETE FROM public.reservation_tables rt
    WHERE rt.branch_id = p_branch_id
      AND rt.id = ANY(p_delete_ids)
      AND COALESCE(rt.layout->>'kind', 'table') <> 'table';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_objects)
  LOOP
    v_client_id := btrim(v_item->>'client_id');
    v_id_text := NULLIF(btrim(COALESCE(v_item->>'id', '')), '');
    v_name := btrim(v_item->>'table_number');
    v_zone := btrim(v_item->>'sector');
    v_layout := v_item->'layout';
    v_id := NULL;
    IF v_id_text IS NOT NULL THEN v_id := v_id_text::uuid; END IF;

    IF v_id IS NULL THEN
      INSERT INTO public.reservation_tables (
        branch_id, table_number, capacity, is_active, sector, layout
      ) VALUES (
        p_branch_id, v_name, 0, true, v_zone, v_layout
      ) RETURNING id INTO v_id;
    ELSE
      UPDATE public.reservation_tables
      SET table_number = v_name,
          capacity = 0,
          is_active = true,
          sector = v_zone,
          layout = v_layout
      WHERE id = v_id AND branch_id = p_branch_id;
    END IF;

    v_id_map := v_id_map || jsonb_build_object(v_client_id, v_id::text);
    v_saved_count := v_saved_count + 1;
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(rt) ORDER BY rt.table_number), '[]'::jsonb)
  INTO v_next
  FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id
    AND COALESCE(rt.layout->>'kind', 'table') <> 'table';

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_save_floor_plan_furniture',
    'restaurant_branch',
    p_branch_id,
    jsonb_build_object('furniture', v_previous),
    jsonb_build_object(
      'furniture', v_next,
      'deleted_ids', to_jsonb(COALESCE(p_delete_ids, '{}'::uuid[])),
      'saved_count', v_saved_count,
      'reason', btrim(COALESCE(p_reason, ''))
    )
  );

  RETURN jsonb_build_object(
    'saved_count', v_saved_count,
    'deleted_count', v_deleted_count,
    'id_map', v_id_map
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_workspace(
  p_branch_id uuid,
  p_table_upserts jsonb,
  p_table_delete_ids uuid[],
  p_objects jsonb,
  p_object_delete_ids uuid[] DEFAULT '{}'::uuid[],
  p_reason text DEFAULT 'floor_plan_workspace_save'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tables jsonb;
  v_deleted_furniture jsonb;
  v_furniture jsonb;
BEGIN
  IF p_table_upserts IS NULL OR jsonb_typeof(p_table_upserts) <> 'array'
    OR p_objects IS NULL OR jsonb_typeof(p_objects) <> 'array' THEN
    RAISE EXCEPTION 'Tables and furniture must be explicit JSON arrays';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT btrim(item->>'client_id') AS client_id FROM jsonb_array_elements(p_table_upserts) item
      UNION ALL
      SELECT btrim(item->>'client_id') AS client_id FROM jsonb_array_elements(p_objects) item
    ) requested
    GROUP BY client_id
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Duplicate floor plan client identifier'; END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT lower(btrim(item->>'table_number')) AS item_name FROM jsonb_array_elements(p_table_upserts) item
      UNION ALL
      SELECT lower(btrim(item->>'table_number')) AS item_name FROM jsonb_array_elements(p_objects) item
    ) requested
    GROUP BY item_name
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Floor plan item names must be unique'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_table_upserts) table_item
    JOIN jsonb_array_elements(p_objects) object_item
      ON NULLIF(btrim(COALESCE(table_item->>'id', '')), '')
       = NULLIF(btrim(COALESCE(object_item->>'id', '')), '')
    WHERE NULLIF(btrim(COALESCE(table_item->>'id', '')), '') IS NOT NULL
  ) THEN RAISE EXCEPTION 'A persisted item cannot be both a table and furniture'; END IF;

  -- Delete furniture first so a table may safely reuse its former name.
  v_deleted_furniture := public.restaurant_save_floor_plan_furniture(
    p_branch_id,
    '[]'::jsonb,
    COALESCE(p_object_delete_ids, '{}'::uuid[]),
    p_reason
  );

  v_tables := public.restaurant_save_floor_plan_template(
    p_branch_id,
    p_table_upserts,
    COALESCE(p_table_delete_ids, '{}'::uuid[]),
    p_reason
  );

  -- Tables are deleted before furniture upserts so furniture may reuse a former table name.
  v_furniture := public.restaurant_save_floor_plan_furniture(
    p_branch_id,
    p_objects,
    '{}'::uuid[],
    p_reason
  );

  RETURN jsonb_build_object(
    'upserted_count', COALESCE((v_tables->>'upserted_count')::integer, 0),
    'deleted_count', COALESCE((v_tables->>'deleted_count')::integer, 0),
    'furniture_count', COALESCE((v_furniture->>'saved_count')::integer, 0),
    'furniture_deleted_count', COALESCE((v_deleted_furniture->>'deleted_count')::integer, 0),
    'id_map', COALESCE(v_tables->'id_map', '{}'::jsonb) || COALESCE(v_furniture->'id_map', '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_furniture(uuid, jsonb, uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_workspace(uuid, jsonb, uuid[], jsonb, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_furniture(uuid, jsonb, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_workspace(uuid, jsonb, uuid[], jsonb, uuid[], text) TO authenticated;

NOTIFY pgrst, 'reload schema';
