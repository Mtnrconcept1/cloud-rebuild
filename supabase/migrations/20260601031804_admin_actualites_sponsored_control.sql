-- Admin controls for sponsored Actualités posts.
-- Provides a global read model and audited suspension/reactivation actions.

CREATE OR REPLACE FUNCTION public.admin_get_actualites_sponsored_posts(p_days integer DEFAULT 30)
RETURNS TABLE (
  promotion_id uuid,
  post_id uuid,
  restaurant_id uuid,
  restaurant_name text,
  campaign_id uuid,
  campaign_title text,
  campaign_status text,
  payment_status text,
  promotion_status text,
  budget_amount numeric,
  spent numeric,
  daily_spent numeric,
  total_budget numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  boost_weight numeric,
  post_body text,
  post_status text,
  impressions integer,
  clicks integer,
  cta_clicks integer,
  conversions integer,
  order_conversions integer,
  reservation_conversions integer,
  zero_attente_conversions integer,
  engagement_rate numeric,
  cost_per_conversion numeric,
  suspicious_signals jsonb,
  last_event_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 180);
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  RETURN QUERY
  WITH metrics AS (
    SELECT
      m.post_id,
      COALESCE(SUM(m.campaign_impressions_count), 0)::integer AS impressions,
      COALESCE(SUM(m.campaign_clicks_count), 0)::integer AS clicks,
      COALESCE(SUM(m.campaign_cta_clicks_count), 0)::integer AS cta_clicks,
      COALESCE(SUM(m.campaign_conversions_count), 0)::integer AS conversions
    FROM public.social_post_metrics_daily m
    WHERE m.metric_date >= current_date - v_days
    GROUP BY m.post_id
  ),
  campaign_activity AS (
    SELECT
      e.campaign_id,
      COUNT(*) FILTER (WHERE e.event_type = 'conversion' AND e.conversion_type = 'order')::integer AS order_conversions,
      COUNT(*) FILTER (WHERE e.event_type = 'conversion' AND e.conversion_type = 'reservation')::integer AS reservation_conversions,
      COUNT(*) FILTER (WHERE e.event_type = 'conversion' AND e.conversion_type IN ('zero-attente', 'zero_attente'))::integer AS zero_attente_conversions
    FROM public.ad_campaign_events e
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.campaign_id
  ),
  feed_activity AS (
    SELECT
      e.promotion_id,
      MAX(e.created_at) AS last_event_at,
      COUNT(*) FILTER (WHERE COALESCE(e.is_internal_actor, false))::integer AS internal_events,
      GREATEST(
        0,
        COUNT(*) FILTER (WHERE e.event_type IN ('click', 'cta_click'))
        - COUNT(DISTINCT COALESCE(
            NULLIF(e.user_id::text, '00000000-0000-0000-0000-000000000000'),
            NULLIF(e.metadata->>'viewer_id', ''),
            NULLIF(e.metadata->>'session_id', ''),
            e.id::text
          )) FILTER (WHERE e.event_type IN ('click', 'cta_click'))
      )::integer AS repeat_clicks
    FROM public.social_feed_events e
    WHERE e.promotion_id IS NOT NULL
      AND e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.promotion_id
  )
  SELECT
    spp.id AS promotion_id,
    spp.post_id,
    spp.restaurant_id,
    r.name AS restaurant_name,
    spp.campaign_id,
    ac.title AS campaign_title,
    COALESCE(ac.status, 'draft') AS campaign_status,
    COALESCE(ac.payment_status, 'unpaid') AS payment_status,
    spp.status AS promotion_status,
    spp.budget_amount,
    COALESCE(ac.spent, 0) AS spent,
    COALESCE(ac.daily_spent, 0) AS daily_spent,
    COALESCE(ac.total_budget, spp.budget_amount, 0) AS total_budget,
    COALESCE(spp.starts_at, ac.starts_at) AS starts_at,
    COALESCE(spp.ends_at, ac.ends_at) AS ends_at,
    spp.boost_weight,
    sp.body AS post_body,
    sp.status AS post_status,
    COALESCE(m.impressions, 0) AS impressions,
    COALESCE(m.clicks, 0) AS clicks,
    COALESCE(m.cta_clicks, 0) AS cta_clicks,
    COALESCE(m.conversions, 0) AS conversions,
    COALESCE(ca.order_conversions, 0) AS order_conversions,
    COALESCE(ca.reservation_conversions, 0) AS reservation_conversions,
    COALESCE(ca.zero_attente_conversions, 0) AS zero_attente_conversions,
    CASE
      WHEN COALESCE(m.impressions, 0) > 0
        THEN ROUND(((COALESCE(m.clicks, 0) + COALESCE(m.cta_clicks, 0))::numeric / GREATEST(m.impressions, 1)::numeric) * 100, 2)
      ELSE 0
    END AS engagement_rate,
    CASE
      WHEN COALESCE(m.conversions, 0) > 0
        THEN ROUND(COALESCE(ac.spent, 0)::numeric / GREATEST(m.conversions, 1)::numeric, 2)
      ELSE 0
    END AS cost_per_conversion,
    jsonb_strip_nulls(jsonb_build_object(
      'repeat_clicks', CASE WHEN COALESCE(fa.repeat_clicks, 0) > 0 THEN fa.repeat_clicks END,
      'internal_events', CASE WHEN COALESCE(fa.internal_events, 0) > 0 THEN fa.internal_events END,
      'paid_not_active', CASE WHEN ac.payment_status = 'paid' AND ac.status = 'active' AND spp.status <> 'active' THEN true END,
      'active_unpaid', CASE WHEN spp.status = 'active' AND COALESCE(ac.payment_status, 'unpaid') <> 'paid' THEN true END,
      'conversions_without_clicks', CASE WHEN COALESCE(m.conversions, 0) > 0 AND COALESCE(m.clicks, 0) + COALESCE(m.cta_clicks, 0) = 0 THEN true END,
      'spent_without_engagement', CASE WHEN COALESCE(ac.spent, 0) > 0 AND COALESCE(m.clicks, 0) + COALESCE(m.cta_clicks, 0) = 0 THEN true END
    )) AS suspicious_signals,
    fa.last_event_at
  FROM public.social_post_promotions spp
  JOIN public.social_posts sp ON sp.id = spp.post_id
  JOIN public.restaurants r ON r.id = spp.restaurant_id
  JOIN public.ad_campaigns ac ON ac.id = spp.campaign_id
  LEFT JOIN metrics m ON m.post_id = spp.post_id
  LEFT JOIN campaign_activity ca ON ca.campaign_id = spp.campaign_id
  LEFT JOIN feed_activity fa ON fa.promotion_id = spp.id
  ORDER BY
    CASE WHEN spp.status = 'active' THEN 0 WHEN spp.status = 'pending_payment' THEN 1 ELSE 2 END,
    COALESCE(fa.last_event_at, spp.updated_at, spp.created_at) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_social_post_promotion(
  p_promotion_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS TABLE (promotion_id uuid, promotion_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_next_status text := lower(trim(COALESCE(p_status, '')));
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
  v_promotion public.social_post_promotions%ROWTYPE;
  v_campaign public.ad_campaigns%ROWTYPE;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF v_next_status NOT IN ('active', 'paused', 'rejected', 'ended') THEN
    RAISE EXCEPTION 'Unsupported promotion status: %', p_status;
  END IF;

  IF v_next_status IN ('paused', 'rejected', 'ended') AND v_note IS NULL THEN
    RAISE EXCEPTION 'Review note is required for this promotion action.';
  END IF;

  SELECT * INTO v_promotion
  FROM public.social_post_promotions
  WHERE id = p_promotion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sponsored promotion not found.';
  END IF;

  SELECT * INTO v_campaign
  FROM public.ad_campaigns
  WHERE id = v_promotion.campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked campaign not found.';
  END IF;

  IF v_next_status = 'active' AND COALESCE(v_campaign.payment_status, 'unpaid') <> 'paid' THEN
    RAISE EXCEPTION 'Cannot reactivate an unpaid sponsored campaign.';
  END IF;

  UPDATE public.social_post_promotions
  SET status = v_next_status,
      updated_at = now()
  WHERE id = p_promotion_id;

  UPDATE public.ad_campaigns
  SET status = CASE
        WHEN v_next_status = 'active' THEN 'active'
        WHEN v_next_status = 'paused' THEN 'paused'
        WHEN v_next_status IN ('rejected', 'ended') THEN v_next_status
        ELSE status
      END,
      updated_at = now()
  WHERE id = v_promotion.campaign_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_review_social_post_promotion',
    'social_post_promotions',
    p_promotion_id,
    jsonb_build_object(
      'promotion_status', v_promotion.status,
      'campaign_status', v_campaign.status,
      'payment_status', v_campaign.payment_status
    ),
    jsonb_build_object(
      'promotion_status', v_next_status,
      'campaign_id', v_promotion.campaign_id,
      'review_note', v_note
    )
  );

  RETURN QUERY SELECT p_promotion_id, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_actualites_sponsored_posts(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_review_social_post_promotion(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_actualites_sponsored_posts(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_social_post_promotion(uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
