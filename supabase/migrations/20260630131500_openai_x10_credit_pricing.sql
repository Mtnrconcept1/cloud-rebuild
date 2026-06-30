-- Align included TOK credits with a 10x gross margin guardrail on OpenAI costs.
-- One TOK credit should represent at most 0.009 CHF of estimated OpenAI cost.

UPDATE public.restaurant_subscription_plans
SET
  description = CASE slug
    WHEN 'starter' THEN '750 crédits TOK / mois utilisables librement pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.'
    WHEN 'pro' THEN '1''425 crédits TOK / mois utilisables librement pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.'
    WHEN 'premium' THEN '2''205 crédits TOK / mois utilisables librement pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.'
    WHEN 'elite' THEN '5''535 crédits TOK / mois utilisables librement pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.'
    ELSE description
  END,
  campaign_credit_chf = CASE slug
    WHEN 'starter' THEN 50
    WHEN 'pro' THEN 95
    WHEN 'premium' THEN 147
    WHEN 'elite' THEN 369
    ELSE campaign_credit_chf
  END,
  ai_tool_credits = CASE WHEN slug IN ('starter', 'pro', 'premium', 'elite') THEN 0 ELSE ai_tool_credits END,
  ai_photo_credits = CASE WHEN slug IN ('starter', 'pro', 'premium', 'elite') THEN 0 ELSE ai_photo_credits END,
  monthly_conversation_limit = CASE slug
    WHEN 'starter' THEN 750
    WHEN 'pro' THEN 1425
    WHEN 'premium' THEN 2205
    WHEN 'elite' THEN 5535
    ELSE monthly_conversation_limit
  END,
  monthly_text_tool_limit = CASE slug
    WHEN 'starter' THEN 750
    WHEN 'pro' THEN 1425
    WHEN 'premium' THEN 2205
    WHEN 'elite' THEN 5535
    ELSE monthly_text_tool_limit
  END,
  monthly_image_limit = CASE slug
    WHEN 'starter' THEN 187
    WHEN 'pro' THEN 356
    WHEN 'premium' THEN 551
    WHEN 'elite' THEN 1383
    ELSE monthly_image_limit
  END,
  monthly_premium_image_limit = CASE slug
    WHEN 'starter' THEN 39
    WHEN 'pro' THEN 75
    WHEN 'premium' THEN 116
    WHEN 'elite' THEN 291
    ELSE monthly_premium_image_limit
  END,
  features = CASE slug
    WHEN 'starter' THEN '["750 crédits TOK / mois", "Coût OpenAI inclus plafonné à 6.75 CHF / mois", "Jusqu''à 750 requêtes IA simples ou 187 rendus studio ou 39 rendus premium", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'pro' THEN '["1''425 crédits TOK / mois", "Coût OpenAI inclus plafonné à 12.83 CHF / mois", "Jusqu''à 1''425 requêtes IA simples ou 356 rendus studio ou 75 rendus premium", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'premium' THEN '["2''205 crédits TOK / mois", "Coût OpenAI inclus plafonné à 19.85 CHF / mois", "Jusqu''à 2''205 requêtes IA simples ou 551 rendus studio ou 116 rendus premium", "Crédits inclus valables pendant le mois en cours"]'::jsonb
    WHEN 'elite' THEN '["5''535 crédits TOK / mois", "Coût OpenAI inclus plafonné à 49.82 CHF / mois", "Jusqu''à 5''535 requêtes IA simples ou 1''383 rendus studio ou 291 rendus premium", "Crédits inclus valables pendant le mois en cours"]'::jsonb
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
  is_active
)
VALUES
  (
    'tok-credits-600',
    'Recharge 540',
    '540 crédits TOK utilisables pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.',
    49,
    36,
    0,
    0,
    '["540 crédits TOK", "Coût OpenAI couvert jusqu''à 4.86 CHF", "Jusqu''à 540 requêtes IA simples ou 135 rendus studio", "Crédits recharge valables 12 mois"]'::jsonb,
    10,
    true
  ),
  (
    'tok-credits-1500',
    'Recharge 1''110',
    '1''110 crédits TOK utilisables pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.',
    100,
    74,
    0,
    0,
    '["1''110 crédits TOK", "Coût OpenAI couvert jusqu''à 9.99 CHF", "Jusqu''à 1''110 requêtes IA simples ou 277 rendus studio", "Crédits recharge valables 12 mois"]'::jsonb,
    20,
    true
  ),
  (
    'tok-credits-3750',
    'Recharge 2''655',
    '2''655 crédits TOK utilisables pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.',
    240,
    177,
    0,
    0,
    '["2''655 crédits TOK", "Coût OpenAI couvert jusqu''à 23.90 CHF", "Jusqu''à 2''655 requêtes IA simples ou 663 rendus studio", "Crédits recharge valables 12 mois"]'::jsonb,
    30,
    true
  ),
  (
    'tok-credits-growth',
    'Recharge Croissance 3''870',
    '3''870 crédits TOK utilisables pour campagnes, assistant IA, retouches photo, visuels marketing et rendus impression.',
    349,
    258,
    0,
    0,
    '["3''870 crédits TOK", "Coût OpenAI couvert jusqu''à 34.83 CHF", "Jusqu''à 3''870 requêtes IA simples ou 203 rendus premium", "Crédits recharge valables 12 mois"]'::jsonb,
    40,
    true
  )
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_chf = EXCLUDED.price_chf,
    campaign_credit_chf = EXCLUDED.campaign_credit_chf,
    ai_tool_credits = EXCLUDED.ai_tool_credits,
    ai_photo_credits = EXCLUDED.ai_photo_credits,
    features = EXCLUDED.features,
    position = EXCLUDED.position,
    is_active = EXCLUDED.is_active,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.normalize_photo_ai_usage_credit_units()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_metadata jsonb := COALESCE(NEW.metadata, '{}'::jsonb);
  v_current_units integer := 1;
  v_requested_units integer := 1;
  v_cost_units integer := 1;
