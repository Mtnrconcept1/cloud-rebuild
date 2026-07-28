-- Campaign conversions must represent confirmed business outcomes.
-- Browser-side attribution can arrive before Stripe or the restaurant confirms the entity,
-- so keep it pending and release it atomically once the order/reservation is confirmed.

CREATE TABLE IF NOT EXISTS public.ad_campaign_pending_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  conversion_type text NOT NULL CHECK (conversion_type IN ('order', 'reservation', 'zero-attente')),
  entity_id uuid NOT NULL,
  user_id uuid NULL,
  dedupe_key text NOT NULL,
  source text NULL,
  page text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'cancelled', 'expired', 'rejected')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  processed_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, conversion_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_campaign_pending_conversions_entity
  ON public.ad_campaign_pending_conversions (entity_id, conversion_type, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_ad_campaign_pending_conversions_campaign
  ON public.ad_campaign_pending_conversions (campaign_id, status, expires_at);

ALTER TABLE public.ad_campaign_pending_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ad_campaign_pending_conversions FROM anon, authenticated;
GRANT ALL ON TABLE public.ad_campaign_pending_conversions TO service_role;

CREATE OR REPLACE FUNCTION public.ad_campaign_conversion_entity_state(
  p_conversion_type text,
  p_entity_id uuid,
  p_restaurant_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state text := 'missing';
BEGIN
  IF p_conversion_type = 'order' THEN
    SELECT CASE
      WHEN lower(COALESCE(o.status, '')) IN ('cancelled', 'canceled', 'rejected', 'failed', 'payment_failed', 'refunded')
        OR lower(COALESCE(o.payment_status, '')) IN ('cancelled', 'canceled', 'failed', 'payment_failed', 'refunded')
        THEN 'terminal'
      WHEN lower(COALESCE(o.status, '')) IN ('confirmed', 'preparing', 'ready', 'completed', 'delivered')
        AND lower(COALESCE(o.payment_status, '')) NOT IN ('pending', 'pending_payment', 'requires_payment', 'failed', 'payment_failed', 'cancelled', 'canceled')
        THEN 'confirmed'
      ELSE 'pending'
    END
    INTO v_state
    FROM public.orders o
    WHERE o.id = p_entity_id
      AND o.restaurant_id = p_restaurant_id
      AND (p_user_id IS NULL OR o.user_id = p_user_id)
    LIMIT 1;
  ELSIF p_conversion_type IN ('reservation', 'zero-attente') THEN
    SELECT CASE
      WHEN lower(COALESCE(r.status, '')) IN ('cancelled', 'canceled', 'rejected', 'declined', 'no_show', 'failed')
        THEN 'terminal'
      WHEN lower(COALESCE(r.status, '')) IN ('confirmed', 'seated', 'completed')
        THEN 'confirmed'
      ELSE 'pending'
    END
    INTO v_state
    FROM public.reservations r
    WHERE r.id = p_entity_id
      AND r.restaurant_id = p_restaurant_id
      AND (p_user_id IS NULL OR r.user_id = p_user_id)
    LIMIT 1;
  ELSE
    RETURN 'missing';
  END IF;

  RETURN COALESCE(v_state, 'missing');
END;
$function$;

REVOKE ALL ON FUNCTION public.ad_campaign_conversion_entity_state(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_campaign_conversion_entity_state(text, uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_ad_campaign_event(
  p_campaign_id uuid,
  p_restaurant_id uuid,
  p_event_type text,
  p_dedupe_key text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_source text DEFAULT NULL::text,
  p_page text DEFAULT NULL::text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_conversion_type text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer := 0;
  v_cost numeric := 0;
  v_campaign record;
  v_today date := CURRENT_DATE;
  v_effective_daily_spent numeric := 0;
  v_previous_metric_write text := COALESCE(current_setting('tok.internal_campaign_metric_write', true), 'off');
  v_entity_token text;
  v_entity_id uuid;
  v_entity_state text;
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'conversion') THEN
    RAISE EXCEPTION 'Invalid campaign event type: %', p_event_type;
  END IF;

  IF p_event_type <> 'conversion' THEN
    p_conversion_type := NULL;
  ELSIF p_conversion_type IS NULL OR p_conversion_type NOT IN ('order', 'reservation', 'zero-attente') THEN
    RAISE EXCEPTION 'Invalid conversion type: %', p_conversion_type;
  END IF;

  IF public.is_restaurant_internal_actor(p_user_id, p_restaurant_id) THEN
    RETURN false;
  END IF;

  SELECT
    id,
    restaurant_id,
    total_budget,
    spent,
    budget_daily,
    daily_spent,
    daily_spent_date,
    cpm_rate,
    cpc_rate,
    conversion_rate
  INTO v_campaign
  FROM public.ad_campaigns
  WHERE id = p_campaign_id
    AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(v_campaign.total_budget, 0) > 0 THEN
    IF p_event_type = 'impression' THEN
      v_cost := ROUND(COALESCE(v_campaign.cpm_rate, 9.50) / 1000.0, 6);
    ELSIF p_event_type = 'click' THEN
      v_cost := ROUND(COALESCE(v_campaign.cpc_rate, 0.95), 6);
    ELSIF p_event_type = 'conversion' THEN
      v_cost := ROUND(COALESCE(v_campaign.conversion_rate, 7.50), 6);
    END IF;
  END IF;

  v_effective_daily_spent := CASE
    WHEN v_campaign.daily_spent_date = v_today THEN COALESCE(v_campaign.daily_spent, 0)
    ELSE 0
  END;

  IF COALESCE(v_campaign.total_budget, 0) > 0
    AND (COALESCE(v_campaign.spent, 0) + v_cost) > COALESCE(v_campaign.total_budget, 0) THEN
    RETURN false;
  END IF;

  IF COALESCE(v_campaign.budget_daily, 0) > 0
    AND (v_effective_daily_spent + v_cost) > COALESCE(v_campaign.budget_daily, 0) THEN
    RETURN false;
  END IF;

  IF p_event_type = 'conversion' THEN
    v_entity_token := NULLIF(trim(COALESCE(p_payload->>'entity_id', '')), '');
    IF v_entity_token IS NULL
      OR v_entity_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;

    v_entity_id := v_entity_token::uuid;
    v_entity_state := public.ad_campaign_conversion_entity_state(
      p_conversion_type,
      v_entity_id,
      p_restaurant_id,
      p_user_id
    );

    IF v_entity_state IN ('missing', 'terminal') THEN
      RETURN false;
    END IF;

    IF v_entity_state = 'pending' THEN
      INSERT INTO public.ad_campaign_pending_conversions (
        campaign_id,
        restaurant_id,
        conversion_type,
        entity_id,
        user_id,
        dedupe_key,
        source,
        page,
        payload,
        status,
        expires_at,
        updated_at
      )
      VALUES (
        p_campaign_id,
        p_restaurant_id,
        p_conversion_type,
        v_entity_id,
        p_user_id,
        p_dedupe_key,
        p_source,
        p_page,
        COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('attribution_state', 'pending_confirmation'),
        'pending',
        now() + interval '24 hours',
        now()
      )
      ON CONFLICT (campaign_id, conversion_type, entity_id) DO UPDATE
      SET
        user_id = COALESCE(EXCLUDED.user_id, public.ad_campaign_pending_conversions.user_id),
        dedupe_key = EXCLUDED.dedupe_key,
        source = COALESCE(EXCLUDED.source, public.ad_campaign_pending_conversions.source),
        page = COALESCE(EXCLUDED.page, public.ad_campaign_pending_conversions.page),
        payload = public.ad_campaign_pending_conversions.payload || EXCLUDED.payload,
        status = CASE
          WHEN public.ad_campaign_pending_conversions.status = 'processed' THEN 'processed'
          ELSE 'pending'
        END,
        expires_at = GREATEST(public.ad_campaign_pending_conversions.expires_at, EXCLUDED.expires_at),
        last_error = NULL,
        updated_at = now();

      -- The attribution request is accepted and owned by the server, but the paid
      -- campaign counter is intentionally not incremented before confirmation.
      RETURN true;
    END IF;
  END IF;

  INSERT INTO public.ad_campaign_events (
    campaign_id,
    restaurant_id,
    event_type,
    conversion_type,
    user_id,
    dedupe_key,
    source,
    page,
    payload
  )
  VALUES (
    p_campaign_id,
    p_restaurant_id,
    p_event_type,
    p_conversion_type,
    p_user_id,
    p_dedupe_key,
    p_source,
    p_page,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (campaign_id, event_type, dedupe_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  PERFORM set_config('tok.internal_campaign_metric_write', 'on', true);

  UPDATE public.ad_campaigns
  SET
    impressions = COALESCE(impressions, 0) + CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END,
    clicks = COALESCE(clicks, 0) + CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
    conversions = COALESCE(conversions, 0) + CASE WHEN p_event_type = 'conversion' THEN 1 ELSE 0 END,
    spent = COALESCE(spent, 0) + v_cost,
    daily_spent = CASE
      WHEN daily_spent_date IS DISTINCT FROM v_today THEN v_cost
      ELSE COALESCE(daily_spent, 0) + v_cost
    END,
    daily_spent_date = v_today,
    updated_at = now()
  WHERE id = p_campaign_id
    AND restaurant_id = p_restaurant_id;

  PERFORM set_config('tok.internal_campaign_metric_write', v_previous_metric_write, true);

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_pending_ad_campaign_conversions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pending record;
  v_entity_state text;
  v_recorded boolean := false;
  v_event_exists boolean := false;
  v_allowed_types text[];
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    v_allowed_types := ARRAY['order']::text[];
  ELSIF TG_TABLE_NAME = 'reservations' THEN
    v_allowed_types := ARRAY['reservation', 'zero-attente']::text[];
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.ad_campaign_pending_conversions
  SET status = 'expired', last_error = 'attribution_window_expired', updated_at = now()
  WHERE entity_id = NEW.id
    AND restaurant_id = NEW.restaurant_id
    AND conversion_type = ANY(v_allowed_types)
    AND status = 'pending'
    AND expires_at <= now();

  FOR v_pending IN
    SELECT *
    FROM public.ad_campaign_pending_conversions
    WHERE entity_id = NEW.id
      AND restaurant_id = NEW.restaurant_id
      AND conversion_type = ANY(v_allowed_types)
      AND status = 'pending'
      AND expires_at > now()
      AND (user_id IS NULL OR user_id = NEW.user_id)
    ORDER BY created_at
    FOR UPDATE
  LOOP
    v_entity_state := public.ad_campaign_conversion_entity_state(
      v_pending.conversion_type,
      v_pending.entity_id,
      v_pending.restaurant_id,
      v_pending.user_id
    );

    IF v_entity_state = 'terminal' THEN
      UPDATE public.ad_campaign_pending_conversions
      SET status = 'cancelled', last_error = 'business_entity_cancelled', updated_at = now()
      WHERE id = v_pending.id;
      CONTINUE;
    END IF;

    IF v_entity_state <> 'confirmed' THEN
      CONTINUE;
    END IF;

    SELECT public.record_ad_campaign_event(
      v_pending.campaign_id,
      v_pending.restaurant_id,
      'conversion',
      v_pending.dedupe_key,
      v_pending.user_id,
      v_pending.source,
      v_pending.page,
      v_pending.payload || jsonb_build_object(
        'attribution_state', 'confirmed',
        'pending_conversion_id', v_pending.id,
        'confirmed_at', now()
      ),
      v_pending.conversion_type
    ) INTO v_recorded;

    SELECT EXISTS (
      SELECT 1
      FROM public.ad_campaign_events e
      WHERE e.campaign_id = v_pending.campaign_id
        AND e.event_type = 'conversion'
        AND e.dedupe_key = v_pending.dedupe_key
    ) INTO v_event_exists;

    UPDATE public.ad_campaign_pending_conversions
    SET
      status = CASE WHEN v_recorded OR v_event_exists THEN 'processed' ELSE 'rejected' END,
      processed_at = now(),
      last_error = CASE WHEN v_recorded OR v_event_exists THEN NULL ELSE 'campaign_budget_or_delivery_guard' END,
      updated_at = now()
    WHERE id = v_pending.id;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_pending_ad_campaign_conversions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_pending_ad_campaign_conversions() TO service_role;

DROP TRIGGER IF EXISTS trg_process_pending_ad_campaign_order_conversions ON public.orders;
CREATE TRIGGER trg_process_pending_ad_campaign_order_conversions
AFTER INSERT OR UPDATE OF status, payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.process_pending_ad_campaign_conversions();

DROP TRIGGER IF EXISTS trg_process_pending_ad_campaign_reservation_conversions ON public.reservations;
CREATE TRIGGER trg_process_pending_ad_campaign_reservation_conversions
AFTER INSERT OR UPDATE OF status ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.process_pending_ad_campaign_conversions();

COMMENT ON TABLE public.ad_campaign_pending_conversions IS
  'Server-owned sponsored attribution awaiting a confirmed order or reservation before campaign billing.';
