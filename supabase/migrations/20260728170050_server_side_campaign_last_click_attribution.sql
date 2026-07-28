-- Complete conversion attribution server-side when a confirmed entity has a recent
-- authenticated sponsored click, even if the browser left for Stripe before its
-- pre-redirect attribution request completed.

CREATE OR REPLACE FUNCTION public.process_pending_ad_campaign_conversions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pending record;
  v_click record;
  v_entity_state text;
  v_recorded boolean := false;
  v_event_exists boolean := false;
  v_allowed_types text[];
  v_conversion_type text;
  v_dedupe_key text;
  v_row jsonb := to_jsonb(NEW);
  v_feature text;
  v_journey_type text;
  v_payment_method text;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    v_allowed_types := ARRAY['order']::text[];
    v_conversion_type := 'order';
    v_journey_type := CASE
      WHEN NULLIF(trim(COALESCE(v_row->>'delivery_address', '')), '') IS NOT NULL THEN 'delivery'
      WHEN lower(COALESCE(v_row->'metadata'->>'order_mode', v_row->'metadata'->>'fulfillment', '')) IN ('delivery', 'livraison') THEN 'delivery'
      ELSE 'takeaway'
    END;
    v_payment_method := NULLIF(lower(trim(COALESCE(
      v_row->'metadata'->>'payment_method',
      v_row->'metadata'->>'paymentMethod',
      v_row->>'payment_method',
      ''
    ))), '');
  ELSIF TG_TABLE_NAME = 'reservations' THEN
    v_allowed_types := ARRAY['reservation', 'zero-attente']::text[];
    v_feature := lower(trim(COALESCE(v_row->>'feature', v_row->'metadata'->>'feature', '')));
    v_conversion_type := CASE
      WHEN v_feature IN ('zero-attente', 'zero_attente', 'zero attente') THEN 'zero-attente'
      ELSE 'reservation'
    END;
    v_journey_type := v_conversion_type;
    v_payment_method := COALESCE(
      NULLIF(lower(trim(COALESCE(v_row->>'payment_method', ''))), ''),
      NULLIF(lower(trim(COALESCE(v_row->'metadata'->>'payment_method', v_row->'metadata'->>'paymentMethod', ''))), ''),
      'onsite'
    );
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

  v_entity_state := public.ad_campaign_conversion_entity_state(
    v_conversion_type,
    NEW.id,
    NEW.restaurant_id,
    NEW.user_id
  );

  IF v_entity_state <> 'confirmed' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_click IN
    SELECT DISTINCT ON (e.campaign_id)
      e.id,
      e.campaign_id,
      e.source,
      e.page,
      e.payload,
      e.occurred_at
    FROM public.ad_campaign_events e
    WHERE e.restaurant_id = NEW.restaurant_id
      AND e.user_id = NEW.user_id
      AND e.event_type = 'click'
      AND e.occurred_at >= now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1
        FROM public.ad_campaign_events converted
        WHERE converted.campaign_id = e.campaign_id
          AND converted.restaurant_id = NEW.restaurant_id
          AND converted.event_type = 'conversion'
          AND converted.conversion_type = v_conversion_type
          AND converted.payload->>'entity_id' = NEW.id::text
      )
    ORDER BY e.campaign_id, e.occurred_at DESC
  LOOP
    v_dedupe_key := encode(
      digest(
        concat_ws('|', 'server-confirmed-last-click', v_click.campaign_id::text, v_conversion_type, NEW.id::text),
        'sha256'
      ),
      'hex'
    );

    PERFORM public.record_ad_campaign_event(
      v_click.campaign_id,
      NEW.restaurant_id,
      'conversion',
      v_dedupe_key,
      NEW.user_id,
      COALESCE(v_click.source, 'server_confirmed_last_click'),
      COALESCE(v_click.page, TG_TABLE_NAME),
      jsonb_build_object(
        'entity_id', NEW.id,
        'conversion_type', v_conversion_type,
        'journey_type', v_journey_type,
        'payment_method', v_payment_method,
        'attributed_click_id', v_click.id,
        'attributed_click_at', v_click.occurred_at,
        'attribution_model', 'authenticated_last_click_24h',
        'attribution_window_hours', 24,
        'confirmed_at', now()
      ),
      v_conversion_type
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_pending_ad_campaign_conversions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_pending_ad_campaign_conversions() TO service_role;
