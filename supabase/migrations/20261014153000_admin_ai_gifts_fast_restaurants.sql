-- Admin-only AI gifts and fast, indexed restaurant lookup.
-- Depends on 20261014140000_mtnr_internal_unlimited_openai.sql.
-- Gifts never become paid TOK packs, Stripe transactions or campaign budgets.

CREATE INDEX IF NOT EXISTS idx_restaurants_admin_name_id
  ON public.restaurants (name, id);

-- The existing lower(name) and lower(city) trigram indexes serve typed search.
-- Available menu counts were previously fetched in bulk without an index.
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_available
  ON public.menu_items (restaurant_id) WHERE is_available IS TRUE;

CREATE TABLE IF NOT EXISTS private_finance.admin_ai_credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount BETWEEN 1 AND 10000),
  remaining integer NOT NULL CHECK (remaining >= 0 AND remaining <= amount),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 8 AND 500),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > granted_at)
);
CREATE INDEX IF NOT EXISTS admin_ai_credit_grants_available_idx
  ON private_finance.admin_ai_credit_grants (restaurant_id, expires_at, granted_at, id)
  WHERE remaining > 0;
CREATE INDEX IF NOT EXISTS admin_ai_credit_grants_history_idx
  ON private_finance.admin_ai_credit_grants (restaurant_id, granted_at DESC);
ALTER TABLE private_finance.admin_ai_credit_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private_finance.admin_ai_credit_grants
  FROM PUBLIC, anon, authenticated, service_role;

