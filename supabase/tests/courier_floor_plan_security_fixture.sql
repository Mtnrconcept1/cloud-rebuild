-- Disposable PostgreSQL fixture ONLY, never apply to a live Supabase project.
-- Replay: fixture, migration 20261027020556, then assertions in a fresh database.
-- Use an empty disposable PostgreSQL instance as its database owner:
-- psql "$TOK_SECURITY_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--   -f supabase/tests/courier_floor_plan_security_fixture.sql \
--   -f supabase/migrations/20261027020556_harden_courier_and_floor_plan_boundaries.sql \
--   -f supabase/tests/courier_floor_plan_security_assertions.sql
-- The helper functions/policies below are copied unchanged from
-- 20260312213000_fix_courier_rls_and_order_tabs.sql; admin review is from
-- 20260531185419, and autoplacement from 20260907030000. Their deployed
-- definitions and grants were checked read-only on 2026-10-27.
-- Only synthetic accounts/data and the columns needed by those real functions
-- are included. This does not replay unrelated app migrations or Edge handlers.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid;
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT current_setting('request.jwt.claims',true)::jsonb->>'role';
$$;
CREATE TYPE public.app_role AS ENUM ('client','restaurateur','courier','admin','commercial');
CREATE TABLE public.user_roles(user_id uuid,role public.app_role,PRIMARY KEY(user_id,role));
CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;
CREATE TABLE public.restaurants(id uuid PRIMARY KEY,owner_id uuid);
CREATE TABLE public.couriers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE,
 first_name text,last_name text,phone text,iban text,status text DEFAULT 'pending_approval',
 is_online boolean DEFAULT false,rating numeric DEFAULT 5,acceptance_rate numeric DEFAULT 100,
 completion_rate numeric DEFAULT 100,total_deliveries integer DEFAULT 0,updated_at timestamptz DEFAULT now());
CREATE TABLE public.orders(id uuid PRIMARY KEY,user_id uuid,restaurant_id uuid,delivery_address text);
CREATE TABLE public.dispatch_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,
 courier_id uuid,status text,earnings_base numeric,delivered_at timestamptz);
CREATE TABLE public.dispatch_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dispatch_job_id uuid,
 courier_id uuid,status text DEFAULT 'pending');
CREATE TABLE public.delivery_tracking(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid UNIQUE,
 status text,driver_name text,driver_phone text,current_lat numeric,current_lng numeric);
CREATE TABLE public.courier_shifts(id uuid PRIMARY KEY,courier_id uuid);
CREATE TABLE public.courier_locations(id uuid PRIMARY KEY,courier_id uuid);
CREATE TABLE public.courier_earnings(id uuid PRIMARY KEY,courier_id uuid);
CREATE TABLE public.signup_applications(id uuid PRIMARY KEY,user_id uuid,requested_role text,
 status text,submitted_at timestamptz,created_at timestamptz,review_note text,reviewed_at timestamptz,
 reviewed_by uuid,updated_at timestamptz);
CREATE TABLE public.signup_application_documents(id uuid PRIMARY KEY,application_id uuid,status text,
 rejection_reason text,reviewed_at timestamptz,reviewed_by uuid,updated_at timestamptz);
CREATE TABLE public.audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,
 action text,entity_type text,entity_id uuid,old_data jsonb,new_data jsonb);
CREATE TABLE public.restaurant_branches(id uuid PRIMARY KEY,restaurant_id uuid,is_active boolean,
 created_at timestamptz DEFAULT now());
CREATE TABLE public.reservation_tables(id uuid PRIMARY KEY,branch_id uuid,table_number text,
 capacity integer,is_active boolean DEFAULT true);
CREATE TABLE public.reservations(id uuid PRIMARY KEY,restaurant_id uuid,branch_id uuid,user_id uuid,
 date date,time time,party_size integer,status text,metadata jsonb DEFAULT '{}');
CREATE TABLE public.reservation_slots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reservation_id uuid,
 table_id uuid,source text DEFAULT 'manual');
CREATE TABLE public.restaurant_preferred_tables(id uuid PRIMARY KEY,restaurant_id uuid,branch_id uuid,
 user_id uuid,table_id uuid);
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
-- Exercise inherited grants as well as the deployed direct-role grants.
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON public.couriers, public.dispatch_attempts, public.dispatch_jobs, public.delivery_tracking TO PUBLIC;

CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.has_role(auth.uid(), 'admin'), false);
$$;

CREATE OR REPLACE FUNCTION public.auth_owns_restaurant(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_owns_courier(p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.couriers c
    WHERE c.id = p_courier_id
      AND c.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_order_delivery(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = p_order_id
        AND o.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = p_order_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.couriers c ON c.id = dj.courier_id
      WHERE dj.order_id = p_order_id
        AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_attempts da
      JOIN public.dispatch_jobs dj ON dj.id = da.dispatch_job_id
      JOIN public.couriers c ON c.id = da.courier_id
      WHERE dj.order_id = p_order_id
        AND c.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_order_delivery(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = p_order_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.couriers c ON c.id = dj.courier_id
      WHERE dj.order_id = p_order_id
        AND c.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_courier(p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = p_courier_id
        AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE dj.courier_id = p_courier_id
        AND (
          o.user_id = auth.uid()
          OR r.owner_id = auth.uid()
        )
        AND dj.status IN ('accepted', 'arriving_pickup', 'picked_up', 'arriving_dropoff')
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_dispatch_job(p_dispatch_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      WHERE dj.id = p_dispatch_job_id
        AND public.auth_can_view_order_delivery(dj.order_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_dispatch_job(p_dispatch_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE dj.id = p_dispatch_job_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.couriers c ON c.id = dj.courier_id
      WHERE dj.id = p_dispatch_job_id
        AND c.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.auth_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_owns_restaurant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_owns_courier(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_order_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_order_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_courier(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_dispatch_job(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_dispatch_job(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owns_restaurant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owns_courier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_order_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_order_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_courier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_dispatch_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_dispatch_job(uuid) TO authenticated;

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Couriers manage own profile" ON public.couriers;
DROP POLICY IF EXISTS "couriers_own_profile_select" ON public.couriers;
DROP POLICY IF EXISTS "couriers_own_profile_insert" ON public.couriers;
DROP POLICY IF EXISTS "couriers_own_profile_update" ON public.couriers;
DROP POLICY IF EXISTS "couriers_admin_all" ON public.couriers;
DROP POLICY IF EXISTS "couriers_client_active_order" ON public.couriers;

CREATE POLICY "couriers_select_safe" ON public.couriers
  FOR SELECT TO authenticated
  USING (public.auth_can_view_courier(id));

CREATE POLICY "couriers_insert_self" ON public.couriers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.auth_is_admin());

CREATE POLICY "couriers_update_self" ON public.couriers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.auth_is_admin())
  WITH CHECK (auth.uid() = user_id OR public.auth_is_admin());

ALTER TABLE public.courier_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_shifts_own" ON public.courier_shifts;
DROP POLICY IF EXISTS "courier_shifts_admin" ON public.courier_shifts;
DROP POLICY IF EXISTS "Couriers manage own courier_shifts" ON public.courier_shifts;

CREATE POLICY "courier_shifts_select_safe" ON public.courier_shifts
  FOR SELECT TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

CREATE POLICY "courier_shifts_write_safe" ON public.courier_shifts
  FOR ALL TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin())
  WITH CHECK (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_locations_own_insert" ON public.courier_locations;
DROP POLICY IF EXISTS "courier_locations_own_select" ON public.courier_locations;
DROP POLICY IF EXISTS "courier_locations_client_active" ON public.courier_locations;
DROP POLICY IF EXISTS "courier_locations_admin" ON public.courier_locations;
DROP POLICY IF EXISTS "Couriers manage own courier_locations" ON public.courier_locations;

CREATE POLICY "courier_locations_select_safe" ON public.courier_locations
  FOR SELECT TO authenticated
  USING (public.auth_can_view_courier(courier_id));

CREATE POLICY "courier_locations_insert_safe" ON public.courier_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispatch_jobs_courier_select" ON public.dispatch_jobs;
DROP POLICY IF EXISTS "dispatch_jobs_courier_update" ON public.dispatch_jobs;
DROP POLICY IF EXISTS "dispatch_jobs_client_select" ON public.dispatch_jobs;
DROP POLICY IF EXISTS "dispatch_jobs_admin" ON public.dispatch_jobs;

CREATE POLICY "dispatch_jobs_select_safe" ON public.dispatch_jobs
  FOR SELECT TO authenticated
  USING (public.auth_can_view_dispatch_job(id));

CREATE POLICY "dispatch_jobs_update_safe" ON public.dispatch_jobs
  FOR UPDATE TO authenticated
  USING (public.auth_can_manage_dispatch_job(id))
  WITH CHECK (public.auth_can_manage_dispatch_job(id));

CREATE POLICY "dispatch_jobs_admin_safe" ON public.dispatch_jobs
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

ALTER TABLE public.dispatch_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispatch_attempts_courier" ON public.dispatch_attempts;
DROP POLICY IF EXISTS "dispatch_attempts_admin" ON public.dispatch_attempts;

CREATE POLICY "dispatch_attempts_courier_safe" ON public.dispatch_attempts
  FOR ALL TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin())
  WITH CHECK (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

ALTER TABLE public.courier_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_earnings_own" ON public.courier_earnings;
DROP POLICY IF EXISTS "courier_earnings_admin" ON public.courier_earnings;
DROP POLICY IF EXISTS "Couriers manage own courier_earnings" ON public.courier_earnings;

CREATE POLICY "courier_earnings_select_safe" ON public.courier_earnings
  FOR SELECT TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

CREATE POLICY "courier_earnings_admin_safe" ON public.courier_earnings
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their delivery tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "Restaurant owners can manage delivery tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "delivery_tracking_courier_select" ON public.delivery_tracking;

CREATE POLICY "delivery_tracking_select_safe" ON public.delivery_tracking
  FOR SELECT TO authenticated
  USING (public.auth_can_view_order_delivery(order_id));

CREATE POLICY "delivery_tracking_manage_safe" ON public.delivery_tracking
  FOR ALL TO authenticated
  USING (public.auth_can_manage_order_delivery(order_id))
  WITH CHECK (public.auth_can_manage_order_delivery(order_id));


-- Admin review workflow for courier profiles.
-- Keeps the courier operational status and the application role in sync.

CREATE OR REPLACE FUNCTION public.admin_review_courier_profile(
  p_courier_id uuid,
  p_status text,
  p_review_note text DEFAULT NULL
)
RETURNS TABLE (courier_id uuid, courier_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_next_status text := lower(trim(COALESCE(p_status, '')));
  v_courier public.couriers%ROWTYPE;
  v_application_id uuid;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF v_next_status NOT IN ('approved', 'pending_approval', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported courier status: %', p_status;
  END IF;

  SELECT * INTO v_courier
  FROM public.couriers
  WHERE id = p_courier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Courier profile not found.';
  END IF;

  UPDATE public.couriers
  SET status = v_next_status,
      is_online = CASE WHEN v_next_status = 'approved' THEN is_online ELSE false END,
      updated_at = now()
  WHERE id = p_courier_id;

  IF v_next_status = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_courier.user_id, 'courier'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = v_courier.user_id
      AND role = 'courier'::public.app_role;
  END IF;

  SELECT id INTO v_application_id
  FROM public.signup_applications
  WHERE user_id = v_courier.user_id
    AND requested_role = 'courier'
  ORDER BY submitted_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_application_id IS NOT NULL AND v_next_status IN ('approved', 'pending_approval', 'rejected') THEN
    UPDATE public.signup_applications
    SET status = CASE
          WHEN v_next_status = 'approved' THEN 'approved'
          WHEN v_next_status = 'rejected' THEN 'rejected'
          ELSE 'pending_review'
        END,
        review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
        reviewed_at = CASE WHEN v_next_status = 'pending_approval' THEN reviewed_at ELSE now() END,
        reviewed_by = CASE WHEN v_next_status = 'pending_approval' THEN reviewed_by ELSE v_actor_id END,
        updated_at = now()
    WHERE id = v_application_id;

    UPDATE public.signup_application_documents
    SET status = CASE
          WHEN v_next_status = 'approved' THEN 'approved'
          WHEN v_next_status = 'rejected' THEN 'rejected'
          ELSE 'pending'
        END,
        rejection_reason = CASE
          WHEN v_next_status = 'rejected' THEN NULLIF(trim(COALESCE(p_review_note, '')), '')
          ELSE NULL
        END,
        reviewed_at = CASE WHEN v_next_status = 'pending_approval' THEN NULL ELSE now() END,
        reviewed_by = CASE WHEN v_next_status = 'pending_approval' THEN NULL ELSE v_actor_id END,
        updated_at = now()
    WHERE application_id = v_application_id;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_review_courier_profile',
    'couriers',
    p_courier_id,
    jsonb_build_object('status', v_courier.status, 'is_online', v_courier.is_online),
    jsonb_build_object(
      'status', v_next_status,
      'review_note', NULLIF(trim(COALESCE(p_review_note, '')), ''),
      'application_id', v_application_id
    )
  );

  RETURN QUERY SELECT p_courier_id, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_courier_profile(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_courier_profile(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.floor_plan_reservation_duration_minutes(p_metadata jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_metadata->>'duration_minutes', p_metadata->>'durationMinutes', '') ~ '^[0-9]+$'
      THEN GREATEST(30, COALESCE(p_metadata->>'duration_minutes', p_metadata->>'durationMinutes')::integer)
    ELSE 120
  END;
$$;

-- ---------------------------------------------------------------------------
-- « La table est-elle libre sur ce créneau ? »
-- Même fenêtre de chevauchement et même liste de statuts libérés que la RPC de
-- sauvegarde.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.floor_plan_table_is_free(
  p_table_id uuid,
  p_date date,
  p_time time,
  p_duration_minutes integer,
  p_exclude_reservation_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.reservation_slots rs
    JOIN public.reservations r ON r.id = rs.reservation_id
    WHERE rs.table_id = p_table_id
      AND (p_exclude_reservation_id IS NULL OR r.id <> p_exclude_reservation_id)
      AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'canceled', 'no_show', 'completed', 'archived')
      AND r.date = p_date
      AND (p_date + p_time)
          < (r.date + r.time::time)
            + make_interval(mins => public.floor_plan_reservation_duration_minutes(r.metadata))
      AND (r.date + r.time::time)
          < (p_date + p_time) + make_interval(mins => GREATEST(30, COALESCE(p_duration_minutes, 120)))
  );
$$;


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

  IF lower(COALESCE(v_reservation.status, '')) IN ('cancelled', 'canceled', 'no_show', 'completed', 'archived') THEN
    RETURN NULL;
  END IF;
  IF COALESCE(v_reservation.party_size, 0) <= 0 THEN RETURN NULL; END IF;
  IF v_reservation.date IS NULL OR v_reservation.time IS NULL THEN RETURN NULL; END IF;

  -- Ne jamais écraser une table déjà posée.
  IF EXISTS (SELECT 1 FROM public.reservation_slots rs WHERE rs.reservation_id = p_reservation_id) THEN
    RETURN NULL;
  END IF;

  -- La salle de la réservation, sinon la plus ancienne salle active du
  -- restaurant : un restaurant mono-salle n'a rien à paramétrer.
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

  -- Sérialise les placements concurrents sur la même salle, comme le fait la
  -- RPC de sauvegarde : sans ce verrou deux réservations simultanées peuvent
  -- se voir attribuer la même table.
  PERFORM pg_advisory_xact_lock(hashtextextended('floor_plan_assignments:' || v_branch_id::text, 0));

  v_duration := public.floor_plan_reservation_duration_minutes(v_reservation.metadata);

  -- 1. La table attitrée du client.
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
    -- 2. La plus petite table libre qui accueille le groupe : garde les
    -- grandes tables disponibles pour les grands groupes.
    --
    -- Une table attitrée à quelqu'un d'autre reste utilisable, mais passe en
    -- dernier : la réserver franchement gèlerait de la capacité les jours où
    -- son habitué ne vient pas.
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

  -- Volontairement aucun UPDATE sur public.reservations : plusieurs triggers
  -- AFTER UPDATE de la table ne filtrent aucune colonne (audit, notifications).
  -- Renseigner branch_id ici enverrait une notification et une ligne d'audit en
  -- double à chaque réservation. Le plan de salle lit les réservations par
  -- restaurant_id et par date, et restaurant_save_floor_plan_assignments
  -- renseigne branch_id à la première sauvegarde du restaurateur.
  RETURN v_table_id;
END;
$$;

REVOKE ALL ON FUNCTION public.floor_plan_autoassign_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.floor_plan_autoassign_reservation(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Déclencheur : chaque réservation créée tente son placement.
--
-- Un échec de placement ne doit jamais faire échouer une réservation : la
-- réservation reste valide et simplement sans table, visible dans la file
-- « à placer ». D'où le bloc d'exception.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_reservations_autoassign_table()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.floor_plan_autoassign_reservation(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'floor_plan_autoassign_reservation failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_autoassign_table ON public.reservations;
CREATE TRIGGER trg_reservations_autoassign_table
  AFTER INSERT ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_reservations_autoassign_table();


-- Synthetic identities: owner=1, customer=2, courier=3, stranger=4, admin=5.
INSERT INTO public.user_roles VALUES
 ('72000000-0000-4000-8000-000000000001','restaurateur'),
 ('72000000-0000-4000-8000-000000000002','client'),
 ('72000000-0000-4000-8000-000000000003','courier'),
 ('72000000-0000-4000-8000-000000000004','client'),
 ('72000000-0000-4000-8000-000000000005','admin');
INSERT INTO public.restaurants VALUES('72010000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001');
INSERT INTO public.couriers(id,user_id,iban,status) VALUES
 ('72020000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000003','SYNTHETIC-PRIVATE-IBAN','pending_approval');
INSERT INTO public.orders VALUES
 ('72030000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002','72010000-0000-4000-8000-000000000001','Synthetic customer address'),
 ('72030000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000004','72010000-0000-4000-8000-000000000001','Synthetic other address');
INSERT INTO public.dispatch_jobs VALUES
 ('72040000-0000-4000-8000-000000000001','72030000-0000-4000-8000-000000000001','72020000-0000-4000-8000-000000000001','accepted',10,NULL),
 ('72040000-0000-4000-8000-000000000002','72030000-0000-4000-8000-000000000002',NULL,'searching',10,NULL);
INSERT INTO public.dispatch_attempts(id,dispatch_job_id,courier_id) VALUES
 ('72041000-0000-4000-8000-000000000001','72040000-0000-4000-8000-000000000001','72020000-0000-4000-8000-000000000001');
INSERT INTO public.delivery_tracking(order_id,status,driver_name,driver_phone) VALUES
 ('72030000-0000-4000-8000-000000000001','preparing','Synthetic Courier','synthetic-phone');
INSERT INTO public.courier_locations VALUES('72042000-0000-4000-8000-000000000001','72020000-0000-4000-8000-000000000001');
INSERT INTO public.restaurant_branches(id,restaurant_id,is_active) VALUES
 ('72050000-0000-4000-8000-000000000001','72010000-0000-4000-8000-000000000001',true);
INSERT INTO public.reservation_tables VALUES
 ('72060000-0000-4000-8000-000000000001','72050000-0000-4000-8000-000000000001','T2',2,true),
 ('72060000-0000-4000-8000-000000000002','72050000-0000-4000-8000-000000000001','T4',4,true),
 ('72060000-0000-4000-8000-000000000003','72050000-0000-4000-8000-000000000001','T8',8,true);
ALTER TABLE public.reservations DISABLE TRIGGER trg_reservations_autoassign_table;
INSERT INTO public.reservations(id,restaurant_id,user_id,date,time,party_size,status)
SELECT ('72070000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '72010000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002',
 current_date+30+n,'19:00',2,'confirmed' FROM generate_series(1,4) n;
ALTER TABLE public.reservations ENABLE TRIGGER trg_reservations_autoassign_table;
-- Mimic the trusted canonical reservation RPC: auth.uid() is retained while
-- a definer inserts a customer's own reservation, firing the real trigger.
CREATE FUNCTION public.fixture_create_own_reservation(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.reservations(id,restaurant_id,user_id,date,time,party_size,status)
 VALUES(p_id,'72010000-0000-4000-8000-000000000001',auth.uid(),current_date+40,'19:00',2,'confirmed');
END $$;
GRANT EXECUTE ON FUNCTION public.fixture_create_own_reservation(uuid) TO authenticated;
