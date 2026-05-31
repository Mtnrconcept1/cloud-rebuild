-- Public Actualites feed and anonymous metric tracking.
-- The feed can be read by visitors without an account, while write actions
-- such as reactions, comments, saves, follows and reports remain authenticated.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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

DROP POLICY IF EXISTS "social_posts_public_select" ON public.social_posts;
CREATE POLICY "social_posts_public_select"
  ON public.social_posts
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    AND (scheduled_at IS NULL OR scheduled_at <= now())
    AND (published_at IS NULL OR published_at <= now())
    AND visibility = 'public'
  );

DROP POLICY IF EXISTS "social_media_public_select" ON public.social_post_media;
CREATE POLICY "social_media_public_select"
  ON public.social_post_media
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_media.post_id
        AND p.status = 'published'
        AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
        AND (p.published_at IS NULL OR p.published_at <= now())
        AND p.visibility = 'public'
    )
  );

DROP POLICY IF EXISTS "social_comments_public_select" ON public.social_post_comments;
CREATE POLICY "social_comments_public_select"
  ON public.social_post_comments
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_comments.post_id
        AND p.status = 'published'
        AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
        AND (p.published_at IS NULL OR p.published_at <= now())
        AND p.visibility = 'public'
    )
  );

DROP POLICY IF EXISTS "social_reposts_public_select" ON public.social_post_reposts;
CREATE POLICY "social_reposts_public_select"
  ON public.social_post_reposts
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_reposts.post_id
        AND p.status = 'published'
        AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
        AND (p.published_at IS NULL OR p.published_at <= now())
        AND p.visibility = 'public'
    )
  );

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
  v_campaign_id uuid;
  v_promotion_id uuid;
  v_page text := NULLIF(COALESCE(p_metadata->>'page', p_metadata->>'source_page'), '');
  v_source text := NULLIF(COALESCE(p_metadata->>'source', p_metadata->>'placement'), '');
  v_viewer_id text;
  v_dedupe_key text;
  v_campaign_recorded boolean := false;
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
    AND public.jsonb_target_pages_has_actualites(ac.target_pages)
    AND (COALESCE(ac.total_budget, 0) <= 0 OR COALESCE(ac.spent, 0) < COALESCE(ac.total_budget, 0))
    AND (
      COALESCE(ac.budget_daily, 0) <= 0
      OR ac.daily_spent_date IS DISTINCT FROM current_date
      OR COALESCE(ac.daily_spent, 0) < COALESCE(ac.budget_daily, 0)
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
    v_viewer_id := COALESCE(NULLIF(p_metadata->>'viewerId', ''), v_auth_user_id::text, v_user_id::text);
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
      v_auth_user_id,
      v_source,
      COALESCE(v_page, 'actualites'),
      jsonb_build_object(
        'social_post_id', p_post_id,
        'social_event_id', v_event_id,
        'promotion_id', v_promotion_id,
        'raw_event_type', p_event_type,
        'viewer_id', v_viewer_id,
        'metadata', COALESCE(p_metadata, '{}'::jsonb)
      ),
      NULL
    ) INTO v_campaign_recorded;
  END IF;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_social_feed_v2(integer, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_social_post_thread(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_social_feed_event(uuid, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_social_feed_v2(integer, timestamptz, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_post_thread(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_social_feed_event(uuid, text, jsonb) TO anon, authenticated;

GRANT SELECT ON public.social_posts TO anon, authenticated;
GRANT SELECT ON public.social_post_media TO anon, authenticated;
GRANT SELECT ON public.social_post_comments TO anon, authenticated;
GRANT SELECT ON public.social_post_reposts TO anon, authenticated;
GRANT SELECT ON public.social_post_likes TO anon, authenticated;
GRANT SELECT ON public.restaurant_follows TO anon, authenticated;
GRANT SELECT ON public.social_post_saves TO anon, authenticated;
GRANT SELECT ON public.social_feed_events TO authenticated;
GRANT INSERT ON public.social_feed_events TO anon, authenticated;
GRANT SELECT ON public.social_post_metrics_daily TO authenticated;

NOTIFY pgrst, 'reload schema';
