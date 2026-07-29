-- Retrait de « Mon pack » et du modele Fair Growth a modules.
--
-- Le produit ne vend plus de modules de croissance a la carte. Le frais de
-- reservation devient un forfait unique de 5.- par table honoree, sans
-- plafond, sans distinction de source, sans module a activer.
--
-- Ce qui disparait : le catalogue fair_growth_modules, les souscriptions
-- restaurant_paid_modules et leur journal d'evenements, les RPC de cycle de
-- vie, les gardes qui les protegeaient, et le drapeau dashboard-pack qui
-- servait d'interrupteur entre les deux modeles.
--
-- Ce qui reste, et pourquoi :
--
--   * reservation_fee_charges et reservation_fee_adjustments sont des
--     journaux comptables. Ils portent l'historique deja facture sous
--     l'ancien modele. On cesse d'y ecrire ; on n'efface rien.
--
--   * private_finance.set_reservation_fair_growth_snapshot garde un nom
--     d'epoque mais ne fait pas de Fair Growth : il scelle la preuve
--     d'acquisition a la creation, rend immuable le couple honored_at /
--     billing_fee_chf, et interdit d'annuler ou de rembourser une table
--     facturee sans contre-passation. Le renommer casserait par ailleurs
--     l'ordre alphabetique dont depend apply_flat_reservation_fee_on_arrival.
--
--   * les colonnes de snapshot tarifaire des reservations restent alimentees.
--     Elles ne decident plus du montant, mais reservation_pricing_version
--     conditionne encore le garde d'immuabilite ci-dessus.

-------------------------------------------------------------------- 1. RPC

