-- Extend Plan de salle 2 with persistent furniture while keeping the V1/V2 shared model.
CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_furniture(
  p_branch_id uuid,
  p_objects jsonb,
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
  v_layout jsonb;
  v_width numeric;
  v_height numeric;
  v_rotation numeric;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id_map jsonb := '{}'::jsonb;
  v_previous jsonb := '[]'::jsonb;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Branch id is required'; END IF;
  IF jsonb_typeof(COALESCE(p_objects, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Furniture must be a JSON array';
  END IF;
  IF jsonb_array_length(COALESCE(p_objects, '[]'::jsonb)) > 250 THEN
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
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_objects, '[]'::jsonb)) item
    GROUP BY btrim(item->>'client_id')
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Duplicate furniture identifier'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(rt) ORDER BY rt.table_number), '[]'::jsonb)
  INTO v_previous
  FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id
    AND COALESCE(rt.layout->>'kind', 'table') <> 'table';

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_objects, '[]'::jsonb))
  LOOP
    v_client_id := btrim(COALESCE(v_item->>'client_id', ''));
    v_id_text := NULLIF(btrim(COALESCE(v_item->>'id', '')), '');
    v_name := left(btrim(COALESCE(v_item->>'table_number', '')), 40);
    v_zone := left(btrim(COALESCE(v_item->>'sector', '')), 60);
    v_layout := v_item->'layout';
    v_kind := COALESCE(v_layout->>'kind', '');
    v_v2_type := COALESCE(v_layout->>'v2_object_type', '');

    IF v_client_id = '' OR length(v_client_id) > 100 THEN RAISE EXCEPTION 'Invalid furniture identifier'; END IF;
    IF v_name = '' OR v_zone = '' THEN RAISE EXCEPTION 'Furniture name and sector are required'; END IF;
    IF jsonb_typeof(v_layout) <> 'object' THEN RAISE EXCEPTION 'Invalid furniture layout for %', v_name; END IF;
    IF v_kind NOT IN ('bar', 'divider', 'plant', 'service-station', 'host-stand', 'banquette') THEN
      RAISE EXCEPTION 'Invalid furniture kind for %', v_name;
    END IF;
    IF v_v2_type NOT IN (
      'wall', 'door', 'window', 'bar', 'plant', 'service_station',
      'host_stand', 'buffet', 'sofa', 'divider'
    ) THEN RAISE EXCEPTION 'Invalid Plan de salle 2 object type for %', v_name; END IF;
    IF COALESCE(v_layout->>'x', '') !~ '^-?[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_layout->>'y', '') !~ '^-?[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_layout->>'w', '') !~ '^[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_layout->>'h', '') !~ '^[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_layout->>'rotation', '0') !~ '^-?[0-9]+([.][0-9]+)?$' THEN
      RAISE EXCEPTION 'Invalid furniture geometry for %', v_name;
    END IF;
    v_width := (v_layout->>'w')::numeric;
    v_height := (v_layout->>'h')::numeric;
    v_rotation := (v_layout->>'rotation')::numeric;
    IF (v_layout->>'x')::numeric < 0 OR (v_layout->>'x')::numeric > 1040
      OR (v_layout->>'y')::numeric < 0 OR (v_layout->>'y')::numeric > 760
      OR v_width < 24 OR v_width > 520 OR v_height < 16 OR v_height > 360
      OR v_rotation < -3600 OR v_rotation > 3600 THEN
      RAISE EXCEPTION 'Furniture geometry is out of bounds for %', v_name;
    END IF;

    v_id := NULL;
    IF v_id_text IS NOT NULL THEN
      BEGIN v_id := v_id_text::uuid;
      EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid persisted furniture identifier';
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
        AND NOT (rt.id = ANY(v_ids))
    ) THEN RAISE EXCEPTION 'An item named % already exists in this branch', v_name; END IF;

    IF v_id IS NULL THEN
      INSERT INTO public.reservation_tables (
        branch_id, table_number, capacity, is_active, sector, layout
      ) VALUES (
        p_branch_id, v_name, 0, false, v_zone, v_layout
      ) RETURNING id INTO v_id;
    ELSE
      UPDATE public.reservation_tables
      SET table_number = v_name,
          capacity = 0,
          is_active = false,
          sector = v_zone,
          layout = v_layout
      WHERE id = v_id AND branch_id = p_branch_id;
    END IF;

    v_ids := array_append(v_ids, v_id);
    v_id_map := v_id_map || jsonb_build_object(v_client_id, v_id);
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id
    AND COALESCE(rt.layout->>'kind', 'table') <> 'table'
    AND NOT (rt.id = ANY(v_ids));

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_save_floor_plan_furniture',
    'restaurant_branch',
    p_branch_id,
    jsonb_build_object('furniture', v_previous),
    jsonb_build_object(
      'furniture', COALESCE(p_objects, '[]'::jsonb),
      'saved_count', v_count,
      'reason', btrim(COALESCE(p_reason, ''))
    )
  );

  RETURN jsonb_build_object('saved_count', v_count, 'id_map', v_id_map);
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_workspace(
  p_branch_id uuid,
  p_table_upserts jsonb,
  p_table_delete_ids uuid[],
  p_objects jsonb,
  p_reason text DEFAULT 'floor_plan_workspace_save'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tables jsonb;
  v_furniture jsonb;
BEGIN
  v_tables := public.restaurant_save_floor_plan_template(
    p_branch_id,
    COALESCE(p_table_upserts, '[]'::jsonb),
    COALESCE(p_table_delete_ids, ARRAY[]::uuid[]),
    p_reason
  );
  v_furniture := public.restaurant_save_floor_plan_furniture(
    p_branch_id,
    COALESCE(p_objects, '[]'::jsonb),
    p_reason
  );
  RETURN jsonb_build_object(
    'upserted_count', COALESCE((v_tables->>'upserted_count')::integer, 0),
    'deleted_count', COALESCE((v_tables->>'deleted_count')::integer, 0),
    'furniture_count', COALESCE((v_furniture->>'saved_count')::integer, 0),
    'id_map', COALESCE(v_tables->'id_map', '{}'::jsonb) || COALESCE(v_furniture->'id_map', '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_furniture(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_workspace(uuid, jsonb, uuid[], jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_furniture(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_workspace(uuid, jsonb, uuid[], jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
