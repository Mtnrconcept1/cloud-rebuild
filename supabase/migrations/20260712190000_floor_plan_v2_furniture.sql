-- Persistent structural objects for Plan de salle 2.
CREATE TABLE IF NOT EXISTS public.floor_plan_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  label text NOT NULL,
  zone text NOT NULL DEFAULT 'Salle principale',
  x double precision NOT NULL DEFAULT 10,
  y double precision NOT NULL DEFAULT 10,
  width double precision NOT NULL DEFAULT 96,
  height double precision NOT NULL DEFAULT 56,
  rotation integer NOT NULL DEFAULT 0,
  locked boolean NOT NULL DEFAULT false,
  z_index integer NOT NULL DEFAULT 0,
  style jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT floor_plan_objects_type_check CHECK (
    object_type IN (
      'wall', 'door', 'window', 'bar', 'plant', 'service_station',
      'host_stand', 'buffet', 'sofa', 'divider'
    )
  ),
  CONSTRAINT floor_plan_objects_label_check CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  CONSTRAINT floor_plan_objects_zone_check CHECK (char_length(btrim(zone)) BETWEEN 1 AND 60),
  CONSTRAINT floor_plan_objects_x_check CHECK (x BETWEEN 0 AND 94),
  CONSTRAINT floor_plan_objects_y_check CHECK (y BETWEEN 0 AND 86),
  CONSTRAINT floor_plan_objects_width_check CHECK (width BETWEEN 24 AND 520),
  CONSTRAINT floor_plan_objects_height_check CHECK (height BETWEEN 16 AND 360),
  CONSTRAINT floor_plan_objects_rotation_check CHECK (rotation BETWEEN 0 AND 359),
  CONSTRAINT floor_plan_objects_z_index_check CHECK (z_index BETWEEN -100 AND 100)
);

CREATE INDEX IF NOT EXISTS floor_plan_objects_branch_zone_idx
  ON public.floor_plan_objects (branch_id, zone, z_index, created_at);

ALTER TABLE public.floor_plan_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS floor_plan_objects_select ON public.floor_plan_objects;
CREATE POLICY floor_plan_objects_select
  ON public.floor_plan_objects
  FOR SELECT
  TO authenticated
  USING (public.auth_can_access_branch(branch_id));

DROP POLICY IF EXISTS floor_plan_objects_insert ON public.floor_plan_objects;
CREATE POLICY floor_plan_objects_insert
  ON public.floor_plan_objects
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_can_access_branch(branch_id));

DROP POLICY IF EXISTS floor_plan_objects_update ON public.floor_plan_objects;
CREATE POLICY floor_plan_objects_update
  ON public.floor_plan_objects
  FOR UPDATE
  TO authenticated
  USING (public.auth_can_access_branch(branch_id))
  WITH CHECK (public.auth_can_access_branch(branch_id));

DROP POLICY IF EXISTS floor_plan_objects_delete ON public.floor_plan_objects;
CREATE POLICY floor_plan_objects_delete
  ON public.floor_plan_objects
  FOR DELETE
  TO authenticated
  USING (public.auth_can_access_branch(branch_id));

