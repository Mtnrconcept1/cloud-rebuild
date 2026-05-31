-- Harden Actualites sponsored conversion attribution and dashboard insights.
-- Fixes RPC 400s by providing a stable JSONB contract for the restaurant dashboard.

CREATE OR REPLACE FUNCTION public.get_restaurant_actualites_insights(
  p_restaurant_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_start_date date := current_date - (LEAST(GREATEST(COALESCE(p_days, 30), 1), 365) - 1);
  v_start_at timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365));
  v_posts_count integer := 0;
  v_published_count integer := 0;
  v_hidden_count integer := 0;
  v_scheduled_count integer := 0;
  v_posts_with_cta integer := 0;
  v_impressions integer := 0;
  v_clicks integer := 0;
  v_cta_clicks integer := 0;
  v_saves integer := 0;
  v_interactions integer := 0;
  v_engagement_rate numeric := 0;
  v_conversion_focus integer := 0;
  v_campaign_goals jsonb := '{}'::jsonb;
  v_campaigns jsonb := '{}'::jsonb;
  v_conversion_total integer := 0;
  v_order_conversions integer := 0;
  v_reservation_conversions integer := 0;
  v_zero_attente_conversions integer := 0;
  v_recommendations jsonb := '[]'::jsonb;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id requis';
  END IF;

  IF NOT (
    public.has_role(v_user_id, 'admin')
    OR public.auth_owns_restaurant(p_restaurant_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH posts AS (
    SELECT *
    FROM public.social_posts sp
    WHERE sp.restaurant_id = p_restaurant_id
  ), metrics AS (
    SELECT COALESCE(sum(m.impressions_count), 0)::integer AS impressions,
           COALESCE(sum(m.clicks_count), 0)::integer AS clicks,
           COALESCE(sum(m.cta_clicks_count), 0)::integer AS cta_clicks,
           COALESCE(sum(m.saves_count), 0)::integer AS saves,
           COALESCE(sum(m.reactions_count + m.comments_count + m.shares_count + m.reposts_count + m.saves_count + m.cta_clicks_count), 0)::integer AS interactions
    FROM public.social_post_metrics_daily m
    JOIN posts p ON p.id = m.post_id
    WHERE m.metric_date >= v_start_date
  ), events AS (
    SELECT *
    FROM public.ad_campaign_events ace
    WHERE ace.restaurant_id = p_restaurant_id
      AND ace.event_type = 'conversion'
      AND ace.occurred_at >= v_start_at
      AND (
        COALESCE(ace.page, '') = 'actualites'
        OR ace.payload ? 'social_post_id'
        OR ace.payload->>'source' = 'actualites'
      )
  )
  SELECT
    (SELECT count(*)::integer FROM posts),
    (SELECT count(*)::integer FROM posts WHERE status = 'published'),
    (SELECT count(*)::integer FROM posts WHERE status <> 'published'),
    (SELECT count(*)::integer FROM posts WHERE scheduled_at IS NOT NULL),
    (SELECT count(*)::integer FROM posts WHERE COALESCE(cta_type, 'none') <> 'none'),
    COALESCE((SELECT impressions FROM metrics), 0),
    COALESCE((SELECT clicks FROM metrics), 0),
    COALESCE((SELECT cta_clicks FROM metrics), 0),
    COALESCE((SELECT saves FROM metrics), 0),
    COALESCE((SELECT interactions FROM metrics), 0),
    COALESCE((SELECT count(*)::integer FROM events), 0),
    COALESCE((SELECT count(*)::integer FROM events WHERE conversion_type = 'order'), 0),
    COALESCE((SELECT count(*)::integer FROM events WHERE conversion_type = 'reservation'), 0),
    COALESCE((SELECT count(*)::integer FROM events WHERE conversion_type IN ('zero-attente', 'zero_attente')), 0),
    COALESCE((
      SELECT jsonb_object_agg(goal, goal_count)
      FROM (
        SELECT COALESCE(campaign_goal, 'awareness') AS goal, count(*)::integer AS goal_count
        FROM posts
        GROUP BY COALESCE(campaign_goal, 'awareness')
      ) grouped
    ), '{}'::jsonb),
    COALESCE((
      SELECT jsonb_object_agg(campaign_id::text, conversion_count)
      FROM (
        SELECT campaign_id, count(*)::integer AS conversion_count
        FROM events
        WHERE campaign_id IS NOT NULL
        GROUP BY campaign_id
      ) grouped
    ), '{}'::jsonb)
  INTO
    v_posts_count,
    v_published_count,
    v_hidden_count,
    v_scheduled_count,
    v_posts_with_cta,
    v_impressions,
    v_clicks,
    v_cta_clicks,
    v_saves,
    v_interactions,
    v_conversion_total,
    v_order_conversions,
    v_reservation_conversions,
    v_zero_attente_conversions,
    v_campaign_goals,
    v_campaigns;

  v_engagement_rate := CASE
    WHEN v_impressions > 0 THEN round(((v_interactions::numeric / v_impressions::numeric) * 100)::numeric, 1)
    ELSE 0
  END;

  v_conversion_focus := CASE
    WHEN v_posts_count > 0 THEN round(((v_posts_with_cta::numeric / v_posts_count::numeric) * 100)::numeric, 0)::integer
    ELSE 0
  END;

  v_recommendations := to_jsonb(array_remove(ARRAY[
    CASE WHEN v_posts_count > 0 AND v_posts_with_cta < CEIL(v_posts_count * 0.6) THEN 'Ajoutez un CTA clair sur les posts qui doivent generer commandes, reservations ou offres.' END,
    CASE WHEN v_impressions > 0 AND v_cta_clicks = 0 THEN 'Les posts sont vus mais ne convertissent pas encore: testez une offre courte ou un bouton Commander.' END,
    CASE WHEN v_cta_clicks > 0 AND v_conversion_total = 0 THEN 'Les clics CTA existent mais aucune conversion sponsorisee n est attribuee: verifiez la promesse du post et le parcours commande/reservation.' END,
    CASE WHEN v_conversion_total > 0 THEN 'Les conversions sponsorisees sont actives: analysez les posts et campagnes qui convertissent le mieux.' END
  ]::text[], NULL));

  RETURN jsonb_build_object(
    'postsCount', v_posts_count,
    'publishedCount', v_published_count,
    'hiddenCount', v_hidden_count,
    'impressions', v_impressions,
    'clicks', v_clicks,
    'ctaClicks', v_cta_clicks,
    'saves', v_saves,
    'interactions', v_interactions,
    'engagementRate', v_engagement_rate,
    'conversionFocus', v_conversion_focus,
    'scheduledCount', v_scheduled_count,
    'campaignGoals', v_campaign_goals,
    'campaigns', v_campaigns,
    'conversions', v_conversion_total,
    'sponsoredConversions', v_conversion_total,
    'orderConversions', v_order_conversions,
    'reservationConversions', v_reservation_conversions,
    'zeroAttenteConversions', v_zero_attente_conversions,
    'conversionsByType', jsonb_build_object(
      'order', v_order_conversions,
      'reservation', v_reservation_conversions,
      'zeroAttente', v_zero_attente_conversions,
      'total', v_conversion_total
    ),
    'recommendations', v_recommendations
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_actualites_insights(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_actualites_insights(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_restaurant_campaign_activity(
  p_restaurant_id uuid,
  p_days integer DEFAULT 30,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  campaign_id uuid,
  campaign_title text,
  event_type text,
  conversion_type text,
  social_post_id uuid,
  entity_id uuid,
  source text,
  page text,
  occurred_at timestamptz,
  payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_id requis';
  END IF;

  IF NOT (
    public.has_role(v_user_id, 'admin')
    OR public.auth_owns_restaurant(p_restaurant_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    ace.id,
    ace.campaign_id,
    ac.title AS campaign_title,
    ace.event_type,
    ace.conversion_type,
    NULLIF(ace.payload->>'social_post_id', '')::uuid AS social_post_id,
    NULLIF(ace.payload->>'entity_id', '')::uuid AS entity_id,
    ace.source,
    ace.page,
    ace.occurred_at,
    ace.payload
  FROM public.ad_campaign_events ace
  JOIN public.ad_campaigns ac ON ac.id = ace.campaign_id
  WHERE ace.restaurant_id = p_restaurant_id
    AND ace.occurred_at >= now() - make_interval(days => v_days)
    AND (
      ace.event_type = 'conversion'
      OR ace.page = 'actualites'
      OR ace.payload ? 'social_post_id'
    )
  ORDER BY ace.occurred_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_campaign_activity(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_campaign_activity(uuid, integer, integer) TO authenticated;

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
BEGIN
  IF p_user_id IS NULL OR p_restaurant_id IS NULL OR p_entity_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_conversion_type NOT IN ('order', 'reservation', 'zero-attente') THEN
    RETURN false;
  END IF;

  SELECT e.*
  INTO v_event
  FROM public.social_feed_events e
  JOIN public.ad_campaigns ac ON ac.id = e.campaign_id
  WHERE e.user_id = p_user_id
    AND e.restaurant_id = p_restaurant_id
    AND e.campaign_id IS NOT NULL
    AND e.event_type IN ('cta_click', 'click')
    AND COALESCE(e.is_internal_actor, false) = false
    AND e.created_at >= now() - interval '24 hours'
    AND ac.payment_status = 'paid'
  ORDER BY CASE WHEN e.event_type = 'cta_click' THEN 0 ELSE 1 END, e.created_at DESC
  LIMIT 1;

  IF v_event.campaign_id IS NULL THEN
    RETURN false;
  END IF;

  v_dedupe_key := encode(digest(concat_ws('|', 'actualites', v_event.campaign_id::text, p_conversion_type, p_entity_id::text), 'sha256'), 'hex');

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
      'entity_id', p_entity_id,
      'social_post_id', v_event.post_id,
      'social_event_id', v_event.id,
      'promotion_id', v_event.promotion_id,
      'payment_method', p_payment_method,
      'attribution_window_hours', 24
    ),
    p_conversion_type
  ) INTO v_recorded;

  IF v_recorded THEN
    INSERT INTO public.social_post_metrics_daily (post_id, metric_date, campaign_conversions_count)
    VALUES (v_event.post_id, current_date, 1)
    ON CONFLICT (post_id, metric_date) DO UPDATE
    SET campaign_conversions_count = public.social_post_metrics_daily.campaign_conversions_count + 1,
        updated_at = now();
  END IF;

  RETURN COALESCE(v_recorded, false);
END;
$$;

NOTIFY pgrst, 'reload schema';;
