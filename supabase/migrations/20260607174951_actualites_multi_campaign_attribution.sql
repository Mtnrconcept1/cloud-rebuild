-- Attribute Actualites sponsored activity to every eligible active campaign
-- attached to a visible post, and credit conversions to every recent paid
-- campaign click in the attribution window.

CREATE INDEX IF NOT EXISTS social_feed_events_conversion_lookup_idx
  ON public.social_feed_events(user_id, restaurant_id, campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL
    AND event_type IN ('click', 'cta_click')
    AND COALESCE(is_internal_actor, false) = false;

CREATE OR REPLACE FUNCTION public.record_social_feed_event(
  p_post_id uuid,
  p_event_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_auth_user_id uuid := (SELECT auth.uid());
  v_user_id uuid := COALESCE(v_auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_restaurant_id uuid;
  v_event_id uuid;
  v_first_event_id uuid;
  v_campaign record;
  v_campaign_count integer := 0;
  v_page text := NULLIF(COALESCE(p_metadata->>'page', p_metadata->>'source_page'), '');
  v_source text := NULLIF(COALESCE(p_metadata->>'source', p_metadata->>'placement'), '');
  v_viewer_id text;
  v_dedupe_key text;
  v_campaign_recorded boolean := false;
  v_is_internal_actor boolean := false;
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'cta_click', 'reaction', 'comment', 'share', 'save', 'follow', 'repost') THEN
    RAISE EXCEPTION 'Type evenement social invalide: %', p_event_type;
  END IF;

  IF v_auth_user_id IS NULL AND p_event_type NOT IN ('impression', 'click', 'cta_click') THEN
    RAISE EXCEPTION 'Connexion requise.';
  END IF;

  SELECT p.restaurant_id
  INTO v_restaurant_id
  FROM public.social_posts p
  WHERE p.id = p_post_id
    AND p.status = 'published'
    AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
    AND (p.published_at IS NULL OR p.published_at <= now())
    AND p.visibility = 'public';

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Post introuvable.';
  END IF;

  v_is_internal_actor := public.is_restaurant_internal_actor(v_auth_user_id, v_restaurant_id);
  v_viewer_id := COALESCE(NULLIF(p_metadata->>'viewerId', ''), v_auth_user_id::text, v_user_id::text);

  FOR v_campaign IN
    SELECT *
    FROM (
      SELECT DISTINCT ON (spp.campaign_id)
        spp.id AS promotion_id,
        spp.campaign_id,
        COALESCE(spp.boost_weight, 1) AS boost_weight,
        spp.created_at
      FROM public.social_post_promotions spp
      JOIN public.ad_campaigns ac ON ac.id = spp.campaign_id
      WHERE spp.post_id = p_post_id
        AND spp.restaurant_id = v_restaurant_id
        AND spp.status = 'active'
        AND ac.status = 'active'
        AND ac.payment_status = 'paid'
        AND (spp.starts_at IS NULL OR spp.starts_at <= now())
        AND (spp.ends_at IS NULL OR spp.ends_at >= now())
        AND (ac.starts_at IS NULL OR ac.starts_at <= now())
        AND (ac.ends_at IS NULL OR ac.ends_at >= now())
        AND public.jsonb_target_pages_has_actualites(ac.target_pages)
        AND (COALESCE(ac.total_budget, 0) <= 0 OR COALESCE(ac.spent, 0) < COALESCE(ac.total_budget, 0))
        AND (
          COALESCE(ac.budget_daily, 0) <= 0
          OR ac.daily_spent_date IS DISTINCT FROM current_date
          OR COALESCE(ac.daily_spent, 0) < COALESCE(ac.budget_daily, 0)
        )
      ORDER BY spp.campaign_id, COALESCE(spp.boost_weight, 1) DESC, spp.created_at DESC
    ) eligible_campaigns
    ORDER BY boost_weight DESC, created_at DESC, campaign_id
  LOOP
    INSERT INTO public.social_feed_events (
      user_id,
      post_id,
      restaurant_id,
      event_type,
      metadata,
      campaign_id,
      promotion_id,
      source,
      page,
      is_internal_actor
    )
    VALUES (
      v_user_id,
      p_post_id,
      v_restaurant_id,
      p_event_type,
      COALESCE(p_metadata, '{}'::jsonb),
      v_campaign.campaign_id,
      v_campaign.promotion_id,
      v_source,
      v_page,
      v_is_internal_actor
    )
    RETURNING id INTO v_event_id;

    v_first_event_id := COALESCE(v_first_event_id, v_event_id);
    v_campaign_count := v_campaign_count + 1;

    IF NOT v_is_internal_actor AND p_event_type IN ('impression', 'click', 'cta_click') THEN
      v_dedupe_key := encode(
        digest(
          concat_ws('|', v_campaign.campaign_id::text, p_post_id::text, p_event_type, v_viewer_id, current_date::text, COALESCE(v_source, ''), COALESCE(v_page, '')),
          'sha256'
        ),
        'hex'
      );

      SELECT public.record_ad_campaign_event(
        v_campaign.campaign_id,
        v_restaurant_id,
        CASE WHEN p_event_type = 'cta_click' THEN 'click' ELSE p_event_type END,
        v_dedupe_key,
        v_auth_user_id,
        v_source,
        COALESCE(v_page, 'actualites'),
        jsonb_build_object(
          'social_post_id', p_post_id,
          'social_event_id', v_event_id,
          'promotion_id', v_campaign.promotion_id,
          'raw_event_type', p_event_type,
          'viewer_id', v_viewer_id,
          'metadata', COALESCE(p_metadata, '{}'::jsonb)
        ),
        NULL
      ) INTO v_campaign_recorded;
    END IF;
  END LOOP;

  IF v_first_event_id IS NULL THEN
    INSERT INTO public.social_feed_events (
      user_id,
      post_id,
      restaurant_id,
      event_type,
      metadata,
      campaign_id,
      promotion_id,
      source,
      page,
      is_internal_actor
    )
    VALUES (
      v_user_id,
      p_post_id,
      v_restaurant_id,
      p_event_type,
      COALESCE(p_metadata, '{}'::jsonb),
      NULL,
      NULL,
      v_source,
      v_page,
      v_is_internal_actor
    )
    RETURNING id INTO v_first_event_id;
  END IF;

  IF v_is_internal_actor THEN
    RETURN v_first_event_id;
  END IF;

  INSERT INTO public.social_post_metrics_daily (
    post_id,
    metric_date,
    impressions_count,
    clicks_count,
    cta_clicks_count,
    reactions_count,
    comments_count,
    shares_count,
    saves_count,
    reposts_count,
    campaign_impressions_count,
    campaign_clicks_count,
    campaign_cta_clicks_count
  )
  VALUES (
    p_post_id,
    current_date,
    CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'cta_click' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'reaction' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'comment' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'share' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'save' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'repost' THEN 1 ELSE 0 END,
    CASE WHEN v_campaign_count > 0 AND p_event_type = 'impression' THEN v_campaign_count ELSE 0 END,
    CASE WHEN v_campaign_count > 0 AND p_event_type = 'click' THEN v_campaign_count ELSE 0 END,
    CASE WHEN v_campaign_count > 0 AND p_event_type = 'cta_click' THEN v_campaign_count ELSE 0 END
  )
  ON CONFLICT (post_id, metric_date) DO UPDATE
  SET
    impressions_count = public.social_post_metrics_daily.impressions_count + EXCLUDED.impressions_count,
    clicks_count = public.social_post_metrics_daily.clicks_count + EXCLUDED.clicks_count,
    cta_clicks_count = public.social_post_metrics_daily.cta_clicks_count + EXCLUDED.cta_clicks_count,
    reactions_count = public.social_post_metrics_daily.reactions_count + EXCLUDED.reactions_count,
    comments_count = public.social_post_metrics_daily.comments_count + EXCLUDED.comments_count,
    shares_count = public.social_post_metrics_daily.shares_count + EXCLUDED.shares_count,
    saves_count = public.social_post_metrics_daily.saves_count + EXCLUDED.saves_count,
    reposts_count = public.social_post_metrics_daily.reposts_count + EXCLUDED.reposts_count,
    campaign_impressions_count = public.social_post_metrics_daily.campaign_impressions_count + EXCLUDED.campaign_impressions_count,
    campaign_clicks_count = public.social_post_metrics_daily.campaign_clicks_count + EXCLUDED.campaign_clicks_count,
    campaign_cta_clicks_count = public.social_post_metrics_daily.campaign_cta_clicks_count + EXCLUDED.campaign_cta_clicks_count,
    updated_at = now();

  RETURN v_first_event_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_social_feed_event(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_social_feed_event(uuid, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_actualites_sponsored_conversion(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_conversion_type text,
  p_entity_id uuid,
  p_payment_method text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_event record;
  v_dedupe_key text;
  v_recorded boolean := false;
  v_recorded_any boolean := false;
  v_payment_method text := NULLIF(lower(trim(COALESCE(p_payment_method, ''))), '');
  v_journey_type text;
  v_order_metadata jsonb := '{}'::jsonb;
  v_order_delivery_address text;
  v_order_type text;
  v_order_source text;
  v_order_mode text;
  v_reservation_feature text;
  v_reservation_metadata jsonb := '{}'::jsonb;
  v_reservation_payment_method text;
BEGIN
  IF p_user_id IS NULL OR p_restaurant_id IS NULL OR p_entity_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_conversion_type NOT IN ('order', 'reservation', 'zero-attente') THEN
    RETURN false;
  END IF;

  IF v_payment_method IN ('unknown', 'null', 'undefined', '') THEN
    v_payment_method := NULL;
  END IF;

  IF p_conversion_type = 'order' THEN
    SELECT
      COALESCE(o.metadata, '{}'::jsonb),
      NULLIF(trim(COALESCE(o.delivery_address, '')), ''),
      NULLIF(lower(trim(COALESCE(o.type, ''))), ''),
      NULLIF(lower(trim(COALESCE(o.source, ''))), '')
    INTO v_order_metadata, v_order_delivery_address, v_order_type, v_order_source
    FROM public.orders o
    WHERE o.id = p_entity_id
      AND o.restaurant_id = p_restaurant_id
      AND o.user_id = p_user_id
    LIMIT 1;

    v_order_mode := NULLIF(lower(trim(COALESCE(
      v_order_metadata->>'order_mode',
      v_order_metadata->>'orderMode',
      v_order_metadata->>'fulfillment',
      v_order_metadata->>'fulfillment_type',
      v_order_type,
      v_order_source,
      ''
    ))), '');

    v_payment_method := COALESCE(
      v_payment_method,
      NULLIF(lower(trim(COALESCE(v_order_metadata->>'payment_method', ''))), ''),
      NULLIF(lower(trim(COALESCE(v_order_metadata->>'paymentMethod', ''))), '')
    );

    v_journey_type := CASE
      WHEN v_order_mode IN ('delivery', 'livraison') THEN 'delivery'
      WHEN v_order_mode IN ('takeaway', 'pickup', 'emporter', 'a_emporter', 'click_collect', 'collect') THEN 'takeaway'
      WHEN v_order_delivery_address IS NOT NULL THEN 'delivery'
      ELSE 'takeaway'
    END;
  ELSE
    SELECT
      NULLIF(lower(trim(COALESCE(r.feature, ''))), ''),
      COALESCE(r.metadata, '{}'::jsonb),
      NULLIF(lower(trim(COALESCE(r.payment_method, ''))), '')
    INTO v_reservation_feature, v_reservation_metadata, v_reservation_payment_method
    FROM public.reservations r
    WHERE r.id = p_entity_id
      AND r.restaurant_id = p_restaurant_id
      AND r.user_id = p_user_id
    LIMIT 1;

    v_payment_method := COALESCE(
      v_payment_method,
      v_reservation_payment_method,
      NULLIF(lower(trim(COALESCE(v_reservation_metadata->>'payment_method', ''))), ''),
      NULLIF(lower(trim(COALESCE(v_reservation_metadata->>'paymentMethod', ''))), '')
    );

    v_journey_type := CASE
      WHEN p_conversion_type = 'zero-attente'
        OR v_reservation_feature IN ('zero-attente', 'zero_attente', 'zero attente')
        OR lower(COALESCE(v_reservation_metadata->>'feature', '')) IN ('zero-attente', 'zero_attente', 'zero attente')
        THEN 'zero-attente'
      ELSE 'reservation'
    END;
  END IF;

  v_payment_method := CASE
    WHEN v_payment_method IN ('cash', 'especes', 'cash_on_delivery', 'on_site', 'onsite') THEN 'cash'
    WHEN v_payment_method IN ('card', 'carte', 'stripe', 'credit_card', 'debit_card') THEN 'card'
    WHEN v_payment_method = 'twint' THEN 'twint'
    WHEN v_payment_method IN ('unknown', 'null', 'undefined', '') THEN NULL
    ELSE v_payment_method
  END;

  IF v_payment_method IS NULL AND v_journey_type = 'reservation' THEN
    v_payment_method := 'onsite';
  END IF;

  FOR v_event IN
    SELECT DISTINCT ON (e.campaign_id)
      e.*
    FROM public.social_feed_events e
    JOIN public.ad_campaigns ac ON ac.id = e.campaign_id
    WHERE e.user_id = p_user_id
      AND e.restaurant_id = p_restaurant_id
      AND e.campaign_id IS NOT NULL
      AND e.event_type IN ('cta_click', 'click')
      AND COALESCE(e.is_internal_actor, false) = false
      AND e.created_at >= now() - interval '24 hours'
      AND ac.payment_status = 'paid'
    ORDER BY e.campaign_id, CASE WHEN e.event_type = 'cta_click' THEN 0 ELSE 1 END, e.created_at DESC
  LOOP
    v_dedupe_key := encode(
      digest(
        concat_ws('|', 'actualites', v_event.campaign_id::text, p_conversion_type, p_entity_id::text),
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
        'social_event_id', v_event.id,
        'promotion_id', v_event.promotion_id,
        'payment_method', v_payment_method,
        'attribution_window_hours', 24
      ),
      p_conversion_type
    ) INTO v_recorded;

    IF v_recorded THEN
      v_recorded_any := true;
      INSERT INTO public.social_post_metrics_daily (post_id, metric_date, campaign_conversions_count)
      VALUES (v_event.post_id, current_date, 1)
      ON CONFLICT (post_id, metric_date) DO UPDATE
      SET campaign_conversions_count = public.social_post_metrics_daily.campaign_conversions_count + 1,
          updated_at = now();
    END IF;
  END LOOP;

  RETURN v_recorded_any;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_actualites_sponsored_conversion(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_actualites_sponsored_conversion(uuid, uuid, text, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
