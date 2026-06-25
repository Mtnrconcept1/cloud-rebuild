-- Reprice image-generation credits against the gpt-image-2 output-cost table.
-- One photo credit is treated as about 0.015 CHF of direct OpenAI image output
-- budget, with the Edge Function remaining the source of truth for usage.

UPDATE public.restaurant_subscription_plans
SET
  ai_photo_credits = CASE slug
    WHEN 'starter' THEN 24
    WHEN 'pro' THEN 96
    WHEN 'premium' THEN 240
    WHEN 'elite' THEN 960
    ELSE ai_photo_credits
  END,
  monthly_image_limit = CASE slug
    WHEN 'starter' THEN 24
    WHEN 'pro' THEN 96
    WHEN 'premium' THEN 240
    WHEN 'elite' THEN 960
    ELSE monthly_image_limit
  END,
  monthly_premium_image_limit = CASE slug
    WHEN 'starter' THEN 2
    WHEN 'pro' THEN 8
    WHEN 'premium' THEN 20
    WHEN 'elite' THEN 80
    ELSE monthly_premium_image_limit
  END,
  features = CASE slug
    WHEN 'starter' THEN '["Dashboard restaurateur", "Campagnes simples", "Assistant IA essentiel", "24 credits photo IA", "Jusqu''a 2 rendus impression"]'::jsonb
    WHEN 'pro' THEN '["Campagnes locales", "Assistant IA ventes et avis", "96 credits photo IA", "Jusqu''a 8 rendus impression", "Optimisation menu"]'::jsonb
    WHEN 'premium' THEN '["Campagnes sponsorisees", "Assistant IA avance", "240 credits photo IA", "Jusqu''a 20 rendus impression", "Insights compta et performance"]'::jsonb
    WHEN 'elite' THEN '["Operations Center premium", "Campagnes haute visibilite", "Assistant IA premium", "960 credits photo IA", "Jusqu''a 80 rendus impression", "Support prioritaire"]'::jsonb
    ELSE features
  END,
  updated_at = now()
WHERE slug IN ('starter', 'pro', 'premium', 'elite');

UPDATE public.restaurant_ai_subscriptions ras
SET
  monthly_photo_retouch_credits = rsp.ai_photo_credits,
  monthly_image_limit = rsp.monthly_image_limit,
  monthly_premium_image_limit = rsp.monthly_premium_image_limit,
  updated_at = now()
FROM public.restaurant_subscription_plans rsp
WHERE ras.status IN ('trialing', 'active')
  AND (
    ras.restaurant_subscription_plan_id = rsp.id
    OR lower(COALESCE(ras.plan, '')) = rsp.slug
  );

UPDATE public.restaurant_credit_packs
SET
  ai_photo_credits = 120,
  features = '["300 CHF de budget campagne", "100 credits outils IA", "120 credits photo IA"]'::jsonb,
  updated_at = now()
WHERE slug = 'growth-mix';
