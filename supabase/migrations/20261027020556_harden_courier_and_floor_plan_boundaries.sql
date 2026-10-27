-- Browser sessions read courier state; authenticated Edge handlers and guarded
-- SECURITY DEFINER RPCs own the writes. Row ownership alone cannot authorize
-- approval, dispatch offers, earnings or delivery proof/status changes.
BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON public.couriers, public.dispatch_attempts, public.dispatch_jobs, public.delivery_tracking
FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS couriers_insert_self ON public.couriers;
DROP POLICY IF EXISTS couriers_update_self ON public.couriers;
DROP POLICY IF EXISTS dispatch_jobs_update_safe ON public.dispatch_jobs;
DROP POLICY IF EXISTS delivery_tracking_manage_safe ON public.delivery_tracking;

DROP POLICY IF EXISTS dispatch_attempts_courier_safe ON public.dispatch_attempts;
DROP POLICY IF EXISTS dispatch_attempts_courier_select ON public.dispatch_attempts;
CREATE POLICY dispatch_attempts_courier_select
ON public.dispatch_attempts FOR SELECT TO authenticated
USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

-- A courier row contains a private IBAN. Customers and restaurants get driver
-- contact/location data through delivery_tracking, never the private profile.
CREATE OR REPLACE FUNCTION public.auth_can_view_courier(p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_is_admin() OR public.auth_owns_courier(p_courier_id);
$$;

REVOKE ALL ON FUNCTION public.auth_can_view_courier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_can_view_courier(uuid) TO authenticated, service_role;

-- Autoassignment is also exposed as an RPC. Enforce access inside the definer
-- function so calling it directly cannot write another restaurant's slots.
CREATE OR REPLACE FUNCTION public.floor_plan_autoassign_reservation(p_reservation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation record;
  v_branch_id uuid;
  v_duration integer;
  v_table_id uuid;
  v_source text := 'auto';
BEGIN
  SELECT r.id, r.restaurant_id, r.branch_id, r.user_id, r.date, r.time, r.party_size, r.status, r.metadata
  INTO v_reservation
  FROM public.reservations r
  WHERE r.id = p_reservation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND (
    auth.uid() IS NULL OR (
      v_reservation.user_id IS DISTINCT FROM auth.uid()
      AND NOT public.auth_is_admin()
      AND NOT public.auth_owns_restaurant(v_reservation.restaurant_id)
    )
  ) THEN
    RAISE EXCEPTION 'Reservation access required' USING ERRCODE = '42501';
  END IF;

  IF lower(COALESCE(v_reservation.status, '')) IN ('cancelled', 'canceled', 'no_show', 'completed', 'archived') THEN
    RETURN NULL;
  END IF;
  IF COALESCE(v_reservation.party_size, 0) <= 0 THEN RETURN NULL; END IF;
  IF v_reservation.date IS NULL OR v_reservation.time IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM public.reservation_slots rs WHERE rs.reservation_id = p_reservation_id) THEN
    RETURN NULL;
  END IF;

  v_branch_id := v_reservation.branch_id;
  IF v_branch_id IS NULL THEN
    SELECT rb.id INTO v_branch_id
    FROM public.restaurant_branches rb
    WHERE rb.restaurant_id = v_reservation.restaurant_id
      AND COALESCE(rb.is_active, true) IS TRUE
    ORDER BY rb.created_at, rb.id
    LIMIT 1;
  END IF;
  IF v_branch_id IS NULL THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_assignments:' || v_branch_id::text, 0));
  v_duration := public.floor_plan_reservation_duration_minutes(v_reservation.metadata);

  SELECT rt.id INTO v_table_id
  FROM public.restaurant_preferred_tables pt
  JOIN public.reservation_tables rt ON rt.id = pt.table_id
  WHERE pt.restaurant_id = v_reservation.restaurant_id
    AND pt.user_id = v_reservation.user_id
    AND rt.branch_id = v_branch_id
    AND COALESCE(rt.is_active, true) IS TRUE
    AND COALESCE(rt.capacity, 0) >= v_reservation.party_size
    AND public.floor_plan_table_is_free(rt.id, v_reservation.date, v_reservation.time, v_duration, p_reservation_id)
  LIMIT 1;

  IF v_table_id IS NOT NULL THEN
    v_source := 'preferred';
  ELSE
    SELECT rt.id INTO v_table_id
    FROM public.reservation_tables rt
    WHERE rt.branch_id = v_branch_id
      AND COALESCE(rt.is_active, true) IS TRUE
      AND COALESCE(rt.capacity, 0) >= v_reservation.party_size
      AND public.floor_plan_table_is_free(rt.id, v_reservation.date, v_reservation.time, v_duration, p_reservation_id)
    ORDER BY
      EXISTS (
        SELECT 1 FROM public.restaurant_preferred_tables pt
        WHERE pt.table_id = rt.id AND pt.user_id <> v_reservation.user_id
      ),
      (COALESCE(rt.capacity, 0) - v_reservation.party_size),
      COALESCE(rt.capacity, 0),
      rt.table_number
    LIMIT 1;
  END IF;

  IF v_table_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.reservation_slots (reservation_id, table_id, source)
  VALUES (p_reservation_id, v_table_id, v_source);
  RETURN v_table_id;
END;
$$;

REVOKE ALL ON FUNCTION public.floor_plan_autoassign_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.floor_plan_autoassign_reservation(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
