-- First-touch acquisition attribution: the first producer of
-- marketing_attribution_facts. Additive only, no backfill.
--
-- A browser touch (UTM, external referrer host, landing path) is captured only
-- with marketing consent and bound server-side to a verified account by
-- track-analytics. The campaign is resolved here from a published calendar
-- item or an active UTM plan, never from a campaign identifier supplied by a
-- browser. Revenue comes from the order row. Facts exist only when a campaign
-- is identified and are idempotent per subject through
-- UNIQUE (source_system, source_fact_id). Billing acquisition_source columns
-- are neither read for money nor changed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_acquisition_touches (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  utm_source text CHECK (utm_source IS NULL OR utm_source ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  utm_medium text CHECK (utm_medium IS NULL OR utm_medium ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  utm_campaign text CHECK (utm_campaign IS NULL OR utm_campaign ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  utm_content text CHECK (utm_content IS NULL OR utm_content ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  utm_term text CHECK (utm_term IS NULL OR utm_term ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  -- Host only: a referrer URL can carry search terms or tokens.
  referrer_host text CHECK (
    referrer_host IS NULL OR (
      char_length(referrer_host) BETWEEN 3 AND 253
      AND referrer_host ~ '^[a-z0-9]([a-z0-9-]{0,62}[.])+[a-z0-9-]{1,63}$'
    )
  ),
  -- Pathname only: query strings and fragments are never stored.
  landing_path text CHECK (
    landing_path IS NULL OR landing_path ~ '^/[A-Za-z0-9._~!$&''()*+,;=:@%/-]{0,199}$'
  ),
  touched_at timestamptz NOT NULL,
  bound_at timestamptz NOT NULL DEFAULT now(),
  consent_version text NOT NULL CHECK (consent_version ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  calendar_item_id uuid REFERENCES public.marketing_calendar_items(id) ON DELETE SET NULL,
  utm_plan_id uuid REFERENCES public.marketing_utm_plans(id) ON DELETE SET NULL,
  CONSTRAINT marketing_acquisition_touch_source_required CHECK (
    utm_source IS NOT NULL OR referrer_host IS NOT NULL
  ),
  CONSTRAINT marketing_acquisition_touch_not_future CHECK (
    touched_at <= bound_at + interval '5 minutes'
  )
);

CREATE INDEX IF NOT EXISTS marketing_acquisition_touches_campaign_idx
  ON public.marketing_acquisition_touches (campaign_id, touched_at DESC)
  WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_acquisition_touches_source_idx
  ON public.marketing_acquisition_touches (utm_source, touched_at DESC);
CREATE INDEX IF NOT EXISTS marketing_acquisition_touches_item_idx
  ON public.marketing_acquisition_touches (calendar_item_id)
  WHERE calendar_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_acquisition_touches_plan_idx
  ON public.marketing_acquisition_touches (utm_plan_id)
  WHERE utm_plan_id IS NOT NULL;

-- Deny-by-default. Only the SECURITY DEFINER functions below read or write.
ALTER TABLE public.marketing_acquisition_touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_acquisition_touches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_acquisition_touches
  FROM PUBLIC, anon, authenticated, service_role;

-- Internal producer. A subject filter limits a trigger to its own row; without
-- one, every subject of the user is reconciled (binding after a conversion).
CREATE OR REPLACE FUNCTION public.marketing_record_first_touch_facts(
  p_user_id uuid,
  p_subject_type text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Browser clocks drift; a touch cannot be meaningfully later than this.
  v_clock_skew constant interval := interval '10 minutes';
  v_touch public.marketing_acquisition_touches%ROWTYPE;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_subject_hash text;
  v_metadata jsonb;
  v_rows integer := 0;
  v_count integer := 0;
BEGIN
  IF p_user_id IS NULL
    OR (p_subject_type IS NOT NULL
      AND p_subject_type NOT IN ('account', 'reservation', 'order', 'signup_application')) THEN
    RETURN 0;
  END IF;

  SELECT t.* INTO v_touch
  FROM public.marketing_acquisition_touches t
  WHERE t.user_id = p_user_id AND t.campaign_id IS NOT NULL;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT v_touch.touched_at + make_interval(hours => c.attribution_window_hours)
  INTO v_window_end
  FROM public.marketing_campaigns c
  WHERE c.id = v_touch.campaign_id;
  IF v_window_end IS NULL THEN
    RETURN 0;
  END IF;
  v_window_start := v_touch.touched_at - v_clock_skew;

  -- Pseudonymous: facts never carry the account identifier.
  v_subject_hash := encode(sha256(convert_to('tok-first-touch:' || p_user_id::text, 'UTF8')), 'hex');
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'attribution_model', 'first_touch',
    'touch_at', v_touch.touched_at,
    'utm_source', v_touch.utm_source,
    'utm_medium', v_touch.utm_medium,
    'utm_campaign', v_touch.utm_campaign,
    'utm_content', v_touch.utm_content,
    'utm_term', v_touch.utm_term,
    'referrer_host', v_touch.referrer_host,
    'landing_path', v_touch.landing_path,
    'calendar_item_id', v_touch.calendar_item_id,
    'consent_version', v_touch.consent_version
  ));

  -- Lead: an account opened after the touch.
  IF p_subject_type IS NULL OR p_subject_type = 'account' THEN
    INSERT INTO public.marketing_attribution_facts (
      source_system, source_fact_id, fact_type, campaign_id, utm_plan_id,
      subject_hash, observed_at, metadata
    )
    SELECT 'tok_first_touch', 'lead:account:' || u.id::text, 'lead',
      v_touch.campaign_id, v_touch.utm_plan_id, v_subject_hash, u.created_at,
      v_metadata || jsonb_build_object('subject_type', 'account')
    FROM auth.users u
    WHERE u.id = p_user_id
      AND u.created_at >= v_window_start
      AND u.created_at < v_window_end
    ON CONFLICT (source_system, source_fact_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END IF;

  -- Reservation: same confirmed state as sponsored campaign conversions.
  -- Reservations entered by a restaurant for a customer are not acquisitions.
  IF p_subject_type IS NULL OR p_subject_type = 'reservation' THEN
    INSERT INTO public.marketing_attribution_facts (
      source_system, source_fact_id, fact_type, campaign_id, utm_plan_id,
      subject_hash, observed_at, metadata
    )
    SELECT 'tok_first_touch', 'conversion:reservation:' || r.id::text, 'conversion',
      v_touch.campaign_id, v_touch.utm_plan_id, v_subject_hash, r.created_at,
      v_metadata || jsonb_build_object('subject_type', 'reservation')
    FROM (
      SELECT candidate.id, candidate.restaurant_id, candidate.user_id, candidate.created_at
      FROM public.reservations candidate
      WHERE candidate.user_id = p_user_id
        AND (p_subject_id IS NULL OR candidate.id = p_subject_id)
        AND candidate.created_at >= v_window_start
        AND candidate.created_at < v_window_end
        AND COALESCE(candidate.acquisition_source, '') NOT IN ('customer_file', 'demo')
      ORDER BY candidate.created_at
      LIMIT 200
    ) r
    WHERE public.ad_campaign_conversion_entity_state('reservation', r.id, r.restaurant_id, r.user_id) = 'confirmed'
      AND NOT public.is_restaurant_internal_actor(r.user_id, r.restaurant_id)
    ON CONFLICT (source_system, source_fact_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END IF;

  -- Order: conversion once confirmed and paid; revenue is the server-side
  -- order total in minor units, never an amount sent by a browser.
  IF p_subject_type IS NULL OR p_subject_type = 'order' THEN
    WITH confirmed_orders AS (
      SELECT o.id, o.created_at,
        round(o.total_amount * 100)::bigint AS value_minor,
        CASE
          WHEN upper(btrim(COALESCE(o.currency, ''))) ~ '^[A-Z]{3}$' THEN upper(btrim(o.currency))
          ELSE 'CHF'
        END AS currency
      FROM (
        SELECT candidate.id, candidate.restaurant_id, candidate.user_id,
          candidate.created_at, candidate.total_amount, candidate.currency
        FROM public.orders candidate
        WHERE candidate.user_id = p_user_id
          AND (p_subject_id IS NULL OR candidate.id = p_subject_id)
          AND candidate.created_at >= v_window_start
          AND candidate.created_at < v_window_end
        ORDER BY candidate.created_at
        LIMIT 200
      ) o
      WHERE o.total_amount IS NOT NULL
        AND o.total_amount >= 0
        AND public.ad_campaign_conversion_entity_state('order', o.id, o.restaurant_id, o.user_id) = 'confirmed'
        AND NOT public.is_restaurant_internal_actor(o.user_id, o.restaurant_id)
    ), order_facts AS (
      SELECT 'conversion:order:' || id::text AS source_fact_id, 'conversion' AS fact_type,
        NULL::bigint AS value_minor, NULL::text AS currency, created_at,
        jsonb_build_object('subject_type', 'order') AS details
      FROM confirmed_orders
      UNION ALL
      SELECT 'revenue:order:' || id::text, 'revenue', value_minor, currency, created_at,
        jsonb_build_object('subject_type', 'order', 'revenue_basis', 'order_total_amount')
      FROM confirmed_orders
    )
    INSERT INTO public.marketing_attribution_facts (
      source_system, source_fact_id, fact_type, campaign_id, utm_plan_id,
      subject_hash, value_minor, currency, observed_at, metadata
    )
    SELECT 'tok_first_touch', f.source_fact_id, f.fact_type,
      v_touch.campaign_id, v_touch.utm_plan_id, v_subject_hash,
      f.value_minor, f.currency, f.created_at, v_metadata || f.details
    FROM order_facts f
    ORDER BY f.source_fact_id
    ON CONFLICT (source_system, source_fact_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END IF;

  -- Partner application (restaurateur, courier): a business conversion.
  IF p_subject_type IS NULL OR p_subject_type = 'signup_application' THEN
    INSERT INTO public.marketing_attribution_facts (
      source_system, source_fact_id, fact_type, campaign_id, utm_plan_id,
      subject_hash, observed_at, metadata
    )
    SELECT 'tok_first_touch', 'conversion:signup_application:' || s.id::text, 'conversion',
      v_touch.campaign_id, v_touch.utm_plan_id, v_subject_hash, s.submitted_at,
      v_metadata || jsonb_build_object(
        'subject_type', 'signup_application',
        'requested_role', s.requested_role::text
      )
    FROM public.signup_applications s
    WHERE s.user_id = p_user_id
      AND (p_subject_id IS NULL OR s.id = p_subject_id)
      AND s.submitted_at >= v_window_start
      AND s.submitted_at < v_window_end
    ORDER BY s.submitted_at
    LIMIT 20
    ON CONFLICT (source_system, source_fact_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.marketing_record_first_touch_facts(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Called by track-analytics with the verified account id from the JWT. The
-- first touch wins: a later visit never replaces it.
CREATE OR REPLACE FUNCTION public.service_record_marketing_acquisition_touch(
  p_user_id uuid,
  p_touch jsonb,
  p_consent_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_utm_pattern constant text := '^[a-z0-9][a-z0-9._-]{0,99}$';
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_touch jsonb := COALESCE(p_touch, '{}'::jsonb);
  v_source text;
  v_medium text;
  v_campaign text;
  v_content text;
  v_term text;
  v_referrer text;
  v_landing text;
  v_touched_text text;
  v_touched_at timestamptz;
  v_campaign_id uuid;
  v_item_id uuid;
  v_plan_id uuid;
  v_inserted integer := 0;
  v_facts integer := 0;
BEGIN
  PERFORM public.marketing_require_service_role();

  IF p_user_id IS NULL OR jsonb_typeof(v_touch) IS DISTINCT FROM 'object'
    OR COALESCE(p_consent_version, '') !~ '^[a-z0-9][a-z0-9._-]{2,63}$' THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'touch_invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'account_missing');
  END IF;

  -- Server-side normalization mirrors marketing-utm.ts; the browser is untrusted.
  v_source := lower(btrim(COALESCE(v_touch ->> 'utm_source', '')));
  v_medium := lower(btrim(COALESCE(v_touch ->> 'utm_medium', '')));
  v_campaign := lower(btrim(COALESCE(v_touch ->> 'utm_campaign', '')));
  v_content := lower(btrim(COALESCE(v_touch ->> 'utm_content', '')));
  v_term := lower(btrim(COALESCE(v_touch ->> 'utm_term', '')));
  IF v_source !~ v_utm_pattern THEN
    v_source := NULL;
    v_medium := NULL;
    v_campaign := NULL;
    v_content := NULL;
    v_term := NULL;
  END IF;
  IF v_medium !~ v_utm_pattern THEN v_medium := NULL; END IF;
  IF v_campaign !~ v_utm_pattern THEN v_campaign := NULL; END IF;
  IF v_content !~ v_utm_pattern THEN v_content := NULL; END IF;
  IF v_term !~ v_utm_pattern THEN v_term := NULL; END IF;

  v_referrer := lower(btrim(COALESCE(v_touch ->> 'referrer_host', '')));
  IF char_length(v_referrer) NOT BETWEEN 3 AND 253
    OR v_referrer !~ '^[a-z0-9]([a-z0-9-]{0,62}[.])+[a-z0-9-]{1,63}$' THEN
    v_referrer := NULL;
  END IF;
  v_landing := v_touch ->> 'landing_path';
  IF COALESCE(v_landing, '') !~ '^/[A-Za-z0-9._~!$&''()*+,;=:@%/-]{0,199}$' THEN
    v_landing := NULL;
  END IF;

  v_touched_text := v_touch ->> 'touched_at';
  IF COALESCE(v_touched_text, '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' THEN
    BEGIN
      v_touched_at := v_touched_text::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_touched_at := NULL;
    END;
  END IF;

  IF v_source IS NULL AND v_referrer IS NULL THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'touch_source_missing');
  END IF;
  IF v_touched_at IS NULL
    OR v_touched_at > now() + interval '5 minutes'
    OR v_touched_at < now() - interval '90 days' THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'touch_time_invalid');
  END IF;

  -- 1. A published calendar item on the network named by utm_source.
  IF v_source IS NOT NULL AND v_content ~ v_uuid_pattern THEN
    SELECT i.id, i.campaign_id
    INTO v_item_id, v_campaign_id
    FROM public.marketing_calendar_items i
    WHERE i.id = v_content::uuid
      AND i.channel = v_source
      AND i.campaign_id IS NOT NULL
      AND (i.published_at IS NOT NULL OR NULLIF(btrim(i.provider_external_id), '') IS NOT NULL);
  END IF;

  -- 2. An active UTM plan prepared by marketing (bio link, QR code, comment).
  IF v_campaign_id IS NULL AND v_source IS NOT NULL AND v_medium IS NOT NULL AND v_campaign IS NOT NULL THEN
    SELECT p.id, p.campaign_id
    INTO v_plan_id, v_campaign_id
    FROM public.marketing_utm_plans p
    WHERE p.is_active
      AND p.utm_source = v_source
      AND p.utm_medium = v_medium
      AND p.utm_campaign = v_campaign
      AND (p.utm_content IS NULL OR p.utm_content = v_content)
      AND (p.utm_term IS NULL OR p.utm_term = v_term)
    ORDER BY (p.utm_content IS NOT NULL) DESC, (p.utm_term IS NOT NULL) DESC, p.updated_at DESC, p.id
    LIMIT 1;
  END IF;

  INSERT INTO public.marketing_acquisition_touches (
    user_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    referrer_host, landing_path, touched_at, consent_version,
    campaign_id, calendar_item_id, utm_plan_id
  )
  VALUES (
    p_user_id, v_source, v_medium, v_campaign, v_content, v_term,
    v_referrer, v_landing, v_touched_at, p_consent_version,
    v_campaign_id, v_item_id, v_plan_id
  )
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Conversions made before binding converge on the same idempotent facts.
  v_facts := public.marketing_record_first_touch_facts(p_user_id);

  RETURN jsonb_build_object(
    'recorded', v_inserted > 0,
    'reason', CASE WHEN v_inserted > 0 THEN NULL ELSE 'first_touch_already_recorded' END,
    'facts_recorded', v_facts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.service_record_marketing_acquisition_touch(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_record_marketing_acquisition_touch(uuid, jsonb, text)
  TO service_role;

-- Marketing consent withdrawn: the stored touch is erased. Facts already
-- produced are pseudonymous, append-only evidence and remain.
CREATE OR REPLACE FUNCTION public.service_forget_marketing_acquisition_touch(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  PERFORM public.marketing_require_service_role();
  DELETE FROM public.marketing_acquisition_touches WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.service_forget_marketing_acquisition_touch(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_forget_marketing_acquisition_touch(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.marketing_first_touch_conversion_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subject_type text := CASE TG_TABLE_NAME
    WHEN 'reservations' THEN 'reservation'
    WHEN 'orders' THEN 'order'
    WHEN 'signup_applications' THEN 'signup_application'
  END;
BEGIN
  IF v_subject_type IS NULL OR NEW.user_id IS NULL THEN
    RETURN NULL;
  END IF;
  -- Almost every row stops at this primary-key probe.
  IF NOT EXISTS (
    SELECT 1 FROM public.marketing_acquisition_touches t
    WHERE t.user_id = NEW.user_id AND t.campaign_id IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM public.marketing_record_first_touch_facts(NEW.user_id, v_subject_type, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Attribution is observational: it never blocks a booking, order or application.
    RAISE WARNING 'marketing_first_touch_attribution_skipped: %', SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.marketing_first_touch_conversion_trigger()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS marketing_first_touch_on_reservations ON public.reservations;
CREATE TRIGGER marketing_first_touch_on_reservations
AFTER INSERT OR UPDATE OF status ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.marketing_first_touch_conversion_trigger();

DROP TRIGGER IF EXISTS marketing_first_touch_on_orders ON public.orders;
CREATE TRIGGER marketing_first_touch_on_orders
AFTER INSERT OR UPDATE OF status, payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.marketing_first_touch_conversion_trigger();

DROP TRIGGER IF EXISTS marketing_first_touch_on_signup_applications ON public.signup_applications;
CREATE TRIGGER marketing_first_touch_on_signup_applications
AFTER INSERT ON public.signup_applications
FOR EACH ROW EXECUTE FUNCTION public.marketing_first_touch_conversion_trigger();

COMMIT;
