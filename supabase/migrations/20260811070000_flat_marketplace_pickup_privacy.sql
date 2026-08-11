-- Public commercial model (August 2026):
-- - marketplace takeaway orders: 90% restaurant / 10% TOK for every plan;
-- - honored reservation: CHF 5 flat, no revenue percentage cap;
-- - delivery/courier surfaces disabled; takeaway remains enabled;
-- - internal TOK allocation remains server/admin-only.

UPDATE public.restaurant_subscription_plans
SET marketplace_commission_bps = 1000,
    reservation_revenue_cap_bps = 0,
    pricing_version = 'flat_marketplace_2026_08',
    updated_at = now()
WHERE marketplace_commission_bps IS DISTINCT FROM 1000
   OR reservation_revenue_cap_bps IS DISTINCT FROM 0
   OR pricing_version IS DISTINCT FROM 'flat_marketplace_2026_08';

-- Existing live entitlements adopt the new public commission for future orders.
-- Historical payment attempts and ledger entries retain their sealed snapshots.
UPDATE public.restaurant_ai_subscriptions
SET marketplace_commission_bps_snapshot = 1000,
    reservation_revenue_cap_bps_snapshot = 0,
    pricing_version_snapshot = 'flat_marketplace_2026_08',
    updated_at = now()
WHERE status IN ('trialing', 'active', 'past_due', 'paused')
  AND (
    marketplace_commission_bps_snapshot IS DISTINCT FROM 1000
    OR reservation_revenue_cap_bps_snapshot IS DISTINCT FROM 0
    OR pricing_version_snapshot IS DISTINCT FROM 'flat_marketplace_2026_08'
  );

UPDATE public.finance_runtime_config
SET platform_fee_bps = 1000,
    updated_at = now()
WHERE config_key = 'default'
  AND platform_fee_bps IS DISTINCT FROM 1000;

-- Delivery and courier are dormant. Takeaway ordering remains a separate,
-- explicitly enabled physical-goods flow.
UPDATE public.feature_flags
SET is_active = false,
    updated_at = now()
WHERE name IN (
  'livraison',
  'espace-livreur',
  'courier-home',
  'courier-jobs',
  'courier-notifications',
  'courier-earnings',
  'courier-profile',
  'creneaux-garantis',
  'flex-prix-bas',
  'match-groupes',
  'multi-stop',
  'garantie-qualite',
  'abonnement'
)
AND is_active IS DISTINCT FROM false;

UPDATE public.feature_flags
SET is_active = true,
    updated_at = now()
WHERE name IN ('emporter', 'commandes')
  AND is_active IS DISTINCT FROM true;

-- Internal developer allocation is not a public pricing attribute. The plan
-- table stays publicly readable only for columns intended for product display.
REVOKE SELECT ON TABLE public.restaurant_subscription_plans FROM anon, authenticated;
GRANT SELECT (
  id,
  slug,
  name,
  description,
  price_monthly_chf,
  currency,
  campaign_credit_chf,
  ai_tool_credits,
  ai_photo_credits,
  monthly_conversation_limit,
  monthly_text_tool_limit,
  monthly_image_limit,
  monthly_premium_image_limit,
  monthly_voice_minutes_limit,
  features,
  is_active,
  position,
  created_at,
  updated_at,
  public_name,
  acquired_reservation_fee_cents,
  marketplace_commission_bps,
  included_establishments,
  additional_establishment_price_cents,
  annual_months_charged,
  reservation_revenue_cap_bps,
  pricing_version
) ON public.restaurant_subscription_plans TO anon, authenticated;

-- Restaurant subscription rows contain payment provider identifiers, internal
-- reconciliation metadata and internal revenue-allocation snapshots. Owners
-- receive a dedicated safe RPC instead of raw table SELECT access.
DROP POLICY IF EXISTS restaurant_ai_subscriptions_owner_admin_select
  ON public.restaurant_ai_subscriptions;

DROP POLICY IF EXISTS restaurant_ai_subscriptions_admin_select
  ON public.restaurant_ai_subscriptions;
CREATE POLICY restaurant_ai_subscriptions_admin_select
  ON public.restaurant_ai_subscriptions
  FOR SELECT TO authenticated
  USING (public.auth_is_admin());

