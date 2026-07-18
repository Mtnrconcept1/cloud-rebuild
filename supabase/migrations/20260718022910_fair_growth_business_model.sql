-- Fair Growth pricing and billing model.
-- Advertised CHF amounts are tax-inclusive unless a contract snapshot says otherwise.

BEGIN;

-- ---------------------------------------------------------------------------
-- Versioned plan catalogue
-- ---------------------------------------------------------------------------

ALTER TABLE public.restaurant_subscription_plans
  ADD COLUMN IF NOT EXISTS public_name text,
  ADD COLUMN IF NOT EXISTS acquired_reservation_fee_cents integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS marketplace_commission_bps integer NOT NULL DEFAULT 990,
  ADD COLUMN IF NOT EXISTS included_establishments integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS additional_establishment_price_cents integer,
  ADD COLUMN IF NOT EXISTS annual_months_charged integer NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS reservation_revenue_cap_bps integer NOT NULL DEFAULT 700,
  ADD COLUMN IF NOT EXISTS developer_order_bps integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS developer_tok_revenue_bps integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS pricing_version text NOT NULL DEFAULT 'fair_growth_2026_07';

ALTER TABLE public.restaurant_subscription_plans
  DROP CONSTRAINT IF EXISTS restaurant_subscription_plans_fair_growth_rates_check;
ALTER TABLE public.restaurant_subscription_plans
  ADD CONSTRAINT restaurant_subscription_plans_fair_growth_rates_check CHECK (
    acquired_reservation_fee_cents BETWEEN 0 AND 100000
    AND marketplace_commission_bps BETWEEN 0 AND 10000
    AND included_establishments BETWEEN 1 AND 100
    AND (additional_establishment_price_cents IS NULL OR additional_establishment_price_cents > 0)
    AND annual_months_charged BETWEEN 1 AND 12
    AND reservation_revenue_cap_bps BETWEEN 0 AND 10000
    AND developer_order_bps BETWEEN 0 AND marketplace_commission_bps
    AND developer_tok_revenue_bps BETWEEN 0 AND 10000
  );

UPDATE public.restaurant_subscription_plans
SET public_name = CASE slug
      WHEN 'starter' THEN 'Starter'
      WHEN 'pro' THEN 'Business'
      WHEN 'premium' THEN 'Premium'
      WHEN 'elite' THEN 'Elite'
    END,
    name = CASE slug
      WHEN 'starter' THEN 'TOK Starter'
      WHEN 'pro' THEN 'TOK Business'
      WHEN 'premium' THEN 'TOK Premium'
      WHEN 'elite' THEN 'TOK Elite'
    END,
    price_monthly_chf = CASE slug
      WHEN 'starter' THEN 69
      WHEN 'pro' THEN 129
      WHEN 'premium' THEN 199
      WHEN 'elite' THEN 499
    END,
    acquired_reservation_fee_cents = CASE slug
      WHEN 'starter' THEN 500
      WHEN 'pro' THEN 450
      WHEN 'premium' THEN 400
      WHEN 'elite' THEN 300
    END,
    marketplace_commission_bps = CASE slug
      WHEN 'starter' THEN 990
      WHEN 'pro' THEN 890
      WHEN 'premium' THEN 790
      WHEN 'elite' THEN 690
    END,
    included_establishments = CASE WHEN slug = 'elite' THEN 3 ELSE 1 END,
    additional_establishment_price_cents = CASE WHEN slug = 'elite' THEN 14900 ELSE NULL END,
    annual_months_charged = 11,
    reservation_revenue_cap_bps = 700,
    developer_order_bps = 100,
    developer_tok_revenue_bps = 1000,
    pricing_version = 'fair_growth_2026_07',
    updated_at = now()
WHERE slug IN ('starter', 'pro', 'premium', 'elite');

-- Preserve custom/legacy catalogue rows while making the display snapshot
-- total. Fair Growth pricing above remains limited to its four known slugs.
UPDATE public.restaurant_subscription_plans
SET public_name = COALESCE(
      NULLIF(trim(public_name), ''),
      NULLIF(trim(name), ''),
      NULLIF(initcap(replace(COALESCE(slug, ''), '-', ' ')), ''),
      'Offre TOK'
    ),
    updated_at = now()
WHERE NULLIF(trim(public_name), '') IS NULL;

ALTER TABLE public.restaurant_subscription_plans
  ALTER COLUMN public_name SET NOT NULL;

ALTER TABLE public.signup_applications
  DROP CONSTRAINT IF EXISTS signup_applications_subscription_billing_period_check;
ALTER TABLE public.signup_applications
  ADD CONSTRAINT signup_applications_subscription_billing_period_check CHECK (
    selected_subscription_billing_period IS NULL
    OR selected_subscription_billing_period IN ('monthly', 'yearly')
  );

ALTER TABLE public.restaurant_ai_subscriptions
  ADD COLUMN IF NOT EXISTS billing_amount_chf_snapshot numeric,
  ADD COLUMN IF NOT EXISTS price_monthly_cents_snapshot integer,
  ADD COLUMN IF NOT EXISTS billing_amount_cents_snapshot integer,
  ADD COLUMN IF NOT EXISTS billing_net_cents_snapshot integer,
  ADD COLUMN IF NOT EXISTS billing_vat_cents_snapshot integer,
  ADD COLUMN IF NOT EXISTS vat_rate_bps_snapshot integer,
  ADD COLUMN IF NOT EXISTS annual_months_charged_snapshot integer,
  ADD COLUMN IF NOT EXISTS acquired_reservation_fee_cents_snapshot integer,
  ADD COLUMN IF NOT EXISTS marketplace_commission_bps_snapshot integer,
  ADD COLUMN IF NOT EXISTS included_establishments_snapshot integer,
  ADD COLUMN IF NOT EXISTS additional_establishment_price_cents_snapshot integer,
  ADD COLUMN IF NOT EXISTS reservation_revenue_cap_bps_snapshot integer,
  ADD COLUMN IF NOT EXISTS developer_order_bps_snapshot integer,
  ADD COLUMN IF NOT EXISTS developer_tok_revenue_bps_snapshot integer,
  ADD COLUMN IF NOT EXISTS pricing_version_snapshot text;

ALTER TABLE public.restaurant_ai_subscriptions
  DROP CONSTRAINT IF EXISTS restaurant_ai_subscriptions_fair_growth_money_snapshot_check;
ALTER TABLE public.restaurant_ai_subscriptions
  ADD CONSTRAINT restaurant_ai_subscriptions_fair_growth_money_snapshot_check CHECK (
    (price_monthly_cents_snapshot IS NULL OR price_monthly_cents_snapshot >= 0)
    AND (billing_amount_cents_snapshot IS NULL OR billing_amount_cents_snapshot >= 0)
    AND (billing_net_cents_snapshot IS NULL OR billing_net_cents_snapshot >= 0)
    AND (billing_vat_cents_snapshot IS NULL OR billing_vat_cents_snapshot >= 0)
    AND (vat_rate_bps_snapshot IS NULL OR vat_rate_bps_snapshot BETWEEN 1 AND 10000)
    AND (
      (billing_amount_cents_snapshot IS NULL
        AND billing_net_cents_snapshot IS NULL
        AND billing_vat_cents_snapshot IS NULL)
      OR (billing_amount_cents_snapshot IS NOT NULL
        AND billing_net_cents_snapshot IS NOT NULL
        AND billing_vat_cents_snapshot IS NOT NULL
        AND billing_net_cents_snapshot + billing_vat_cents_snapshot = billing_amount_cents_snapshot)
    )
  );

ALTER TABLE public.finance_runtime_config
  ADD COLUMN IF NOT EXISTS developer_order_bps integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS standard_vat_bps integer NOT NULL DEFAULT 810,
  ADD COLUMN IF NOT EXISTS reduced_vat_bps integer NOT NULL DEFAULT 260;

UPDATE public.finance_runtime_config
SET developer_order_bps = 100,
    standard_vat_bps = 810,
    reduced_vat_bps = 260,
    metadata = metadata || jsonb_build_object(
      'pricing_version', 'fair_growth_2026_07',
      'restaurant_minimum_share_bps', 9000,
      'tips_to_restaurant_bps', 10000,
      'stripe_cost_bearer', 'tok'
    ),
    updated_at = now()
WHERE config_key = 'default';

CREATE OR REPLACE FUNCTION private_finance.normalize_financial_ledger_stripe_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_livemode boolean;
  v_expected_stripe_mode text;
BEGIN
  IF left(NEW.source_type, 7) = 'stripe_' THEN
    IF NEW.stripe_event_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_ledger_event_required';
    END IF;
    SELECT event.livemode INTO v_event_livemode
    FROM public.stripe_webhook_events event
    WHERE event.event_id = NEW.stripe_event_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'stripe_ledger_event_not_found';
    END IF;
    v_expected_stripe_mode := CASE WHEN v_event_livemode THEN 'live' ELSE 'test' END;
    IF NEW.livemode IS NOT NULL AND NEW.livemode IS DISTINCT FROM v_event_livemode THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_ledger_livemode_mismatch';
    END IF;
    IF NEW.stripe_mode IS NOT NULL
      AND NEW.stripe_mode IS DISTINCT FROM v_expected_stripe_mode
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_ledger_mode_mismatch';
    END IF;
    IF jsonb_exists(COALESCE(NEW.metadata, '{}'::jsonb), 'livemode') THEN
      IF jsonb_typeof(NEW.metadata -> 'livemode') <> 'boolean' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_ledger_metadata_livemode_mismatch';
      END IF;
      IF (NEW.metadata ->> 'livemode')::boolean IS DISTINCT FROM v_event_livemode THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_ledger_metadata_livemode_mismatch';
      END IF;
    END IF;
    NEW.livemode := v_event_livemode;
    NEW.stripe_mode := v_expected_stripe_mode;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_financial_ledger_stripe_mode ON public.financial_ledger;
CREATE TRIGGER normalize_financial_ledger_stripe_mode
  BEFORE INSERT ON public.financial_ledger
  FOR EACH ROW EXECUTE FUNCTION private_finance.normalize_financial_ledger_stripe_mode();

REVOKE ALL ON FUNCTION private_finance.normalize_financial_ledger_stripe_mode()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_ledger_mode_payment_intent_asset
  ON public.financial_ledger (
    stripe_mode,
    ((metadata ->> 'payment_intent_id'))
  )
  WHERE source_type IN ('stripe_checkout', 'stripe_invoice')
    AND account_code = 'payment_asset'
    AND direction = 'debit'
    AND reversal_of IS NULL
    AND metadata ->> 'payment_intent_id' IS NOT NULL;

-- Sensitive capabilities are explicitly fail-closed until end-to-end account tests pass.
INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  ('billing-fair-growth-annual', 'Facturation annuelle Fair Growth', '12 mois de service factures au prix de 11 mois.', false),
  ('payment-twint-recurring', 'TWINT recurrent', 'TWINT pour abonnements, active uniquement apres test du compte Stripe.', false)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = false,
    updated_at = now();

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  (
    'payment-twint', 'Paiement TWINT',
    'TWINT est prioritaire pour les paiements Checkout ponctuels en CHF.', true
  ),
  (
    'payment-postfinance-card', 'PostFinance Card',
    'Desactive tant que le parcours Stripe n est pas certifie de bout en bout.', false
  ),
  (
    'payment-postfinance-efinance', 'PostFinance e-finance',
    'Desactive tant que le parcours Stripe n est pas certifie de bout en bout.', false
  )
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = now();

DO $fair_growth_payment_flag_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.feature_flags flag
    WHERE flag.name = 'payment-twint' AND flag.is_active
  ) OR EXISTS (
    SELECT 1 FROM public.feature_flags flag
    WHERE flag.name IN (
      'payment-twint-recurring',
      'payment-postfinance-card',
      'payment-postfinance-efinance'
    ) AND flag.is_active
  ) THEN
    RAISE EXCEPTION 'Fair Growth payment feature flags are not fail-closed';
  END IF;
END;
$fair_growth_payment_flag_assertions$;

-- ---------------------------------------------------------------------------
-- Swiss VAT, stored by effective date and resolved per supply line
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.swiss_vat_rates (
  code text NOT NULL,
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  effective_from date NOT NULL,
  effective_until date,
  description text NOT NULL,
  PRIMARY KEY (code, effective_from),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

INSERT INTO public.swiss_vat_rates (code, rate_bps, effective_from, effective_until, description)
VALUES
  ('standard', 810, DATE '2024-01-01', NULL, 'Taux normal suisse, notamment restauration sur place et alcool.'),
  ('reduced', 260, DATE '2024-01-01', NULL, 'Taux reduit suisse pour denrees eligibles hors prestation de restauration.')
ON CONFLICT (code, effective_from) DO UPDATE
SET rate_bps = EXCLUDED.rate_bps,
    effective_until = EXCLUDED.effective_until,
    description = EXCLUDED.description;

ALTER TABLE public.swiss_vat_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS swiss_vat_rates_public_read ON public.swiss_vat_rates;
CREATE POLICY swiss_vat_rates_public_read
  ON public.swiss_vat_rates FOR SELECT
  USING (true);
REVOKE ALL ON public.swiss_vat_rates FROM PUBLIC;
GRANT SELECT ON public.swiss_vat_rates TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_swiss_vat_rate_bps(
  p_supply_type text,
  p_tax_category text DEFAULT 'food',
  p_effective_on date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_supply_type text := lower(trim(COALESCE(p_supply_type, '')));
  v_tax_category text := lower(trim(COALESCE(p_tax_category, '')));
  v_effective_on date := COALESCE(p_effective_on, CURRENT_DATE);
  v_rate_code text;
  v_rate_bps integer;
  v_match_count integer;
BEGIN
  IF NOT isfinite(v_effective_on) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'finite_vat_effective_date_required';
  END IF;
  IF v_supply_type NOT IN ('dine_in', 'takeaway', 'delivery', 'platform_service') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_swiss_vat_supply_type';
  END IF;
  IF v_tax_category NOT IN ('food', 'alcohol', 'service', 'other_standard') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_swiss_vat_tax_category';
  END IF;

  v_rate_code := CASE
    WHEN v_supply_type IN ('dine_in', 'platform_service') THEN 'standard'
    WHEN v_tax_category IN ('alcohol', 'service', 'other_standard') THEN 'standard'
    WHEN v_tax_category = 'food' THEN 'reduced'
    ELSE NULL
  END;
  IF v_rate_code IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'swiss_vat_classification_required';
  END IF;

  SELECT count(*)::integer, min(rate.rate_bps)::integer
  INTO v_match_count, v_rate_bps
  FROM public.swiss_vat_rates rate
  WHERE rate.code = v_rate_code
    AND rate.effective_from <= v_effective_on
    AND (rate.effective_until IS NULL OR rate.effective_until >= v_effective_on);

  IF v_match_count <> 1 OR v_rate_bps IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = CASE WHEN v_match_count = 0
        THEN 'swiss_vat_rate_missing_for_effective_date'
        ELSE 'swiss_vat_rate_overlap_for_effective_date'
      END;
  END IF;
  RETURN v_rate_bps;
END;
$$;

CREATE OR REPLACE FUNCTION public.swiss_vat_from_tax_inclusive_cents(
  p_gross_cents integer,
  p_rate_bps integer
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_gross_cents IS NULL OR p_gross_cents < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'non_negative_tax_inclusive_amount_required';
  END IF;
  IF p_rate_bps IS NULL OR p_rate_bps NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid_swiss_vat_rate_required';
  END IF;
  IF p_gross_cents = 0 THEN
    RETURN 0;
  END IF;
  RETURN round((p_gross_cents::numeric * p_rate_bps) / (10000 + p_rate_bps))::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_swiss_vat_rate_bps(text, text, date)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.swiss_vat_from_tax_inclusive_cents(integer, integer)
  TO anon, authenticated, service_role;

DO $fair_growth_vat_security_assertions$
BEGIN
  IF (
    SELECT proc.prosecdef
    FROM pg_catalog.pg_proc proc
    WHERE proc.oid =
      'public.resolve_swiss_vat_rate_bps(text,text,date)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Swiss VAT resolver must remain SECURITY INVOKER';
  END IF;
END;
$fair_growth_vat_security_assertions$;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS tax_category text NOT NULL DEFAULT 'food';
ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_tax_category_check;
ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_tax_category_check CHECK (
    tax_category IN ('food', 'alcohol', 'service', 'other_standard')
  );

ALTER TABLE public.order_taxes
  ADD COLUMN IF NOT EXISTS supply_type text,
  ADD COLUMN IF NOT EXISTS vat_rate_code text,
  ADD COLUMN IF NOT EXISTS vat_rate_bps integer,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS merchant_of_record text,
  ADD COLUMN IF NOT EXISTS effective_from date;

ALTER TABLE public.restaurant_invoices
  ADD COLUMN IF NOT EXISTS vat_rate_bps integer,
  ADD COLUMN IF NOT EXISTS tax_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.restaurant_invoice_line_items
  DROP CONSTRAINT IF EXISTS restaurant_invoice_line_items_kind_check;
ALTER TABLE public.restaurant_invoice_line_items
  ADD CONSTRAINT restaurant_invoice_line_items_kind_check CHECK (item_kind IN (
    'order_commission', 'reservation_commission', 'reservation_fee',
    'campaign_payment', 'manual_adjustment', 'launch_pack',
    'restaurant_subscription', 'credit_pack',
    'restaurant_module', 'fair_growth_module'
  ));

-- ---------------------------------------------------------------------------
-- Paid module catalogue and activation requests
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fair_growth_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  monthly_base_cents integer CHECK (monthly_base_cents IS NULL OR monthly_base_cents >= 0),
  variable_fee_bps integer CHECK (variable_fee_bps IS NULL OR variable_fee_bps BETWEEN 0 AND 10000),
  successful_reservation_fee_cents integer CHECK (
    successful_reservation_fee_cents IS NULL OR successful_reservation_fee_cents >= 0
  ),
  payment_cost_passthrough boolean NOT NULL DEFAULT false,
  value_guarantee_days integer NOT NULL DEFAULT 90 CHECK (value_guarantee_days BETWEEN 1 AND 365),
  value_guarantee_multiplier numeric NOT NULL DEFAULT 3 CHECK (value_guarantee_multiplier > 0),
  availability_status text NOT NULL DEFAULT 'available' CHECK (
    availability_status IN ('available', 'pilot', 'coming_soon')
  ),
  feature_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  vat_rate_bps integer NOT NULL DEFAULT 810 CHECK (vat_rate_bps BETWEEN 0 AND 10000),
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  pricing_version text NOT NULL DEFAULT 'fair_growth_2026_07',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.fair_growth_modules (
  slug, name, description, monthly_base_cents, variable_fee_bps,
  successful_reservation_fee_cents, payment_cost_passthrough,
  availability_status, feature_keys, position
)
VALUES
  ('no-show-shield', 'No-Show Shield', 'Empreinte, rappels et scoring du risque de no-show.', 3900, NULL, NULL, false, 'available', ARRAY['dashboard-reservations'], 10),
  ('marketing-autopilot', 'Marketing Autopilot IA', 'Campagnes et relances IA pilotees par les resultats.', 7900, NULL, NULL, false, 'available', ARRAY['ai_marketing_campaigns'], 20),
  ('margin-waste-pilot', 'Margin & Waste Pilot', 'Recommandations de marge, stock et reduction du gaspillage.', 5900, NULL, NULL, false, 'available', ARRAY['ai_sales_insights', 'anti-gaspi'], 30),
  ('ai-phone-receptionist', 'Receptionniste telephonique IA', 'Accueil telephonique et prise de reservation assistee.', 4900, NULL, 150, false, 'pilot', ARRAY[]::text[], 40),
  ('direct-order-saver', 'Direct Order Saver', 'Canal de commande directe avec commission reduite.', 14900, 150, NULL, false, 'pilot', ARRAY['commandes'], 50),
  ('ai-reputation', 'Reputation IA', 'Suivi des avis, brouillons de reponse et alertes.', 2900, NULL, NULL, false, 'available', ARRAY['dashboard-avis'], 60),
  ('gift-cards-experiences', 'Cartes-cadeaux et experiences', 'Vente de cartes-cadeaux et experiences avec paiement securise.', NULL, 300, NULL, true, 'pilot', ARRAY[]::text[], 70)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    monthly_base_cents = EXCLUDED.monthly_base_cents,
    variable_fee_bps = EXCLUDED.variable_fee_bps,
    successful_reservation_fee_cents = EXCLUDED.successful_reservation_fee_cents,
    payment_cost_passthrough = EXCLUDED.payment_cost_passthrough,
    availability_status = EXCLUDED.availability_status,
    feature_keys = EXCLUDED.feature_keys,
    position = EXCLUDED.position,
    pricing_version = 'fair_growth_2026_07',
    updated_at = now();

CREATE TABLE IF NOT EXISTS public.restaurant_paid_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.fair_growth_modules(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK (
    status IN ('requested', 'trialing', 'active', 'paused', 'cancelled', 'credit_due')
  ),
  monthly_base_cents_snapshot integer,
  variable_fee_bps_snapshot integer,
  successful_reservation_fee_cents_snapshot integer,
  payment_cost_passthrough_snapshot boolean NOT NULL DEFAULT false,
  value_guarantee_days_snapshot integer NOT NULL DEFAULT 90,
  value_guarantee_multiplier_snapshot numeric NOT NULL DEFAULT 3,
  vat_rate_bps_snapshot integer NOT NULL DEFAULT 810,
  pricing_version_snapshot text NOT NULL DEFAULT 'fair_growth_2026_07',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  evaluation_started_at timestamptz,
  evaluation_ends_at timestamptz,
  measured_value_cents integer NOT NULL DEFAULT 0,
  credit_amount_cents integer NOT NULL DEFAULT 0,
  stripe_subscription_item_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, module_id)
);

CREATE INDEX IF NOT EXISTS restaurant_paid_modules_module_idx
  ON public.restaurant_paid_modules (module_id);
CREATE INDEX IF NOT EXISTS restaurant_paid_modules_requested_by_idx
  ON public.restaurant_paid_modules (requested_by);

ALTER TABLE public.fair_growth_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_paid_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fair_growth_modules_public_read ON public.fair_growth_modules;
CREATE POLICY fair_growth_modules_public_read
  ON public.fair_growth_modules FOR SELECT
  USING (is_active);
DROP POLICY IF EXISTS restaurant_paid_modules_owner_read ON public.restaurant_paid_modules;
CREATE POLICY restaurant_paid_modules_owner_read
  ON public.restaurant_paid_modules FOR SELECT TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());

REVOKE ALL ON public.fair_growth_modules FROM PUBLIC;
REVOKE ALL ON public.restaurant_paid_modules FROM PUBLIC;
GRANT SELECT ON public.fair_growth_modules TO anon, authenticated, service_role;
GRANT SELECT ON public.restaurant_paid_modules TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.restaurant_paid_modules TO service_role;

CREATE OR REPLACE FUNCTION public.request_fair_growth_module(
  p_restaurant_id uuid,
  p_module_slug text
)
RETURNS public.restaurant_paid_modules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_module public.fair_growth_modules%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_result public.restaurant_paid_modules%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE((
    public.auth_owns_restaurant(p_restaurant_id) OR public.auth_is_admin()
  ), false)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;

  SELECT restaurant.* INTO v_restaurant
  FROM public.restaurants restaurant
  WHERE restaurant.id = p_restaurant_id
  FOR UPDATE;
  IF NOT FOUND
    OR NOT COALESCE(v_restaurant.is_active, false)
    OR COALESCE(v_restaurant.is_demo, false)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'active_non_demo_restaurant_required';
  END IF;

  SELECT * INTO v_module
  FROM public.fair_growth_modules module
  WHERE module.slug = lower(trim(COALESCE(p_module_slug, '')))
    AND module.is_active
    AND module.availability_status IN ('available', 'pilot');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'module_not_available';
  END IF;

  INSERT INTO public.restaurant_paid_modules (
    restaurant_id, module_id, status,
    monthly_base_cents_snapshot, variable_fee_bps_snapshot,
    successful_reservation_fee_cents_snapshot,
    payment_cost_passthrough_snapshot,
    value_guarantee_days_snapshot, value_guarantee_multiplier_snapshot,
    vat_rate_bps_snapshot, pricing_version_snapshot,
    requested_by, requested_at, metadata
  ) VALUES (
    p_restaurant_id, v_module.id, 'requested',
    v_module.monthly_base_cents, v_module.variable_fee_bps,
    v_module.successful_reservation_fee_cents,
    v_module.payment_cost_passthrough,
    v_module.value_guarantee_days, v_module.value_guarantee_multiplier,
    v_module.vat_rate_bps, v_module.pricing_version,
    auth.uid(), now(), jsonb_build_object('request_source', 'restaurant_dashboard')
  )
  ON CONFLICT (restaurant_id, module_id) DO UPDATE
  SET status = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled' THEN 'requested'
        ELSE public.restaurant_paid_modules.status
      END,
      monthly_base_cents_snapshot = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled'
          THEN EXCLUDED.monthly_base_cents_snapshot
        ELSE public.restaurant_paid_modules.monthly_base_cents_snapshot
      END,
      variable_fee_bps_snapshot = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled'
          THEN EXCLUDED.variable_fee_bps_snapshot
        ELSE public.restaurant_paid_modules.variable_fee_bps_snapshot
      END,
      successful_reservation_fee_cents_snapshot = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled'
          THEN EXCLUDED.successful_reservation_fee_cents_snapshot
        ELSE public.restaurant_paid_modules.successful_reservation_fee_cents_snapshot
      END,
      payment_cost_passthrough_snapshot = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled'
          THEN EXCLUDED.payment_cost_passthrough_snapshot
        ELSE public.restaurant_paid_modules.payment_cost_passthrough_snapshot
      END,
      value_guarantee_days_snapshot = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled'
          THEN EXCLUDED.value_guarantee_days_snapshot
        ELSE public.restaurant_paid_modules.value_guarantee_days_snapshot
      END,
      value_guarantee_multiplier_snapshot = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled'
          THEN EXCLUDED.value_guarantee_multiplier_snapshot
        ELSE public.restaurant_paid_modules.value_guarantee_multiplier_snapshot
      END,
      vat_rate_bps_snapshot = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled'
          THEN EXCLUDED.vat_rate_bps_snapshot
        ELSE public.restaurant_paid_modules.vat_rate_bps_snapshot
      END,
      pricing_version_snapshot = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled'
          THEN EXCLUDED.pricing_version_snapshot
        ELSE public.restaurant_paid_modules.pricing_version_snapshot
      END,
      activated_at = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled' THEN NULL
        ELSE public.restaurant_paid_modules.activated_at
      END,
      cancelled_at = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled' THEN NULL
        ELSE public.restaurant_paid_modules.cancelled_at
      END,
      evaluation_started_at = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled' THEN NULL
        ELSE public.restaurant_paid_modules.evaluation_started_at
      END,
      evaluation_ends_at = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled' THEN NULL
        ELSE public.restaurant_paid_modules.evaluation_ends_at
      END,
      measured_value_cents = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled' THEN 0
        ELSE public.restaurant_paid_modules.measured_value_cents
      END,
      credit_amount_cents = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled' THEN 0
        ELSE public.restaurant_paid_modules.credit_amount_cents
      END,
      metadata = CASE
        WHEN public.restaurant_paid_modules.status = 'cancelled' THEN EXCLUDED.metadata
        ELSE public.restaurant_paid_modules.metadata
      END,
      requested_by = auth.uid(),
      requested_at = now(),
      updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.request_fair_growth_module(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_fair_growth_module(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION private_finance.reject_demo_restaurant_paid_module()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants restaurant
    WHERE restaurant.id = NEW.restaurant_id
      AND restaurant.is_active
      AND NOT COALESCE(restaurant.is_demo, false)
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'paid_module_requires_active_non_demo_restaurant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_demo_restaurant_paid_module
  ON public.restaurant_paid_modules;
CREATE TRIGGER reject_demo_restaurant_paid_module
  BEFORE INSERT OR UPDATE OF restaurant_id ON public.restaurant_paid_modules
  FOR EACH ROW EXECUTE FUNCTION private_finance.reject_demo_restaurant_paid_module();

REVOKE ALL ON FUNCTION private_finance.reject_demo_restaurant_paid_module()
  FROM PUBLIC, anon, authenticated, service_role;

DO $fair_growth_module_assertions$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.request_fair_growth_module(uuid,text)'::regprocedure
  ) INTO v_definition;
  IF position('active_non_demo_restaurant_required' IN v_definition) = 0
    OR position('availability_status IN (''available'', ''pilot'')' IN v_definition) = 0
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger
      WHERE trigger.tgrelid = 'public.restaurant_paid_modules'::regclass
        AND trigger.tgname = 'reject_demo_restaurant_paid_module'
        AND NOT trigger.tgisinternal
    )
  THEN
    RAISE EXCEPTION 'Fair Growth paid module demo guard is incomplete';
  END IF;
END;
$fair_growth_module_assertions$;

-- ---------------------------------------------------------------------------
-- Trusted direct-booking channels
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.restaurant_booking_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('restaurant_website', 'qr_code', 'instagram')),
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, source)
);

ALTER TABLE public.restaurant_booking_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS restaurant_booking_channels_owner_read ON public.restaurant_booking_channels;
CREATE POLICY restaurant_booking_channels_owner_read
  ON public.restaurant_booking_channels FOR SELECT TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());
REVOKE ALL ON public.restaurant_booking_channels FROM PUBLIC;
GRANT SELECT ON public.restaurant_booking_channels TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.restaurant_booking_channels TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_restaurant_booking_channels(p_restaurant_id uuid)
RETURNS SETOF public.restaurant_booking_channels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.auth_owns_restaurant(p_restaurant_id) OR public.auth_is_admin()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;

  INSERT INTO public.restaurant_booking_channels (restaurant_id, source)
  SELECT p_restaurant_id, source
  FROM unnest(ARRAY['restaurant_website', 'qr_code', 'instagram']::text[]) source
  ON CONFLICT (restaurant_id, source) DO NOTHING;

  RETURN QUERY
  SELECT channel.*
  FROM public.restaurant_booking_channels channel
  WHERE channel.restaurant_id = p_restaurant_id
  ORDER BY channel.source;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_restaurant_booking_channels(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_restaurant_booking_channels(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reservation acquisition, honorability and capped fee snapshots
-- ---------------------------------------------------------------------------

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS acquisition_source text NOT NULL DEFAULT 'tok_marketplace',
  ADD COLUMN IF NOT EXISTS acquisition_channel_id uuid REFERENCES public.restaurant_booking_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS honored_at timestamptz,
  ADD COLUMN IF NOT EXISTS attributed_table_revenue_chf numeric,
  ADD COLUMN IF NOT EXISTS reservation_fee_list_cents_snapshot integer,
  ADD COLUMN IF NOT EXISTS reservation_fee_cap_bps_snapshot integer,
  ADD COLUMN IF NOT EXISTS reservation_plan_slug_snapshot text,
  ADD COLUMN IF NOT EXISTS reservation_pricing_version text,
  ADD COLUMN IF NOT EXISTS reservation_fee_waiver_reason text;

CREATE INDEX IF NOT EXISTS reservations_acquisition_channel_idx
  ON public.reservations (acquisition_channel_id);

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_fair_growth_source_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_fair_growth_source_check CHECK (
    acquisition_source IN (
      'tok_marketplace', 'restaurant_website', 'qr_code', 'instagram',
      'google', 'customer_file', 'demo'
    )
  );
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_attributed_revenue_non_negative;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_attributed_revenue_non_negative CHECK (
    attributed_table_revenue_chf IS NULL OR attributed_table_revenue_chf >= 0
  );

CREATE UNIQUE INDEX IF NOT EXISTS reservations_id_restaurant_uidx
  ON public.reservations (id, restaurant_id);

CREATE TABLE IF NOT EXISTS public.reservation_fee_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  plan_slug_snapshot text NOT NULL,
  pricing_version_snapshot text NOT NULL,
  acquisition_source_snapshot text NOT NULL CHECK (acquisition_source_snapshot = 'tok_marketplace'),
  honored_at_snapshot timestamptz NOT NULL,
  attributed_revenue_cents_snapshot integer NOT NULL CHECK (attributed_revenue_cents_snapshot >= 0),
  flat_fee_cents_snapshot integer NOT NULL CHECK (flat_fee_cents_snapshot >= 0),
  cap_bps_snapshot integer NOT NULL DEFAULT 700 CHECK (cap_bps_snapshot BETWEEN 0 AND 10000),
  fee_cents integer NOT NULL CHECK (fee_cents >= 0),
  developer_share_bps_snapshot integer NOT NULL DEFAULT 1000 CHECK (
    developer_share_bps_snapshot BETWEEN 0 AND 10000
  ),
  developer_share_cents integer NOT NULL CHECK (developer_share_cents >= 0),
  tok_share_cents integer NOT NULL CHECK (tok_share_cents >= 0),
  zero_revenue_reviewed_at timestamptz,
  zero_revenue_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  zero_revenue_reviewer_role text,
  zero_revenue_waiver_reason text,
  invoice_id uuid REFERENCES public.restaurant_invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    fee_cents = LEAST(
      flat_fee_cents_snapshot,
      round(attributed_revenue_cents_snapshot::numeric * cap_bps_snapshot / 10000)::integer
    )
  ),
  CHECK (
    developer_share_cents = round(fee_cents::numeric * developer_share_bps_snapshot / 10000)::integer
  ),
  CHECK (tok_share_cents + developer_share_cents = fee_cents),
  CHECK (
    (
      fee_cents = 0
      AND zero_revenue_reviewed_at IS NOT NULL
      AND zero_revenue_reviewer_role IN ('service_role', 'admin')
      AND NULLIF(trim(COALESCE(zero_revenue_waiver_reason, '')), '') IS NOT NULL
    )
    OR (
      fee_cents > 0
      AND zero_revenue_reviewed_at IS NULL
      AND zero_revenue_reviewed_by IS NULL
      AND zero_revenue_reviewer_role IS NULL
      AND zero_revenue_waiver_reason IS NULL
    )
  )
);

