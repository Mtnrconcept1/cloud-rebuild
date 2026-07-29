-- Facturation de repli quand « Mon pack » / Fair Growth sont coupes.
--
-- Le modele Fair Growth ne facture que les reservations apportees par le
-- marketplace TOK, et plafonne le frais a 7 % du couvert : min(5.-, 7 %). Ces
-- deux regles ne sont pas applicatives, elles sont gravees en contraintes
-- CHECK sur reservation_fee_charges. Quand l'administration coupe le module,
-- ce barometre n'a plus lieu d'etre et la facturation retombe sur un forfait.
--
-- Regle retenue : 5.- par reservation honoree, toutes sources confondues et
-- sans plafond. Les commandes zero attente restent commissionnees a 10 % par
-- ailleurs ; un zero attente creant a la fois une reservation et une commande,
-- il paie donc le forfait et le pourcentage.
--
-- Le forfait n'entre pas dans reservation_fee_charges : il en violerait les
-- deux contraintes. Plutot que d'affaiblir des garanties qui doivent tenir des
-- que le module revient, il dispose de son propre journal immuable. Les deux
-- alimentent billing_fee_chf, seule colonne que lit la facturation.

CREATE OR REPLACE FUNCTION private_finance.flat_reservation_billing_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $flat_active$
  -- Absence de drapeau = module absent = repli actif : le defaut protege la
  -- recette plutot que de facturer zero en silence.
  SELECT NOT COALESCE(
    (SELECT flag.is_active FROM public.feature_flags flag WHERE flag.name = 'dashboard-pack'),
    false
  );
$flat_active$;

REVOKE ALL ON FUNCTION private_finance.flat_reservation_billing_active()
  FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.reservation_flat_fee_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  acquisition_source_snapshot text NOT NULL,
  honored_at_snapshot timestamptz NOT NULL,
  attributed_revenue_cents_snapshot integer NOT NULL CHECK (attributed_revenue_cents_snapshot >= 0),
  -- Forfait, donc montant fige : toute autre valeur signale une regression.
  fee_cents integer NOT NULL CHECK (fee_cents = 500),
  invoice_id uuid REFERENCES public.restaurant_invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_flat_fee_charges_restaurant
  ON public.reservation_flat_fee_charges (restaurant_id, honored_at_snapshot DESC);

ALTER TABLE public.reservation_flat_fee_charges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.reservation_flat_fee_charges FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.reservation_flat_fee_charges TO service_role;

DROP POLICY IF EXISTS "reservation_flat_fee_charges_admin_read" ON public.reservation_flat_fee_charges;
CREATE POLICY "reservation_flat_fee_charges_admin_read"
  ON public.reservation_flat_fee_charges
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

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
  v_flat_billing boolean;
  v_reservation public.reservations%ROWTYPE;
  v_attributed_revenue_cents integer;
  v_fee_cents integer;
  v_developer_share_cents integer;
  v_plan_slug text;
  v_honored_at timestamptz;
  v_adjustment_cents integer := 0;
  v_existing_charge public.reservation_fee_charges%ROWTYPE;
  v_is_privileged_reviewer boolean;
  v_reviewer_role text;
