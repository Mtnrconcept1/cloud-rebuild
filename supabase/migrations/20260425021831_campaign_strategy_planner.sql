ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS pricing_strategy text NOT NULL DEFAULT 'conversion';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_campaigns_pricing_strategy_check'
  ) THEN
    ALTER TABLE public.ad_campaigns
      ADD CONSTRAINT ad_campaigns_pricing_strategy_check
      CHECK (pricing_strategy IN ('visibility', 'traffic', 'conversion'));
  END IF;
END $$;

UPDATE public.ad_campaigns
SET pricing_strategy = CASE
  WHEN COALESCE(cpm_rate, 0) <= 7 AND COALESCE(cpc_rate, 0) >= 1 THEN 'visibility'
  WHEN COALESCE(conversion_rate, 999) <= 8.5 THEN 'conversion'
  ELSE 'traffic'
END
WHERE COALESCE(pricing_strategy, '') NOT IN ('visibility', 'traffic', 'conversion');

NOTIFY pgrst, 'reload schema';
