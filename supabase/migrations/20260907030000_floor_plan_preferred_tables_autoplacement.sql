-- Tables attitrées et placement automatique des réservations.
--
-- Objectif : un client habitué retrouve sa table sans intervention, et toute
-- réservation reçoit une table dès sa création quand la salle en a une de libre.
--
-- L'affectation reste soumise aux mêmes règles que
-- restaurant_save_floor_plan_assignments (capacité suffisante, pas de
-- chevauchement sur la table). Ces règles sont extraites ici en fonctions
-- réutilisables pour qu'il n'existe qu'une seule définition de « la table est
-- libre à cette heure-là ».

-- ---------------------------------------------------------------------------
-- Origine d'une affectation : distingue un placement automatique d'un
-- placement décidé par le restaurateur. restaurant_save_floor_plan_assignments
-- réinsère les créneaux sans préciser la colonne, donc un déplacement manuel
-- repasse naturellement en 'manual'.
-- ---------------------------------------------------------------------------
ALTER TABLE public.reservation_slots
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.reservation_slots
  DROP CONSTRAINT IF EXISTS reservation_slots_source_check;

ALTER TABLE public.reservation_slots
  ADD CONSTRAINT reservation_slots_source_check
  CHECK (source IN ('manual', 'auto', 'preferred'));

-- ---------------------------------------------------------------------------
-- Table attitrée : un client, une table, par restaurant.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_preferred_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.reservation_tables(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_preferred_tables_unique_customer UNIQUE (restaurant_id, user_id)
);

CREATE INDEX IF NOT EXISTS restaurant_preferred_tables_branch_idx
  ON public.restaurant_preferred_tables (branch_id);
CREATE INDEX IF NOT EXISTS restaurant_preferred_tables_table_idx
  ON public.restaurant_preferred_tables (table_id);

ALTER TABLE public.restaurant_preferred_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS restaurant_preferred_tables_owner_select ON public.restaurant_preferred_tables;
CREATE POLICY restaurant_preferred_tables_owner_select
  ON public.restaurant_preferred_tables
  FOR SELECT
  TO authenticated
  USING (public.auth_can_access_branch(branch_id));

-- L'écriture passe exclusivement par restaurant_set_preferred_table, qui
-- valide l'appartenance de la table à la salle.
DROP POLICY IF EXISTS restaurant_preferred_tables_owner_write ON public.restaurant_preferred_tables;

REVOKE ALL ON public.restaurant_preferred_tables FROM PUBLIC, anon;
GRANT SELECT ON public.restaurant_preferred_tables TO authenticated;

-- ---------------------------------------------------------------------------
-- Durée d'occupation d'une réservation.
-- Doit rester alignée sur restaurant_save_floor_plan_assignments : toute
-- divergence ferait proposer des placements que la sauvegarde refuse ensuite.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Attitrer (ou retirer) une table à un client.
-- p_table_id NULL retire l'attribution.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurant_set_preferred_table(
  p_branch_id uuid,
  p_user_id uuid,
  p_table_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_branch record;
  v_table record;
  v_previous uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Branch id is required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Customer id is required'; END IF;

  SELECT rb.id, rb.restaurant_id INTO v_branch
  FROM public.restaurant_branches rb WHERE rb.id = p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found'; END IF;

  IF NOT public.auth_can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'Not allowed to update this floor plan';
  END IF;

  SELECT pt.table_id INTO v_previous
  FROM public.restaurant_preferred_tables pt
  WHERE pt.restaurant_id = v_branch.restaurant_id AND pt.user_id = p_user_id;

  IF p_table_id IS NULL THEN
    DELETE FROM public.restaurant_preferred_tables
    WHERE restaurant_id = v_branch.restaurant_id AND user_id = p_user_id;
  ELSE
    SELECT rt.id, rt.branch_id, rt.is_active INTO v_table
    FROM public.reservation_tables rt WHERE rt.id = p_table_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Table not found'; END IF;
    IF v_table.branch_id <> p_branch_id THEN
      RAISE EXCEPTION 'Table does not belong to this branch';
    END IF;
    IF COALESCE(v_table.is_active, true) IS NOT TRUE THEN
      RAISE EXCEPTION 'Table is inactive';
    END IF;

    INSERT INTO public.restaurant_preferred_tables AS pt
      (restaurant_id, branch_id, user_id, table_id, created_by)
    VALUES (v_branch.restaurant_id, p_branch_id, p_user_id, p_table_id, v_actor)
    ON CONFLICT (restaurant_id, user_id) DO UPDATE
      SET branch_id = EXCLUDED.branch_id,
          table_id = EXCLUDED.table_id,
          updated_at = now();
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_set_preferred_table',
    'restaurant_branch',
    p_branch_id,
    jsonb_build_object('table_id', v_previous),
    jsonb_build_object('user_id', p_user_id, 'table_id', p_table_id)
  );

  RETURN jsonb_build_object('user_id', p_user_id, 'table_id', p_table_id);
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_set_preferred_table(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_set_preferred_table(uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Placement automatique d'une réservation.
--
-- Ordre : la table attitrée du client d'abord, sinon la plus petite table
-- libre qui accueille le groupe. Ne fait rien si la réservation a déjà une
-- table : un placement manuel n'est jamais écrasé.
-- ---------------------------------------------------------------------------
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
