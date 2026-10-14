-- Internal OpenAI entitlement for the verified MTNR Concept owner.
-- This is NOT a TOK credit purchase. It cannot fund ad campaigns or Stripe spending.
-- The existing OpenAI provider billing, usage logs, and per-request rate limits remain active.

CREATE TABLE IF NOT EXISTS private_finance.internal_unlimited_openai_grants (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'internal_owner_access',
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS internal_unlimited_openai_grants_restaurant_idx
  ON private_finance.internal_unlimited_openai_grants (restaurant_id)
  WHERE enabled;

ALTER TABLE private_finance.internal_unlimited_openai_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private_finance.internal_unlimited_openai_grants
  FROM PUBLIC, anon, authenticated, service_role;

-- Seed only after verifying BOTH the immutable auth user ID and current owner.
-- In clean development databases where this account does not exist, seed zero rows.
INSERT INTO private_finance.internal_unlimited_openai_grants
  (user_id, restaurant_id, reason, enabled)
SELECT u.id, r.id, 'mtnrconcept_owner_unlimited_openai', true
FROM auth.users u
JOIN public.restaurants r ON r.owner_id = u.id
WHERE u.id = '2e27851c-5301-48e5-a046-1b949b918e7d'::uuid
  AND lower(u.email) = 'mtnrconcept@gmail.com'
  AND r.id = 'fe046974-2945-4cf5-89cb-9c52ff354b93'::uuid
ON CONFLICT (user_id, restaurant_id)
DO UPDATE SET enabled = true, reason = EXCLUDED.reason;

-- Private grant lookup: a service-role request may look up an actor explicitly.
-- For an authenticated JWT, only the caller's own grant is recognized.
CREATE OR REPLACE FUNCTION private_finance.has_internal_unlimited_openai_grant(
  p_restaurant_id uuid, p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private_finance.internal_unlimited_openai_grants grant_row
    JOIN public.restaurants r
      ON r.id = grant_row.restaurant_id AND r.owner_id = grant_row.user_id
    WHERE grant_row.restaurant_id = p_restaurant_id
      AND grant_row.enabled
      AND (
        (auth.role() = 'service_role'
          AND (p_user_id IS NULL OR p_user_id = grant_row.user_id))
        OR
        (auth.uid() IS NOT NULL AND grant_row.user_id = auth.uid()
          AND (p_user_id IS NULL OR p_user_id = auth.uid()))
      )
  );
$$;

REVOKE ALL ON FUNCTION private_finance.has_internal_unlimited_openai_grant(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the current Fair Growth / 15-per-week wallet implementation exactly.
-- The wrapper changes only the AI-facing balance, not actual purchased-credit data.
DO $$
BEGIN
  IF to_regprocedure('public.get_restaurant_credit_usage_before_internal_ai_grant(uuid,timestamptz,timestamptz)') IS NULL THEN
    ALTER FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
      RENAME TO get_restaurant_credit_usage_before_internal_ai_grant;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage(
  p_restaurant_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_credit jsonb;
  v_real_balance numeric;
  v_campaign_balance numeric;
BEGIN
  -- The underlying implementation checks ownership/admin permissions first.
  v_result := public.get_restaurant_credit_usage_before_internal_ai_grant(
    p_restaurant_id, p_since, p_until
  );

  IF NOT private_finance.has_internal_unlimited_openai_grant(p_restaurant_id) THEN
    RETURN v_result;
  END IF;

  v_credit := COALESCE(v_result->'credits'->0, '{}'::jsonb);
  IF v_credit = '{}'::jsonb THEN RETURN v_result; END IF;

  v_real_balance := GREATEST(COALESCE((v_credit->>'balance')::numeric, 0), 0);
  v_campaign_balance := GREATEST(COALESCE(
    (v_credit->'metadata'->>'campaign_spendable_balance')::numeric,
    v_real_balance
  ), 0);
  v_credit := v_credit || jsonb_build_object(
    'balance', 2000000000,
    'metadata', COALESCE(v_credit->'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'internal_unlimited_openai', true,
        'campaign_spendable_balance', v_campaign_balance,
        'actual_tok_credit_balance', v_real_balance
      )
  );
  RETURN jsonb_set(v_result, '{credits,0}', v_credit, false);
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_credit_usage(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;

-- Preserve subscription checks, ownership checks and feature flags.
-- Only the named owner's AI usage quota becomes unlimited.
DO $$
BEGIN
  IF to_regprocedure('public.check_restaurant_ai_quota_before_internal_ai_grant(uuid,text,integer)') IS NULL THEN
    ALTER FUNCTION public.check_restaurant_ai_quota(uuid, text, integer)
      RENAME TO check_restaurant_ai_quota_before_internal_ai_grant;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_restaurant_ai_quota(
  p_restaurant_id uuid,
  p_feature text,
  p_units integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.check_restaurant_ai_quota_before_internal_ai_grant(
    p_restaurant_id, p_feature, p_units
  );

  IF v_result->>'reason' = 'feature_disabled'
    OR NOT private_finance.has_internal_unlimited_openai_grant(p_restaurant_id)
  THEN
    RETURN v_result;
  END IF;

  RETURN v_result || jsonb_build_object(
    'allowed', true,
    'limit', -1,
    'remaining', -1,
    'reason', NULL,
    'internal_unlimited_openai', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_restaurant_ai_quota(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_restaurant_ai_quota(uuid, text, integer)
  TO authenticated, service_role;

-- The standard ledger guard uses the displayed balance. Add a second guard:
-- campaigns and non-granted actors must use the real wallet, never the AI grant.
CREATE OR REPLACE FUNCTION private_finance.guard_internal_unlimited_ai_spend()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restaurant_id uuid := NEW.restaurant_id;
  v_usage jsonb;
  v_required numeric(14,2) := 0;
  v_previous numeric(14,2) := 0;
  v_available numeric(14,2) := 0;
BEGIN
  IF v_restaurant_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM private_finance.internal_unlimited_openai_grants g
      JOIN public.restaurants r
        ON r.id = g.restaurant_id AND r.owner_id = g.user_id
      WHERE g.restaurant_id = v_restaurant_id AND g.enabled
    )
  THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'ai_usage_logs' THEN
    IF lower(COALESCE(NEW.status, '')) <> 'success' THEN RETURN NEW; END IF;
    IF private_finance.has_internal_unlimited_openai_grant(v_restaurant_id, NEW.user_id) THEN
      RETURN NEW;
    END IF;

    -- Mirror the existing 15-credit ledger fallback for other actors.
    v_required := GREATEST(COALESCE(
      CASE WHEN NEW.metadata->>'credit_units' ~ '^[0-9]+(\.[0-9]+)?$'
        THEN (NEW.metadata->>'credit_units')::numeric END,
      CASE WHEN NEW.function_name IN (
        'ai-restaurant-agent', 'ai-restaurant-tools', 'restaurant-advisor',
        'generate-campaign', 'floorplan-ai', 'ai-accounting-agent'
      ) THEN 5 END,
      CASE WHEN NEW.metadata->>'image_count' ~ '^[0-9]+$'
        THEN (NEW.metadata->>'image_count')::numeric END,
      CASE WHEN NEW.metadata->>'variant_count' ~ '^[0-9]+$'
        THEN (NEW.metadata->>'variant_count')::numeric END,
      1
    ), 1);

    IF TG_OP = 'UPDATE' AND OLD.restaurant_id = NEW.restaurant_id
      AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
      AND lower(COALESCE(OLD.status, '')) = 'success'
    THEN
      v_previous := GREATEST(COALESCE(
        CASE WHEN OLD.metadata->>'credit_units' ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (OLD.metadata->>'credit_units')::numeric END,
        CASE WHEN OLD.function_name IN (
          'ai-restaurant-agent', 'ai-restaurant-tools', 'restaurant-advisor',
          'generate-campaign', 'floorplan-ai', 'ai-accounting-agent'
        ) THEN 5 END,
        CASE WHEN OLD.metadata->>'image_count' ~ '^[0-9]+$'
          THEN (OLD.metadata->>'image_count')::numeric END,
        CASE WHEN OLD.metadata->>'variant_count' ~ '^[0-9]+$'
          THEN (OLD.metadata->>'variant_count')::numeric END,
        1
      ), 1);
    END IF;
  ELSIF TG_TABLE_NAME = 'ad_campaigns' THEN
    IF lower(COALESCE(NEW.payment_method, '')) <> 'credits'
      OR lower(COALESCE(NEW.payment_status, '')) <> 'paid'
    THEN RETURN NEW; END IF;

    v_required := GREATEST(
      COALESCE(NEW.total_budget, 0), COALESCE(NEW.spent, 0),
      COALESCE(NEW.paid_amount, 0), 0
    ) * 15;
    IF TG_OP = 'UPDATE' AND OLD.restaurant_id = NEW.restaurant_id
      AND lower(COALESCE(OLD.payment_method, '')) = 'credits'
      AND lower(COALESCE(OLD.payment_status, '')) = 'paid'
    THEN
      v_previous := GREATEST(
        COALESCE(OLD.total_budget, 0), COALESCE(OLD.spent, 0),
        COALESCE(OLD.paid_amount, 0), 0
      ) * 15;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_required <= 0 THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_restaurant_id::text)::bigint);

  v_usage := public.get_restaurant_credit_usage_before_internal_ai_grant(v_restaurant_id);
  v_available := public.tok_credit_balance_from_usage(v_usage) + v_previous;

  IF TG_TABLE_NAME = 'ad_campaigns'
    AND COALESCE((v_usage->'credits'->0->'metadata'->>'preactivation')::boolean, false)
  THEN
    v_available := GREATEST(COALESCE(
      (v_usage->'credits'->0->'metadata'->>'campaign_spendable_balance')::numeric, 0
    ), 0) + v_previous;
  END IF;

  IF v_required > v_available THEN
    RAISE EXCEPTION 'TOK credits exhausted for restaurant %: required %, available %',
      v_restaurant_id, v_required, v_available
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private_finance.guard_internal_unlimited_ai_spend()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_internal_unlimited_ai_usage ON public.ai_usage_logs;
CREATE TRIGGER guard_internal_unlimited_ai_usage
BEFORE INSERT OR UPDATE OF restaurant_id, user_id, status, metadata ON public.ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION private_finance.guard_internal_unlimited_ai_spend();

DROP TRIGGER IF EXISTS guard_internal_unlimited_campaign_spend ON public.ad_campaigns;
CREATE TRIGGER guard_internal_unlimited_campaign_spend
BEFORE INSERT OR UPDATE OF restaurant_id, payment_method, payment_status,
  total_budget, spent, paid_amount ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION private_finance.guard_internal_unlimited_ai_spend();

NOTIFY pgrst, 'reload schema';
