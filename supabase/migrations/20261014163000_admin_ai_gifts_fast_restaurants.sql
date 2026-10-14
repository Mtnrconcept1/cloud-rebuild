-- Admin-only, non-monetary AI credit gifts and paginated restaurant lookups.
-- Depends on the verified MTNR internal AI entitlement migration.
-- No Stripe purchase, no advertising balance and no unlimited public privileges.

CREATE INDEX IF NOT EXISTS idx_restaurants_admin_name_id
  ON public.restaurants (name, id);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_available
  ON public.menu_items (restaurant_id)
  WHERE is_available IS TRUE;

-- Existing lower(name) / lower(city) / cuisine trigram indexes are deliberately
-- reused; do not add an unnecessary duplicate GIN index.

CREATE OR REPLACE FUNCTION public.admin_search_restaurant_options(
  p_search text DEFAULT '',
  p_limit integer DEFAULT 26,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, name text, city text, is_active boolean, is_directory_listing boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_term text := lower(left(btrim(coalesce(p_search, '')), 100));
  v_pattern text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  v_pattern := '%' || replace(replace(replace(v_term, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  RETURN QUERY
  SELECT r.id, r.name, r.city, r.is_active, r.is_directory_listing
  FROM public.restaurants r
  WHERE v_term = ''
    OR lower(r.name) LIKE v_pattern ESCAPE E'\\'
    OR lower(r.city) LIKE v_pattern ESCAPE E'\\'
    OR lower(coalesce(r.cuisine_type, '')) LIKE v_pattern ESCAPE E'\\'
    OR r.id::text = v_term
  ORDER BY
    CASE
      WHEN lower(r.name) = v_term THEN 0
      WHEN lower(r.name) LIKE (v_term || '%') THEN 1
      ELSE 2
    END,
    r.name, r.id
  LIMIT least(greatest(coalesce(p_limit, 26), 1), 51)
  OFFSET least(greatest(coalesce(p_offset, 0), 0), 10000);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_search_restaurant_options(text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_restaurant_options(text, integer, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_search_restaurants(
  p_search text DEFAULT '',
  p_visibility text DEFAULT 'all',
  p_limit integer DEFAULT 31,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, name text, city text, cuisine_type text, image_url text,
  is_active boolean, is_featured boolean, status text,
  supports_pickup boolean, supports_dinein boolean, supports_reservation boolean,
  avg_rating numeric, rating_count integer, min_order_amount numeric,
  base_delivery_fee numeric, address text, latitude double precision,
  longitude double precision, opening_hours jsonb, disabled_payment_methods text[],
  menu_items_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_term text := lower(left(btrim(coalesce(p_search, '')), 100));
  v_pattern text;
  v_visibility text := lower(coalesce(p_visibility, 'all'));
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF v_visibility NOT IN ('all','active','inactive','featured','incomplete') THEN
    RAISE EXCEPTION 'Invalid restaurant visibility' USING ERRCODE = '22023';
  END IF;

  v_pattern := '%' || replace(replace(replace(v_term, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  RETURN QUERY
  SELECT
    r.id, r.name, r.city, r.cuisine_type, r.image_url,
    r.is_active, r.is_featured, r.status,
    r.supports_pickup, r.supports_dinein, r.supports_reservation,
    r.avg_rating, r.rating_count, r.min_order_amount,
    r.base_delivery_fee, r.address, r.latitude, r.longitude,
    r.opening_hours, r.disabled_payment_methods,
    (SELECT count(*)::integer FROM public.menu_items mi
      WHERE mi.restaurant_id = r.id AND mi.is_available IS TRUE)
  FROM public.restaurants r
  WHERE (
    v_term = ''
    OR lower(r.name) LIKE v_pattern ESCAPE E'\\'
    OR lower(r.city) LIKE v_pattern ESCAPE E'\\'
    OR lower(coalesce(r.cuisine_type, '')) LIKE v_pattern ESCAPE E'\\'
    OR r.id::text = v_term
  )
  AND (
    v_visibility = 'all'
    OR (v_visibility = 'active' AND r.is_active IS TRUE AND lower(coalesce(r.status,'')) = 'active')
    OR (v_visibility = 'inactive' AND NOT (r.is_active IS TRUE AND lower(coalesce(r.status,'')) = 'active'))
    OR (v_visibility = 'featured' AND r.is_featured IS TRUE)
    OR (v_visibility = 'incomplete' AND (
      nullif(btrim(coalesce(r.image_url,'')), '') IS NULL
      OR nullif(btrim(coalesce(r.address,'')), '') IS NULL
      OR r.latitude IS NULL OR r.longitude IS NULL
      OR r.opening_hours IS NULL OR r.opening_hours = '{}'::jsonb
      OR nullif(btrim(coalesce(r.cuisine_type,'')), '') IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.menu_items mi
        WHERE mi.restaurant_id = r.id AND mi.is_available IS TRUE
      )
      OR ARRAY['card','cash','twint'] <@ coalesce(r.disabled_payment_methods, ARRAY[]::text[])
    ))
  )
  ORDER BY r.name, r.id
  LIMIT least(greatest(coalesce(p_limit,31),1),51)
  OFFSET least(greatest(coalesce(p_offset,0),0),10000);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_search_restaurants(text, text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_restaurants(text, text, integer, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_restaurant_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_stats jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (
      WHERE r.is_active IS TRUE AND lower(coalesce(r.status,'')) = 'active'),
    'featured', count(*) FILTER (WHERE r.is_featured IS TRUE),
    'reservationReady', count(*) FILTER (WHERE r.supports_reservation IS TRUE),
    'catalogReady', count(*) FILTER (
      WHERE nullif(btrim(coalesce(r.image_url,'')), '') IS NOT NULL
        AND nullif(btrim(coalesce(r.address,'')), '') IS NOT NULL
        AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
        AND r.opening_hours IS NOT NULL AND r.opening_hours <> '{}'::jsonb
        AND nullif(btrim(coalesce(r.cuisine_type,'')), '') IS NOT NULL
        AND coalesce(m.available_count,0) > 0
        AND NOT (ARRAY['card','cash','twint'] <@ coalesce(r.disabled_payment_methods, ARRAY[]::text[]))
    )
  )
  INTO v_stats
  FROM public.restaurants r
  LEFT JOIN (
    SELECT mi.restaurant_id, count(*) AS available_count
    FROM public.menu_items mi
    WHERE mi.is_available IS TRUE
    GROUP BY mi.restaurant_id
  ) m ON m.restaurant_id = r.id;

  RETURN coalesce(v_stats, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_restaurant_overview_stats()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_restaurant_overview_stats()
  TO authenticated;

-- AI gifts never masquerade as paid credit purchases.
CREATE TABLE IF NOT EXISTS private_finance.restaurant_ai_credit_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  credits integer NOT NULL CHECK (credits BETWEEN 1 AND 100000),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 300),
  request_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  enabled boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS restaurant_ai_credit_gifts_restaurant_idx
  ON private_finance.restaurant_ai_credit_gifts (restaurant_id, created_at DESC)
  WHERE enabled;

CREATE TABLE IF NOT EXISTS private_finance.restaurant_ai_gift_spends (
  usage_log_id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  credits numeric(14,2) NOT NULL CHECK (credits > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restaurant_ai_gift_spends_restaurant_idx
  ON private_finance.restaurant_ai_gift_spends (restaurant_id);

ALTER TABLE private_finance.restaurant_ai_credit_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_finance.restaurant_ai_gift_spends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private_finance.restaurant_ai_credit_gifts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private_finance.restaurant_ai_gift_spends
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_gift_restaurant_ai_credits(
  p_restaurant_id uuid,
  p_credits integer,
  p_reason text,
  p_request_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason,''));
  v_gift private_finance.restaurant_ai_credit_gifts%ROWTYPE;
  v_new boolean := false;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_restaurant_id IS NULL OR p_request_key IS NULL OR p_credits IS NULL
    OR p_credits NOT BETWEEN 1 AND 100000
    OR char_length(v_reason) NOT BETWEEN 10 AND 300
  THEN
    RAISE EXCEPTION 'Invalid AI gift request' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant_id) THEN
    RAISE EXCEPTION 'Restaurant not found' USING ERRCODE = '22023';
  END IF;

  INSERT INTO private_finance.restaurant_ai_credit_gifts
    (restaurant_id, granted_by, credits, reason, request_key)
  VALUES (p_restaurant_id, v_admin, p_credits, v_reason, p_request_key)
  ON CONFLICT (request_key) DO NOTHING
  RETURNING * INTO v_gift;

  v_new := FOUND;
  IF NOT v_new THEN
    SELECT * INTO v_gift
    FROM private_finance.restaurant_ai_credit_gifts
    WHERE request_key = p_request_key;
    IF v_gift.id IS NULL
      OR v_gift.restaurant_id <> p_restaurant_id
      OR v_gift.granted_by <> v_admin
      OR v_gift.credits <> p_credits
      OR v_gift.reason <> v_reason
    THEN
      RAISE EXCEPTION 'AI gift request key reused with different data'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_new THEN
    INSERT INTO public.audit_log
      (user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      v_admin, 'admin_gift_restaurant_ai_credits', 'restaurant', p_restaurant_id,
      NULL,
      jsonb_build_object(
        'gift_id', v_gift.id, 'credits', p_credits,
        'reason', v_reason, 'request_key', p_request_key,
        'non_monetary', true, 'campaign_spendable', false
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'gift_id', v_gift.id,
    'restaurant_id', v_gift.restaurant_id,
    'credits', v_gift.credits,
    'already_granted', NOT v_new
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_gift_restaurant_ai_credits(uuid, integer, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_gift_restaurant_ai_credits(uuid, integer, text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION private_finance.get_restaurant_ai_gift_balance(
  p_restaurant_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH gifts AS (
    SELECT coalesce(sum(g.credits),0)::numeric AS allowance
    FROM private_finance.restaurant_ai_credit_gifts g
    WHERE g.restaurant_id = p_restaurant_id AND g.enabled
  ), spends AS (
    SELECT coalesce(sum(s.credits),0)::numeric AS spent
    FROM private_finance.restaurant_ai_gift_spends s
    WHERE s.restaurant_id = p_restaurant_id
  )
  SELECT jsonb_build_object(
    'issued', gifts.allowance,
    'spent', spends.spent,
    'balance', greatest(gifts.allowance - spends.spent,0)
  ) FROM gifts, spends;
$function$;

REVOKE ALL ON FUNCTION private_finance.get_restaurant_ai_gift_balance(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Exclude only the gifted fraction of each usage event from the normal TOK
-- wallet. Preserve original event token/cost logs in public.ai_usage_logs.
-- Fully gifted events disappear from the *chargeable* view only.
CREATE OR REPLACE VIEW private_finance.chargeable_ai_usage_logs
  WITH (security_barrier = true)
AS
SELECT
  logged.id, logged.function_name, logged.action, logged.model,
  logged.user_id, logged.restaurant_id, logged.conversation_id,
  logged.generated_asset_id, logged.status, logged.input_tokens,
  logged.output_tokens, logged.total_tokens, logged.estimated_cost_chf,
  logged.provider_request_id,
  CASE
    WHEN logged.metadata ? 'tok_ai_gift_spent_units'
      AND (logged.metadata->>'tok_ai_gift_spent_units') ~ '^[0-9]+([.][0-9]+)?$'
      AND (logged.metadata->>'credit_units') ~ '^[0-9]+([.][0-9]+)?$' THEN
      jsonb_set(logged.metadata, '{credit_units}',
        to_jsonb(greatest(
          (logged.metadata->>'credit_units')::numeric
          - (logged.metadata->>'tok_ai_gift_spent_units')::numeric, 0
        )), true)
    ELSE logged.metadata
  END AS metadata,
  logged.created_at, logged.feature_name, logged.task_id, logged.source
FROM public.ai_usage_logs logged
WHERE NOT EXISTS (
  SELECT 1
  FROM private_finance.internal_unlimited_openai_grants grant_row
  JOIN public.restaurants r
    ON r.id = grant_row.restaurant_id AND r.owner_id = grant_row.user_id
  WHERE grant_row.enabled
    AND grant_row.user_id = logged.user_id
    AND grant_row.restaurant_id = logged.restaurant_id
    AND logged.created_at >= grant_row.granted_at
)
AND (
  NOT (logged.metadata ? 'tok_ai_gift_spent_units')
  OR (
    (logged.metadata->>'tok_ai_gift_spent_units') ~ '^[0-9]+([.][0-9]+)?$'
    AND (logged.metadata->>'credit_units') ~ '^[0-9]+([.][0-9]+)?$'
    AND (logged.metadata->>'tok_ai_gift_spent_units')::numeric
      < (logged.metadata->>'credit_units')::numeric
  )
);

REVOKE ALL ON private_finance.chargeable_ai_usage_logs
  FROM PUBLIC, anon, authenticated, service_role;

-- Apply a separate gift balance to the AI-facing wallet, while keeping
-- campaign_spendable_balance and paid credits completely untouched.
DO $rename_wallet$
BEGIN
  IF to_regprocedure('public.get_restaurant_credit_usage_before_ai_gifts(uuid,timestamptz,timestamptz)') IS NULL THEN
    ALTER FUNCTION public.get_restaurant_credit_usage(uuid,timestamptz,timestamptz)
      RENAME TO get_restaurant_credit_usage_before_ai_gifts;
  END IF;
END;
$rename_wallet$;

CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage(
  p_restaurant_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
  v_credit jsonb;
  v_original jsonb;
  v_gifts jsonb;
  v_gift_available numeric;
  v_gift_issued numeric;
  v_actual_balance numeric;
  v_campaign_balance numeric;
BEGIN
  -- Authoritative ownership/admin checks happen inside the previous RPC.
  v_result := public.get_restaurant_credit_usage_before_ai_gifts(
    p_restaurant_id, p_since, p_until
  );
  v_credit := coalesce(v_result->'credits'->0, '{}'::jsonb);
  IF v_credit = '{}'::jsonb OR
    coalesce((v_credit->'metadata'->>'internal_unlimited_openai')::boolean, false)
  THEN
    RETURN v_result;
  END IF;

  v_gifts := private_finance.get_restaurant_ai_gift_balance(p_restaurant_id);
  v_gift_available := greatest(coalesce((v_gifts->>'balance')::numeric,0),0);
  v_gift_issued := greatest(coalesce((v_gifts->>'issued')::numeric,0),0);
  IF v_gift_issued <= 0 THEN RETURN v_result; END IF;

  v_actual_balance := greatest(coalesce((v_credit->>'balance')::numeric,0),0);
  v_original := coalesce(v_credit->'metadata', '{}'::jsonb);
  v_campaign_balance := greatest(coalesce(
    (v_original->>'campaign_spendable_balance')::numeric, v_actual_balance
  ),0);

  v_credit := v_credit || jsonb_build_object(
    'balance', v_actual_balance + v_gift_available,
    'allowance', coalesce((v_credit->>'allowance')::numeric,0) + v_gift_issued,
    'metadata', v_original || jsonb_build_object(
      'ai_gift_credits_issued', v_gift_issued,
      'ai_gift_credits_remaining', v_gift_available,
      'ai_gift_credits_only', true,
      'campaign_spendable_balance', v_campaign_balance,
      'actual_tok_credit_balance', v_actual_balance
    )
  );
  RETURN jsonb_set(v_result, '{credits,0}', v_credit, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_restaurant_credit_usage(uuid,timestamptz,timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_credit_usage(uuid,timestamptz,timestamptz)
  TO authenticated, service_role;

DO $rename_quota$
BEGIN
  IF to_regprocedure('public.check_restaurant_ai_quota_before_ai_gifts(uuid,text,integer)') IS NULL THEN
    ALTER FUNCTION public.check_restaurant_ai_quota(uuid,text,integer)
      RENAME TO check_restaurant_ai_quota_before_ai_gifts;
  END IF;
END;
$rename_quota$;

CREATE OR REPLACE FUNCTION public.check_restaurant_ai_quota(
  p_restaurant_id uuid, p_feature text, p_units integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
  v_gift_balance numeric;
BEGIN
  v_result := public.check_restaurant_ai_quota_before_ai_gifts(
    p_restaurant_id,p_feature,p_units
  );
  IF v_result->>'reason' <> 'quota_exceeded' THEN RETURN v_result; END IF;

  v_gift_balance := coalesce((
    private_finance.get_restaurant_ai_gift_balance(p_restaurant_id)
  )->>'balance', '0')::numeric;
  IF v_gift_balance < greatest(coalesce(p_units,1),1) THEN RETURN v_result; END IF;
  RETURN v_result || jsonb_build_object(
    'allowed',true, 'remaining',floor(v_gift_balance)::integer,
    'reason',NULL, 'ai_gift_credits_only',true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.check_restaurant_ai_quota(uuid,text,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_restaurant_ai_quota(uuid,text,integer)
  TO authenticated, service_role;

-- The existing TOK guard runs first (trigger name starts with "guard").
-- This second trigger locks the same restaurant and accounts for the gifted
-- fraction atomically. A campaign must pass the original, non-gift balance.
CREATE OR REPLACE FUNCTION private_finance.guard_tok_ai_gift_credit_spend()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_restaurant uuid := NEW.restaurant_id;
  v_gifts jsonb;
  v_gift_balance numeric := 0;
  v_previous_gift numeric := 0;
  v_previous_regular numeric := 0;
  v_previous_required numeric := 0;
  v_needed numeric := 0;
  v_gift_used numeric := 0;
  v_real_balance numeric := 0;
  v_real_usage jsonb;
BEGIN
  IF v_restaurant IS NULL THEN RETURN NEW; END IF;

  -- No extra work for restaurants without any AI gifts.
  IF NOT EXISTS (
    SELECT 1 FROM private_finance.restaurant_ai_credit_gifts g
    WHERE g.restaurant_id = v_restaurant AND g.enabled
  ) THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_restaurant::text)::bigint);
  v_real_usage := public.get_restaurant_credit_usage_before_internal_ai_grant(v_restaurant);
  v_real_balance := greatest(
    coalesce((v_real_usage->'credits'->0->>'balance')::numeric,0),0
  );

  IF TG_TABLE_NAME = 'ad_campaigns' THEN
    IF lower(coalesce(NEW.payment_method,'')) <> 'credits'
      OR lower(coalesce(NEW.payment_status,'')) <> 'paid'
    THEN RETURN NEW; END IF;

    v_needed := greatest(
      coalesce(NEW.total_budget,0),coalesce(NEW.spent,0),
      coalesce(NEW.paid_amount,0),0
    ) * 15;
    IF TG_OP = 'UPDATE' AND OLD.restaurant_id = NEW.restaurant_id
      AND lower(coalesce(OLD.payment_method,'')) = 'credits'
      AND lower(coalesce(OLD.payment_status,'')) = 'paid'
    THEN
      v_previous_regular := greatest(
        coalesce(OLD.total_budget,0),coalesce(OLD.spent,0),
        coalesce(OLD.paid_amount,0),0
      ) * 15;
    END IF;
    IF coalesce((v_real_usage->'credits'->0->'metadata'->>'preactivation')::boolean,false) THEN
      v_real_balance := greatest(coalesce(
        (v_real_usage->'credits'->0->'metadata'->>'campaign_spendable_balance')::numeric,0
      ),0);
    END IF;
    IF v_needed > v_real_balance + v_previous_regular THEN
      RAISE EXCEPTION 'TOK credits exhausted for campaign: gifted AI credits cannot fund ads'
        USING ERRCODE='P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME <> 'ai_usage_logs' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.restaurant_id IS DISTINCT FROM NEW.restaurant_id
      AND EXISTS (
        SELECT 1 FROM private_finance.restaurant_ai_gift_spends
        WHERE usage_log_id = OLD.id
      )
    THEN
      RAISE EXCEPTION 'Cannot move a gifted AI usage log to another restaurant'
        USING ERRCODE='22023';
    END IF;
    IF OLD.restaurant_id = NEW.restaurant_id
      AND lower(coalesce(OLD.status,'')) = 'success'
    THEN
      v_previous_gift := greatest(coalesce(
        (OLD.metadata->>'tok_ai_gift_spent_units')::numeric,0
      ),0);
      v_previous_required := greatest(coalesce(
        CASE WHEN OLD.metadata->>'credit_units' ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (OLD.metadata->>'credit_units')::numeric END,
        1
      ),1);
      v_previous_regular := greatest(v_previous_required - v_previous_gift,0);
    END IF;
  END IF;

  IF lower(coalesce(NEW.status,'')) <> 'success' THEN
    DELETE FROM private_finance.restaurant_ai_gift_spends WHERE usage_log_id=NEW.id;
    NEW.metadata := coalesce(NEW.metadata,'{}'::jsonb) - 'tok_ai_gift_spent_units';
    RETURN NEW;
  END IF;

  v_needed := greatest(coalesce(
    CASE WHEN NEW.metadata->>'credit_units' ~ '^[0-9]+(\.[0-9]+)?$'
      THEN (NEW.metadata->>'credit_units')::numeric END,
    CASE WHEN NEW.function_name IN (
      'ai-restaurant-agent','ai-restaurant-tools','restaurant-advisor',
      'generate-campaign','floorplan-ai','ai-accounting-agent'
    ) THEN 5 END,
    CASE WHEN NEW.metadata->>'image_count' ~ '^[0-9]+$'
      THEN (NEW.metadata->>'image_count')::numeric END,
    CASE WHEN NEW.metadata->>'variant_count' ~ '^[0-9]+$'
      THEN (NEW.metadata->>'variant_count')::numeric END,
    1
  ),1);

  v_gifts := private_finance.get_restaurant_ai_gift_balance(v_restaurant);
  v_gift_balance := greatest(coalesce((v_gifts->>'balance')::numeric,0),0)
    + v_previous_gift;
  v_gift_used := least(v_needed,v_gift_balance);

  IF v_needed - v_gift_used > v_real_balance + v_previous_regular THEN
    RAISE EXCEPTION 'TOK credits exhausted for AI: insufficient gifted and regular credits'
      USING ERRCODE='P0001';
  END IF;

  NEW.metadata := (coalesce(NEW.metadata,'{}'::jsonb)
    - 'tok_ai_gift_spent_units') || jsonb_build_object(
      'credit_units',v_needed
    );
  IF v_gift_used > 0 THEN
    NEW.metadata := NEW.metadata || jsonb_build_object(
      'tok_ai_gift_spent_units',v_gift_used
    );
    INSERT INTO private_finance.restaurant_ai_gift_spends
      (usage_log_id,restaurant_id,credits)
    VALUES (NEW.id,v_restaurant,v_gift_used)
    ON CONFLICT (usage_log_id) DO UPDATE
    SET restaurant_id=EXCLUDED.restaurant_id,credits=EXCLUDED.credits;
  ELSE
    DELETE FROM private_finance.restaurant_ai_gift_spends
    WHERE usage_log_id=NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private_finance.guard_tok_ai_gift_credit_spend()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz_guard_tok_ai_gift_usage ON public.ai_usage_logs;
CREATE TRIGGER zz_guard_tok_ai_gift_usage
BEFORE INSERT OR UPDATE OF restaurant_id, user_id, status, metadata ON public.ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION private_finance.guard_tok_ai_gift_credit_spend();

DROP TRIGGER IF EXISTS zz_guard_tok_ai_gift_campaign ON public.ad_campaigns;
CREATE TRIGGER zz_guard_tok_ai_gift_campaign
BEFORE INSERT OR UPDATE OF restaurant_id, payment_method, payment_status,
  total_budget, spent, paid_amount ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION private_finance.guard_tok_ai_gift_credit_spend();

CREATE OR REPLACE FUNCTION private_finance.cleanup_ai_gift_spend_on_usage_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  DELETE FROM private_finance.restaurant_ai_gift_spends
  WHERE usage_log_id = OLD.id;
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION private_finance.cleanup_ai_gift_spend_on_usage_delete()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz_cleanup_ai_gift_spend_on_usage_delete ON public.ai_usage_logs;
CREATE TRIGGER zz_cleanup_ai_gift_spend_on_usage_delete
AFTER DELETE ON public.ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION private_finance.cleanup_ai_gift_spend_on_usage_delete();

NOTIFY pgrst, 'reload schema';
