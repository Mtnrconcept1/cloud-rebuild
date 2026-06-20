-- Premium Actualites banner delivery.
-- A restaurant with a Premium/Elite subscription can publish a post as a
-- banner for users who have liked at least one of its posts. Each eligible
-- viewer can receive the banner 5 times.

CREATE TABLE IF NOT EXISTS public.social_post_premium_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES public.social_posts(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  impressions_per_viewer integer NOT NULL DEFAULT 5,
  audience_count integer NOT NULL DEFAULT 0,
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_post_premium_banners_status_check
    CHECK (status IN ('active', 'paused', 'ended')),
  CONSTRAINT social_post_premium_banners_impressions_check
    CHECK (impressions_per_viewer BETWEEN 1 AND 10),
  CONSTRAINT social_post_premium_banners_audience_count_check
    CHECK (audience_count >= 0),
  CONSTRAINT social_post_premium_banners_date_check
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.social_post_premium_banner_deliveries (
  banner_id uuid NOT NULL REFERENCES public.social_post_premium_banners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  impression_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  last_clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (banner_id, user_id),
  CONSTRAINT social_post_premium_banner_deliveries_count_check
    CHECK (impression_count >= 0)
);

ALTER TABLE public.social_feed_events
  ADD COLUMN IF NOT EXISTS premium_banner_id uuid REFERENCES public.social_post_premium_banners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS social_post_likes_user_post_idx
  ON public.social_post_likes(user_id, post_id);

CREATE INDEX IF NOT EXISTS social_posts_restaurant_status_id_idx
  ON public.social_posts(restaurant_id, status, id);

CREATE INDEX IF NOT EXISTS social_post_premium_banners_active_idx
  ON public.social_post_premium_banners(status, starts_at, ends_at, restaurant_id);

CREATE INDEX IF NOT EXISTS social_post_premium_banner_deliveries_user_idx
  ON public.social_post_premium_banner_deliveries(user_id, impression_count);

CREATE INDEX IF NOT EXISTS social_feed_events_premium_banner_idx
  ON public.social_feed_events(premium_banner_id, user_id, event_type, created_at DESC)
  WHERE premium_banner_id IS NOT NULL;

DROP TRIGGER IF EXISTS touch_social_post_premium_banners_updated_at
  ON public.social_post_premium_banners;
CREATE TRIGGER touch_social_post_premium_banners_updated_at
BEFORE UPDATE ON public.social_post_premium_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS touch_social_post_premium_banner_deliveries_updated_at
  ON public.social_post_premium_banner_deliveries;
CREATE TRIGGER touch_social_post_premium_banner_deliveries_updated_at
BEFORE UPDATE ON public.social_post_premium_banner_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.social_post_premium_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_premium_banner_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_post_premium_banners_owner_admin_select"
  ON public.social_post_premium_banners;
CREATE POLICY "social_post_premium_banners_owner_admin_select"
  ON public.social_post_premium_banners
  FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "social_post_premium_banners_admin_all"
  ON public.social_post_premium_banners;
CREATE POLICY "social_post_premium_banners_admin_all"
  ON public.social_post_premium_banners
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

DROP POLICY IF EXISTS "social_post_premium_banner_deliveries_owner_admin_select"
  ON public.social_post_premium_banner_deliveries;
CREATE POLICY "social_post_premium_banner_deliveries_owner_admin_select"
  ON public.social_post_premium_banner_deliveries
  FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_post_premium_banners b
      WHERE b.id = banner_id
        AND public.auth_owns_restaurant(b.restaurant_id)
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.social_post_premium_banners FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_post_premium_banner_deliveries FROM anon, authenticated;
GRANT SELECT ON public.social_post_premium_banners TO authenticated;
GRANT SELECT ON public.social_post_premium_banner_deliveries TO authenticated;

CREATE OR REPLACE FUNCTION public.actualites_premium_banner_plan(
  p_restaurant_id uuid
)
RETURNS TABLE (
  has_access boolean,
  plan_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH selected_plan AS (
    SELECT lower(COALESCE(rsp.slug, ras.plan)) AS slug
    FROM public.restaurant_ai_subscriptions ras
    LEFT JOIN public.restaurant_subscription_plans rsp
      ON rsp.id = ras.restaurant_subscription_plan_id
    WHERE ras.restaurant_id = p_restaurant_id
      AND ras.status IN ('trialing', 'active')
      AND COALESCE(ras.current_period_end, now() + interval '1 day') > now()
    ORDER BY ras.current_period_end DESC NULLS LAST, ras.created_at DESC
    LIMIT 1
  )
  SELECT
    COALESCE((SELECT slug IN ('premium', 'elite', 'custom') FROM selected_plan), false) AS has_access,
    (SELECT slug FROM selected_plan) AS plan_slug;
$$;

REVOKE ALL ON FUNCTION public.actualites_premium_banner_plan(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.count_restaurant_actualites_like_audience(
  p_restaurant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Non autorise.' USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT l.user_id)::integer
  INTO v_count
  FROM public.social_post_likes l
  JOIN public.social_posts p ON p.id = l.post_id
  WHERE p.restaurant_id = p_restaurant_id
    AND p.status = 'published'
    AND l.user_id IS NOT NULL
    AND NOT COALESCE(public.is_restaurant_internal_actor(l.user_id, p_restaurant_id), false);

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.count_restaurant_actualites_like_audience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_restaurant_actualites_like_audience(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_restaurant_actualites_premium_banner_audience(
  p_restaurant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_access boolean := false;
  v_plan_slug text := NULL;
  v_audience_count integer := 0;
  v_active_banner_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Non autorise.' USING ERRCODE = '42501';
  END IF;

  SELECT plan.has_access, plan.plan_slug
  INTO v_has_access, v_plan_slug
  FROM public.actualites_premium_banner_plan(p_restaurant_id) AS plan;

  v_audience_count := public.count_restaurant_actualites_like_audience(p_restaurant_id);

  SELECT count(*)::integer
  INTO v_active_banner_count
  FROM public.social_post_premium_banners b
  WHERE b.restaurant_id = p_restaurant_id
    AND b.status = 'active'
    AND b.starts_at <= now()
    AND (b.ends_at IS NULL OR b.ends_at >= now());

  RETURN jsonb_build_object(
    'hasAccess', COALESCE(v_has_access, false),
    'planSlug', v_plan_slug,
    'audienceCount', COALESCE(v_audience_count, 0),
    'impressionsPerViewer', 5,
    'activeBannerCount', COALESCE(v_active_banner_count, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_actualites_premium_banner_audience(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_actualites_premium_banner_audience(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_premium_actualites_banner(
  p_post_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post record;
  v_has_access boolean := false;
  v_plan_slug text := NULL;
  v_audience_count integer := 0;
  v_banner_id uuid;
BEGIN
  SELECT p.id, p.restaurant_id, p.status, p.scheduled_at, p.published_at, COALESCE(p.visibility, 'public') AS visibility
  INTO v_post
  FROM public.social_posts p
  WHERE p.id = p_post_id;

  IF v_post.id IS NULL THEN
    RAISE EXCEPTION 'Post introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(v_post.restaurant_id) THEN
    RAISE EXCEPTION 'Non autorise.' USING ERRCODE = '42501';
  END IF;

  IF v_post.status <> 'published'
     OR (v_post.scheduled_at IS NOT NULL AND v_post.scheduled_at > now())
     OR (v_post.published_at IS NOT NULL AND v_post.published_at > now())
     OR v_post.visibility <> 'public' THEN
    RAISE EXCEPTION 'La banniere premium requiert un post public publie.';
  END IF;

  SELECT plan.has_access, plan.plan_slug
  INTO v_has_access, v_plan_slug
  FROM public.actualites_premium_banner_plan(v_post.restaurant_id) AS plan;

  IF NOT COALESCE(v_has_access, false) THEN
    RAISE EXCEPTION 'Fonctionnalite reservee aux abonnements Premium et Elite.' USING ERRCODE = '42501';
  END IF;

  v_audience_count := public.count_restaurant_actualites_like_audience(v_post.restaurant_id);

  INSERT INTO public.social_post_premium_banners (
    post_id,
    restaurant_id,
    status,
    starts_at,
    ends_at,
    impressions_per_viewer,
    audience_count,
    activated_by
  )
  VALUES (
    v_post.id,
    v_post.restaurant_id,
    'active',
    now(),
    NULL,
    5,
    v_audience_count,
    auth.uid()
  )
  ON CONFLICT (post_id) DO UPDATE
  SET
    restaurant_id = EXCLUDED.restaurant_id,
    status = 'active',
    starts_at = now(),
    ends_at = NULL,
    impressions_per_viewer = 5,
    audience_count = EXCLUDED.audience_count,
    activated_by = EXCLUDED.activated_by,
    updated_at = now()
  RETURNING id INTO v_banner_id;

  RETURN jsonb_build_object(
    'bannerId', v_banner_id,
    'postId', v_post.id,
    'restaurantId', v_post.restaurant_id,
    'audienceCount', v_audience_count,
    'impressionsPerViewer', 5,
    'hasAccess', true,
    'planSlug', v_plan_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_premium_actualites_banner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_premium_actualites_banner(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_social_feed_premium_banners(integer, text);
CREATE FUNCTION public.get_social_feed_premium_banners(
  p_limit integer DEFAULT 1,
  p_scope text DEFAULT 'for_you'
)
RETURNS TABLE (
  activity_id uuid,
  activity_type text,
  post_id uuid,
  restaurant_id uuid,
  author_id uuid,
  body text,
  status text,
  created_at timestamptz,
  published_at timestamptz,
  likes_count integer,
  comments_count integer,
  reposts_count integer,
  shares_count integer,
  liked_by_me boolean,
  my_reaction text,
  reaction_counts jsonb,
  followed_by_me boolean,
  reposted_by_me boolean,
  saved_by_me boolean,
  recommendation_reasons jsonb,
  score numeric,
  media jsonb,
  restaurant jsonb,
  repost jsonb,
  post_type text,
  cta_type text,
  cta_target_id uuid,
  scheduled_at timestamptz,
  pinned_until timestamptz,
  visibility text,
  premium_banner_id uuid,
  premium_banner_audience_count integer,
  premium_banner_impressions_per_viewer integer,
  premium_banner_remaining_impressions integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer AS (
    SELECT (SELECT auth.uid()) AS uid
  ),
  eligible AS (
    SELECT
      b.id AS banner_id,
      b.audience_count,
      b.impressions_per_viewer,
      COALESCE(d.impression_count, 0) AS impression_count,
      p.id AS post_id,
      p.restaurant_id,
      p.author_id,
      p.body,
      p.status,
      p.created_at,
      p.published_at,
      p.likes_count,
      p.comments_count,
      p.reposts_count,
      p.shares_count,
      p.post_type,
      p.cta_type,
      p.cta_target_id,
      p.scheduled_at,
      p.pinned_until,
      COALESCE(p.visibility, 'public') AS visibility,
      r.name,
      r.image_url,
      r.city,
      r.cuisine_type
    FROM public.social_post_premium_banners b
    JOIN public.social_posts p ON p.id = b.post_id
    JOIN public.restaurants r ON r.id = b.restaurant_id
    CROSS JOIN viewer v
    LEFT JOIN public.social_post_premium_banner_deliveries d
      ON d.banner_id = b.id
     AND d.user_id = v.uid
    WHERE v.uid IS NOT NULL
      AND p_scope <> 'saved'
      AND b.status = 'active'
      AND b.starts_at <= now()
      AND (b.ends_at IS NULL OR b.ends_at >= now())
      AND p.restaurant_id = b.restaurant_id
      AND p.status = 'published'
      AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
      AND (p.published_at IS NULL OR p.published_at <= now())
      AND COALESCE(p.visibility, 'public') = 'public'
      AND r.is_active IS DISTINCT FROM false
      AND COALESCE(d.impression_count, 0) < b.impressions_per_viewer
      AND NOT COALESCE(public.is_restaurant_internal_actor(v.uid, b.restaurant_id), false)
      AND EXISTS (
        SELECT 1
        FROM public.social_post_likes l
        JOIN public.social_posts liked_post ON liked_post.id = l.post_id
        WHERE l.user_id = v.uid
          AND liked_post.restaurant_id = b.restaurant_id
          AND liked_post.status = 'published'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.social_feed_feedback ff
        WHERE ff.user_id = v.uid
          AND (
            (ff.feedback_type IN ('hide_post', 'not_interested') AND ff.post_id = p.id)
            OR (ff.feedback_type = 'hide_restaurant' AND ff.restaurant_id = b.restaurant_id)
          )
      )
  )
  SELECT
    eligible.post_id AS activity_id,
    'post'::text AS activity_type,
    eligible.post_id,
    eligible.restaurant_id,
    eligible.author_id,
    eligible.body,
    eligible.status,
    eligible.created_at,
    eligible.published_at,
    COALESCE(eligible.likes_count, 0),
    COALESCE(eligible.comments_count, 0),
    COALESCE(eligible.reposts_count, 0),
    COALESCE(eligible.shares_count, 0),
    true AS liked_by_me,
    (SELECT l.reaction_type FROM public.social_post_likes l, viewer v WHERE l.post_id = eligible.post_id AND l.user_id = v.uid LIMIT 1) AS my_reaction,
    COALESCE((
      SELECT jsonb_object_agg(reaction_type, reaction_count)
      FROM (
        SELECT l.reaction_type, count(*)::integer AS reaction_count
        FROM public.social_post_likes l
        WHERE l.post_id = eligible.post_id
        GROUP BY l.reaction_type
      ) grouped
    ), '{}'::jsonb) AS reaction_counts,
    EXISTS (SELECT 1 FROM public.restaurant_follows rf, viewer v WHERE rf.restaurant_id = eligible.restaurant_id AND rf.user_id = v.uid) AS followed_by_me,
    EXISTS (SELECT 1 FROM public.social_post_reposts rp, viewer v WHERE rp.post_id = eligible.post_id AND rp.user_id = v.uid AND rp.status = 'published') AS reposted_by_me,
    EXISTS (SELECT 1 FROM public.social_post_saves s, viewer v WHERE s.post_id = eligible.post_id AND s.user_id = v.uid) AS saved_by_me,
    to_jsonb(ARRAY['Banniere premium', 'Deja aime ce restaurant']::text[]) AS recommendation_reasons,
    (1000 + greatest(0, eligible.impressions_per_viewer - eligible.impression_count))::numeric AS score,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'postId', m.post_id, 'mediaUrl', m.media_url, 'mediaPath', m.media_path, 'mediaType', m.media_type, 'sortOrder', m.sort_order, 'altText', m.alt_text) ORDER BY m.sort_order ASC)
      FROM public.social_post_media m
      WHERE m.post_id = eligible.post_id
    ), '[]'::jsonb) AS media,
    jsonb_build_object('id', eligible.restaurant_id, 'name', eligible.name, 'imageUrl', eligible.image_url, 'city', eligible.city, 'cuisineType', eligible.cuisine_type) AS restaurant,
    NULL::jsonb AS repost,
    eligible.post_type,
    eligible.cta_type,
    eligible.cta_target_id,
    eligible.scheduled_at,
    eligible.pinned_until,
    eligible.visibility,
    eligible.banner_id,
    eligible.audience_count,
    eligible.impressions_per_viewer,
    greatest(0, eligible.impressions_per_viewer - eligible.impression_count)::integer
  FROM eligible
  ORDER BY eligible.impression_count ASC, eligible.created_at DESC, eligible.banner_id
  LIMIT least(greatest(COALESCE(p_limit, 1), 1), 5);
$$;

REVOKE ALL ON FUNCTION public.get_social_feed_premium_banners(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_social_feed_premium_banners(integer, text) TO anon, authenticated;

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
  v_premium_banner_token text := NULLIF(p_metadata->>'premiumBannerId', '');
  v_requested_premium_banner_id uuid;
  v_premium_banner_id uuid;
  v_premium_impressions_per_viewer integer := 5;
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

  IF v_premium_banner_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_requested_premium_banner_id := v_premium_banner_token::uuid;
  END IF;

  IF v_requested_premium_banner_id IS NOT NULL
     AND v_auth_user_id IS NOT NULL
     AND NOT v_is_internal_actor
     AND p_event_type IN ('impression', 'click', 'cta_click') THEN
    SELECT b.id, b.impressions_per_viewer
    INTO v_premium_banner_id, v_premium_impressions_per_viewer
    FROM public.social_post_premium_banners b
    WHERE b.id = v_requested_premium_banner_id
      AND b.post_id = p_post_id
      AND b.restaurant_id = v_restaurant_id
      AND b.status = 'active'
      AND b.starts_at <= now()
      AND (b.ends_at IS NULL OR b.ends_at >= now())
      AND COALESCE((
        SELECT d.impression_count
        FROM public.social_post_premium_banner_deliveries d
        WHERE d.banner_id = b.id
          AND d.user_id = v_auth_user_id
      ), 0) < b.impressions_per_viewer
      AND EXISTS (
        SELECT 1
        FROM public.social_post_likes l
        JOIN public.social_posts liked_post ON liked_post.id = l.post_id
        WHERE l.user_id = v_auth_user_id
          AND liked_post.restaurant_id = v_restaurant_id
          AND liked_post.status = 'published'
      )
    LIMIT 1;
  END IF;

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
      premium_banner_id,
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
      v_premium_banner_id,
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
          'premium_banner_id', v_premium_banner_id,
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
      premium_banner_id,
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
      v_premium_banner_id,
      v_source,
      v_page,
      v_is_internal_actor
    )
    RETURNING id INTO v_first_event_id;
  END IF;

  IF v_premium_banner_id IS NOT NULL AND p_event_type = 'impression' THEN
    INSERT INTO public.social_post_premium_banner_deliveries (
      banner_id,
      user_id,
      impression_count,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (
      v_premium_banner_id,
      v_auth_user_id,
      1,
      now(),
      now(),
      now(),
      now()
    )
    ON CONFLICT (banner_id, user_id) DO UPDATE
    SET
      impression_count = least(
        v_premium_impressions_per_viewer,
        public.social_post_premium_banner_deliveries.impression_count + 1
      ),
      last_seen_at = now(),
      updated_at = now()
    WHERE public.social_post_premium_banner_deliveries.impression_count < v_premium_impressions_per_viewer;
  ELSIF v_premium_banner_id IS NOT NULL AND p_event_type IN ('click', 'cta_click') THEN
    INSERT INTO public.social_post_premium_banner_deliveries (
      banner_id,
      user_id,
      impression_count,
      last_clicked_at,
      created_at,
      updated_at
    )
    VALUES (
      v_premium_banner_id,
      v_auth_user_id,
      0,
      now(),
      now(),
      now()
    )
    ON CONFLICT (banner_id, user_id) DO UPDATE
    SET
      last_clicked_at = now(),
      updated_at = now();
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

NOTIFY pgrst, 'reload schema';