BEGIN
  IF p_reservation_id IS NULL
    OR p_attributed_table_revenue_chf IS NULL
    OR upper(p_attributed_table_revenue_chf::text) IN ('NAN', 'INFINITY', '-INFINITY')
    OR p_attributed_table_revenue_chf < 0
    OR p_attributed_table_revenue_chf > 21474836.47
  THEN
    RETURN QUERY
      SELECT false, 'invalid_revenue',
        'Le chiffre d affaires attribue a la table est requis.', NULL::numeric;
    RETURN;
  END IF;
  v_attributed_revenue_cents :=
    round(p_attributed_table_revenue_chf * 100)::integer;

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
  IF v_reservation.acquisition_source = 'tok_marketplace'
    AND v_attributed_revenue_cents = 0
    AND NOT v_is_privileged_reviewer
  THEN
    RETURN QUERY
      SELECT false, 'zero_revenue_requires_review',
        'Un chiffre d affaires nul pour un lead TOK exige une revue administrative.',
        NULL::numeric;
    RETURN;
  END IF;

  v_reviewer_role := CASE
    WHEN auth.role() = 'service_role' THEN 'service_role'
    WHEN v_is_privileged_reviewer THEN 'admin'
    ELSE NULL
  END;

  SELECT *
  INTO v_existing_charge
  FROM public.reservation_fee_charges charge
  WHERE charge.reservation_id = p_reservation_id;
  IF FOUND THEN
    IF v_existing_charge.fee_cents = 0 AND NOT v_is_privileged_reviewer THEN
      RETURN QUERY
        SELECT false, 'zero_fee_requires_review',
          'Une commission arrondie a zero pour un lead TOK exige une revue administrative.',
          NULL::numeric;
      RETURN;
    END IF;
    IF v_existing_charge.attributed_revenue_cents_snapshot
      <> v_attributed_revenue_cents
    THEN
      RETURN QUERY
        SELECT false, 'honor_snapshot_locked',
          'Le chiffre d affaires honore est deja verrouille.', NULL::numeric;
      RETURN;
    END IF;

    SELECT COALESCE(sum(adjustment.adjustment_cents), 0)::integer
    INTO v_adjustment_cents
    FROM public.reservation_fee_adjustments adjustment
    WHERE adjustment.reservation_fee_charge_id = v_existing_charge.id;

    -- Heal pre-migration rows idempotently: an existing immutable charge is
    -- authoritative and completion can safely be brought into sync.
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

  IF v_reservation.honored_at IS NOT NULL THEN
    IF round(
      COALESCE(v_reservation.attributed_table_revenue_chf, 0) * 100
    )::integer <> v_attributed_revenue_cents
    THEN
      RETURN QUERY
        SELECT false, 'honor_snapshot_locked',
          'Le chiffre d affaires honore est deja verrouille.', NULL::numeric;
      RETURN;
    END IF;

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

  v_flat_billing := private_finance.flat_reservation_billing_active();

  IF v_flat_billing THEN
    -- Modules coupes : forfait sur toute reservation honoree, quelle que soit
    -- sa source et sans plafond. Le barometre Fair Growth ne s'applique plus.
    v_fee_cents := 500;
  ELSE
    v_fee_cents := CASE
      WHEN v_reservation.acquisition_source <> 'tok_marketplace'
        OR v_reservation.reservation_pricing_version IS NULL
        THEN 0
      ELSE least(
        COALESCE(v_reservation.reservation_fee_list_cents_snapshot, 500),
        round(
          v_attributed_revenue_cents::numeric
          * COALESCE(v_reservation.reservation_fee_cap_bps_snapshot, 700)
          / 10000
        )::integer
      )
    END;
  END IF;
  v_developer_share_cents :=
    round(v_fee_cents::numeric * 1000 / 10000)::integer;

  IF v_reservation.acquisition_source = 'tok_marketplace'
    AND v_reservation.reservation_pricing_version IS NOT NULL
    AND v_fee_cents = 0
    AND NOT v_is_privileged_reviewer
  THEN
    RETURN QUERY
      SELECT false, 'zero_fee_requires_review',
        'Une commission arrondie a zero pour un lead TOK exige une revue administrative.',
        NULL::numeric;
    RETURN;
  END IF;

  v_plan_slug :=
    COALESCE(v_reservation.reservation_plan_slug_snapshot, 'starter');
  v_honored_at := now();

  IF v_flat_billing THEN
    -- Le registre Fair Growth garantit par contrainte le plafond et la source
    -- marketplace. Un forfait n'y entrerait pas : il a son propre journal.
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
  ELSIF v_reservation.acquisition_source = 'tok_marketplace'
    AND v_reservation.reservation_pricing_version IS NOT NULL
  THEN
    INSERT INTO public.reservation_fee_charges (
      reservation_id,
      restaurant_id,
      plan_slug_snapshot,
      pricing_version_snapshot,
      acquisition_source_snapshot,
      honored_at_snapshot,
      attributed_revenue_cents_snapshot,
      flat_fee_cents_snapshot,
      cap_bps_snapshot,
      fee_cents,
      developer_share_bps_snapshot,
      developer_share_cents,
      tok_share_cents,
      zero_revenue_reviewed_at,
      zero_revenue_reviewed_by,
      zero_revenue_reviewer_role,
      zero_revenue_waiver_reason
    )
    VALUES (
      v_reservation.id,
      v_reservation.restaurant_id,
      v_plan_slug,
      COALESCE(
        v_reservation.reservation_pricing_version,
        'fair_growth_2026_07'
      ),
      'tok_marketplace',
      v_honored_at,
      v_attributed_revenue_cents,
      COALESCE(v_reservation.reservation_fee_list_cents_snapshot, 500),
      COALESCE(v_reservation.reservation_fee_cap_bps_snapshot, 700),
      v_fee_cents,
      1000,
      v_developer_share_cents,
      v_fee_cents - v_developer_share_cents,
      CASE WHEN v_fee_cents = 0 THEN v_honored_at ELSE NULL END,
      CASE WHEN v_fee_cents = 0 THEN auth.uid() ELSE NULL END,
      CASE WHEN v_fee_cents = 0 THEN v_reviewer_role ELSE NULL END,
      CASE
        WHEN v_fee_cents = 0 THEN
          CASE
            WHEN v_attributed_revenue_cents = 0
              THEN 'zero_revenue_admin_review'
            ELSE 'zero_fee_rounding_admin_review'
          END
        ELSE NULL
      END
    )
    ON CONFLICT (reservation_id) DO NOTHING;

    SELECT charge.*
    INTO v_existing_charge
    FROM public.reservation_fee_charges charge
    WHERE charge.reservation_id = v_reservation.id;
    IF v_existing_charge.id IS NULL
      OR v_existing_charge.attributed_revenue_cents_snapshot
        <> v_attributed_revenue_cents
      OR v_existing_charge.fee_cents <> v_fee_cents
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'reservation_fee_charge_concurrency_conflict';
    END IF;
  END IF;

  PERFORM set_config('app.fair_growth_mark_honored', 'on', true);
  UPDATE public.reservations reservation
  SET
    status = 'completed',
    honored_at = v_honored_at,
    confirmed_at = COALESCE(reservation.confirmed_at, v_honored_at),
    attributed_table_revenue_chf =
      v_attributed_revenue_cents::numeric / 100,
    billing_fee_chf = v_fee_cents::numeric / 100,
    reservation_fee_waiver_reason = CASE
      WHEN reservation.reservation_pricing_version IS NULL
        THEN 'pre_fair_growth_unverified_source'
      WHEN reservation.acquisition_source <> 'tok_marketplace'
        THEN 'free_direct_source'
      WHEN v_fee_cents = 0 AND v_attributed_revenue_cents = 0
        THEN 'zero_revenue_admin_review'
      WHEN v_fee_cents = 0
        THEN 'zero_fee_rounding_admin_review'
      ELSE NULL
    END,
    metadata = CASE
      WHEN reservation.acquisition_source = 'tok_marketplace'
        AND v_fee_cents = 0
      THEN COALESCE(reservation.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'fair_growth_zero_revenue_review',
          jsonb_build_object(
            'reviewed_at', v_honored_at,
            'reviewed_by', auth.uid(),
            'reviewer_role', v_reviewer_role,
            'waiver_reason', CASE
              WHEN v_attributed_revenue_cents = 0
                THEN 'zero_revenue_admin_review'
              ELSE 'zero_fee_rounding_admin_review'
            END
          )
        )
      ELSE reservation.metadata
    END,
    updated_at = now()
  WHERE reservation.id = p_reservation_id;

  RETURN QUERY
    SELECT true, NULL::text, NULL::text, v_fee_cents::numeric / 100;
END;
$function$;

NOTIFY pgrst, 'reload schema';