DROP FUNCTION IF EXISTS public.request_fair_growth_module(uuid, text);
DROP FUNCTION IF EXISTS public.pause_fair_growth_module(uuid, text);
DROP FUNCTION IF EXISTS public.resume_fair_growth_module(uuid, text);
DROP FUNCTION IF EXISTS public.cancel_fair_growth_module(uuid, text);
DROP FUNCTION IF EXISTS public.confirm_fair_growth_module_activation(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.process_fair_growth_module_credit(uuid, text, integer, text, text);
DROP FUNCTION IF EXISTS private_finance.transition_fair_growth_module(uuid, text, text, text, text, integer);

-- Ne lisait que les tables de modules : sans elles, elle n'a plus de source.
DROP FUNCTION IF EXISTS public.admin_get_fair_growth_reconciliation(integer, integer);

-------------------------------------------------------- 2. Gardes et tables

DROP FUNCTION IF EXISTS private_finance.assert_dashboard_pack_runtime_enabled(text);
DROP FUNCTION IF EXISTS private_finance.enforce_dashboard_pack_paid_module_write() CASCADE;
DROP FUNCTION IF EXISTS private_finance.guard_fair_growth_module_feature_keys() CASCADE;
DROP FUNCTION IF EXISTS private_finance.reject_demo_restaurant_paid_module() CASCADE;

-- Ce garde interdisait de supprimer ou renommer un drapeau reference par un
-- module. Sans catalogue, il n'a plus rien a proteger — et il lit une table
-- qui n'existera plus, ce qui ferait echouer la suppression du drapeau
-- dashboard-pack quelques instructions plus bas.
DROP FUNCTION IF EXISTS private_finance.guard_referenced_feature_flag() CASCADE;

DROP TABLE IF EXISTS public.restaurant_paid_module_events;
DROP TABLE IF EXISTS public.restaurant_paid_modules;
DROP TABLE IF EXISTS public.fair_growth_modules;

------------------------------------------------- 3. Forfait inconditionnel

-- Les deux appelants du drapeau sont reecrits avant sa suppression.
--
-- Le forfait ne depend plus de rien : plus d'interrupteur, donc plus de
-- lecture de feature_flags a chaque arrivee.
CREATE OR REPLACE FUNCTION private_finance.apply_flat_reservation_fee_on_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_flat_arrival_billing_candidate(NEW.status, OLD.status, NEW.honored_at) THEN
    RETURN NEW;
  END IF;

  -- Le garde de snapshot laisse passer l'ecriture uniquement sous ce reglage.
  PERFORM set_config('app.fair_growth_mark_honored', 'on', true);

  NEW.honored_at := COALESCE(NEW.honored_at, now());
  NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
  NEW.attributed_table_revenue_chf := COALESCE(NEW.attributed_table_revenue_chf, 0);
  NEW.billing_fee_chf := 5;

  INSERT INTO public.reservation_flat_fee_charges (
    reservation_id,
    restaurant_id,
    acquisition_source_snapshot,
    honored_at_snapshot,
    attributed_revenue_cents_snapshot,
    fee_cents
  )
  VALUES (
    NEW.id,
    NEW.restaurant_id,
    COALESCE(NULLIF(btrim(NEW.acquisition_source), ''), 'unknown'),
    NEW.honored_at,
    GREATEST(round(COALESCE(NEW.attributed_table_revenue_chf, 0) * 100)::integer, 0),
    500
  )
  ON CONFLICT (reservation_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private_finance.apply_flat_reservation_fee_on_arrival()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auto_arrive_overdue_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH due AS (
    SELECT reservation.id
    FROM public.reservations reservation
    WHERE reservation.honored_at IS NULL
      AND COALESCE(reservation.status, '') IN ('pending', 'confirmed')
      AND reservation.cancelled_by IS NULL
      AND (reservation.date + reservation.time) <= (now() AT TIME ZONE 'Europe/Zurich') - interval '1 hour'
      -- Bornee a la veille : une reservation tres ancienne releve d'une
      -- reprise manuelle, pas d'une bascule silencieuse.
      AND reservation.date >= (now() AT TIME ZONE 'Europe/Zurich')::date - 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.reservations reservation
  SET
    status = 'arrived',
    metadata = COALESCE(reservation.metadata, '{}'::jsonb)
      || jsonb_build_object('auto_arrived_at', now(), 'auto_arrived_reason', 'no_restaurant_action_within_one_hour')
  FROM due
  WHERE reservation.id = due.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_arrive_overdue_reservations()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_arrive_overdue_reservations() TO service_role;

DROP FUNCTION IF EXISTS private_finance.flat_reservation_billing_active();

------------------------------------------------------ 4. mark_reservation_honored

-- Le parcours de cloture ne calcule plus : il constate. Le chiffre d'affaires
-- reste accepte parce qu'il sert au suivi du restaurateur, mais il n'entre
-- plus dans le montant et devient donc facultatif.
--
-- Les gardes de revue administrative sur commission nulle disparaissent avec
-- le pourcentage qui les motivait : un forfait ne s'arrondit pas a zero. Les
-- maintenir aurait de surcroit contredit apply_flat_reservation_fee_on_arrival,
-- qui honore a 5.- avec un chiffre d'affaires nul.
CREATE OR REPLACE FUNCTION public.mark_reservation_honored(
  p_reservation_id uuid,
  p_attributed_table_revenue_chf numeric
)
RETURNS TABLE (
  updated boolean,
  error_code text,
  error_message text,
  fee_chf numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_attributed_revenue_cents integer;
  v_fee_cents constant integer := 500;
  v_honored_at timestamptz;
  v_adjustment_cents integer := 0;
  v_existing_charge public.reservation_fee_charges%ROWTYPE;
  v_is_privileged_reviewer boolean;
BEGIN
  IF p_reservation_id IS NULL THEN
    RETURN QUERY
      SELECT false, 'not_found', 'Reservation introuvable.', NULL::numeric;
    RETURN;
  END IF;

  IF p_attributed_table_revenue_chf IS NOT NULL
    AND (
      upper(p_attributed_table_revenue_chf::text) IN ('NAN', 'INFINITY', '-INFINITY')
      OR p_attributed_table_revenue_chf < 0
      OR p_attributed_table_revenue_chf > 21474836.47
    )
  THEN
    RETURN QUERY
      SELECT false, 'invalid_revenue',
        'Le chiffre d affaires attribue a la table est invalide.', NULL::numeric;
    RETURN;
  END IF;

  v_attributed_revenue_cents :=
    round(COALESCE(p_attributed_table_revenue_chf, 0) * 100)::integer;

  SELECT *
  INTO v_reservation
  FROM public.reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY
      SELECT false, 'not_found', 'Reservation introuvable.', NULL::numeric;
    RETURN;
  END IF;

  v_is_privileged_reviewer :=
    COALESCE(auth.role() = 'service_role', false)
    OR COALESCE(public.auth_is_admin(), false);
  IF NOT v_is_privileged_reviewer
    AND NOT COALESCE(
      public.auth_owns_restaurant(v_reservation.restaurant_id),
      false
    )
  THEN
    RETURN QUERY
      SELECT false, 'forbidden', 'Acces refuse.', NULL::numeric;
    RETURN;
  END IF;
  IF lower(v_reservation.status) IN (
    'cancelled', 'canceled', 'no_show', 'no-show'
  ) OR v_reservation.cancelled_at IS NOT NULL
  THEN
    RETURN QUERY
      SELECT false, 'not_honorable',
        'Une annulation ou un no-show ne peut pas etre facture.', NULL::numeric;
    RETURN;
  END IF;
  IF COALESCE(v_reservation.refunded_amount_chf, 0) > 0
    OR lower(COALESCE(v_reservation.refund_status, '')) IN (
      'pending', 'partial', 'refunded'
    )
  THEN
    RETURN QUERY
      SELECT false, 'refunded',
        'Une reservation remboursee ne peut pas etre facturee.', NULL::numeric;
    RETURN;
  END IF;
  IF lower(COALESCE(v_reservation.status, '')) NOT IN (
    'arrived', 'seated', 'completed'
  ) THEN
    RETURN QUERY
      SELECT false, 'service_not_completed',
        'La table doit etre arrivee, installee ou cloturee avant facturation.',
        NULL::numeric;
    RETURN;
  END IF;

  -- Reservation deja facturee sous l'ancien modele : le journal fait foi.
  SELECT *
  INTO v_existing_charge
  FROM public.reservation_fee_charges charge
  WHERE charge.reservation_id = p_reservation_id;
  IF FOUND THEN
    SELECT COALESCE(sum(adjustment.adjustment_cents), 0)::integer
    INTO v_adjustment_cents
    FROM public.reservation_fee_adjustments adjustment
    WHERE adjustment.reservation_fee_charge_id = v_existing_charge.id;

    PERFORM set_config('app.fair_growth_mark_honored', 'on', true);
    UPDATE public.reservations reservation
    SET
      status = 'completed',
      honored_at = COALESCE(
        reservation.honored_at,
        v_existing_charge.honored_at_snapshot
      ),
      confirmed_at = COALESCE(
        reservation.confirmed_at,
        v_existing_charge.honored_at_snapshot
      ),
      attributed_table_revenue_chf =
        v_existing_charge.attributed_revenue_cents_snapshot::numeric / 100,
      billing_fee_chf =
        v_existing_charge.fee_cents::numeric / 100,
      updated_at = now()
    WHERE reservation.id = p_reservation_id;

    RETURN QUERY
      SELECT true, NULL::text, NULL::text,
        (v_existing_charge.fee_cents + v_adjustment_cents)::numeric / 100;
    RETURN;
  END IF;

  -- Deja honoree, typiquement par le passage en « arrivee ». Le montant est
  -- scelle ; on ne fait que confirmer la cloture.
  IF v_reservation.honored_at IS NOT NULL THEN
    PERFORM set_config('app.fair_growth_mark_honored', 'on', true);
    UPDATE public.reservations reservation
    SET
      status = 'completed',
      confirmed_at = COALESCE(reservation.confirmed_at, now()),
      updated_at = now()
    WHERE reservation.id = p_reservation_id;

    RETURN QUERY
      SELECT true, NULL::text, NULL::text,
        round(COALESCE(v_reservation.billing_fee_chf, 0), 2);
    RETURN;
  END IF;

  v_honored_at := now();

  INSERT INTO public.reservation_flat_fee_charges (
    reservation_id,
    restaurant_id,
    acquisition_source_snapshot,
    honored_at_snapshot,
    attributed_revenue_cents_snapshot,
    fee_cents
  )
  VALUES (
    v_reservation.id,
    v_reservation.restaurant_id,
    COALESCE(NULLIF(btrim(v_reservation.acquisition_source), ''), 'unknown'),
    v_honored_at,
    v_attributed_revenue_cents,
    v_fee_cents
  )
  ON CONFLICT (reservation_id) DO NOTHING;

  PERFORM set_config('app.fair_growth_mark_honored', 'on', true);
  UPDATE public.reservations reservation
  SET
    status = 'completed',
    honored_at = v_honored_at,
    confirmed_at = COALESCE(reservation.confirmed_at, v_honored_at),
    attributed_table_revenue_chf =
      v_attributed_revenue_cents::numeric / 100,
    billing_fee_chf = v_fee_cents::numeric / 100,
    reservation_fee_waiver_reason = NULL,
    updated_at = now()
  WHERE reservation.id = p_reservation_id;

  RETURN QUERY
    SELECT true, NULL::text, NULL::text, v_fee_cents::numeric / 100;
END;
$function$;

--------------------------------------------------- 5. Grille des abonnements

-- Le frais par reservation cesse de dependre du plan. La colonne reste : elle
-- alimente reservation_fee_list_cents_snapshot, donc le montant affiche sur le
-- contrat signe. La laisser a 300 pour Elite ferait afficher « CHF 3.00 /
-- reservation » a un restaurant reellement facture 5.-.
--
-- Le plafond passe a 100 % : il n'a plus d'effet, mais la colonne est NOT NULL
-- et son snapshot conditionne encore des gardes existants.
UPDATE public.restaurant_subscription_plans
SET
  acquired_reservation_fee_cents = 500,
  reservation_revenue_cap_bps = 10000,
  updated_at = now()
WHERE acquired_reservation_fee_cents <> 500
   OR reservation_revenue_cap_bps <> 10000;

------------------------------------------------------------- 6. Drapeau

-- L'interrupteur n'a plus de second modele a designer.
DELETE FROM public.feature_flags WHERE name = 'dashboard-pack';

NOTIFY pgrst, 'reload schema';
