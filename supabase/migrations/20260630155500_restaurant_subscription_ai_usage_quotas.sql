-- Align restaurateur subscription AI allowances with explicit product quotas.
-- restaurant_subscription_ai_usage_quotas
-- Marketing generations use monthly_premium_image_limit.
-- Photo retouches use monthly_image_limit.
-- Assistant IA tool usages use monthly_text_tool_limit and monthly_conversation_limit.

UPDATE public.restaurant_subscription_plans
SET
  description = CASE slug
    WHEN 'starter' THEN '10 générations marketing, 10 utilisations assistant IA et 20 retouches photo par mois.'
    WHEN 'pro' THEN '30 générations marketing, 30 utilisations assistant IA et 50 retouches photo par mois.'
    WHEN 'premium' THEN '60 générations marketing, 60 utilisations assistant IA et 100 retouches photo par mois.'
    WHEN 'elite' THEN '200 générations marketing, 200 utilisations assistant IA et 500 retouches photo par mois.'
    ELSE description
  END,
  campaign_credit_chf = CASE
    WHEN slug IN ('starter', 'pro', 'premium', 'elite') THEN 0
    ELSE campaign_credit_chf
  END,
  ai_tool_credits = CASE slug
    WHEN 'starter' THEN 10
    WHEN 'pro' THEN 30
    WHEN 'premium' THEN 60
    WHEN 'elite' THEN 200
    ELSE ai_tool_credits
  END,
  ai_photo_credits = CASE slug
    WHEN 'starter' THEN 180
    WHEN 'pro' THEN 480
    WHEN 'premium' THEN 960
    WHEN 'elite' THEN 4200
    ELSE ai_photo_credits
  END,
  monthly_conversation_limit = CASE slug
    WHEN 'starter' THEN 10
    WHEN 'pro' THEN 30
    WHEN 'premium' THEN 60
    WHEN 'elite' THEN 200
    ELSE monthly_conversation_limit
  END,
  monthly_text_tool_limit = CASE slug
    WHEN 'starter' THEN 10
    WHEN 'pro' THEN 30
    WHEN 'premium' THEN 60
    WHEN 'elite' THEN 200
    ELSE monthly_text_tool_limit
  END,
  monthly_image_limit = CASE slug
    WHEN 'starter' THEN 20
    WHEN 'pro' THEN 50
    WHEN 'premium' THEN 100
    WHEN 'elite' THEN 500
    ELSE monthly_image_limit
  END,
  monthly_premium_image_limit = CASE slug
    WHEN 'starter' THEN 10
    WHEN 'pro' THEN 30
    WHEN 'premium' THEN 60
    WHEN 'elite' THEN 200
    ELSE monthly_premium_image_limit
  END,
  features = CASE slug
    WHEN 'starter' THEN '["Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'pro' THEN '["Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'premium' THEN '["Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'elite' THEN '["Crédits inclus valables pendant le mois en cours"]'::jsonb
    ELSE features
  END,
  updated_at = now()
WHERE slug IN ('starter', 'pro', 'premium', 'elite');

UPDATE public.restaurant_ai_subscriptions ras
SET
  monthly_campaign_credit_chf = rsp.campaign_credit_chf,
  monthly_ai_tool_credits = rsp.ai_tool_credits,
  monthly_photo_retouch_credits = rsp.ai_photo_credits,
  monthly_conversation_limit = rsp.monthly_conversation_limit,
  monthly_text_tool_limit = rsp.monthly_text_tool_limit,
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
    WHEN 'tok-credits-600' THEN '["540 crédits TOK", "90 images GPT Image 2 medium ou 540 utilisations assistant IA simples", "Crédits recharge valables 12 mois"]'::jsonb
    WHEN 'tok-credits-1500' THEN '["1''110 crédits TOK", "185 images GPT Image 2 medium ou 1''110 utilisations assistant IA simples", "Crédits recharge valables 12 mois"]'::jsonb
    WHEN 'tok-credits-3750' THEN '["2''655 crédits TOK", "442 images GPT Image 2 medium ou 2''655 utilisations assistant IA simples", "Crédits recharge valables 12 mois"]'::jsonb
    WHEN 'tok-credits-growth' THEN '["3''870 crédits TOK", "645 images GPT Image 2 medium ou 3''870 utilisations assistant IA simples", "Crédits recharge valables 12 mois"]'::jsonb
    ELSE features
  END,
  updated_at = now()
WHERE slug IN ('tok-credits-600', 'tok-credits-1500', 'tok-credits-3750', 'tok-credits-growth');