CREATE OR REPLACE FUNCTION public.restaurant_save_floor_plan_objects(
  p_branch_id uuid,
  p_objects jsonb,
  p_reason text DEFAULT 'floor_plan_object_save'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_branch record;
  v_object record;
  v_id uuid;
  v_existing_branch_id uuid;
  v_client_id text;
  v_type text;
  v_label text;
  v_zone text;
  v_x double precision;
  v_y double precision;
  v_width double precision;
  v_height double precision;
  v_rotation integer;
  v_locked boolean;
  v_z_index integer;
  v_style jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id_map jsonb := '{}'::jsonb;
  v_previous jsonb := '[]'::jsonb;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Branch id is required'; END IF;
  IF jsonb_typeof(COALESCE(p_objects, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Floor plan objects must be a JSON array';
  END IF;
  IF jsonb_array_length(COALESCE(p_objects, '[]'::jsonb)) > 250 THEN
    RAISE EXCEPTION 'Too many floor plan objects';
  END IF;

  SELECT rb.id, rb.restaurant_id INTO v_branch
  FROM public.restaurant_branches rb
  WHERE rb.id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF NOT public.auth_can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Not allowed to update this floor plan';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_objects:' || p_branch_id::text, 0));

  SELECT COALESCE(jsonb_agg(to_jsonb(fpo) ORDER BY fpo.z_index, fpo.created_at), '[]'::jsonb)
  INTO v_previous
  FROM public.floor_plan_objects fpo
  WHERE fpo.branch_id = p_branch_id;

  FOR v_object IN
    SELECT value AS payload
    FROM jsonb_array_elements(COALESCE(p_objects, '[]'::jsonb))
  LOOP
    v_client_id := btrim(COALESCE(v_object.payload->>'client_id', v_object.payload->>'id', ''));
    IF v_client_id = '' OR char_length(v_client_id) > 100 THEN
      RAISE EXCEPTION 'Invalid floor plan object identifier';
    END IF;

    BEGIN
      v_id := NULLIF(v_object.payload->>'id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_id := NULL;
    END;

    IF v_id IS NOT NULL THEN
      SELECT branch_id INTO v_existing_branch_id
      FROM public.floor_plan_objects
      WHERE id = v_id
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Floor plan object not found'; END IF;
      IF v_existing_branch_id <> p_branch_id THEN
        RAISE EXCEPTION 'Floor plan object does not belong to this branch';
      END IF;
    ELSE
      v_id := gen_random_uuid();
    END IF;

    v_type := btrim(COALESCE(v_object.payload->>'object_type', ''));
    v_label := left(btrim(COALESCE(v_object.payload->>'label', '')), 80);
    v_zone := left(btrim(COALESCE(v_object.payload->>'zone', 'Salle principale')), 60);
    IF v_type NOT IN (
      'wall', 'door', 'window', 'bar', 'plant', 'service_station',
      'host_stand', 'buffet', 'sofa', 'divider'
    ) THEN RAISE EXCEPTION 'Invalid floor plan object type'; END IF;
    IF v_label = '' OR v_zone = '' THEN RAISE EXCEPTION 'Object label and zone are required'; END IF;

    BEGIN
      v_x := (v_object.payload->>'x')::double precision;
      v_y := (v_object.payload->>'y')::double precision;
      v_width := (v_object.payload->>'width')::double precision;
      v_height := (v_object.payload->>'height')::double precision;
      v_rotation := round(COALESCE((v_object.payload->>'rotation')::numeric, 0))::integer;
      v_z_index := round(COALESCE((v_object.payload->>'z_index')::numeric, 0))::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid floor plan object geometry';
    END;
    v_rotation := ((v_rotation % 360) + 360) % 360;
    v_locked := COALESCE((v_object.payload->>'locked')::boolean, false);
    v_style := CASE WHEN jsonb_typeof(v_object.payload->'style') = 'object'
      THEN v_object.payload->'style' ELSE '{}'::jsonb END;

    IF v_x NOT BETWEEN 0 AND 94 OR v_y NOT BETWEEN 0 AND 86
      OR v_width NOT BETWEEN 24 AND 520 OR v_height NOT BETWEEN 16 AND 360
      OR v_z_index NOT BETWEEN -100 AND 100 THEN
      RAISE EXCEPTION 'Floor plan object geometry is out of bounds';
    END IF;

    INSERT INTO public.floor_plan_objects (
      id, branch_id, object_type, label, zone, x, y, width, height,
      rotation, locked, z_index, style, created_by, updated_at
    ) VALUES (
      v_id, p_branch_id, v_type, v_label, v_zone, v_x, v_y, v_width, v_height,
      v_rotation, v_locked, v_z_index, v_style, v_actor, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      object_type = EXCLUDED.object_type,
      label = EXCLUDED.label,
      zone = EXCLUDED.zone,
      x = EXCLUDED.x,
      y = EXCLUDED.y,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      rotation = EXCLUDED.rotation,
      locked = EXCLUDED.locked,
      z_index = EXCLUDED.z_index,
      style = EXCLUDED.style,
      updated_at = now();

    v_ids := array_append(v_ids, v_id);
    v_id_map := v_id_map || jsonb_build_object(v_client_id, v_id);
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.floor_plan_objects
  WHERE branch_id = p_branch_id
    AND NOT (id = ANY(v_ids));

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_save_floor_plan_objects',
    'restaurant_branch',
    p_branch_id,
    jsonb_build_object('objects', v_previous),
    jsonb_build_object(
      'objects', COALESCE(p_objects, '[]'::jsonb),
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
  v_objects jsonb;
BEGIN
  v_tables := public.restaurant_save_floor_plan_template(
    p_branch_id,
    COALESCE(p_table_upserts, '[]'::jsonb),
    COALESCE(p_table_delete_ids, ARRAY[]::uuid[]),
    p_reason
  );
  v_objects := public.restaurant_save_floor_plan_objects(
    p_branch_id,
    COALESCE(p_objects, '[]'::jsonb),
    p_reason
  );
  RETURN jsonb_build_object(
    'saved_count', COALESCE((v_tables->>'saved_count')::integer, 0),
    'object_count', COALESCE((v_objects->>'saved_count')::integer, 0),
    'id_map', COALESCE(v_tables->'id_map', '{}'::jsonb) || COALESCE(v_objects->'id_map', '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON TABLE public.floor_plan_objects FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.floor_plan_objects TO authenticated;

REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_objects(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_workspace(uuid, jsonb, uuid[], jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_objects(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_workspace(uuid, jsonb, uuid[], jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
