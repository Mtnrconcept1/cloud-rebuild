-- Smoke test du placement automatique et des tables attitrées.
-- À lancer après application des migrations :
--   supabase db reset --local
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/floor_plan_autoplacement_smoke.sql
--
-- Couvre le trigger trg_reservations_autoassign_table et la RPC
-- restaurant_set_preferred_table introduits par
-- 20260907030000_floor_plan_preferred_tables_autoplacement.sql.

BEGIN;

DO $smoke$
DECLARE
  v_owner_id uuid := gen_random_uuid();
  v_habitue_id uuid := gen_random_uuid();
  v_client_b uuid := gen_random_uuid();
  v_restaurant_id uuid := gen_random_uuid();
  v_branch_id uuid := gen_random_uuid();
  v_table_2 uuid := gen_random_uuid();
  v_table_4 uuid := gen_random_uuid();
  v_table_8 uuid := gen_random_uuid();
  v_res_a uuid := gen_random_uuid();
  v_res_b uuid := gen_random_uuid();
  v_res_c uuid := gen_random_uuid();
  v_res_d uuid := gen_random_uuid();
  v_service_date date := (CURRENT_DATE + 30);
  v_table text;
  v_source text;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES
    (v_owner_id, 'owner-' || v_owner_id || '@example.test', '', now(), now(), now()),
    (v_habitue_id, 'habitue-' || v_habitue_id || '@example.test', '', now(), now(), now()),
    (v_client_b, 'client-' || v_client_b || '@example.test', '', now(), now(), now());

  INSERT INTO public.restaurants (id, owner_id, name)
  VALUES (v_restaurant_id, v_owner_id, 'Smoke Plan de salle');

  INSERT INTO public.restaurant_branches (id, restaurant_id, name, address, city, postal_code, country)
  VALUES (v_branch_id, v_restaurant_id, 'Salle', '1 rue du Test', 'Genève', '1200', 'CH');

  INSERT INTO public.reservation_tables (id, branch_id, table_number, capacity, is_active)
  VALUES
    (v_table_2, v_branch_id, 'T2', 2, true),
    (v_table_4, v_branch_id, 'T4', 4, true),
    (v_table_8, v_branch_id, 'T8', 8, true);

  -- 1. Sans habitude, un duo prend la plus petite table qui l'accueille.
  INSERT INTO public.reservations (id, restaurant_id, user_id, date, time, party_size, status)
  VALUES (v_res_a, v_restaurant_id, v_client_b, v_service_date, '19:00', 2, 'confirmed');

  SELECT rt.table_number, rs.source INTO v_table, v_source
  FROM public.reservation_slots rs
  JOIN public.reservation_tables rt ON rt.id = rs.table_id
  WHERE rs.reservation_id = v_res_a;

  IF v_table IS DISTINCT FROM 'T2' THEN
    RAISE EXCEPTION 'Placement auto: attendu T2, obtenu %', COALESCE(v_table, 'aucune');
  END IF;
  IF v_source IS DISTINCT FROM 'auto' THEN
    RAISE EXCEPTION 'Origine attendue "auto", obtenue %', COALESCE(v_source, 'null');
  END IF;

  -- 2. Une table attitrée est honorée même si elle est plus grande.
  INSERT INTO public.restaurant_preferred_tables (restaurant_id, branch_id, user_id, table_id)
  VALUES (v_restaurant_id, v_branch_id, v_habitue_id, v_table_8);

  INSERT INTO public.reservations (id, restaurant_id, user_id, date, time, party_size, status)
  VALUES (v_res_b, v_restaurant_id, v_habitue_id, v_service_date, '19:00', 2, 'confirmed');

  SELECT rt.table_number, rs.source INTO v_table, v_source
  FROM public.reservation_slots rs
  JOIN public.reservation_tables rt ON rt.id = rs.table_id
  WHERE rs.reservation_id = v_res_b;

  IF v_table IS DISTINCT FROM 'T8' THEN
    RAISE EXCEPTION 'Table attitrée: attendu T8, obtenu %', COALESCE(v_table, 'aucune');
  END IF;
  IF v_source IS DISTINCT FROM 'preferred' THEN
    RAISE EXCEPTION 'Origine attendue "preferred", obtenue %', COALESCE(v_source, 'null');
  END IF;

  -- 3. La table attitrée occupée sur le créneau : repli sur une autre table.
  INSERT INTO public.reservations (id, restaurant_id, user_id, date, time, party_size, status)
  VALUES (v_res_c, v_restaurant_id, v_habitue_id, v_service_date, '19:30', 4, 'confirmed');

  SELECT rt.table_number INTO v_table
  FROM public.reservation_slots rs
  JOIN public.reservation_tables rt ON rt.id = rs.table_id
  WHERE rs.reservation_id = v_res_c;

  IF v_table IS DISTINCT FROM 'T4' THEN
    RAISE EXCEPTION 'Repli attendu sur T4, obtenu %', COALESCE(v_table, 'aucune');
  END IF;

  -- 4. Un groupe qui ne rentre nulle part ne fait pas échouer la réservation.
  INSERT INTO public.reservations (id, restaurant_id, user_id, date, time, party_size, status)
  VALUES (v_res_d, v_restaurant_id, v_client_b, v_service_date, '19:15', 20, 'confirmed');

  IF NOT EXISTS (SELECT 1 FROM public.reservations WHERE id = v_res_d) THEN
    RAISE EXCEPTION 'La réservation hors capacité aurait dû être créée';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservation_slots WHERE reservation_id = v_res_d) THEN
    RAISE EXCEPTION 'La réservation hors capacité ne doit recevoir aucune table';
  END IF;

  -- 5. La RPC d'attribution refuse un acteur qui ne gère pas la salle.
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_client_b::text)::text, true);
  BEGIN
    PERFORM public.restaurant_set_preferred_table(v_branch_id, v_habitue_id, v_table_4);
    RAISE EXCEPTION 'Un tiers a pu attitrer une table';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Un tiers a pu attitrer une table' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'floor plan autoplacement smoke test: OK';
END
$smoke$;

ROLLBACK;
