-- Campaign attribution, internal test observability and reservation fee integrity.
--
-- This migration is intentionally additive at the table/API boundary:
--   * existing public RPC signatures remain unchanged;
--   * record_social_feed_event_v2 adds a structured, multi-campaign response;
--   * paid campaign counters never include restaurant owners or admins;
--   * confirmed conversions remain measurable when their campaign budget is spent;
--   * reservation completion and its Fair Growth fee snapshot become one atomic action.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private_campaign;
REVOKE ALL ON SCHEMA private_campaign FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private_campaign TO service_role;

-- ---------------------------------------------------------------------------
-- Durable internal-test audit and anonymous/authenticated attribution touches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ad_campaign_internal_test_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'conversion')),
  raw_event_type text,
  conversion_type text CHECK (
    conversion_type IS NULL
    OR conversion_type IN ('order', 'reservation', 'zero-attente')
  ),
  entity_id uuid,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  social_post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  social_event_id uuid REFERENCES public.social_feed_events(id) ON DELETE SET NULL,
  promotion_id uuid REFERENCES public.social_post_promotions(id) ON DELETE SET NULL,
  tracking_call_id uuid,
  dedupe_key text NOT NULL CHECK (trim(dedupe_key) <> ''),
  pricing_strategy text CHECK (
    pricing_strategy IS NULL
    OR pricing_strategy IN ('visibility', 'traffic', 'conversion')
  ),
  source text,
  page text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, event_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS ad_campaign_internal_test_events_restaurant_time_idx
  ON public.ad_campaign_internal_test_events (restaurant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ad_campaign_internal_test_events_campaign_time_idx
  ON public.ad_campaign_internal_test_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS social_feed_events_tracking_call_idx
  ON public.social_feed_events ((metadata->>'trackingCallId'))
  WHERE metadata ? 'trackingCallId';

ALTER TABLE public.ad_campaign_internal_test_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_campaign_internal_test_events_owner_read
  ON public.ad_campaign_internal_test_events;
CREATE POLICY ad_campaign_internal_test_events_owner_read
  ON public.ad_campaign_internal_test_events
  FOR SELECT
  TO authenticated
  USING (
    public.auth_owns_restaurant(restaurant_id)
    OR public.auth_is_admin()
  );

REVOKE ALL ON TABLE public.ad_campaign_internal_test_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ad_campaign_internal_test_events
  TO authenticated, service_role;
GRANT INSERT ON TABLE public.ad_campaign_internal_test_events
  TO service_role;

CREATE TABLE IF NOT EXISTS public.ad_campaign_attribution_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  social_post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  social_event_id uuid REFERENCES public.social_feed_events(id) ON DELETE SET NULL,
  promotion_id uuid REFERENCES public.social_post_promotions(id) ON DELETE SET NULL,
  tracking_call_id uuid,
  event_type text NOT NULL DEFAULT 'click'
    CHECK (event_type IN ('click', 'cta_click')),
  viewer_id text NOT NULL CHECK (
    trim(viewer_id) <> ''
    AND char_length(viewer_id) <= 256
  ),
  dedupe_key text NOT NULL CHECK (trim(dedupe_key) <> ''),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'claimed', 'converted', 'expired', 'rejected')
  ),
  conversion_type text CHECK (
    conversion_type IS NULL
    OR conversion_type IN ('order', 'reservation', 'zero-attente')
  ),
  entity_id uuid,
  converted_at timestamptz,
  source text,
  page text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  touched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  last_used_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, dedupe_key),
  CHECK (expires_at > touched_at),
  CHECK (
    (status <> 'converted' AND converted_at IS NULL AND entity_id IS NULL AND conversion_type IS NULL)
    OR
    (status = 'converted' AND converted_at IS NOT NULL AND entity_id IS NOT NULL AND conversion_type IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ad_campaign_attribution_touches_tracking_call_unique
  ON public.ad_campaign_attribution_touches (campaign_id, tracking_call_id)
  WHERE tracking_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ad_campaign_attribution_touches_active_idx
  ON public.ad_campaign_attribution_touches (expires_at)
  WHERE status IN ('active', 'claimed');
CREATE INDEX IF NOT EXISTS ad_campaign_attribution_touches_entity_idx
  ON public.ad_campaign_attribution_touches (entity_id, conversion_type)
  WHERE status = 'converted';
CREATE INDEX IF NOT EXISTS ad_campaign_attribution_touches_user_time_idx
  ON public.ad_campaign_attribution_touches (user_id, touched_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.ad_campaign_attribution_touches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ad_campaign_attribution_touches
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ad_campaign_attribution_touches
  TO service_role;

COMMENT ON TABLE public.ad_campaign_internal_test_events IS
  'Non-billable campaign events generated by restaurant owners/admins for diagnostics.';
COMMENT ON TABLE public.ad_campaign_attribution_touches IS
  'Opaque 24-hour sponsored click touches used to bridge anonymous clicks to authenticated conversions.';

-- ---------------------------------------------------------------------------
-- Paid event recording: strategy-specific pricing and budget-safe measurement
-- ---------------------------------------------------------------------------

DO $assert_single_existing_campaign_conversion_per_entity$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ad_campaign_events event
    WHERE event.event_type = 'conversion'
      AND NULLIF(trim(event.payload->>'entity_id'), '') IS NOT NULL
    GROUP BY
      event.restaurant_id,
      event.conversion_type,
      lower(trim(event.payload->>'entity_id'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'duplicate_campaign_conversion_entities_require_reconciliation';
  END IF;
END;
$assert_single_existing_campaign_conversion_per_entity$;

CREATE UNIQUE INDEX IF NOT EXISTS ad_campaign_conversion_entity_unique
  ON public.ad_campaign_events (
    restaurant_id,
    conversion_type,
    ((lower(trim(payload->>'entity_id'))))
  )
  WHERE event_type = 'conversion'
    AND NULLIF(trim(payload->>'entity_id'), '') IS NOT NULL;

-- A browser event id is not trusted for billing dedupe, but it is trusted as
-- a transport-idempotency token. The server fingerprint still determines the
-- billable delivery key; this independent index prevents a lost response from
-- charging the same call again after an anonymous-to-authenticated transition.
CREATE UNIQUE INDEX IF NOT EXISTS ad_campaign_event_transport_unique
  ON public.ad_campaign_events (
    campaign_id,
    event_type,
    ((lower(trim(payload->>'event_id'))))
  )
  WHERE event_type IN ('impression', 'click')
    AND COALESCE(payload->>'event_id', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- Keep the conversion state contract reproducible across production and
-- shadow/reset databases. `arrived` is a confirmed reservation outcome for
-- campaign attribution, while the Fair Growth fee remains deferred until the
-- restaurant explicitly closes the table through mark_reservation_honored.
CREATE OR REPLACE FUNCTION public.ad_campaign_conversion_entity_state(
  p_conversion_type text,
  p_entity_id uuid,
  p_restaurant_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_state text := 'missing';
BEGIN
  IF p_conversion_type = 'order' THEN
    SELECT CASE
      WHEN lower(COALESCE(entity.status, '')) IN (
        'cancelled', 'canceled', 'rejected', 'failed',
        'payment_failed', 'refunded'
      )
        OR lower(COALESCE(entity.payment_status, '')) IN (
          'cancelled', 'canceled', 'failed', 'payment_failed', 'refunded'
        )
        THEN 'terminal'
      WHEN lower(COALESCE(entity.status, '')) IN (
        'confirmed', 'preparing', 'ready', 'completed', 'delivered'
      )
        AND lower(COALESCE(entity.payment_status, '')) NOT IN (
          'pending', 'pending_payment', 'requires_payment', 'failed',
          'payment_failed', 'cancelled', 'canceled'
        )
        THEN 'confirmed'
      ELSE 'pending'
    END
    INTO v_state
    FROM public.orders entity
    WHERE entity.id = p_entity_id
      AND entity.restaurant_id = p_restaurant_id
      AND (p_user_id IS NULL OR entity.user_id = p_user_id)
    LIMIT 1;
  ELSIF p_conversion_type IN ('reservation', 'zero-attente') THEN
    SELECT CASE
      WHEN lower(COALESCE(entity.status, '')) IN (
        'cancelled', 'canceled', 'rejected', 'declined',
        'no_show', 'failed'
      )
        THEN 'terminal'
      WHEN lower(COALESCE(entity.status, '')) IN (
        'confirmed', 'arrived', 'seated', 'completed'
      )
        THEN 'confirmed'
      ELSE 'pending'
    END
    INTO v_state
    FROM public.reservations entity
    WHERE entity.id = p_entity_id
      AND entity.restaurant_id = p_restaurant_id
      AND (p_user_id IS NULL OR entity.user_id = p_user_id)
    LIMIT 1;
  ELSE
    RETURN 'missing';
  END IF;

  RETURN COALESCE(v_state, 'missing');
END;
$function$;

REVOKE ALL ON FUNCTION public.ad_campaign_conversion_entity_state(
  text, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_campaign_conversion_entity_state(
  text, uuid, uuid, uuid
) TO service_role;

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
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_rows integer := 0;
  v_requested_cost numeric := 0;
  v_billable_cost numeric := 0;
  v_campaign record;
  v_today date := CURRENT_DATE;
  v_effective_daily_spent numeric := 0;
  v_total_remaining numeric;
  v_daily_remaining numeric;
  v_previous_metric_write text :=
    COALESCE(current_setting('tok.internal_campaign_metric_write', true), 'off');
  v_entity_token text;
  v_entity_id uuid;
  v_entity_state text;
  v_pricing_strategy text;
  v_is_pricing_event boolean := false;
  v_budget_capped boolean := false;
  v_internal_dedupe_key text;
  v_tracking_call_id uuid;
  v_social_post_id uuid;
  v_social_event_id uuid;
  v_promotion_id uuid;
  v_touch_token_text text;
  v_touch_viewer_id text;
  v_attribution_touch public.ad_campaign_attribution_touches%ROWTYPE;
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'conversion') THEN
    RAISE EXCEPTION 'Invalid campaign event type: %', p_event_type;
  END IF;

  IF jsonb_typeof(COALESCE(p_payload, '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'campaign_event_payload_must_be_object';
  END IF;

  IF p_event_type <> 'conversion' THEN
    p_conversion_type := NULL;
  ELSIF p_conversion_type IS NULL
    OR p_conversion_type NOT IN ('order', 'reservation', 'zero-attente')
  THEN
    RAISE EXCEPTION 'Invalid conversion type: %', p_conversion_type;
  END IF;

  IF p_event_type = 'conversion' THEN
    v_entity_token := NULLIF(trim(COALESCE(p_payload->>'entity_id', '')), '');
    IF v_entity_token IS NULL
      OR v_entity_token !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN
      RETURN false;
    END IF;

    v_entity_id := v_entity_token::uuid;
    p_payload := COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
      'entity_id',
      v_entity_id::text
    );
    -- Every conversion path takes the entity lock before the campaign row and
    -- attribution touch. Triggers use the same order, preventing
    -- entity/campaign/touch deadlocks under concurrent confirmation.
    PERFORM pg_advisory_xact_lock(
      hashtext('ad_campaign_conversion_entity'),
      hashtext(concat_ws(
        '|',
        p_restaurant_id::text,
        p_conversion_type,
        v_entity_id::text
      ))
    );
  END IF;

  SELECT
    id,
    restaurant_id,
    total_budget,
    spent,
    budget_daily,
    daily_spent,
    daily_spent_date,
    status,
    payment_status,
    cpm_rate,
    cpc_rate,
    conversion_rate,
    pricing_strategy
  INTO v_campaign
  FROM public.ad_campaigns
  WHERE id = p_campaign_id
    AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(v_campaign.payment_status, '') <> 'paid'
    OR (
      p_event_type = 'conversion'
      AND COALESCE(v_campaign.status, '') IN (
        'draft', 'pending_payment', 'cancelled'
      )
    )
  THEN
    RETURN false;
  END IF;

  v_pricing_strategy := COALESCE(v_campaign.pricing_strategy, 'conversion');
  v_is_pricing_event := CASE v_pricing_strategy
    WHEN 'visibility' THEN p_event_type = 'impression'
    WHEN 'traffic' THEN p_event_type = 'click'
    WHEN 'conversion' THEN p_event_type = 'conversion'
    ELSE false
  END;

  -- Preserve the historical free/unlimited campaign behavior: a non-positive
  -- total budget measures events but does not add spend.
  IF COALESCE(v_campaign.total_budget, 0) > 0 AND v_is_pricing_event THEN
    v_requested_cost := CASE p_event_type
      WHEN 'impression' THEN round(
        greatest(COALESCE(v_campaign.cpm_rate, 9.50), 0) / 1000.0,
        6
      )
      WHEN 'click' THEN round(
        greatest(COALESCE(v_campaign.cpc_rate, 0.95), 0),
        6
      )
      WHEN 'conversion' THEN round(
        greatest(COALESCE(v_campaign.conversion_rate, 7.50), 0),
        6
      )
      ELSE 0
    END;
  END IF;

  v_effective_daily_spent := CASE
    WHEN v_campaign.daily_spent_date = v_today
      THEN greatest(COALESCE(v_campaign.daily_spent, 0), 0)
    ELSE 0
  END;
  v_total_remaining := CASE
    WHEN COALESCE(v_campaign.total_budget, 0) > 0
      THEN greatest(
        COALESCE(v_campaign.total_budget, 0)
          - greatest(COALESCE(v_campaign.spent, 0), 0),
        0
      )
    ELSE NULL
  END;
  v_daily_remaining := CASE
    WHEN COALESCE(v_campaign.budget_daily, 0) > 0
      THEN greatest(COALESCE(v_campaign.budget_daily, 0) - v_effective_daily_spent, 0)
    ELSE NULL
  END;
  v_billable_cost := least(
    v_requested_cost,
    COALESCE(v_total_remaining, v_requested_cost),
    COALESCE(v_daily_remaining, v_requested_cost)
  );
  v_budget_capped := v_billable_cost < v_requested_cost;

  -- Internal traffic is observable but is never mixed into paid delivery,
  -- spend or campaign counters.
  IF public.is_restaurant_internal_actor(p_user_id, p_restaurant_id) THEN
    v_internal_dedupe_key := COALESCE(
      NULLIF(trim(COALESCE(p_dedupe_key, '')), ''),
      encode(
        digest(
          concat_ws(
            '|',
            'internal-test',
            p_campaign_id::text,
            p_event_type,
            COALESCE(p_conversion_type, ''),
            COALESCE(p_user_id::text, ''),
            clock_timestamp()::text
          ),
          'sha256'
        ),
        'hex'
      )
    );

    BEGIN
      v_tracking_call_id := NULLIF(
        COALESCE(p_payload->>'trackingCallId', p_payload->>'tracking_call_id'),
        ''
      )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_tracking_call_id := NULL;
    END;
    BEGIN
      v_social_post_id := NULLIF(p_payload->>'social_post_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_social_post_id := NULL;
    END;
    BEGIN
      v_social_event_id := NULLIF(p_payload->>'social_event_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_social_event_id := NULL;
    END;
    BEGIN
      v_promotion_id := NULLIF(p_payload->>'promotion_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_promotion_id := NULL;
    END;
    BEGIN
      v_entity_id := NULLIF(p_payload->>'entity_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_entity_id := NULL;
    END;

    INSERT INTO public.ad_campaign_internal_test_events (
      campaign_id,
      restaurant_id,
      event_type,
      raw_event_type,
      conversion_type,
      entity_id,
      actor_user_id,
      social_post_id,
      social_event_id,
      promotion_id,
      tracking_call_id,
      dedupe_key,
      pricing_strategy,
      source,
      page,
      payload
    )
    VALUES (
      p_campaign_id,
      p_restaurant_id,
      p_event_type,
      COALESCE(p_payload->>'raw_event_type', p_event_type),
      p_conversion_type,
      v_entity_id,
      p_user_id,
      v_social_post_id,
      v_social_event_id,
      v_promotion_id,
      v_tracking_call_id,
      v_internal_dedupe_key,
      v_pricing_strategy,
      p_source,
      p_page,
      COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
        'tracking_outcome', 'excluded_internal_actor',
        'listed_cost_chf', v_requested_cost,
        'charged_cost_chf', 0,
        'unbilled_cost_chf', 0,
        'pricing_strategy', v_pricing_strategy,
        'billable_event', false,
        'requested_cost', v_requested_cost,
        'charged_cost', 0,
        'billable', false
      )
    )
    ON CONFLICT (campaign_id, event_type, dedupe_key) DO NOTHING;

    RETURN false;
  END IF;

  IF p_event_type = 'conversion' THEN
    v_entity_state := public.ad_campaign_conversion_entity_state(
      p_conversion_type,
      v_entity_id,
      p_restaurant_id,
      p_user_id
    );

    IF v_entity_state IN ('missing', 'terminal') THEN
      RETURN false;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.ad_campaign_events existing
      WHERE existing.restaurant_id = p_restaurant_id
        AND existing.event_type = 'conversion'
        AND existing.conversion_type = p_conversion_type
        AND lower(trim(existing.payload->>'entity_id')) = v_entity_id::text
    ) THEN
      RETURN false;
    END IF;

    -- When an attribution token is supplied, validate and claim it under the
    -- same transaction/row lock as the conversion. This closes the read/update
    -- race in callers that use a service-role Edge Function.
    v_touch_token_text := NULLIF(trim(COALESCE(
      p_payload->>'touch_token',
      p_payload->>'touchToken',
      p_payload->>'attribution_touch_id',
      ''
    )), '');
    IF v_touch_token_text IS NOT NULL THEN
      IF p_user_id IS NULL
        OR v_touch_token_text !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN
        RETURN false;
      END IF;

      v_touch_viewer_id := NULLIF(trim(COALESCE(
        p_payload->>'viewer_id',
        p_payload->>'viewerId',
        ''
      )), '');
      SELECT touch.*
      INTO v_attribution_touch
      FROM public.ad_campaign_attribution_touches touch
      WHERE touch.id = v_touch_token_text::uuid
      FOR UPDATE;

      IF NOT FOUND
        OR v_attribution_touch.campaign_id <> p_campaign_id
        OR v_attribution_touch.restaurant_id <> p_restaurant_id
        OR (
          v_attribution_touch.user_id IS NOT NULL
          AND v_attribution_touch.user_id <> p_user_id
        )
        OR (
          v_attribution_touch.user_id IS NULL
          AND (
            v_touch_viewer_id IS NULL
            OR v_attribution_touch.viewer_id <> v_touch_viewer_id
          )
        )
        OR (
          v_attribution_touch.status = 'converted'
          AND (
            v_attribution_touch.entity_id <> v_entity_id
            OR v_attribution_touch.conversion_type <> p_conversion_type
          )
        )
        OR (
          v_attribution_touch.status <> 'converted'
          AND (
            v_attribution_touch.status NOT IN ('active', 'claimed')
            OR v_attribution_touch.expires_at <= now()
          )
        )
      THEN
        RETURN false;
      END IF;

      UPDATE public.ad_campaign_attribution_touches touch
      SET
        user_id = COALESCE(touch.user_id, p_user_id),
        claimed_by_user_id = COALESCE(
          touch.claimed_by_user_id,
          p_user_id
        ),
        claimed_at = COALESCE(touch.claimed_at, now()),
        status = CASE
          WHEN touch.status = 'converted' THEN 'converted'
          ELSE 'claimed'
        END,
        last_used_at = now(),
        updated_at = now()
      WHERE touch.id = v_attribution_touch.id;
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
        COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
          'attribution_state', 'pending_confirmation',
          'listed_cost_chf', v_requested_cost,
          'charged_cost_chf', 0,
          'unbilled_cost_chf', 0,
          'pricing_strategy', v_pricing_strategy,
          'billable_event', v_is_pricing_event,
          'campaign_billing', jsonb_build_object(
            'pricing_strategy', v_pricing_strategy,
            'pricing_event', v_is_pricing_event,
            'requested_cost', v_requested_cost
          )
        ),
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
        expires_at = greatest(
          public.ad_campaign_pending_conversions.expires_at,
          EXCLUDED.expires_at
        ),
        last_error = NULL,
        updated_at = now();

      RETURN true;
    END IF;
  END IF;

  -- A confirmed conversion is always measured. When the selected strategy
  -- makes it billable, the charge is capped at both remaining budgets.
  -- Non-conversion pricing events keep the historical delivery stop once no
  -- budget remains; non-pricing events remain measurable at zero cost.
  IF p_event_type <> 'conversion'
    AND v_is_pricing_event
    AND v_requested_cost > 0
    AND v_billable_cost < v_requested_cost
  THEN
    RETURN false;
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
    COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
      'listed_cost_chf', CASE
        WHEN v_is_pricing_event THEN v_requested_cost
        ELSE 0
      END,
      'charged_cost_chf', CASE
        WHEN v_is_pricing_event THEN v_billable_cost
        ELSE 0
      END,
      'unbilled_cost_chf', CASE
        WHEN v_is_pricing_event
          THEN greatest(v_requested_cost - v_billable_cost, 0)
        ELSE 0
      END,
      'pricing_strategy', v_pricing_strategy,
      'billable_event', v_is_pricing_event,
      'campaign_billing', jsonb_build_object(
        'pricing_strategy', v_pricing_strategy,
        'pricing_event', v_is_pricing_event,
        'requested_cost', v_requested_cost,
        'charged_cost', v_billable_cost,
        'budget_capped', v_budget_capped
      )
    )
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  IF p_event_type = 'conversion'
    AND v_attribution_touch.id IS NOT NULL
  THEN
    UPDATE public.ad_campaign_attribution_touches touch
    SET
      status = 'converted',
      conversion_type = p_conversion_type,
      entity_id = v_entity_id,
      converted_at = COALESCE(touch.converted_at, now()),
      last_used_at = now(),
      updated_at = now()
    WHERE touch.id = v_attribution_touch.id;
  END IF;

  PERFORM set_config('tok.internal_campaign_metric_write', 'on', true);

  UPDATE public.ad_campaigns
  SET
    impressions = COALESCE(impressions, 0)
      + CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END,
    clicks = COALESCE(clicks, 0)
      + CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
    conversions = COALESCE(conversions, 0)
      + CASE WHEN p_event_type = 'conversion' THEN 1 ELSE 0 END,
    spent = greatest(COALESCE(spent, 0), 0) + v_billable_cost,
    daily_spent = CASE
      WHEN daily_spent_date IS DISTINCT FROM v_today THEN v_billable_cost
      ELSE greatest(COALESCE(daily_spent, 0), 0) + v_billable_cost
    END,
    daily_spent_date = v_today,
    updated_at = now()
  WHERE id = p_campaign_id
    AND restaurant_id = p_restaurant_id;

  PERFORM set_config(
    'tok.internal_campaign_metric_write',
    v_previous_metric_write,
    true
  );

  RETURN true;
END;
$function$;

-- Preserve the existing production ACL.
REVOKE ALL ON FUNCTION public.record_ad_campaign_event(
  uuid, uuid, text, text, uuid, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_campaign_event(
  uuid, uuid, text, text, uuid, text, text, jsonb, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Social tracking v2: wrap the legacy multi-campaign metrics writer, then
-- materialize one deterministic winning touch for this exact transport call.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_social_feed_event_v2(
  p_post_id uuid,
  p_event_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_auth_user_id uuid := (SELECT auth.uid());
  v_request_role text := COALESCE(
    current_setting('request.jwt.claim.role', true),
    ''
  );
  v_request_headers jsonb := '{}'::jsonb;
  v_client_ip text;
  v_user_agent text;
  v_tracking_call_token text;
  v_tracking_call_id uuid;
  v_tracking_call_generated boolean := false;
  v_viewer_id text;
  v_metadata jsonb;
  v_first_event_id uuid;
  v_existing_call record;
  v_event record;
  v_existing_touch public.ad_campaign_attribution_touches%ROWTYPE;
  v_touch_token uuid;
  v_first_campaign_id uuid;
  v_first_restaurant_id uuid;
  v_first_touch_token uuid;
  v_attributions jsonb := '[]'::jsonb;
  v_internal_test boolean := false;
  v_internal_dedupe_key text;
  v_campaign_event_dedupe_key text;
  v_touch_dedupe_key text;
BEGIN
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'social_event_metadata_must_be_object';
  END IF;
  IF pg_column_size(COALESCE(p_metadata, '{}'::jsonb)) > 16384 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'social_event_metadata_too_large';
  END IF;
  IF char_length(COALESCE(p_metadata->>'source', p_metadata->>'placement', '')) > 256
    OR char_length(COALESCE(p_metadata->>'page', p_metadata->>'source_page', '')) > 256
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'social_event_source_or_page_too_long';
  END IF;

  BEGIN
    v_request_headers := COALESCE(
      NULLIF(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_request_headers := '{}'::jsonb;
  END;

  v_tracking_call_token := NULLIF(trim(COALESCE(
    p_metadata->>'trackingCallId',
    p_metadata->>'tracking_call_id',
    ''
  )), '');
  IF v_tracking_call_token IS NULL THEN
    v_tracking_call_id := gen_random_uuid();
    v_tracking_call_generated := true;
  ELSIF v_tracking_call_token ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    v_tracking_call_id := v_tracking_call_token::uuid;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_social_tracking_call_id';
  END IF;

  -- Authenticated callers are keyed by their verified user id. Anonymous
  -- callers are keyed by proxy-derived request properties instead of a
  -- rotatable browser value, closing the paid-event dedupe bypass in the
  -- legacy writer wrapped below. Trusted service-role callers retain an
  -- explicit viewer for administrative replays.
  IF v_auth_user_id IS NOT NULL THEN
    v_viewer_id := v_auth_user_id::text;
  ELSIF v_request_role = 'service_role' THEN
    v_viewer_id := NULLIF(trim(COALESCE(
      p_metadata->>'viewerId',
      p_metadata->>'viewer_id',
      'service-role'
    )), '');
  ELSE
    v_client_ip := NULLIF(trim(COALESCE(
      v_request_headers->>'cf-connecting-ip',
      v_request_headers->>'x-real-ip',
      regexp_replace(
        COALESCE(v_request_headers->>'x-forwarded-for', ''),
        E'^.*,\\s*',
        ''
      ),
      ''
    )), '');
    v_user_agent := left(
      COALESCE(v_request_headers->>'user-agent', 'unknown'),
      512
    );
    IF v_client_ip IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'anonymous_social_identity_unavailable';
    END IF;
    v_viewer_id := 'anon:' || encode(
      extensions.digest(
        concat_ws('|', 'social-feed', v_client_ip, v_user_agent),
        'sha256'
      ),
      'hex'
    );
  END IF;
  IF char_length(v_viewer_id) > 256 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_social_tracking_viewer_id';
  END IF;

  v_metadata := (
    COALESCE(p_metadata, '{}'::jsonb)
      - 'trackingCallId'
      - 'tracking_call_id'
      - 'viewerId'
      - 'viewer_id'
      - 'trackingEventType'
  ) || jsonb_build_object(
    'trackingCallId', v_tracking_call_id,
    'viewerId', v_viewer_id,
    'trackingEventType', p_event_type
  );

  PERFORM pg_advisory_xact_lock(
    hashtext('record_social_feed_event_v2'),
    hashtext(v_tracking_call_id::text)
  );

  SELECT event.*
  INTO v_existing_call
  FROM public.social_feed_events event
  WHERE event.metadata->>'trackingCallId' = v_tracking_call_id::text
  ORDER BY
    CASE
      WHEN event.metadata->>'trackingWinnerEventId' = event.id::text THEN 0
      ELSE 1
    END,
    event.created_at,
    event.id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_call.post_id IS DISTINCT FROM p_post_id
      OR v_existing_call.event_type IS DISTINCT FROM p_event_type
      OR (
        v_existing_call.user_id IS NOT NULL
        AND v_existing_call.user_id
          <> '00000000-0000-0000-0000-000000000000'::uuid
        AND v_existing_call.user_id IS DISTINCT FROM v_auth_user_id
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'social_tracking_call_id_conflict';
    END IF;
    -- An exact transport replay keeps the identity recorded by the first
    -- successful call, even if an anonymous browser changed network before
    -- retrying or authenticated in the meantime.
    v_viewer_id := COALESCE(
      NULLIF(v_existing_call.metadata->>'viewerId', ''),
      v_viewer_id
    );
    v_first_event_id := v_existing_call.id;
    v_metadata := v_existing_call.metadata;
  ELSE
    v_first_event_id := public.record_social_feed_event(
      p_post_id,
      p_event_type,
      v_metadata
    );
    UPDATE public.social_feed_events event
    SET metadata = COALESCE(event.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'trackingWinnerEventId',
        v_first_event_id
      )
    WHERE event.post_id = p_post_id
      AND event.metadata->>'trackingCallId' = v_tracking_call_id::text;
  END IF;

  FOR v_event IN
    SELECT event.*
    FROM public.social_feed_events event
    WHERE event.post_id = p_post_id
      AND event.metadata->>'trackingCallId' = v_tracking_call_id::text
    ORDER BY event.created_at, event.id
  LOOP
    IF COALESCE(v_event.is_internal_actor, false) THEN
      v_internal_test := true;
      IF v_event.campaign_id IS NOT NULL
        AND p_event_type IN ('impression', 'click', 'cta_click')
      THEN
        v_internal_dedupe_key := encode(
          extensions.digest(
            concat_ws(
              '|',
              'actualites-internal',
              v_event.campaign_id::text,
              CASE WHEN p_event_type = 'cta_click' THEN 'click' ELSE p_event_type END,
              v_tracking_call_id::text
            ),
            'sha256'
          ),
          'hex'
        );

        INSERT INTO public.ad_campaign_internal_test_events (
          campaign_id,
          restaurant_id,
          event_type,
          raw_event_type,
          actor_user_id,
          social_post_id,
          social_event_id,
          promotion_id,
          tracking_call_id,
          dedupe_key,
          pricing_strategy,
          source,
          page,
          payload
        )
        SELECT
          v_event.campaign_id,
          v_event.restaurant_id,
          CASE WHEN p_event_type = 'cta_click' THEN 'click' ELSE p_event_type END,
          p_event_type,
          v_auth_user_id,
          v_event.post_id,
          v_event.id,
          v_event.promotion_id,
          v_tracking_call_id,
          v_internal_dedupe_key,
          campaign.pricing_strategy,
          v_event.source,
          v_event.page,
          jsonb_build_object(
            'tracking_outcome', 'excluded_internal_actor',
            'trackingCallId', v_tracking_call_id,
            'social_event_metadata', v_metadata
          )
        FROM public.ad_campaigns campaign
        WHERE campaign.id = v_event.campaign_id
          AND campaign.restaurant_id = v_event.restaurant_id
        ON CONFLICT (campaign_id, event_type, dedupe_key) DO NOTHING;
      END IF;

      IF v_event.campaign_id IS NOT NULL THEN
        v_first_campaign_id := COALESCE(
          v_first_campaign_id,
          v_event.campaign_id
        );
        v_first_restaurant_id := COALESCE(
          v_first_restaurant_id,
          v_event.restaurant_id
        );
        v_attributions := v_attributions || jsonb_build_array(
          jsonb_build_object(
            'campaignId', v_event.campaign_id,
            'restaurantId', v_event.restaurant_id,
            'touchToken', NULL,
            'viewerId', v_viewer_id,
            'internalTest', true
          )
        );
      END IF;
      CONTINUE;
    END IF;

    IF v_event.campaign_id IS NULL
      OR p_event_type NOT IN ('click', 'cta_click')
      -- The legacy writer orders eligible promotions by boost weight then
      -- recency. Only that first delivered campaign receives the conversion
      -- touch; otherwise equal timestamps would make a random UUID choose the
      -- eventual campaign winner.
      OR v_event.id IS DISTINCT FROM v_first_event_id
    THEN
      CONTINUE;
    END IF;

    -- The legacy writer inserts a social row before attempting the paid event.
    -- A touch is valid only when that paid click was accepted, or when this is
    -- a true replay of an already accepted click in the server dedupe bucket.
    v_campaign_event_dedupe_key := encode(
      extensions.digest(
        concat_ws(
          '|',
          v_event.campaign_id::text,
          p_post_id::text,
          p_event_type,
          v_viewer_id,
          current_date::text,
          COALESCE(v_event.source, ''),
          COALESCE(v_event.page, '')
        ),
        'sha256'
      ),
      'hex'
    );
    IF NOT EXISTS (
      SELECT 1
      FROM public.ad_campaign_events campaign_event
      WHERE campaign_event.campaign_id = v_event.campaign_id
        AND campaign_event.restaurant_id = v_event.restaurant_id
        AND campaign_event.event_type = 'click'
        AND (
          campaign_event.dedupe_key = v_campaign_event_dedupe_key
          OR campaign_event.payload->>'social_event_id' = v_event.id::text
        )
    ) THEN
      CONTINUE;
    END IF;

    -- Billing dedupe and attribution identity are intentionally separate:
    -- several real clicks in one paid-delivery bucket remain one billable
    -- click, but each transport call gets its own reusable last-click touch.
    v_touch_dedupe_key := encode(
      extensions.digest(
        concat_ws(
          '|',
          'social-touch',
          v_event.campaign_id::text,
          v_tracking_call_id::text
        ),
        'sha256'
      ),
      'hex'
    );
    PERFORM pg_advisory_xact_lock(
      hashtext('social_campaign_touch'),
      hashtext(concat_ws(
        '|',
        v_event.campaign_id::text,
        v_touch_dedupe_key
      ))
    );
    v_touch_token := NULL;

    SELECT touch.*
    INTO v_existing_touch
    FROM public.ad_campaign_attribution_touches touch
    WHERE touch.campaign_id = v_event.campaign_id
      AND (
        touch.tracking_call_id = v_tracking_call_id
        OR touch.dedupe_key = v_touch_dedupe_key
      )
    ORDER BY
      CASE
        WHEN touch.tracking_call_id = v_tracking_call_id THEN 0
        ELSE 1
      END,
      touch.touched_at,
      touch.id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_touch.viewer_id IS DISTINCT FROM v_viewer_id
        OR (
          v_existing_touch.user_id IS NOT NULL
          AND v_existing_touch.user_id IS DISTINCT FROM v_auth_user_id
        )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'social_tracking_identity_conflict';
      END IF;

      UPDATE public.ad_campaign_attribution_touches touch
      SET
        user_id = COALESCE(touch.user_id, v_auth_user_id),
        claimed_by_user_id = COALESCE(
          touch.claimed_by_user_id,
          v_auth_user_id
        ),
        claimed_at = CASE
          WHEN v_auth_user_id IS NOT NULL
            THEN COALESCE(touch.claimed_at, now())
          ELSE touch.claimed_at
        END,
        status = CASE
          WHEN touch.status = 'active' AND v_auth_user_id IS NOT NULL
            THEN 'claimed'
          ELSE touch.status
        END,
        updated_at = now()
      WHERE touch.id = v_existing_touch.id
      RETURNING touch.id INTO v_touch_token;
    ELSE
      INSERT INTO public.ad_campaign_attribution_touches (
        campaign_id,
        restaurant_id,
        social_post_id,
        social_event_id,
        promotion_id,
        tracking_call_id,
        event_type,
        viewer_id,
        dedupe_key,
        user_id,
        claimed_by_user_id,
        claimed_at,
        status,
        source,
        page,
        metadata,
        touched_at,
        expires_at
      )
      VALUES (
        v_event.campaign_id,
        v_event.restaurant_id,
        v_event.post_id,
        v_event.id,
        v_event.promotion_id,
        v_tracking_call_id,
        p_event_type,
        v_viewer_id,
        v_touch_dedupe_key,
        v_auth_user_id,
        v_auth_user_id,
        CASE WHEN v_auth_user_id IS NOT NULL THEN now() ELSE NULL END,
        CASE WHEN v_auth_user_id IS NOT NULL THEN 'claimed' ELSE 'active' END,
        v_event.source,
        v_event.page,
        jsonb_build_object(
          'trackingCallId', v_tracking_call_id,
          'raw_event_type', p_event_type
        ),
        v_event.created_at,
        v_event.created_at + interval '24 hours'
      )
      RETURNING id INTO v_touch_token;
    END IF;

    IF v_touch_token IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'social_tracking_identity_conflict';
    END IF;

    v_first_campaign_id := COALESCE(v_first_campaign_id, v_event.campaign_id);
    v_first_restaurant_id := COALESCE(v_first_restaurant_id, v_event.restaurant_id);
    v_first_touch_token := COALESCE(v_first_touch_token, v_touch_token);
    v_attributions := v_attributions || jsonb_build_array(
      jsonb_build_object(
        'campaignId', v_event.campaign_id,
        'restaurantId', v_event.restaurant_id,
        'touchToken', v_touch_token,
        'viewerId', v_viewer_id
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'eventId', v_first_event_id,
    'trackingCallId', v_tracking_call_id,
    'trackingCallIdGenerated', v_tracking_call_generated,
    'viewerId', v_viewer_id,
    'viewer_id', v_viewer_id,
    'campaignId', v_first_campaign_id,
    'restaurantId', v_first_restaurant_id,
    'touchToken', v_first_touch_token,
    'attributions', v_attributions,
    'internalTest', v_internal_test
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_social_feed_event_v2(uuid, text, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_social_feed_event_v2(uuid, text, jsonb)
  TO anon, authenticated, service_role;

-- All clients use the hardened wrapper above. Leaving the legacy writer
-- executable would let callers bypass its server-derived anonymous identity.
REVOKE ALL ON FUNCTION public.record_social_feed_event(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_social_feed_event(uuid, text, jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Consume one or more touch tokens embedded in an order/reservation metadata
-- object. Supported keys intentionally cover camelCase and SQL-style payloads:
--   scalar: campaignAttributionTouchToken / campaign_attribution_touch_token
--   array:  campaignAttributionTouchTokens / campaign_attribution_touch_tokens
--   objects: campaignAttributions / campaign_attributions [{ touchToken }]
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private_campaign.record_actualites_touch_conversions(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_conversion_type text,
  p_entity_id uuid,
  p_entity_metadata jsonb DEFAULT '{}'::jsonb,
  p_payment_method text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_viewer_id text;
  v_touch public.ad_campaign_attribution_touches%ROWTYPE;
  v_dedupe_key text;
  v_recorded boolean := false;
  v_event_exists boolean := false;
  v_recorded_any boolean := false;
BEGIN
  IF p_user_id IS NULL
    OR p_restaurant_id IS NULL
    OR p_entity_id IS NULL
    OR p_conversion_type NOT IN ('order', 'reservation', 'zero-attente')
    OR jsonb_typeof(COALESCE(p_entity_metadata, '{}'::jsonb)) IS DISTINCT FROM 'object'
  THEN
    RETURN false;
  END IF;

  v_viewer_id := NULLIF(trim(COALESCE(
    p_entity_metadata->>'campaignAttributionViewerId',
    p_entity_metadata->>'campaign_attribution_viewer_id',
    p_entity_metadata->>'attributionViewerId',
    p_entity_metadata->>'attribution_viewer_id',
    p_entity_metadata->>'viewerId',
    p_entity_metadata->>'viewer_id',
    ''
  )), '');

  -- Even if a malformed client submits several tokens, only the most recent
  -- eligible touch can win this entity. This keeps one reservation/order tied
  -- to one paid campaign and mirrors last-click attribution.
  SELECT touch.*
  INTO v_touch
  FROM public.ad_campaign_attribution_touches touch
  JOIN (
    SELECT DISTINCT candidates.token
    FROM (
      SELECT NULLIF(COALESCE(
        p_entity_metadata->>'campaignAttributionTouchToken',
        p_entity_metadata->>'campaign_attribution_touch_token',
        p_entity_metadata->>'attributionTouchToken',
        p_entity_metadata->>'attribution_touch_token'
      ), '') AS token
      UNION ALL
      SELECT NULLIF(value #>> '{}', '')
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p_entity_metadata->'campaignAttributionTouchTokens') = 'array'
            THEN p_entity_metadata->'campaignAttributionTouchTokens'
          WHEN jsonb_typeof(p_entity_metadata->'campaign_attribution_touch_tokens') = 'array'
            THEN p_entity_metadata->'campaign_attribution_touch_tokens'
          ELSE '[]'::jsonb
        END
      ) value
      UNION ALL
      SELECT NULLIF(COALESCE(value->>'touchToken', value->>'touch_token'), '')
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p_entity_metadata->'campaignAttributions') = 'array'
            THEN p_entity_metadata->'campaignAttributions'
          WHEN jsonb_typeof(p_entity_metadata->'campaign_attributions') = 'array'
            THEN p_entity_metadata->'campaign_attributions'
          ELSE '[]'::jsonb
        END
      ) value
    ) candidates
    WHERE candidates.token ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) supplied
    ON touch.id::text = supplied.token
  WHERE touch.restaurant_id = p_restaurant_id
    AND (
      (touch.user_id IS NOT NULL AND touch.user_id = p_user_id)
      OR (
        touch.user_id IS NULL
        AND v_viewer_id IS NOT NULL
        AND touch.viewer_id = v_viewer_id
      )
    )
    AND (
      (touch.status IN ('active', 'claimed') AND touch.expires_at > now())
      OR (
        touch.status = 'converted'
        AND touch.entity_id = p_entity_id
        AND touch.conversion_type = p_conversion_type
      )
    )
  ORDER BY touch.touched_at DESC, touch.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_touch.status = 'converted' THEN
    RETURN true;
  END IF;

  v_dedupe_key := encode(
    extensions.digest(
      concat_ws(
        '|',
        'actualites-touch',
        v_touch.campaign_id::text,
        p_conversion_type,
        p_entity_id::text
      ),
      'sha256'
    ),
    'hex'
  );

  SELECT public.record_ad_campaign_event(
    v_touch.campaign_id,
    p_restaurant_id,
    'conversion',
    v_dedupe_key,
    p_user_id,
    COALESCE(v_touch.source, 'actualites'),
    COALESCE(v_touch.page, 'actualites'),
    jsonb_build_object(
      'conversion_type', p_conversion_type,
      'entity_id', p_entity_id,
      'social_post_id', v_touch.social_post_id,
      'social_event_id', v_touch.social_event_id,
      'promotion_id', v_touch.promotion_id,
      'attribution_touch_id', v_touch.id,
      'touch_token', v_touch.id,
      'trackingCallId', v_touch.tracking_call_id,
      'viewerId', v_touch.viewer_id,
      'payment_method', p_payment_method,
      'attribution_window_hours', 24
    ),
    p_conversion_type
  ) INTO v_recorded;

  SELECT EXISTS (
    SELECT 1
    FROM public.ad_campaign_events event
    WHERE event.campaign_id = v_touch.campaign_id
      AND event.restaurant_id = p_restaurant_id
      AND event.event_type = 'conversion'
      AND event.dedupe_key = v_dedupe_key
  ) INTO v_event_exists;

  IF v_event_exists THEN
    UPDATE public.ad_campaign_attribution_touches
    SET
      user_id = COALESCE(user_id, p_user_id),
      claimed_by_user_id = COALESCE(claimed_by_user_id, p_user_id),
      claimed_at = COALESCE(claimed_at, now()),
      status = 'converted',
      conversion_type = p_conversion_type,
      entity_id = p_entity_id,
      converted_at = COALESCE(converted_at, now()),
      last_used_at = now(),
      updated_at = now()
    WHERE id = v_touch.id;

    IF v_recorded AND v_touch.social_post_id IS NOT NULL THEN
      INSERT INTO public.social_post_metrics_daily (
        post_id,
        metric_date,
        campaign_conversions_count
      )
      VALUES (v_touch.social_post_id, current_date, 1)
      ON CONFLICT (post_id, metric_date) DO UPDATE
      SET
        campaign_conversions_count =
          public.social_post_metrics_daily.campaign_conversions_count + 1,
        updated_at = now();
    END IF;

    v_recorded_any := true;
  ELSIF v_recorded THEN
    -- A pending business entity has claimed this touch, but it is not a
    -- conversion until the entity reaches a confirmed state.
    UPDATE public.ad_campaign_attribution_touches
    SET
      user_id = COALESCE(user_id, p_user_id),
      claimed_by_user_id = COALESCE(claimed_by_user_id, p_user_id),
      claimed_at = COALESCE(claimed_at, now()),
      status = 'claimed',
      last_used_at = now(),
      updated_at = now()
    WHERE id = v_touch.id;

    v_recorded_any := true;
  END IF;

  RETURN v_recorded_any;
END;
$function$;

REVOKE ALL ON FUNCTION private_campaign.record_actualites_touch_conversions(
  uuid, uuid, text, uuid, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private_campaign.record_actualites_internal_test_conversion(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_conversion_type text,
  p_entity_id uuid,
  p_payment_method text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event record;
  v_dedupe_key text;
BEGIN
  IF p_user_id IS NULL
    OR p_restaurant_id IS NULL
    OR p_entity_id IS NULL
    OR p_conversion_type NOT IN ('order', 'reservation', 'zero-attente')
    OR NOT public.is_restaurant_internal_actor(p_user_id, p_restaurant_id)
  THEN
    RETURN;
  END IF;

  FOR v_event IN
    SELECT DISTINCT ON (event.campaign_id)
      event.*
    FROM public.social_feed_events event
    WHERE event.user_id = p_user_id
      AND event.restaurant_id = p_restaurant_id
      AND event.campaign_id IS NOT NULL
      AND event.event_type IN ('click', 'cta_click')
      AND event.is_internal_actor
      AND event.created_at >= now() - interval '24 hours'
    ORDER BY
      event.campaign_id,
      CASE WHEN event.event_type = 'cta_click' THEN 0 ELSE 1 END,
      event.created_at DESC
  LOOP
    v_dedupe_key := encode(
      extensions.digest(
        concat_ws(
          '|',
          'actualites-internal-conversion',
          v_event.campaign_id::text,
          p_conversion_type,
          p_entity_id::text
        ),
        'sha256'
      ),
      'hex'
    );

    PERFORM public.record_ad_campaign_event(
      v_event.campaign_id,
      p_restaurant_id,
      'conversion',
      v_dedupe_key,
      p_user_id,
      COALESCE(v_event.source, 'actualites'),
      COALESCE(v_event.page, 'actualites'),
      jsonb_build_object(
        'conversion_type', p_conversion_type,
        'entity_id', p_entity_id,
        'social_post_id', v_event.post_id,
        'social_event_id', v_event.id,
        'promotion_id', v_event.promotion_id,
        'payment_method', p_payment_method,
        'tracking_outcome', 'excluded_internal_actor'
      ),
      p_conversion_type
    );
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION private_campaign.record_actualites_internal_test_conversion(
  uuid, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

-- The compatibility fallback is deliberately single-winner: when no opaque
-- touch is supplied, the most recent authenticated Actualites click wins.
-- This avoids letting campaign-id iteration decide the winner after the
-- cross-campaign conversion uniqueness guard is installed.
CREATE OR REPLACE FUNCTION private_campaign.record_actualites_latest_click_conversion(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_conversion_type text,
  p_entity_id uuid,
  p_payment_method text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event record;
  v_dedupe_key text;
  v_recorded boolean := false;
  v_payment_method text := NULLIF(
    lower(trim(COALESCE(p_payment_method, ''))),
    ''
  );
  v_journey_type text;
  v_entity_metadata jsonb := '{}'::jsonb;
  v_delivery_address text;
  v_entity_mode text;
  v_feature text;
BEGIN
  IF p_user_id IS NULL
    OR p_restaurant_id IS NULL
    OR p_entity_id IS NULL
    OR p_conversion_type NOT IN ('order', 'reservation', 'zero-attente')
  THEN
    RETURN false;
  END IF;

  IF p_conversion_type = 'order' THEN
    SELECT
      COALESCE(entity.metadata, '{}'::jsonb),
      NULLIF(trim(COALESCE(entity.delivery_address, '')), ''),
      NULLIF(lower(trim(COALESCE(
        entity.metadata->>'order_mode',
        entity.metadata->>'orderMode',
        entity.metadata->>'fulfillment',
        entity.metadata->>'fulfillment_type',
        entity.type,
        entity.source,
        ''
      ))), '')
    INTO v_entity_metadata, v_delivery_address, v_entity_mode
    FROM public.orders entity
    WHERE entity.id = p_entity_id
      AND entity.restaurant_id = p_restaurant_id
      AND entity.user_id = p_user_id;

    IF NOT FOUND THEN
      RETURN false;
    END IF;
    v_payment_method := COALESCE(
      v_payment_method,
      NULLIF(lower(trim(COALESCE(
        v_entity_metadata->>'payment_method',
        ''
      ))), ''),
      NULLIF(lower(trim(COALESCE(
        v_entity_metadata->>'paymentMethod',
        ''
      ))), '')
    );
    v_journey_type := CASE
      WHEN v_entity_mode IN ('delivery', 'livraison') THEN 'delivery'
      WHEN v_entity_mode IN (
        'takeaway', 'pickup', 'emporter', 'a_emporter',
        'click_collect', 'collect'
      ) THEN 'takeaway'
      WHEN v_delivery_address IS NOT NULL THEN 'delivery'
      ELSE 'takeaway'
    END;
  ELSE
    SELECT
      COALESCE(entity.metadata, '{}'::jsonb),
      NULLIF(lower(trim(COALESCE(entity.feature, ''))), ''),
      COALESCE(
        v_payment_method,
        NULLIF(lower(trim(COALESCE(entity.payment_method, ''))), '')
      )
    INTO v_entity_metadata, v_feature, v_payment_method
    FROM public.reservations entity
    WHERE entity.id = p_entity_id
      AND entity.restaurant_id = p_restaurant_id
      AND entity.user_id = p_user_id;

    IF NOT FOUND THEN
      RETURN false;
    END IF;
    v_payment_method := COALESCE(
      v_payment_method,
      NULLIF(lower(trim(COALESCE(
        v_entity_metadata->>'payment_method',
        ''
      ))), ''),
      NULLIF(lower(trim(COALESCE(
        v_entity_metadata->>'paymentMethod',
        ''
      ))), '')
    );
    v_journey_type := CASE
      WHEN p_conversion_type = 'zero-attente'
        OR v_feature IN ('zero-attente', 'zero_attente', 'zero attente')
        OR lower(COALESCE(v_entity_metadata->>'feature', ''))
          IN ('zero-attente', 'zero_attente', 'zero attente')
        THEN 'zero-attente'
      ELSE 'reservation'
    END;
  END IF;

  v_payment_method := CASE
    WHEN v_payment_method IN (
      'cash', 'especes', 'cash_on_delivery', 'on_site', 'onsite'
    ) THEN 'cash'
    WHEN v_payment_method IN (
      'card', 'carte', 'stripe', 'credit_card', 'debit_card'
    ) THEN 'card'
    WHEN v_payment_method = 'twint' THEN 'twint'
    WHEN v_payment_method IN ('unknown', 'null', 'undefined', '')
      THEN NULL
    ELSE v_payment_method
  END;
  IF v_payment_method IS NULL AND v_journey_type = 'reservation' THEN
    v_payment_method := 'onsite';
  END IF;

  SELECT
    social_event.id AS social_event_id,
    social_event.post_id,
    social_event.promotion_id,
    paid_click.campaign_id,
    paid_click.source,
    paid_click.page,
    paid_click.occurred_at
  INTO v_event
  FROM public.ad_campaign_events paid_click
  JOIN public.social_feed_events social_event
    ON social_event.id::text = paid_click.payload->>'social_event_id'
    AND social_event.campaign_id = paid_click.campaign_id
  WHERE paid_click.user_id = p_user_id
    AND paid_click.restaurant_id = p_restaurant_id
    AND paid_click.event_type = 'click'
    AND paid_click.occurred_at >= now() - interval '24 hours'
    AND social_event.user_id = p_user_id
    AND social_event.restaurant_id = p_restaurant_id
    AND social_event.event_type IN ('cta_click', 'click')
    AND NOT COALESCE(social_event.is_internal_actor, false)
  ORDER BY
    paid_click.occurred_at DESC,
    CASE
      WHEN paid_click.payload->>'raw_event_type' = 'cta_click' THEN 0
      ELSE 1
    END,
    paid_click.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_dedupe_key := encode(
    extensions.digest(
      concat_ws(
        '|',
        'actualites-last-click',
        v_event.campaign_id::text,
        p_conversion_type,
        p_entity_id::text
      ),
      'sha256'
    ),
    'hex'
  );

  SELECT public.record_ad_campaign_event(
    v_event.campaign_id,
    p_restaurant_id,
    'conversion',
    v_dedupe_key,
    p_user_id,
    COALESCE(v_event.source, 'actualites'),
    COALESCE(v_event.page, 'actualites'),
    jsonb_build_object(
      'conversion_type', p_conversion_type,
      'journey_type', v_journey_type,
      'entity_id', p_entity_id,
      'social_post_id', v_event.post_id,
      'social_event_id', v_event.social_event_id,
      'promotion_id', v_event.promotion_id,
      'payment_method', v_payment_method,
      'attribution_window_hours', 24,
      'attribution_model', 'last_click'
    ),
    p_conversion_type
  )
  INTO v_recorded;

  IF v_recorded THEN
    INSERT INTO public.social_post_metrics_daily (
      post_id,
      metric_date,
      campaign_conversions_count
    )
    VALUES (v_event.post_id, current_date, 1)
    ON CONFLICT (post_id, metric_date) DO UPDATE
    SET
      campaign_conversions_count =
        public.social_post_metrics_daily.campaign_conversions_count + 1,
      updated_at = now();
  END IF;

  RETURN v_recorded;
END;
$function$;

REVOKE ALL ON FUNCTION private_campaign.record_actualites_latest_click_conversion(
  uuid, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

-- Replace the legacy per-campaign loop with one entity-scoped winner. Pending
-- conversions are ordered by their authoritative touch/click timestamp, never
-- by campaign UUID, and all losing candidates are closed explicitly.
CREATE OR REPLACE FUNCTION public.process_pending_ad_campaign_conversions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_conversion_type text;
  v_entity_state text;
  v_journey_type text;
  v_payment_method text;
  v_feature text;
  v_winner public.ad_campaign_pending_conversions%ROWTYPE;
  v_existing_campaign_id uuid;
  v_recorded boolean := false;
  v_event_exists boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    v_conversion_type := 'order';
    v_journey_type := CASE
      WHEN NULLIF(trim(COALESCE(v_row->>'delivery_address', '')), '') IS NOT NULL
        THEN 'delivery'
      WHEN lower(COALESCE(
        v_row->'metadata'->>'order_mode',
        v_row->'metadata'->>'fulfillment',
        ''
      )) IN ('delivery', 'livraison')
        THEN 'delivery'
      ELSE 'takeaway'
    END;
    v_payment_method := NULLIF(lower(trim(COALESCE(
      v_row->'metadata'->>'payment_method',
      v_row->'metadata'->>'paymentMethod',
      v_row->>'payment_method',
      ''
    ))), '');
  ELSIF TG_TABLE_NAME = 'reservations' THEN
    v_feature := lower(trim(COALESCE(
      v_row->>'feature',
      v_row->'metadata'->>'feature',
      ''
    )));
    v_conversion_type := CASE
      WHEN v_feature IN ('zero-attente', 'zero_attente', 'zero attente')
        THEN 'zero-attente'
      ELSE 'reservation'
    END;
    v_journey_type := v_conversion_type;
    v_payment_method := COALESCE(
      NULLIF(lower(trim(COALESCE(v_row->>'payment_method', ''))), ''),
      NULLIF(lower(trim(COALESCE(
        v_row->'metadata'->>'payment_method',
        v_row->'metadata'->>'paymentMethod',
        ''
      ))), ''),
      'onsite'
    );
  ELSE
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('ad_campaign_conversion_entity'),
    hashtext(concat_ws(
      '|',
      NEW.restaurant_id::text,
      v_conversion_type,
      NEW.id::text
    ))
  );

  UPDATE public.ad_campaign_pending_conversions pending
  SET
    status = 'expired',
    last_error = 'attribution_window_expired',
    updated_at = now()
  WHERE pending.entity_id = NEW.id
    AND pending.restaurant_id = NEW.restaurant_id
    AND pending.conversion_type = v_conversion_type
    AND pending.status = 'pending'
    AND pending.expires_at <= now();

  v_entity_state := public.ad_campaign_conversion_entity_state(
    v_conversion_type,
    NEW.id,
    NEW.restaurant_id,
    NEW.user_id
  );

  IF v_entity_state = 'terminal' THEN
    UPDATE public.ad_campaign_pending_conversions pending
    SET
      status = 'cancelled',
      processed_at = now(),
      last_error = 'business_entity_cancelled',
      updated_at = now()
    WHERE pending.entity_id = NEW.id
      AND pending.restaurant_id = NEW.restaurant_id
      AND pending.conversion_type = v_conversion_type
      AND pending.status = 'pending';
    RETURN NEW;
  END IF;

  IF v_entity_state <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL
    AND public.is_restaurant_internal_actor(NEW.user_id, NEW.restaurant_id)
  THEN
    UPDATE public.ad_campaign_pending_conversions pending
    SET
      status = 'rejected',
      processed_at = now(),
      last_error = 'internal_actor_non_billable',
      updated_at = now()
    WHERE pending.entity_id = NEW.id
      AND pending.restaurant_id = NEW.restaurant_id
      AND pending.conversion_type = v_conversion_type
      AND pending.status = 'pending';
    RETURN NEW;
  END IF;

  SELECT event.campaign_id
  INTO v_existing_campaign_id
  FROM public.ad_campaign_events event
  WHERE event.restaurant_id = NEW.restaurant_id
    AND event.event_type = 'conversion'
    AND event.conversion_type = v_conversion_type
    AND lower(trim(event.payload->>'entity_id')) = NEW.id::text
  ORDER BY event.occurred_at, event.id
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.ad_campaign_pending_conversions pending
    SET
      status = CASE
        WHEN pending.campaign_id = v_existing_campaign_id
          THEN 'processed'
        ELSE 'rejected'
      END,
      processed_at = now(),
      last_error = CASE
        WHEN pending.campaign_id = v_existing_campaign_id
          THEN NULL
        ELSE 'lost_last_click_attribution'
      END,
      updated_at = now()
    WHERE pending.entity_id = NEW.id
      AND pending.restaurant_id = NEW.restaurant_id
      AND pending.conversion_type = v_conversion_type
      AND pending.status = 'pending';
    RETURN NEW;
  END IF;

  SELECT pending.*
  INTO v_winner
  FROM public.ad_campaign_pending_conversions pending
  LEFT JOIN LATERAL (
    SELECT touch.touched_at
    FROM public.ad_campaign_attribution_touches touch
    WHERE touch.id::text = COALESCE(
      pending.payload->>'touch_token',
      pending.payload->>'touchToken',
      pending.payload->>'attribution_touch_id'
    )
      AND touch.campaign_id = pending.campaign_id
      AND touch.restaurant_id = pending.restaurant_id
    LIMIT 1
  ) attributed_touch ON true
  LEFT JOIN LATERAL (
    SELECT max(click.occurred_at) AS occurred_at
    FROM public.ad_campaign_events click
    WHERE click.campaign_id = pending.campaign_id
      AND click.restaurant_id = pending.restaurant_id
      AND click.event_type = 'click'
      AND click.occurred_at >= now() - interval '24 hours'
      AND (
        (
          pending.user_id IS NOT NULL
          AND click.user_id = pending.user_id
        )
        OR (
          pending.user_id IS NULL
          AND NULLIF(trim(COALESCE(
            pending.payload->>'viewer_id',
            pending.payload->>'viewerId',
            ''
          )), '') IS NOT NULL
          AND NULLIF(trim(COALESCE(
            click.payload->>'viewer_id',
            click.payload->>'viewerId',
            ''
          )), '') = NULLIF(trim(COALESCE(
            pending.payload->>'viewer_id',
            pending.payload->>'viewerId',
            ''
          )), '')
        )
      )
  ) accepted_click ON true
  WHERE pending.entity_id = NEW.id
    AND pending.restaurant_id = NEW.restaurant_id
    AND pending.conversion_type = v_conversion_type
    AND pending.status = 'pending'
    AND pending.expires_at > now()
    AND (pending.user_id IS NULL OR pending.user_id = NEW.user_id)
  ORDER BY
    COALESCE(
      attributed_touch.touched_at,
      accepted_click.occurred_at,
      pending.created_at
    ) DESC,
    pending.created_at DESC,
    pending.id
  LIMIT 1
  FOR UPDATE OF pending;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT public.record_ad_campaign_event(
    v_winner.campaign_id,
    v_winner.restaurant_id,
    'conversion',
    v_winner.dedupe_key,
    COALESCE(v_winner.user_id, NEW.user_id),
    v_winner.source,
    v_winner.page,
    v_winner.payload || jsonb_build_object(
      'entity_id', NEW.id::text,
      'conversion_type', v_conversion_type,
      'journey_type', COALESCE(
        v_winner.payload->>'journey_type',
        v_journey_type
      ),
      'payment_method', COALESCE(
        v_winner.payload->>'payment_method',
        v_payment_method
      ),
      'attribution_state', 'confirmed',
      'pending_conversion_id', v_winner.id,
      'confirmed_at', now(),
      'attribution_model', 'global_last_click_24h'
    ),
    v_conversion_type
  ) INTO v_recorded;

  SELECT EXISTS (
    SELECT 1
    FROM public.ad_campaign_events event
    WHERE event.campaign_id = v_winner.campaign_id
      AND event.restaurant_id = v_winner.restaurant_id
      AND event.event_type = 'conversion'
      AND event.conversion_type = v_conversion_type
      AND lower(trim(event.payload->>'entity_id')) = NEW.id::text
  ) INTO v_event_exists;

  UPDATE public.ad_campaign_pending_conversions pending
  SET
    status = CASE
      WHEN pending.id = v_winner.id AND (v_recorded OR v_event_exists)
        THEN 'processed'
      ELSE 'rejected'
    END,
    processed_at = now(),
    last_error = CASE
      WHEN pending.id = v_winner.id AND (v_recorded OR v_event_exists)
        THEN NULL
      WHEN pending.id = v_winner.id
        THEN 'campaign_delivery_guard'
      ELSE 'lost_last_click_attribution'
    END,
    updated_at = now()
  WHERE pending.entity_id = NEW.id
    AND pending.restaurant_id = NEW.restaurant_id
    AND pending.conversion_type = v_conversion_type
    AND pending.status = 'pending';

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_pending_ad_campaign_conversions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_pending_ad_campaign_conversions()
  TO service_role;

-- Trigger replacements add opaque-touch attribution first, then retain the
-- authenticated last-click fallback only when no touch won.
CREATE OR REPLACE FUNCTION public.record_actualites_reservation_conversion_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_feature text;
  v_conversion_type text;
  v_entity_state text;
  v_touch_recorded boolean := false;
BEGIN
  IF NEW.user_id IS NULL OR NEW.restaurant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_feature := lower(trim(COALESCE(
    NEW.feature,
    NEW.metadata->>'feature',
    'reservation'
  )));
  v_conversion_type := CASE
    WHEN v_feature IN ('zero-attente', 'zero_attente', 'zero attente')
      THEN 'zero-attente'
    ELSE 'reservation'
  END;
  v_entity_state := public.ad_campaign_conversion_entity_state(
    v_conversion_type,
    NEW.id,
    NEW.restaurant_id,
    NEW.user_id
  );

  IF v_entity_state <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF public.is_restaurant_internal_actor(NEW.user_id, NEW.restaurant_id) THEN
    PERFORM private_campaign.record_actualites_internal_test_conversion(
      NEW.user_id,
      NEW.restaurant_id,
      v_conversion_type,
      NEW.id,
      COALESCE(
        NULLIF(NEW.payment_method, ''),
        NULLIF(NEW.metadata->>'payment_method', ''),
        'onsite'
      )
    );
    RETURN NEW;
  END IF;

  SELECT private_campaign.record_actualites_touch_conversions(
    NEW.user_id,
    NEW.restaurant_id,
    v_conversion_type,
    NEW.id,
    COALESCE(NEW.metadata, '{}'::jsonb),
    COALESCE(
      NULLIF(NEW.payment_method, ''),
      NULLIF(NEW.metadata->>'payment_method', ''),
      'onsite'
    )
  ) INTO v_touch_recorded;
  IF NOT v_touch_recorded THEN
    PERFORM private_campaign.record_actualites_latest_click_conversion(
      NEW.user_id,
      NEW.restaurant_id,
      v_conversion_type,
      NEW.id,
      COALESCE(
        NULLIF(NEW.payment_method, ''),
        NULLIF(NEW.metadata->>'payment_method', ''),
        'onsite'
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_actualites_reservation_conversion_trigger()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_actualites_reservation_conversion_trigger()
  TO service_role;

DROP TRIGGER IF EXISTS record_actualites_reservation_conversion_on_reservations
  ON public.reservations;
CREATE TRIGGER record_actualites_reservation_conversion_on_reservations
AFTER INSERT OR UPDATE OF status ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.record_actualites_reservation_conversion_trigger();

CREATE OR REPLACE FUNCTION public.record_actualites_order_conversion_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_entity_state text;
  v_payment_method text;
  v_touch_recorded boolean := false;
BEGIN
  IF NEW.user_id IS NULL OR NEW.restaurant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_entity_state := public.ad_campaign_conversion_entity_state(
    'order',
    NEW.id,
    NEW.restaurant_id,
    NEW.user_id
  );
  IF v_entity_state <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  v_payment_method := COALESCE(
    NULLIF(NEW.metadata->>'payment_method', ''),
    NULLIF(NEW.metadata->>'paymentMethod', ''),
    'unknown'
  );

  IF public.is_restaurant_internal_actor(NEW.user_id, NEW.restaurant_id) THEN
    PERFORM private_campaign.record_actualites_internal_test_conversion(
      NEW.user_id,
      NEW.restaurant_id,
      'order',
      NEW.id,
      v_payment_method
    );
    RETURN NEW;
  END IF;

  SELECT private_campaign.record_actualites_touch_conversions(
    NEW.user_id,
    NEW.restaurant_id,
    'order',
    NEW.id,
    COALESCE(NEW.metadata, '{}'::jsonb),
    v_payment_method
  ) INTO v_touch_recorded;
  IF NOT v_touch_recorded THEN
    PERFORM private_campaign.record_actualites_latest_click_conversion(
      NEW.user_id,
      NEW.restaurant_id,
      'order',
      NEW.id,
      v_payment_method
    );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_actualites_order_conversion_trigger()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_actualites_order_conversion_trigger()
  TO service_role;

DROP TRIGGER IF EXISTS record_actualites_order_conversion_on_orders
  ON public.orders;
CREATE TRIGGER record_actualites_order_conversion_on_orders
AFTER INSERT OR UPDATE OF status, payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.record_actualites_order_conversion_trigger();

-- ---------------------------------------------------------------------------
-- Internal-test metrics are intentionally separate from paid campaign KPIs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ad_campaign_internal_test_metrics(
  p_restaurant_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_since timestamptz DEFAULT (now() - interval '30 days')
)
RETURNS TABLE (
  campaign_id uuid,
  restaurant_id uuid,
  impressions bigint,
  clicks bigint,
  conversions bigint,
  last_event_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_restaurant_id IS NULL
    OR NOT (
      COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
      OR COALESCE(public.auth_owns_restaurant(p_restaurant_id), false)
      OR COALESCE(public.auth_is_admin(), false)
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    event.campaign_id,
    event.restaurant_id,
    count(*) FILTER (WHERE event.event_type = 'impression')::bigint,
    count(*) FILTER (WHERE event.event_type = 'click')::bigint,
    count(*) FILTER (WHERE event.event_type = 'conversion')::bigint,
    max(event.occurred_at)
  FROM public.ad_campaign_internal_test_events event
  WHERE event.restaurant_id = p_restaurant_id
    AND (p_campaign_id IS NULL OR event.campaign_id = p_campaign_id)
    AND event.occurred_at >= COALESCE(p_since, '-infinity'::timestamptz)
  GROUP BY event.campaign_id, event.restaurant_id
  ORDER BY max(event.occurred_at) DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ad_campaign_internal_test_metrics(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ad_campaign_internal_test_metrics(
  uuid, uuid, timestamptz
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fair Growth feature-key integrity and kill-switch-aware reconciliation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private_finance.guard_fair_growth_module_feature_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_missing_key text;
BEGIN
  IF NEW.feature_keys IS NULL OR cardinality(NEW.feature_keys) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'fair_growth_module_requires_feature_key';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.feature_keys) AS keys(feature_key)
    WHERE feature_key IS NULL
      OR trim(feature_key) = ''
      OR feature_key IS DISTINCT FROM trim(feature_key)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'fair_growth_module_feature_keys_must_be_canonical';
  END IF;

  IF cardinality(NEW.feature_keys) IS DISTINCT FROM (
    SELECT count(DISTINCT feature_key)
    FROM unnest(NEW.feature_keys) AS keys(feature_key)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'fair_growth_module_feature_keys_must_be_unique';
  END IF;

  SELECT feature_key
  INTO v_missing_key
  FROM unnest(NEW.feature_keys) AS keys(feature_key)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.feature_flags flag
    WHERE flag.name = feature_key
  )
  ORDER BY feature_key
  LIMIT 1;

  IF v_missing_key IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'fair_growth_module_feature_flag_missing',
      DETAIL = v_missing_key;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private_finance.guard_fair_growth_module_feature_keys()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_fair_growth_module_feature_keys
  ON public.fair_growth_modules;
CREATE TRIGGER guard_fair_growth_module_feature_keys
BEFORE INSERT OR UPDATE OF feature_keys ON public.fair_growth_modules
FOR EACH ROW
EXECUTE FUNCTION private_finance.guard_fair_growth_module_feature_keys();

-- Legacy pilot modules without a dedicated feature flag inherit the global
-- Mon Pack kill switch instead of bypassing the module visibility filter.
UPDATE public.fair_growth_modules module
SET
  feature_keys = ARRAY['dashboard-pack']::text[],
  updated_at = now()
WHERE module.feature_keys IS NULL
  OR cardinality(module.feature_keys) = 0;

CREATE OR REPLACE FUNCTION private_finance.guard_referenced_feature_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1
      FROM public.fair_growth_modules module
      WHERE OLD.name = ANY(module.feature_keys)
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'feature_flag_is_referenced_by_fair_growth_module',
        DETAIL = OLD.name;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.name IS DISTINCT FROM NEW.name
    AND EXISTS (
      SELECT 1
      FROM public.fair_growth_modules module
      WHERE OLD.name = ANY(module.feature_keys)
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'feature_flag_is_referenced_by_fair_growth_module',
      DETAIL = OLD.name;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private_finance.guard_referenced_feature_flag()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_referenced_feature_flag
  ON public.feature_flags;
CREATE TRIGGER guard_referenced_feature_flag
BEFORE DELETE OR UPDATE OF name ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION private_finance.guard_referenced_feature_flag();

-- Preserve the dashboard-pack runtime kill switch and extend it so a module
-- cannot be requested/activated while any of its own feature keys is hidden.
CREATE OR REPLACE FUNCTION private_finance.enforce_dashboard_pack_paid_module_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_action text;
  v_hidden_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('requested', 'trialing', 'active') THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.status NOT IN ('requested', 'trialing', 'active') THEN
    RETURN NEW;
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.module_id IS NOT DISTINCT FROM OLD.module_id
  THEN
    RETURN NEW;
  END IF;

  v_action := CASE
    WHEN NEW.status = 'requested' THEN 'request'
    WHEN NEW.status = 'trialing' THEN 'confirm_activation'
    ELSE 'resume'
  END;
  PERFORM private_finance.assert_dashboard_pack_runtime_enabled(v_action);

  SELECT keys.feature_key
  INTO v_hidden_key
  FROM public.fair_growth_modules module
  CROSS JOIN LATERAL unnest(module.feature_keys) AS keys(feature_key)
  LEFT JOIN public.feature_flags flag
    ON flag.name = keys.feature_key
  WHERE module.id = NEW.module_id
    AND NOT COALESCE(flag.is_active, false)
  ORDER BY keys.feature_key
  LIMIT 1;

  IF v_hidden_key IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'module_hidden_by_feature_flag',
      DETAIL = v_hidden_key;
  END IF;

  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1
    FROM public.fair_growth_modules module
    WHERE module.id = NEW.module_id
      AND module.is_active
      AND module.availability_status IN ('available', 'pilot')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'module_not_operational';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private_finance.enforce_dashboard_pack_paid_module_write()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_fair_growth_reconciliation(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  incident_type text,
  restaurant_id uuid,
  paid_module_id uuid,
  module_slug text,
  stripe_event_id text,
  created_at timestamptz,
  details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT COALESCE(public.auth_is_admin(), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_required';
  END IF;

  RETURN QUERY
  SELECT
    incidents.incident_type,
    incidents.restaurant_id,
    incidents.paid_module_id,
    incidents.module_slug,
    incidents.stripe_event_id,
    incidents.created_at,
    incidents.details
  FROM (
    SELECT
      'activation_blocked'::text AS incident_type,
      paid_module.restaurant_id AS restaurant_id,
      paid_module.id AS paid_module_id,
      module.slug AS module_slug,
      NULL::text AS stripe_event_id,
      paid_module.requested_at AS created_at,
      jsonb_build_object(
        'status', paid_module.status,
        'pricing_version', paid_module.pricing_version_snapshot
      ) AS details
    FROM public.restaurant_paid_modules paid_module
    JOIN public.fair_growth_modules module
      ON module.id = paid_module.module_id
    WHERE paid_module.status = 'requested'
      AND paid_module.requested_at < now() - interval '30 minutes'
      AND COALESCE((
        SELECT flag.is_active
        FROM public.feature_flags flag
        WHERE flag.name = 'dashboard-pack'
      ), false)
  ) incidents
  ORDER BY incidents.created_at DESC
  LIMIT least(greatest(p_limit, 1), 200)
  OFFSET greatest(p_offset, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_fair_growth_reconciliation(
  integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_fair_growth_reconciliation(
  integer, integer
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reservation fee integrity: a direct transition to `completed` cannot bypass
-- the immutable Fair Growth snapshot; the RPC sets both atomically.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private_finance.guard_completed_reservation_honor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_entering_completed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_entering_completed :=
      lower(COALESCE(NEW.status, '')) = 'completed';
  ELSE
    v_entering_completed :=
      lower(COALESCE(NEW.status, '')) = 'completed'
      AND lower(COALESCE(OLD.status, '')) <> 'completed';
  END IF;

  IF v_entering_completed
    AND COALESCE(
      current_setting('app.fair_growth_mark_honored', true),
      ''
    ) <> 'on'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'completed_reservation_requires_honor_snapshot',
      DETAIL = 'use_honored_rpc',
      HINT = 'Use mark_reservation_honored so status and reservation fee are committed atomically.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private_finance.guard_completed_reservation_honor()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz_guard_completed_reservation_honor
  ON public.reservations;
CREATE TRIGGER zz_guard_completed_reservation_honor
BEFORE UPDATE OF status ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION private_finance.guard_completed_reservation_honor();

DROP TRIGGER IF EXISTS zz_guard_insert_completed_reservation_honor
  ON public.reservations;
CREATE TRIGGER zz_guard_insert_completed_reservation_honor
BEFORE INSERT ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION private_finance.guard_completed_reservation_honor();

-- Keep the existing status RPC contract, but turn the legacy `completed`
-- action into an explicit, user-facing handoff to the honor flow instead of
-- letting the new trigger surface as an unstructured database exception.
CREATE OR REPLACE FUNCTION public.update_restaurant_reservation_status_safe(
  p_reservation_id uuid,
  p_status text
)
RETURNS TABLE (
  updated boolean,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_status text := lower(trim(COALESCE(p_status, '')));
  v_current_status text;
BEGIN
  IF public.commercial_demo_current_user_is_restricted() THEN
    RAISE EXCEPTION
      'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs'
      USING ERRCODE = '42501';
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN QUERY
      SELECT false, 'use_cancel_rpc',
        'Utilisez l annulation avec une raison.';
    RETURN;
  END IF;
  IF v_status = 'completed' THEN
    RETURN QUERY
      SELECT false, 'use_honored_rpc',
        'Cloturez la table avec son chiffre d affaires pour calculer les frais.';
    RETURN;
  END IF;
  IF v_status NOT IN (
    'pending', 'confirmed', 'arrived', 'seated', 'no_show'
  ) THEN
    RETURN QUERY
      SELECT false, 'invalid_status', 'Statut de reservation invalide.';
    RETURN;
  END IF;

  SELECT *
  INTO v_reservation
  FROM public.reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY
      SELECT false, 'not_found', 'Reservation introuvable.';
    RETURN;
  END IF;
  IF NOT (
    COALESCE(auth.role() = 'service_role', false)
    OR COALESCE(public.auth_is_admin(), false)
    OR COALESCE(
      public.auth_owns_restaurant(v_reservation.restaurant_id),
      false
    )
  )
  THEN
    RETURN QUERY
      SELECT false, 'forbidden', 'Acces refuse.';
    RETURN;
  END IF;
  v_current_status := replace(
    lower(trim(COALESCE(v_reservation.status, ''))),
    '-',
    '_'
  );
  IF v_current_status IN ('cancelled', 'canceled') THEN
    RETURN QUERY
      SELECT false, 'cancelled_locked',
        'Cette reservation annulee est verrouillee.';
    RETURN;
  END IF;
  IF v_current_status = 'no_show'
    AND v_status <> 'no_show'
  THEN
    RETURN QUERY
      SELECT false, 'no_show_locked',
        'Ce no-show est verrouille et exige une correction auditee.';
    RETURN;
  END IF;
  IF v_reservation.honored_at IS NOT NULL THEN
    RETURN QUERY
      SELECT false, 'honored_locked',
        'Une reservation honoree ne peut plus revenir a un statut anterieur.';
    RETURN;
  END IF;
  IF NOT (
    (
      v_current_status = 'pending'
      AND v_status IN ('pending', 'confirmed', 'arrived', 'no_show')
    )
    OR (
      v_current_status = 'confirmed'
      AND v_status IN ('confirmed', 'arrived', 'no_show')
    )
    OR (
      v_current_status = 'arrived'
      AND v_status IN ('arrived', 'seated')
    )
    OR (
      v_current_status = 'seated'
      AND v_status = 'seated'
    )
    OR (
      v_current_status = 'no_show'
      AND v_status = 'no_show'
    )
  ) THEN
    RETURN QUERY
      SELECT false, 'invalid_status_transition',
        'La progression de la reservation ne peut pas revenir a un statut anterieur.';
    RETURN;
  END IF;

  IF v_status = 'no_show' THEN
    -- The immutable snapshot trigger permits this audited waiver only inside
    -- the status RPC transaction. No honored reservation reaches this branch.
    PERFORM set_config('app.fair_growth_mark_honored', 'on', true);
  END IF;

  UPDATE public.reservations reservation
  SET
    status = v_status,
    confirmed_at = CASE
      WHEN reservation.confirmed_at IS NULL
        AND v_status IN (
          'confirmed', 'arrived', 'seated', 'no_show'
        )
      THEN now()
      ELSE reservation.confirmed_at
    END,
    billing_fee_chf = CASE
      WHEN v_status = 'no_show' THEN 0
      ELSE reservation.billing_fee_chf
    END,
    reservation_fee_waiver_reason = CASE
      WHEN v_status = 'no_show' THEN 'no_show'
      ELSE reservation.reservation_fee_waiver_reason
    END,
    updated_at = now()
  WHERE reservation.id = p_reservation_id;

  RETURN QUERY SELECT true, NULL::text, NULL::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_restaurant_reservation_status_safe(
  uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(
  uuid, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_reservation_honored(
  p_reservation_id uuid,
  p_attributed_table_revenue_chf numeric
)
RETURNS TABLE (
  updated boolean,
  error_code text,
  error_message text,
  fee_chf numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_attributed_revenue_cents integer;
  v_fee_cents integer;
  v_developer_share_cents integer;
  v_plan_slug text;
  v_honored_at timestamptz;
  v_adjustment_cents integer := 0;
  v_existing_charge public.reservation_fee_charges%ROWTYPE;
  v_is_privileged_reviewer boolean;
  v_reviewer_role text;
BEGIN
  IF p_reservation_id IS NULL
    OR p_attributed_table_revenue_chf IS NULL
    OR upper(p_attributed_table_revenue_chf::text) IN ('NAN', 'INFINITY', '-INFINITY')
    OR p_attributed_table_revenue_chf < 0
    OR p_attributed_table_revenue_chf > 21474836.47
  THEN
    RETURN QUERY
      SELECT false, 'invalid_revenue',
        'Le chiffre d affaires attribue a la table est requis.', NULL::numeric;
    RETURN;
  END IF;
  v_attributed_revenue_cents :=
    round(p_attributed_table_revenue_chf * 100)::integer;

  SELECT *
  INTO v_reservation
  FROM public.reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY
      SELECT false, 'not_found', 'Reservation introuvable.', NULL::numeric;
    RETURN;
  END IF;

  v_is_privileged_reviewer :=
    COALESCE(auth.role() = 'service_role', false)
    OR COALESCE(public.auth_is_admin(), false);
  IF NOT v_is_privileged_reviewer
    AND NOT COALESCE(
      public.auth_owns_restaurant(v_reservation.restaurant_id),
      false
    )
  THEN
    RETURN QUERY
      SELECT false, 'forbidden', 'Acces refuse.', NULL::numeric;
    RETURN;
  END IF;
  IF lower(v_reservation.status) IN (
    'cancelled', 'canceled', 'no_show', 'no-show'
  ) OR v_reservation.cancelled_at IS NOT NULL
  THEN
    RETURN QUERY
      SELECT false, 'not_honorable',
        'Une annulation ou un no-show ne peut pas etre facture.', NULL::numeric;
    RETURN;
  END IF;
  IF COALESCE(v_reservation.refunded_amount_chf, 0) > 0
    OR lower(COALESCE(v_reservation.refund_status, '')) IN (
      'pending', 'partial', 'refunded'
    )
  THEN
    RETURN QUERY
      SELECT false, 'refunded',
        'Une reservation remboursee ne peut pas etre facturee.', NULL::numeric;
    RETURN;
  END IF;
  IF lower(COALESCE(v_reservation.status, '')) NOT IN (
    'arrived', 'seated', 'completed'
  ) THEN
    RETURN QUERY
      SELECT false, 'service_not_completed',
        'La table doit etre arrivee, installee ou cloturee avant facturation.',
        NULL::numeric;
    RETURN;
  END IF;
  IF v_reservation.acquisition_source = 'tok_marketplace'
    AND v_attributed_revenue_cents = 0
    AND NOT v_is_privileged_reviewer
  THEN
    RETURN QUERY
      SELECT false, 'zero_revenue_requires_review',
        'Un chiffre d affaires nul pour un lead TOK exige une revue administrative.',
        NULL::numeric;
    RETURN;
  END IF;

  v_reviewer_role := CASE
    WHEN auth.role() = 'service_role' THEN 'service_role'
    WHEN v_is_privileged_reviewer THEN 'admin'
    ELSE NULL
  END;

  SELECT *
  INTO v_existing_charge
  FROM public.reservation_fee_charges charge
  WHERE charge.reservation_id = p_reservation_id;
  IF FOUND THEN
    IF v_existing_charge.fee_cents = 0 AND NOT v_is_privileged_reviewer THEN
      RETURN QUERY
        SELECT false, 'zero_fee_requires_review',
          'Une commission arrondie a zero pour un lead TOK exige une revue administrative.',
          NULL::numeric;
      RETURN;
    END IF;
    IF v_existing_charge.attributed_revenue_cents_snapshot
      <> v_attributed_revenue_cents
    THEN
      RETURN QUERY
        SELECT false, 'honor_snapshot_locked',
          'Le chiffre d affaires honore est deja verrouille.', NULL::numeric;
      RETURN;
    END IF;

    SELECT COALESCE(sum(adjustment.adjustment_cents), 0)::integer
    INTO v_adjustment_cents
    FROM public.reservation_fee_adjustments adjustment
    WHERE adjustment.reservation_fee_charge_id = v_existing_charge.id;

    -- Heal pre-migration rows idempotently: an existing immutable charge is
    -- authoritative and completion can safely be brought into sync.
    PERFORM set_config('app.fair_growth_mark_honored', 'on', true);
    UPDATE public.reservations reservation
    SET
      status = 'completed',
      honored_at = COALESCE(
        reservation.honored_at,
        v_existing_charge.honored_at_snapshot
      ),
      confirmed_at = COALESCE(
        reservation.confirmed_at,
        v_existing_charge.honored_at_snapshot
      ),
      attributed_table_revenue_chf =
        v_existing_charge.attributed_revenue_cents_snapshot::numeric / 100,
      billing_fee_chf =
        v_existing_charge.fee_cents::numeric / 100,
      updated_at = now()
    WHERE reservation.id = p_reservation_id;

    RETURN QUERY
      SELECT true, NULL::text, NULL::text,
        (v_existing_charge.fee_cents + v_adjustment_cents)::numeric / 100;
    RETURN;
  END IF;

  IF v_reservation.honored_at IS NOT NULL THEN
    IF round(
      COALESCE(v_reservation.attributed_table_revenue_chf, 0) * 100
    )::integer <> v_attributed_revenue_cents
    THEN
      RETURN QUERY
        SELECT false, 'honor_snapshot_locked',
          'Le chiffre d affaires honore est deja verrouille.', NULL::numeric;
      RETURN;
    END IF;

    PERFORM set_config('app.fair_growth_mark_honored', 'on', true);
    UPDATE public.reservations reservation
    SET
      status = 'completed',
      confirmed_at = COALESCE(reservation.confirmed_at, now()),
      updated_at = now()
    WHERE reservation.id = p_reservation_id;

    RETURN QUERY
      SELECT true, NULL::text, NULL::text,
        round(COALESCE(v_reservation.billing_fee_chf, 0), 2);
    RETURN;
  END IF;

  v_fee_cents := CASE
    WHEN v_reservation.acquisition_source <> 'tok_marketplace'
      OR v_reservation.reservation_pricing_version IS NULL
      THEN 0
    ELSE least(
      COALESCE(v_reservation.reservation_fee_list_cents_snapshot, 500),
      round(
        v_attributed_revenue_cents::numeric
        * COALESCE(v_reservation.reservation_fee_cap_bps_snapshot, 700)
        / 10000
      )::integer
    )
  END;
  v_developer_share_cents :=
    round(v_fee_cents::numeric * 1000 / 10000)::integer;

  IF v_reservation.acquisition_source = 'tok_marketplace'
    AND v_reservation.reservation_pricing_version IS NOT NULL
    AND v_fee_cents = 0
    AND NOT v_is_privileged_reviewer
  THEN
    RETURN QUERY
      SELECT false, 'zero_fee_requires_review',
        'Une commission arrondie a zero pour un lead TOK exige une revue administrative.',
        NULL::numeric;
    RETURN;
  END IF;

  v_plan_slug :=
    COALESCE(v_reservation.reservation_plan_slug_snapshot, 'starter');
  v_honored_at := now();

  IF v_reservation.acquisition_source = 'tok_marketplace'
    AND v_reservation.reservation_pricing_version IS NOT NULL
  THEN
    INSERT INTO public.reservation_fee_charges (
      reservation_id,
      restaurant_id,
      plan_slug_snapshot,
      pricing_version_snapshot,
      acquisition_source_snapshot,
      honored_at_snapshot,
      attributed_revenue_cents_snapshot,
      flat_fee_cents_snapshot,
      cap_bps_snapshot,
      fee_cents,
      developer_share_bps_snapshot,
      developer_share_cents,
      tok_share_cents,
      zero_revenue_reviewed_at,
      zero_revenue_reviewed_by,
      zero_revenue_reviewer_role,
      zero_revenue_waiver_reason
    )
    VALUES (
      v_reservation.id,
      v_reservation.restaurant_id,
      v_plan_slug,
      COALESCE(
        v_reservation.reservation_pricing_version,
        'fair_growth_2026_07'
      ),
      'tok_marketplace',
      v_honored_at,
      v_attributed_revenue_cents,
      COALESCE(v_reservation.reservation_fee_list_cents_snapshot, 500),
      COALESCE(v_reservation.reservation_fee_cap_bps_snapshot, 700),
      v_fee_cents,
      1000,
      v_developer_share_cents,
      v_fee_cents - v_developer_share_cents,
      CASE WHEN v_fee_cents = 0 THEN v_honored_at ELSE NULL END,
      CASE WHEN v_fee_cents = 0 THEN auth.uid() ELSE NULL END,
      CASE WHEN v_fee_cents = 0 THEN v_reviewer_role ELSE NULL END,
      CASE
        WHEN v_fee_cents = 0 THEN
          CASE
            WHEN v_attributed_revenue_cents = 0
              THEN 'zero_revenue_admin_review'
            ELSE 'zero_fee_rounding_admin_review'
          END
        ELSE NULL
      END
    )
    ON CONFLICT (reservation_id) DO NOTHING;

    SELECT charge.*
    INTO v_existing_charge
    FROM public.reservation_fee_charges charge
    WHERE charge.reservation_id = v_reservation.id;
    IF v_existing_charge.id IS NULL
      OR v_existing_charge.attributed_revenue_cents_snapshot
        <> v_attributed_revenue_cents
      OR v_existing_charge.fee_cents <> v_fee_cents
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'reservation_fee_charge_concurrency_conflict';
    END IF;
  END IF;

  PERFORM set_config('app.fair_growth_mark_honored', 'on', true);
  UPDATE public.reservations reservation
  SET
    status = 'completed',
    honored_at = v_honored_at,
    confirmed_at = COALESCE(reservation.confirmed_at, v_honored_at),
    attributed_table_revenue_chf =
      v_attributed_revenue_cents::numeric / 100,
    billing_fee_chf = v_fee_cents::numeric / 100,
    reservation_fee_waiver_reason = CASE
      WHEN reservation.reservation_pricing_version IS NULL
        THEN 'pre_fair_growth_unverified_source'
      WHEN reservation.acquisition_source <> 'tok_marketplace'
        THEN 'free_direct_source'
      WHEN v_fee_cents = 0 AND v_attributed_revenue_cents = 0
        THEN 'zero_revenue_admin_review'
      WHEN v_fee_cents = 0
        THEN 'zero_fee_rounding_admin_review'
      ELSE NULL
    END,
    metadata = CASE
      WHEN reservation.acquisition_source = 'tok_marketplace'
        AND v_fee_cents = 0
      THEN COALESCE(reservation.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'fair_growth_zero_revenue_review',
          jsonb_build_object(
            'reviewed_at', v_honored_at,
            'reviewed_by', auth.uid(),
            'reviewer_role', v_reviewer_role,
            'waiver_reason', CASE
              WHEN v_attributed_revenue_cents = 0
                THEN 'zero_revenue_admin_review'
              ELSE 'zero_fee_rounding_admin_review'
            END
          )
        )
      ELSE reservation.metadata
    END,
    updated_at = now()
  WHERE reservation.id = p_reservation_id;

  RETURN QUERY
    SELECT true, NULL::text, NULL::text, v_fee_cents::numeric / 100;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_reservation_honored(uuid, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_reservation_honored(uuid, numeric)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Idempotent monthly reservation-fee invoice generation.
-- The public generator already locks each restaurant and links immutable
-- charges once; this private wrapper supplies the trusted cron execution role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private_finance.run_monthly_reservation_fee_invoice_generation(
  p_month date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_target_month date := COALESCE(
    date_trunc('month', p_month)::date,
    (
      date_trunc('month', now() AT TIME ZONE 'Europe/Zurich')
      - interval '1 month'
    )::date
  );
  v_count integer;
  v_previous_claim_role text :=
    current_setting('request.jwt.claim.role', true);
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('monthly_reservation_fee_invoice_generation'),
    hashtext(v_target_month::text)
  );
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  v_count := public.generate_tok_reservation_fee_invoices_all(v_target_month);
  PERFORM set_config(
    'request.jwt.claim.role',
    COALESCE(v_previous_claim_role, ''),
    true
  );
  RETURN v_count;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config(
      'request.jwt.claim.role',
      COALESCE(v_previous_claim_role, ''),
      true
    );
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION private_finance.run_monthly_reservation_fee_invoice_generation(
  date
) FROM PUBLIC, anon, authenticated, service_role;

DO $schedule_monthly_reservation_fee_invoices$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    FOR v_job_id IN
      SELECT jobid
      FROM cron.job
      WHERE jobname = 'tok-monthly-reservation-fee-invoices'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'tok-monthly-reservation-fee-invoices',
      '20 2 1 * *',
      $cron$
        SELECT private_finance.run_monthly_reservation_fee_invoice_generation(NULL);
      $cron$
    );
  END IF;
END;
$schedule_monthly_reservation_fee_invoices$;

-- ---------------------------------------------------------------------------
-- Deployment postflight. These checks are metadata-only and roll the complete
-- migration back if a critical invariant was not installed.
-- ---------------------------------------------------------------------------

DO $campaign_tracking_fee_integrity_postflight$
DECLARE
  v_definition text;
BEGIN
  IF to_regclass('public.ad_campaign_internal_test_events') IS NULL
    OR to_regclass('public.ad_campaign_attribution_touches') IS NULL
  THEN
    RAISE EXCEPTION 'Campaign tracking audit tables are missing';
  END IF;

  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.ad_campaign_internal_test_events'::regclass
  ) OR NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.ad_campaign_attribution_touches'::regclass
  ) THEN
    RAISE EXCEPTION 'Campaign tracking audit table RLS is not enabled';
  END IF;

  IF has_table_privilege(
    'anon',
    'public.ad_campaign_attribution_touches',
    'SELECT'
  ) OR has_table_privilege(
    'authenticated',
    'public.ad_campaign_attribution_touches',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'Attribution touch tokens are exposed to the Data API';
  END IF;

  IF to_regclass('public.ad_campaign_conversion_entity_unique') IS NULL
    OR to_regclass('public.ad_campaign_event_transport_unique') IS NULL
  THEN
    RAISE EXCEPTION 'Campaign conversion or transport uniqueness is missing';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.record_social_feed_event(uuid,text,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.record_social_feed_event(uuid,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Legacy social tracking RPC is still publicly executable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fair_growth_modules module
    WHERE module.feature_keys IS NULL
      OR cardinality(module.feature_keys) = 0
  ) OR EXISTS (
    SELECT 1
    FROM public.fair_growth_modules module
    CROSS JOIN LATERAL unnest(module.feature_keys) AS keys(feature_key)
    WHERE feature_key IS NULL
      OR trim(feature_key) = ''
      OR feature_key IS DISTINCT FROM trim(feature_key)
      OR NOT EXISTS (
        SELECT 1
        FROM public.feature_flags flag
        WHERE flag.name = feature_key
      )
      OR cardinality(module.feature_keys) IS DISTINCT FROM (
        SELECT count(DISTINCT nested_key)
        FROM unnest(module.feature_keys) AS nested_keys(nested_key)
      )
  ) THEN
    RAISE EXCEPTION 'A Fair Growth module references an invalid feature flag';
  END IF;

  SELECT pg_get_functiondef(
    'public.record_ad_campaign_event(uuid,uuid,text,text,uuid,text,text,jsonb,text)'::regprocedure
  )
  INTO v_definition;
  IF position('pricing_strategy' IN v_definition) = 0
    OR position('v_billable_cost' IN v_definition) = 0
    OR position('p_event_type <> ''conversion''' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'Campaign pricing/budget integrity function is incomplete';
  END IF;

  SELECT pg_get_functiondef(
    'public.mark_reservation_honored(uuid,numeric)'::regprocedure
  )
  INTO v_definition;
  IF position('status = ''completed''' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Reservation honor RPC does not complete atomically';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.reservations'::regclass
      AND tgname = 'zz_guard_completed_reservation_honor'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.reservations'::regclass
      AND tgname = 'zz_guard_insert_completed_reservation_honor'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Completed reservation honor guard is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = 'tok-monthly-reservation-fee-invoices'
        AND active
    ) THEN
      RAISE EXCEPTION 'Monthly reservation fee invoice cron is missing';
    END IF;
  END IF;
END;
$campaign_tracking_fee_integrity_postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
