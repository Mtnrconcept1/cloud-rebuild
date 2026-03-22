-- ============================================================
-- Migration: Campaign Pool Delivery System
-- Adds CPM-based budget consumption, daily spend tracking,
-- and updates record_ad_campaign_event to debit budget atomically
-- ============================================================

-- 1. Add new columns to ad_campaigns
ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS cpm_rate numeric NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS daily_spent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_spent_date date NOT NULL DEFAULT CURRENT_DATE;

COMMENT ON COLUMN public.ad_campaigns.cpm_rate IS 'Cost per 1000 impressions in CHF';
COMMENT ON COLUMN public.ad_campaigns.daily_spent IS 'Running total of spend for the current day';
COMMENT ON COLUMN public.ad_campaigns.daily_spent_date IS 'Date corresponding to daily_spent; resets when date changes';

-- 2. Update record_ad_campaign_event to debit budget on impression
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
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'conversion') THEN
    RAISE EXCEPTION 'Invalid campaign event type: %', p_event_type;
  END IF;

  IF p_event_type <> 'conversion' THEN
    p_conversion_type := NULL;
  ELSIF p_conversion_type IS NOT NULL AND p_conversion_type NOT IN ('order', 'reservation', 'zero-attente') THEN
    RAISE EXCEPTION 'Invalid conversion type: %', p_conversion_type;
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

  -- Compute impression cost (CPM model)
  IF p_event_type = 'impression' THEN
    SELECT ROUND(COALESCE(cpm_rate, 5.00) / 1000.0, 6)
    INTO v_cost
    FROM public.ad_campaigns
    WHERE id = p_campaign_id;
  END IF;

  UPDATE public.ad_campaigns
  SET
    impressions = COALESCE(impressions, 0) + CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END,
    clicks = COALESCE(clicks, 0) + CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
    conversions = COALESCE(conversions, 0) + CASE WHEN p_event_type = 'conversion' THEN 1 ELSE 0 END,
    spent = COALESCE(spent, 0) + v_cost,
    daily_spent = CASE
      WHEN daily_spent_date <> CURRENT_DATE THEN v_cost
      ELSE COALESCE(daily_spent, 0) + v_cost
    END,
    daily_spent_date = CURRENT_DATE,
    updated_at = now()
  WHERE id = p_campaign_id
    AND restaurant_id = p_restaurant_id;

  RETURN true;
END;
$function$;

-- Maintain existing permissions
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) TO service_role;
