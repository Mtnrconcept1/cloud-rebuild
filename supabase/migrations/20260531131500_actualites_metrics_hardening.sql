-- Harden Actualites metrics so every visible dashboard counter is persisted in DB.
-- This migration keeps the existing event model and adds missing aggregation links
-- between social post events, daily post metrics and sponsored campaign metrics.

ALTER TABLE public.social_feed_events
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.social_post_promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS page text;

ALTER TABLE public.social_post_metrics_daily
  ADD COLUMN IF NOT EXISTS campaign_impressions_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_clicks_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_cta_clicks_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_conversions_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS social_feed_events_campaign_created_idx
  ON public.social_feed_events(campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS social_feed_events_post_type_created_idx
  ON public.social_feed_events(post_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS social_post_metrics_daily_campaign_idx
  ON public.social_post_metrics_daily(metric_date DESC, campaign_impressions_count, campaign_clicks_count)
  WHERE campaign_impressions_count > 0 OR campaign_clicks_count > 0 OR campaign_cta_clicks_count > 0;

CREATE OR REPLACE FUNCTION public.record_social_feed_event(
  p_post_id uuid,
  p_event_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_restaurant_id uuid;
  v_event_id uuid;
  v_campaign_id uuid;
  v_promotion_id uuid;
  v_page text := NULLIF(COALESCE(p_metadata->>'page', p_metadata->>'source_page'), '');
  v_source text := NULLIF(COALESCE(p_metadata->>'source', p_metadata->>'placement'), '');
  v_viewer_id text;
  v_dedupe_key text;
  v_campaign_recorded boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.';
  END IF;

  IF p_event_type NOT IN ('impression', 'click', 'cta_click', 'reaction', 'comment', 'share', 'save', 'follow', 'repost') THEN
    RAISE EXCEPTION 'Type evenement social invalide: %', p_event_type;
  END IF;

  SELECT p.restaurant_id
  INTO v_restaurant_id
  FROM public.social_posts p
  WHERE p.id = p_post_id
    AND p.status = 'published';

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Post introuvable.';
  END IF;

  SELECT spp.id, spp.campaign_id
  INTO v_promotion_id, v_campaign_id
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
    AND (
      ac.target_pages IS NULL
      OR jsonb_typeof(to_jsonb(ac.target_pages)) IS NULL
      OR 'actualites' = ANY(ac.target_pages)
    )
  ORDER BY spp.boost_weight DESC, spp.created_at DESC
  LIMIT 1;

  INSERT INTO public.social_feed_events (
    user_id,
    post_id,
    restaurant_id,
    event_type,
    metadata,
    campaign_id,
    promotion_id,
    source,
    page
  )
  VALUES (
    v_user_id,
    p_post_id,
    v_restaurant_id,
    p_event_type,
    COALESCE(p_metadata, '{}'::jsonb),
    v_campaign_id,
    v_promotion_id,
    v_source,
    v_page
  )
  RETURNING id INTO v_event_id;

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
    CASE WHEN v_campaign_id IS NOT NULL AND p_event_type = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN v_campaign_id IS NOT NULL AND p_event_type = 'click' THEN 1 ELSE 0 END,
    CASE WHEN v_campaign_id IS NOT NULL AND p_event_type = 'cta_click' THEN 1 ELSE 0 END
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

  IF v_campaign_id IS NOT NULL AND p_event_type IN ('impression', 'click', 'cta_click') THEN
    v_viewer_id := COALESCE(NULLIF(p_metadata->>'viewerId', ''), v_user_id::text);
    v_dedupe_key := encode(
      digest(
        concat_ws('|', v_campaign_id::text, p_post_id::text, p_event_type, v_viewer_id, current_date::text, COALESCE(v_source, ''), COALESCE(v_page, '')),
        'sha256'
      ),
      'hex'
    );

    SELECT public.record_ad_campaign_event(
      v_campaign_id,
      v_restaurant_id,
      CASE WHEN p_event_type = 'cta_click' THEN 'click' ELSE p_event_type END,
      v_dedupe_key,
      v_user_id,
      v_source,
      COALESCE(v_page, 'actualites'),
      jsonb_build_object(
        'social_post_id', p_post_id,
        'social_event_id', v_event_id,
        'promotion_id', v_promotion_id,
        'raw_event_type', p_event_type,
        'metadata', COALESCE(p_metadata, '{}'::jsonb)
      ),
      NULL
    ) INTO v_campaign_recorded;
  END IF;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_actualites_insights(p_restaurant_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_since date := current_date - (GREATEST(1, LEAST(COALESCE(p_days, 30), 365)) - 1);
  v_result jsonb;
BEGIN
  IF NOT (public.auth_is_admin() OR public.auth_owns_restaurant(p_restaurant_id)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH posts AS (
    SELECT *
    FROM public.social_posts
    WHERE restaurant_id = p_restaurant_id
  ),
  metrics AS (
    SELECT m.*
    FROM public.social_post_metrics_daily m
    JOIN posts p ON p.id = m.post_id
    WHERE m.metric_date >= v_since
  ),
  campaign_rows AS (
    SELECT ac.*
    FROM public.ad_campaigns ac
    WHERE ac.restaurant_id = p_restaurant_id
      AND (
        ac.target_pages IS NULL
        OR 'actualites' = ANY(ac.target_pages)
      )
  ),
  promotion_rows AS (
    SELECT spp.*
    FROM public.social_post_promotions spp
    WHERE spp.restaurant_id = p_restaurant_id
  )
  SELECT jsonb_build_object(
    'periodDays', v_days,
    'postsCount', (SELECT count(*) FROM posts),
    'publishedCount', (SELECT count(*) FROM posts WHERE status = 'published'),
    'hiddenCount', (SELECT count(*) FROM posts WHERE status <> 'published'),
    'scheduledCount', (SELECT count(*) FROM posts WHERE scheduled_at IS NOT NULL),
    'postsWithCta', (SELECT count(*) FROM posts WHERE COALESCE(cta_type, 'none') <> 'none'),
    'conversionFocus', COALESCE((SELECT round((count(*) FILTER (WHERE COALESCE(cta_type, 'none') <> 'none')::numeric / NULLIF(count(*), 0)) * 100)::integer FROM posts), 0),
    'impressions', COALESCE((SELECT sum(impressions_count) FROM metrics), 0),
    'clicks', COALESCE((SELECT sum(clicks_count) FROM metrics), 0),
    'ctaClicks', COALESCE((SELECT sum(cta_clicks_count) FROM metrics), 0),
    'reactions', COALESCE((SELECT sum(reactions_count) FROM metrics), 0),
    'comments', COALESCE((SELECT sum(comments_count) FROM metrics), 0),
    'shares', COALESCE((SELECT sum(shares_count) FROM metrics), 0),
    'saves', COALESCE((SELECT sum(saves_count) FROM metrics), 0),
    'reposts', COALESCE((SELECT sum(reposts_count) FROM metrics), 0),
    'interactions', COALESCE((SELECT sum(reactions_count + comments_count + shares_count + saves_count + reposts_count + cta_clicks_count) FROM metrics), 0),
    'engagementRate', COALESCE((
      SELECT round((sum(reactions_count + comments_count + shares_count + saves_count + reposts_count + cta_clicks_count)::numeric / NULLIF(sum(impressions_count), 0)) * 1000) / 10
      FROM metrics
    ), 0),
    'campaigns', jsonb_build_object(
      'count', COALESCE((SELECT count(*) FROM campaign_rows), 0),
      'activeCount', COALESCE((SELECT count(*) FROM campaign_rows WHERE status = 'active'), 0),
      'paidCount', COALESCE((SELECT count(*) FROM campaign_rows WHERE payment_status = 'paid'), 0),
      'impressions', COALESCE((SELECT sum(impressions) FROM campaign_rows), 0),
      'clicks', COALESCE((SELECT sum(clicks) FROM campaign_rows), 0),
      'conversions', COALESCE((SELECT sum(conversions) FROM campaign_rows), 0),
      'spent', COALESCE((SELECT sum(spent) FROM campaign_rows), 0),
      'budget', COALESCE((SELECT sum(total_budget) FROM campaign_rows), 0),
      'postPromotions', COALESCE((SELECT count(*) FROM promotion_rows), 0),
      'activePostPromotions', COALESCE((SELECT count(*) FROM promotion_rows WHERE status = 'active'), 0),
      'postPromotionImpressions', COALESCE((SELECT sum(campaign_impressions_count) FROM metrics), 0),
      'postPromotionClicks', COALESCE((SELECT sum(campaign_clicks_count + campaign_cta_clicks_count) FROM metrics), 0)
    ),
    'campaignGoals', COALESCE((
      SELECT jsonb_object_agg(goal, goal_count)
      FROM (
        SELECT COALESCE(campaign_goal, 'awareness') AS goal, count(*) AS goal_count
        FROM posts
        GROUP BY COALESCE(campaign_goal, 'awareness')
      ) grouped
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_actualites_insights(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_actualites_insights(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
