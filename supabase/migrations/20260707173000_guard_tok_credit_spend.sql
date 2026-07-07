-- Prevent direct or concurrent TOK credit spend from exceeding the restaurant balance.
-- This is a database-level safety net for paid AI usage and credit-backed campaigns.

CREATE OR REPLACE FUNCTION public.tok_credit_balance_from_usage(p_usage jsonb)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT NULLIF(credit->>'balance', '')::numeric
    FROM jsonb_array_elements(COALESCE(p_usage->'credits', '[]'::jsonb)) AS credit
    WHERE credit->>'kind' = 'tok_credits'
    LIMIT 1
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.tok_credit_balance_from_usage(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tok_credit_balance_from_usage(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_restaurant_tok_credit_spend()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
  v_required_credits numeric(14, 2) := 0;
  v_old_required_credits numeric(14, 2) := 0;
  v_available_credits numeric(14, 2) := 0;
  v_usage jsonb := '{}'::jsonb;
  v_credit_text text;
BEGIN
  IF TG_TABLE_NAME = 'ai_usage_logs' THEN
    v_restaurant_id := NEW.restaurant_id;
    IF v_restaurant_id IS NULL OR lower(COALESCE(NEW.status, '')) <> 'success' THEN
      RETURN NEW;
    END IF;

    v_credit_text := COALESCE(NEW.metadata->>'credit_units', '');
    IF v_credit_text ~ '^[0-9]+(\.[0-9]+)?$' THEN
      v_required_credits := GREATEST(v_credit_text::numeric, 0);
    END IF;

    IF TG_OP = 'UPDATE'
      AND OLD.restaurant_id = NEW.restaurant_id
      AND lower(COALESCE(OLD.status, '')) = 'success'
    THEN
      v_credit_text := COALESCE(OLD.metadata->>'credit_units', '');
      IF v_credit_text ~ '^[0-9]+(\.[0-9]+)?$' THEN
        v_old_required_credits := GREATEST(v_credit_text::numeric, 0);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'ad_campaigns' THEN
    v_restaurant_id := NEW.restaurant_id;
    IF v_restaurant_id IS NULL
      OR lower(COALESCE(NEW.payment_method, '')) <> 'credits'
      OR lower(COALESCE(NEW.payment_status, '')) <> 'paid'
    THEN
      RETURN NEW;
    END IF;

    v_required_credits := GREATEST(
      COALESCE(NEW.total_budget, 0),
      COALESCE(NEW.spent, 0),
      COALESCE(NEW.paid_amount, 0),
      0
    ) * 15;

    IF TG_OP = 'UPDATE'
      AND OLD.restaurant_id = NEW.restaurant_id
      AND lower(COALESCE(OLD.payment_method, '')) = 'credits'
      AND lower(COALESCE(OLD.payment_status, '')) = 'paid'
    THEN
      v_old_required_credits := GREATEST(
        COALESCE(OLD.total_budget, 0),
        COALESCE(OLD.spent, 0),
        COALESCE(OLD.paid_amount, 0),
        0
      ) * 15;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_required_credits <= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_restaurant_id::text)::bigint);

  v_usage := public.get_restaurant_credit_usage(v_restaurant_id);
  v_available_credits := public.tok_credit_balance_from_usage(v_usage) + v_old_required_credits;

  IF v_required_credits > v_available_credits THEN
    RAISE EXCEPTION 'TOK credits exhausted for restaurant %: required %, available %',
      v_restaurant_id,
      v_required_credits,
      v_available_credits
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_restaurant_tok_credit_spend() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_restaurant_tok_credit_spend() TO service_role;

DROP TRIGGER IF EXISTS guard_tok_credit_spend_ai_usage_logs ON public.ai_usage_logs;
CREATE TRIGGER guard_tok_credit_spend_ai_usage_logs
BEFORE INSERT OR UPDATE OF restaurant_id, status, metadata ON public.ai_usage_logs
FOR EACH ROW
EXECUTE FUNCTION public.guard_restaurant_tok_credit_spend();

DROP TRIGGER IF EXISTS guard_tok_credit_spend_ad_campaigns ON public.ad_campaigns;
CREATE TRIGGER guard_tok_credit_spend_ad_campaigns
BEFORE INSERT OR UPDATE OF restaurant_id, payment_method, payment_status, total_budget, spent, paid_amount ON public.ad_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.guard_restaurant_tok_credit_spend();

NOTIFY pgrst, 'reload schema';
