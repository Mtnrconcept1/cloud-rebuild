-- Commercial commission tracking for signed restaurant prospects.
-- Stores the subscription snapshot signed by the commercial and exposes a
-- server-side summary for fixed salary + reservation commission calculations.

ALTER TABLE public.commercial_prospect_followups
  ADD COLUMN IF NOT EXISTS signed_restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_subscription_plan_slug text,
  ADD COLUMN IF NOT EXISTS signed_subscription_plan_name text,
  ADD COLUMN IF NOT EXISTS signed_subscription_billing_period text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS signed_subscription_monthly_price_chf numeric(10, 2),
  ADD COLUMN IF NOT EXISTS signed_subscription_contract_value_chf numeric(10, 2),
  ADD COLUMN IF NOT EXISTS acquisition_commission_rate numeric(6, 4) NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS acquisition_commission_chf numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commercial_compensation_mode text NOT NULL DEFAULT 'commission_only',
  ADD COLUMN IF NOT EXISTS reservation_commission_rate numeric(6, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reservation_commission_starts_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commercial_prospect_followups_signed_plan_slug_check'
      AND conrelid = 'public.commercial_prospect_followups'::regclass
  ) THEN
    ALTER TABLE public.commercial_prospect_followups
      ADD CONSTRAINT commercial_prospect_followups_signed_plan_slug_check
      CHECK (
        signed_subscription_plan_slug IS NULL
        OR signed_subscription_plan_slug IN ('starter', 'pro', 'premium', 'elite')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commercial_prospect_followups_signed_billing_period_check'
      AND conrelid = 'public.commercial_prospect_followups'::regclass
  ) THEN
    ALTER TABLE public.commercial_prospect_followups
      ADD CONSTRAINT commercial_prospect_followups_signed_billing_period_check
      CHECK (signed_subscription_billing_period IN ('monthly', 'yearly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commercial_prospect_followups_compensation_mode_check'
      AND conrelid = 'public.commercial_prospect_followups'::regclass
  ) THEN
    ALTER TABLE public.commercial_prospect_followups
      ADD CONSTRAINT commercial_prospect_followups_compensation_mode_check
      CHECK (commercial_compensation_mode IN ('commission_only', 'fixed_plus_reservation'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commercial_prospect_followups_commission_rates_check'
      AND conrelid = 'public.commercial_prospect_followups'::regclass
  ) THEN
    ALTER TABLE public.commercial_prospect_followups
      ADD CONSTRAINT commercial_prospect_followups_commission_rates_check
      CHECK (
        acquisition_commission_rate >= 0
        AND acquisition_commission_rate <= 1
        AND reservation_commission_rate >= 0
        AND reservation_commission_rate <= 1
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commercial_prospect_followups_signed_restaurant_id
  ON public.commercial_prospect_followups(signed_restaurant_id)
  WHERE signed_restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commercial_prospect_followups_compensation_mode
  ON public.commercial_prospect_followups(commercial_compensation_mode)
  WHERE commercial_compensation_mode = 'fixed_plus_reservation';

COMMENT ON COLUMN public.commercial_prospect_followups.signed_restaurant_id
  IS 'Optional TOK restaurant id linked to the signed prospect for real reservation commission calculations.';

COMMENT ON COLUMN public.commercial_prospect_followups.signed_subscription_plan_slug
  IS 'Restaurant subscription plan slug signed by the commercial.';

COMMENT ON COLUMN public.commercial_prospect_followups.signed_subscription_billing_period
  IS 'Billing period snapshot for the signed subscription: monthly or yearly.';

COMMENT ON COLUMN public.commercial_prospect_followups.acquisition_commission_chf
  IS 'Calculated acquisition commission snapshot for the commercial on the signed subscription.';

COMMENT ON COLUMN public.commercial_prospect_followups.commercial_compensation_mode
  IS 'Commercial compensation mode for this signed prospect.';

COMMENT ON COLUMN public.commercial_prospect_followups.reservation_commission_rate
  IS 'Reservation commission rate for fixed commercial compensation mode. Defaults to 0 unless fixed mode applies.';

CREATE OR REPLACE FUNCTION public.get_commercial_prospect_commission_summary(
  p_source_objectid bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_followup public.commercial_prospect_followups%ROWTYPE;
  v_reservations_count integer := 0;
  v_reservation_base_chf numeric := 0;
  v_reservation_commission_chf numeric := 0;
  v_reservation_start timestamptz;
BEGIN
  IF p_source_objectid IS NULL THEN
    RAISE EXCEPTION 'source_objectid_required';
  END IF;

  IF auth.role() <> 'service_role'
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = v_actor_id
        AND ur.role::text IN ('admin', 'commercial')
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO v_followup
  FROM public.commercial_prospect_followups cpf
  WHERE cpf.source_objectid = p_source_objectid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'exists', false,
      'source_objectid', p_source_objectid
    );
  END IF;

  v_reservation_start := COALESCE(
    v_followup.reservation_commission_starts_at,
    v_followup.signed_at,
    v_followup.created_at
  );

  IF v_followup.status = 'signed'
    AND v_followup.commercial_compensation_mode = 'fixed_plus_reservation'
    AND v_followup.signed_restaurant_id IS NOT NULL
  THEN
    SELECT
      COUNT(*)::integer,
      COALESCE(SUM(GREATEST(COALESCE(r.total_amount, 0), COALESCE(r.billing_fee_chf, 0))), 0)::numeric
    INTO v_reservations_count, v_reservation_base_chf
    FROM public.reservations r
    WHERE r.restaurant_id = v_followup.signed_restaurant_id
      AND r.confirmed_at IS NOT NULL
      AND r.confirmed_at >= v_reservation_start
      AND NOT (r.status = 'cancelled' AND r.cancelled_by IN ('customer', 'admin'));

    v_reservation_commission_chf := v_reservation_base_chf * COALESCE(v_followup.reservation_commission_rate, 0);
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'source_objectid', v_followup.source_objectid,
    'signed_restaurant_id', v_followup.signed_restaurant_id,
    'subscription', jsonb_build_object(
      'plan_slug', v_followup.signed_subscription_plan_slug,
      'plan_name', v_followup.signed_subscription_plan_name,
      'billing_period', v_followup.signed_subscription_billing_period,
      'monthly_price_chf', v_followup.signed_subscription_monthly_price_chf,
      'contract_value_chf', v_followup.signed_subscription_contract_value_chf
    ),
    'acquisition_commission', jsonb_build_object(
      'rate', v_followup.acquisition_commission_rate,
      'amount_chf', round(COALESCE(v_followup.acquisition_commission_chf, 0), 2)
    ),
    'reservation_commission', jsonb_build_object(
      'enabled', v_followup.commercial_compensation_mode = 'fixed_plus_reservation',
      'rate', v_followup.reservation_commission_rate,
      'starts_at', v_reservation_start,
      'reservations_count', v_reservations_count,
      'base_chf', round(v_reservation_base_chf, 2),
      'amount_chf', round(v_reservation_commission_chf, 2)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_commercial_prospect_commission_summary(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_commercial_prospect_commission_summary(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