BEGIN
  IF NEW.status = 'success'
    AND (
      NEW.function_name = 'ai-image-enhance'
      OR v_metadata->>'credit_kind' = 'photo_retouch'
    )
  THEN
    IF (v_metadata->>'credit_units') ~ '^[0-9]+$' THEN
      v_current_units := GREATEST((v_metadata->>'credit_units')::integer, 1);
    END IF;

    IF (v_metadata->>'requested_output_credit_units') ~ '^[0-9]+$' THEN
      v_requested_units := GREATEST((v_metadata->>'requested_output_credit_units')::integer, 1);
    END IF;

    v_cost_units := GREATEST(CEIL(GREATEST(COALESCE(NEW.estimated_cost_chf, 0), 0) / 0.009)::integer, 1);

    NEW.metadata := v_metadata
      || jsonb_build_object(
        'credit_kind', 'photo_retouch',
        'previous_credit_units', v_current_units,
        'credit_units', GREATEST(v_current_units, v_requested_units, v_cost_units),
        'estimated_cost_credit_units', v_cost_units,
        'photo_credit_chf', 0.009,
        'billing_credit_source',
          CASE
            WHEN v_cost_units >= v_requested_units AND v_cost_units >= v_current_units THEN 'estimated_total_cost'
            WHEN v_requested_units >= v_current_units THEN 'requested_output_resolution'
            ELSE 'existing_metadata'
          END
      );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS normalize_photo_ai_usage_credit_units ON public.ai_usage_logs;
CREATE TRIGGER normalize_photo_ai_usage_credit_units
BEFORE INSERT OR UPDATE OF estimated_cost_chf, metadata, status, function_name
ON public.ai_usage_logs
FOR EACH ROW
EXECUTE FUNCTION public.normalize_photo_ai_usage_credit_units();

UPDATE public.ai_usage_logs
SET metadata = COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'credit_kind', 'photo_retouch',
    'credit_units', GREATEST(
      CASE
        WHEN (metadata->>'credit_units') ~ '^[0-9]+$'
        THEN (metadata->>'credit_units')::integer
        ELSE 1
      END,
      CASE
        WHEN (metadata->>'requested_output_credit_units') ~ '^[0-9]+$'
        THEN (metadata->>'requested_output_credit_units')::integer
        ELSE 1
      END,
      GREATEST(CEIL(GREATEST(COALESCE(estimated_cost_chf, 0), 0) / 0.009)::integer, 1)
    ),
    'estimated_cost_credit_units', GREATEST(CEIL(GREATEST(COALESCE(estimated_cost_chf, 0), 0) / 0.009)::integer, 1),
    'photo_credit_chf', 0.009
  )
WHERE status = 'success'
  AND (
    function_name = 'ai-image-enhance'
    OR metadata->>'credit_kind' = 'photo_retouch'
  );

REVOKE ALL ON FUNCTION public.normalize_photo_ai_usage_credit_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_photo_ai_usage_credit_units() TO service_role;
