-- Launch pack AI quota governance.

ALTER TABLE public.launch_packs
  ADD COLUMN IF NOT EXISTS monthly_ai_image_limit integer NOT NULL DEFAULT 0 CHECK (monthly_ai_image_limit >= 0),
  ADD COLUMN IF NOT EXISTS monthly_ai_premium_image_limit integer NOT NULL DEFAULT 0 CHECK (monthly_ai_premium_image_limit >= 0),
  ADD COLUMN IF NOT EXISTS ai_monthly_budget_chf numeric(10,2) NOT NULL DEFAULT 0 CHECK (ai_monthly_budget_chf >= 0);

UPDATE public.launch_packs
SET
  monthly_ai_image_limit = CASE slug
    WHEN 'decouverte' THEN 10
    WHEN 'essentiel' THEN 30
    WHEN 'pro' THEN 80
    WHEN 'premium' THEN 160
    ELSE monthly_ai_image_limit
  END,
  monthly_ai_premium_image_limit = CASE slug
    WHEN 'decouverte' THEN 0
    WHEN 'essentiel' THEN 5
    WHEN 'pro' THEN 20
    WHEN 'premium' THEN 40
    ELSE monthly_ai_premium_image_limit
  END,
  ai_monthly_budget_chf = CASE slug
    WHEN 'decouverte' THEN 8
    WHEN 'essentiel' THEN 20
    WHEN 'pro' THEN 55
    WHEN 'premium' THEN 110
    ELSE ai_monthly_budget_chf
  END
WHERE slug IN ('decouverte', 'essentiel', 'pro', 'premium');

CREATE INDEX IF NOT EXISTS idx_launch_packs_ai_quota_active
  ON public.launch_packs (is_active, monthly_ai_image_limit)
  WHERE is_active = true;

NOTIFY pgrst, 'reload schema';
