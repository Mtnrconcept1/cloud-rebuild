-- Lock image AI economics to GPT Image 2 medium only.
-- Base direct OpenAI image cost assumption: 0.05 CHF per generated image.
-- With 1 TOK credit capped at 0.009 CHF OpenAI cost, every image costs 6 TOK credits.

UPDATE public.restaurant_subscription_plans
SET
  description = CASE slug
    WHEN 'starter' THEN '750 crédits TOK / mois utilisables librement pour campagnes, assistant IA, images GPT Image 2 medium et rendus impression.'
    WHEN 'pro' THEN '1''425 crédits TOK / mois utilisables librement pour campagnes, assistant IA, images GPT Image 2 medium et rendus impression.'
    WHEN 'premium' THEN '2''205 crédits TOK / mois utilisables librement pour campagnes, assistant IA, images GPT Image 2 medium et rendus impression.'
    WHEN 'elite' THEN '5''535 crédits TOK / mois utilisables librement pour campagnes, assistant IA, images GPT Image 2 medium et rendus impression.'
    ELSE description
  END,
  monthly_image_limit = CASE slug
    WHEN 'starter' THEN 125
    WHEN 'pro' THEN 237
    WHEN 'premium' THEN 367
    WHEN 'elite' THEN 922
    ELSE monthly_image_limit
  END,
  monthly_premium_image_limit = CASE slug
    WHEN 'starter' THEN 125
    WHEN 'pro' THEN 237
    WHEN 'premium' THEN 367
    WHEN 'elite' THEN 922
    ELSE monthly_premium_image_limit
  END,
  features = CASE slug
    WHEN 'starter' THEN '["750 crédits TOK / mois", "Coût OpenAI inclus plafonné à 6.75 CHF / mois", "Jusqu''à 750 requêtes IA simples ou 125 images GPT Image 2 medium", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'pro' THEN '["1''425 crédits TOK / mois", "Coût OpenAI inclus plafonné à 12.83 CHF / mois", "Jusqu''à 1''425 requêtes IA simples ou 237 images GPT Image 2 medium", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'premium' THEN '["2''205 crédits TOK / mois", "Coût OpenAI inclus plafonné à 19.85 CHF / mois", "Jusqu''à 2''205 requêtes IA simples ou 367 images GPT Image 2 medium", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'elite' THEN '["5''535 crédits TOK / mois", "Coût OpenAI inclus plafonné à 49.82 CHF / mois", "Jusqu''à 5''535 requêtes IA simples ou 922 images GPT Image 2 medium", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    ELSE features
  END,
  updated_at = now()
WHERE slug IN ('starter', 'pro', 'premium', 'elite');

UPDATE public.restaurant_ai_subscriptions ras
SET
  monthly_image_limit = rsp.monthly_image_limit,
  monthly_premium_image_limit = rsp.monthly_premium_image_limit,
  updated_at = now()
FROM public.restaurant_subscription_plans rsp
WHERE ras.status IN ('trialing', 'active')
  AND (
    ras.restaurant_subscription_plan_id = rsp.id
    OR lower(COALESCE(ras.plan, '')) = rsp.slug
  )
  AND rsp.slug IN ('starter', 'pro', 'premium', 'elite');

UPDATE public.restaurant_credit_packs
SET
  features = CASE slug
    WHEN 'tok-credits-600' THEN '["540 crédits TOK", "Coût OpenAI couvert jusqu''à 4.86 CHF", "Jusqu''à 540 requêtes IA simples ou 90 images GPT Image 2 medium", "Crédits recharge valables 12 mois"]'::jsonb
    WHEN 'tok-credits-1500' THEN '["1''110 crédits TOK", "Coût OpenAI couvert jusqu''à 9.99 CHF", "Jusqu''à 1''110 requêtes IA simples ou 185 images GPT Image 2 medium", "Crédits recharge valables 12 mois"]'::jsonb
    WHEN 'tok-credits-3750' THEN '["2''655 crédits TOK", "Coût OpenAI couvert jusqu''à 23.90 CHF", "Jusqu''à 2''655 requêtes IA simples ou 442 images GPT Image 2 medium", "Crédits recharge valables 12 mois"]'::jsonb
    WHEN 'tok-credits-growth' THEN '["3''870 crédits TOK", "Coût OpenAI couvert jusqu''à 34.83 CHF", "Jusqu''à 3''870 requêtes IA simples ou 645 images GPT Image 2 medium", "Crédits recharge valables 12 mois"]'::jsonb
    ELSE features
  END,
  updated_at = now()
WHERE slug IN ('tok-credits-600', 'tok-credits-1500', 'tok-credits-3750', 'tok-credits-growth');
