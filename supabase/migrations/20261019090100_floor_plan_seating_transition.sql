-- Arrival already seals the flat reservation fee. Seating is the next physical
-- service step, not a finance mutation and not a second honoring operation.
CREATE OR REPLACE FUNCTION public.restaurant_seat_floor_plan_reservation(p_reservation_id uuid)
RETURNS TABLE(updated boolean, error_code text, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_branch_id uuid;
  v_restaurant_id uuid;
  v_reservation public.reservations%ROWTYPE;
  v_updated public.reservations%ROWTYPE;
  v_table public.reservation_tables%ROWTYPE;
  v_slot_count integer;
  v_status text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN QUERY SELECT false, 'unauthorized'::text, 'Connectez-vous pour installer les clients.'::text;
    RETURN;
  END IF;
  IF public.commercial_demo_current_user_is_restricted() THEN
    RAISE EXCEPTION 'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs' USING ERRCODE = '42501';
  END IF;
  SELECT r.restaurant_id, r.branch_id INTO v_restaurant_id, v_branch_id
  FROM public.reservations r WHERE r.id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, 'Réservation introuvable.'::text;
    RETURN;
  END IF;
  IF NOT (COALESCE(public.auth_is_admin(), false) OR COALESCE(public.auth_owns_restaurant(v_restaurant_id), false)) THEN
    RETURN QUERY SELECT false, 'forbidden'::text, 'Accès refusé à cette réservation.'::text;
    RETURN;
  END IF;
  IF v_branch_id IS NULL THEN
    -- Auto-placement intentionally writes only reservation_slots, avoiding a
    -- duplicate reservation notification. Resolve its branch from the unique
    -- saved table; the placement is checked again after all relevant locks.
    SELECT count(*), (array_agg(t.branch_id ORDER BY t.id))[1]
    INTO v_slot_count, v_branch_id
    FROM public.reservation_slots s JOIN public.reservation_tables t ON t.id = s.table_id
    WHERE s.reservation_id = p_reservation_id;
    IF v_slot_count <> 1 OR v_branch_id IS NULL THEN
      RETURN QUERY SELECT false, 'not_placed'::text, 'Attribuez une table à ces clients avant de les installer.'::text;
      RETURN;
    END IF;
  END IF;
  IF public.auth_can_access_branch(v_branch_id) IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'forbidden'::text, 'Accès refusé à cet établissement.'::text;
    RETURN;
  END IF;

  -- Same branch-first lock order as workspace v3 and the assignment writer.
  PERFORM b.id FROM public.restaurant_branches b
  WHERE b.id = v_branch_id AND b.restaurant_id = v_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_branch'::text, 'Établissement incohérent pour cette réservation.'::text;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_assignments:' || v_branch_id::text, 0));
  SELECT * INTO v_reservation FROM public.reservations r WHERE r.id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR (v_reservation.branch_id IS NOT NULL AND v_reservation.branch_id <> v_branch_id)
    OR v_reservation.restaurant_id IS DISTINCT FROM v_restaurant_id THEN
    RETURN QUERY SELECT false, 'reservation_changed'::text, 'La réservation a changé. Actualisez le service.'::text;
    RETURN;
  END IF;
  v_status := replace(lower(btrim(COALESCE(v_reservation.status, ''))), '-', '_');
  IF v_status = 'seated' THEN
    -- Retry after a lost response must not update timestamps, fees or audit.
    RETURN QUERY SELECT true, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF v_status <> 'arrived' THEN
    RETURN QUERY SELECT false, 'invalid_status_transition'::text, 'Signalez d’abord l’arrivée des clients avant de les installer.'::text;
    RETURN;
  END IF;

  PERFORM s.id FROM public.reservation_slots s WHERE s.reservation_id = p_reservation_id ORDER BY s.id FOR UPDATE;
  SELECT count(*) INTO v_slot_count FROM public.reservation_slots s WHERE s.reservation_id = p_reservation_id;
  IF v_slot_count <> 1 THEN
    RETURN QUERY SELECT false, 'not_placed'::text, 'Attribuez une table unique et enregistrez le placement avant d’installer les clients.'::text;
    RETURN;
  END IF;
  SELECT t.* INTO v_table
  FROM public.reservation_tables t JOIN public.reservation_slots s ON s.table_id = t.id
  WHERE s.reservation_id = p_reservation_id FOR UPDATE OF t;
  IF NOT FOUND OR v_table.branch_id <> v_branch_id
    OR COALESCE(v_table.is_active, true) IS NOT TRUE
    OR COALESCE(v_table.layout->>'kind', 'table') <> 'table' THEN
    RETURN QUERY SELECT false, 'invalid_table'::text, 'Choisissez une table active dans cet établissement.'::text;
    RETURN;
  END IF;
  IF COALESCE(v_reservation.party_size, 0) < 1 OR v_table.capacity < v_reservation.party_size THEN
    RETURN QUERY SELECT false, 'insufficient_capacity'::text, 'La capacité de cette table est insuffisante pour ces clients.'::text;
    RETURN;
  END IF;

  -- Deliberately update only physical service state. Existing finance guards
  -- and billing triggers remain active and receive unchanged financial fields.
  UPDATE public.reservations SET status = 'seated', updated_at = now()
  WHERE id = p_reservation_id RETURNING * INTO v_updated;
  IF v_updated.honored_at IS DISTINCT FROM v_reservation.honored_at
    OR v_updated.billing_fee_chf IS DISTINCT FROM v_reservation.billing_fee_chf
    OR v_updated.attributed_table_revenue_chf IS DISTINCT FROM v_reservation.attributed_table_revenue_chf
    OR v_updated.reservation_fee_waiver_reason IS DISTINCT FROM v_reservation.reservation_fee_waiver_reason THEN
    RAISE EXCEPTION 'FLOOR_PLAN_SEATING_FINANCE_CHANGED: seating must preserve the reservation finance snapshot';
  END IF;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES(v_actor, 'restaurant_seat_floor_plan_reservation', 'reservation', p_reservation_id,
    jsonb_build_object('status', v_reservation.status),
    jsonb_build_object('status', 'seated', 'branch_id', v_branch_id, 'table_id', v_table.id));
  RETURN QUERY SELECT true, NULL::text, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_seat_floor_plan_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_seat_floor_plan_reservation(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
