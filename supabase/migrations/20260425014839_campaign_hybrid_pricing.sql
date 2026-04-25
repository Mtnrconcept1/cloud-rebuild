ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS cpc_rate numeric NOT NULL DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS conversion_rate numeric NOT NULL DEFAULT 9.00;

COMMENT ON COLUMN public.ad_campaigns.cpm_rate IS 'Cost per 1000 impressions in CHF';
COMMENT ON COLUMN public.ad_campaigns.cpc_rate IS 'Cost per click in CHF';
COMMENT ON COLUMN public.ad_campaigns.conversion_rate IS 'Cost per conversion in CHF';

UPDATE public.ad_campaigns
SET
  cpm_rate = COALESCE(NULLIF(cpm_rate, 0), 8.00),
  cpc_rate = COALESCE(NULLIF(cpc_rate, 0), 0.85),
  conversion_rate = COALESCE(NULLIF(conversion_rate, 0), 9.00)
WHERE true;

CREATE OR REPLACE FUNCTION public.record_ad_campaign_event(
  p_campaign_id uuid,
  p_restaurant_id uuid,
  p_event_type text,
  p_dedupe_key text,
  p_user_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_page text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_conversion_type text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rows integer := 0;
  v_cost numeric := 0;
  v_campaign record;
  v_today date := CURRENT_DATE;
  v_effective_daily_spent numeric := 0;
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'conversion') THEN
    RAISE EXCEPTION 'Invalid campaign event type: %', p_event_type;
  END IF;

  IF p_event_type <> 'conversion' THEN
    p_conversion_type := NULL;
  ELSIF p_conversion_type IS NOT NULL AND p_conversion_type NOT IN ('order', 'reservation', 'zero-attente') THEN
    RAISE EXCEPTION 'Invalid conversion type: %', p_conversion_type;
  END IF;

  SELECT
    id,
    restaurant_id,
    total_budget,
    spent,
    budget_daily,
    daily_spent,
    daily_spent_date,
    cpm_rate,
    cpc_rate,
    conversion_rate
  INTO v_campaign
  FROM public.ad_campaigns
  WHERE id = p_campaign_id
    AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(v_campaign.total_budget, 0) > 0 THEN
    IF p_event_type = 'impression' THEN
      v_cost := ROUND(COALESCE(v_campaign.cpm_rate, 8.00) / 1000.0, 6);
    ELSIF p_event_type = 'click' THEN
      v_cost := ROUND(COALESCE(v_campaign.cpc_rate, 0.85), 6);
    ELSIF p_event_type = 'conversion' THEN
      v_cost := ROUND(COALESCE(v_campaign.conversion_rate, 9.00), 6);
    END IF;
  END IF;

  v_effective_daily_spent := CASE
    WHEN v_campaign.daily_spent_date = v_today THEN COALESCE(v_campaign.daily_spent, 0)
    ELSE 0
  END;

  IF COALESCE(v_campaign.total_budget, 0) > 0
    AND (COALESCE(v_campaign.spent, 0) + v_cost) > COALESCE(v_campaign.total_budget, 0) THEN
    RETURN false;
  END IF;

  IF COALESCE(v_campaign.budget_daily, 0) > 0
    AND (v_effective_daily_spent + v_cost) > COALESCE(v_campaign.budget_daily, 0) THEN
    RETURN false;
  END IF;

  INSERT INTO public.ad_campaign_events (
    campaign_id,
    restaurant_id,
    event_type,
    conversion_type,
    user_id,
    dedupe_key,
    source,
    page,
    payload
  )
  VALUES (
    p_campaign_id,
    p_restaurant_id,
    p_event_type,
    p_conversion_type,
    p_user_id,
    p_dedupe_key,
    p_source,
    p_page,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (campaign_id, event_type, dedupe_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.ad_campaigns
  SET
    impressions = COALESCE(impressions, 0) + CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END,
    clicks = COALESCE(clicks, 0) + CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
    conversions = COALESCE(conversions, 0) + CASE WHEN p_event_type = 'conversion' THEN 1 ELSE 0 END,
    spent = COALESCE(spent, 0) + v_cost,
    daily_spent = CASE
      WHEN daily_spent_date <> v_today THEN v_cost
      ELSE COALESCE(daily_spent, 0) + v_cost
    END,
    daily_spent_date = v_today,
    updated_at = now()
  WHERE id = p_campaign_id
    AND restaurant_id = p_restaurant_id;

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_ad_campaign_client_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.payment_status, 'unpaid') = 'paid' THEN
      RAISE EXCEPTION 'Le statut de paiement est gere cote serveur.';
    END IF;

    IF COALESCE(NEW.total_budget, 0) > 0 AND COALESCE(NEW.status, 'draft') = 'active' THEN
      RAISE EXCEPTION 'Une campagne payante ne peut etre activee sans paiement verifie.';
    END IF;

    NEW.spent := 0;
    NEW.impressions := 0;
    NEW.clicks := 0;
    NEW.conversions := 0;
    NEW.paid_amount := 0;
    NEW.stripe_checkout_session_id := NULL;
    NEW.stripe_payment_intent_id := NULL;
    NEW.activated_at := NULL;
    NEW.cpm_rate := COALESCE(NULLIF(NEW.cpm_rate, 0), 8.00);
    NEW.cpc_rate := COALESCE(NULLIF(NEW.cpc_rate, 0), 0.85);
    NEW.conversion_rate := COALESCE(NULLIF(NEW.conversion_rate, 0), 9.00);
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN
    RAISE EXCEPTION 'Le restaurant de la campagne ne peut pas etre modifie.';
  END IF;

  IF NEW.impressions IS DISTINCT FROM OLD.impressions
    OR NEW.clicks IS DISTINCT FROM OLD.clicks
    OR NEW.conversions IS DISTINCT FROM OLD.conversions
    OR NEW.spent IS DISTINCT FROM OLD.spent
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
    OR NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id
    OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
    OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
    OR NEW.cpm_rate IS DISTINCT FROM OLD.cpm_rate
    OR NEW.cpc_rate IS DISTINCT FROM OLD.cpc_rate
    OR NEW.conversion_rate IS DISTINCT FROM OLD.conversion_rate THEN
    RAISE EXCEPTION 'Les indicateurs financiers, paiements et tarifs sont geres cote serveur.';
  END IF;

  IF COALESCE(NEW.total_budget, 0) > 0
    AND COALESCE(NEW.payment_status, OLD.payment_status, 'unpaid') <> 'paid'
    AND COALESCE(NEW.status, 'draft') = 'active' THEN
    RAISE EXCEPTION 'Une campagne payante ne peut etre activee sans paiement verifie.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
