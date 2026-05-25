-- Align database defaults with the campaign strategy planner.
-- The application and Edge Functions use the conversion strategy as the default
-- paid campaign pricing: 9.50 CHF CPM, 0.95 CHF CPC, 7.50 CHF CPA.

ALTER TABLE public.ad_campaigns
  ALTER COLUMN pricing_strategy SET DEFAULT 'conversion',
  ALTER COLUMN cpm_rate SET DEFAULT 9.50,
  ALTER COLUMN cpc_rate SET DEFAULT 0.95,
  ALTER COLUMN conversion_rate SET DEFAULT 7.50;

UPDATE public.ad_campaigns
SET
  cpm_rate = 9.50,
  cpc_rate = 0.95,
  conversion_rate = 7.50,
  updated_at = now()
WHERE pricing_strategy = 'conversion'
  AND COALESCE(payment_status, 'unpaid') <> 'paid'
  AND (
    COALESCE(cpm_rate, 0) = 0
    OR COALESCE(cpc_rate, 0) = 0
    OR COALESCE(conversion_rate, 0) = 0
    OR (cpm_rate = 8.00 AND cpc_rate = 0.85 AND conversion_rate = 9.00)
  );

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
    NEW.pricing_strategy := COALESCE(NULLIF(NEW.pricing_strategy, ''), 'conversion');
    NEW.cpm_rate := COALESCE(NULLIF(NEW.cpm_rate, 0), 9.50);
    NEW.cpc_rate := COALESCE(NULLIF(NEW.cpc_rate, 0), 0.95);
    NEW.conversion_rate := COALESCE(NULLIF(NEW.conversion_rate, 0), 7.50);
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