CREATE OR REPLACE FUNCTION public.get_my_restaurant_ai_subscriptions(
  p_restaurant_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
  plan text,
  status text,
  monthly_conversation_limit integer,
  monthly_text_tool_limit integer,
  monthly_image_limit integer,
  monthly_premium_image_limit integer,
  monthly_voice_minutes_limit integer,
  started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  restaurant_subscription_plan_id uuid,
  billing_period text,
  monthly_campaign_credit_chf numeric,
  monthly_ai_tool_credits integer,
  monthly_photo_retouch_credits integer,
  cancel_at_period_end boolean,
  scheduled_plan_change jsonb,
  price_monthly_chf_snapshot numeric,
  currency text,
  billing_amount_chf_snapshot numeric,
  price_monthly_cents_snapshot integer,
  billing_amount_cents_snapshot integer,
  billing_net_cents_snapshot integer,
  billing_vat_cents_snapshot integer,
  vat_rate_bps_snapshot integer,
  annual_months_charged_snapshot integer,
  acquired_reservation_fee_cents_snapshot integer,
  marketplace_commission_bps_snapshot integer,
  included_establishments_snapshot integer,
  additional_establishment_price_cents_snapshot integer,
  reservation_revenue_cap_bps_snapshot integer,
  pricing_version_snapshot text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    s.id,
    s.restaurant_id,
    s.plan,
    s.status,
    s.monthly_conversation_limit,
    s.monthly_text_tool_limit,
    s.monthly_image_limit,
    s.monthly_premium_image_limit,
    s.monthly_voice_minutes_limit,
    s.started_at,
    s.current_period_start,
    s.current_period_end,
    s.created_at,
    s.updated_at,
    s.restaurant_subscription_plan_id,
    s.billing_period,
    s.monthly_campaign_credit_chf,
    s.monthly_ai_tool_credits,
    s.monthly_photo_retouch_credits,
    s.cancel_at_period_end,
    s.scheduled_plan_change,
    s.price_monthly_chf_snapshot,
    s.currency,
    s.billing_amount_chf_snapshot,
    s.price_monthly_cents_snapshot,
    s.billing_amount_cents_snapshot,
    s.billing_net_cents_snapshot,
    s.billing_vat_cents_snapshot,
    s.vat_rate_bps_snapshot,
    s.annual_months_charged_snapshot,
    s.acquired_reservation_fee_cents_snapshot,
    s.marketplace_commission_bps_snapshot,
    s.included_establishments_snapshot,
    s.additional_establishment_price_cents_snapshot,
    s.reservation_revenue_cap_bps_snapshot,
    s.pricing_version_snapshot
  FROM public.restaurant_ai_subscriptions s
  WHERE auth.uid() IS NOT NULL
    AND (public.auth_owns_restaurant(s.restaurant_id) OR public.auth_is_admin())
    AND (p_restaurant_ids IS NULL OR s.restaurant_id = ANY (p_restaurant_ids));
$$;

REVOKE ALL ON FUNCTION public.get_my_restaurant_ai_subscriptions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_restaurant_ai_subscriptions(uuid[]) TO authenticated;

-- Reservation accounting contains internal allocation fields. Restaurateurs use
-- invoices/public breakdowns; only admins/server may read the raw ledger rows.
DROP POLICY IF EXISTS reservation_fee_charges_owner_read
  ON public.reservation_fee_charges;
DROP POLICY IF EXISTS reservation_fee_adjustments_owner_read
  ON public.reservation_fee_adjustments;

DROP POLICY IF EXISTS reservation_fee_charges_admin_select
  ON public.reservation_fee_charges;
CREATE POLICY reservation_fee_charges_admin_select
  ON public.reservation_fee_charges
  FOR SELECT TO authenticated
  USING (public.auth_is_admin());

DROP POLICY IF EXISTS reservation_fee_adjustments_admin_select
  ON public.reservation_fee_adjustments;
CREATE POLICY reservation_fee_adjustments_admin_select
  ON public.reservation_fee_adjustments
  FOR SELECT TO authenticated
  USING (public.auth_is_admin());

-- Keep compatibility with already-sealed July payment attempts while accepting
-- the new flat-pricing snapshots for all new marketplace orders.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'record_marketplace_checkout_ledger'
  ORDER BY p.oid DESC
  LIMIT 1;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'record_marketplace_checkout_ledger not found';
  END IF;

  v_old := $old$COALESCE(v_sealed_metadata ->> 'pricing_version', '') <> 'fair_growth_2026_07'$old$;
  v_new := $new$COALESCE(v_sealed_metadata ->> 'pricing_version', '') NOT IN ('fair_growth_2026_07', 'flat_marketplace_2026_08')$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'pricing-version guard signature changed';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$OR v_platform_fee_bps <> (CASE COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '')
            WHEN 'starter' THEN 990
            WHEN 'business' THEN 890
            WHEN 'pro' THEN 890
            WHEN 'premium' THEN 790
            WHEN 'elite' THEN 690
            WHEN '' THEN 990
            ELSE -1
          END)$old$;
  v_new := $new$OR (
            COALESCE(v_sealed_metadata ->> 'pricing_version', '') = 'flat_marketplace_2026_08'
            AND v_platform_fee_bps <> 1000
          )
          OR (
            COALESCE(v_sealed_metadata ->> 'pricing_version', '') = 'fair_growth_2026_07'
            AND v_platform_fee_bps <> (CASE COALESCE(v_sealed_metadata ->> 'pricing_plan_slug', '')
              WHEN 'starter' THEN 990
              WHEN 'business' THEN 890
              WHEN 'pro' THEN 890
              WHEN 'premium' THEN 790
              WHEN 'elite' THEN 690
              WHEN '' THEN 990
              ELSE -1
            END)
          )$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'legacy plan-rate guard signature changed';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$OR v_platform_fee_bps <> 990
            )$old$;
  v_new := $new$OR (
                COALESCE(v_sealed_metadata ->> 'pricing_version', '') = 'flat_marketplace_2026_08'
                AND v_platform_fee_bps <> 1000
              )
              OR (
                COALESCE(v_sealed_metadata ->> 'pricing_version', '') = 'fair_growth_2026_07'
                AND v_platform_fee_bps <> 990
              )
            )$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'runtime-default rate guard signature changed';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_definition := replace(
    v_definition,
    $old$ELSE COALESCE(p_metadata ->> 'pricing_version', 'fair_growth_2026_07')$old$,
    $new$ELSE COALESCE(p_metadata ->> 'pricing_version', 'flat_marketplace_2026_08')$new$
  );

  EXECUTE v_definition;
END
$migration$;
