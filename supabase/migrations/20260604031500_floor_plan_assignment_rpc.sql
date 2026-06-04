-- Persist floor-plan reservation assignments atomically from the restaurant dashboard.
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
  v_reservation_id uuid;
  v_table_id uuid;
  v_previous_slots jsonb := '[]'::jsonb;
  v_assignment_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch id is required';
  END IF;
  IF jsonb_typeof(COALESCE(p_assignments, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Assignments must be a JSON object';
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

  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_assignments:' || p_branch_id::text, 0));

  SELECT count(*)
  INTO v_assignment_count
  FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb));

  IF v_assignment_count > 500 THEN
    RAISE EXCEPTION 'Too many floor plan assignments';
  END IF;

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

    SELECT r.id, r.restaurant_id, r.branch_id, r.date, r.time, r.party_size, r.status
    INTO v_reservation
    FROM public.reservations r
    WHERE r.id = v_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reservation not found';
    END IF;
    IF v_reservation.restaurant_id <> v_branch.restaurant_id THEN
      RAISE EXCEPTION 'Reservation does not belong to this restaurant';
    END IF;

    IF v_table_id IS NOT NULL THEN
      SELECT rt.id, rt.branch_id, rt.capacity, rt.is_active
      INTO v_table
      FROM public.reservation_tables rt
      WHERE rt.id = v_table_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Table not found';
      END IF;
      IF v_table.branch_id <> p_branch_id THEN
        RAISE EXCEPTION 'Table does not belong to this branch';
      END IF;
      IF COALESCE(v_table.is_active, true) IS NOT TRUE THEN
        RAISE EXCEPTION 'Table is inactive';
      END IF;
      IF COALESCE(v_table.capacity, 0) < COALESCE(v_reservation.party_size, 0) THEN
        RAISE EXCEPTION 'Table capacity is too low for this reservation';
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'reservation_id', rs.reservation_id,
      'table_id', rs.table_id
    )),
    '[]'::jsonb
  )
  INTO v_previous_slots
  FROM public.reservation_slots rs
  WHERE rs.reservation_id IN (
    SELECT key::uuid
    FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb))
  );

  DELETE FROM public.reservation_slots rs
  WHERE rs.reservation_id IN (
    SELECT key::uuid
    FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb))
  );

  FOR v_assignment IN
    SELECT key AS reservation_id_text, value AS table_id_value
    FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb))
  LOOP
    v_reservation_id := v_assignment.reservation_id_text::uuid;
    IF jsonb_typeof(v_assignment.table_id_value) = 'null' THEN
      v_table_id := NULL;
    ELSE
      v_table_id := NULLIF(v_assignment.table_id_value #>> '{}', '')::uuid;
    END IF;

    UPDATE public.reservations
    SET branch_id = p_branch_id,
        updated_at = now()
    WHERE id = v_reservation_id;

    IF v_table_id IS NOT NULL THEN
      INSERT INTO public.reservation_slots (reservation_id, table_id)
      VALUES (v_reservation_id, v_table_id);
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

  RETURN jsonb_build_object(
    'assignment_count', v_assignment_count,
    'inserted_count', v_inserted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_assignments(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_assignments(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_assignments(uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