ALTER TABLE public.reservation_fee_charges
  DROP CONSTRAINT IF EXISTS reservation_fee_charges_reservation_restaurant_fkey;
ALTER TABLE public.reservation_fee_charges
  ADD CONSTRAINT reservation_fee_charges_reservation_restaurant_fkey
  FOREIGN KEY (reservation_id, restaurant_id)
  REFERENCES public.reservations(id, restaurant_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS reservation_fee_charges_reservation_restaurant_idx
  ON public.reservation_fee_charges (reservation_id, restaurant_id);
CREATE INDEX IF NOT EXISTS reservation_fee_charges_restaurant_idx
  ON public.reservation_fee_charges (restaurant_id);
CREATE INDEX IF NOT EXISTS reservation_fee_charges_invoice_idx
  ON public.reservation_fee_charges (invoice_id);
CREATE INDEX IF NOT EXISTS reservation_fee_charges_zero_revenue_reviewer_idx
  ON public.reservation_fee_charges (zero_revenue_reviewed_by);

CREATE UNIQUE INDEX IF NOT EXISTS reservation_fee_charges_id_restaurant_uidx
  ON public.reservation_fee_charges (id, restaurant_id);

ALTER TABLE public.reservation_fee_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reservation_fee_charges_owner_read ON public.reservation_fee_charges;
CREATE POLICY reservation_fee_charges_owner_read
  ON public.reservation_fee_charges FOR SELECT TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());
REVOKE ALL ON public.reservation_fee_charges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reservation_fee_charges TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.reservation_fee_charges FROM service_role;

CREATE OR REPLACE FUNCTION private_finance.reject_immutable_fair_growth_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'immutable_finance_snapshot';
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.link_reservation_charge_to_invoice_once()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'immutable_finance_snapshot';
  END IF;
  IF OLD.invoice_id IS NULL
    AND NEW.invoice_id IS NOT NULL
    AND (to_jsonb(NEW) - 'invoice_id') = (to_jsonb(OLD) - 'invoice_id')
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_invoices invoice
      WHERE invoice.id = NEW.invoice_id
        AND invoice.restaurant_id = NEW.restaurant_id
        AND invoice.invoice_type = 'reservation_fees'
    )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'immutable_finance_snapshot';
END;
$$;

DROP TRIGGER IF EXISTS reservation_fee_charges_immutable ON public.reservation_fee_charges;
CREATE TRIGGER reservation_fee_charges_immutable
  BEFORE UPDATE OR DELETE ON public.reservation_fee_charges
  FOR EACH ROW EXECUTE FUNCTION private_finance.link_reservation_charge_to_invoice_once();

REVOKE ALL ON FUNCTION private_finance.link_reservation_charge_to_invoice_once()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.reservation_fee_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_fee_charge_id uuid NOT NULL
    REFERENCES public.reservation_fee_charges(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  adjustment_cents integer NOT NULL CHECK (adjustment_cents < 0),
  developer_adjustment_cents integer NOT NULL CHECK (developer_adjustment_cents <= 0),
  tok_adjustment_cents integer NOT NULL CHECK (tok_adjustment_cents <= 0),
  reason text NOT NULL CHECK (reason IN ('refund', 'cancellation', 'no_show', 'billing_correction')),
  idempotency_key text NOT NULL UNIQUE CHECK (trim(idempotency_key) <> ''),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (developer_adjustment_cents + tok_adjustment_cents = adjustment_cents)
);

ALTER TABLE public.reservation_fee_adjustments
  DROP CONSTRAINT IF EXISTS reservation_fee_adjustments_charge_restaurant_fkey;
ALTER TABLE public.reservation_fee_adjustments
  ADD CONSTRAINT reservation_fee_adjustments_charge_restaurant_fkey
  FOREIGN KEY (reservation_fee_charge_id, restaurant_id)
  REFERENCES public.reservation_fee_charges(id, restaurant_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS reservation_fee_adjustments_charge_restaurant_idx
  ON public.reservation_fee_adjustments (reservation_fee_charge_id, restaurant_id);
CREATE INDEX IF NOT EXISTS reservation_fee_adjustments_restaurant_idx
  ON public.reservation_fee_adjustments (restaurant_id);
CREATE INDEX IF NOT EXISTS reservation_fee_adjustments_created_by_idx
  ON public.reservation_fee_adjustments (created_by);

ALTER TABLE public.reservation_fee_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reservation_fee_adjustments_owner_read ON public.reservation_fee_adjustments;
CREATE POLICY reservation_fee_adjustments_owner_read
  ON public.reservation_fee_adjustments FOR SELECT TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());
REVOKE ALL ON public.reservation_fee_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reservation_fee_adjustments TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.reservation_fee_adjustments FROM service_role;

DROP TRIGGER IF EXISTS reservation_fee_adjustments_immutable ON public.reservation_fee_adjustments;
CREATE TRIGGER reservation_fee_adjustments_immutable
  BEFORE UPDATE OR DELETE ON public.reservation_fee_adjustments
  FOR EACH ROW EXECUTE FUNCTION private_finance.reject_immutable_fair_growth_mutation();

