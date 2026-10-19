-- One transaction for the full editor and today's service. Existing RPCs stay
-- unchanged for older clients. Production activation is a separate release step.

CREATE OR REPLACE FUNCTION private.floor_plan_workspace_snapshot_v3(
  p_branch_id uuid, p_mode text, p_service_date date, p_reservation_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'table_number', t.table_number, 'capacity', t.capacity,
        'is_active', t.is_active, 'sector', t.sector, 'layout', t.layout
      ) ORDER BY t.id)
      FROM public.reservation_tables t WHERE t.branch_id = p_branch_id
    ), '[]'::jsonb),
    'overrides', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'reservation_table_id', o.reservation_table_id, 'layout', o.layout
      ) ORDER BY o.reservation_table_id)
      FROM public.reservation_table_layout_overrides o
      WHERE p_mode = 'service' AND o.branch_id = p_branch_id AND o.service_date = p_service_date
    ), '[]'::jsonb),
    'slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'reservation_id', s.reservation_id, 'table_id', s.table_id
      ) ORDER BY s.reservation_id, s.table_id)
      FROM public.reservation_slots s
      WHERE s.reservation_id = ANY(p_reservation_ids)
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION private.floor_plan_validate_layout_v3(p_layout jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  IF jsonb_typeof(p_layout) IS DISTINCT FROM 'object' OR octet_length(p_layout::text) > 65536 THEN
    RAISE EXCEPTION 'Invalid floor plan geometry';
  END IF;
  -- Do not impose the old v2 furniture mappings, fixed canvas or 30-seat cap.
  -- All supported editor kinds and extension properties remain intact.
  FOREACH v_key IN ARRAY ARRAY['x', 'y', 'w', 'h', 'rotation'] LOOP
    IF jsonb_typeof(p_layout->v_key) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid floor plan geometry field: %', v_key;
    END IF;
    IF abs((p_layout->>v_key)::numeric) > 1000000 THEN
      RAISE EXCEPTION 'Floor plan geometry is out of bounds';
    END IF;
  END LOOP;
  IF (p_layout->>'w')::numeric <= 0 OR (p_layout->>'h')::numeric <= 0
    OR jsonb_typeof(p_layout->'kind') IS DISTINCT FROM 'string'
    OR p_layout->>'kind' NOT IN (
      'table', 'chair', 'stool', 'bar', 'corner-bench', 'banquette', 'booth',
      'host-stand', 'divider', 'plant', 'service-station', 'sofa', 'dancefloor',
      'dj-booth', 'stage', 'buffet', 'cake-table'
    )
    OR jsonb_typeof(p_layout->'shape') IS DISTINCT FROM 'string'
    OR p_layout->>'shape' NOT IN ('round', 'rect') THEN
    RAISE EXCEPTION 'Invalid floor plan item geometry';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_workspace_v3(
  p_branch_id uuid,
  p_mode text,
  p_service_date date,
  p_expected_snapshot jsonb,
  p_request_id text,
  p_upserts jsonb DEFAULT '[]'::jsonb,
  p_delete_ids uuid[] DEFAULT '{}'::uuid[],
  p_layouts jsonb DEFAULT '[]'::jsonb,
  p_assignments jsonb DEFAULT '{}'::jsonb,
  p_reason text DEFAULT 'floor_plan_workspace_v3_save'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_restaurant_id uuid;
  v_request_id text := btrim(COALESCE(p_request_id, ''));
  v_operation_kind text;
  v_payload jsonb;
  v_previous_payload jsonb;
  v_response jsonb;
  v_snapshot jsonb;
  v_reservation_ids uuid[];
  v_item jsonb;
  v_assignment record;
  v_reservation record;
  v_table record;
  v_id uuid;
  v_client_id text;
  v_target text;
  v_capacity integer;
  v_id_map jsonb := '{}'::jsonb;
  v_assignments jsonb := '{}'::jsonb;
  v_layout jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF public.commercial_demo_current_user_is_restricted() THEN
    RAISE EXCEPTION 'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NULL OR p_service_date IS NULL OR p_mode IS NULL OR p_mode NOT IN ('template', 'service') THEN
    RAISE EXCEPTION 'Branch, service date and floor plan mode are required';
  END IF;
  IF v_request_id = '' OR length(v_request_id) > 100 THEN RAISE EXCEPTION 'Invalid floor plan request id'; END IF;
  IF jsonb_typeof(p_expected_snapshot) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_expected_snapshot->'tables') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_expected_snapshot->'overrides') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_expected_snapshot->'slots') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_upserts) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_layouts) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_assignments) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Explicit floor plan snapshot and changes are required';
  END IF;
  IF jsonb_array_length(p_upserts) > 500 OR jsonb_array_length(p_layouts) > 500
    OR COALESCE(array_length(p_delete_ids, 1), 0) > 500
    OR (SELECT count(*) FROM jsonb_object_keys(p_assignments)) > 500
    OR octet_length(p_expected_snapshot::text) + octet_length(p_upserts::text) + octet_length(p_layouts::text) + octet_length(p_assignments::text) > 8388608
    OR array_position(p_delete_ids, NULL) IS NOT NULL
    OR length(COALESCE(p_reason, '')) > 500 THEN
    RAISE EXCEPTION 'Too many floor plan changes';
  END IF;
  IF p_mode = 'service' AND (p_upserts <> '[]'::jsonb OR COALESCE(array_length(p_delete_ids, 1), 0) > 0) THEN
    RAISE EXCEPTION 'Service mode cannot change the room inventory';
  END IF;
  IF p_mode = 'template' AND p_layouts <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Template mode cannot change a daily layout';
  END IF;

  SELECT b.restaurant_id INTO v_restaurant_id
  FROM public.restaurant_branches b WHERE b.id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF public.auth_can_access_branch(p_branch_id) IS NOT TRUE THEN RAISE EXCEPTION 'Not allowed to update this floor plan'; END IF;

  -- Compatible lock order with the existing assignment and v2 editor writers.
  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_template:' || p_branch_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_assignments:' || p_branch_id::text, 0));
  PERFORM t.id FROM public.reservation_tables t WHERE t.branch_id = p_branch_id ORDER BY t.id FOR UPDATE;
  PERFORM o.id FROM public.reservation_table_layout_overrides o
  WHERE o.branch_id = p_branch_id AND o.service_date = p_service_date ORDER BY o.reservation_table_id FOR UPDATE;

  v_operation_kind := 'workspace-v3:' || p_mode || ':' || p_service_date::text;
  v_payload := jsonb_build_object(
    'mode', p_mode, 'service_date', p_service_date, 'expected_snapshot', p_expected_snapshot,
    'upserts', p_upserts, 'delete_ids', to_jsonb(COALESCE(p_delete_ids, '{}'::uuid[])),
    'layouts', p_layouts, 'assignments', p_assignments, 'reason', btrim(COALESCE(p_reason, ''))
  );
  SELECT op.request_payload, op.response INTO v_previous_payload, v_response
  FROM private.floor_plan_save_operations op
  WHERE op.actor_id = v_actor AND op.branch_id = p_branch_id
    AND op.operation_kind = v_operation_kind AND op.request_id = v_request_id;
  IF FOUND THEN
    IF v_previous_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'FLOOR_PLAN_REQUEST_ID_REUSED: request id belongs to another payload';
    END IF;
    RETURN v_response || jsonb_build_object('replayed', true);
  END IF;

  SELECT COALESCE(array_agg(key::uuid ORDER BY key::uuid), '{}'::uuid[])
  INTO v_reservation_ids FROM jsonb_each(p_assignments);
  PERFORM r.id FROM public.reservations r WHERE r.id = ANY(v_reservation_ids) ORDER BY r.id FOR UPDATE;
  FOR v_assignment IN SELECT key, value FROM jsonb_each(p_assignments) LOOP
    SELECT r.id, r.restaurant_id, r.branch_id, r.date, r.status INTO v_reservation
    FROM public.reservations r WHERE r.id = v_assignment.key::uuid;
    IF NOT FOUND OR v_reservation.restaurant_id IS DISTINCT FROM v_restaurant_id
      OR (v_reservation.branch_id IS NOT NULL AND v_reservation.branch_id <> p_branch_id)
      OR v_reservation.date IS DISTINCT FROM p_service_date THEN
      RAISE EXCEPTION 'Reservation does not belong to this service';
    END IF;
    IF jsonb_typeof(v_assignment.value) NOT IN ('null', 'string') THEN RAISE EXCEPTION 'Invalid table assignment'; END IF;
    IF jsonb_typeof(v_assignment.value) <> 'null'
      AND replace(lower(btrim(COALESCE(v_reservation.status, ''))), '-', '_') IN ('cancelled', 'canceled', 'no_show', 'completed', 'archived', 'expired', 'declined') THEN
      RAISE EXCEPTION 'FLOOR_PLAN_RESERVATION_INACTIVE: reservation is not active';
    END IF;
  END LOOP;

  v_snapshot := private.floor_plan_workspace_snapshot_v3(p_branch_id, p_mode, p_service_date, v_reservation_ids);
  IF v_snapshot IS DISTINCT FROM p_expected_snapshot THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_CONFLICT: floor plan or assignment changed since it was loaded';
  END IF;

  -- Validate the entire proposed inventory before changing any of its rows.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_upserts) item GROUP BY btrim(item->>'client_id') HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_upserts) item WHERE NULLIF(item->>'id', '') IS NOT NULL GROUP BY item->>'id' HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_upserts) item GROUP BY lower(btrim(item->>'table_number')) HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM unnest(COALESCE(p_delete_ids, '{}'::uuid[])) id GROUP BY id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate floor plan item identifier or name';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_upserts) LOOP
    v_client_id := btrim(COALESCE(v_item->>'client_id', ''));
    IF v_client_id = '' OR length(v_client_id) > 100
      OR length(btrim(COALESCE(v_item->>'table_number', ''))) NOT BETWEEN 1 AND 40
      OR length(btrim(COALESCE(v_item->>'sector', ''))) NOT BETWEEN 1 AND 60
      OR jsonb_typeof(v_item->'is_active') IS DISTINCT FROM 'boolean'
      OR COALESCE(v_item->>'capacity', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Invalid floor plan item';
    END IF;
    v_capacity := (v_item->>'capacity')::integer;
    v_layout := v_item->'layout';
    PERFORM private.floor_plan_validate_layout_v3(v_layout);
    IF (v_layout->>'kind' = 'table' AND v_capacity NOT BETWEEN 1 AND 1000)
      OR (v_layout->>'kind' <> 'table' AND v_capacity <> 0) THEN
      RAISE EXCEPTION 'Invalid floor plan item capacity';
    END IF;
    v_id := NULLIF(v_item->>'id', '')::uuid;
    IF v_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.reservation_tables t WHERE t.id = v_id AND t.branch_id = p_branch_id)
        OR v_id = ANY(COALESCE(p_delete_ids, '{}'::uuid[])) THEN
        RAISE EXCEPTION 'Floor plan item does not belong to this branch or is also deleted';
      END IF;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.reservation_tables t
      WHERE t.branch_id = p_branch_id AND lower(btrim(t.table_number)) = lower(btrim(v_item->>'table_number'))
        AND NOT (t.id = ANY(COALESCE(p_delete_ids, '{}'::uuid[])))
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_upserts) other WHERE NULLIF(other->>'id', '')::uuid = t.id)
    ) THEN RAISE EXCEPTION 'A floor plan item with this name already exists'; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_delete_ids, '{}'::uuid[])) requested(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.reservation_tables t WHERE t.id = requested.id AND t.branch_id = p_branch_id)
  ) THEN RAISE EXCEPTION 'Floor plan item to delete does not belong to this branch'; END IF;

  -- Temporary names permit atomic swaps and reuse of names of deleted items
  -- while the case-insensitive unique index remains enforced throughout.
  UPDATE public.reservation_tables t SET table_number = '__tok_floorplan_' || t.id::text
  WHERE t.branch_id = p_branch_id AND (
    t.id = ANY(COALESCE(p_delete_ids, '{}'::uuid[])) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_upserts) item
      WHERE NULLIF(item->>'id', '')::uuid = t.id AND btrim(item->>'table_number') <> t.table_number
    )
  );
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_upserts) LOOP
    v_id := NULLIF(v_item->>'id', '')::uuid;
    IF v_id IS NULL THEN
      INSERT INTO public.reservation_tables(branch_id, table_number, capacity, is_active, sector, layout)
      VALUES(p_branch_id, btrim(v_item->>'table_number'), (v_item->>'capacity')::integer,
        (v_item->>'is_active')::boolean, btrim(v_item->>'sector'), v_item->'layout') RETURNING id INTO v_id;
    ELSE
      UPDATE public.reservation_tables SET table_number = btrim(v_item->>'table_number'),
        capacity = (v_item->>'capacity')::integer, is_active = (v_item->>'is_active')::boolean,
        sector = btrim(v_item->>'sector'), layout = v_item->'layout'
      WHERE id = v_id AND branch_id = p_branch_id;
    END IF;
    v_id_map := v_id_map || jsonb_build_object(btrim(v_item->>'client_id'), v_id);
  END LOOP;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_layouts) item GROUP BY item->>'table_id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate daily floor plan layout';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_layouts) LOOP
    v_id := (v_item->>'table_id')::uuid;
    SELECT t.layout INTO v_table FROM public.reservation_tables t WHERE t.id = v_id AND t.branch_id = p_branch_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Daily layout item does not belong to this branch'; END IF;
    v_layout := v_item->'layout';
    IF jsonb_typeof(v_layout) = 'null' THEN
      DELETE FROM public.reservation_table_layout_overrides
      WHERE branch_id = p_branch_id AND reservation_table_id = v_id AND service_date = p_service_date;
    ELSE
      PERFORM private.floor_plan_validate_layout_v3(v_layout);
      IF v_layout->>'kind' IS DISTINCT FROM COALESCE(v_table.layout->>'kind', 'table') THEN
        RAISE EXCEPTION 'Service mode cannot change an item type';
      END IF;
      INSERT INTO public.reservation_table_layout_overrides(reservation_table_id, branch_id, service_date, layout, updated_at)
      VALUES(v_id, p_branch_id, p_service_date, v_layout, now())
      ON CONFLICT(reservation_table_id, service_date) DO UPDATE SET layout = EXCLUDED.layout, updated_at = now();
    END IF;
  END LOOP;

  FOR v_assignment IN SELECT key, value FROM jsonb_each(p_assignments) LOOP
    IF jsonb_typeof(v_assignment.value) = 'null' THEN
      v_assignments := v_assignments || jsonb_build_object(v_assignment.key, NULL);
      CONTINUE;
    END IF;
    v_target := v_assignment.value #>> '{}';
    v_id := COALESCE(v_id_map->>v_target, v_target)::uuid;
    IF v_id = ANY(COALESCE(p_delete_ids, '{}'::uuid[])) OR NOT EXISTS (
      SELECT 1 FROM public.reservation_tables t
      WHERE t.id = v_id AND t.branch_id = p_branch_id AND COALESCE(t.layout->>'kind', 'table') = 'table'
    ) THEN RAISE EXCEPTION 'Assignment requires a reservable table in this branch'; END IF;
    v_assignments := v_assignments || jsonb_build_object(v_assignment.key, v_id);
  END LOOP;

  -- The proven reservation writer owns capacity, ownership, branch and duration
  -- rules. Any later validation failure also rolls this call and its audit back.
  IF v_assignments <> '{}'::jsonb THEN
    PERFORM public.restaurant_save_floor_plan_assignments(p_branch_id, v_assignments, p_reason);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservation_slots s
    WHERE s.table_id = ANY(COALESCE(p_delete_ids, '{}'::uuid[]))
  ) OR EXISTS (
    SELECT 1 FROM public.reservation_slots s
    JOIN public.reservation_tables t ON t.id = s.table_id
    JOIN public.reservations r ON r.id = s.reservation_id
    WHERE t.branch_id = p_branch_id AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_upserts) item WHERE item->>'id' = t.id::text)
      AND replace(lower(btrim(COALESCE(r.status, ''))), '-', '_') NOT IN ('cancelled', 'canceled', 'no_show', 'completed', 'archived', 'expired', 'declined')
      AND (COALESCE(t.is_active, true) IS NOT TRUE OR COALESCE(t.layout->>'kind', 'table') <> 'table' OR t.capacity < r.party_size)
  ) THEN RAISE EXCEPTION 'FLOOR_PLAN_TABLE_IN_USE: move incompatible reservations before changing this table'; END IF;

  -- Keep a final-state guard for services crossing midnight regardless of the
  -- assignment writer version. Half-open intervals allow arrival at departure.
  IF EXISTS (
    SELECT 1 FROM public.reservation_slots a
    JOIN public.reservations ra ON ra.id = a.reservation_id
    JOIN public.reservation_slots b ON b.table_id = a.table_id AND b.reservation_id <> a.reservation_id
    JOIN public.reservations rb ON rb.id = b.reservation_id
    WHERE a.reservation_id = ANY(v_reservation_ids)
      AND replace(lower(btrim(COALESCE(ra.status, ''))), '-', '_') NOT IN ('cancelled', 'canceled', 'no_show', 'completed', 'archived', 'expired', 'declined')
      AND replace(lower(btrim(COALESCE(rb.status, ''))), '-', '_') NOT IN ('cancelled', 'canceled', 'no_show', 'completed', 'archived', 'expired', 'declined')
      AND (ra.date + ra.time::time) < (rb.date + rb.time::time) + make_interval(mins => CASE
        WHEN COALESCE(rb.metadata->>'duration_minutes', rb.metadata->>'durationMinutes', '') ~ '^[0-9]+$'
          THEN GREATEST(30, COALESCE(rb.metadata->>'duration_minutes', rb.metadata->>'durationMinutes')::integer) ELSE 120 END)
      AND (rb.date + rb.time::time) < (ra.date + ra.time::time) + make_interval(mins => CASE
        WHEN COALESCE(ra.metadata->>'duration_minutes', ra.metadata->>'durationMinutes', '') ~ '^[0-9]+$'
          THEN GREATEST(30, COALESCE(ra.metadata->>'duration_minutes', ra.metadata->>'durationMinutes')::integer) ELSE 120 END)
  ) THEN RAISE EXCEPTION 'FLOOR_PLAN_TABLE_OCCUPIED: table already occupied during this service'; END IF;

  DELETE FROM public.reservation_tables t WHERE t.branch_id = p_branch_id AND t.id = ANY(COALESCE(p_delete_ids, '{}'::uuid[]));
  v_response := jsonb_build_object(
    'id_map', v_id_map, 'assignments', v_assignments,
    'snapshot', private.floor_plan_workspace_snapshot_v3(p_branch_id, p_mode, p_service_date, v_reservation_ids),
    'request_id', v_request_id, 'replayed', false
  );
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES(v_actor, 'restaurant_save_floor_plan_workspace_v3', 'restaurant_branch', p_branch_id,
    v_snapshot, jsonb_build_object('mode', p_mode, 'service_date', p_service_date,
      'request_id', v_request_id, 'reason', btrim(COALESCE(p_reason, '')), 'snapshot', v_response->'snapshot'));
  INSERT INTO private.floor_plan_save_operations(actor_id, branch_id, operation_kind, request_id, request_payload, response)
  VALUES(v_actor, p_branch_id, v_operation_kind, v_request_id, v_payload, v_response);
  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION private.floor_plan_workspace_snapshot_v3(uuid, text, date, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.floor_plan_validate_layout_v3(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_workspace_v3(uuid, text, date, jsonb, text, jsonb, uuid[], jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_workspace_v3(uuid, text, date, jsonb, text, jsonb, uuid[], jsonb, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
