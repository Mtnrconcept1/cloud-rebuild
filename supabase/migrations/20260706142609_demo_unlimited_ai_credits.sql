-- Give commercial demo restaurants a non-purchasable internal AI credit grant.
-- The regular wallet RPC and AI Edge Functions keep using the same paid-credit path.

INSERT INTO public.restaurant_credit_packs (
  slug,
  name,
  description,
  price_chf,
  campaign_credit_chf,
  ai_tool_credits,
  ai_photo_credits,
  features,
  position,
  is_active,
  metadata
)
VALUES (
  'demo-unlimited-ai',
  'Demo IA illimitee',
  'Grant interne pour les comptes commerciaux demo TOK.',
  0,
  0,
  1000000000,
  1000000000,
  '["Outils IA demo illimites", "Non achetable par les restaurateurs"]'::jsonb,
  9999,
  false,
  '{"demo_unlimited_ai_credits": true, "demo_scope": "commercial_sales_environment"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_chf = EXCLUDED.price_chf,
  campaign_credit_chf = EXCLUDED.campaign_credit_chf,
  ai_tool_credits = EXCLUDED.ai_tool_credits,
  ai_photo_credits = EXCLUDED.ai_photo_credits,
  features = EXCLUDED.features,
  position = EXCLUDED.position,
  is_active = EXCLUDED.is_active,
  metadata = EXCLUDED.metadata,
  updated_at = now();

WITH demo_restaurants AS (
  SELECT
    r.id AS restaurant_id,
    r.owner_id AS user_id,
    lower(COALESCE(u.email, '')) AS email,
    COALESCE(u.raw_user_meta_data->>'username', split_part(COALESCE(u.email, ''), '@', 1)) AS username
  FROM public.restaurants r
  JOIN auth.users u ON u.id = r.owner_id
  WHERE lower(COALESCE(u.email, '')) ~ '^commercial(0[1-9]|10)@demo\.thetok\.ch$'
    OR lower(COALESCE(r.slug, '')) ~ '-commercial(0[1-9]|10)$'
),
demo_pack AS (
  SELECT id
  FROM public.restaurant_credit_packs
  WHERE slug = 'demo-unlimited-ai'
  LIMIT 1
)
UPDATE public.restaurant_credit_purchases rcp
SET
  purchased_by = dr.user_id,
  status = 'paid',
  price_chf = 0,
  currency = 'chf',
  campaign_credit_chf = 0,
  ai_tool_credits = 1000000000,
  ai_photo_credits = 1000000000,
  stripe_checkout_session_id = NULL,
  stripe_payment_intent_id = NULL,
  stripe_mode = 'demo',
  paid_at = now(),
  metadata = jsonb_build_object(
    'demo_unlimited_ai_credits', true,
    'demo_scope', 'commercial_sales_environment',
    'username', dr.username,
    'source', '20260706142609_demo_unlimited_ai_credits'
  ),
  updated_at = now()
FROM demo_restaurants dr, demo_pack dp
WHERE rcp.restaurant_id = dr.restaurant_id
  AND rcp.credit_pack_id = dp.id
  AND rcp.metadata->>'demo_unlimited_ai_credits' = 'true';

WITH demo_restaurants AS (
  SELECT
    r.id AS restaurant_id,
    r.owner_id AS user_id,
    lower(COALESCE(u.email, '')) AS email,
    COALESCE(u.raw_user_meta_data->>'username', split_part(COALESCE(u.email, ''), '@', 1)) AS username
  FROM public.restaurants r
  JOIN auth.users u ON u.id = r.owner_id
  WHERE lower(COALESCE(u.email, '')) ~ '^commercial(0[1-9]|10)@demo\.thetok\.ch$'
    OR lower(COALESCE(r.slug, '')) ~ '-commercial(0[1-9]|10)$'
),
demo_pack AS (
  SELECT id
  FROM public.restaurant_credit_packs
  WHERE slug = 'demo-unlimited-ai'
  LIMIT 1
)
INSERT INTO public.restaurant_credit_purchases (
  restaurant_id,
  credit_pack_id,
  purchased_by,
  status,
  price_chf,
  currency,
  campaign_credit_chf,
  ai_tool_credits,
  ai_photo_credits,
  stripe_mode,
  paid_at,
  metadata
)
SELECT
  dr.restaurant_id,
  dp.id,
  dr.user_id,
  'paid',
  0,
  'chf',
  0,
  1000000000,
  1000000000,
  'demo',
  now(),
  jsonb_build_object(
    'demo_unlimited_ai_credits', true,
    'demo_scope', 'commercial_sales_environment',
    'username', dr.username,
    'source', '20260706142609_demo_unlimited_ai_credits'
  )
FROM demo_restaurants dr
CROSS JOIN demo_pack dp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.restaurant_credit_purchases existing
  WHERE existing.restaurant_id = dr.restaurant_id
    AND existing.credit_pack_id = dp.id
    AND existing.metadata->>'demo_unlimited_ai_credits' = 'true'
);