-- A spend is server-created and cannot be fabricated with client JSON metadata.
-- Deferred FK supports recording the spend in a BEFORE INSERT trigger.
CREATE TABLE IF NOT EXISTS private_finance.admin_ai_credit_spends (
  usage_id uuid NOT NULL REFERENCES public.ai_usage_logs(id)
    DEFERRABLE INITIALLY DEFERRED,
  grant_id uuid NOT NULL REFERENCES private_finance.admin_ai_credit_grants(id)
    ON DELETE RESTRICT,
  credits integer NOT NULL CHECK (credits > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (usage_id, grant_id)
);
CREATE INDEX IF NOT EXISTS admin_ai_credit_spends_grant_idx
  ON private_finance.admin_ai_credit_spends (grant_id, created_at DESC);
ALTER TABLE private_finance.admin_ai_credit_spends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private_finance.admin_ai_credit_spends
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private_finance.admin_ai_gift_balance(p_restaurant_id uuid)
RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(sum(g.remaining), 0)::integer
  FROM private_finance.admin_ai_credit_grants g
  WHERE g.restaurant_id = p_restaurant_id
    AND g.remaining > 0
    AND g.expires_at > now()
$$;
REVOKE ALL ON FUNCTION private_finance.admin_ai_gift_balance(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Reuse existing indexed expressions instead of ILIKE(name), which did not
-- utilize the deployed lower(name) trigram index. Wildcards are literal.
CREATE OR REPLACE FUNCTION public.admin_search_restaurants_fast(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_eligible_only boolean DEFAULT false
)
RETURNS TABLE(id uuid, name text, city text, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_query text := lower(left(btrim(coalesce(p_query, '')), 80));
  v_pattern text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  v_pattern := '%' ||
    replace(replace(replace(v_query, chr(92), chr(92) || chr(92)),
      '%', chr(92) || '%'), '_', chr(92) || '_') || '%';

  RETURN QUERY
  SELECT r.id, r.name, r.city, r.is_active
  FROM public.restaurants r
  WHERE (NOT coalesce(p_eligible_only, false) OR
    (r.is_directory_listing IS FALSE AND r.is_demo IS FALSE AND r.owner_id IS NOT NULL))
    AND (v_query = ''
      OR lower(r.name) LIKE v_pattern ESCAPE '\'
      OR lower(r.city) LIKE v_pattern ESCAPE '\'
      OR r.id::text = v_query)
  ORDER BY r.name, r.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 60)
  OFFSET least(greatest(coalesce(p_offset, 0), 0), 100000);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_search_restaurants_fast(text, integer, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_restaurants_fast(text, integer, integer, boolean)
  TO authenticated;

-- Same "catalogue complet" rule as src/lib/catalogQuality.ts,
-- including the available menu index. Only used for stats and incomplete filter.
CREATE OR REPLACE FUNCTION private_finance.admin_restaurant_catalog_ready(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT
      nullif(btrim(r.image_url), '') IS NOT NULL
      AND nullif(btrim(r.address), '') IS NOT NULL
      AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
      AND r.opening_hours IS NOT NULL AND r.opening_hours <> '{}'::jsonb
      AND nullif(btrim(r.cuisine_type), '') IS NOT NULL
      AND NOT (coalesce(r.disabled_payment_methods, ARRAY[]::text[])
        @> ARRAY['card','cash','twint']::text[])
      AND EXISTS (
        SELECT 1 FROM public.menu_items m
        WHERE m.restaurant_id = r.id AND m.is_available IS TRUE
      )
    FROM public.restaurants r WHERE r.id = p_restaurant_id
  ), false);
$$;
REVOKE ALL ON FUNCTION private_finance.admin_restaurant_catalog_ready(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_restaurant_stats_fast()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (WHERE r.is_active IS TRUE AND r.status = 'active'),
    'featured', count(*) FILTER (WHERE r.is_featured IS TRUE),
    'reservationReady', count(*) FILTER (WHERE r.supports_reservation IS TRUE),
    'catalogReady', count(*) FILTER (WHERE private_finance.admin_restaurant_catalog_ready(r.id))
  )
  INTO v_result FROM public.restaurants r;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_restaurant_stats_fast() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_restaurant_stats_fast() TO authenticated;

-- Return at most 30 full cards instead of sending ~4k full restaurant rows and
-- loading all available menu items in a second huge request.
CREATE OR REPLACE FUNCTION public.admin_restaurants_page_fast(
  p_query text DEFAULT '',
  p_visibility text DEFAULT 'all',
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_query text := lower(left(btrim(coalesce(p_query, '')), 80));
  v_pattern text;
  v_visibility text := CASE
    WHEN p_visibility IN ('active','inactive','featured','incomplete') THEN p_visibility
    ELSE 'all'
  END;
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 40);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_rows jsonb := '[]'::jsonb;
  v_count bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  v_pattern := '%' ||
    replace(replace(replace(v_query, chr(92), chr(92) || chr(92)),
      '%', chr(92) || '%'), '_', chr(92) || '_') || '%';

  SELECT count(*) INTO v_count
  FROM public.restaurants r
  WHERE (v_query = ''
     OR lower(r.name) LIKE v_pattern ESCAPE '\'
     OR lower(r.city) LIKE v_pattern ESCAPE '\'
     OR lower(coalesce(r.cuisine_type,'')) LIKE v_pattern ESCAPE '\'
     OR r.id::text = v_query)
    AND (v_visibility = 'all'
      OR (v_visibility = 'active' AND r.is_active IS TRUE AND r.status = 'active')
      OR (v_visibility = 'inactive' AND NOT (r.is_active IS TRUE AND r.status = 'active'))
      OR (v_visibility = 'featured' AND r.is_featured IS TRUE)
      OR (v_visibility = 'incomplete' AND NOT private_finance.admin_restaurant_catalog_ready(r.id)));

  SELECT coalesce(jsonb_agg(to_jsonb(selected) ORDER BY selected.name, selected.id), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT r.id, r.name, r.city, r.cuisine_type, r.image_url,
      r.is_active, r.is_featured, r.status,
      r.supports_pickup, r.supports_dinein, r.supports_reservation,
      r.avg_rating, r.rating_count, r.min_order_amount, r.base_delivery_fee,
      r.address, r.latitude, r.longitude, r.opening_hours, r.disabled_payment_methods,
      (SELECT count(*)::integer
         FROM public.menu_items m
         WHERE m.restaurant_id = r.id AND m.is_available IS TRUE
      ) AS menu_items_count
    FROM public.restaurants r
    WHERE (v_query = ''
       OR lower(r.name) LIKE v_pattern ESCAPE '\'
       OR lower(r.city) LIKE v_pattern ESCAPE '\'
       OR lower(coalesce(r.cuisine_type,'')) LIKE v_pattern ESCAPE '\'
       OR r.id::text = v_query)
      AND (v_visibility = 'all'
        OR (v_visibility = 'active' AND r.is_active IS TRUE AND r.status = 'active')
        OR (v_visibility = 'inactive' AND NOT (r.is_active IS TRUE AND r.status = 'active'))
        OR (v_visibility = 'featured' AND r.is_featured IS TRUE)
        OR (v_visibility = 'incomplete' AND NOT private_finance.admin_restaurant_catalog_ready(r.id)))
    ORDER BY r.name, r.id
    LIMIT v_limit OFFSET v_offset
  ) selected;
  RETURN jsonb_build_object('rows', v_rows, 'total', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_restaurants_page_fast(text, text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_restaurants_page_fast(text, text, integer, integer)
  TO authenticated;

-- Only an authenticated TOK admin may grant a non-Stripe, non-purchasable
-- AI allowance to a real onboarded restaurant. Idempotency survives retries.
CREATE OR REPLACE FUNCTION public.admin_grant_restaurant_ai_credits(
  p_restaurant_id uuid,
  p_credits integer,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason,''));
  v_grant private_finance.admin_ai_credit_grants%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_restaurant_id IS NULL
    OR p_credits IS NULL OR p_credits NOT BETWEEN 1 AND 10000
    OR char_length(v_reason) NOT BETWEEN 8 AND 500
  THEN
    RAISE EXCEPTION 'invalid_ai_gift' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_id IS NOT NULL
      AND r.is_demo IS FALSE AND r.is_directory_listing IS FALSE
  ) THEN
    RAISE EXCEPTION 'restaurant_not_eligible_for_ai_gift' USING ERRCODE = '22023';
  END IF;

  INSERT INTO private_finance.admin_ai_credit_grants
    (restaurant_id, granted_by, request_id, amount, remaining, reason,
     granted_at, expires_at)
  VALUES (
    p_restaurant_id, v_admin, p_request_id, p_credits, p_credits,
    v_reason, clock_timestamp(), clock_timestamp() + interval '12 months'
  )
  ON CONFLICT (request_id) DO NOTHING
  RETURNING id INTO v_new_id;

  SELECT * INTO v_grant
  FROM private_finance.admin_ai_credit_grants g
  WHERE g.request_id = p_request_id;

  IF NOT FOUND OR v_grant.restaurant_id <> p_restaurant_id
    OR v_grant.amount <> p_credits
    OR v_grant.reason <> v_reason
    OR v_grant.granted_by <> v_admin
  THEN
    RAISE EXCEPTION 'ai_gift_idempotency_conflict' USING ERRCODE = '23505';
  END IF;

  IF v_new_id IS NOT NULL THEN
    INSERT INTO public.audit_log
      (user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      v_admin, 'admin_gift_ai_credits', 'restaurant', p_restaurant_id,
      NULL,
      jsonb_build_object('grant_id', v_grant.id,
        'credits', v_grant.amount, 'expires_at', v_grant.expires_at,
        'reason', v_reason, 'source', 'admin_non_stripe_gift')
    );
  END IF;

  RETURN jsonb_build_object('id', v_grant.id, 'restaurant_id', v_grant.restaurant_id,
    'credits', v_grant.amount, 'remaining', v_grant.remaining,
    'expires_at', v_grant.expires_at, 'already_granted', v_new_id IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_grant_restaurant_ai_credits(uuid, integer, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_restaurant_ai_credits(uuid, integer, text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_restaurant_ai_gifts(
  p_restaurant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.granted_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT id, amount, remaining, reason, granted_at, expires_at
    FROM private_finance.admin_ai_credit_grants
    WHERE restaurant_id = p_restaurant_id
    ORDER BY granted_at DESC LIMIT 12
  ) g;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_restaurant_ai_gifts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_restaurant_ai_gifts(uuid) TO authenticated;

-- The earlier internal-owner grant already uses this private view in BOTH
-- wallets. A logged call funded by an admin gift also leaves purchased and
-- subscription balances untouched. Only trusted spend rows, never client
-- metadata, determine this exclusion.
CREATE OR REPLACE VIEW private_finance.chargeable_ai_usage_logs
  WITH (security_barrier = true)
AS
SELECT logged.*
FROM public.ai_usage_logs logged
WHERE NOT EXISTS (
  SELECT 1 FROM private_finance.internal_unlimited_openai_grants grant_row
  JOIN public.restaurants r
    ON r.id = grant_row.restaurant_id AND r.owner_id = grant_row.user_id
  WHERE grant_row.enabled
    AND grant_row.user_id = logged.user_id
    AND grant_row.restaurant_id = logged.restaurant_id
    AND logged.created_at >= grant_row.granted_at
)
AND NOT EXISTS (
  SELECT 1 FROM private_finance.admin_ai_credit_spends gift_spend
  WHERE gift_spend.usage_id = logged.id
);
REVOKE ALL ON private_finance.chargeable_ai_usage_logs
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the existing internal-owner wrapper in the previous migration.
DO $$
BEGIN
  IF to_regprocedure('public.get_restaurant_credit_usage_before_admin_ai_gifts(uuid,timestamptz,timestamptz)') IS NULL THEN
    ALTER FUNCTION public.get_restaurant_credit_usage(uuid,timestamptz,timestamptz)
      RENAME TO get_restaurant_credit_usage_before_admin_ai_gifts;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_credit_usage(
  p_restaurant_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_usage jsonb;
  v_base jsonb;
  v_credit jsonb;
  v_gift integer;
  v_real numeric;
  v_current numeric;
  v_is_unlimited boolean;
  v_expires timestamptz;
BEGIN
  -- The underlying wallet enforces restaurant ownership/admin authorization.
  v_usage := public.get_restaurant_credit_usage_before_admin_ai_gifts(
    p_restaurant_id, p_since, p_until
  );
  v_gift := private_finance.admin_ai_gift_balance(p_restaurant_id);
  IF v_gift <= 0 THEN RETURN v_usage; END IF;

  -- Never count the MTNR virtual owner grant as spendable campaign credit.
  v_base := public.get_restaurant_credit_usage_before_internal_ai_grant(
    p_restaurant_id, p_since, p_until
  );
  v_real := greatest(coalesce(
    (v_base->'credits'->0->>'balance')::numeric, 0), 0);
  v_credit := coalesce(v_usage->'credits'->0, '{}'::jsonb);
  v_current := greatest(coalesce((v_credit->>'balance')::numeric,0),0);
  v_is_unlimited := coalesce(
    (v_credit->'metadata'->>'internal_unlimited_openai')::boolean, false);

  SELECT min(g.expires_at) INTO v_expires
  FROM private_finance.admin_ai_credit_grants g
  WHERE g.restaurant_id = p_restaurant_id AND g.remaining > 0
    AND g.expires_at > now();

  v_credit := v_credit || jsonb_build_object(
    'balance', CASE WHEN v_is_unlimited THEN v_current
      ELSE greatest(v_real, v_gift) END,
    'metadata', coalesce(v_credit->'metadata','{}'::jsonb) ||
      jsonb_build_object(
        'ai_gift_balance', v_gift,
        'ai_gift_expires_at', v_expires,
        'real_tok_balance', v_real,
        'campaign_spendable_balance',
          CASE WHEN coalesce((v_base->'credits'->0->'metadata'->>'preactivation')::boolean,false)
            THEN greatest(coalesce((v_base->'credits'->0->'metadata'->>'campaign_spendable_balance')::numeric,0),0)
            ELSE v_real
          END
      )
  );
  RETURN jsonb_set(v_usage, '{credits,0}', v_credit, false);
END;
$$;
REVOKE ALL ON FUNCTION public.get_restaurant_credit_usage(uuid,timestamptz,timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_credit_usage(uuid,timestamptz,timestamptz)
  TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.check_restaurant_ai_quota_before_admin_ai_gifts(uuid,text,integer)') IS NULL THEN
    ALTER FUNCTION public.check_restaurant_ai_quota(uuid,text,integer)
      RENAME TO check_restaurant_ai_quota_before_admin_ai_gifts;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_restaurant_ai_quota(
  p_restaurant_id uuid,
  p_feature text,
  p_units integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_original jsonb;
  v_gift integer;
BEGIN
  v_original := public.check_restaurant_ai_quota_before_admin_ai_gifts(
    p_restaurant_id, p_feature, p_units
  );
  IF v_original->>'reason' IN ('feature_disabled','restaurant_required') THEN
    RETURN v_original;
  END IF;
  v_gift := private_finance.admin_ai_gift_balance(p_restaurant_id);
  IF v_gift < greatest(coalesce(p_units,1),1) THEN RETURN v_original; END IF;
  RETURN v_original || jsonb_build_object(
    'allowed', true, 'reason', NULL, 'remaining', v_gift,
    'ai_gift_available', v_gift
  );
END;
$$;
REVOKE ALL ON FUNCTION public.check_restaurant_ai_quota(uuid,text,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_restaurant_ai_quota(uuid,text,integer)
  TO authenticated, service_role;

-- Sort trigger after the existing TOK credit guards: they see the grant first.
-- Once guards approve, reserve an entire AI call atomically from gift lots.
-- If gifts cannot cover the whole call, ordinary TOK credits must cover it.
CREATE OR REPLACE FUNCTION private_finance.apply_admin_ai_gift_on_usage()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_restaurant uuid := NEW.restaurant_id;
  v_required integer;
  v_available integer;
  v_remaining integer;
  v_to_take integer;
  v_gift record;
BEGIN
  IF v_restaurant IS NULL OR lower(coalesce(NEW.status,'')) <> 'success' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND lower(coalesce(OLD.status,'')) = 'success' THEN
    IF OLD.restaurant_id IS DISTINCT FROM NEW.restaurant_id
      OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'ai_usage_restaurant_immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  -- Gift usage must come from the restaurant owner or an actual staff user.
  IF NEW.user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = v_restaurant
      AND (r.owner_id = NEW.user_id
        OR EXISTS (
          SELECT 1 FROM public.restaurant_staff st
          WHERE st.restaurant_id = r.id AND st.user_id = NEW.user_id
        ))
  ) THEN RETURN NEW; END IF;

  -- The unlimited internal-owner grant already covers that actor.
  IF private_finance.has_internal_unlimited_openai_grant(v_restaurant, NEW.user_id) THEN
    RETURN NEW;
  END IF;
  v_required := greatest(ceil(coalesce(
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
  ))::integer,1);

  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_restaurant::text)::bigint);
  SELECT coalesce(sum(g.remaining),0)::integer INTO v_available
  FROM private_finance.admin_ai_credit_grants g
  WHERE g.restaurant_id = v_restaurant
    AND g.remaining > 0
    AND g.granted_at <= NEW.created_at
    AND g.expires_at > clock_timestamp();
  IF v_available >= v_required THEN
    v_remaining := v_required;
    FOR v_gift IN
      SELECT g.id, g.remaining
      FROM private_finance.admin_ai_credit_grants g
      WHERE g.restaurant_id = v_restaurant AND g.remaining > 0
        AND g.expires_at > clock_timestamp()
        AND g.granted_at <= NEW.created_at
      ORDER BY g.expires_at, g.granted_at, g.id FOR UPDATE
    LOOP
      v_to_take := least(v_remaining, v_gift.remaining);
      UPDATE private_finance.admin_ai_credit_grants g
      SET remaining = g.remaining - v_to_take WHERE g.id = v_gift.id;
      INSERT INTO private_finance.admin_ai_credit_spends (usage_id,grant_id,credits)
      VALUES (NEW.id,v_gift.id,v_to_take);
      v_remaining := v_remaining - v_to_take;
      EXIT WHEN v_remaining = 0;
    END LOOP;
    IF v_remaining <> 0 THEN
      RAISE EXCEPTION 'ai_gift_credits_concurrency_conflict' USING ERRCODE = 'P0001';
    END IF;
    NEW.metadata := coalesce(NEW.metadata,'{}'::jsonb) ||
      jsonb_build_object('admin_ai_gift_used',v_required);
  ELSE
    -- Invariant: gift + paid balances cannot be mixed silently in one call.
    -- A fully funded ordinary call still works; otherwise reject cleanly.
    IF public.tok_credit_balance_from_usage(
      public.get_restaurant_credit_usage_before_internal_ai_grant(v_restaurant)
    ) < v_required THEN
      RAISE EXCEPTION 'TOK credits exhausted for restaurant %: required %',
        v_restaurant,v_required USING ERRCODE = 'P0001';
    END IF;
    NEW.metadata := coalesce(NEW.metadata,'{}'::jsonb) - 'admin_ai_gift_used';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private_finance.apply_admin_ai_gift_on_usage()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS zz_admin_apply_ai_gift_credit ON public.ai_usage_logs;
CREATE TRIGGER zz_admin_apply_ai_gift_credit
BEFORE INSERT OR UPDATE OF restaurant_id, user_id, status, metadata
ON public.ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION private_finance.apply_admin_ai_gift_on_usage();

-- The client wallet may show AI gift credits, but a sponsored campaign may
-- consume only paid/subscription TOK credits. Keep the existing weekly-trial
-- protection and old-row delta on updates.
CREATE OR REPLACE FUNCTION private_finance.guard_admin_ai_gift_campaign()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_required numeric := 0;
  v_previous numeric := 0;
  v_usage jsonb;
  v_available numeric;
BEGIN
  IF NEW.restaurant_id IS NULL
    OR lower(coalesce(NEW.payment_method,'')) <> 'credits'
    OR lower(coalesce(NEW.payment_status,'')) <> 'paid'
  THEN RETURN NEW; END IF;

  v_required := greatest(coalesce(NEW.total_budget,0),
    coalesce(NEW.spent,0),coalesce(NEW.paid_amount,0),0) * 15;
  IF TG_OP = 'UPDATE'
    AND OLD.restaurant_id = NEW.restaurant_id
    AND lower(coalesce(OLD.payment_method,'')) = 'credits'
    AND lower(coalesce(OLD.payment_status,'')) = 'paid'
  THEN
    v_previous := greatest(coalesce(OLD.total_budget,0),
      coalesce(OLD.spent,0),coalesce(OLD.paid_amount,0),0) * 15;
  END IF;
  IF v_required <= 0 THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || NEW.restaurant_id::text)::bigint);
  v_usage := public.get_restaurant_credit_usage_before_internal_ai_grant(NEW.restaurant_id);
  v_available := public.tok_credit_balance_from_usage(v_usage) + v_previous;
  IF coalesce((v_usage->'credits'->0->'metadata'->>'preactivation')::boolean,false) THEN
    v_available := greatest(coalesce(
      (v_usage->'credits'->0->'metadata'->>'campaign_spendable_balance')::numeric,0),0)
      + v_previous;
  END IF;
  IF v_required > v_available THEN
    RAISE EXCEPTION 'TOK credits exhausted for restaurant %: required %, available %',
      NEW.restaurant_id,v_required,v_available USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private_finance.guard_admin_ai_gift_campaign()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS zz_admin_protect_gift_campaign ON public.ad_campaigns;
CREATE TRIGGER zz_admin_protect_gift_campaign
BEFORE INSERT OR UPDATE OF restaurant_id, payment_method, payment_status,
  total_budget, spent, paid_amount ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION private_finance.guard_admin_ai_gift_campaign();

NOTIFY pgrst, 'reload schema';