CREATE OR REPLACE FUNCTION public.record_reservation_fee_adjustment(
  p_reservation_fee_charge_id uuid,
  p_adjustment_cents integer,
  p_reason text,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.reservation_fee_adjustments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_charge public.reservation_fee_charges%ROWTYPE;
  v_result public.reservation_fee_adjustments%ROWTYPE;
  v_existing_total integer;
  v_existing_developer_total integer;
  v_target_developer_total integer;
  v_developer_adjustment integer;
  v_reason text := lower(trim(COALESCE(p_reason, '')));
  v_key text := trim(COALESCE(p_idempotency_key, ''));
BEGIN
  IF NOT (
    COALESCE(auth.role() = 'service_role', false)
    OR COALESCE(public.auth_is_admin(), false)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_or_service_role_required';
  END IF;
  IF p_reservation_fee_charge_id IS NULL OR p_adjustment_cents IS NULL OR p_adjustment_cents >= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'negative_reservation_fee_adjustment_required';
  END IF;
  IF v_reason NOT IN ('refund', 'cancellation', 'no_show', 'billing_correction') OR v_key = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid_adjustment_reason_and_idempotency_key_required';
  END IF;

  SELECT adjustment.* INTO v_result
  FROM public.reservation_fee_adjustments adjustment
  WHERE adjustment.idempotency_key = v_key;
  IF FOUND THEN
    IF v_result.reservation_fee_charge_id IS DISTINCT FROM p_reservation_fee_charge_id
      OR v_result.adjustment_cents IS DISTINCT FROM p_adjustment_cents
      OR v_result.reason IS DISTINCT FROM v_reason
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'reservation_fee_adjustment_idempotency_conflict';
    END IF;
    RETURN v_result;
  END IF;

  SELECT charge.* INTO v_charge
  FROM public.reservation_fee_charges charge
  WHERE charge.id = p_reservation_fee_charge_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'reservation_fee_charge_not_found';
  END IF;
  IF v_charge.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'invoiced_reservation_adjustment_requires_credit_note_workflow',
      HINT = 'Queue request_invoiced_reservation_fee_reconciliation; no adjustment is applied until a legal credit note and matching ledger reversal exist.';
  END IF;

  -- The first lookup is a fast idempotent path. Recheck after the charge lock
  -- so concurrent identical calls cannot fall through to a unique violation.
  SELECT adjustment.* INTO v_result
  FROM public.reservation_fee_adjustments adjustment
  WHERE adjustment.idempotency_key = v_key;
  IF FOUND THEN
    IF v_result.reservation_fee_charge_id IS DISTINCT FROM p_reservation_fee_charge_id
      OR v_result.adjustment_cents IS DISTINCT FROM p_adjustment_cents
      OR v_result.reason IS DISTINCT FROM v_reason
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'reservation_fee_adjustment_idempotency_conflict';
    END IF;
    RETURN v_result;
  END IF;

  SELECT COALESCE(sum(adjustment.adjustment_cents), 0)::integer,
         COALESCE(sum(adjustment.developer_adjustment_cents), 0)::integer
  INTO v_existing_total, v_existing_developer_total
  FROM public.reservation_fee_adjustments adjustment
  WHERE adjustment.reservation_fee_charge_id = v_charge.id;
  IF v_charge.fee_cents + v_existing_total + p_adjustment_cents < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reservation_fee_adjustment_exceeds_charge';
  END IF;

  v_target_developer_total := round(
    (v_charge.fee_cents + v_existing_total + p_adjustment_cents)::numeric
      * v_charge.developer_share_bps_snapshot / 10000
  )::integer;
  v_developer_adjustment := v_target_developer_total
    - v_charge.developer_share_cents - v_existing_developer_total;
  INSERT INTO public.reservation_fee_adjustments (
    reservation_fee_charge_id, restaurant_id, adjustment_cents,
    developer_adjustment_cents, tok_adjustment_cents,
    reason, idempotency_key, created_by, metadata
  ) VALUES (
    v_charge.id, v_charge.restaurant_id, p_adjustment_cents,
    v_developer_adjustment, p_adjustment_cents - v_developer_adjustment,
    v_reason, v_key, auth.uid(), COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'charge_invoice_id', v_charge.invoice_id,
      'requires_credit_note', false,
      'developer_split_method', 'cumulative_delta'
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_result;
  IF v_result.id IS NULL THEN
    SELECT adjustment.* INTO v_result
    FROM public.reservation_fee_adjustments adjustment
    WHERE adjustment.idempotency_key = v_key;
    IF v_result.id IS NULL
      OR v_result.reservation_fee_charge_id IS DISTINCT FROM p_reservation_fee_charge_id
      OR v_result.adjustment_cents IS DISTINCT FROM p_adjustment_cents
      OR v_result.reason IS DISTINCT FROM v_reason
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'reservation_fee_adjustment_idempotency_conflict';
    END IF;
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_reservation_fee_adjustment(uuid, integer, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_reservation_fee_adjustment(uuid, integer, text, text, jsonb)
  TO service_role;

-- There is no versioned restaurant-invoice credit-note workflow yet. Queue a
-- durable, idempotent reconciliation request without pretending that an avoir
-- or accounting reversal has been issued. The original adjustment RPC stays
-- fail-closed for invoiced charges.
CREATE OR REPLACE FUNCTION public.request_invoiced_reservation_fee_reconciliation(
  p_reservation_fee_charge_id uuid,
  p_adjustment_cents integer,
  p_reason text,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_charge public.reservation_fee_charges%ROWTYPE;
  v_reason text := lower(trim(COALESCE(p_reason, '')));
  v_key text := trim(COALESCE(p_idempotency_key, ''));
  v_aggregate_id text;
  v_existing_adjustment_total integer;
  v_input_hash text;
  v_payload jsonb;
  v_outbox_id uuid;
  v_existing_payload jsonb;
BEGIN
  IF NOT (
    COALESCE(auth.role() = 'service_role', false)
    OR COALESCE(public.auth_is_admin(), false)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_or_service_role_required';
  END IF;
  IF p_reservation_fee_charge_id IS NULL
    OR p_adjustment_cents IS NULL
    OR p_adjustment_cents >= 0
    OR v_reason NOT IN ('refund', 'cancellation', 'no_show', 'billing_correction')
    OR v_key = ''
    OR jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid_invoiced_reservation_reconciliation_request_required';
  END IF;

  SELECT charge.* INTO v_charge
  FROM public.reservation_fee_charges charge
  WHERE charge.id = p_reservation_fee_charge_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'reservation_fee_charge_not_found';
  END IF;
  IF v_charge.invoice_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'uninvoiced_charge_must_use_reservation_fee_adjustment';
  END IF;

  SELECT COALESCE(sum(adjustment.adjustment_cents), 0)::integer
  INTO v_existing_adjustment_total
  FROM public.reservation_fee_adjustments adjustment
  WHERE adjustment.reservation_fee_charge_id = v_charge.id;
  IF v_charge.fee_cents + v_existing_adjustment_total + p_adjustment_cents < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reservation_fee_reconciliation_exceeds_charge';
  END IF;

  v_aggregate_id := v_charge.id::text || ':' || md5(v_key);
  v_input_hash := md5(jsonb_build_object(
    'reservation_fee_charge_id', v_charge.id,
    'restaurant_id', v_charge.restaurant_id,
    'invoice_id', v_charge.invoice_id,
    'adjustment_cents', p_adjustment_cents,
    'reason', v_reason,
    'idempotency_key', v_key,
    'request_metadata', COALESCE(p_metadata, '{}'::jsonb)
  )::text);
  v_payload := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'reservation_fee_charge_id', v_charge.id,
    'restaurant_id', v_charge.restaurant_id,
    'restaurant_invoice_id', v_charge.invoice_id,
    'requested_adjustment_cents', p_adjustment_cents,
    'reason', v_reason,
    'idempotency_key', v_key,
    'reconciliation_input_hash', v_input_hash,
    'workflow_state', 'manual_credit_note_and_ledger_reversal_required',
    'legal_credit_note_issued', false,
    'financial_effect_applied', false
  );

  PERFORM pg_advisory_xact_lock(
    hashtext('reservation_fee_credit_note_reconciliation'),
    hashtext(v_aggregate_id)
  );
  SELECT outbox.id, outbox.payload
  INTO v_outbox_id, v_existing_payload
  FROM public.finance_outbox outbox
  WHERE outbox.mode = 'live'
    AND outbox.event_type = 'finance.reservation_credit_note_required'
    AND outbox.aggregate_type = 'reservation_fee_charge'
    AND outbox.aggregate_id = v_aggregate_id
  FOR UPDATE;
  IF FOUND THEN
    IF COALESCE(v_existing_payload ->> 'reconciliation_input_hash', '') <> v_input_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'reservation_fee_reconciliation_idempotency_conflict';
    END IF;
    RETURN v_outbox_id;
  END IF;

  INSERT INTO public.finance_outbox (
    event_type, aggregate_type, aggregate_id, mode, payload
  ) VALUES (
    'finance.reservation_credit_note_required', 'reservation_fee_charge',
    v_aggregate_id, 'live', v_payload
  )
  ON CONFLICT (mode, event_type, aggregate_type, aggregate_id) DO NOTHING
  RETURNING id INTO v_outbox_id;
  IF v_outbox_id IS NULL THEN
    SELECT outbox.id, outbox.payload
    INTO v_outbox_id, v_existing_payload
    FROM public.finance_outbox outbox
    WHERE outbox.mode = 'live'
      AND outbox.event_type = 'finance.reservation_credit_note_required'
      AND outbox.aggregate_type = 'reservation_fee_charge'
      AND outbox.aggregate_id = v_aggregate_id;
    IF v_outbox_id IS NULL
      OR COALESCE(v_existing_payload ->> 'reconciliation_input_hash', '') <> v_input_hash
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'reservation_fee_reconciliation_idempotency_conflict';
    END IF;
  END IF;
  RETURN v_outbox_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_invoiced_reservation_fee_reconciliation(
  uuid, integer, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_invoiced_reservation_fee_reconciliation(
  uuid, integer, text, text, jsonb
) TO service_role;

DO $fair_growth_reservation_credit_note_gap_assertions$
DECLARE
  v_adjustment_definition text;
  v_request_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.record_reservation_fee_adjustment(uuid,integer,text,text,jsonb)'::regprocedure
  ) INTO v_adjustment_definition;
  SELECT pg_get_functiondef(
    'public.request_invoiced_reservation_fee_reconciliation(uuid,integer,text,text,jsonb)'::regprocedure
  ) INTO v_request_definition;
  IF position('invoiced_reservation_adjustment_requires_credit_note_workflow' IN v_adjustment_definition) = 0
    OR position('manual_credit_note_and_ledger_reversal_required' IN v_request_definition) = 0
    OR position('financial_effect_applied' IN v_request_definition) = 0
    OR position('finance.reservation_credit_note_required' IN v_request_definition) = 0
  THEN
    RAISE EXCEPTION 'Invoiced reservation credit-note gap is not safely reconciled';
  END IF;
END;
$fair_growth_reservation_credit_note_gap_assertions$;

CREATE OR REPLACE FUNCTION private_finance.set_reservation_fair_growth_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requested_source text;
  v_requested_channel_token text;
  v_channel_id uuid;
  v_internal_user_id uuid;
  v_plan_slug text;
  v_reservation_fee_cents integer;
  v_reservation_cap_bps integer;
  v_pricing_version text;
BEGIN
  SELECT
    COALESCE(subscription.plan, plan.slug),
    COALESCE(subscription.acquired_reservation_fee_cents_snapshot, plan.acquired_reservation_fee_cents),
    COALESCE(subscription.reservation_revenue_cap_bps_snapshot, plan.reservation_revenue_cap_bps),
    COALESCE(subscription.pricing_version_snapshot, plan.pricing_version)
  INTO
    v_plan_slug,
    v_reservation_fee_cents,
    v_reservation_cap_bps,
    v_pricing_version
  FROM public.restaurant_ai_subscriptions subscription
  JOIN public.restaurant_subscription_plans plan
    ON plan.id = subscription.restaurant_subscription_plan_id
  WHERE subscription.restaurant_id = NEW.restaurant_id
    AND subscription.status IN ('active', 'trialing')
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT
      plan.slug,
      plan.acquired_reservation_fee_cents,
      plan.reservation_revenue_cap_bps,
      plan.pricing_version
    INTO
      v_plan_slug,
      v_reservation_fee_cents,
      v_reservation_cap_bps,
      v_pricing_version
    FROM public.restaurant_subscription_plans plan
    WHERE plan.slug = 'starter'
    LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_requested_source := lower(trim(COALESCE(NEW.metadata ->> 'acquisition_source', '')));
    v_requested_channel_token := trim(COALESCE(NEW.metadata ->> 'acquisition_channel_token', ''));
    NEW.acquisition_source := 'tok_marketplace';
    NEW.acquisition_channel_id := NULL;

    IF COALESCE((
      SELECT restaurant.is_demo
      FROM public.restaurants restaurant
      WHERE restaurant.id = NEW.restaurant_id
    ), false) THEN
      NEW.acquisition_source := 'demo';
    ELSIF v_requested_source IN ('restaurant_website', 'qr_code', 'instagram') THEN
      IF auth.role() <> 'service_role'
        OR COALESCE(NEW.metadata ->> 'acquisition_channel_id', '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_direct_acquisition_proof';
      END IF;
      v_channel_id := (NEW.metadata ->> 'acquisition_channel_id')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.restaurant_booking_channels channel
        WHERE channel.id = v_channel_id
          AND channel.restaurant_id = NEW.restaurant_id
          AND channel.source = v_requested_source
          AND channel.is_active
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_direct_acquisition_proof';
      END IF;
      NEW.acquisition_source := v_requested_source;
      NEW.acquisition_channel_id := v_channel_id;
    ELSIF v_requested_source = 'google' THEN
      IF auth.role() <> 'service_role' OR v_requested_channel_token = '' OR NOT EXISTS (
        SELECT 1
        FROM public.restaurant_google_booking_setup setup
        JOIN public.restaurants restaurant ON restaurant.id = setup.restaurant_id
        WHERE setup.restaurant_id = NEW.restaurant_id
          AND setup.booking_slug = public.tok_slugify(v_requested_channel_token)
          AND restaurant.is_active
          AND NOT restaurant.is_demo
          AND restaurant.supports_reservation
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_google_acquisition_proof';
      END IF;
      NEW.acquisition_source := 'google';
    ELSIF v_requested_source = 'customer_file' THEN
      IF auth.role() <> 'service_role'
        OR COALESCE(NEW.metadata ->> '_internal_user_id', '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_customer_file_acquisition_proof';
      END IF;
      v_internal_user_id := (NEW.metadata ->> '_internal_user_id')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.restaurants restaurant
        WHERE restaurant.id = NEW.restaurant_id
          AND restaurant.owner_id = v_internal_user_id
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_customer_file_acquisition_proof';
      END IF;
      NEW.acquisition_source := 'customer_file';
    ELSIF v_requested_source NOT IN ('', 'tok_marketplace') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_acquisition_source';
    END IF;

    NEW.reservation_fee_list_cents_snapshot := COALESCE(v_reservation_fee_cents, 500);
    NEW.reservation_fee_cap_bps_snapshot := COALESCE(v_reservation_cap_bps, 700);
    NEW.reservation_plan_slug_snapshot := COALESCE(v_plan_slug, 'starter');
    NEW.reservation_pricing_version := COALESCE(v_pricing_version, 'fair_growth_2026_07');
    NEW.billing_fee_chf := 0;
    -- Proof material is consumed by this trigger; only the canonical channel
    -- column and normalized acquisition source remain durable.
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
      - '_internal_user_id'
      - 'acquisition_channel_token'
      - 'acquisition_channel_id';
  ELSE
    -- Acquisition and price are sealed at creation. Corrections require an audited admin migration.
    NEW.acquisition_source := OLD.acquisition_source;
    NEW.acquisition_channel_id := OLD.acquisition_channel_id;
    NEW.reservation_fee_list_cents_snapshot := OLD.reservation_fee_list_cents_snapshot;
    NEW.reservation_fee_cap_bps_snapshot := OLD.reservation_fee_cap_bps_snapshot;
    NEW.reservation_plan_slug_snapshot := OLD.reservation_plan_slug_snapshot;
    NEW.reservation_pricing_version := OLD.reservation_pricing_version;

    IF NEW.reservation_fee_invoice_id IS DISTINCT FROM OLD.reservation_fee_invoice_id
      AND COALESCE(current_setting('app.fair_growth_invoice_link', true), '') <> 'on'
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'reservation_fee_invoice_link_is_server_managed';
    END IF;
    IF OLD.reservation_fee_invoice_id IS NOT NULL
      AND NEW.reservation_fee_invoice_id IS DISTINCT FROM OLD.reservation_fee_invoice_id
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'reservation_fee_invoice_link_is_immutable';
    END IF;

    IF OLD.reservation_pricing_version IS NOT NULL
      AND (
        NEW.honored_at IS DISTINCT FROM OLD.honored_at
        OR NEW.attributed_table_revenue_chf IS DISTINCT FROM OLD.attributed_table_revenue_chf
        OR NEW.billing_fee_chf IS DISTINCT FROM OLD.billing_fee_chf
        OR NEW.reservation_fee_waiver_reason IS DISTINCT FROM OLD.reservation_fee_waiver_reason
      )
      AND COALESCE(current_setting('app.fair_growth_mark_honored', true), '') <> 'on'
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'use_mark_reservation_honored_rpc';
    END IF;
    IF OLD.honored_at IS NOT NULL AND (
      NEW.honored_at IS DISTINCT FROM OLD.honored_at
      OR NEW.attributed_table_revenue_chf IS DISTINCT FROM OLD.attributed_table_revenue_chf
      OR NEW.billing_fee_chf IS DISTINCT FROM OLD.billing_fee_chf
      OR NEW.reservation_fee_waiver_reason IS DISTINCT FROM OLD.reservation_fee_waiver_reason
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'honored_reservation_finance_snapshot_is_immutable';
    END IF;
    IF OLD.honored_at IS NOT NULL
      AND lower(COALESCE(NEW.status, '')) IN ('cancelled', 'canceled', 'no_show', 'no-show')
      AND NOT (
        auth.role() = 'service_role'
        AND (
          COALESCE(OLD.billing_fee_chf, 0) = 0
          OR EXISTS (
            SELECT 1
            FROM public.reservation_fee_charges charge
            WHERE charge.reservation_id = OLD.id
              AND charge.fee_cents + COALESCE((
                SELECT sum(adjustment.adjustment_cents)
                FROM public.reservation_fee_adjustments adjustment
                WHERE adjustment.reservation_fee_charge_id = charge.id
              ), 0) = 0
          )
        )
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'reverse_reservation_fee_before_honored_status_change';
    END IF;
    IF OLD.honored_at IS NOT NULL
      AND (
        NEW.refunded_amount_chf IS DISTINCT FROM OLD.refunded_amount_chf
        OR NEW.refund_status IS DISTINCT FROM OLD.refund_status
      )
      AND (
        COALESCE(NEW.refunded_amount_chf, 0) > 0
        OR lower(COALESCE(NEW.refund_status, '')) IN ('pending', 'partial', 'refunded')
      )
      AND NOT (
        auth.role() = 'service_role'
        AND (
          COALESCE(OLD.billing_fee_chf, 0) = 0
          OR EXISTS (
            SELECT 1
            FROM public.reservation_fee_charges charge
            WHERE charge.reservation_id = OLD.id
              AND charge.fee_cents + COALESCE((
                SELECT sum(adjustment.adjustment_cents)
                FROM public.reservation_fee_adjustments adjustment
                WHERE adjustment.reservation_fee_charge_id = charge.id
              ), 0) = 0
          )
        )
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'reverse_reservation_fee_before_refund';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_reservation_fair_growth_snapshot ON public.reservations;
CREATE TRIGGER set_reservation_fair_growth_snapshot
  BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION private_finance.set_reservation_fair_growth_snapshot();

CREATE INDEX IF NOT EXISTS reservations_fair_growth_invoice_idx
  ON public.reservations (restaurant_id, honored_at)
  WHERE reservation_fee_invoice_id IS NULL AND acquisition_source = 'tok_marketplace';

CREATE OR REPLACE FUNCTION public.mark_reservation_honored(
  p_reservation_id uuid,
  p_attributed_table_revenue_chf numeric
)
RETURNS TABLE(updated boolean, error_code text, error_message text, fee_chf numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
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
    RETURN QUERY SELECT false, 'invalid_revenue', 'Le chiffre d affaires attribue a la table est requis.', NULL::numeric;
    RETURN;
  END IF;
  v_attributed_revenue_cents := round(p_attributed_table_revenue_chf * 100)::integer;

  SELECT * INTO v_reservation
  FROM public.reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found', 'Reservation introuvable.', NULL::numeric;
    RETURN;
  END IF;
  v_is_privileged_reviewer := COALESCE(auth.role() = 'service_role', false)
    OR COALESCE(public.auth_is_admin(), false);
  IF NOT v_is_privileged_reviewer
    AND NOT COALESCE(public.auth_owns_restaurant(v_reservation.restaurant_id), false)
  THEN
    RETURN QUERY SELECT false, 'forbidden', 'Acces refuse.', NULL::numeric;
    RETURN;
  END IF;
  IF lower(v_reservation.status) IN ('cancelled', 'canceled', 'no_show', 'no-show')
    OR v_reservation.cancelled_at IS NOT NULL
  THEN
    RETURN QUERY SELECT false, 'not_honorable', 'Une annulation ou un no-show ne peut pas etre facture.', NULL::numeric;
    RETURN;
  END IF;
  IF COALESCE(v_reservation.refunded_amount_chf, 0) > 0
    OR lower(COALESCE(v_reservation.refund_status, '')) IN ('pending', 'partial', 'refunded')
  THEN
    RETURN QUERY SELECT false, 'refunded', 'Une reservation remboursee ne peut pas etre facturee.', NULL::numeric;
    RETURN;
  END IF;
  IF lower(COALESCE(v_reservation.status, '')) NOT IN ('arrived', 'seated', 'completed') THEN
    RETURN QUERY SELECT false, 'service_not_completed',
      'La table doit etre arrivee, installee ou cloturee avant facturation.', NULL::numeric;
    RETURN;
  END IF;
  IF v_reservation.acquisition_source = 'tok_marketplace'
    AND v_attributed_revenue_cents = 0
    AND NOT v_is_privileged_reviewer
  THEN
    RETURN QUERY SELECT false, 'zero_revenue_requires_review',
      'Un chiffre d affaires nul pour un lead TOK exige une revue administrative.', NULL::numeric;
    RETURN;
  END IF;
  v_reviewer_role := CASE
    WHEN auth.role() = 'service_role' THEN 'service_role'
    WHEN v_is_privileged_reviewer THEN 'admin'
    ELSE NULL
  END;

  SELECT * INTO v_existing_charge
  FROM public.reservation_fee_charges charge
  WHERE charge.reservation_id = p_reservation_id;
  IF FOUND THEN
    IF v_existing_charge.fee_cents = 0 AND NOT v_is_privileged_reviewer THEN
      RETURN QUERY SELECT false, 'zero_fee_requires_review',
        'Une commission arrondie a zero pour un lead TOK exige une revue administrative.', NULL::numeric;
      RETURN;
    END IF;
    IF v_existing_charge.attributed_revenue_cents_snapshot <> v_attributed_revenue_cents THEN
      RETURN QUERY SELECT false, 'honor_snapshot_locked', 'Le chiffre d affaires honore est deja verrouille.', NULL::numeric;
      RETURN;
    END IF;
    SELECT COALESCE(sum(adjustment.adjustment_cents), 0)::integer
    INTO v_adjustment_cents
    FROM public.reservation_fee_adjustments adjustment
    WHERE adjustment.reservation_fee_charge_id = v_existing_charge.id;
    RETURN QUERY SELECT true, NULL::text, NULL::text,
      (v_existing_charge.fee_cents + v_adjustment_cents)::numeric / 100;
    RETURN;
  END IF;

  IF v_reservation.honored_at IS NOT NULL THEN
    IF round(COALESCE(v_reservation.attributed_table_revenue_chf, 0) * 100)::integer
      <> v_attributed_revenue_cents
    THEN
      RETURN QUERY SELECT false, 'honor_snapshot_locked', 'Le chiffre d affaires honore est deja verrouille.', NULL::numeric;
      RETURN;
    END IF;
    RETURN QUERY SELECT true, NULL::text, NULL::text,
      round(COALESCE(v_reservation.billing_fee_chf, 0), 2);
    RETURN;
  END IF;

  v_fee_cents := CASE
    WHEN v_reservation.acquisition_source <> 'tok_marketplace'
      OR v_reservation.reservation_pricing_version IS NULL
    THEN 0
    ELSE LEAST(
      COALESCE(v_reservation.reservation_fee_list_cents_snapshot, 500),
      round(
        v_attributed_revenue_cents::numeric
        * COALESCE(v_reservation.reservation_fee_cap_bps_snapshot, 700)
        / 10000
      )::integer
    )
  END;
  v_developer_share_cents := round(v_fee_cents::numeric * 1000 / 10000)::integer;
  IF v_reservation.acquisition_source = 'tok_marketplace'
    AND v_reservation.reservation_pricing_version IS NOT NULL
    AND v_fee_cents = 0
    AND NOT v_is_privileged_reviewer
  THEN
    RETURN QUERY SELECT false, 'zero_fee_requires_review',
      'Une commission arrondie a zero pour un lead TOK exige une revue administrative.', NULL::numeric;
    RETURN;
  END IF;
  v_plan_slug := COALESCE(v_reservation.reservation_plan_slug_snapshot, 'starter');
  v_honored_at := now();

  IF v_reservation.acquisition_source = 'tok_marketplace'
    AND v_reservation.reservation_pricing_version IS NOT NULL
  THEN
    INSERT INTO public.reservation_fee_charges (
      reservation_id, restaurant_id, plan_slug_snapshot, pricing_version_snapshot,
      acquisition_source_snapshot, honored_at_snapshot,
      attributed_revenue_cents_snapshot, flat_fee_cents_snapshot,
      cap_bps_snapshot, fee_cents, developer_share_bps_snapshot,
      developer_share_cents, tok_share_cents,
      zero_revenue_reviewed_at, zero_revenue_reviewed_by,
      zero_revenue_reviewer_role, zero_revenue_waiver_reason
    ) VALUES (
      v_reservation.id, v_reservation.restaurant_id, v_plan_slug,
      COALESCE(v_reservation.reservation_pricing_version, 'fair_growth_2026_07'),
      'tok_marketplace', v_honored_at, v_attributed_revenue_cents,
      COALESCE(v_reservation.reservation_fee_list_cents_snapshot, 500),
      COALESCE(v_reservation.reservation_fee_cap_bps_snapshot, 700),
      v_fee_cents, 1000, v_developer_share_cents,
      v_fee_cents - v_developer_share_cents,
      CASE WHEN v_fee_cents = 0 THEN v_honored_at ELSE NULL END,
      CASE WHEN v_fee_cents = 0 THEN auth.uid() ELSE NULL END,
      CASE WHEN v_fee_cents = 0 THEN v_reviewer_role ELSE NULL END,
      CASE WHEN v_fee_cents = 0 THEN
        CASE WHEN v_attributed_revenue_cents = 0
          THEN 'zero_revenue_admin_review'
          ELSE 'zero_fee_rounding_admin_review'
        END
      ELSE NULL END
    )
    ON CONFLICT (reservation_id) DO NOTHING;

    SELECT charge.* INTO v_existing_charge
    FROM public.reservation_fee_charges charge
    WHERE charge.reservation_id = v_reservation.id;
    IF v_existing_charge.id IS NULL
      OR v_existing_charge.attributed_revenue_cents_snapshot <> v_attributed_revenue_cents
      OR v_existing_charge.fee_cents <> v_fee_cents
    THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'reservation_fee_charge_concurrency_conflict';
    END IF;
  END IF;

  PERFORM set_config('app.fair_growth_mark_honored', 'on', true);
  UPDATE public.reservations reservation
  SET honored_at = v_honored_at,
      confirmed_at = COALESCE(reservation.confirmed_at, v_honored_at),
      attributed_table_revenue_chf = v_attributed_revenue_cents::numeric / 100,
      billing_fee_chf = v_fee_cents::numeric / 100,
      reservation_fee_waiver_reason = CASE
        WHEN reservation.reservation_pricing_version IS NULL THEN 'pre_fair_growth_unverified_source'
        WHEN reservation.acquisition_source <> 'tok_marketplace' THEN 'free_direct_source'
        WHEN v_fee_cents = 0 AND v_attributed_revenue_cents = 0 THEN 'zero_revenue_admin_review'
        WHEN v_fee_cents = 0 THEN 'zero_fee_rounding_admin_review'
        ELSE NULL
      END,
      metadata = CASE
        WHEN reservation.acquisition_source = 'tok_marketplace'
          AND v_fee_cents = 0
        THEN COALESCE(reservation.metadata, '{}'::jsonb) || jsonb_build_object(
          'fair_growth_zero_revenue_review', jsonb_build_object(
            'reviewed_at', v_honored_at,
            'reviewed_by', auth.uid(),
            'reviewer_role', v_reviewer_role,
            'waiver_reason', CASE WHEN v_attributed_revenue_cents = 0
              THEN 'zero_revenue_admin_review'
              ELSE 'zero_fee_rounding_admin_review'
            END
          )
        )
        ELSE reservation.metadata
      END,
      updated_at = now()
  WHERE reservation.id = p_reservation_id;

  RETURN QUERY SELECT true, NULL::text, NULL::text, v_fee_cents::numeric / 100;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_reservation_honored(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_reservation_honored(uuid, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Final reservation invoice: acquired by TOK, honored, non-refunded, capped
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_tok_reservation_fee_invoice(
  p_restaurant_id uuid,
  p_month date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target date := COALESCE(p_month, (date_trunc('month', now()) - interval '1 month')::date);
  v_period_s date := date_trunc('month', v_target)::date;
  v_period_e date := (v_period_s + interval '1 month - 1 day')::date;
  v_count integer;
  v_amount_ttc_cents integer;
  v_amount_ht_cents integer;
  v_amount_tva_cents integer;
  v_amount_ttc numeric;
  v_amount_ht numeric;
  v_amount_tva numeric;
  v_next_num integer;
  v_invoice_id uuid;
  v_inserted_count integer;
  v_linked_count integer;
BEGIN
  IF NOT (
    COALESCE(auth.role() = 'service_role', false)
    OR COALESCE(public.auth_is_admin(), false)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('fair_growth_reservation_invoice'),
    hashtext(p_restaurant_id::text)
  );

  -- Adjustment creation takes the same charge lock. Lock the full eligible set
  -- before any aggregate so header, lines and invoice links share one snapshot.
  PERFORM charge.id
  FROM public.reservations reservation
  JOIN public.reservation_fee_charges charge ON charge.reservation_id = reservation.id
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(adjustment.adjustment_cents), 0)::integer AS adjustment_cents
    FROM public.reservation_fee_adjustments adjustment
    WHERE adjustment.reservation_fee_charge_id = charge.id
  ) adjustments ON true
  JOIN public.restaurants restaurant ON restaurant.id = reservation.restaurant_id
  WHERE reservation.restaurant_id = p_restaurant_id
    AND reservation.honored_at IS NOT NULL
    AND (reservation.honored_at AT TIME ZONE 'Europe/Zurich')::date BETWEEN v_period_s AND v_period_e
    AND charge.invoice_id IS NULL
    AND reservation.acquisition_source = 'tok_marketplace'
    AND lower(reservation.status) IN ('arrived', 'seated', 'completed')
    AND reservation.cancelled_at IS NULL
    AND lower(COALESCE(reservation.refund_status, '')) NOT IN ('pending', 'partial', 'refunded')
    AND COALESCE(reservation.refunded_amount_chf, 0) = 0
    AND NOT COALESCE(restaurant.is_demo, false)
    AND lower(trim(COALESCE(reservation.metadata ->> 'demo_environment', ''))) <> 'commercial_demo'
    AND charge.fee_cents + COALESCE(adjustments.adjustment_cents, 0) > 0
  ORDER BY charge.id
  FOR UPDATE OF charge;

  SELECT count(*)::integer,
         COALESCE(sum(
           charge.fee_cents + COALESCE(adjustments.adjustment_cents, 0)
         ), 0)::integer,
         COALESCE(sum(public.swiss_vat_from_tax_inclusive_cents(
           charge.fee_cents + COALESCE(adjustments.adjustment_cents, 0), 810
         )), 0)::integer
  INTO v_count, v_amount_ttc_cents, v_amount_tva_cents
  FROM public.reservations reservation
  JOIN public.reservation_fee_charges charge ON charge.reservation_id = reservation.id
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(adjustment.adjustment_cents), 0)::integer AS adjustment_cents
    FROM public.reservation_fee_adjustments adjustment
    WHERE adjustment.reservation_fee_charge_id = charge.id
  ) adjustments ON true
  JOIN public.restaurants restaurant ON restaurant.id = reservation.restaurant_id
  WHERE reservation.restaurant_id = p_restaurant_id
    AND reservation.honored_at IS NOT NULL
    AND (reservation.honored_at AT TIME ZONE 'Europe/Zurich')::date BETWEEN v_period_s AND v_period_e
    AND charge.invoice_id IS NULL
    AND reservation.acquisition_source = 'tok_marketplace'
    AND lower(reservation.status) IN ('arrived', 'seated', 'completed')
    AND reservation.cancelled_at IS NULL
    AND lower(COALESCE(reservation.refund_status, '')) NOT IN ('pending', 'partial', 'refunded')
    AND COALESCE(reservation.refunded_amount_chf, 0) = 0
    AND NOT COALESCE(restaurant.is_demo, false)
    AND lower(trim(COALESCE(reservation.metadata ->> 'demo_environment', ''))) <> 'commercial_demo'
    AND charge.fee_cents + COALESCE(adjustments.adjustment_cents, 0) > 0;

  IF v_count = 0 OR v_amount_ttc_cents <= 0 THEN
    RETURN NULL;
  END IF;

  v_amount_ht_cents := v_amount_ttc_cents - v_amount_tva_cents;
  v_amount_ttc := v_amount_ttc_cents::numeric / 100;
  v_amount_tva := v_amount_tva_cents::numeric / 100;
  v_amount_ht := v_amount_ht_cents::numeric / 100;

  SELECT COALESCE(max((regexp_match(invoice.invoice_number, '[0-9]+$'))[1]::integer), 0) + 1
  INTO v_next_num
  FROM public.restaurant_invoices invoice
  WHERE invoice.restaurant_id = p_restaurant_id
    AND invoice.invoice_type = 'reservation_fees';

  INSERT INTO public.restaurant_invoices (
    restaurant_id, period_start, period_end,
    amount_ht, amount_tva, amount_ttc, status,
    invoice_number, due_at, invoice_type, currency,
    vat_rate_bps, tax_breakdown, metadata
  ) VALUES (
    p_restaurant_id, v_period_s, v_period_e,
    v_amount_ht, v_amount_tva, v_amount_ttc, 'pending',
    'TOK-' || to_char(v_period_s, 'YYYYMM') || '-' || lpad(v_next_num::text, 4, '0'),
    (v_period_e + interval '30 days')::timestamptz,
    'reservation_fees', 'CHF', 810,
    jsonb_build_array(jsonb_build_object(
      'vat_rate_bps', 810,
      'amount_ht', v_amount_ht,
      'amount_tva', v_amount_tva,
      'amount_ttc', v_amount_ttc
    )),
    jsonb_build_object(
      'pricing_version', 'fair_growth_2026_07',
      'eligible_reservations', v_count,
      'tax_inclusive', true,
      'fee_rule', 'tok_acquired_and_honored_only',
      'revenue_cap_bps', 700
    )
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO public.restaurant_invoice_line_items (
    invoice_id, restaurant_id, item_kind, source_table, source_id,
    source_label, occurred_at, quantity, unit_amount, base_amount,
    rate_label, rate_value, amount_ht, amount_tva, amount_ttc, metadata
  )
  SELECT
    v_invoice_id, reservation.restaurant_id, 'reservation_fee', 'reservations', reservation.id,
    'Reservation TOK honoree - ' || COALESCE(reservation.order_reference, reservation.id::text),
    reservation.honored_at, 1,
    (charge.fee_cents + COALESCE(adjustments.adjustment_cents, 0))::numeric / 100,
    reservation.attributed_table_revenue_chf,
    'Plafond 7% du CA table', COALESCE(reservation.reservation_fee_cap_bps_snapshot, 700)::numeric / 100,
    (charge.fee_cents + COALESCE(adjustments.adjustment_cents, 0)
      - public.swiss_vat_from_tax_inclusive_cents(
          charge.fee_cents + COALESCE(adjustments.adjustment_cents, 0), 810
        ))::numeric / 100,
    public.swiss_vat_from_tax_inclusive_cents(
      charge.fee_cents + COALESCE(adjustments.adjustment_cents, 0), 810
    )::numeric / 100,
    (charge.fee_cents + COALESCE(adjustments.adjustment_cents, 0))::numeric / 100,
    jsonb_build_object(
      'acquisition_source', reservation.acquisition_source,
      'pricing_version', reservation.reservation_pricing_version,
      'list_fee_cents', reservation.reservation_fee_list_cents_snapshot,
      'attributed_table_revenue_chf', reservation.attributed_table_revenue_chf,
      'charge_id', charge.id,
      'gross_fee_cents', charge.fee_cents,
      'adjustment_cents', COALESCE(adjustments.adjustment_cents, 0),
      'developer_share_cents', charge.developer_share_cents
        + COALESCE(adjustments.developer_adjustment_cents, 0),
      'vat_rate_bps', 810,
      'tax_inclusive', true
    )
  FROM public.reservations reservation
  JOIN public.reservation_fee_charges charge ON charge.reservation_id = reservation.id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(sum(adjustment.adjustment_cents), 0)::integer AS adjustment_cents,
      COALESCE(sum(adjustment.developer_adjustment_cents), 0)::integer AS developer_adjustment_cents
    FROM public.reservation_fee_adjustments adjustment
    WHERE adjustment.reservation_fee_charge_id = charge.id
  ) adjustments ON true
  JOIN public.restaurants restaurant ON restaurant.id = reservation.restaurant_id
  WHERE reservation.restaurant_id = p_restaurant_id
    AND reservation.honored_at IS NOT NULL
    AND (reservation.honored_at AT TIME ZONE 'Europe/Zurich')::date BETWEEN v_period_s AND v_period_e
    AND charge.invoice_id IS NULL
    AND reservation.acquisition_source = 'tok_marketplace'
    AND lower(reservation.status) IN ('arrived', 'seated', 'completed')
    AND reservation.cancelled_at IS NULL
    AND lower(COALESCE(reservation.refund_status, '')) NOT IN ('pending', 'partial', 'refunded')
    AND COALESCE(reservation.refunded_amount_chf, 0) = 0
    AND NOT COALESCE(restaurant.is_demo, false)
    AND lower(trim(COALESCE(reservation.metadata ->> 'demo_environment', ''))) <> 'commercial_demo'
    AND charge.fee_cents + COALESCE(adjustments.adjustment_cents, 0) > 0
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  IF v_inserted_count <> v_count THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'reservation_invoice_line_concurrency_conflict';
  END IF;

  UPDATE public.reservation_fee_charges charge
  SET invoice_id = v_invoice_id
  FROM public.reservations reservation
  WHERE charge.reservation_id = reservation.id
    AND charge.restaurant_id = p_restaurant_id
    AND charge.invoice_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_invoice_line_items line
      WHERE line.invoice_id = v_invoice_id
        AND line.source_table = 'reservations'
        AND line.source_id = reservation.id
        AND line.item_kind = 'reservation_fee'
    );

  GET DIAGNOSTICS v_linked_count = ROW_COUNT;
  IF v_linked_count <> v_count THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'reservation_invoice_charge_link_concurrency_conflict';
  END IF;

  PERFORM set_config('app.fair_growth_invoice_link', 'on', true);
  UPDATE public.reservations reservation
  SET reservation_fee_invoice_id = v_invoice_id,
      updated_at = now()
  FROM public.reservation_fee_charges charge
  WHERE charge.reservation_id = reservation.id
    AND charge.invoice_id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_tok_reservation_fee_invoices_all(p_month date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
  v_restaurant_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.auth_is_admin()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;

  FOR v_restaurant_id IN
    SELECT DISTINCT reservation.restaurant_id
    FROM public.reservations reservation
    JOIN public.reservation_fee_charges charge ON charge.reservation_id = reservation.id
    WHERE reservation.honored_at IS NOT NULL
      AND charge.invoice_id IS NULL
      AND reservation.acquisition_source = 'tok_marketplace'
      AND charge.fee_cents + COALESCE((
        SELECT sum(adjustment.adjustment_cents)
        FROM public.reservation_fee_adjustments adjustment
        WHERE adjustment.reservation_fee_charge_id = charge.id
      ), 0) > 0
  LOOP
    IF public.generate_tok_reservation_fee_invoice(v_restaurant_id, p_month) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_tok_reservation_fee_invoices_all(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoices_all(date) TO service_role;

-- Retire the legacy payable generator that invoiced order commissions after
-- Stripe had already split them and added a second reservation commission.
CREATE OR REPLACE FUNCTION public.generate_tok_payable_invoice(
  p_restaurant_id uuid,
  p_month date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.generate_tok_reservation_fee_invoice(p_restaurant_id, p_month);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_tok_payable_invoices_all(p_month date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.generate_tok_reservation_fee_invoices_all(p_month);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_monthly_invoices(p_month text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month date;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.auth_is_admin()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;
  v_month := CASE
    WHEN NULLIF(trim(COALESCE(p_month, '')), '') IS NULL THEN NULL
    ELSE date_trunc('month', p_month::date)::date
  END;
  RETURN public.generate_tok_reservation_fee_invoices_all(v_month);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_tok_payable_invoice(uuid, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_tok_payable_invoices_all(date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_monthly_invoices(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_payable_invoice(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_tok_payable_invoices_all(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_monthly_invoices(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Deferred restaurant subscriptions: monthly or twelve months for eleven
-- ---------------------------------------------------------------------------

-- Legacy active rows receive one explicit catalogue-origin snapshot. Partial
-- active snapshots are rejected below instead of silently mixing versions.
UPDATE public.restaurant_ai_subscriptions subscription
SET billing_period = COALESCE(subscription.billing_period, 'monthly'),
    price_monthly_chf_snapshot = plan.price_monthly_chf,
    billing_amount_chf_snapshot = (
      round(plan.price_monthly_chf * 100)::integer
      * CASE WHEN subscription.billing_period = 'yearly' THEN 11 ELSE 1 END
    )::numeric / 100,
    price_monthly_cents_snapshot = round(plan.price_monthly_chf * 100)::integer,
    billing_amount_cents_snapshot = round(plan.price_monthly_chf * 100)::integer
      * CASE WHEN subscription.billing_period = 'yearly' THEN 11 ELSE 1 END,
    billing_vat_cents_snapshot = public.swiss_vat_from_tax_inclusive_cents(
      round(plan.price_monthly_chf * 100)::integer
        * CASE WHEN subscription.billing_period = 'yearly' THEN 11 ELSE 1 END,
      810
    ),
    billing_net_cents_snapshot = (
      round(plan.price_monthly_chf * 100)::integer
        * CASE WHEN subscription.billing_period = 'yearly' THEN 11 ELSE 1 END
    ) - public.swiss_vat_from_tax_inclusive_cents(
      round(plan.price_monthly_chf * 100)::integer
        * CASE WHEN subscription.billing_period = 'yearly' THEN 11 ELSE 1 END,
      810
    ),
    vat_rate_bps_snapshot = 810,
    annual_months_charged_snapshot = plan.annual_months_charged,
    acquired_reservation_fee_cents_snapshot = plan.acquired_reservation_fee_cents,
    marketplace_commission_bps_snapshot = plan.marketplace_commission_bps,
    included_establishments_snapshot = plan.included_establishments,
    additional_establishment_price_cents_snapshot = plan.additional_establishment_price_cents,
    reservation_revenue_cap_bps_snapshot = plan.reservation_revenue_cap_bps,
    developer_order_bps_snapshot = plan.developer_order_bps,
    developer_tok_revenue_bps_snapshot = plan.developer_tok_revenue_bps,
    pricing_version_snapshot = plan.pricing_version,
    metadata = COALESCE(subscription.metadata, '{}'::jsonb) || jsonb_build_object(
      'pricing_snapshot_origin', 'fair_growth_migration_backfill',
      'prices_include_vat', true
    )
FROM public.restaurant_subscription_plans plan
WHERE plan.id = subscription.restaurant_subscription_plan_id
  AND subscription.status IN ('active', 'trialing')
  AND subscription.pricing_version_snapshot IS NULL
  AND subscription.price_monthly_cents_snapshot IS NULL
  AND subscription.billing_amount_cents_snapshot IS NULL
  AND subscription.billing_net_cents_snapshot IS NULL
  AND subscription.billing_vat_cents_snapshot IS NULL;

ALTER TABLE public.restaurant_ai_subscriptions
  DROP CONSTRAINT IF EXISTS restaurant_ai_subscriptions_active_pricing_snapshot_check;
ALTER TABLE public.restaurant_ai_subscriptions
  ADD CONSTRAINT restaurant_ai_subscriptions_active_pricing_snapshot_check CHECK (
    status NOT IN ('active', 'trialing')
    OR (
      restaurant_subscription_plan_id IS NOT NULL
      AND NULLIF(trim(COALESCE(plan, '')), '') IS NOT NULL
      AND billing_period IN ('monthly', 'yearly')
      AND price_monthly_chf_snapshot IS NOT NULL
      AND billing_amount_chf_snapshot IS NOT NULL
      AND price_monthly_cents_snapshot IS NOT NULL
      AND billing_amount_cents_snapshot IS NOT NULL
      AND billing_net_cents_snapshot IS NOT NULL
      AND billing_vat_cents_snapshot IS NOT NULL
      AND vat_rate_bps_snapshot IS NOT NULL
      AND annual_months_charged_snapshot IS NOT NULL
      AND acquired_reservation_fee_cents_snapshot IS NOT NULL
      AND marketplace_commission_bps_snapshot IS NOT NULL
      AND included_establishments_snapshot IS NOT NULL
      AND reservation_revenue_cap_bps_snapshot IS NOT NULL
      AND developer_order_bps_snapshot IS NOT NULL
      AND developer_tok_revenue_bps_snapshot IS NOT NULL
      AND pricing_version_snapshot IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION private_finance.ensure_deferred_restaurant_subscription(
  p_signup_application_id uuid,
  p_restaurant_id uuid,
  p_plan_id uuid,
  p_billing_period text DEFAULT 'monthly',
  p_commercial_source_objectid bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_application public.signup_applications%ROWTYPE;
  v_plan public.restaurant_subscription_plans%ROWTYPE;
  v_subscription public.restaurant_ai_subscriptions%ROWTYPE;
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_billing_period text := lower(trim(COALESCE(p_billing_period, 'monthly')));
  v_amount numeric;
  v_amount_ht numeric;
  v_amount_tva numeric;
  v_monthly_cents integer;
  v_amount_cents integer;
  v_amount_ht_cents integer;
  v_amount_tva_cents integer;
  v_period_start date := (now() AT TIME ZONE 'Europe/Zurich')::date;
  v_period_end date;
  v_signed_plan_slug text;
  v_signed_billing_period text;
BEGIN
  IF p_signup_application_id IS NULL OR p_restaurant_id IS NULL OR p_plan_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_restaurant_and_plan_required';
  END IF;
  IF v_billing_period NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_restaurant_subscription_billing_period';
  END IF;
  IF v_billing_period = 'yearly'
    AND NOT public.is_feature_flag_active('billing-fair-growth-annual')
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'fair_growth_annual_not_enabled';
  END IF;

  SELECT application.* INTO v_application
  FROM public.signup_applications application
  WHERE application.id = p_signup_application_id
    AND application.requested_role = 'restaurateur'::public.app_role
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurateur_signup_application_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants restaurant
    WHERE restaurant.id = p_restaurant_id
      AND restaurant.owner_id = v_application.user_id
      AND NOT COALESCE(restaurant.is_demo, false)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'real_signup_restaurant_required';
  END IF;

  IF v_application.restaurant_subscription_id IS NOT NULL
    OR v_application.subscription_invoice_id IS NOT NULL
  THEN
    IF v_application.restaurant_subscription_id IS NULL
      OR v_application.subscription_invoice_id IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'incomplete_deferred_subscription_contract_links';
    END IF;

    SELECT subscription.* INTO v_subscription
    FROM public.restaurant_ai_subscriptions subscription
    WHERE subscription.id = v_application.restaurant_subscription_id
      AND subscription.signup_application_id = p_signup_application_id
      AND subscription.restaurant_id = p_restaurant_id
      AND subscription.internal_invoice_id = v_application.subscription_invoice_id;
    SELECT invoice.* INTO v_invoice
    FROM public.restaurant_invoices invoice
    WHERE invoice.id = v_application.subscription_invoice_id
      AND invoice.signup_application_id = p_signup_application_id
      AND invoice.subscription_id = v_application.restaurant_subscription_id
      AND invoice.restaurant_id = p_restaurant_id
      AND invoice.invoice_type = 'subscription';

    IF v_subscription.id IS NULL OR v_invoice.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'inconsistent_deferred_subscription_contract_links';
    END IF;
    IF v_subscription.restaurant_subscription_plan_id IS DISTINCT FROM p_plan_id
      OR v_subscription.billing_period IS DISTINCT FROM v_billing_period
      OR v_application.commercial_source_objectid IS DISTINCT FROM p_commercial_source_objectid
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'deferred_subscription_contract_snapshot_is_immutable';
    END IF;

    RETURN jsonb_build_object(
      'subscription_id', v_subscription.id,
      'invoice_id', v_invoice.id,
      'subscription_status', v_subscription.status,
      'invoice_status', v_invoice.status,
      'billing_period', v_subscription.billing_period,
      'amount_chf', v_invoice.amount_ttc,
      'idempotent', true
    );
  END IF;

  SELECT plan.* INTO v_plan
  FROM public.restaurant_subscription_plans plan
  WHERE plan.id = p_plan_id
    AND plan.is_active
    AND plan.slug IN ('starter', 'pro', 'premium', 'elite');
  IF NOT FOUND OR v_plan.price_monthly_chf <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'active_restaurant_subscription_plan_required';
  END IF;

  IF v_application.selected_subscription_plan_id IS NOT NULL
    AND v_application.selected_subscription_plan_id IS DISTINCT FROM p_plan_id
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'signup_subscription_plan_snapshot_mismatch';
  END IF;
  IF v_application.selected_subscription_billing_period IS NOT NULL
    AND v_application.selected_subscription_billing_period IS DISTINCT FROM v_billing_period
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'signup_subscription_billing_period_snapshot_mismatch';
  END IF;

  v_amount := CASE
    WHEN v_billing_period = 'yearly' THEN v_plan.price_monthly_chf * v_plan.annual_months_charged
    ELSE v_plan.price_monthly_chf
  END;
  v_period_end := CASE
    WHEN v_billing_period = 'yearly' THEN (v_period_start + interval '1 year - 1 day')::date
    ELSE (v_period_start + interval '1 month - 1 day')::date
  END;
  v_monthly_cents := round(v_plan.price_monthly_chf * 100)::integer;
  v_amount_cents := round(v_amount * 100)::integer;
  v_amount_tva_cents := public.swiss_vat_from_tax_inclusive_cents(v_amount_cents, 810);
  v_amount_ht_cents := v_amount_cents - v_amount_tva_cents;
  v_amount_ht := v_amount_ht_cents::numeric / 100;
  v_amount_tva := v_amount_tva_cents::numeric / 100;

  IF p_commercial_source_objectid IS NOT NULL THEN
    SELECT followup.signed_subscription_plan_slug,
           COALESCE(followup.signed_subscription_billing_period, 'monthly')
    INTO v_signed_plan_slug, v_signed_billing_period
    FROM public.commercial_prospect_followups followup
    WHERE followup.source_objectid = p_commercial_source_objectid
      AND followup.status = 'signed'
      AND followup.signed_by IS NOT NULL
      AND (followup.signed_restaurant_id IS NULL OR followup.signed_restaurant_id = p_restaurant_id)
    FOR UPDATE;
    IF NOT FOUND
      OR v_signed_plan_slug IS DISTINCT FROM v_plan.slug
      OR v_signed_billing_period IS DISTINCT FROM v_billing_period
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signed_and_signup_subscription_snapshot_mismatch';
    END IF;
  END IF;

  PERFORM set_config('app.fair_growth_subscription_snapshot_write', 'on', true);
  INSERT INTO public.restaurant_ai_subscriptions (
    restaurant_id, plan, status,
    monthly_conversation_limit, monthly_text_tool_limit, monthly_image_limit,
    monthly_premium_image_limit, monthly_voice_minutes_limit,
    metadata, restaurant_subscription_plan_id, billing_period, stripe_mode,
    monthly_campaign_credit_chf, monthly_ai_tool_credits, monthly_photo_retouch_credits,
    signup_application_id, price_monthly_chf_snapshot, billing_amount_chf_snapshot,
    price_monthly_cents_snapshot, billing_amount_cents_snapshot,
    billing_net_cents_snapshot, billing_vat_cents_snapshot, vat_rate_bps_snapshot,
    annual_months_charged_snapshot, acquired_reservation_fee_cents_snapshot,
    marketplace_commission_bps_snapshot, included_establishments_snapshot,
    additional_establishment_price_cents_snapshot, reservation_revenue_cap_bps_snapshot,
    developer_order_bps_snapshot, developer_tok_revenue_bps_snapshot,
    pricing_version_snapshot, currency
  ) VALUES (
    p_restaurant_id, v_plan.slug, 'awaiting_payment_method',
    v_plan.monthly_conversation_limit, v_plan.monthly_text_tool_limit, v_plan.monthly_image_limit,
    v_plan.monthly_premium_image_limit, v_plan.monthly_voice_minutes_limit,
    jsonb_build_object(
      'lifecycle', 'deferred_activation',
      'signup_application_id', p_signup_application_id,
      'plan_name_snapshot', v_plan.name,
      'plan_public_name_snapshot', v_plan.public_name,
      'billing_period', v_billing_period,
      'pricing_version', v_plan.pricing_version,
      'prices_include_vat', true,
      'monthly_entitlements_on_annual', true
    ),
    v_plan.id, v_billing_period, 'live',
    v_plan.campaign_credit_chf, v_plan.ai_tool_credits, v_plan.ai_photo_credits,
    p_signup_application_id, v_plan.price_monthly_chf, v_amount,
    v_monthly_cents, v_amount_cents, v_amount_ht_cents, v_amount_tva_cents, 810,
    v_plan.annual_months_charged, v_plan.acquired_reservation_fee_cents,
    v_plan.marketplace_commission_bps, v_plan.included_establishments,
    v_plan.additional_establishment_price_cents, v_plan.reservation_revenue_cap_bps,
    v_plan.developer_order_bps, v_plan.developer_tok_revenue_bps,
    v_plan.pricing_version, 'CHF'
  )
  ON CONFLICT (restaurant_id) DO UPDATE
  SET signup_application_id = EXCLUDED.signup_application_id,
      restaurant_subscription_plan_id = EXCLUDED.restaurant_subscription_plan_id,
      plan = EXCLUDED.plan,
      billing_period = EXCLUDED.billing_period,
      price_monthly_chf_snapshot = EXCLUDED.price_monthly_chf_snapshot,
      billing_amount_chf_snapshot = EXCLUDED.billing_amount_chf_snapshot,
      price_monthly_cents_snapshot = EXCLUDED.price_monthly_cents_snapshot,
      billing_amount_cents_snapshot = EXCLUDED.billing_amount_cents_snapshot,
      billing_net_cents_snapshot = EXCLUDED.billing_net_cents_snapshot,
      billing_vat_cents_snapshot = EXCLUDED.billing_vat_cents_snapshot,
      vat_rate_bps_snapshot = EXCLUDED.vat_rate_bps_snapshot,
      annual_months_charged_snapshot = EXCLUDED.annual_months_charged_snapshot,
      acquired_reservation_fee_cents_snapshot = EXCLUDED.acquired_reservation_fee_cents_snapshot,
      marketplace_commission_bps_snapshot = EXCLUDED.marketplace_commission_bps_snapshot,
      included_establishments_snapshot = EXCLUDED.included_establishments_snapshot,
      additional_establishment_price_cents_snapshot = EXCLUDED.additional_establishment_price_cents_snapshot,
      reservation_revenue_cap_bps_snapshot = EXCLUDED.reservation_revenue_cap_bps_snapshot,
      developer_order_bps_snapshot = EXCLUDED.developer_order_bps_snapshot,
      developer_tok_revenue_bps_snapshot = EXCLUDED.developer_tok_revenue_bps_snapshot,
      pricing_version_snapshot = EXCLUDED.pricing_version_snapshot,
      metadata = public.restaurant_ai_subscriptions.metadata || EXCLUDED.metadata
  WHERE public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
  RETURNING * INTO v_subscription;

  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'existing_subscription_is_not_replaceable';
  END IF;

  INSERT INTO public.restaurant_invoices (
    restaurant_id, period_start, period_end,
    amount_ht, amount_tva, amount_ttc, status,
    invoice_number, invoice_type, signup_application_id,
    subscription_id, currency, issued_at, vat_rate_bps, tax_breakdown, metadata
  ) VALUES (
    p_restaurant_id, v_period_start, v_period_end,
    v_amount_ht, v_amount_tva, v_amount, 'reserved',
    'TOK-SUB-' || replace(p_signup_application_id::text, '-', ''),
    'subscription', p_signup_application_id, v_subscription.id, 'CHF', now(), 810,
    jsonb_build_array(jsonb_build_object(
      'vat_rate_bps', 810,
      'amount_ht', v_amount_ht,
      'amount_tva', v_amount_tva,
      'amount_ttc', v_amount
    )),
    jsonb_build_object(
      'service_period_reserved', true,
      'plan_id', v_plan.id,
      'plan_slug', v_plan.slug,
      'plan_public_name_snapshot', v_plan.public_name,
      'billing_period', v_billing_period,
      'annual_months_charged', v_plan.annual_months_charged,
      'pricing_version', v_plan.pricing_version,
      'prices_include_vat', true
    )
  )
  ON CONFLICT (signup_application_id)
    WHERE signup_application_id IS NOT NULL AND invoice_type = 'subscription'
  DO UPDATE SET subscription_id = EXCLUDED.subscription_id
  RETURNING * INTO v_invoice;

  INSERT INTO public.restaurant_invoice_line_items (
    invoice_id, restaurant_id, item_kind, source_table, source_id,
    source_label, occurred_at, quantity, unit_amount, base_amount,
    rate_label, rate_value, amount_ht, amount_tva, amount_ttc, metadata
  ) VALUES (
    v_invoice.id, p_restaurant_id, 'restaurant_subscription',
    'signup_applications', p_signup_application_id,
    'Abonnement restaurateur TOK - ' || v_plan.public_name,
    now(), 1, v_amount, v_amount,
    'TVA suisse 8.1%', 8.1, v_amount_ht, v_amount_tva, v_amount,
    jsonb_build_object(
      'plan_id', v_plan.id,
      'plan_slug', v_plan.slug,
      'billing_period', v_billing_period,
      'annual_months_charged', v_plan.annual_months_charged,
      'pricing_version', v_plan.pricing_version,
      'vat_rate_bps', 810,
      'tax_inclusive', true,
      'developer_share_basis_cents', round(v_amount_ht * 100)::integer,
      'developer_share_bps', v_plan.developer_tok_revenue_bps
    )
  )
  ON CONFLICT (source_table, source_id, item_kind)
    WHERE source_id IS NOT NULL
  DO UPDATE SET
    invoice_id = EXCLUDED.invoice_id,
    source_label = EXCLUDED.source_label,
    unit_amount = EXCLUDED.unit_amount,
    base_amount = EXCLUDED.base_amount,
    amount_ht = EXCLUDED.amount_ht,
    amount_tva = EXCLUDED.amount_tva,
    amount_ttc = EXCLUDED.amount_ttc,
    metadata = public.restaurant_invoice_line_items.metadata || EXCLUDED.metadata;

  UPDATE public.restaurant_ai_subscriptions subscription
  SET internal_invoice_id = v_invoice.id
  WHERE subscription.id = v_subscription.id;

  UPDATE public.signup_applications application
  SET selected_subscription_plan_id = v_plan.id,
      selected_subscription_billing_period = v_billing_period,
      commercial_source_objectid = p_commercial_source_objectid,
      restaurant_subscription_id = v_subscription.id,
      subscription_invoice_id = v_invoice.id
  WHERE application.id = p_signup_application_id;

  IF p_commercial_source_objectid IS NOT NULL THEN
    UPDATE public.commercial_prospect_followups followup
    SET signed_restaurant_id = p_restaurant_id,
        updated_at = now()
    WHERE followup.source_objectid = p_commercial_source_objectid
      AND followup.status = 'signed'
      AND (followup.signed_restaurant_id IS NULL OR followup.signed_restaurant_id = p_restaurant_id);
  END IF;

  RETURN jsonb_build_object(
    'subscription_id', v_subscription.id,
    'invoice_id', v_invoice.id,
    'subscription_status', v_subscription.status,
    'invoice_status', v_invoice.status,
    'billing_period', v_billing_period,
    'amount_chf', v_invoice.amount_ttc
  );
END;
$$;

REVOKE ALL ON FUNCTION private_finance.ensure_deferred_restaurant_subscription(
  uuid, uuid, uuid, text, bigint
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private_finance.protect_restaurant_subscription_pricing_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan public.restaurant_subscription_plans%ROWTYPE;
  v_plan_or_period_changed boolean;
  v_snapshot_changed boolean;
  v_is_deferred_preactivation boolean;
  v_expected_monthly_cents integer;
  v_expected_amount_cents integer;
  v_expected_vat_cents integer;
  v_expected_net_cents integer;
BEGIN
  v_plan_or_period_changed :=
    OLD.restaurant_subscription_plan_id IS DISTINCT FROM NEW.restaurant_subscription_plan_id
    OR OLD.plan IS DISTINCT FROM NEW.plan
    OR OLD.billing_period IS DISTINCT FROM NEW.billing_period;
  v_snapshot_changed := v_plan_or_period_changed
    OR OLD.price_monthly_chf_snapshot IS DISTINCT FROM NEW.price_monthly_chf_snapshot
    OR OLD.billing_amount_chf_snapshot IS DISTINCT FROM NEW.billing_amount_chf_snapshot
    OR OLD.price_monthly_cents_snapshot IS DISTINCT FROM NEW.price_monthly_cents_snapshot
    OR OLD.billing_amount_cents_snapshot IS DISTINCT FROM NEW.billing_amount_cents_snapshot
    OR OLD.billing_net_cents_snapshot IS DISTINCT FROM NEW.billing_net_cents_snapshot
    OR OLD.billing_vat_cents_snapshot IS DISTINCT FROM NEW.billing_vat_cents_snapshot
    OR OLD.vat_rate_bps_snapshot IS DISTINCT FROM NEW.vat_rate_bps_snapshot
    OR OLD.annual_months_charged_snapshot IS DISTINCT FROM NEW.annual_months_charged_snapshot
    OR OLD.acquired_reservation_fee_cents_snapshot IS DISTINCT FROM NEW.acquired_reservation_fee_cents_snapshot
    OR OLD.marketplace_commission_bps_snapshot IS DISTINCT FROM NEW.marketplace_commission_bps_snapshot
    OR OLD.included_establishments_snapshot IS DISTINCT FROM NEW.included_establishments_snapshot
    OR OLD.additional_establishment_price_cents_snapshot IS DISTINCT FROM NEW.additional_establishment_price_cents_snapshot
    OR OLD.reservation_revenue_cap_bps_snapshot IS DISTINCT FROM NEW.reservation_revenue_cap_bps_snapshot
    OR OLD.developer_order_bps_snapshot IS DISTINCT FROM NEW.developer_order_bps_snapshot
    OR OLD.developer_tok_revenue_bps_snapshot IS DISTINCT FROM NEW.developer_tok_revenue_bps_snapshot
    OR OLD.pricing_version_snapshot IS DISTINCT FROM NEW.pricing_version_snapshot;

  IF NOT v_snapshot_changed THEN
    RETURN NEW;
  END IF;
  IF NOT v_plan_or_period_changed THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'restaurant_subscription_same_plan_price_refresh_forbidden';
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'restaurant_subscription_pricing_transition_requires_service_role';
  END IF;

  v_is_deferred_preactivation :=
    OLD.internal_invoice_id IS NULL
    AND OLD.status IN ('awaiting_payment_method', 'awaiting_activation')
    AND NEW.status IN ('awaiting_payment_method', 'awaiting_activation');
  IF NOT v_is_deferred_preactivation
    AND COALESCE(NEW.metadata ->> 'pricing_snapshot_transition', '') <> 'stripe_plan_change'
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'restaurant_subscription_pricing_transition_marker_required';
  END IF;

  IF NEW.restaurant_subscription_plan_id IS NULL
    OR NEW.billing_period NOT IN ('monthly', 'yearly')
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'restaurant_subscription_pricing_transition_invalid_target';
  END IF;
  SELECT plan.* INTO v_plan
  FROM public.restaurant_subscription_plans plan
  WHERE plan.id = NEW.restaurant_subscription_plan_id
    AND plan.is_active
    AND plan.slug IN ('starter', 'pro', 'premium', 'elite');
  IF NOT FOUND OR NEW.plan IS DISTINCT FROM v_plan.slug THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'restaurant_subscription_pricing_transition_plan_mismatch';
  END IF;
  IF NEW.billing_period = 'yearly' THEN
    IF v_plan.annual_months_charged <> 11
      OR NOT public.is_feature_flag_active('billing-fair-growth-annual')
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'fair_growth_annual_not_enabled';
    END IF;
  END IF;

  v_expected_monthly_cents := round(v_plan.price_monthly_chf * 100)::integer;
  v_expected_amount_cents := v_expected_monthly_cents
    * CASE WHEN NEW.billing_period = 'yearly' THEN 11 ELSE 1 END;
  v_expected_vat_cents := public.swiss_vat_from_tax_inclusive_cents(
    v_expected_amount_cents, 810
  );
  v_expected_net_cents := v_expected_amount_cents - v_expected_vat_cents;

  IF NEW.currency IS DISTINCT FROM 'CHF'
    OR NEW.price_monthly_chf_snapshot IS DISTINCT FROM v_expected_monthly_cents::numeric / 100
    OR NEW.billing_amount_chf_snapshot IS DISTINCT FROM v_expected_amount_cents::numeric / 100
    OR NEW.price_monthly_cents_snapshot IS DISTINCT FROM v_expected_monthly_cents
    OR NEW.billing_amount_cents_snapshot IS DISTINCT FROM v_expected_amount_cents
    OR NEW.billing_net_cents_snapshot IS DISTINCT FROM v_expected_net_cents
    OR NEW.billing_vat_cents_snapshot IS DISTINCT FROM v_expected_vat_cents
    OR NEW.vat_rate_bps_snapshot IS DISTINCT FROM 810
    OR NEW.annual_months_charged_snapshot IS DISTINCT FROM v_plan.annual_months_charged
    OR NEW.acquired_reservation_fee_cents_snapshot IS DISTINCT FROM v_plan.acquired_reservation_fee_cents
    OR NEW.marketplace_commission_bps_snapshot IS DISTINCT FROM v_plan.marketplace_commission_bps
    OR NEW.included_establishments_snapshot IS DISTINCT FROM v_plan.included_establishments
    OR NEW.additional_establishment_price_cents_snapshot IS DISTINCT FROM v_plan.additional_establishment_price_cents
    OR NEW.reservation_revenue_cap_bps_snapshot IS DISTINCT FROM v_plan.reservation_revenue_cap_bps
    OR NEW.developer_order_bps_snapshot IS DISTINCT FROM v_plan.developer_order_bps
    OR NEW.developer_tok_revenue_bps_snapshot IS DISTINCT FROM v_plan.developer_tok_revenue_bps
    OR NEW.pricing_version_snapshot IS DISTINCT FROM v_plan.pricing_version
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'restaurant_subscription_pricing_transition_snapshot_mismatch';
  END IF;

  -- The webhook marker is a one-shot capability, never durable subscription data.
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) - 'pricing_snapshot_transition';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_restaurant_subscription_pricing_snapshot
  ON public.restaurant_ai_subscriptions;
CREATE TRIGGER protect_restaurant_subscription_pricing_snapshot
  BEFORE UPDATE ON public.restaurant_ai_subscriptions
  FOR EACH ROW EXECUTE FUNCTION private_finance.protect_restaurant_subscription_pricing_snapshot();

REVOKE ALL ON FUNCTION private_finance.protect_restaurant_subscription_pricing_snapshot()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private_finance.validate_restaurant_subscription_pricing_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan public.restaurant_subscription_plans%ROWTYPE;
  v_monthly_cents integer;
  v_amount_cents integer;
  v_vat_cents integer;
BEGIN
  IF NEW.pricing_version_snapshot IS NULL
    AND NEW.status NOT IN ('active', 'trialing')
  THEN
    RETURN NEW;
  END IF;
  IF NOT (
    COALESCE(auth.role() = 'service_role', false)
    OR COALESCE(current_setting('app.fair_growth_subscription_snapshot_write', true), '') = 'on'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'restaurant_subscription_pricing_insert_requires_server';
  END IF;

  SELECT plan.* INTO v_plan
  FROM public.restaurant_subscription_plans plan
  WHERE plan.id = NEW.restaurant_subscription_plan_id
    AND plan.is_active
    AND plan.slug IN ('starter', 'pro', 'premium', 'elite');
  IF NOT FOUND
    OR NEW.plan IS DISTINCT FROM v_plan.slug
    OR NEW.billing_period NOT IN ('monthly', 'yearly')
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'restaurant_subscription_pricing_insert_plan_mismatch';
  END IF;
  IF NEW.billing_period = 'yearly' AND (
    v_plan.annual_months_charged <> 11
    OR NOT public.is_feature_flag_active('billing-fair-growth-annual')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'fair_growth_annual_not_enabled';
  END IF;

  v_monthly_cents := round(v_plan.price_monthly_chf * 100)::integer;
  v_amount_cents := v_monthly_cents
    * CASE WHEN NEW.billing_period = 'yearly' THEN 11 ELSE 1 END;
  v_vat_cents := public.swiss_vat_from_tax_inclusive_cents(v_amount_cents, 810);
  IF NEW.currency IS DISTINCT FROM 'CHF'
    OR NEW.price_monthly_chf_snapshot IS DISTINCT FROM v_monthly_cents::numeric / 100
    OR NEW.billing_amount_chf_snapshot IS DISTINCT FROM v_amount_cents::numeric / 100
    OR NEW.price_monthly_cents_snapshot IS DISTINCT FROM v_monthly_cents
    OR NEW.billing_amount_cents_snapshot IS DISTINCT FROM v_amount_cents
    OR NEW.billing_net_cents_snapshot IS DISTINCT FROM v_amount_cents - v_vat_cents
    OR NEW.billing_vat_cents_snapshot IS DISTINCT FROM v_vat_cents
    OR NEW.vat_rate_bps_snapshot IS DISTINCT FROM 810
    OR NEW.annual_months_charged_snapshot IS DISTINCT FROM v_plan.annual_months_charged
    OR NEW.acquired_reservation_fee_cents_snapshot IS DISTINCT FROM v_plan.acquired_reservation_fee_cents
    OR NEW.marketplace_commission_bps_snapshot IS DISTINCT FROM v_plan.marketplace_commission_bps
    OR NEW.included_establishments_snapshot IS DISTINCT FROM v_plan.included_establishments
    OR NEW.additional_establishment_price_cents_snapshot IS DISTINCT FROM v_plan.additional_establishment_price_cents
    OR NEW.reservation_revenue_cap_bps_snapshot IS DISTINCT FROM v_plan.reservation_revenue_cap_bps
    OR NEW.developer_order_bps_snapshot IS DISTINCT FROM v_plan.developer_order_bps
    OR NEW.developer_tok_revenue_bps_snapshot IS DISTINCT FROM v_plan.developer_tok_revenue_bps
    OR NEW.pricing_version_snapshot IS DISTINCT FROM v_plan.pricing_version
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'restaurant_subscription_pricing_insert_snapshot_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_restaurant_subscription_pricing_insert
  ON public.restaurant_ai_subscriptions;
CREATE TRIGGER validate_restaurant_subscription_pricing_insert
  BEFORE INSERT ON public.restaurant_ai_subscriptions
  FOR EACH ROW EXECUTE FUNCTION private_finance.validate_restaurant_subscription_pricing_insert();

REVOKE ALL ON FUNCTION private_finance.validate_restaurant_subscription_pricing_insert()
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.claim_restaurant_subscription_activation_jobs(integer, integer);
CREATE FUNCTION public.claim_restaurant_subscription_activation_jobs(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  job_id uuid,
  subscription_id uuid,
  internal_invoice_id uuid,
  restaurant_id uuid,
  signup_application_id uuid,
  plan_id uuid,
  plan_slug text,
  plan_name text,
  amount_chf numeric,
  billing_period text,
  currency text,
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_setup_intent_id text,
  stripe_mode text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  activation_mode text,
  attempt_count integer,
  activation_trigger_type text,
  activation_trigger_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_lease integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 15), 900);
  v_candidate record;
  v_claimed public.restaurant_subscription_activation_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;

  FOR v_candidate IN
    SELECT job.id
    FROM public.restaurant_subscription_activation_jobs job
    JOIN public.restaurant_ai_subscriptions subscription ON subscription.id = job.subscription_id
    JOIN public.restaurant_subscription_payment_methods payment_method
      ON payment_method.subscription_id = subscription.id
    WHERE subscription.status = 'activation_pending'
      AND subscription.payment_method_ready_at IS NOT NULL
      AND job.available_at <= now()
      AND (job.status = 'queued' OR (job.status = 'processing' AND job.locked_until <= now()))
    ORDER BY job.triggered_at, job.created_at
    FOR UPDATE OF job SKIP LOCKED
    LIMIT v_limit
  LOOP
    UPDATE public.restaurant_subscription_activation_jobs job
    SET status = 'processing',
        attempt_count = job.attempt_count + 1,
        locked_at = now(),
        locked_until = now() + make_interval(secs => v_lease),
        last_error_code = NULL,
        last_error_message = NULL
    WHERE job.id = v_candidate.id
    RETURNING * INTO v_claimed;

    UPDATE public.restaurant_invoices invoice
    SET status = CASE WHEN invoice.status IN ('reserved', 'open') THEN 'processing' ELSE invoice.status END,
        due_at = COALESCE(invoice.due_at, now())
    FROM public.restaurant_ai_subscriptions subscription
    WHERE subscription.id = v_claimed.subscription_id
      AND invoice.id = subscription.internal_invoice_id
      AND invoice.status <> 'paid';

    RETURN QUERY
    SELECT
      v_claimed.id,
      subscription.id,
      subscription.internal_invoice_id,
      subscription.restaurant_id,
      subscription.signup_application_id,
      subscription.restaurant_subscription_plan_id,
      subscription.plan,
      COALESCE(plan.name, subscription.plan),
      COALESCE(subscription.billing_amount_chf_snapshot, invoice.amount_ttc),
      subscription.billing_period,
      subscription.currency,
      payment_method.stripe_customer_id,
      payment_method.stripe_payment_method_id,
      payment_method.stripe_setup_intent_id,
      payment_method.stripe_mode,
      subscription.stripe_subscription_id,
      invoice.stripe_invoice_id,
      CASE WHEN subscription.stripe_subscription_id IS NOT NULL THEN 'retry_payment' ELSE 'create_subscription' END,
      v_claimed.attempt_count,
      v_claimed.trigger_type,
      v_claimed.trigger_id
    FROM public.restaurant_ai_subscriptions subscription
    LEFT JOIN public.restaurant_subscription_plans plan
      ON plan.id = subscription.restaurant_subscription_plan_id
    LEFT JOIN public.restaurant_invoices invoice
      ON invoice.id = subscription.internal_invoice_id
    JOIN public.restaurant_subscription_payment_methods payment_method
      ON payment_method.subscription_id = subscription.id
    WHERE subscription.id = v_claimed.subscription_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_restaurant_subscription_activation_jobs(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_subscription_activation_jobs(integer, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Marketplace ledger: tiered commission, 1% developer, tips untouched
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_marketplace_checkout_ledger(
  p_stripe_event_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_checkout_kind text,
  p_restaurant_id uuid,
  p_gross_cents integer,
  p_currency text DEFAULT 'CHF',
  p_livemode boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source_type text DEFAULT 'stripe_checkout'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text := lower(trim(COALESCE(p_checkout_kind, '')));
  v_currency text := upper(trim(COALESCE(p_currency, 'CHF')));
  v_source_type text := lower(trim(COALESCE(p_source_type, 'stripe_checkout')));
  v_is_marketplace boolean;
  v_platform_fee_bps integer;
  v_developer_share_bps integer;
  v_developer_order_bps integer;
  v_commissionable_cents integer;
  v_tip_cents integer;
  v_delivery_cents integer;
  v_other_noncommissionable_cents integer;
  v_platform_revenue_cents integer;
  v_platform_vat_cents integer := 0;
  v_restaurant_share_cents integer := 0;
  v_developer_share_cents integer;
  v_delivery_payable_cents integer := 0;
  v_revenue_account text;
  v_revenue_source text;
  v_metadata jsonb;
BEGIN
  IF NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'stripe_event_id_required';
  END IF;
  IF NULLIF(trim(COALESCE(p_checkout_session_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'checkout_session_id_required';
  END IF;
  IF p_gross_cents IS NULL OR p_gross_cents <= 0 THEN
    RAISE EXCEPTION 'gross_cents_must_be_positive';
  END IF;
  IF v_currency <> 'CHF' THEN
    RAISE EXCEPTION 'unsupported_currency';
  END IF;
  IF v_source_type NOT IN ('stripe_checkout', 'stripe_invoice') THEN
    RAISE EXCEPTION 'invalid_finance_source_type';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stripe_webhook_events event
    WHERE event.event_id = p_stripe_event_id
  ) THEN
    RAISE EXCEPTION 'stripe_event_not_claimed';
  END IF;

  SELECT config.platform_fee_bps, config.developer_share_bps, config.developer_order_bps
  INTO v_platform_fee_bps, v_developer_share_bps, v_developer_order_bps
  FROM public.finance_runtime_config config
  WHERE config.config_key = 'default';

  v_platform_fee_bps := CASE
    WHEN COALESCE(p_metadata ->> 'platform_fee_bps', '') ~ '^[0-9]{1,5}$'
      THEN (p_metadata ->> 'platform_fee_bps')::integer
    ELSE COALESCE(v_platform_fee_bps, 990)
  END;
  v_developer_share_bps := CASE
    WHEN COALESCE(p_metadata ->> 'developer_share_bps', '') ~ '^[0-9]{1,5}$'
      THEN (p_metadata ->> 'developer_share_bps')::integer
    ELSE COALESCE(v_developer_share_bps, 1000)
  END;
  v_developer_order_bps := CASE
    WHEN COALESCE(p_metadata ->> 'developer_order_bps', '') ~ '^[0-9]{1,5}$'
      THEN (p_metadata ->> 'developer_order_bps')::integer
    ELSE COALESCE(v_developer_order_bps, 100)
  END;
  IF v_platform_fee_bps NOT BETWEEN 0 AND 10000
    OR v_developer_share_bps NOT BETWEEN 0 AND 10000
    OR v_developer_order_bps NOT BETWEEN 0 AND 10000
  THEN
    RAISE EXCEPTION 'invalid_finance_split_snapshot';
  END IF;

  v_is_marketplace := v_kind IN ('order', 'zero-attente', 'chefs-table', 'match-group');
  IF v_is_marketplace AND p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_required_for_marketplace_payment';
  END IF;

  IF v_is_marketplace THEN
    v_tip_cents := CASE
      WHEN COALESCE(p_metadata ->> 'tip_cents', '') ~ '^[0-9]+$' THEN (p_metadata ->> 'tip_cents')::integer
      ELSE 0
    END;
    v_delivery_cents := CASE
      WHEN COALESCE(p_metadata ->> 'delivery_pass_through_cents', '') ~ '^[0-9]+$'
        THEN (p_metadata ->> 'delivery_pass_through_cents')::integer
      ELSE 0
    END;
    v_commissionable_cents := CASE
      WHEN COALESCE(p_metadata ->> 'commissionable_cents', '') ~ '^[0-9]+$'
        THEN (p_metadata ->> 'commissionable_cents')::integer
      ELSE p_gross_cents - v_tip_cents - v_delivery_cents
    END;
    IF v_commissionable_cents < 0
      OR v_tip_cents < 0
      OR v_delivery_cents < 0
      OR v_commissionable_cents + v_tip_cents + v_delivery_cents > p_gross_cents
    THEN
      RAISE EXCEPTION 'invalid_marketplace_finance_basis';
    END IF;
    v_other_noncommissionable_cents := p_gross_cents
      - v_commissionable_cents - v_tip_cents - v_delivery_cents;
    v_platform_revenue_cents := round(
      v_commissionable_cents::numeric * v_platform_fee_bps / 10000
    )::integer;
    v_developer_share_cents := round(
      v_commissionable_cents::numeric * v_developer_order_bps / 10000
    )::integer;
    IF v_developer_share_cents > v_platform_revenue_cents THEN
      RAISE EXCEPTION 'developer_share_exceeds_platform_commission';
    END IF;
    v_restaurant_share_cents := v_commissionable_cents - v_platform_revenue_cents
      + v_tip_cents + v_other_noncommissionable_cents;
    v_delivery_payable_cents := v_delivery_cents;
    v_revenue_account := 'tok_platform_commission_revenue';
    v_revenue_source := 'other';
  ELSE
    v_platform_vat_cents := CASE
      WHEN v_kind IN (
        'restaurant-onboarding', 'restaurant-subscription-upgrade',
        'restaurant-module', 'campaign'
      ) THEN public.swiss_vat_from_tax_inclusive_cents(p_gross_cents, 810)
      ELSE 0
    END;
    v_platform_revenue_cents := p_gross_cents - v_platform_vat_cents;
    v_developer_share_cents := round(
      v_platform_revenue_cents::numeric * v_developer_share_bps / 10000
    )::integer;
    v_revenue_account := CASE
      WHEN v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN 'tok_subscription_revenue'
      WHEN v_kind = 'tok-one' THEN 'tok_one_revenue'
      WHEN v_kind = 'restaurant-credit-pack' THEN 'tok_credit_pack_revenue'
      WHEN v_kind = 'campaign' THEN 'tok_campaign_revenue'
      WHEN v_kind = 'restaurant-module' THEN 'tok_module_revenue'
      ELSE 'tok_other_revenue'
    END;
    v_revenue_source := CASE
      WHEN v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN 'subscription'
      WHEN v_kind = 'tok-one' THEN 'tok_one'
      WHEN v_kind = 'restaurant-credit-pack' THEN 'pack'
      WHEN v_kind = 'campaign' THEN 'sponsorship'
      ELSE 'other'
    END;
    v_tip_cents := 0;
    v_delivery_cents := 0;
    v_commissionable_cents := p_gross_cents;
    v_other_noncommissionable_cents := 0;
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'checkout_kind', v_kind,
    'checkout_session_id', p_checkout_session_id,
    'payment_intent_id', p_payment_intent_id,
    'gross_cents', p_gross_cents,
    'commissionable_cents', v_commissionable_cents,
    'tip_cents', v_tip_cents,
    'delivery_pass_through_cents', v_delivery_cents,
    'other_noncommissionable_cents', v_other_noncommissionable_cents,
    'platform_revenue_cents', v_platform_revenue_cents,
    'platform_vat_cents', v_platform_vat_cents,
    'restaurant_share_cents', v_restaurant_share_cents,
    'delivery_payable_cents', v_delivery_payable_cents,
    'platform_fee_bps', v_platform_fee_bps,
    'platform_revenue_account', v_revenue_account,
    'developer_order_bps', v_developer_order_bps,
    'developer_share_bps', v_developer_share_bps,
    'developer_share_cents', v_developer_share_cents,
    'pricing_version', COALESCE(p_metadata ->> 'pricing_version', 'fair_growth_2026_07'),
    'livemode', p_livemode
  );

  INSERT INTO public.financial_ledger (
    source_type, source_id, stripe_event_id, restaurant_id,
    account_code, direction, amount_cents, currency, metadata
  ) VALUES (
    v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
    'payment_asset', 'debit', p_gross_cents, v_currency, v_metadata
  ) ON CONFLICT DO NOTHING;

  IF v_restaurant_share_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      'restaurant_payable', 'credit', v_restaurant_share_cents, v_currency, v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_delivery_payable_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      'delivery_pass_through_payable', 'credit', v_delivery_payable_cents, v_currency, v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_platform_revenue_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      v_revenue_account, 'credit', v_platform_revenue_cents, v_currency, v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_platform_vat_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      'tax_payable', 'credit', v_platform_vat_cents, v_currency, v_metadata
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF v_developer_share_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES
      (v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
       'developer_revenue_share_expense', 'debit', v_developer_share_cents, v_currency, v_metadata),
      (v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
       'developer_payable', 'credit', v_developer_share_cents, v_currency, v_metadata)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.platform_revenue_entries (
    revenue_source, restaurant_id, amount_chf, currency, occurred_at,
    stripe_payment_intent_id, stripe_checkout_session_id, stripe_invoice_id, metadata
  ) VALUES (
    v_revenue_source, p_restaurant_id, v_platform_revenue_cents::numeric / 100,
    v_currency, now(), p_payment_intent_id,
    CASE WHEN v_source_type = 'stripe_checkout' THEN p_checkout_session_id ELSE NULL END,
    CASE WHEN v_source_type = 'stripe_invoice' THEN p_checkout_session_id ELSE NULL END,
    v_metadata
  ) ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_marketplace_checkout_ledger(
  text, text, text, text, uuid, integer, text, boolean, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;

-- Manual/non-Stripe settlement of restaurant invoices. Stripe-settled
-- invoices are already recognized by record_marketplace_checkout_ledger and
-- are deliberately skipped to prevent duplicate revenue and developer share.
CREATE OR REPLACE FUNCTION private_finance.record_paid_restaurant_invoice(
  p_invoice_id uuid,
  p_allow_stripe_generated boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_reservation_net integer := 0;
  v_reservation_vat integer := 0;
  v_reservation_developer integer := 0;
  v_subscription_net integer := 0;
  v_subscription_vat integer := 0;
  v_campaign_net integer := 0;
  v_campaign_vat integer := 0;
  v_module_net integer := 0;
  v_module_vat integer := 0;
  v_credit_pack_net integer := 0;
  v_credit_pack_vat integer := 0;
  v_total_net integer := 0;
  v_total_vat integer := 0;
  v_total_gross integer := 0;
  v_all_lines_net integer := 0;
  v_all_lines_vat integer := 0;
  v_all_lines_gross integer := 0;
  v_header_net integer := 0;
  v_header_vat integer := 0;
  v_header_gross integer := 0;
  v_line_count integer := 0;
  v_developer_share_cents integer := 0;
  v_effective_at timestamptz;
  v_metadata jsonb;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtext('record_paid_restaurant_invoice'), hashtext(p_invoice_id::text)
  );

  SELECT invoice.* INTO v_invoice
  FROM public.restaurant_invoices invoice
  WHERE invoice.id = p_invoice_id
  FOR UPDATE;
  IF NOT FOUND OR v_invoice.status <> 'paid' THEN
    RETURN;
  END IF;
  IF upper(COALESCE(v_invoice.currency, 'CHF')) <> 'CHF' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_restaurant_invoice_currency';
  END IF;
  IF NOT p_allow_stripe_generated AND (
    v_invoice.stripe_invoice_id IS NOT NULL
    OR COALESCE(v_invoice.invoice_number, '') LIKE 'TOK-PAID-%'
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.financial_ledger ledger
    WHERE ledger.source_type = 'restaurant_invoice'
      AND ledger.source_id = v_invoice.id::text
      AND ledger.account_code = 'payment_asset'
      AND ledger.direction = 'debit'
  ) THEN
    RETURN;
  END IF;

  IF v_invoice.amount_ht IS NULL OR v_invoice.amount_tva IS NULL OR v_invoice.amount_ttc IS NULL
    OR upper(v_invoice.amount_ht::text) IN ('NAN', 'INFINITY', '-INFINITY')
    OR upper(v_invoice.amount_tva::text) IN ('NAN', 'INFINITY', '-INFINITY')
    OR upper(v_invoice.amount_ttc::text) IN ('NAN', 'INFINITY', '-INFINITY')
    OR v_invoice.amount_ht < 0 OR v_invoice.amount_tva < 0 OR v_invoice.amount_ttc <= 0
    OR v_invoice.amount_ht * 100 <> round(v_invoice.amount_ht * 100)
    OR v_invoice.amount_tva * 100 <> round(v_invoice.amount_tva * 100)
    OR v_invoice.amount_ttc * 100 <> round(v_invoice.amount_ttc * 100)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_paid_restaurant_invoice_header';
  END IF;
  v_header_net := round(v_invoice.amount_ht * 100)::integer;
  v_header_vat := round(v_invoice.amount_tva * 100)::integer;
  v_header_gross := round(v_invoice.amount_ttc * 100)::integer;
  IF v_header_net + v_header_vat <> v_header_gross THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'unbalanced_paid_restaurant_invoice_header';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.restaurant_invoice_line_items line
    WHERE line.invoice_id = v_invoice.id
      AND (
        line.amount_ht IS NULL OR line.amount_tva IS NULL OR line.amount_ttc IS NULL
        OR upper(line.amount_ht::text) IN ('NAN', 'INFINITY', '-INFINITY')
        OR upper(line.amount_tva::text) IN ('NAN', 'INFINITY', '-INFINITY')
        OR upper(line.amount_ttc::text) IN ('NAN', 'INFINITY', '-INFINITY')
        OR line.amount_ht < 0 OR line.amount_tva < 0 OR line.amount_ttc < 0
        OR line.amount_ht * 100 <> round(line.amount_ht * 100)
        OR line.amount_tva * 100 <> round(line.amount_tva * 100)
        OR line.amount_ttc * 100 <> round(line.amount_ttc * 100)
        OR round(line.amount_ht * 100)::integer + round(line.amount_tva * 100)::integer
          <> round(line.amount_ttc * 100)::integer
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_paid_restaurant_invoice_line';
  END IF;

  SELECT count(*)::integer,
         COALESCE(sum(round(line.amount_ht * 100)), 0)::integer,
         COALESCE(sum(round(line.amount_tva * 100)), 0)::integer,
         COALESCE(sum(round(line.amount_ttc * 100)), 0)::integer
  INTO v_line_count, v_all_lines_net, v_all_lines_vat, v_all_lines_gross
  FROM public.restaurant_invoice_line_items line
  WHERE line.invoice_id = v_invoice.id;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'paid_restaurant_invoice_lines_required';
  END IF;
  IF v_all_lines_gross <> v_header_gross
    OR v_all_lines_net <> v_header_net
    OR v_all_lines_vat <> v_header_vat
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'paid_restaurant_invoice_lines_header_mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.restaurant_invoice_line_items line
    WHERE line.invoice_id = v_invoice.id
      AND line.item_kind NOT IN (
        'reservation_fee', 'restaurant_subscription', 'campaign_payment',
        'restaurant_module', 'fair_growth_module', 'credit_pack'
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'unsupported_paid_restaurant_invoice_line_kind';
  END IF;

  -- Reservation fees are contractually split 90/10 on the tax-inclusive
  -- amount. Metadata may evidence the sealed value, but can never override it.
  IF EXISTS (
    SELECT 1
    FROM public.restaurant_invoice_line_items line
    WHERE line.invoice_id = v_invoice.id
      AND line.item_kind = 'reservation_fee'
      AND line.metadata ? 'developer_share_cents'
      AND CASE
        WHEN COALESCE(line.metadata ->> 'developer_share_cents', '') ~ '^[0-9]+$'
          THEN (line.metadata ->> 'developer_share_cents')::integer
            IS DISTINCT FROM round(line.amount_ttc * 100 * 1000 / 10000)::integer
        ELSE true
      END
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'reservation_developer_share_snapshot_mismatch';
  END IF;

  SELECT
    COALESCE(sum(round(line.amount_ht * 100)) FILTER (
      WHERE line.item_kind = 'reservation_fee'
    ), 0)::integer,
    COALESCE(sum(round(line.amount_tva * 100)) FILTER (
      WHERE line.item_kind = 'reservation_fee'
    ), 0)::integer,
    COALESCE(sum(CASE
      WHEN line.item_kind = 'reservation_fee' THEN
        round(line.amount_ttc * 100 * 1000 / 10000)::integer
      ELSE 0
    END), 0)::integer,
    COALESCE(sum(round(line.amount_ht * 100)) FILTER (
      WHERE line.item_kind = 'restaurant_subscription'
    ), 0)::integer,
    COALESCE(sum(round(line.amount_tva * 100)) FILTER (
      WHERE line.item_kind = 'restaurant_subscription'
    ), 0)::integer,
    COALESCE(sum(round(line.amount_ht * 100)) FILTER (
      WHERE line.item_kind = 'campaign_payment'
    ), 0)::integer,
    COALESCE(sum(round(line.amount_tva * 100)) FILTER (
      WHERE line.item_kind = 'campaign_payment'
    ), 0)::integer,
    COALESCE(sum(round(line.amount_ht * 100)) FILTER (
      WHERE line.item_kind IN ('restaurant_module', 'fair_growth_module')
    ), 0)::integer,
    COALESCE(sum(round(line.amount_tva * 100)) FILTER (
      WHERE line.item_kind IN ('restaurant_module', 'fair_growth_module')
    ), 0)::integer,
    COALESCE(sum(round(line.amount_ht * 100)) FILTER (
      WHERE line.item_kind = 'credit_pack'
    ), 0)::integer,
    COALESCE(sum(round(line.amount_tva * 100)) FILTER (
      WHERE line.item_kind = 'credit_pack'
    ), 0)::integer
  INTO
    v_reservation_net, v_reservation_vat, v_reservation_developer,
    v_subscription_net, v_subscription_vat,
    v_campaign_net, v_campaign_vat,
    v_module_net, v_module_vat,
    v_credit_pack_net, v_credit_pack_vat
  FROM public.restaurant_invoice_line_items line
  WHERE line.invoice_id = v_invoice.id;

  v_total_net := v_reservation_net + v_subscription_net + v_campaign_net
    + v_module_net + v_credit_pack_net;
  v_total_vat := v_reservation_vat + v_subscription_vat + v_campaign_vat
    + v_module_vat + v_credit_pack_vat;
  v_total_gross := v_total_net + v_total_vat;
  IF v_total_gross <> v_header_gross
    OR v_total_net <> v_header_net
    OR v_total_vat <> v_header_vat
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'recognized_paid_invoice_total_mismatch';
  END IF;
  v_developer_share_cents := v_reservation_developer + round(
    (v_subscription_net + v_campaign_net + v_module_net)::numeric * 1000 / 10000
  )::integer;
  IF v_developer_share_cents < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_paid_invoice_developer_share';
  END IF;
  v_effective_at := COALESCE(v_invoice.paid_at, v_invoice.updated_at, v_invoice.created_at, now());
  v_metadata := jsonb_build_object(
    'restaurant_invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_type', v_invoice.invoice_type,
    'recognized_excluding_vat', true,
    'vat_cents', v_total_vat,
    'developer_share_cents', v_developer_share_cents,
    'developer_share_rule', 'reservation_ttc_plus_10_percent_tok_net_services_excluding_credit_pack'
  );

  INSERT INTO public.financial_ledger (
    source_type, source_id, restaurant_id, account_code, direction,
    amount_cents, currency, effective_at, metadata
  ) VALUES (
    'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
    'payment_asset', 'debit', v_total_gross, 'CHF', v_effective_at, v_metadata
  );

  IF v_reservation_net > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_reservation_revenue', 'credit', v_reservation_net, 'CHF', v_effective_at, v_metadata
    );
  END IF;
  IF v_subscription_net > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_subscription_revenue', 'credit', v_subscription_net, 'CHF', v_effective_at, v_metadata
    );
  END IF;
  IF v_campaign_net > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_campaign_revenue', 'credit', v_campaign_net, 'CHF', v_effective_at, v_metadata
    );
  END IF;
  IF v_module_net > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_module_revenue', 'credit', v_module_net, 'CHF', v_effective_at, v_metadata
    );
  END IF;
  IF v_credit_pack_net > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tok_credit_pack_revenue', 'credit', v_credit_pack_net, 'CHF', v_effective_at, v_metadata
    );
  END IF;
  IF v_total_vat > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES (
      'restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
      'tax_payable', 'credit', v_total_vat, 'CHF', v_effective_at, v_metadata
    );
  END IF;
  IF v_developer_share_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, restaurant_id, account_code, direction,
      amount_cents, currency, effective_at, metadata
    ) VALUES
      ('restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
       'developer_revenue_share_expense', 'debit', v_developer_share_cents, 'CHF', v_effective_at, v_metadata),
      ('restaurant_invoice', v_invoice.id::text, v_invoice.restaurant_id,
       'developer_payable', 'credit', v_developer_share_cents, 'CHF', v_effective_at, v_metadata);
  END IF;

  INSERT INTO public.platform_revenue_entries (
    revenue_source, restaurant_id, amount_chf, currency, occurred_at, metadata
  )
  SELECT 'other', v_invoice.restaurant_id, v_total_net::numeric / 100,
         'CHF', v_effective_at, v_metadata
  WHERE NOT EXISTS (
    SELECT 1 FROM public.platform_revenue_entries revenue
    WHERE revenue.metadata ->> 'restaurant_invoice_id' = v_invoice.id::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.guard_recognized_restaurant_invoice_header()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.financial_ledger ledger
    WHERE ledger.source_type = 'restaurant_invoice'
      AND ledger.source_id = OLD.id::text
      AND ledger.account_code = 'payment_asset'
      AND ledger.direction = 'debit'
  ) THEN
    IF TG_OP = 'DELETE'
      OR (to_jsonb(NEW) - 'metadata' - 'updated_at')
        IS DISTINCT FROM (to_jsonb(OLD) - 'metadata' - 'updated_at')
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'recognized_restaurant_invoice_header_is_immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.record_paid_restaurant_invoice_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'paid'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
  THEN
    PERFORM private_finance.record_paid_restaurant_invoice(NEW.id, false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_recognized_restaurant_invoice_header
  ON public.restaurant_invoices;
CREATE TRIGGER guard_recognized_restaurant_invoice_header
  BEFORE UPDATE OR DELETE ON public.restaurant_invoices
  FOR EACH ROW EXECUTE FUNCTION private_finance.guard_recognized_restaurant_invoice_header();

DROP TRIGGER IF EXISTS record_paid_restaurant_invoice_finance ON public.restaurant_invoices;
CREATE CONSTRAINT TRIGGER record_paid_restaurant_invoice_finance
  AFTER INSERT OR UPDATE OF status ON public.restaurant_invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private_finance.record_paid_restaurant_invoice_trigger();

-- Paid invoices can be written before their line items by the Stripe webhook.
-- Serialize line mutations on the invoice, reject changes after recognition,
-- then retry recognition at transaction end when every line is visible.
CREATE OR REPLACE FUNCTION private_finance.guard_recognized_restaurant_invoice_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice_ids uuid[];
BEGIN
  v_invoice_ids := CASE TG_OP
    WHEN 'INSERT' THEN ARRAY[NEW.invoice_id]
    WHEN 'DELETE' THEN ARRAY[OLD.invoice_id]
    ELSE ARRAY[OLD.invoice_id, NEW.invoice_id]
  END;

  PERFORM invoice.id
  FROM public.restaurant_invoices invoice
  WHERE invoice.id = ANY(v_invoice_ids)
  ORDER BY invoice.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.financial_ledger ledger
    WHERE ledger.source_type = 'restaurant_invoice'
      AND ledger.source_id = ANY(
        SELECT invoice_id::text FROM unnest(v_invoice_ids) AS invoice_id
      )
      AND ledger.account_code = 'payment_asset'
      AND ledger.direction = 'debit'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'recognized_restaurant_invoice_lines_are_immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.record_paid_restaurant_invoice_line_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM private_finance.record_paid_restaurant_invoice(OLD.invoice_id, false);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
    PERFORM private_finance.record_paid_restaurant_invoice(OLD.invoice_id, false);
  END IF;
  PERFORM private_finance.record_paid_restaurant_invoice(NEW.invoice_id, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_recognized_restaurant_invoice_lines
  ON public.restaurant_invoice_line_items;
CREATE TRIGGER guard_recognized_restaurant_invoice_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.restaurant_invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION private_finance.guard_recognized_restaurant_invoice_lines();

DROP TRIGGER IF EXISTS record_paid_restaurant_invoice_finance_from_lines
  ON public.restaurant_invoice_line_items;
CREATE CONSTRAINT TRIGGER record_paid_restaurant_invoice_finance_from_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.restaurant_invoice_line_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private_finance.record_paid_restaurant_invoice_line_trigger();

REVOKE ALL ON FUNCTION private_finance.record_paid_restaurant_invoice(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.record_paid_restaurant_invoice_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.guard_recognized_restaurant_invoice_header()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.guard_recognized_restaurant_invoice_lines()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.record_paid_restaurant_invoice_line_trigger()
  FROM PUBLIC, anon, authenticated, service_role;

DO $fair_growth_paid_invoice_split_assertions$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'private_finance.record_paid_restaurant_invoice(uuid,boolean)'::regprocedure
  ) INTO v_definition;
  IF position('reservation_developer_share_snapshot_mismatch' IN v_definition) = 0
    OR position('reservation_ttc_plus_10_percent_tok_net_services_excluding_credit_pack' IN v_definition) = 0
    OR position('tok_credit_pack_revenue' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'Fair Growth paid invoice developer split safeguards are incomplete';
  END IF;
END;
$fair_growth_paid_invoice_split_assertions$;

-- A bounded compatibility window protects Checkout Sessions sealed by the
-- previously deployed Edge code while the Fair Growth Edge rolls out. Only
-- the server timestamp of an already sealed payment attempt can qualify.
CREATE TABLE IF NOT EXISTS private_finance.fair_growth_rollout_cutovers (
  cutover_key text PRIMARY KEY,
  legacy_attempt_created_before timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (legacy_attempt_created_before >= created_at)
);

INSERT INTO private_finance.fair_growth_rollout_cutovers (
  cutover_key, legacy_attempt_created_before
) VALUES (
  'marketplace_checkout_v1', statement_timestamp() + interval '24 hours'
)
ON CONFLICT (cutover_key) DO NOTHING;

REVOKE ALL ON private_finance.fair_growth_rollout_cutovers
  FROM PUBLIC, anon, authenticated, service_role;

-- Final fail-closed checkout ledger. Unknown kinds and incomplete marketplace
-- bases are rejected; retries must reproduce the exact immutable journal.
CREATE OR REPLACE FUNCTION public.record_marketplace_checkout_ledger(
  p_stripe_event_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_checkout_kind text,
  p_restaurant_id uuid,
  p_gross_cents integer,
  p_currency text DEFAULT 'CHF',
  p_livemode boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source_type text DEFAULT 'stripe_checkout'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text := lower(trim(COALESCE(p_checkout_kind, '')));
  v_currency text := upper(trim(COALESCE(p_currency, 'CHF')));
  v_source_type text := lower(trim(COALESCE(p_source_type, 'stripe_checkout')));
  v_is_marketplace boolean;
  v_attempt_id uuid;
  v_attempt public.payment_attempts%ROWTYPE;
  v_sealed_metadata jsonb;
  v_sealed_finance_snapshot jsonb;
  v_supplied_finance_snapshot jsonb;
  v_pricing_snapshot_hash text;
  v_legacy_attempt_cutover timestamptz;
  v_legacy_pre_fair_growth boolean := false;
  v_platform_fee_bps integer;
  v_developer_share_bps integer := 1000;
  v_developer_order_bps integer := 100;
  v_commissionable_cents integer := 0;
  v_tip_cents integer := 0;
  v_delivery_cents integer := 0;
  v_other_noncommissionable_cents integer := 0;
  v_platform_commission_gross_cents integer := 0;
  v_platform_vat_cents integer := 0;
  v_platform_revenue_cents integer := 0;
  v_restaurant_share_cents integer := 0;
  v_delivery_payable_cents integer := 0;
  v_developer_share_cents integer := 0;
  v_revenue_account text;
  v_revenue_source text;
  v_metadata jsonb;
  v_input_hash text;
  v_economic_hash text;
  v_event_livemode boolean;
  v_existing public.financial_ledger%ROWTYPE;
BEGIN
  IF NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stripe_event_id_required';
  END IF;
  IF NULLIF(trim(COALESCE(p_checkout_session_id, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'checkout_session_id_required';
  END IF;
  IF NULLIF(trim(COALESCE(p_payment_intent_id, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_intent_id_required';
  END IF;
  IF p_gross_cents IS NULL OR p_gross_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'gross_cents_must_be_positive';
  END IF;
  IF v_currency <> 'CHF' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_currency';
  END IF;
  IF v_source_type NOT IN ('stripe_checkout', 'stripe_invoice') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_finance_source_type';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'finance_metadata_object_required';
  END IF;
  IF v_kind NOT IN (
    'order', 'zero-attente', 'chefs-table', 'match-group', 'direct-order',
    'restaurant-onboarding', 'restaurant-subscription-upgrade',
    'restaurant-module', 'campaign', 'tok-one', 'restaurant-credit-pack'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_checkout_kind';
  END IF;
  SELECT event.livemode INTO v_event_livemode
  FROM public.stripe_webhook_events event
  WHERE event.event_id = p_stripe_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'stripe_event_not_claimed';
  END IF;
  IF p_livemode IS DISTINCT FROM v_event_livemode THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_event_livemode_mismatch';
  END IF;

  v_input_hash := md5(jsonb_build_object(
    'checkout_session_id', p_checkout_session_id,
    'payment_intent_id', p_payment_intent_id,
    'checkout_kind', v_kind,
    'restaurant_id', p_restaurant_id,
    'gross_cents', p_gross_cents,
    'currency', v_currency,
    'livemode', p_livemode,
    'source_type', v_source_type,
    'metadata', COALESCE(p_metadata, '{}'::jsonb)
  )::text);
  v_economic_hash := md5(jsonb_build_object(
    'payment_intent_id', p_payment_intent_id,
    'checkout_kind', v_kind,
    'restaurant_id', p_restaurant_id,
    'gross_cents', p_gross_cents,
    'currency', v_currency,
    'livemode', v_event_livemode,
    'payment_attempt_id', p_metadata ->> 'payment_attempt_id',
    'finance_snapshot_version', p_metadata ->> 'finance_snapshot_version',
    'pricing_version', p_metadata ->> 'pricing_version',
    'pricing_rate_source', p_metadata ->> 'pricing_rate_source',
    'pricing_plan_id', p_metadata ->> 'pricing_plan_id',
    'pricing_plan_slug', p_metadata ->> 'pricing_plan_slug',
    'pricing_module_id', p_metadata ->> 'pricing_module_id',
    'pricing_module_slug', p_metadata ->> 'pricing_module_slug',
    'platform_fee_bps', p_metadata ->> 'platform_fee_bps',
    'developer_order_bps', p_metadata ->> 'developer_order_bps',
    'platform_fee_amount_cents', p_metadata ->> 'platform_fee_amount_cents',
    'restaurant_share_amount_cents', p_metadata ->> 'restaurant_share_amount_cents',
    'developer_share_bps', p_metadata ->> 'developer_share_bps',
    'developer_share_amount_cents', p_metadata ->> 'developer_share_amount_cents',
    'tok_net_amount_cents', p_metadata ->> 'tok_net_amount_cents',
    'commissionable_cents', p_metadata ->> 'commissionable_cents',
    'tip_cents', p_metadata ->> 'tip_cents',
    'delivery_pass_through_cents', p_metadata ->> 'delivery_pass_through_cents',
    'other_noncommissionable_cents', p_metadata ->> 'other_noncommissionable_cents'
  )::text);

  PERFORM pg_advisory_xact_lock(
    hashtext('marketplace_payment_intent_ledger'),
    hashtext(CASE WHEN v_event_livemode THEN 'live:' ELSE 'test:' END || p_payment_intent_id)
  );
  SELECT ledger.* INTO v_existing
  FROM public.financial_ledger ledger
  WHERE ledger.source_type IN ('stripe_checkout', 'stripe_invoice')
    AND ledger.account_code = 'payment_asset'
    AND ledger.direction = 'debit'
    AND ledger.reversal_of IS NULL
    AND ledger.stripe_mode = CASE WHEN v_event_livemode THEN 'live' ELSE 'test' END
    AND ledger.metadata ->> 'payment_intent_id' = p_payment_intent_id
  ORDER BY ledger.created_at
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.amount_cents <> p_gross_cents
      OR v_existing.currency <> v_currency
      OR v_existing.restaurant_id IS DISTINCT FROM p_restaurant_id
      OR COALESCE(v_existing.metadata ->> 'payment_intent_id', '') <> p_payment_intent_id
      OR COALESCE(v_existing.metadata ->> 'checkout_kind', '') <> v_kind
      OR COALESCE(v_existing.metadata ->> 'finance_economic_hash', '') <> v_economic_hash
      OR (
        v_existing.source_type = v_source_type
        AND v_existing.source_id = p_checkout_session_id
        AND COALESCE(v_existing.metadata ->> 'finance_input_hash', '') <> v_input_hash
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'payment_intent_ledger_idempotency_conflict';
    END IF;
    RETURN;
  END IF;

  v_is_marketplace := v_kind IN (
    'order', 'zero-attente', 'chefs-table', 'match-group', 'direct-order'
  );
  IF v_is_marketplace THEN
    IF p_restaurant_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurant_required_for_marketplace_payment';
    END IF;
    IF COALESCE(p_metadata ->> 'payment_attempt_id', '') !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_attempt_id_required_for_marketplace_finance';
    END IF;

    v_attempt_id := (p_metadata ->> 'payment_attempt_id')::uuid;
    SELECT attempt.* INTO v_attempt
    FROM public.payment_attempts attempt
    WHERE attempt.id = v_attempt_id
    FOR SHARE;
    IF NOT FOUND
      OR v_attempt.request_generation IS DISTINCT FROM v_attempt.generation
      OR v_attempt.request_snapshot IS NULL
      OR jsonb_typeof(v_attempt.request_snapshot) IS DISTINCT FROM 'object'
      OR COALESCE(v_attempt.request_snapshot ->> 'version', '') <> '1'
      OR NULLIF(trim(COALESCE(v_attempt.request_fingerprint, '')), '') IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'sealed_payment_attempt_snapshot_required';
    END IF;

    v_sealed_metadata := v_attempt.request_snapshot #> '{session_params,metadata}';
    IF jsonb_typeof(v_sealed_metadata) IS DISTINCT FROM 'object'
      OR v_attempt.mode <> (CASE WHEN v_event_livemode THEN 'live' ELSE 'test' END)
      OR lower(trim(v_attempt.kind)) <> v_kind
      OR v_attempt.restaurant_id IS DISTINCT FROM p_restaurant_id
      OR v_attempt.amount_cents IS DISTINCT FROM p_gross_cents
      OR upper(trim(v_attempt.currency)) <> v_currency
      OR v_attempt.stripe_checkout_session_id IS DISTINCT FROM p_checkout_session_id
      OR (
        v_attempt.stripe_payment_intent_id IS NOT NULL
        AND v_attempt.stripe_payment_intent_id IS DISTINCT FROM p_payment_intent_id
      )
      OR COALESCE(v_sealed_metadata ->> 'payment_attempt_version', '') <> '2'
      OR COALESCE(v_sealed_metadata ->> 'payment_attempt_id', '') <> v_attempt.id::text
      OR COALESCE(v_sealed_metadata ->> 'operation_key', '') <> v_attempt.operation_key
      OR lower(COALESCE(v_sealed_metadata ->> 'checkout_kind', '')) <> v_kind
      OR lower(COALESCE(v_sealed_metadata ->> 'stripe_mode', '')) <> v_attempt.mode
      OR COALESCE(v_sealed_metadata ->> 'restaurant_id', '') <> p_restaurant_id::text
      OR COALESCE(v_sealed_metadata ->> 'authoritative_total_cents', '') <> p_gross_cents::text
      OR upper(COALESCE(v_sealed_metadata ->> 'authoritative_currency', '')) <> v_currency
      OR COALESCE(p_metadata ->> 'operation_key', '') <> v_attempt.operation_key
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'sealed_payment_attempt_identity_mismatch';
    END IF;

    SELECT cutover.legacy_attempt_created_before
    INTO v_legacy_attempt_cutover
    FROM private_finance.fair_growth_rollout_cutovers cutover
    WHERE cutover.cutover_key = 'marketplace_checkout_v1';

    IF COALESCE(v_sealed_metadata ->> 'finance_snapshot_version', '') = 'fair_growth_v1' THEN
      IF COALESCE(v_sealed_metadata ->> 'pricing_version', '') <> 'fair_growth_2026_07'
        OR COALESCE(v_sealed_metadata ->> 'platform_fee_bps', '') !~ '^[0-9]{1,4}$'
        OR COALESCE(v_sealed_metadata ->> 'developer_order_bps', '') !~ '^[0-9]{1,4}$'
        OR COALESCE(v_sealed_metadata ->> 'developer_share_bps', '') !~ '^[0-9]{1,4}$'
        OR COALESCE(v_sealed_metadata ->> 'commissionable_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'tip_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'delivery_pass_through_cents', '') !~ '^[0-9]+$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'complete_fair_growth_finance_snapshot_required';
      END IF;

      v_sealed_finance_snapshot := jsonb_build_object(
        'finance_snapshot_version', v_sealed_metadata -> 'finance_snapshot_version',
        'pricing_version', v_sealed_metadata -> 'pricing_version',
        'pricing_rate_source', v_sealed_metadata -> 'pricing_rate_source',
        'pricing_plan_id', v_sealed_metadata -> 'pricing_plan_id',
        'pricing_plan_slug', v_sealed_metadata -> 'pricing_plan_slug',
        'pricing_module_id', v_sealed_metadata -> 'pricing_module_id',
        'pricing_module_slug', v_sealed_metadata -> 'pricing_module_slug',
        'platform_fee_bps', v_sealed_metadata -> 'platform_fee_bps',
        'developer_order_bps', v_sealed_metadata -> 'developer_order_bps',
        'developer_share_bps', v_sealed_metadata -> 'developer_share_bps',
        'commissionable_cents', v_sealed_metadata -> 'commissionable_cents',
        'tip_cents', v_sealed_metadata -> 'tip_cents',
        'delivery_pass_through_cents', v_sealed_metadata -> 'delivery_pass_through_cents'
      );
      v_supplied_finance_snapshot := jsonb_build_object(
        'finance_snapshot_version', p_metadata -> 'finance_snapshot_version',
        'pricing_version', p_metadata -> 'pricing_version',
        'pricing_rate_source', p_metadata -> 'pricing_rate_source',
        'pricing_plan_id', p_metadata -> 'pricing_plan_id',
        'pricing_plan_slug', p_metadata -> 'pricing_plan_slug',
        'pricing_module_id', p_metadata -> 'pricing_module_id',
        'pricing_module_slug', p_metadata -> 'pricing_module_slug',
        'platform_fee_bps', p_metadata -> 'platform_fee_bps',
        'developer_order_bps', p_metadata -> 'developer_order_bps',
        'developer_share_bps', p_metadata -> 'developer_share_bps',
        'commissionable_cents', p_metadata -> 'commissionable_cents',
        'tip_cents', p_metadata -> 'tip_cents',
        'delivery_pass_through_cents', p_metadata -> 'delivery_pass_through_cents'
      );
      IF v_supplied_finance_snapshot IS DISTINCT FROM v_sealed_finance_snapshot THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_finance_snapshot_differs_from_sealed_attempt';
      END IF;

      v_platform_fee_bps := (v_sealed_metadata ->> 'platform_fee_bps')::integer;
      v_developer_order_bps := (v_sealed_metadata ->> 'developer_order_bps')::integer;
      v_developer_share_bps := (v_sealed_metadata ->> 'developer_share_bps')::integer;
      v_commissionable_cents := (v_sealed_metadata ->> 'commissionable_cents')::integer;
      v_tip_cents := (v_sealed_metadata ->> 'tip_cents')::integer;
      v_delivery_cents := (v_sealed_metadata ->> 'delivery_pass_through_cents')::integer;
      IF v_developer_share_bps <> v_developer_order_bps THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_rate_snapshot_mismatch';
      END IF;

      IF v_kind = 'direct-order' THEN
        IF COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '') <> 'paid_module_snapshot'
          OR COALESCE(v_sealed_metadata ->> 'pricing_module_id', '') !~
               '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          OR COALESCE(v_sealed_metadata ->> 'pricing_module_slug', '') <> 'direct-order-saver'
          OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_id', '')), '') IS NOT NULL
          OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '')), '') IS NOT NULL
          OR v_platform_fee_bps <> 150
          OR v_developer_order_bps <> 100
        THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_sealed_direct_order_module_snapshot';
        END IF;
      ELSE
        IF COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '') NOT IN (
            'subscription_snapshot', 'subscription_plan', 'starter_fallback', 'runtime_default'
          )
          OR COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '') NOT IN (
            'starter', 'business', 'pro', 'premium', 'elite', ''
          )
          OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_module_id', '')), '') IS NOT NULL
          OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_module_slug', '')), '') IS NOT NULL
          OR v_developer_order_bps <> 100
          OR v_platform_fee_bps <> (CASE COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '')
            WHEN 'starter' THEN 990
            WHEN 'business' THEN 890
            WHEN 'pro' THEN 890
            WHEN 'premium' THEN 790
            WHEN 'elite' THEN 690
            WHEN '' THEN 990
            ELSE -1
          END)
          OR (
            COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '') = 'starter_fallback'
            AND (
              NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_id', '')), '') IS NOT NULL
              OR COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '') <> 'starter'
            )
          )
          OR (
            COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '') = 'runtime_default'
            AND (
              NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_id', '')), '') IS NOT NULL
              OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '')), '') IS NOT NULL
              OR v_platform_fee_bps <> 990
            )
          )
          OR (
            COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '') IN (
              'subscription_snapshot', 'subscription_plan'
            )
            AND (
              COALESCE(v_sealed_metadata ->> 'pricing_plan_id', '') !~
                '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
              OR COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '') NOT IN (
                'starter', 'business', 'pro', 'premium', 'elite'
              )
            )
          )
        THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_sealed_fair_growth_plan_snapshot';
        END IF;
      END IF;

      IF v_commissionable_cents + v_tip_cents + v_delivery_cents > p_gross_cents THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_marketplace_finance_basis';
      END IF;
      v_other_noncommissionable_cents := p_gross_cents
        - v_commissionable_cents - v_tip_cents - v_delivery_cents;
      IF COALESCE(p_metadata ->> 'other_noncommissionable_cents', '') <> '' THEN
        IF (p_metadata ->> 'other_noncommissionable_cents') !~ '^[0-9]+$'
          OR (p_metadata ->> 'other_noncommissionable_cents')::integer
             <> v_other_noncommissionable_cents
        THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'other_noncommissionable_snapshot_mismatch';
        END IF;
      END IF;

      v_platform_commission_gross_cents := round(
        v_commissionable_cents::numeric * v_platform_fee_bps / 10000
      )::integer;
      v_platform_vat_cents := public.swiss_vat_from_tax_inclusive_cents(
        v_platform_commission_gross_cents, 810
      );
      v_platform_revenue_cents := v_platform_commission_gross_cents - v_platform_vat_cents;
      v_developer_share_cents := round(
        v_commissionable_cents::numeric * v_developer_order_bps / 10000
      )::integer;
      IF v_developer_share_cents > v_platform_revenue_cents THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_share_exceeds_tok_net_commission';
      END IF;
      v_restaurant_share_cents := v_commissionable_cents
        - v_platform_commission_gross_cents + v_tip_cents + v_other_noncommissionable_cents;
      v_delivery_payable_cents := v_delivery_cents;
    ELSIF v_kind IN ('order', 'zero-attente', 'chefs-table', 'match-group')
      AND v_legacy_attempt_cutover IS NOT NULL
      AND v_attempt.created_at < v_legacy_attempt_cutover
    THEN
      v_legacy_pre_fair_growth := true;
      IF NULLIF(trim(COALESCE(v_sealed_metadata ->> 'finance_snapshot_version', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_version', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_rate_source', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_id', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_module_id', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'pricing_module_slug', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'developer_order_bps', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'commissionable_cents', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'tip_cents', '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(v_sealed_metadata ->> 'delivery_pass_through_cents', '')), '') IS NOT NULL
        OR COALESCE(v_sealed_metadata ->> 'platform_fee_bps', '') <> '1000'
        OR COALESCE(v_sealed_metadata ->> 'platform_fee_amount_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'restaurant_share_amount_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'developer_share_bps', '') <> '1000'
        OR COALESCE(v_sealed_metadata ->> 'developer_share_amount_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'tok_net_amount_cents', '') !~ '^[0-9]+$'
        OR COALESCE(v_sealed_metadata ->> 'finance_routing_mode', '') NOT IN (
          'stripe_connect_destination', 'legacy_manual'
        )
      THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_legacy_sealed_marketplace_snapshot';
      END IF;

      v_sealed_finance_snapshot := jsonb_build_object(
        'finance_routing_mode', v_sealed_metadata -> 'finance_routing_mode',
        'platform_fee_bps', v_sealed_metadata -> 'platform_fee_bps',
        'platform_fee_amount_cents', v_sealed_metadata -> 'platform_fee_amount_cents',
        'restaurant_share_amount_cents', v_sealed_metadata -> 'restaurant_share_amount_cents',
        'developer_share_bps', v_sealed_metadata -> 'developer_share_bps',
        'developer_share_amount_cents', v_sealed_metadata -> 'developer_share_amount_cents',
        'tok_net_amount_cents', v_sealed_metadata -> 'tok_net_amount_cents'
      );
      v_supplied_finance_snapshot := jsonb_build_object(
        'finance_routing_mode', p_metadata -> 'finance_routing_mode',
        'platform_fee_bps', p_metadata -> 'platform_fee_bps',
        'platform_fee_amount_cents', p_metadata -> 'platform_fee_amount_cents',
        'restaurant_share_amount_cents', p_metadata -> 'restaurant_share_amount_cents',
        'developer_share_bps', p_metadata -> 'developer_share_bps',
        'developer_share_amount_cents', p_metadata -> 'developer_share_amount_cents',
        'tok_net_amount_cents', p_metadata -> 'tok_net_amount_cents'
      );
      IF v_supplied_finance_snapshot IS DISTINCT FROM v_sealed_finance_snapshot THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'legacy_stripe_snapshot_differs_from_sealed_attempt';
      END IF;

      v_platform_fee_bps := (v_sealed_metadata ->> 'platform_fee_bps')::integer;
      v_developer_order_bps := 0;
      v_developer_share_bps := 1000;
      v_platform_commission_gross_cents := (v_sealed_metadata ->> 'platform_fee_amount_cents')::integer;
      v_restaurant_share_cents := (v_sealed_metadata ->> 'restaurant_share_amount_cents')::integer;
      v_developer_share_cents := (v_sealed_metadata ->> 'developer_share_amount_cents')::integer;
      v_platform_vat_cents := public.swiss_vat_from_tax_inclusive_cents(
        v_platform_commission_gross_cents, 810
      );
      v_platform_revenue_cents := v_platform_commission_gross_cents - v_platform_vat_cents;
      v_commissionable_cents := p_gross_cents;
      v_tip_cents := 0;
      v_delivery_cents := 0;
      v_delivery_payable_cents := 0;
      v_other_noncommissionable_cents := 0;
      IF v_platform_vat_cents
           <> public.swiss_vat_from_tax_inclusive_cents(v_platform_commission_gross_cents, 810)
        OR v_platform_revenue_cents
           <> v_platform_commission_gross_cents - v_platform_vat_cents
      THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'legacy_marketplace_vat_snapshot_mismatch';
      END IF;
      IF v_platform_commission_gross_cents
           <> round(p_gross_cents::numeric * v_platform_fee_bps / 10000)::integer
        OR v_restaurant_share_cents <> p_gross_cents - v_platform_commission_gross_cents
        OR v_developer_share_cents
           <> round(v_platform_commission_gross_cents::numeric * 1000 / 10000)::integer
        OR v_developer_share_cents > v_platform_revenue_cents
        OR (v_sealed_metadata ->> 'tok_net_amount_cents')::integer
           <> v_platform_commission_gross_cents - v_developer_share_cents
      THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'legacy_marketplace_split_snapshot_mismatch';
      END IF;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'fair_growth_sealed_finance_snapshot_required';
    END IF;

    v_pricing_snapshot_hash := md5(jsonb_build_object(
      'payment_attempt_id', v_attempt.id,
      'generation', v_attempt.generation,
      'request_fingerprint', v_attempt.request_fingerprint,
      'finance_snapshot', v_sealed_finance_snapshot,
      'legacy_pre_fair_growth', v_legacy_pre_fair_growth
    )::text);
    v_revenue_account := 'tok_platform_commission_revenue';
    v_revenue_source := 'other';
  ELSE
    IF p_metadata ? 'developer_share_bps' THEN
      IF COALESCE(p_metadata ->> 'developer_share_bps', '') !~ '^[0-9]{1,4}$' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_tok_revenue_share_must_equal_1000_bps';
      END IF;
      IF (p_metadata ->> 'developer_share_bps')::integer <> 1000 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_tok_revenue_share_must_equal_1000_bps';
      END IF;
    END IF;
    v_platform_fee_bps := 10000;
    v_platform_commission_gross_cents := p_gross_cents;
    v_platform_vat_cents := public.swiss_vat_from_tax_inclusive_cents(p_gross_cents, 810);
    v_platform_revenue_cents := p_gross_cents - v_platform_vat_cents;
    v_developer_share_cents := round(
      v_platform_revenue_cents::numeric * v_developer_share_bps / 10000
    )::integer;
    v_commissionable_cents := p_gross_cents;
    v_revenue_account := CASE
      WHEN v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN 'tok_subscription_revenue'
      WHEN v_kind = 'restaurant-module' THEN 'tok_module_revenue'
      WHEN v_kind = 'campaign' THEN 'tok_campaign_revenue'
      WHEN v_kind = 'tok-one' THEN 'tok_one_revenue'
      WHEN v_kind = 'restaurant-credit-pack' THEN 'tok_credit_pack_revenue'
    END;
    v_revenue_source := CASE
      WHEN v_kind IN ('restaurant-onboarding', 'restaurant-subscription-upgrade') THEN 'subscription'
      WHEN v_kind = 'campaign' THEN 'sponsorship'
      WHEN v_kind = 'tok-one' THEN 'tok_one'
      WHEN v_kind = 'restaurant-credit-pack' THEN 'pack'
      ELSE 'other'
    END;
  END IF;

  IF v_restaurant_share_cents + v_delivery_payable_cents
      + v_platform_revenue_cents + v_platform_vat_cents <> p_gross_cents
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'unbalanced_checkout_journal';
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'checkout_kind', v_kind,
    'checkout_session_id', p_checkout_session_id,
    'payment_intent_id', p_payment_intent_id,
    'gross_cents', p_gross_cents,
    'commissionable_cents', v_commissionable_cents,
    'tip_cents', v_tip_cents,
    'delivery_pass_through_cents', v_delivery_cents,
    'other_noncommissionable_cents', v_other_noncommissionable_cents,
    'platform_commission_gross_cents', v_platform_commission_gross_cents,
    'platform_revenue_cents', v_platform_revenue_cents,
    'platform_vat_cents', v_platform_vat_cents,
    'restaurant_share_cents', v_restaurant_share_cents,
    'delivery_payable_cents', v_delivery_payable_cents,
    'platform_fee_bps', v_platform_fee_bps,
    'developer_order_bps', v_developer_order_bps,
    'developer_share_bps', v_developer_share_bps,
    'developer_share_cents', v_developer_share_cents,
    'platform_revenue_account', v_revenue_account,
    'pricing_rate_source_normalized', CASE
      WHEN v_legacy_pre_fair_growth THEN 'starter_legacy_pre_fair_growth'
      WHEN COALESCE(p_metadata ->> 'pricing_rate_source', '') = 'runtime_default'
        THEN 'starter_legacy_fallback'
      ELSE COALESCE(p_metadata ->> 'pricing_rate_source', '')
    END,
    'legacy_pre_fair_growth', v_legacy_pre_fair_growth,
    'legacy_attempt_cutover', CASE
      WHEN v_legacy_pre_fair_growth THEN v_legacy_attempt_cutover
      ELSE NULL
    END,
    'pricing_snapshot_hash', v_pricing_snapshot_hash,
    'finance_input_hash', v_input_hash,
    'finance_economic_hash', v_economic_hash,
    'vat_rate_bps', 810,
    'pricing_version', CASE
      WHEN v_legacy_pre_fair_growth THEN 'legacy_pre_fair_growth'
      ELSE COALESCE(p_metadata ->> 'pricing_version', 'fair_growth_2026_07')
    END,
    'livemode', p_livemode
  );

  INSERT INTO public.financial_ledger (
    source_type, source_id, stripe_event_id, restaurant_id,
    account_code, direction, amount_cents, currency, metadata
  ) VALUES (
    v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
    'payment_asset', 'debit', p_gross_cents, v_currency, v_metadata
  );
  IF v_restaurant_share_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      'restaurant_payable', 'credit', v_restaurant_share_cents, v_currency, v_metadata
    );
  END IF;
  IF v_delivery_payable_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      'delivery_pass_through_payable', 'credit', v_delivery_payable_cents, v_currency, v_metadata
    );
  END IF;
  IF v_platform_revenue_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      v_revenue_account, 'credit', v_platform_revenue_cents, v_currency, v_metadata
    );
  END IF;
  IF v_platform_vat_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES (
      v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
      'tax_payable', 'credit', v_platform_vat_cents, v_currency, v_metadata
    );
  END IF;
  IF v_developer_share_cents > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id,
      account_code, direction, amount_cents, currency, metadata
    ) VALUES
      (v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
       'developer_revenue_share_expense', 'debit', v_developer_share_cents, v_currency, v_metadata),
      (v_source_type, p_checkout_session_id, p_stripe_event_id, p_restaurant_id,
       'developer_payable', 'credit', v_developer_share_cents, v_currency, v_metadata);
  END IF;

  INSERT INTO public.platform_revenue_entries (
    revenue_source, restaurant_id, amount_chf, currency, occurred_at,
    stripe_payment_intent_id, stripe_checkout_session_id, stripe_invoice_id, metadata
  ) VALUES (
    v_revenue_source, p_restaurant_id, v_platform_revenue_cents::numeric / 100,
    v_currency, now(), p_payment_intent_id,
    CASE WHEN v_source_type = 'stripe_checkout' THEN p_checkout_session_id ELSE NULL END,
    CASE WHEN v_source_type = 'stripe_invoice' THEN p_checkout_session_id ELSE NULL END,
    v_metadata
  ) ON CONFLICT DO NOTHING;
END;
$$;

DO $fair_growth_checkout_snapshot_assertions$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.record_marketplace_checkout_ledger(text,text,text,text,uuid,integer,text,boolean,jsonb,text)'::regprocedure
  ) INTO v_definition;
  IF position('sealed_payment_attempt_snapshot_required' IN v_definition) = 0
    OR position('fair_growth_rollout_cutovers' IN v_definition) = 0
    OR position('legacy_pre_fair_growth' IN v_definition) = 0
    OR position('invalid_legacy_sealed_marketplace_snapshot' IN v_definition) = 0
    OR position('legacy_marketplace_split_snapshot_mismatch' IN v_definition) = 0
    OR position('legacy_marketplace_vat_snapshot_mismatch' IN v_definition) = 0
    OR position('invalid_sealed_direct_order_module_snapshot' IN v_definition) = 0
    OR position('restaurant_ai_subscriptions' IN v_definition) > 0
    OR position('restaurant_paid_modules' IN v_definition) > 0
  THEN
    RAISE EXCEPTION 'Fair Growth sealed checkout snapshot safeguards are incomplete';
  END IF;
END;
$fair_growth_checkout_snapshot_assertions$;

-- Refunds and disputes reverse the immutable checkout allocation snapshots.
-- Delivery, Swiss VAT, TOK revenue and developer share remain distinct; every
-- event is balanced and every cumulative component is bounded by the original.
CREATE OR REPLACE FUNCTION private_finance.record_marketplace_reversal(
  p_stripe_event_id text,
  p_payment_intent_id text,
  p_reversal_source_type text,
  p_reversal_source_id text,
  p_amount_cents integer,
  p_action text,
  p_currency text,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
  v_livemode boolean;
  v_mode text;
  v_currency text := upper(trim(COALESCE(p_currency, 'CHF')));
  v_action text := lower(trim(COALESCE(p_action, '')));
  v_source_type text := lower(trim(COALESCE(p_reversal_source_type, '')));
  v_asset_direction text;
  v_component_direction text;
  v_input_hash text;
  v_existing public.financial_ledger%ROWTYPE;

  v_original_asset_id uuid;
  v_original_source_type text;
  v_original_source_id text;
  v_restaurant_id uuid;
  v_original_metadata jsonb;
  v_gross_cents integer;
  v_restaurant_cents integer;
  v_delivery_cents integer;
  v_platform_cents integer;
  v_tax_cents integer;
  v_developer_cents integer;
  v_revenue_account text;

  v_restaurant_count integer;
  v_delivery_count integer;
  v_platform_count integer;
  v_tax_count integer;
  v_developer_expense_count integer;
  v_developer_payable_count integer;
  v_restaurant_sum integer;
  v_delivery_sum integer;
  v_platform_sum integer;
  v_tax_sum integer;
  v_developer_expense_sum integer;
  v_developer_payable_sum integer;
  v_restaurant_entry_id uuid;
  v_delivery_entry_id uuid;
  v_platform_entry_id uuid;
  v_tax_entry_id uuid;
  v_developer_expense_entry_id uuid;
  v_developer_payable_entry_id uuid;
  v_dispute_asset_count integer;
  v_dispute_asset_sum integer;

  v_prior_gross integer := 0;
  v_prior_restaurant integer := 0;
  v_prior_delivery integer := 0;
  v_prior_platform integer := 0;
  v_prior_tax integer := 0;
  v_prior_developer_payable integer := 0;
  v_prior_developer_expense integer := 0;
  v_base integer;
  v_available_restaurant integer;
  v_available_delivery integer;
  v_available_platform integer;
  v_available_tax integer;
  v_available_developer integer;
  v_delta_restaurant integer := 0;
  v_delta_delivery integer := 0;
  v_delta_platform integer := 0;
  v_delta_tax integer := 0;
  v_delta_developer integer := 0;
  v_residual integer := 0;
  v_allocate integer := 0;
  v_metadata jsonb;
  v_journal_balance bigint;
  v_journal_count integer;
BEGIN
  IF NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_payment_intent_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_reversal_source_id, '')), '') IS NULL
    OR p_amount_cents IS NULL OR p_amount_cents <= 0
    OR v_currency <> 'CHF'
    OR jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_marketplace_reversal_input';
  END IF;
  IF v_action NOT IN ('decrease', 'restore')
    OR (v_action = 'decrease' AND v_source_type NOT IN ('stripe_refund', 'stripe_dispute'))
    OR (v_action = 'restore' AND v_source_type <> 'stripe_dispute_reversal')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_marketplace_reversal_action';
  END IF;

  SELECT event.* INTO v_event
  FROM public.stripe_webhook_events event
  WHERE event.event_id = p_stripe_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'stripe_event_not_claimed';
  END IF;
  v_livemode := v_event.livemode;
  v_mode := CASE WHEN v_livemode THEN 'live' ELSE 'test' END;
  v_asset_direction := CASE WHEN v_action = 'decrease' THEN 'credit' ELSE 'debit' END;
  v_component_direction := CASE WHEN v_action = 'decrease' THEN 'debit' ELSE 'credit' END;
  v_input_hash := md5(jsonb_build_object(
    'payment_intent_id', p_payment_intent_id,
    'source_type', v_source_type,
    'source_id', p_reversal_source_id,
    'amount_cents', p_amount_cents,
    'action', v_action,
    'currency', v_currency,
    'stripe_mode', v_mode
  )::text);

  PERFORM pg_advisory_xact_lock(
    hashtext('marketplace_payment_intent_reversal'),
    hashtext(v_mode || ':' || p_payment_intent_id)
  );

  SELECT ledger.* INTO v_existing
  FROM public.financial_ledger ledger
  WHERE ledger.source_type = v_source_type
    AND ledger.source_id = p_reversal_source_id
    AND ledger.account_code = 'payment_asset'
    AND ledger.direction = v_asset_direction
    AND ledger.stripe_mode = v_mode
  ORDER BY ledger.created_at
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    SELECT
      COALESCE(sum(CASE WHEN ledger.direction = 'debit'
        THEN ledger.amount_cents ELSE -ledger.amount_cents END), 0),
      count(*)::integer
    INTO v_journal_balance, v_journal_count
    FROM public.financial_ledger ledger
    WHERE ledger.source_type = v_source_type
      AND ledger.source_id = p_reversal_source_id
      AND ledger.stripe_mode = v_mode;
    IF v_existing.amount_cents <> p_amount_cents
      OR v_existing.currency <> v_currency
      OR COALESCE(v_existing.metadata ->> 'payment_intent_id', '') <> p_payment_intent_id
      OR COALESCE(v_existing.metadata ->> 'finance_reversal_input_hash', '') <> v_input_hash
      OR v_journal_balance <> 0
      OR v_journal_count < 2
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'marketplace_reversal_idempotency_conflict';
    END IF;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.financial_ledger ledger
    WHERE ledger.source_type = v_source_type
      AND ledger.source_id = p_reversal_source_id
      AND ledger.stripe_mode = v_mode
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'partial_marketplace_reversal_journal_exists';
  END IF;

  SELECT ledger.entry_id, ledger.source_type, ledger.source_id,
         ledger.restaurant_id, ledger.amount_cents, ledger.metadata
  INTO v_original_asset_id, v_original_source_type, v_original_source_id,
       v_restaurant_id, v_gross_cents, v_original_metadata
  FROM public.financial_ledger ledger
  WHERE ledger.source_type IN ('stripe_checkout', 'stripe_invoice')
    AND ledger.account_code = 'payment_asset'
    AND ledger.direction = 'debit'
    AND ledger.reversal_of IS NULL
    AND ledger.stripe_mode = v_mode
    AND ledger.metadata ->> 'payment_intent_id' = p_payment_intent_id
  ORDER BY ledger.created_at
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'original_payment_ledger_missing';
  END IF;
  IF v_currency IS DISTINCT FROM upper(COALESCE(v_original_metadata ->> 'currency', v_currency))
    OR COALESCE(v_original_metadata ->> 'gross_cents', '') !~ '^[0-9]+$'
    OR COALESCE(v_original_metadata ->> 'restaurant_share_cents', '') !~ '^[0-9]+$'
    OR COALESCE(v_original_metadata ->> 'delivery_payable_cents', '') !~ '^[0-9]+$'
    OR COALESCE(v_original_metadata ->> 'platform_revenue_cents', '') !~ '^[0-9]+$'
    OR COALESCE(v_original_metadata ->> 'platform_vat_cents', '') !~ '^[0-9]+$'
    OR COALESCE(v_original_metadata ->> 'developer_share_cents', '') !~ '^[0-9]+$'
    OR COALESCE(v_original_metadata ->> 'platform_revenue_account', '') !~ '^tok_[a-z0-9_]+_revenue$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'complete_original_reversal_snapshot_required';
  END IF;

  v_restaurant_cents := (v_original_metadata ->> 'restaurant_share_cents')::integer;
  v_delivery_cents := (v_original_metadata ->> 'delivery_payable_cents')::integer;
  v_platform_cents := (v_original_metadata ->> 'platform_revenue_cents')::integer;
  v_tax_cents := (v_original_metadata ->> 'platform_vat_cents')::integer;
  v_developer_cents := (v_original_metadata ->> 'developer_share_cents')::integer;
  v_revenue_account := v_original_metadata ->> 'platform_revenue_account';
  IF (v_original_metadata ->> 'gross_cents')::integer <> v_gross_cents
    OR v_restaurant_cents + v_delivery_cents + v_platform_cents + v_tax_cents <> v_gross_cents
    OR v_developer_cents > v_platform_cents
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'unbalanced_original_reversal_snapshot';
  END IF;

  SELECT
    count(*) FILTER (WHERE ledger.account_code = 'restaurant_payable')::integer,
    COALESCE(sum(ledger.amount_cents) FILTER (
      WHERE ledger.account_code = 'restaurant_payable' AND ledger.direction = 'credit'
    ), 0)::integer,
    (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
      WHERE ledger.account_code = 'restaurant_payable' AND ledger.direction = 'credit'
    ))[1],
    count(*) FILTER (WHERE ledger.account_code = 'delivery_pass_through_payable')::integer,
    COALESCE(sum(ledger.amount_cents) FILTER (
      WHERE ledger.account_code = 'delivery_pass_through_payable' AND ledger.direction = 'credit'
    ), 0)::integer,
    (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
      WHERE ledger.account_code = 'delivery_pass_through_payable' AND ledger.direction = 'credit'
    ))[1],
    count(*) FILTER (WHERE ledger.account_code = v_revenue_account)::integer,
    COALESCE(sum(ledger.amount_cents) FILTER (
      WHERE ledger.account_code = v_revenue_account AND ledger.direction = 'credit'
    ), 0)::integer,
    (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
      WHERE ledger.account_code = v_revenue_account AND ledger.direction = 'credit'
    ))[1],
    count(*) FILTER (WHERE ledger.account_code = 'tax_payable')::integer,
    COALESCE(sum(ledger.amount_cents) FILTER (
      WHERE ledger.account_code = 'tax_payable' AND ledger.direction = 'credit'
    ), 0)::integer,
    (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
      WHERE ledger.account_code = 'tax_payable' AND ledger.direction = 'credit'
    ))[1],
    count(*) FILTER (WHERE ledger.account_code = 'developer_revenue_share_expense')::integer,
    COALESCE(sum(ledger.amount_cents) FILTER (
      WHERE ledger.account_code = 'developer_revenue_share_expense' AND ledger.direction = 'debit'
    ), 0)::integer,
    (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
      WHERE ledger.account_code = 'developer_revenue_share_expense' AND ledger.direction = 'debit'
    ))[1],
    count(*) FILTER (WHERE ledger.account_code = 'developer_payable')::integer,
    COALESCE(sum(ledger.amount_cents) FILTER (
      WHERE ledger.account_code = 'developer_payable' AND ledger.direction = 'credit'
    ), 0)::integer,
    (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
      WHERE ledger.account_code = 'developer_payable' AND ledger.direction = 'credit'
    ))[1]
  INTO
    v_restaurant_count, v_restaurant_sum, v_restaurant_entry_id,
    v_delivery_count, v_delivery_sum, v_delivery_entry_id,
    v_platform_count, v_platform_sum, v_platform_entry_id,
    v_tax_count, v_tax_sum, v_tax_entry_id,
    v_developer_expense_count, v_developer_expense_sum, v_developer_expense_entry_id,
    v_developer_payable_count, v_developer_payable_sum, v_developer_payable_entry_id
  FROM public.financial_ledger ledger
  WHERE ledger.source_type = v_original_source_type
    AND ledger.source_id = v_original_source_id
    AND ledger.stripe_mode = v_mode
    AND ledger.reversal_of IS NULL;

  IF (v_restaurant_cents = 0 AND v_restaurant_count <> 0)
    OR (v_restaurant_cents > 0 AND (v_restaurant_count <> 1 OR v_restaurant_sum <> v_restaurant_cents))
    OR (v_delivery_cents = 0 AND v_delivery_count <> 0)
    OR (v_delivery_cents > 0 AND (v_delivery_count <> 1 OR v_delivery_sum <> v_delivery_cents))
    OR (v_platform_cents = 0 AND v_platform_count <> 0)
    OR (v_platform_cents > 0 AND (v_platform_count <> 1 OR v_platform_sum <> v_platform_cents))
    OR (v_tax_cents = 0 AND v_tax_count <> 0)
    OR (v_tax_cents > 0 AND (v_tax_count <> 1 OR v_tax_sum <> v_tax_cents))
    OR (v_developer_cents = 0 AND (v_developer_expense_count <> 0 OR v_developer_payable_count <> 0))
    OR (v_developer_cents > 0 AND (
      v_developer_expense_count <> 1 OR v_developer_payable_count <> 1
      OR v_developer_expense_sum <> v_developer_cents
      OR v_developer_payable_sum <> v_developer_cents
    ))
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'original_ledger_differs_from_reversal_snapshot';
  END IF;

  SELECT
    COALESCE(sum(CASE WHEN ledger.account_code = 'payment_asset' THEN
      CASE WHEN ledger.direction = 'credit' THEN ledger.amount_cents ELSE -ledger.amount_cents END
    ELSE 0 END), 0)::integer,
    COALESCE(sum(CASE WHEN ledger.account_code = 'restaurant_payable' THEN
      CASE WHEN ledger.direction = 'debit' THEN ledger.amount_cents ELSE -ledger.amount_cents END
    ELSE 0 END), 0)::integer,
    COALESCE(sum(CASE WHEN ledger.account_code = 'delivery_pass_through_payable' THEN
      CASE WHEN ledger.direction = 'debit' THEN ledger.amount_cents ELSE -ledger.amount_cents END
    ELSE 0 END), 0)::integer,
    COALESCE(sum(CASE WHEN ledger.account_code = v_revenue_account THEN
      CASE WHEN ledger.direction = 'debit' THEN ledger.amount_cents ELSE -ledger.amount_cents END
    ELSE 0 END), 0)::integer,
    COALESCE(sum(CASE WHEN ledger.account_code = 'tax_payable' THEN
      CASE WHEN ledger.direction = 'debit' THEN ledger.amount_cents ELSE -ledger.amount_cents END
    ELSE 0 END), 0)::integer,
    COALESCE(sum(CASE WHEN ledger.account_code = 'developer_payable' THEN
      CASE WHEN ledger.direction = 'debit' THEN ledger.amount_cents ELSE -ledger.amount_cents END
    ELSE 0 END), 0)::integer,
    COALESCE(sum(CASE WHEN ledger.account_code = 'developer_revenue_share_expense' THEN
      CASE WHEN ledger.direction = 'credit' THEN ledger.amount_cents ELSE -ledger.amount_cents END
    ELSE 0 END), 0)::integer
  INTO v_prior_gross, v_prior_restaurant, v_prior_delivery,
       v_prior_platform, v_prior_tax,
       v_prior_developer_payable, v_prior_developer_expense
  FROM public.financial_ledger ledger
  WHERE ledger.source_type IN ('stripe_refund', 'stripe_dispute', 'stripe_dispute_reversal')
    AND ledger.stripe_mode = v_mode
    AND ledger.metadata ->> 'payment_intent_id' = p_payment_intent_id;

  IF v_prior_gross < 0 OR v_prior_gross > v_gross_cents
    OR v_prior_restaurant < 0 OR v_prior_restaurant > v_restaurant_cents
    OR v_prior_delivery < 0 OR v_prior_delivery > v_delivery_cents
    OR v_prior_platform < 0 OR v_prior_platform > v_platform_cents
    OR v_prior_tax < 0 OR v_prior_tax > v_tax_cents
    OR v_prior_developer_payable < 0 OR v_prior_developer_payable > v_developer_cents
    OR v_prior_developer_expense <> v_prior_developer_payable
    OR v_prior_restaurant + v_prior_delivery + v_prior_platform + v_prior_tax <> v_prior_gross
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_cumulative_marketplace_reversal_state';
  END IF;

  IF v_action = 'restore' THEN
    -- A dispute win must be the exact opposite of that dispute opening, not a
    -- new allocation over the aggregate refund/dispute pool.
    SELECT
      count(*) FILTER (WHERE ledger.account_code = 'payment_asset')::integer,
      COALESCE(sum(ledger.amount_cents) FILTER (
        WHERE ledger.account_code = 'payment_asset' AND ledger.direction = 'credit'
      ), 0)::integer,
      (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
        WHERE ledger.account_code = 'payment_asset' AND ledger.direction = 'credit'
      ))[1],
      count(*) FILTER (WHERE ledger.account_code = 'restaurant_payable')::integer,
      COALESCE(sum(ledger.amount_cents) FILTER (
        WHERE ledger.account_code = 'restaurant_payable' AND ledger.direction = 'debit'
      ), 0)::integer,
      (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
        WHERE ledger.account_code = 'restaurant_payable' AND ledger.direction = 'debit'
      ))[1],
      count(*) FILTER (WHERE ledger.account_code = 'delivery_pass_through_payable')::integer,
      COALESCE(sum(ledger.amount_cents) FILTER (
        WHERE ledger.account_code = 'delivery_pass_through_payable' AND ledger.direction = 'debit'
      ), 0)::integer,
      (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
        WHERE ledger.account_code = 'delivery_pass_through_payable' AND ledger.direction = 'debit'
      ))[1],
      count(*) FILTER (WHERE ledger.account_code = v_revenue_account)::integer,
      COALESCE(sum(ledger.amount_cents) FILTER (
        WHERE ledger.account_code = v_revenue_account AND ledger.direction = 'debit'
      ), 0)::integer,
      (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
        WHERE ledger.account_code = v_revenue_account AND ledger.direction = 'debit'
      ))[1],
      count(*) FILTER (WHERE ledger.account_code = 'tax_payable')::integer,
      COALESCE(sum(ledger.amount_cents) FILTER (
        WHERE ledger.account_code = 'tax_payable' AND ledger.direction = 'debit'
      ), 0)::integer,
      (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
        WHERE ledger.account_code = 'tax_payable' AND ledger.direction = 'debit'
      ))[1],
      count(*) FILTER (WHERE ledger.account_code = 'developer_revenue_share_expense')::integer,
      COALESCE(sum(ledger.amount_cents) FILTER (
        WHERE ledger.account_code = 'developer_revenue_share_expense'
          AND ledger.direction = 'credit'
      ), 0)::integer,
      (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
        WHERE ledger.account_code = 'developer_revenue_share_expense'
          AND ledger.direction = 'credit'
      ))[1],
      count(*) FILTER (WHERE ledger.account_code = 'developer_payable')::integer,
      COALESCE(sum(ledger.amount_cents) FILTER (
        WHERE ledger.account_code = 'developer_payable' AND ledger.direction = 'debit'
      ), 0)::integer,
      (array_agg(ledger.entry_id ORDER BY ledger.created_at, ledger.entry_id) FILTER (
        WHERE ledger.account_code = 'developer_payable' AND ledger.direction = 'debit'
      ))[1]
    INTO
      v_dispute_asset_count, v_dispute_asset_sum, v_original_asset_id,
      v_restaurant_count, v_restaurant_sum, v_restaurant_entry_id,
      v_delivery_count, v_delivery_sum, v_delivery_entry_id,
      v_platform_count, v_platform_sum, v_platform_entry_id,
      v_tax_count, v_tax_sum, v_tax_entry_id,
      v_developer_expense_count, v_developer_expense_sum, v_developer_expense_entry_id,
      v_developer_payable_count, v_developer_payable_sum, v_developer_payable_entry_id
    FROM public.financial_ledger ledger
    WHERE ledger.source_type = 'stripe_dispute'
      AND ledger.source_id = p_reversal_source_id
      AND ledger.stripe_mode = v_mode
      AND ledger.metadata ->> 'payment_intent_id' = p_payment_intent_id;

    SELECT COALESCE(sum(CASE WHEN ledger.direction = 'debit'
        THEN ledger.amount_cents ELSE -ledger.amount_cents END), 0)
    INTO v_journal_balance
    FROM public.financial_ledger ledger
    WHERE ledger.source_type = 'stripe_dispute'
      AND ledger.source_id = p_reversal_source_id
      AND ledger.stripe_mode = v_mode
      AND ledger.metadata ->> 'payment_intent_id' = p_payment_intent_id;

    IF v_dispute_asset_count <> 1 OR v_dispute_asset_sum <> p_amount_cents
      OR (v_restaurant_sum = 0 AND v_restaurant_count <> 0)
      OR (v_restaurant_sum > 0 AND v_restaurant_count <> 1)
      OR (v_delivery_sum = 0 AND v_delivery_count <> 0)
      OR (v_delivery_sum > 0 AND v_delivery_count <> 1)
      OR (v_platform_sum = 0 AND v_platform_count <> 0)
      OR (v_platform_sum > 0 AND v_platform_count <> 1)
      OR (v_tax_sum = 0 AND v_tax_count <> 0)
      OR (v_tax_sum > 0 AND v_tax_count <> 1)
      OR v_restaurant_sum + v_delivery_sum + v_platform_sum + v_tax_sum <> p_amount_cents
      OR v_developer_expense_count <> v_developer_payable_count
      OR v_developer_expense_count NOT IN (0, 1)
      OR v_developer_expense_sum <> v_developer_payable_sum
      OR v_journal_balance <> 0
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dispute_opening_journal_not_exactly_reversible';
    END IF;

    v_delta_restaurant := v_restaurant_sum;
    v_delta_delivery := v_delivery_sum;
    v_delta_platform := v_platform_sum;
    v_delta_tax := v_tax_sum;
    v_delta_developer := v_developer_payable_sum;
    v_base := v_prior_gross;
    v_available_restaurant := v_prior_restaurant;
    v_available_delivery := v_prior_delivery;
    v_available_platform := v_prior_platform;
    v_available_tax := v_prior_tax;
    v_available_developer := v_prior_developer_payable;
    IF p_amount_cents > v_base
      OR v_delta_restaurant > v_available_restaurant
      OR v_delta_delivery > v_available_delivery
      OR v_delta_platform > v_available_platform
      OR v_delta_tax > v_available_tax
      OR v_delta_developer > v_available_developer
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dispute_restore_exceeds_cumulative_reversal';
    END IF;
  ELSE
    v_base := v_gross_cents - v_prior_gross;
    v_available_restaurant := v_restaurant_cents - v_prior_restaurant;
    v_available_delivery := v_delivery_cents - v_prior_delivery;
    v_available_platform := v_platform_cents - v_prior_platform;
    v_available_tax := v_tax_cents - v_prior_tax;
    v_available_developer := v_developer_cents - v_prior_developer_payable;
    IF v_base <= 0 OR p_amount_cents > v_base
      OR v_available_restaurant + v_available_delivery
         + v_available_platform + v_available_tax <> v_base
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reversal_exceeds_available_payment_balance';
    END IF;

    IF p_amount_cents = v_base THEN
      v_delta_restaurant := v_available_restaurant;
      v_delta_delivery := v_available_delivery;
      v_delta_platform := v_available_platform;
      v_delta_tax := v_available_tax;
      v_delta_developer := v_available_developer;
    ELSE
      v_delta_restaurant := floor(
        p_amount_cents::numeric * v_available_restaurant / v_base
      )::integer;
      v_delta_delivery := floor(
        p_amount_cents::numeric * v_available_delivery / v_base
      )::integer;
      v_delta_platform := floor(
        p_amount_cents::numeric * v_available_platform / v_base
      )::integer;
      v_delta_tax := floor(
        p_amount_cents::numeric * v_available_tax / v_base
      )::integer;
      v_delta_developer := floor(
        p_amount_cents::numeric * v_available_developer / v_base
      )::integer;
      v_residual := p_amount_cents - v_delta_restaurant - v_delta_delivery
        - v_delta_platform - v_delta_tax;

      v_allocate := LEAST(v_residual, v_available_restaurant - v_delta_restaurant);
      v_delta_restaurant := v_delta_restaurant + v_allocate;
      v_residual := v_residual - v_allocate;
      v_allocate := LEAST(v_residual, v_available_delivery - v_delta_delivery);
      v_delta_delivery := v_delta_delivery + v_allocate;
      v_residual := v_residual - v_allocate;
      v_allocate := LEAST(v_residual, v_available_platform - v_delta_platform);
      v_delta_platform := v_delta_platform + v_allocate;
      v_residual := v_residual - v_allocate;
      v_allocate := LEAST(v_residual, v_available_tax - v_delta_tax);
      v_delta_tax := v_delta_tax + v_allocate;
      v_residual := v_residual - v_allocate;
    END IF;

    IF v_residual <> 0
      OR v_delta_restaurant + v_delta_delivery + v_delta_platform + v_delta_tax <> p_amount_cents
      OR v_delta_restaurant > v_available_restaurant
      OR v_delta_delivery > v_available_delivery
      OR v_delta_platform > v_available_platform
      OR v_delta_tax > v_available_tax
      OR v_delta_developer > v_available_developer
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'marketplace_reversal_allocation_failed';
    END IF;
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'payment_intent_id', p_payment_intent_id,
    'original_source_type', v_original_source_type,
    'original_source_id', v_original_source_id,
    'reversal_action', v_action,
    'reversal_amount_cents', p_amount_cents,
    'restaurant_delta_cents', v_delta_restaurant,
    'delivery_delta_cents', v_delta_delivery,
    'platform_delta_cents', v_delta_platform,
    'tax_delta_cents', v_delta_tax,
    'developer_delta_cents', v_delta_developer,
    'prior_net_reversed_cents', v_prior_gross,
    'net_reversed_cents', CASE
      WHEN v_action = 'decrease' THEN v_prior_gross + p_amount_cents
      ELSE v_prior_gross - p_amount_cents
    END,
    'platform_revenue_account', v_revenue_account,
    'finance_reversal_input_hash', v_input_hash,
    'livemode', v_livemode
  );

  INSERT INTO public.financial_ledger (
    source_type, source_id, stripe_event_id, restaurant_id, account_code,
    direction, amount_cents, currency, reversal_of, metadata
  ) VALUES (
    v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
    'payment_asset', v_asset_direction, p_amount_cents, v_currency,
    v_original_asset_id, v_metadata
  );
  IF v_delta_restaurant > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, reversal_of, metadata
    ) VALUES (
      v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
      'restaurant_payable', v_component_direction, v_delta_restaurant, v_currency,
      v_restaurant_entry_id, v_metadata
    );
  END IF;
  IF v_delta_delivery > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, reversal_of, metadata
    ) VALUES (
      v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
      'delivery_pass_through_payable', v_component_direction, v_delta_delivery, v_currency,
      v_delivery_entry_id, v_metadata
    );
  END IF;
  IF v_delta_platform > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, reversal_of, metadata
    ) VALUES (
      v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
      v_revenue_account, v_component_direction, v_delta_platform, v_currency,
      v_platform_entry_id, v_metadata
    );
  END IF;
  IF v_delta_tax > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, reversal_of, metadata
    ) VALUES (
      v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
      'tax_payable', v_component_direction, v_delta_tax, v_currency,
      v_tax_entry_id, v_metadata
    );
  END IF;
  IF v_delta_developer > 0 THEN
    INSERT INTO public.financial_ledger (
      source_type, source_id, stripe_event_id, restaurant_id, account_code,
      direction, amount_cents, currency, reversal_of, metadata
    ) VALUES
      (
        v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
        'developer_revenue_share_expense',
        CASE WHEN v_action = 'decrease' THEN 'credit' ELSE 'debit' END,
        v_delta_developer, v_currency, v_developer_expense_entry_id, v_metadata
      ),
      (
        v_source_type, p_reversal_source_id, p_stripe_event_id, v_restaurant_id,
        'developer_payable', v_component_direction,
        v_delta_developer, v_currency, v_developer_payable_entry_id, v_metadata
      );
  END IF;

  SELECT COALESCE(sum(CASE WHEN ledger.direction = 'debit'
      THEN ledger.amount_cents ELSE -ledger.amount_cents END), 0),
         count(*)::integer
  INTO v_journal_balance, v_journal_count
  FROM public.financial_ledger ledger
  WHERE ledger.source_type = v_source_type
    AND ledger.source_id = p_reversal_source_id
    AND ledger.stripe_mode = v_mode;
  IF v_journal_balance <> 0 OR v_journal_count < 2 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'finance_reversal_journal_unbalanced';
  END IF;

  INSERT INTO public.finance_outbox (
    event_type, aggregate_type, aggregate_id, mode, payload
  ) VALUES (
    CASE
      WHEN v_source_type = 'stripe_refund' THEN 'finance.refund_recorded'
      WHEN v_source_type = 'stripe_dispute' THEN 'finance.dispute_opened'
      ELSE 'finance.dispute_won'
    END,
    CASE WHEN v_source_type = 'stripe_refund' THEN 'stripe_refund' ELSE 'stripe_dispute' END,
    p_reversal_source_id, v_mode,
    v_metadata || jsonb_build_object('reversal_source_id', p_reversal_source_id)
  ) ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION private_finance.record_marketplace_reversal(
  text, text, text, text, integer, text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

DO $fair_growth_reversal_assertions$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'private_finance.record_marketplace_reversal(text,text,text,text,integer,text,text,jsonb)'::regprocedure
  ) INTO v_definition;
  IF position('delivery_pass_through_payable' IN v_definition) = 0
    OR position('platform_vat_cents' IN v_definition) = 0
    OR position('developer_revenue_share_expense' IN v_definition) = 0
    OR position('dispute_opening_journal_not_exactly_reversible' IN v_definition) = 0
    OR position('finance_reversal_journal_unbalanced' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'Fair Growth reversal journal safeguards are incomplete';
  END IF;
END;
$fair_growth_reversal_assertions$;

-- Checkout posting above already records the legally applicable Swiss VAT.
-- Stripe Tax is therefore reconciliation evidence, not a second tax journal.
CREATE OR REPLACE FUNCTION public.record_stripe_tax_fee_ledger(
  p_stripe_event_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_tax_cents integer DEFAULT NULL,
  p_stripe_fee_cents integer DEFAULT NULL,
  p_currency text DEFAULT 'CHF',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
  v_source_type text;
  v_restaurant_id uuid;
  v_livemode boolean;
  v_currency text := upper(trim(COALESCE(p_currency, 'CHF')));
  v_checkout_metadata jsonb;
  v_platform_vat_cents integer;
  v_restaurant_share_cents integer := 0;
  v_existing_fee_cents integer;
  v_existing_fee_asset_cents integer;
  v_existing_fee_expense_count integer := 0;
  v_existing_fee_asset_count integer := 0;
  v_missing jsonb := '[]'::jsonb;
  v_metadata jsonb;
BEGIN
  IF NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_checkout_session_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_payment_intent_id, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_tax_fee_source';
  END IF;
  IF v_currency <> 'CHF'
    OR (p_tax_cents IS NOT NULL AND p_tax_cents < 0)
    OR (p_stripe_fee_cents IS NOT NULL AND p_stripe_fee_cents < 0)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_tax_or_fee_amount';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'tax_fee_metadata_object_required';
  END IF;

  SELECT event.* INTO v_event
  FROM public.stripe_webhook_events event
  WHERE event.event_id = p_stripe_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'stripe_event_not_claimed';
  END IF;
  v_livemode := v_event.livemode;

  PERFORM pg_advisory_xact_lock(
    hashtext('stripe_tax_fee_ledger'),
    hashtext(p_checkout_session_id)
  );
  SELECT ledger.source_type, ledger.restaurant_id, ledger.metadata
  INTO v_source_type, v_restaurant_id, v_checkout_metadata
  FROM public.financial_ledger ledger
  WHERE ledger.source_type IN ('stripe_checkout', 'stripe_invoice')
    AND ledger.source_id = p_checkout_session_id
    AND ledger.account_code = 'payment_asset'
    AND ledger.direction = 'debit'
    AND ledger.stripe_mode = CASE WHEN v_livemode THEN 'live' ELSE 'test' END
  ORDER BY ledger.created_at
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'original_payment_ledger_missing';
  END IF;
  IF COALESCE(v_checkout_metadata ->> 'payment_intent_id', '') <> p_payment_intent_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'tax_fee_payment_intent_mismatch';
  END IF;
  IF COALESCE(v_checkout_metadata ->> 'platform_vat_cents', '') !~ '^[0-9]+$'
    OR COALESCE(v_checkout_metadata ->> 'restaurant_share_cents', '') !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'authoritative_vat_snapshot_missing';
  END IF;
  v_platform_vat_cents := (v_checkout_metadata ->> 'platform_vat_cents')::integer;
  v_restaurant_share_cents := (v_checkout_metadata ->> 'restaurant_share_cents')::integer;
  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'payment_intent_id', p_payment_intent_id,
    'checkout_session_id', p_checkout_session_id,
    'platform_vat_cents', v_platform_vat_cents,
    'vat_already_recorded', true,
    'livemode', v_livemode
  );

  IF p_tax_cents IS NULL THEN
    v_missing := v_missing || jsonb_build_array('tax_cents');
  ELSIF p_tax_cents > 0 AND v_restaurant_share_cents > 0 THEN
    -- Session tax may belong to the restaurant supply; never silently assign
    -- it to TOK's commission liability.
    v_missing := v_missing || jsonb_build_array('marketplace_tax_liability_scope');
  ELSIF p_tax_cents > 0 AND p_tax_cents <> v_platform_vat_cents THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_tax_authoritative_vat_mismatch';
  ELSIF p_tax_cents = 0 AND v_platform_vat_cents > 0 AND v_restaurant_share_cents = 0 THEN
    v_missing := v_missing || jsonb_build_array('stripe_tax_not_reported');
  END IF;

  SELECT
    count(*) FILTER (
      WHERE ledger.account_code = 'stripe_processing_fee_expense'
        AND ledger.direction = 'debit'
    )::integer,
    max(ledger.amount_cents) FILTER (
      WHERE ledger.account_code = 'stripe_processing_fee_expense'
        AND ledger.direction = 'debit'
    ),
    count(*) FILTER (
      WHERE ledger.account_code = 'payment_asset'
        AND ledger.direction = 'credit'
    )::integer,
    max(ledger.amount_cents) FILTER (
      WHERE ledger.account_code = 'payment_asset'
        AND ledger.direction = 'credit'
    )
  INTO v_existing_fee_expense_count, v_existing_fee_cents,
       v_existing_fee_asset_count, v_existing_fee_asset_cents
  FROM public.financial_ledger ledger
  WHERE ledger.source_type = v_source_type
    AND ledger.source_id = p_checkout_session_id
    AND ledger.stripe_mode = CASE WHEN v_livemode THEN 'live' ELSE 'test' END;

  IF p_stripe_fee_cents IS NULL THEN
    v_missing := v_missing || jsonb_build_array('stripe_fee_cents');
  ELSIF p_stripe_fee_cents > 0 THEN
    IF v_existing_fee_expense_count <> v_existing_fee_asset_count
      OR v_existing_fee_expense_count NOT IN (0, 1)
      OR (
        v_existing_fee_expense_count = 1
        AND (
          v_existing_fee_cents IS DISTINCT FROM p_stripe_fee_cents
          OR v_existing_fee_asset_cents IS DISTINCT FROM p_stripe_fee_cents
        )
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_fee_journal_mismatch';
    END IF;

    IF v_existing_fee_expense_count = 0 THEN
      INSERT INTO public.financial_ledger (
        source_type, source_id, stripe_event_id, restaurant_id,
        account_code, direction, amount_cents, currency, metadata
      ) VALUES
        (v_source_type, p_checkout_session_id, p_stripe_event_id, v_restaurant_id,
         'stripe_processing_fee_expense', 'debit', p_stripe_fee_cents, v_currency, v_metadata),
        (v_source_type, p_checkout_session_id, p_stripe_event_id, v_restaurant_id,
         'payment_asset', 'credit', p_stripe_fee_cents, v_currency, v_metadata);
    END IF;
  ELSIF v_existing_fee_expense_count <> 0 OR v_existing_fee_asset_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_fee_zero_replay_mismatch';
  END IF;

  IF jsonb_array_length(v_missing) > 0 THEN
    INSERT INTO public.finance_outbox (
      event_type, aggregate_type, aggregate_id, mode, payload
    ) VALUES (
      'finance.reconciliation_required', 'stripe_checkout', p_checkout_session_id,
      CASE WHEN v_livemode THEN 'live' ELSE 'test' END,
      v_metadata || jsonb_build_object('missing_fields', v_missing)
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'tax_cents', p_tax_cents,
    'authoritative_vat_cents', v_platform_vat_cents,
    'stripe_fee_cents', p_stripe_fee_cents,
    'missing_fields', v_missing
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_stripe_tax_fee_ledger(
  text, text, text, integer, integer, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

-- These two webhook RPCs are called by the service-role Edge finance helper.
-- Browser roles remain denied; the functions themselves require a claimed
-- Stripe event and derive live/test mode from that server-owned event row.
REVOKE ALL ON FUNCTION public.record_marketplace_checkout_ledger(
  text, text, text, text, uuid, integer, text, boolean, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_marketplace_checkout_ledger(
  text, text, text, text, uuid, integer, text, boolean, jsonb, text
) TO service_role;
REVOKE ALL ON FUNCTION public.record_stripe_tax_fee_ledger(
  text, text, text, integer, integer, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_tax_fee_ledger(
  text, text, text, integer, integer, text, jsonb
) TO service_role;

DO $fair_growth_finance_rpc_privilege_assertions$
BEGIN
  IF NOT has_function_privilege(
      'service_role',
      'public.record_marketplace_checkout_ledger(text,text,text,text,uuid,integer,text,boolean,jsonb,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.record_stripe_tax_fee_ledger(text,text,text,integer,integer,text,jsonb)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.record_marketplace_checkout_ledger(text,text,text,text,uuid,integer,text,boolean,jsonb,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.record_stripe_tax_fee_ledger(text,text,text,integer,integer,text,jsonb)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'Fair Growth finance RPC privileges are unsafe or incomplete';
  END IF;
END;
$fair_growth_finance_rpc_privilege_assertions$;

-- Stripe Connect fees are TOK operating expenses. They are posted only from
-- the exact Stripe balance-transaction triplet (amount, fee, net) and never
-- reduce restaurant_payable.
DROP FUNCTION IF EXISTS public.record_stripe_connect_fee_ledger(
  text, uuid, text, text, text, integer, integer, integer, text, jsonb
);
CREATE OR REPLACE FUNCTION public.record_stripe_connect_fee_ledger(
  p_stripe_event_id text,
  p_lock_token uuid,
  p_balance_transaction_id text,
  p_connect_account_id text,
  p_fee_kind text,
  p_balance_transaction_type text,
  p_reporting_category text,
  p_balance_transaction_amount_cents integer,
  p_balance_transaction_fee_cents integer,
  p_balance_transaction_net_cents integer,
  p_currency text DEFAULT 'CHF',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
  v_mode text;
  v_currency text := upper(trim(COALESCE(p_currency, 'CHF')));
  v_fee_kind text := lower(trim(COALESCE(p_fee_kind, '')));
  v_transaction_type text := lower(trim(COALESCE(p_balance_transaction_type, '')));
  v_reporting_category text := lower(trim(COALESCE(p_reporting_category, '')));
  v_standalone_fee boolean := false;
  v_cost_cents integer;
  v_expense_count integer := 0;
  v_asset_count integer := 0;
  v_expense_cents integer;
  v_asset_cents integer;
  v_expense_currency text;
  v_asset_currency text;
  v_existing_metadata jsonb;
  v_input_hash text;
  v_metadata jsonb;
BEGIN
  IF NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL
    OR p_lock_token IS NULL
    OR COALESCE(p_balance_transaction_id, '') !~ '^txn_[A-Za-z0-9]+$'
    OR COALESCE(p_connect_account_id, '') !~ '^acct_[A-Za-z0-9]+$'
    OR v_fee_kind NOT IN ('active_account', 'payout', 'transfer', 'other_connect')
    OR p_balance_transaction_amount_cents IS NULL
    OR p_balance_transaction_fee_cents IS NULL
    OR p_balance_transaction_fee_cents < 0
    OR p_balance_transaction_net_cents IS NULL
    OR p_balance_transaction_amount_cents::bigint - p_balance_transaction_fee_cents::bigint
       <> p_balance_transaction_net_cents::bigint
    OR v_currency <> 'CHF'
    OR jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'exact_connect_balance_transaction_required';
  END IF;

  -- Stripe sometimes exposes a fee on another balance transaction and
  -- sometimes as its own negative balance transaction. Only documented,
  -- paired type/reporting-category shapes are accepted; transfer principal
  -- can therefore never be mistaken for a Connect fee.
  v_standalone_fee := p_balance_transaction_fee_cents = 0
    AND p_balance_transaction_amount_cents < 0
    AND p_balance_transaction_net_cents = p_balance_transaction_amount_cents
    AND (
      (v_transaction_type = 'stripe_fee' AND v_reporting_category = 'fee')
      OR (
        v_transaction_type = 'connect_collection_transfer'
        AND v_reporting_category = 'connect_collection_transfer'
      )
    );
  IF p_balance_transaction_fee_cents > 0 THEN
    IF (v_transaction_type, v_reporting_category) NOT IN (
      ('stripe_fee', 'fee'),
      ('payout', 'payout'),
      ('transfer', 'transfer'),
      ('connect_collection_transfer', 'connect_collection_transfer')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_connect_fee_balance_transaction_shape';
    END IF;
    v_cost_cents := p_balance_transaction_fee_cents;
  ELSIF v_standalone_fee
    AND p_balance_transaction_net_cents >= -2147483647
  THEN
    v_cost_cents := abs(p_balance_transaction_net_cents::bigint)::integer;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_connect_fee_balance_transaction_shape';
  END IF;
  IF v_cost_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'positive_connect_cost_required';
  END IF;

  SELECT event.* INTO v_event
  FROM public.stripe_webhook_events event
  WHERE event.event_id = p_stripe_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'stripe_event_not_claimed';
  END IF;
  PERFORM private_finance.assert_webhook_lease(
    p_stripe_event_id, p_lock_token, v_event.livemode
  );
  v_mode := CASE WHEN v_event.livemode THEN 'live' ELSE 'test' END;
  v_input_hash := md5(jsonb_build_object(
    'balance_transaction_id', p_balance_transaction_id,
    'connect_account_id', p_connect_account_id,
    'fee_kind', v_fee_kind,
    'balance_transaction_type', v_transaction_type,
    'reporting_category', v_reporting_category,
    'amount_cents', p_balance_transaction_amount_cents,
    'fee_cents', p_balance_transaction_fee_cents,
    'net_cents', p_balance_transaction_net_cents,
    'currency', v_currency,
    'connect_cost_cents', v_cost_cents,
    'stripe_mode', v_mode
  )::text);

  PERFORM pg_advisory_xact_lock(
    hashtext('stripe_connect_balance_transaction'),
    hashtext(v_mode || ':' || p_balance_transaction_id)
  );
  SELECT
    count(*) FILTER (
      WHERE ledger.account_code = 'stripe_connect_fee_expense'
        AND ledger.direction = 'debit'
    )::integer,
    max(ledger.amount_cents) FILTER (
      WHERE ledger.account_code = 'stripe_connect_fee_expense'
        AND ledger.direction = 'debit'
    ),
    max(ledger.currency) FILTER (
      WHERE ledger.account_code = 'stripe_connect_fee_expense'
        AND ledger.direction = 'debit'
    ),
    count(*) FILTER (
      WHERE ledger.account_code = 'payment_asset'
        AND ledger.direction = 'credit'
    )::integer,
    max(ledger.amount_cents) FILTER (
      WHERE ledger.account_code = 'payment_asset'
        AND ledger.direction = 'credit'
    ),
    max(ledger.currency) FILTER (
      WHERE ledger.account_code = 'payment_asset'
        AND ledger.direction = 'credit'
    )
  INTO v_expense_count, v_expense_cents, v_expense_currency,
       v_asset_count, v_asset_cents, v_asset_currency
  FROM public.financial_ledger ledger
  WHERE ledger.source_type = 'stripe_connect_fee'
    AND ledger.source_id = p_balance_transaction_id
    AND ledger.stripe_mode = v_mode;

  IF v_expense_count <> v_asset_count
    OR v_expense_count NOT IN (0, 1)
    OR (
      v_expense_count = 1
      AND (
        v_expense_cents IS DISTINCT FROM v_cost_cents
        OR v_asset_cents IS DISTINCT FROM v_cost_cents
        OR v_expense_currency IS DISTINCT FROM v_currency
        OR v_asset_currency IS DISTINCT FROM v_currency
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_connect_fee_journal_mismatch';
  END IF;
  IF v_expense_count = 1 THEN
    SELECT ledger.metadata INTO v_existing_metadata
    FROM public.financial_ledger ledger
    WHERE ledger.source_type = 'stripe_connect_fee'
      AND ledger.source_id = p_balance_transaction_id
      AND ledger.stripe_mode = v_mode
      AND ledger.account_code = 'stripe_connect_fee_expense'
      AND ledger.direction = 'debit'
    LIMIT 1
    FOR UPDATE;
    IF COALESCE(v_existing_metadata ->> 'connect_fee_input_hash', '') <> v_input_hash
      OR COALESCE(v_existing_metadata ->> 'stripe_connect_account_id', '') <> p_connect_account_id
      OR COALESCE(v_existing_metadata ->> 'connect_fee_kind', '') <> v_fee_kind
      OR COALESCE(v_existing_metadata ->> 'balance_transaction_type', '') <> v_transaction_type
      OR COALESCE(v_existing_metadata ->> 'reporting_category', '') <> v_reporting_category
      OR COALESCE(v_existing_metadata ->> 'balance_transaction_amount_cents', '')
         <> p_balance_transaction_amount_cents::text
      OR COALESCE(v_existing_metadata ->> 'balance_transaction_fee_cents', '')
         <> p_balance_transaction_fee_cents::text
      OR COALESCE(v_existing_metadata ->> 'balance_transaction_net_cents', '')
         <> p_balance_transaction_net_cents::text
      OR COALESCE(v_existing_metadata ->> 'connect_cost_cents', '') <> v_cost_cents::text
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'stripe_connect_fee_idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'recorded', false,
      'duplicate', true,
      'balance_transaction_id', p_balance_transaction_id,
      'fee_cents', p_balance_transaction_fee_cents,
      'connect_cost_cents', v_cost_cents,
      'stripe_mode', v_mode
    );
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'stripe_balance_transaction_id', p_balance_transaction_id,
    'stripe_connect_account_id', p_connect_account_id,
    'connect_fee_kind', v_fee_kind,
    'balance_transaction_type', v_transaction_type,
    'reporting_category', v_reporting_category,
    'balance_transaction_amount_cents', p_balance_transaction_amount_cents,
    'balance_transaction_fee_cents', p_balance_transaction_fee_cents,
    'balance_transaction_net_cents', p_balance_transaction_net_cents,
    'connect_cost_cents', v_cost_cents,
    'standalone_fee_transaction', v_standalone_fee,
    'fee_source', 'stripe_balance_transaction_exact',
    'connect_fee_input_hash', v_input_hash,
    'livemode', v_event.livemode
  );
  INSERT INTO public.financial_ledger (
    source_type, source_id, stripe_event_id, restaurant_id,
    account_code, direction, amount_cents, currency, metadata
  ) VALUES
    (
      'stripe_connect_fee', p_balance_transaction_id, p_stripe_event_id, NULL,
      'stripe_connect_fee_expense', 'debit', v_cost_cents,
      v_currency, v_metadata
    ),
    (
      'stripe_connect_fee', p_balance_transaction_id, p_stripe_event_id, NULL,
      'payment_asset', 'credit', v_cost_cents,
      v_currency, v_metadata
    );

  INSERT INTO public.finance_outbox (
    event_type, aggregate_type, aggregate_id, mode, payload
  ) VALUES (
    'finance.connect_fee_recorded', 'stripe_balance_transaction',
    p_balance_transaction_id, v_mode, v_metadata
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'recorded', true,
    'duplicate', false,
    'balance_transaction_id', p_balance_transaction_id,
    'fee_cents', p_balance_transaction_fee_cents,
    'connect_cost_cents', v_cost_cents,
    'stripe_mode', v_mode
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_stripe_connect_fee_ledger(
  text, uuid, text, text, text, text, text, integer, integer, integer, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_connect_fee_ledger(
  text, uuid, text, text, text, text, text, integer, integer, integer, text, jsonb
) TO service_role;

DO $fair_growth_connect_fee_assertions$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.record_stripe_connect_fee_ledger(text,uuid,text,text,text,text,text,integer,integer,integer,text,jsonb)'::regprocedure
  ) INTO v_definition;
  IF position('stripe_balance_transaction_exact' IN v_definition) = 0
    OR position('stripe_connect_fee_expense' IN v_definition) = 0
    OR position('stripe_connect_fee_idempotency_conflict' IN v_definition) = 0
    OR position('unsupported_connect_fee_balance_transaction_shape' IN v_definition) = 0
    OR position('balance_transaction_type' IN v_definition) = 0
    OR position('reporting_category' IN v_definition) = 0
    OR position('restaurant_payable' IN v_definition) > 0
    OR position('assert_webhook_lease' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'Stripe Connect fee safeguards are incomplete';
  END IF;
END;
$fair_growth_connect_fee_assertions$;

-- Finance reporting uses net recognized revenue from the double-entry ledger.
-- Refund/dispute debits therefore reduce revenue in the same month they occur.
CREATE OR REPLACE VIEW public.admin_platform_finance_monthly_snapshot
WITH (security_invoker = true) AS
WITH revenue AS (
  SELECT
    date_trunc('month', ledger.effective_at)::date AS period_month,
    (
      COALESCE(sum(CASE
        WHEN ledger.direction = 'credit' THEN ledger.amount_cents
        ELSE -ledger.amount_cents
      END), 0)::numeric / 100
    )::numeric(12,2) AS revenue_chf
  FROM public.financial_ledger ledger
  WHERE ledger.account_code LIKE 'tok\_%\_revenue' ESCAPE '\'
  GROUP BY date_trunc('month', ledger.effective_at)::date
), costs AS (
  SELECT
    cost.period_month,
    COALESCE(sum(cost.amount_chf) FILTER (
      WHERE cost.cost_source = 'marketing'
    ), 0)::numeric(12,2) AS marketing_spent_chf,
    COALESCE(sum(cost.amount_chf) FILTER (
      WHERE cost.cost_source = 'commercial'
    ), 0)::numeric(12,2) AS commercial_cost_chf,
    COALESCE(sum(cost.amount_chf) FILTER (
      WHERE cost.cost_source = 'openai'
    ), 0)::numeric(12,2) AS openai_cost_chf,
    COALESCE(sum(cost.amount_chf) FILTER (
      WHERE cost.cost_source <> ALL (ARRAY['marketing', 'commercial', 'openai'])
    ), 0)::numeric(12,2) AS other_cost_chf
  FROM public.platform_cost_entries cost
  GROUP BY cost.period_month
), ai AS (
  SELECT
    usage.period_month,
    COALESCE(sum(usage.estimated_cost_chf), 0)::numeric(12,2) AS ai_usage_cost_chf
  FROM public.ai_usage_costs usage
  GROUP BY usage.period_month
)
SELECT
  COALESCE(r.period_month, c.period_month, a.period_month, budget.period_month) AS period_month,
  COALESCE(r.revenue_chf, budget.revenue_chf, 0)::numeric(12,2) AS revenue_chf,
  round(
    COALESCE(r.revenue_chf, budget.revenue_chf, 0)
      * COALESCE(budget.marketing_budget_ratio, 0.6000), 2
  ) AS marketing_authorized_chf,
  COALESCE(c.marketing_spent_chf, budget.marketing_spent_chf, 0)::numeric(12,2)
    AS marketing_spent_chf,
  GREATEST(
    0,
    round(
      COALESCE(r.revenue_chf, budget.revenue_chf, 0)
        * COALESCE(budget.marketing_budget_ratio, 0.6000), 2
    ) - COALESCE(c.marketing_spent_chf, budget.marketing_spent_chf, 0)
  ) AS marketing_available_chf,
  COALESCE(c.commercial_cost_chf, 0)::numeric(12,2) AS commercial_cost_chf,
  (
    COALESCE(c.openai_cost_chf, 0) + COALESCE(a.ai_usage_cost_chf, 0)
  )::numeric(12,2) AS ai_cost_chf,
  COALESCE(c.other_cost_chf, 0)::numeric(12,2) AS other_cost_chf,
  round(
    COALESCE(r.revenue_chf, budget.revenue_chf, 0)
      * COALESCE(budget.reserve_ratio, 0.0700), 2
  ) AS reserve_minimum_chf,
  (
    COALESCE(r.revenue_chf, budget.revenue_chf, 0)
      - COALESCE(c.marketing_spent_chf, budget.marketing_spent_chf, 0)
      - COALESCE(c.commercial_cost_chf, 0)
      - COALESCE(c.openai_cost_chf, 0)
      - COALESCE(a.ai_usage_cost_chf, 0)
      - COALESCE(c.other_cost_chf, 0)
  )::numeric(12,2) AS net_margin_chf
FROM revenue r
FULL JOIN costs c ON c.period_month = r.period_month
FULL JOIN ai a ON a.period_month = COALESCE(r.period_month, c.period_month)
FULL JOIN public.marketing_budget_periods budget
  ON budget.period_month = COALESCE(r.period_month, c.period_month, a.period_month);

DO $fair_growth_finance_reporting_assertions$
DECLARE
  v_definition text;
  v_security_invoker boolean := false;
BEGIN
  SELECT pg_get_viewdef(
    'public.admin_platform_finance_monthly_snapshot'::regclass, true
  ) INTO v_definition;
  SELECT COALESCE(
    relation.reloptions @> ARRAY['security_invoker=true']::text[], false
  ) INTO v_security_invoker
  FROM pg_catalog.pg_class relation
  WHERE relation.oid =
    'public.admin_platform_finance_monthly_snapshot'::regclass;
  IF position('financial_ledger' IN v_definition) = 0
    OR position('direction' IN v_definition) = 0
    OR position('platform_revenue_entries' IN v_definition) > 0
    OR NOT v_security_invoker
  THEN
    RAISE EXCEPTION 'Finance monthly reporting is not ledger-net and SECURITY INVOKER';
  END IF;
END;
$fair_growth_finance_reporting_assertions$;

-- Arrival/seating are operational statuses only. Revenue is charged later by
-- mark_reservation_honored when the table is closed.
CREATE OR REPLACE FUNCTION public.update_restaurant_reservation_status_safe(
  p_reservation_id uuid,
  p_status text
)
RETURNS TABLE(updated boolean, error_code text, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_status text := lower(trim(COALESCE(p_status, '')));
BEGIN
  IF public.commercial_demo_current_user_is_restricted() THEN
    RAISE EXCEPTION 'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs'
      USING ERRCODE = '42501';
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN QUERY SELECT false, 'use_cancel_rpc', 'Utilisez l annulation avec une raison.';
    RETURN;
  END IF;
  IF v_status NOT IN ('pending', 'confirmed', 'arrived', 'seated', 'completed', 'no_show') THEN
    RETURN QUERY SELECT false, 'invalid_status', 'Statut de reservation invalide.';
    RETURN;
  END IF;

  SELECT * INTO v_reservation
  FROM public.reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found', 'Reservation introuvable.';
    RETURN;
  END IF;
  IF NOT (
    COALESCE(auth.role() = 'service_role', false)
    OR COALESCE(public.auth_is_admin(), false)
    OR COALESCE(public.auth_owns_restaurant(v_reservation.restaurant_id), false)
  )
  THEN
    RETURN QUERY SELECT false, 'forbidden', 'Acces refuse.';
    RETURN;
  END IF;
  IF lower(v_reservation.status) IN ('cancelled', 'canceled') THEN
    RETURN QUERY SELECT false, 'cancelled_locked', 'Cette reservation annulee est verrouillee.';
    RETURN;
  END IF;
  IF lower(COALESCE(v_reservation.status, '')) = 'no_show'
    AND v_status <> 'no_show'
  THEN
    RETURN QUERY SELECT false, 'no_show_locked', 'Ce no-show est verrouille et exige une correction auditee.';
    RETURN;
  END IF;
  IF v_reservation.honored_at IS NOT NULL
    AND v_status NOT IN ('seated', 'completed')
  THEN
    RETURN QUERY SELECT false, 'honored_locked', 'Une reservation honoree ne peut plus revenir a un statut anterieur.';
    RETURN;
  END IF;
  IF v_status = 'arrived'
    AND lower(COALESCE(v_reservation.status, '')) NOT IN ('pending', 'confirmed', 'arrived')
  THEN
    RETURN QUERY SELECT false, 'invalid_status_transition', 'Le statut arrivee exige une reservation en attente ou confirmee.';
    RETURN;
  END IF;
  IF v_status = 'seated'
    AND lower(COALESCE(v_reservation.status, '')) NOT IN ('arrived', 'seated')
  THEN
    RETURN QUERY SELECT false, 'invalid_status_transition', 'Le placement exige une arrivee prealable.';
    RETURN;
  END IF;
  IF v_status = 'completed'
    AND lower(COALESCE(v_reservation.status, '')) NOT IN ('arrived', 'seated', 'completed')
  THEN
    RETURN QUERY SELECT false, 'invalid_status_transition', 'La cloture exige une arrivee prealable.';
    RETURN;
  END IF;
  IF v_status = 'no_show'
    AND lower(COALESCE(v_reservation.status, '')) NOT IN ('pending', 'confirmed', 'no_show')
  THEN
    RETURN QUERY SELECT false, 'invalid_status_transition', 'Un client deja arrive ne peut pas devenir no-show sans correction auditee.';
    RETURN;
  END IF;

  UPDATE public.reservations reservation
  SET status = v_status,
      confirmed_at = CASE
        WHEN reservation.confirmed_at IS NULL
          AND v_status IN ('confirmed', 'arrived', 'seated', 'completed', 'no_show')
        THEN now()
        ELSE reservation.confirmed_at
      END,
      billing_fee_chf = CASE WHEN v_status = 'no_show' THEN 0 ELSE reservation.billing_fee_chf END,
      reservation_fee_waiver_reason = CASE
        WHEN v_status = 'no_show' THEN 'no_show' ELSE reservation.reservation_fee_waiver_reason
      END,
      updated_at = now()
  WHERE reservation.id = p_reservation_id;

  RETURN QUERY SELECT true, NULL::text, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.commercial_build_signature_snapshot(
  p_commercial_user_id uuid,
  p_plan_slug text,
  p_billing_period text,
  p_signed_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requested_plan_slug text := lower(trim(COALESCE(p_plan_slug, '')));
  v_plan_slug text;
  v_plan_name text;
  v_monthly_price numeric;
  v_annual_months integer;
  v_pricing_version text;
  v_contract_value numeric;
  v_billing_period text := lower(trim(COALESCE(p_billing_period, '')));
  v_profile_status text := 'sprint';
  v_employment_active boolean := false;
  v_phase text := 'sprint';
  v_mode text := 'commission_only';
  v_reservation_rate numeric := 0;
  v_commission numeric := 0;
BEGIN
  IF p_commercial_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'commercial_user_required';
  END IF;
  IF v_billing_period NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_subscription_billing_period';
  END IF;
  IF v_billing_period = 'yearly'
    AND NOT public.is_feature_flag_active('billing-fair-growth-annual')
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'fair_growth_annual_not_enabled';
  END IF;

  SELECT
    plan.slug,
    COALESCE(plan.public_name, plan.name),
    plan.price_monthly_chf,
    plan.annual_months_charged,
    plan.pricing_version
  INTO
    v_plan_slug,
    v_plan_name,
    v_monthly_price,
    v_annual_months,
    v_pricing_version
  FROM public.restaurant_subscription_plans plan
  WHERE lower(plan.slug) = v_requested_plan_slug
    AND plan.slug IN ('starter', 'pro', 'premium', 'elite')
    AND plan.is_active
  LIMIT 1;
  IF v_plan_slug IS NULL OR v_monthly_price IS NULL OR v_monthly_price <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_or_inactive_subscription_plan';
  END IF;

  v_contract_value := CASE
    WHEN v_billing_period = 'yearly' THEN v_monthly_price * COALESCE(v_annual_months, 11)
    ELSE v_monthly_price
  END;

  SELECT profile.status, profile.employment_active
  INTO v_profile_status, v_employment_active
  FROM public.commercial_compensation_profiles profile
  WHERE profile.user_id = p_commercial_user_id;
  v_employment_active := COALESCE(v_employment_active, false)
    AND COALESCE(v_profile_status, 'sprint') IN ('engaged', 'team_lead');
  v_phase := CASE WHEN v_employment_active THEN 'engaged' ELSE 'sprint' END;
  v_mode := CASE WHEN v_employment_active THEN 'fixed_plus_reservation' ELSE 'commission_only' END;
  v_reservation_rate := CASE WHEN v_employment_active THEN 0.02 ELSE 0 END;
  v_commission := public.commercial_signature_commission_chf(v_plan_slug, v_phase);

  RETURN jsonb_build_object(
    'plan_slug', v_plan_slug,
    'plan_name', v_plan_name,
    'billing_period', v_billing_period,
    'monthly_price_chf', v_monthly_price,
    'contract_value_chf', v_contract_value,
    'annual_months_charged', COALESCE(v_annual_months, 11),
    'pricing_version', v_pricing_version,
    'phase', v_phase,
    'acquisition_commission_rate', 0,
    'acquisition_commission_chf', v_commission,
    'commercial_compensation_mode', v_mode,
    'reservation_commission_rate', v_reservation_rate,
    'reservation_commission_starts_at',
      CASE WHEN v_employment_active THEN COALESCE(p_signed_at, now()) ELSE NULL END
  );
END;
$$;

-- Commercial signatures accept the same immutable monthly/yearly snapshot.
CREATE OR REPLACE FUNCTION public.record_commercial_prospect_followup(
  p_source_objectid bigint,
  p_status public.commercial_visit_status,
  p_notes text DEFAULT NULL,
  p_next_follow_up_at date DEFAULT NULL,
  p_refusal_reason_codes text[] DEFAULT ARRAY[]::text[],
  p_refusal_other_text text DEFAULT NULL,
  p_subscription_plan_slug text DEFAULT NULL,
  p_subscription_billing_period text DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_commercial boolean := public.has_role(auth.uid(), 'commercial'::public.app_role);
  v_existing public.commercial_prospect_followups%ROWTYPE;
  v_result public.commercial_prospect_followups%ROWTYPE;
  v_exists boolean := false;
  v_owner_id uuid;
  v_actor_name text;
  v_owner_name text;
  v_now timestamptz := now();
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_refusal_other text := NULLIF(trim(COALESCE(p_refusal_other_text, '')), '');
  v_reasons text[] := COALESCE(p_refusal_reason_codes, ARRAY[]::text[]);
  v_snapshot jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;
  IF NOT v_is_commercial THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'commercial_access_required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.commercial_compensation_profiles profile
    WHERE profile.user_id = v_actor_id
      AND profile.status = 'inactive'
  ) OR EXISTS (
    SELECT 1
    FROM public.commercial_demo_accounts account
    WHERE account.user_id = v_actor_id
      AND NOT account.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'commercial_account_inactive';
  END IF;
  IF p_source_objectid IS NULL OR p_source_objectid <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_source_objectid';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.commercial_prospect_catalog catalog
    WHERE catalog.source_objectid = p_source_objectid
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'prospect_not_in_server_catalog';
  END IF;
  IF p_status IS NULL OR p_status = 'not_visited'::public.commercial_visit_status THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_commercial_status';
  END IF;
  IF char_length(COALESCE(v_notes, '')) > 4000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'commercial_notes_too_long';
  END IF;

  SELECT * INTO v_existing
  FROM public.commercial_prospect_followups followup
  WHERE followup.source_objectid = p_source_objectid
  FOR UPDATE;
  v_exists := FOUND;

  IF v_exists AND p_expected_updated_at IS NOT NULL
    AND v_existing.updated_at IS DISTINCT FROM p_expected_updated_at
  THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'commercial_followup_changed_reload_required';
  END IF;
  IF v_exists THEN
    IF v_existing.assigned_to IS NOT NULL AND v_existing.assigned_to <> v_actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'prospect_owned_by_another_commercial';
    END IF;
    IF v_existing.status = 'signed'::public.commercial_visit_status THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'signed_prospect_is_admin_locked';
    END IF;
  END IF;

  v_owner_id := COALESCE(v_existing.assigned_to, v_existing.signed_by, v_actor_id);

  SELECT NULLIF(trim(profile.full_name), '') INTO v_actor_name
  FROM public.profiles profile
  WHERE profile.user_id = v_actor_id;
  v_actor_name := COALESCE(v_actor_name, 'Commercial TOK');

  SELECT NULLIF(trim(profile.full_name), '') INTO v_owner_name
  FROM public.profiles profile
  WHERE profile.user_id = v_owner_id;
  v_owner_name := COALESCE(v_existing.assigned_to_name, v_owner_name, v_actor_name, 'Commercial TOK');

  IF p_status = 'in_progress'::public.commercial_visit_status THEN
    IF p_next_follow_up_at IS NULL
      OR p_next_follow_up_at < (now() AT TIME ZONE 'Europe/Zurich')::date
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'future_follow_up_date_required';
    END IF;
  ELSIF p_next_follow_up_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'follow_up_date_only_allowed_for_revisit';
  END IF;

  IF p_status = 'not_interested'::public.commercial_visit_status THEN
    IF cardinality(v_reasons) = 0
      OR NOT public.commercial_refusal_reason_codes_valid(v_reasons)
      OR 'not_interested_unspecified' = ANY(v_reasons)
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refusal_reason_required';
    END IF;
    IF 'other' = ANY(v_reasons) AND v_refusal_other IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refusal_other_text_required';
    END IF;
    IF char_length(COALESCE(v_refusal_other, '')) > 500 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refusal_other_text_too_long';
    END IF;
  ELSE
    v_reasons := ARRAY[]::text[];
    v_refusal_other := NULL;
  END IF;

  IF p_status = 'signed'::public.commercial_visit_status THEN
    IF NULLIF(lower(trim(COALESCE(p_subscription_plan_slug, ''))), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signed_subscription_plan_required';
    END IF;
    IF lower(trim(COALESCE(p_subscription_billing_period, ''))) NOT IN ('monthly', 'yearly') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_signed_subscription_billing_period';
    END IF;
    IF lower(trim(p_subscription_billing_period)) = 'yearly'
      AND NOT public.is_feature_flag_active('billing-fair-growth-annual')
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'fair_growth_annual_not_enabled';
    END IF;

    -- commercial_build_signature_snapshot validates that the plan is active
    -- and derives every financial value from server-owned plan/profile rows.
    v_snapshot := public.commercial_build_signature_snapshot(
      v_owner_id,
      p_subscription_plan_slug,
      lower(trim(p_subscription_billing_period)),
      COALESCE(v_existing.signed_at, v_now)
    );
  ELSE
    IF p_subscription_plan_slug IS NOT NULL OR p_subscription_billing_period IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'subscription_plan_only_allowed_for_signed_status';
    END IF;
    v_snapshot := '{}'::jsonb;
  END IF;

  INSERT INTO public.commercial_prospect_followups (
    source_objectid,
    status,
    notes,
    assigned_to,
    assigned_to_name,
    last_contacted_by,
    last_contacted_by_name,
    visited_at,
    next_follow_up_at,
    refusal_reason_codes,
    refusal_other_text,
    signed_by,
    signed_by_name,
    signed_at,
    signed_restaurant_id,
    signed_subscription_plan_slug,
    signed_subscription_plan_name,
    signed_subscription_billing_period,
    signed_subscription_monthly_price_chf,
    signed_subscription_contract_value_chf,
    acquisition_commission_rate,
    acquisition_commission_chf,
    acquisition_commission_status,
    earned_at,
    commercial_compensation_mode,
    reservation_commission_rate,
    reservation_commission_starts_at,
    created_at,
    updated_at
  ) VALUES (
    p_source_objectid,
    p_status,
    v_notes,
    v_owner_id,
    v_owner_name,
    v_actor_id,
    v_actor_name,
    COALESCE(v_existing.visited_at, v_now),
    CASE WHEN p_status = 'in_progress' THEN p_next_follow_up_at ELSE NULL END,
    v_reasons,
    v_refusal_other,
    CASE WHEN p_status = 'signed' THEN v_owner_id ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_owner_name ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN COALESCE(v_existing.signed_at, v_now) ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_existing.signed_restaurant_id ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'plan_slug' ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'plan_name' ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'billing_period' ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'monthly_price_chf')::numeric ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'contract_value_chf')::numeric ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'acquisition_commission_rate')::numeric ELSE 0 END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'acquisition_commission_chf')::numeric ELSE 0 END,
    CASE WHEN p_status = 'signed' THEN 'pending_payment' ELSE 'not_applicable' END,
    NULL,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'commercial_compensation_mode' ELSE 'commission_only' END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'reservation_commission_rate')::numeric ELSE 0 END,
    CASE WHEN p_status = 'signed'
      THEN NULLIF(v_snapshot->>'reservation_commission_starts_at', '')::timestamptz
      ELSE NULL
    END,
    COALESCE(v_existing.created_at, v_now),
    v_now
  )
  ON CONFLICT (source_objectid) DO UPDATE
  SET status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      assigned_to = EXCLUDED.assigned_to,
      assigned_to_name = EXCLUDED.assigned_to_name,
      last_contacted_by = EXCLUDED.last_contacted_by,
      last_contacted_by_name = EXCLUDED.last_contacted_by_name,
      visited_at = COALESCE(public.commercial_prospect_followups.visited_at, EXCLUDED.visited_at),
      next_follow_up_at = EXCLUDED.next_follow_up_at,
      refusal_reason_codes = EXCLUDED.refusal_reason_codes,
      refusal_other_text = EXCLUDED.refusal_other_text,
      signed_by = EXCLUDED.signed_by,
      signed_by_name = EXCLUDED.signed_by_name,
      signed_at = EXCLUDED.signed_at,
      signed_restaurant_id = EXCLUDED.signed_restaurant_id,
      signed_subscription_plan_slug = EXCLUDED.signed_subscription_plan_slug,
      signed_subscription_plan_name = EXCLUDED.signed_subscription_plan_name,
      signed_subscription_billing_period = EXCLUDED.signed_subscription_billing_period,
      signed_subscription_monthly_price_chf = EXCLUDED.signed_subscription_monthly_price_chf,
      signed_subscription_contract_value_chf = EXCLUDED.signed_subscription_contract_value_chf,
      acquisition_commission_rate = EXCLUDED.acquisition_commission_rate,
      acquisition_commission_chf = EXCLUDED.acquisition_commission_chf,
      acquisition_commission_status = EXCLUDED.acquisition_commission_status,
      earned_at = EXCLUDED.earned_at,
      commercial_compensation_mode = EXCLUDED.commercial_compensation_mode,
      reservation_commission_rate = EXCLUDED.reservation_commission_rate,
      reservation_commission_starts_at = EXCLUDED.reservation_commission_starts_at,
      updated_at = EXCLUDED.updated_at
  WHERE public.commercial_prospect_followups.assigned_to IS NULL
    OR public.commercial_prospect_followups.assigned_to = v_actor_id
  RETURNING * INTO v_result;

  IF v_result.source_objectid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'prospect_claimed_by_another_commercial_reload_required';
  END IF;

  RETURN jsonb_build_object(
    'followup', to_jsonb(v_result),
    'commission_generated_chf', CASE
      WHEN v_result.status = 'signed' THEN v_result.acquisition_commission_chf
      ELSE 0
    END,
    'commission_status', v_result.acquisition_commission_status
  );
END;
$$;

-- The audited admin correction preserves the commercial billing-period
-- snapshot instead of silently downgrading annual contracts to monthly.
CREATE OR REPLACE FUNCTION public.admin_correct_commercial_signature(
  p_source_objectid bigint,
  p_plan_slug text,
  p_restaurant_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.commercial_prospect_followups%ROWTYPE;
  v_result public.commercial_prospect_followups%ROWTYPE;
  v_plan_slug text;
  v_restaurant_id uuid;
  v_billing_period text;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_snapshot jsonb;
  v_original_phase text;
BEGIN
  IF NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'super_admin_access_required';
  END IF;
  IF p_source_objectid IS NULL OR p_source_objectid <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_source_objectid';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 OR char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'admin_correction_reason_must_be_between_10_and_1000_characters';
  END IF;

  SELECT followup.* INTO v_existing
  FROM public.commercial_prospect_followups followup
  WHERE followup.source_objectid = p_source_objectid
  FOR UPDATE;
  IF NOT FOUND OR v_existing.status <> 'signed'::public.commercial_visit_status THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signed_commercial_prospect_required';
  END IF;

  v_plan_slug := lower(trim(COALESCE(
    NULLIF(p_plan_slug, ''), v_existing.signed_subscription_plan_slug, 'starter'
  )));
  v_restaurant_id := COALESCE(p_restaurant_id, v_existing.signed_restaurant_id);
  v_billing_period := lower(trim(COALESCE(
    v_existing.signed_subscription_billing_period, 'monthly'
  )));
  IF v_billing_period NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_existing_commercial_billing_period_snapshot';
  END IF;
  IF v_restaurant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.restaurants restaurant
    WHERE restaurant.id = v_restaurant_id
      AND NOT COALESCE(restaurant.is_demo, false)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'real_restaurant_required';
  END IF;

  v_snapshot := public.commercial_build_signature_snapshot(
    v_existing.signed_by,
    v_plan_slug,
    v_billing_period,
    v_existing.signed_at
  );
  v_original_phase := CASE
    WHEN v_existing.commercial_compensation_mode = 'fixed_plus_reservation' THEN 'engaged'
    ELSE 'sprint'
  END;
  PERFORM set_config('app.commercial_change_reason', v_reason, true);

  UPDATE public.commercial_prospect_followups followup
  SET signed_restaurant_id = v_restaurant_id,
      signed_subscription_plan_slug = v_snapshot->>'plan_slug',
      signed_subscription_plan_name = v_snapshot->>'plan_name',
      signed_subscription_billing_period = v_snapshot->>'billing_period',
      signed_subscription_monthly_price_chf = (v_snapshot->>'monthly_price_chf')::numeric,
      signed_subscription_contract_value_chf = (v_snapshot->>'contract_value_chf')::numeric,
      acquisition_commission_rate = 0,
      acquisition_commission_chf = public.commercial_signature_commission_chf(
        v_snapshot->>'plan_slug', v_original_phase
      ),
      updated_at = now()
  WHERE followup.source_objectid = p_source_objectid
  RETURNING * INTO v_result;

  RETURN jsonb_build_object('followup', to_jsonb(v_result));
END;
$$;

ALTER TABLE public.commercial_prospect_followups
  DROP CONSTRAINT IF EXISTS commercial_prospect_followups_signature_snapshot_check;
ALTER TABLE public.commercial_prospect_followups
  ADD CONSTRAINT commercial_prospect_followups_signature_snapshot_check CHECK (
    (
      status = 'signed'::public.commercial_visit_status
      AND signed_by IS NOT NULL
      AND signed_at IS NOT NULL
      AND signed_subscription_plan_slug IN ('starter', 'pro', 'premium', 'elite')
      AND NULLIF(trim(COALESCE(signed_subscription_plan_name, '')), '') IS NOT NULL
      AND signed_subscription_billing_period IN ('monthly', 'yearly')
      AND signed_subscription_monthly_price_chf > 0
      AND signed_subscription_contract_value_chf = signed_subscription_monthly_price_chf
        * CASE WHEN signed_subscription_billing_period = 'yearly' THEN 11 ELSE 1 END
      AND acquisition_commission_rate = 0
      AND acquisition_commission_chf >= 0
      AND commercial_compensation_mode IS NOT NULL
      AND reservation_commission_rate IS NOT NULL
      AND (
        (
          commercial_compensation_mode = 'commission_only'
          AND reservation_commission_rate = 0
          AND reservation_commission_starts_at IS NULL
        )
        OR (
          commercial_compensation_mode = 'fixed_plus_reservation'
          AND reservation_commission_rate = 0.02
          AND reservation_commission_starts_at IS NOT NULL
        )
      )
    )
    OR (
      status <> 'signed'::public.commercial_visit_status
      AND signed_by IS NULL
      AND signed_at IS NULL
      AND signed_restaurant_id IS NULL
      AND signed_subscription_plan_slug IS NULL
      AND signed_subscription_plan_name IS NULL
      AND signed_subscription_billing_period IS NULL
      AND signed_subscription_monthly_price_chf IS NULL
      AND signed_subscription_contract_value_chf IS NULL
      AND acquisition_commission_rate = 0
      AND acquisition_commission_chf = 0
      AND commercial_compensation_mode = 'commission_only'
      AND reservation_commission_rate = 0
      AND reservation_commission_starts_at IS NULL
    )
  );

-- Annual billing does not annualize monthly product entitlements. Preserve the
-- existing response contract and constrain its usage query to one Swiss civil
-- month, itself bounded by the annual Stripe service period.
ALTER FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
  RENAME TO get_restaurant_credit_usage_before_fair_growth;

CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage(
  p_restaurant_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subscription record;
  v_anchor timestamptz := COALESCE(
    p_since,
    p_until - interval '1 microsecond',
    now()
  );
  v_civil_start timestamptz;
  v_civil_end timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_result jsonb;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurant_id_required';
  END IF;
  IF p_since IS NOT NULL AND p_until IS NOT NULL AND p_until <= p_since THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_entitlement_window';
  END IF;

  SELECT subscription.billing_period,
         subscription.current_period_start,
         subscription.current_period_end
  INTO v_subscription
  FROM public.restaurant_ai_subscriptions subscription
  WHERE subscription.restaurant_id = p_restaurant_id
  ORDER BY
    CASE WHEN subscription.status IN ('trialing', 'active') THEN 0 ELSE 1 END,
    subscription.current_period_end DESC NULLS LAST,
    subscription.created_at DESC
  LIMIT 1;

  IF COALESCE(v_subscription.billing_period, 'monthly') <> 'yearly' THEN
    RETURN public.get_restaurant_credit_usage_before_fair_growth(
      p_restaurant_id, p_since, p_until
    );
  END IF;
  IF v_subscription.current_period_start IS NULL OR v_subscription.current_period_end IS NULL
    OR v_subscription.current_period_end <= v_subscription.current_period_start
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'annual_subscription_service_period_required';
  END IF;

  v_civil_start := (
    date_trunc('month', v_anchor AT TIME ZONE 'Europe/Zurich')
    AT TIME ZONE 'Europe/Zurich'
  );
  v_civil_end := (
    (date_trunc('month', v_anchor AT TIME ZONE 'Europe/Zurich') + interval '1 month')
    AT TIME ZONE 'Europe/Zurich'
  );
  v_period_start := greatest(
    v_civil_start,
    v_subscription.current_period_start
  );
  v_period_end := least(
    v_civil_end,
    v_subscription.current_period_end
  );
  IF v_period_end <= v_period_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'annual_entitlement_window_outside_service_period';
  END IF;

  v_result := public.get_restaurant_credit_usage_before_fair_growth(
    p_restaurant_id, v_period_start, v_period_end
  );
  RETURN jsonb_set(
    v_result,
    '{period,entitlement_reset}',
    to_jsonb('civil_month'::text),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_credit_usage_before_fair_growth(
  uuid, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Commercial demo OpenAI kill switch and atomic daily cost reservation
-- ---------------------------------------------------------------------------

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'commercial-demo-openai',
  'Assistant OpenAI de demonstration commerciale',
  'Kill switch serveur pour les nouveaux appels OpenAI de la demonstration commerciale.',
  true
)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    updated_at = now();

ALTER TABLE public.commercial_demo_ai_requests
  ADD COLUMN IF NOT EXISTS budget_reserved_chf numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_attempt_count integer NOT NULL DEFAULT 1;

ALTER TABLE public.commercial_demo_ai_requests
  DROP CONSTRAINT IF EXISTS commercial_demo_ai_requests_budget_reserved_check;
ALTER TABLE public.commercial_demo_ai_requests
  ADD CONSTRAINT commercial_demo_ai_requests_budget_reserved_check CHECK (
    budget_reserved_chf >= 0
    AND upper(budget_reserved_chf::text) NOT IN ('NAN', 'INFINITY', '-INFINITY')
  );
ALTER TABLE public.commercial_demo_ai_requests
  DROP CONSTRAINT IF EXISTS commercial_demo_ai_requests_provider_attempt_count_check;
ALTER TABLE public.commercial_demo_ai_requests
  ADD CONSTRAINT commercial_demo_ai_requests_provider_attempt_count_check CHECK (
    provider_attempt_count >= 1
  );
ALTER TABLE public.commercial_demo_ai_requests
  DROP CONSTRAINT IF EXISTS commercial_demo_ai_requests_estimated_cost_finite_check;
ALTER TABLE public.commercial_demo_ai_requests
  ADD CONSTRAINT commercial_demo_ai_requests_estimated_cost_finite_check CHECK (
    upper(estimated_cost_chf::text) NOT IN ('NAN', 'INFINITY', '-INFINITY')
  );

UPDATE public.commercial_demo_ai_requests request
SET budget_reserved_chf = GREATEST(
      request.budget_reserved_chf,
      request.estimated_cost_chf,
      request.provider_attempt_count
        * CASE request.action WHEN 'visual_generate' THEN 0.50 ELSE 0.10 END
    )
WHERE request.budget_reserved_chf IS DISTINCT FROM GREATEST(
  request.budget_reserved_chf,
  request.estimated_cost_chf,
  request.provider_attempt_count
    * CASE request.action WHEN 'visual_generate' THEN 0.50 ELSE 0.10 END
);

CREATE INDEX IF NOT EXISTS commercial_demo_ai_requests_commercial_day_budget_idx
  ON public.commercial_demo_ai_requests (commercial_user_id, created_at);
CREATE INDEX IF NOT EXISTS commercial_demo_ai_requests_global_day_budget_idx
  ON public.commercial_demo_ai_requests (created_at);

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_claim_request(
  p_request_id uuid,
  p_session_id uuid,
  p_actor_user_id uuid,
  p_commercial_user_id uuid,
  p_demo_restaurant_id uuid,
  p_action text,
  p_tool text,
  p_payload_hash text,
  p_lock_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.commercial_demo_ai_requests%ROWTYPE;
  v_session_ok boolean := false;
  v_global_processing integer := 0;
  v_session_processing integer := 0;
  v_provider_failures integer := 0;
  v_now timestamptz := now();
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_retry_after_seconds integer;
  v_minimum_reservation_chf numeric;
  v_request_reservation_chf numeric;
  v_commercial_calls bigint := 0;
  v_global_calls bigint := 0;
  v_commercial_budget_chf numeric := 0;
  v_global_budget_chf numeric := 0;
  v_is_new boolean := false;
  v_was_failed boolean := false;
  v_feature_enabled boolean := false;
BEGIN
  IF p_request_id IS NULL OR p_session_id IS NULL OR p_actor_user_id IS NULL
     OR p_commercial_user_id IS NULL OR p_demo_restaurant_id IS NULL OR p_lock_token IS NULL
     OR COALESCE(p_payload_hash, '') !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid commercial demo AI claim' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    (p_action = 'chat' AND p_tool IN ('assistant', 'support_chat'))
    OR
    (p_action = 'visual_generate'
      AND p_tool IN ('marketing_studio', 'photo_studio', 'advisor_visual'))
  ) THEN
    RAISE EXCEPTION 'invalid commercial demo AI action/tool' USING ERRCODE = '22023';
  END IF;

  v_minimum_reservation_chf := CASE
    WHEN p_action = 'visual_generate' THEN 0.50
    ELSE 0.10
  END;
  v_day_start := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_day_end := v_day_start + interval '1 day';
  v_retry_after_seconds := GREATEST(
    1,
    ceil(extract(epoch FROM (v_day_end - v_now)))::integer
  );

  SELECT true INTO v_session_ok
  FROM public.commercial_demo_order_sessions session
  JOIN public.commercial_demo_accounts account
    ON account.user_id = session.commercial_user_id
   AND account.demo_restaurant_id = session.demo_restaurant_id
   AND account.is_active
  JOIN public.restaurants restaurant
    ON restaurant.id = session.demo_restaurant_id
   AND restaurant.is_demo
  WHERE session.id = p_session_id
    AND session.status = 'active'
    AND session.commercial_user_id = p_commercial_user_id
    AND session.commercial_user_id = p_actor_user_id
    AND session.demo_restaurant_id = p_demo_restaurant_id
  FOR UPDATE OF session, account, restaurant;
  IF COALESCE(v_session_ok, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'commercial demo AI session is not active or mapped' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-request:' || p_request_id::text, 0)
  );
  -- This single lock serializes idempotency resolution, call counters and both
  -- cost budgets across every commercial and session.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-global-claim', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-session:' || p_session_id::text, 0)
  );

  SELECT request.* INTO v_existing
  FROM public.commercial_demo_ai_requests request
  WHERE request.request_id = p_request_id
  FOR UPDATE;
  v_is_new := v_existing.id IS NULL;
  v_feature_enabled := COALESCE(
    public.is_feature_flag_active('commercial-demo-openai'), false
  );

  IF NOT v_is_new THEN
    IF v_existing.session_id <> p_session_id
       OR v_existing.commercial_user_id <> p_commercial_user_id
       OR v_existing.demo_restaurant_id <> p_demo_restaurant_id
       OR v_existing.action <> p_action
       OR v_existing.tool <> p_tool
       OR v_existing.payload_hash <> p_payload_hash
    THEN
      RETURN jsonb_build_object('state', 'mismatch');
    END IF;
    IF NOT v_feature_enabled THEN
      RETURN jsonb_build_object('state', 'disabled', 'feature', 'commercial-demo-openai');
    END IF;
    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object(
        'state', 'replay',
        'response', v_existing.response,
        'request_id', v_existing.request_id
      );
    END IF;
    IF v_existing.status = 'processing'
      AND v_existing.locked_at > v_now - interval '3 minutes'
    THEN
      RETURN jsonb_build_object(
        'state', 'in_progress',
        'request_id', v_existing.request_id
      );
    END IF;
    IF v_existing.status NOT IN ('failed', 'processing') THEN
      RETURN jsonb_build_object('state', 'mismatch');
    END IF;
    v_was_failed := v_existing.status = 'failed';
    v_request_reservation_chf := GREATEST(
      v_existing.budget_reserved_chf,
      v_existing.estimated_cost_chf
    ) + v_minimum_reservation_chf;
  ELSE
    v_request_reservation_chf := v_minimum_reservation_chf;
  END IF;

  -- Replays bypass daily quota consumption, but never bypass the server kill switch.
  IF NOT v_feature_enabled THEN
    RETURN jsonb_build_object('state', 'disabled', 'feature', 'commercial-demo-openai');
  END IF;

  UPDATE public.commercial_demo_ai_requests request
  SET status = 'failed',
      error_code = 'request_abandoned',
      completed_at = v_now,
      updated_at = v_now
  WHERE request.status = 'processing'
    AND request.locked_at <= v_now - interval '3 minutes';

  SELECT count(*) INTO v_provider_failures
  FROM public.commercial_demo_ai_provider_failures failure
  WHERE failure.occurred_at > v_now - interval '90 seconds';
  IF v_provider_failures >= 6 THEN
    RETURN jsonb_build_object('state', 'circuit_open', 'retry_after_seconds', 90);
  END IF;

  SELECT count(*) INTO v_global_processing
  FROM public.commercial_demo_ai_requests request
  WHERE request.status = 'processing'
    AND request.request_id <> p_request_id
    AND request.locked_at > v_now - interval '3 minutes';
  SELECT count(*) INTO v_session_processing
  FROM public.commercial_demo_ai_requests request
  WHERE request.status = 'processing'
    AND request.request_id <> p_request_id
    AND request.session_id = p_session_id
    AND request.locked_at > v_now - interval '3 minutes';
  IF v_global_processing >= 12 OR v_session_processing >= 2 THEN
    RETURN jsonb_build_object('state', 'busy', 'retry_after_seconds', 5);
  END IF;

  SELECT COALESCE(sum(request.provider_attempt_count), 0), COALESCE(sum(GREATEST(
    request.budget_reserved_chf,
    request.estimated_cost_chf,
    request.provider_attempt_count
      * CASE request.action WHEN 'visual_generate' THEN 0.50 ELSE 0.10 END
  )), 0)
  INTO v_commercial_calls, v_commercial_budget_chf
  FROM public.commercial_demo_ai_requests request
  WHERE request.commercial_user_id = p_commercial_user_id
    AND request.created_at >= v_day_start
    AND request.created_at < v_day_end;

  SELECT COALESCE(sum(request.provider_attempt_count), 0), COALESCE(sum(GREATEST(
    request.budget_reserved_chf,
    request.estimated_cost_chf,
    request.provider_attempt_count
      * CASE request.action WHEN 'visual_generate' THEN 0.50 ELSE 0.10 END
  )), 0)
  INTO v_global_calls, v_global_budget_chf
  FROM public.commercial_demo_ai_requests request
  WHERE request.created_at >= v_day_start
    AND request.created_at < v_day_end;

  IF v_commercial_calls + 1 > 60
    OR v_commercial_budget_chf + v_minimum_reservation_chf > 10.00
  THEN
    RETURN jsonb_build_object(
      'state', 'budget_exhausted',
      'scope', 'commercial',
      'retry_after_seconds', v_retry_after_seconds,
      'calls_used', v_commercial_calls,
      'budget_reserved_chf', v_commercial_budget_chf,
      'budget_limit_chf', 10.00
    );
  END IF;
  IF v_global_calls + 1 > 600
    OR v_global_budget_chf + v_minimum_reservation_chf > 100.00
  THEN
    RETURN jsonb_build_object(
      'state', 'budget_exhausted',
      'scope', 'global',
      'retry_after_seconds', v_retry_after_seconds,
      'calls_used', v_global_calls,
      'budget_reserved_chf', v_global_budget_chf,
      'budget_limit_chf', 100.00
    );
  END IF;

  IF NOT v_is_new THEN
    UPDATE public.commercial_demo_ai_requests request
    SET actor_user_id = p_actor_user_id,
        status = 'processing',
        lock_token = p_lock_token,
        response = NULL,
        error_code = NULL,
        model = NULL,
        provider_response_id = NULL,
        input_tokens = 0,
        output_tokens = 0,
        total_tokens = 0,
        estimated_cost_chf = 0,
        budget_reserved_chf = v_request_reservation_chf,
        provider_attempt_count = request.provider_attempt_count + 1,
        locked_at = v_now,
        completed_at = NULL,
        updated_at = v_now
    WHERE request.id = v_existing.id;
    RETURN jsonb_build_object(
      'state', 'claimed',
      'request_id', p_request_id,
      'retry_after_failure', v_was_failed,
      'recovered_stale_lock', NOT v_was_failed,
      'budget_reserved_chf', v_request_reservation_chf
    );
  END IF;

  INSERT INTO public.commercial_demo_ai_requests (
    request_id, session_id, commercial_user_id, demo_restaurant_id,
    actor_user_id, action, tool, payload_hash, lock_token,
    budget_reserved_chf, provider_attempt_count
  ) VALUES (
    p_request_id, p_session_id, p_commercial_user_id, p_demo_restaurant_id,
    p_actor_user_id, p_action, p_tool, p_payload_hash, p_lock_token,
    v_request_reservation_chf, 1
  );
  RETURN jsonb_build_object(
    'state', 'claimed',
    'request_id', p_request_id,
    'budget_reserved_chf', v_request_reservation_chf
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commercial_demo_ai_claim_request(
  uuid, uuid, uuid, uuid, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_claim_request(
  uuid, uuid, uuid, uuid, uuid, text, text, text, uuid
) TO service_role;

DO $fair_growth_commercial_demo_ai_assertions$
DECLARE
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.feature_flags flag
    WHERE flag.name = 'commercial-demo-openai'
  ) THEN
    RAISE EXCEPTION 'commercial-demo-openai kill switch must exist after migration';
  END IF;
  SELECT pg_get_functiondef(
    'public.commercial_demo_ai_claim_request(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid)'::regprocedure
  ) INTO v_definition;
  IF position('budget_exhausted' IN v_definition) = 0
    OR position('commercial-demo-ai-global-claim' IN v_definition) = 0
    OR position('commercial-demo-openai' IN v_definition) = 0
    OR position('provider_attempt_count' IN v_definition) = 0
    OR position('v_commercial_calls + 1 > 60' IN v_definition) = 0
    OR position('v_global_calls + 1 > 600' IN v_definition) = 0
    OR position('provider_attempt_count = request.provider_attempt_count + 1' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'commercial demo AI budget guards are incomplete';
  END IF;
END;
$fair_growth_commercial_demo_ai_assertions$;

COMMIT;
