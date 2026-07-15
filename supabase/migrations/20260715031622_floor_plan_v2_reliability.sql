-- Make Plan de salle 2 saves replay-safe and reject stale editor snapshots.
-- The public RPCs remain the only exposed entry points; replay records stay in
-- a non-exposed schema and are only accessed by SECURITY DEFINER functions.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.floor_plan_save_operations (
  actor_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  operation_kind text NOT NULL,
  request_id text NOT NULL,
  request_payload jsonb NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT floor_plan_save_operations_pkey
    PRIMARY KEY (actor_id, branch_id, operation_kind, request_id),
  CONSTRAINT floor_plan_save_operations_kind_check
    CHECK (operation_kind <> '' AND length(operation_kind) <= 64),
  CONSTRAINT floor_plan_save_operations_request_id_check
    CHECK (request_id <> '' AND length(request_id) <= 100),
  CONSTRAINT floor_plan_save_operations_request_payload_check
    CHECK (jsonb_typeof(request_payload) = 'object'),
  CONSTRAINT floor_plan_save_operations_response_check
    CHECK (jsonb_typeof(response) = 'object')
);

ALTER TABLE private.floor_plan_save_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.floor_plan_save_operations FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_floor_plan_save_operations_created_at
  ON private.floor_plan_save_operations (created_at);

CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_workspace_v2(
  p_branch_id uuid,
  p_expected_snapshot jsonb,
  p_request_id text,
  p_table_upserts jsonb,
  p_table_delete_ids uuid[],
  p_objects jsonb,
  p_object_delete_ids uuid[] DEFAULT '{}'::uuid[],
  p_reason text DEFAULT 'floor_plan_workspace_v2_save'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_request_id text := btrim(COALESCE(p_request_id, ''));
  v_operation_kind constant text := 'workspace';
  v_request_payload jsonb;
  v_existing_payload jsonb;
  v_existing_response jsonb;
  v_current_snapshot jsonb := '[]'::jsonb;
  v_next_snapshot jsonb := '[]'::jsonb;
  v_response jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch id is required';
  END IF;
  IF v_request_id = '' OR length(v_request_id) > 100 THEN
    RAISE EXCEPTION 'Invalid floor plan request id';
  END IF;
  IF p_expected_snapshot IS NULL OR jsonb_typeof(p_expected_snapshot) <> 'array' THEN
    RAISE EXCEPTION 'Expected floor plan snapshot must be an explicit JSON array';
  END IF;
  IF p_table_upserts IS NULL OR jsonb_typeof(p_table_upserts) <> 'array'
    OR p_objects IS NULL OR jsonb_typeof(p_objects) <> 'array' THEN
    RAISE EXCEPTION 'Tables and furniture must be explicit JSON arrays';
  END IF;

  v_request_payload := jsonb_build_object(
    'expected_snapshot', p_expected_snapshot,
    'table_upserts', p_table_upserts,
    'table_delete_ids', to_jsonb(COALESCE(p_table_delete_ids, '{}'::uuid[])),
    'objects', p_objects,
    'object_delete_ids', to_jsonb(COALESCE(p_object_delete_ids, '{}'::uuid[])),
    'reason', btrim(COALESCE(p_reason, ''))
  );

  -- Keep the same lock order as the existing writers: branch, advisory lock,
  -- then floor-plan rows in stable identifier order.
  PERFORM rb.id
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
  PERFORM rt.id
  FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id
  ORDER BY rt.id
  FOR UPDATE;

  DELETE FROM private.floor_plan_save_operations
  WHERE created_at < now() - interval '30 days';

  SELECT operation.request_payload, operation.response
  INTO v_existing_payload, v_existing_response
  FROM private.floor_plan_save_operations operation
  WHERE operation.actor_id = v_actor
    AND operation.branch_id = p_branch_id
    AND operation.operation_kind = v_operation_kind
    AND operation.request_id = v_request_id;

  IF FOUND THEN
    IF v_existing_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'FLOOR_PLAN_REQUEST_ID_REUSED: request id belongs to another payload';
    END IF;
    RETURN v_existing_response || jsonb_build_object('replayed', true);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', rt.id,
      'table_number', rt.table_number,
      'capacity', rt.capacity,
      'is_active', rt.is_active,
      'sector', rt.sector,
      'layout', rt.layout
    ) ORDER BY rt.id
  ), '[]'::jsonb)
  INTO v_current_snapshot
  FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id;

  IF v_current_snapshot <> p_expected_snapshot THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_CONFLICT: floor plan changed since it was loaded';
  END IF;

  v_response := public.restaurant_save_floor_plan_workspace(
    p_branch_id,
    p_table_upserts,
    COALESCE(p_table_delete_ids, '{}'::uuid[]),
    p_objects,
    COALESCE(p_object_delete_ids, '{}'::uuid[]),
    p_reason
  );

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', rt.id,
      'table_number', rt.table_number,
      'capacity', rt.capacity,
      'is_active', rt.is_active,
      'sector', rt.sector,
      'layout', rt.layout
    ) ORDER BY rt.id
  ), '[]'::jsonb)
  INTO v_next_snapshot
  FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id;

  v_response := COALESCE(v_response, '{}'::jsonb) || jsonb_build_object(
    'snapshot', v_next_snapshot,
    'request_id', v_request_id,
    'replayed', false
  );

  INSERT INTO private.floor_plan_save_operations (
    actor_id, branch_id, operation_kind, request_id, request_payload, response
  ) VALUES (
    v_actor, p_branch_id, v_operation_kind, v_request_id, v_request_payload, v_response
  );

  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_layouts_v2(
  p_branch_id uuid,
  p_expected_snapshot jsonb,
  p_request_id text,
  p_service_date date,
  p_layouts jsonb,
  p_reason text DEFAULT 'floor_plan_service_layout_v2_save'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_request_id text := btrim(COALESCE(p_request_id, ''));
  v_operation_kind text;
  v_request_payload jsonb;
  v_existing_payload jsonb;
  v_existing_response jsonb;
  v_current_snapshot jsonb := '{}'::jsonb;
  v_next_snapshot jsonb := '{}'::jsonb;
  v_table_snapshot jsonb := '[]'::jsonb;
  v_override_snapshot jsonb := '[]'::jsonb;
  v_response jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_branch_id IS NULL OR p_service_date IS NULL THEN
    RAISE EXCEPTION 'Branch id and service date are required';
  END IF;
  IF v_request_id = '' OR length(v_request_id) > 100 THEN
    RAISE EXCEPTION 'Invalid floor plan request id';
  END IF;
  IF p_expected_snapshot IS NULL OR jsonb_typeof(p_expected_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Expected service snapshot must be an explicit JSON object';
  END IF;
  IF jsonb_typeof(p_expected_snapshot->'tables') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_expected_snapshot->'overrides') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Expected service snapshot is invalid';
  END IF;
  IF p_layouts IS NULL OR jsonb_typeof(p_layouts) <> 'array' THEN
    RAISE EXCEPTION 'Layouts must be an explicit JSON array';
  END IF;

  v_operation_kind := 'service-layout:' || p_service_date::text;
  v_request_payload := jsonb_build_object(
    'expected_snapshot', p_expected_snapshot,
    'service_date', p_service_date,
    'layouts', p_layouts,
    'reason', btrim(COALESCE(p_reason, ''))
  );

  PERFORM rb.id
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
  PERFORM rt.id
  FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id
  ORDER BY rt.id
  FOR UPDATE;
  PERFORM override_row.id
  FROM public.reservation_table_layout_overrides override_row
  WHERE override_row.branch_id = p_branch_id
    AND override_row.service_date = p_service_date
  ORDER BY override_row.id
  FOR UPDATE;

  DELETE FROM private.floor_plan_save_operations
  WHERE created_at < now() - interval '30 days';

  SELECT operation.request_payload, operation.response
  INTO v_existing_payload, v_existing_response
  FROM private.floor_plan_save_operations operation
  WHERE operation.actor_id = v_actor
    AND operation.branch_id = p_branch_id
    AND operation.operation_kind = v_operation_kind
    AND operation.request_id = v_request_id;

  IF FOUND THEN
    IF v_existing_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'FLOOR_PLAN_REQUEST_ID_REUSED: request id belongs to another payload';
    END IF;
    RETURN v_existing_response || jsonb_build_object('replayed', true);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', rt.id,
      'table_number', rt.table_number,
      'capacity', rt.capacity,
      'is_active', rt.is_active,
      'sector', rt.sector,
      'layout', rt.layout
    ) ORDER BY rt.id
  ), '[]'::jsonb)
  INTO v_table_snapshot
  FROM public.reservation_tables rt
  WHERE rt.branch_id = p_branch_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', override_row.id,
      'reservation_table_id', override_row.reservation_table_id,
      'service_date', override_row.service_date,
      'layout', override_row.layout
    ) ORDER BY override_row.id
  ), '[]'::jsonb)
  INTO v_override_snapshot
  FROM public.reservation_table_layout_overrides override_row
  WHERE override_row.branch_id = p_branch_id
    AND override_row.service_date = p_service_date;

  v_current_snapshot := jsonb_build_object(
    'tables', v_table_snapshot,
    'overrides', v_override_snapshot
  );
  IF v_current_snapshot <> p_expected_snapshot THEN
    RAISE EXCEPTION 'FLOOR_PLAN_REVISION_CONFLICT: service layout changed since it was loaded';
  END IF;

  v_response := public.restaurant_save_floor_plan_layouts(
    p_branch_id,
    p_service_date,
    p_layouts,
    p_reason
  );

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', override_row.id,
      'reservation_table_id', override_row.reservation_table_id,
      'service_date', override_row.service_date,
      'layout', override_row.layout
    ) ORDER BY override_row.id
  ), '[]'::jsonb)
  INTO v_override_snapshot
  FROM public.reservation_table_layout_overrides override_row
  WHERE override_row.branch_id = p_branch_id
    AND override_row.service_date = p_service_date;

  v_next_snapshot := jsonb_build_object(
    'tables', v_table_snapshot,
    'overrides', v_override_snapshot
  );
  v_response := COALESCE(v_response, '{}'::jsonb) || jsonb_build_object(
    'snapshot', v_next_snapshot,
    'request_id', v_request_id,
    'replayed', false
  );

  INSERT INTO private.floor_plan_save_operations (
    actor_id, branch_id, operation_kind, request_id, request_payload, response
  ) VALUES (
    v_actor, p_branch_id, v_operation_kind, v_request_id, v_request_payload, v_response
  );

  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_variant_v2(
  p_branch_id uuid,
  p_request_id text,
  p_name text,
  p_snapshot jsonb,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_request_id text := btrim(COALESCE(p_request_id, ''));
  v_name text := btrim(COALESCE(p_name, ''));
  v_source text := btrim(COALESCE(p_source, 'manual'));
  v_operation_kind constant text := 'variant';
  v_restaurant_id uuid;
  v_request_payload jsonb;
  v_existing_payload jsonb;
  v_existing_response jsonb;
  v_variant public.floor_plan_variants%ROWTYPE;
  v_response jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch id is required';
  END IF;
  IF v_request_id = '' OR length(v_request_id) > 100 THEN
    RAISE EXCEPTION 'Invalid floor plan request id';
  END IF;
  IF v_name = '' OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Variant name must contain between 1 and 80 characters';
  END IF;
  IF v_source NOT IN ('manual', 'ai-image', 'ai-generated') THEN
    RAISE EXCEPTION 'Invalid floor plan variant source';
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object'
    OR jsonb_typeof(p_snapshot->'tables') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Variant snapshot must contain an explicit tables array';
  END IF;

  v_request_payload := jsonb_build_object(
    'name', v_name,
    'source', v_source,
    'snapshot', p_snapshot
  );

  SELECT rb.restaurant_id
  INTO v_restaurant_id
  FROM public.restaurant_branches rb
  WHERE rb.id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;
  IF NOT public.auth_can_manage_floor_plan_variant(p_branch_id) THEN
    RAISE EXCEPTION 'Not allowed to update this floor plan';
  END IF;

  -- The branch row serializes name validation and the advisory lock keeps the
  -- ordering explicit for future writers that do not touch the branch row.
  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_variant:' || p_branch_id::text, 0));

  DELETE FROM private.floor_plan_save_operations
  WHERE created_at < now() - interval '30 days';

  SELECT operation.request_payload, operation.response
  INTO v_existing_payload, v_existing_response
  FROM private.floor_plan_save_operations operation
  WHERE operation.actor_id = v_actor
    AND operation.branch_id = p_branch_id
    AND operation.operation_kind = v_operation_kind
    AND operation.request_id = v_request_id;

  IF FOUND THEN
    IF v_existing_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'FLOOR_PLAN_REQUEST_ID_REUSED: request id belongs to another payload';
    END IF;
    RETURN v_existing_response || jsonb_build_object('replayed', true);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.floor_plan_variants variant
    WHERE variant.branch_id = p_branch_id
      AND lower(btrim(variant.name)) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'A floor plan variant with this name already exists';
  END IF;

  INSERT INTO public.floor_plan_variants (
    restaurant_id,
    branch_id,
    name,
    source,
    snapshot,
    created_by
  ) VALUES (
    v_restaurant_id,
    p_branch_id,
    v_name,
    v_source,
    p_snapshot,
    v_actor
  )
  RETURNING * INTO v_variant;

  v_response := jsonb_build_object(
    'variant', to_jsonb(v_variant),
    'request_id', v_request_id,
    'replayed', false
  );

  INSERT INTO private.floor_plan_save_operations (
    actor_id, branch_id, operation_kind, request_id, request_payload, response
  ) VALUES (
    v_actor, p_branch_id, v_operation_kind, v_request_id, v_request_payload, v_response
  );

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_workspace_v2(
  uuid, jsonb, text, jsonb, uuid[], jsonb, uuid[], text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_layouts_v2(
  uuid, jsonb, text, date, jsonb, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_variant_v2(
  uuid, text, text, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_workspace_v2(
  uuid, jsonb, text, jsonb, uuid[], jsonb, uuid[], text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_layouts_v2(
  uuid, jsonb, text, date, jsonb, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_variant_v2(
  uuid, text, text, jsonb, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
