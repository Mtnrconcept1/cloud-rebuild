-- V2 social feed: personalized scopes, saves, feedback, event tracking and admin moderation RPCs.

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'annonce',
  ADD COLUMN IF NOT EXISTS cta_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cta_target_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_until timestamptz,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_status_check,
  DROP CONSTRAINT IF EXISTS social_posts_post_type_check,
  DROP CONSTRAINT IF EXISTS social_posts_cta_type_check,
  DROP CONSTRAINT IF EXISTS social_posts_visibility_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_status_check CHECK (status IN ('draft', 'scheduled', 'published', 'hidden', 'deleted')),
  ADD CONSTRAINT social_posts_post_type_check CHECK (post_type IN ('plat', 'promo', 'evenement', 'coulisses', 'annonce')),
  ADD CONSTRAINT social_posts_cta_type_check CHECK (cta_type IN ('none', 'reserve', 'order', 'menu', 'offer')),
  ADD CONSTRAINT social_posts_visibility_check CHECK (visibility IN ('public', 'followers', 'unlisted'));

ALTER TABLE public.social_reports
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_target_status text,
  ADD COLUMN IF NOT EXISTS resolution_notes text;

CREATE TABLE IF NOT EXISTS public.social_post_saves (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.social_feed_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid REFERENCES public.social_posts(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN ('hide_post', 'hide_restaurant', 'not_interested', 'show_more')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (post_id IS NOT NULL OR restaurant_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.social_feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'cta_click', 'reaction', 'comment', 'share', 'save', 'follow', 'repost')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_post_metrics_daily (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  metric_date date NOT NULL DEFAULT current_date,
  impressions_count integer NOT NULL DEFAULT 0,
  clicks_count integer NOT NULL DEFAULT 0,
  cta_clicks_count integer NOT NULL DEFAULT 0,
  reactions_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  shares_count integer NOT NULL DEFAULT 0,
  saves_count integer NOT NULL DEFAULT 0,
  reposts_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, metric_date)
);

CREATE INDEX IF NOT EXISTS social_posts_v2_feed_idx
  ON public.social_posts (status, visibility, scheduled_at, published_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS social_posts_type_created_idx
  ON public.social_posts (post_type, created_at DESC);
CREATE INDEX IF NOT EXISTS social_post_saves_user_idx
  ON public.social_post_saves (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS social_feed_feedback_post_unique_idx
  ON public.social_feed_feedback (user_id, post_id, feedback_type)
  WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS social_feed_feedback_restaurant_unique_idx
  ON public.social_feed_feedback (user_id, restaurant_id, feedback_type)
  WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS social_feed_events_post_created_idx
  ON public.social_feed_events (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS social_feed_events_restaurant_created_idx
  ON public.social_feed_events (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS social_post_metrics_daily_date_idx
  ON public.social_post_metrics_daily (metric_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS social_reports_open_unique_idx
  ON public.social_reports (reporter_id, target_type, target_id)
  WHERE status = 'open';

ALTER TABLE public.social_post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_feed_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_feed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_metrics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_posts_select" ON public.social_posts;
CREATE POLICY "social_posts_select"
  ON public.social_posts
  FOR SELECT
  TO authenticated
  USING (
    (
      status = 'published'
      AND (scheduled_at IS NULL OR scheduled_at <= now())
      AND (published_at IS NULL OR published_at <= now())
      AND (
        visibility = 'public'
        OR (
          visibility = 'followers'
          AND EXISTS (
            SELECT 1
            FROM public.restaurant_follows rf
            WHERE rf.restaurant_id = social_posts.restaurant_id
              AND rf.user_id = (SELECT auth.uid())
          )
        )
      )
    )
    OR public.auth_owns_restaurant(restaurant_id)
    OR public.auth_is_admin()
  );

DROP POLICY IF EXISTS "social_posts_insert" ON public.social_posts;
CREATE POLICY "social_posts_insert"
  ON public.social_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.auth_owns_restaurant(restaurant_id)
    AND status IN ('draft', 'scheduled', 'published')
  );

DROP POLICY IF EXISTS "social_posts_update" ON public.social_posts;
CREATE POLICY "social_posts_update"
  ON public.social_posts
  FOR UPDATE
  TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    OR public.auth_owns_restaurant(restaurant_id)
    OR public.auth_is_admin()
  )
  WITH CHECK (
    author_id = (SELECT auth.uid())
    OR public.auth_owns_restaurant(restaurant_id)
    OR public.auth_is_admin()
  );

DROP POLICY IF EXISTS "social_post_saves_select" ON public.social_post_saves;
CREATE POLICY "social_post_saves_select"
  ON public.social_post_saves
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_saves.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  );

DROP POLICY IF EXISTS "social_post_saves_insert" ON public.social_post_saves;
CREATE POLICY "social_post_saves_insert"
  ON public.social_post_saves
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = post_id
        AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "social_post_saves_delete" ON public.social_post_saves;
CREATE POLICY "social_post_saves_delete"
  ON public.social_post_saves
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin());

DROP POLICY IF EXISTS "social_feed_feedback_select" ON public.social_feed_feedback;
CREATE POLICY "social_feed_feedback_select"
  ON public.social_feed_feedback
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR (
      restaurant_id IS NOT NULL
      AND public.auth_owns_restaurant(restaurant_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_feed_feedback.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  );

DROP POLICY IF EXISTS "social_feed_feedback_insert" ON public.social_feed_feedback;
CREATE POLICY "social_feed_feedback_insert"
  ON public.social_feed_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "social_feed_feedback_delete" ON public.social_feed_feedback;
CREATE POLICY "social_feed_feedback_delete"
  ON public.social_feed_feedback
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin());

DROP POLICY IF EXISTS "social_feed_events_select" ON public.social_feed_events;
CREATE POLICY "social_feed_events_select"
  ON public.social_feed_events
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "social_feed_events_insert" ON public.social_feed_events;
CREATE POLICY "social_feed_events_insert"
  ON public.social_feed_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "social_post_metrics_daily_select" ON public.social_post_metrics_daily;
CREATE POLICY "social_post_metrics_daily_select"
  ON public.social_post_metrics_daily
  FOR SELECT
  TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_metrics_daily.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  );

DROP FUNCTION IF EXISTS public.get_social_feed_v2(integer, timestamptz, text);

CREATE FUNCTION public.get_social_feed_v2(
  p_limit integer DEFAULT 20,
  p_cursor timestamptz DEFAULT NULL,
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
  visibility text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT CASE
      WHEN p_scope IN ('for_you', 'followed', 'nearby', 'offers') THEN p_scope
      ELSE 'for_you'
    END AS scope
  ),
  viewer AS (
    SELECT (SELECT auth.uid()) AS uid
  ),
  viewer_profile AS (
    SELECT p.city
    FROM public.profiles p, viewer v
    WHERE p.user_id = v.uid
    LIMIT 1
  ),
  preferred_cuisines AS (
    SELECT COALESCE(array_agg(lower(trim(value))), ARRAY[]::text[]) AS cuisines
    FROM public.user_preferences up, viewer v
    CROSS JOIN LATERAL unnest(COALESCE(up.favorite_cuisines, up.dietary_tags, ARRAY[]::text[])) AS value
    WHERE up.user_id = v.uid
  ),
  interacted_restaurants AS (
    SELECT DISTINCT restaurant_id
    FROM (
      SELECT f.restaurant_id
      FROM public.favorites f, viewer v
      WHERE f.user_id = v.uid
      UNION
      SELECT o.restaurant_id
      FROM public.orders o, viewer v
      WHERE o.user_id = v.uid
      UNION
      SELECT rv.restaurant_id
      FROM public.reservations rv, viewer v
      WHERE rv.user_id = v.uid
    ) source
    WHERE restaurant_id IS NOT NULL
  ),
  activities AS (
    SELECT
      p.id AS activity_id,
      'post'::text AS activity_type,
      p.id AS post_id,
      p.restaurant_id,
      p.author_id,
      p.body,
      p.status,
      p.created_at AS activity_created_at,
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
      p.visibility,
      NULL::uuid AS repost_id,
      NULL::uuid AS repost_user_id,
      NULL::text AS repost_note,
      NULL::timestamptz AS repost_created_at
    FROM public.social_posts p
    WHERE p.status = 'published'
      AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
      AND (p.published_at IS NULL OR p.published_at <= now())
      AND COALESCE(p.visibility, 'public') <> 'unlisted'
    UNION ALL
    SELECT
      rp.id AS activity_id,
      'repost'::text AS activity_type,
      p.id AS post_id,
      p.restaurant_id,
      p.author_id,
      p.body,
      p.status,
      rp.created_at AS activity_created_at,
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
      p.visibility,
      rp.id AS repost_id,
      rp.user_id AS repost_user_id,
      rp.note AS repost_note,
      rp.created_at AS repost_created_at
    FROM public.social_post_reposts rp
    JOIN public.social_posts p ON p.id = rp.post_id
    WHERE rp.status = 'published'
      AND p.status = 'published'
      AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
      AND COALESCE(p.visibility, 'public') <> 'unlisted'
  ),
  scoped AS (
    SELECT a.*, r.name, r.image_url, r.city, r.cuisine_type
    FROM activities a
    JOIN public.restaurants r ON r.id = a.restaurant_id
    CROSS JOIN params p
    WHERE (p_cursor IS NULL OR a.activity_created_at < p_cursor)
      AND r.is_active IS DISTINCT FROM false
      AND (
        COALESCE(a.visibility, 'public') = 'public'
        OR EXISTS (
          SELECT 1
          FROM public.restaurant_follows rf, viewer v
          WHERE rf.restaurant_id = a.restaurant_id
            AND rf.user_id = v.uid
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.social_feed_feedback ff, viewer v
        WHERE ff.user_id = v.uid
          AND (
            (ff.feedback_type IN ('hide_post', 'not_interested') AND ff.post_id = a.post_id)
            OR (ff.feedback_type = 'hide_restaurant' AND ff.restaurant_id = a.restaurant_id)
          )
      )
      AND (
        p.scope = 'for_you'
        OR (
          p.scope = 'followed'
          AND EXISTS (
            SELECT 1
            FROM public.restaurant_follows rf, viewer v
            WHERE rf.restaurant_id = a.restaurant_id
              AND rf.user_id = v.uid
          )
        )
        OR (
          p.scope = 'nearby'
          AND lower(COALESCE(r.city, '')) = lower(COALESCE((SELECT city FROM viewer_profile), ''))
          AND COALESCE(r.city, '') <> ''
        )
        OR (
          p.scope = 'offers'
          AND (a.post_type = 'promo' OR a.cta_type = 'offer')
        )
      )
  ),
  deduped AS (
    SELECT scoped.*, row_number() OVER (PARTITION BY scoped.post_id ORDER BY scoped.activity_created_at DESC) AS post_activity_rank
    FROM scoped
  ),
  scored AS (
    SELECT
      deduped.*,
      (
        CASE WHEN deduped.pinned_until IS NOT NULL AND deduped.pinned_until > now() THEN 24 ELSE 0 END
        + greatest(0, 32 - (extract(epoch from (now() - deduped.activity_created_at)) / 3600.0) * 0.6)
        + least(
          25,
          ln(1 + greatest(deduped.likes_count, 0)) * 2.2
          + ln(1 + greatest(deduped.comments_count, 0)) * 4
          + ln(1 + greatest(deduped.reposts_count, 0)) * 5
          + ln(1 + greatest(deduped.shares_count, 0)) * 3.2
        )
        + CASE WHEN EXISTS (
          SELECT 1 FROM public.restaurant_follows rf, viewer v
          WHERE rf.restaurant_id = deduped.restaurant_id AND rf.user_id = v.uid
        ) THEN 100 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1 FROM public.favorites f, viewer v
          WHERE f.restaurant_id = deduped.restaurant_id AND f.user_id = v.uid
        ) THEN 16 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1 FROM interacted_restaurants ir WHERE ir.restaurant_id = deduped.restaurant_id
        ) THEN 18 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1
          FROM preferred_cuisines pc
          WHERE lower(COALESCE(deduped.cuisine_type, '')) = ANY (pc.cuisines)
        ) THEN 35 ELSE 0 END
        + CASE WHEN lower(COALESCE(deduped.city, '')) = lower(COALESCE((SELECT city FROM viewer_profile), '')) AND COALESCE(deduped.city, '') <> '' THEN 22 ELSE 0 END
        + CASE WHEN deduped.post_type = 'promo' OR deduped.cta_type = 'offer' THEN 10 ELSE 0 END
      )::numeric AS computed_score
    FROM deduped
    WHERE deduped.post_activity_rank = 1
  ),
  diversified AS (
    SELECT
      scored.*,
      row_number() OVER (PARTITION BY scored.restaurant_id ORDER BY scored.computed_score DESC, scored.activity_created_at DESC) AS restaurant_rank
    FROM scored
  )
  SELECT
    diversified.activity_id,
    diversified.activity_type,
    diversified.post_id,
    diversified.restaurant_id,
    diversified.author_id,
    diversified.body,
    diversified.status,
    diversified.activity_created_at AS created_at,
    diversified.published_at,
    diversified.likes_count,
    diversified.comments_count,
    diversified.reposts_count,
    diversified.shares_count,
    EXISTS (
      SELECT 1 FROM public.social_post_likes l, viewer v
      WHERE l.post_id = diversified.post_id AND l.user_id = v.uid
    ) AS liked_by_me,
    (
      SELECT l.reaction_type
      FROM public.social_post_likes l, viewer v
      WHERE l.post_id = diversified.post_id AND l.user_id = v.uid
      LIMIT 1
    ) AS my_reaction,
    COALESCE((
      SELECT jsonb_object_agg(reaction_type, reaction_count)
      FROM (
        SELECT l.reaction_type, count(*)::integer AS reaction_count
        FROM public.social_post_likes l
        WHERE l.post_id = diversified.post_id
        GROUP BY l.reaction_type
      ) grouped
    ), '{}'::jsonb) AS reaction_counts,
    EXISTS (
      SELECT 1 FROM public.restaurant_follows rf, viewer v
      WHERE rf.restaurant_id = diversified.restaurant_id AND rf.user_id = v.uid
    ) AS followed_by_me,
    EXISTS (
      SELECT 1 FROM public.social_post_reposts rp, viewer v
      WHERE rp.post_id = diversified.post_id AND rp.user_id = v.uid AND rp.status = 'published'
    ) AS reposted_by_me,
    EXISTS (
      SELECT 1 FROM public.social_post_saves s, viewer v
      WHERE s.post_id = diversified.post_id AND s.user_id = v.uid
    ) AS saved_by_me,
    to_jsonb(array_remove(ARRAY[
      CASE WHEN EXISTS (
        SELECT 1 FROM public.restaurant_follows rf, viewer v
        WHERE rf.restaurant_id = diversified.restaurant_id AND rf.user_id = v.uid
      ) THEN 'Restaurant suivi' END,
      CASE WHEN EXISTS (
        SELECT 1 FROM public.favorites f, viewer v
        WHERE f.restaurant_id = diversified.restaurant_id AND f.user_id = v.uid
      ) THEN 'Dans vos favoris' END,
      CASE WHEN EXISTS (
        SELECT 1 FROM interacted_restaurants ir WHERE ir.restaurant_id = diversified.restaurant_id
      ) THEN 'Deja commande ou reserve' END,
      CASE WHEN EXISTS (
        SELECT 1
        FROM preferred_cuisines pc
        WHERE lower(COALESCE(diversified.cuisine_type, '')) = ANY (pc.cuisines)
      ) THEN 'Cuisine preferee' END,
      CASE WHEN lower(COALESCE(diversified.city, '')) = lower(COALESCE((SELECT city FROM viewer_profile), '')) AND COALESCE(diversified.city, '') <> '' THEN 'A proximite' END,
      CASE WHEN diversified.post_type = 'promo' OR diversified.cta_type = 'offer' THEN 'Offre en cours' END
    ]::text[], NULL)) AS recommendation_reasons,
    round(diversified.computed_score, 2) AS score,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'postId', m.post_id,
          'mediaUrl', m.media_url,
          'mediaPath', m.media_path,
          'mediaType', m.media_type,
          'sortOrder', m.sort_order,
          'altText', m.alt_text
        )
        ORDER BY m.sort_order ASC
      )
      FROM public.social_post_media m
      WHERE m.post_id = diversified.post_id
    ), '[]'::jsonb) AS media,
    jsonb_build_object(
      'id', diversified.restaurant_id,
      'name', diversified.name,
      'imageUrl', diversified.image_url,
      'city', diversified.city,
      'cuisineType', diversified.cuisine_type
    ) AS restaurant,
    CASE
      WHEN diversified.activity_type = 'repost' THEN jsonb_build_object(
        'id', diversified.repost_id,
        'userId', diversified.repost_user_id,
        'note', diversified.repost_note,
        'createdAt', diversified.repost_created_at,
        'authorName', (
          SELECT p.full_name
          FROM public.profiles p
          WHERE p.user_id = diversified.repost_user_id
          LIMIT 1
        )
      )
      ELSE NULL::jsonb
    END AS repost,
    diversified.post_type,
    diversified.cta_type,
    diversified.cta_target_id,
    diversified.scheduled_at,
    diversified.pinned_until,
    diversified.visibility
  FROM diversified, params
  WHERE diversified.restaurant_rank <= CASE WHEN params.scope = 'followed' THEN 8 ELSE 3 END
  ORDER BY diversified.computed_score DESC, diversified.activity_created_at DESC
  LIMIT least(greatest(COALESCE(p_limit, 20), 1), 50);
$$;

DROP FUNCTION IF EXISTS public.get_social_post_thread(uuid);

CREATE FUNCTION public.get_social_post_thread(p_post_id uuid)
RETURNS TABLE (
  post jsonb,
  comments jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (
      SELECT jsonb_build_object(
        'id', p.id,
        'restaurantId', p.restaurant_id,
        'authorId', p.author_id,
        'body', p.body,
        'status', p.status,
        'createdAt', p.created_at,
        'publishedAt', p.published_at,
        'postType', p.post_type,
        'ctaType', p.cta_type,
        'ctaTargetId', p.cta_target_id,
        'visibility', p.visibility,
        'restaurant', jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'imageUrl', r.image_url,
          'city', r.city,
          'cuisineType', r.cuisine_type
        ),
        'media', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'postId', m.post_id,
              'mediaUrl', m.media_url,
              'mediaPath', m.media_path,
              'mediaType', m.media_type,
              'sortOrder', m.sort_order,
              'altText', m.alt_text
            )
            ORDER BY m.sort_order ASC
          )
          FROM public.social_post_media m
          WHERE m.post_id = p.id
        ), '[]'::jsonb)
      )
      FROM public.social_posts p
      JOIN public.restaurants r ON r.id = p.restaurant_id
      WHERE p.id = p_post_id
      LIMIT 1
    ) AS post,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'postId', c.post_id,
          'parentCommentId', c.parent_comment_id,
          'userId', c.user_id,
          'body', c.body,
          'status', c.status,
          'createdAt', c.created_at,
          'authorName', pr.full_name,
          'reactionsCount', c.reactions_count,
          'myReaction', (
            SELECT cr.reaction_type
            FROM public.social_comment_reactions cr
            WHERE cr.comment_id = c.id
              AND cr.user_id = (SELECT auth.uid())
            LIMIT 1
          )
        )
        ORDER BY c.created_at ASC
      )
      FROM public.social_post_comments c
      LEFT JOIN public.profiles pr ON pr.user_id = c.user_id
      WHERE c.post_id = p_post_id
        AND c.status = 'published'
    ), '[]'::jsonb) AS comments;
$$;

DROP FUNCTION IF EXISTS public.set_social_reaction(text, uuid, text);

CREATE FUNCTION public.set_social_reaction(
  p_target_type text,
  p_target_id uuid,
  p_reaction text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.';
  END IF;

  IF p_reaction IS NOT NULL AND p_reaction NOT IN ('like', 'love', 'miam', 'wow', 'bravo', 'fire') THEN
    RAISE EXCEPTION 'Reaction invalide.';
  END IF;

  IF p_target_type = 'post' THEN
    DELETE FROM public.social_post_likes
    WHERE post_id = p_target_id
      AND user_id = v_user_id;

    IF p_reaction IS NOT NULL THEN
      INSERT INTO public.social_post_likes (post_id, user_id, reaction_type)
      VALUES (p_target_id, v_user_id, p_reaction);
    END IF;
  ELSIF p_target_type = 'comment' THEN
    DELETE FROM public.social_comment_reactions
    WHERE comment_id = p_target_id
      AND user_id = v_user_id;

    IF p_reaction IS NOT NULL THEN
      INSERT INTO public.social_comment_reactions (comment_id, user_id, reaction_type)
      VALUES (p_target_id, v_user_id, p_reaction);
    END IF;
  ELSE
    RAISE EXCEPTION 'Cible sociale invalide.';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.toggle_social_save(uuid);

CREATE FUNCTION public.toggle_social_save(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_exists boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.social_post_saves
    WHERE post_id = p_post_id
      AND user_id = v_user_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.social_post_saves
    WHERE post_id = p_post_id
      AND user_id = v_user_id;
    RETURN false;
  END IF;

  INSERT INTO public.social_post_saves (post_id, user_id)
  VALUES (p_post_id, v_user_id);
  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.record_social_feed_event(uuid, text, jsonb);

CREATE FUNCTION public.record_social_feed_event(
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.';
  END IF;

  SELECT p.restaurant_id
  INTO v_restaurant_id
  FROM public.social_posts p
  WHERE p.id = p_post_id
    AND p.status = 'published';

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Post introuvable.';
  END IF;

  INSERT INTO public.social_feed_events (user_id, post_id, restaurant_id, event_type, metadata)
  VALUES (v_user_id, p_post_id, v_restaurant_id, p_event_type, COALESCE(p_metadata, '{}'::jsonb))
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
    reposts_count
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
    CASE WHEN p_event_type = 'repost' THEN 1 ELSE 0 END
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
    updated_at = now();

  RETURN v_event_id;
END;
$$;

DROP FUNCTION IF EXISTS public.moderate_social_target(text, uuid, text, text);

CREATE FUNCTION public.moderate_social_target(
  p_target_type text,
  p_target_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Action reservee aux administrateurs.';
  END IF;

  IF p_target_type = 'post' THEN
    UPDATE public.social_posts
    SET
      status = p_status,
      hidden_reason = CASE WHEN p_status IN ('hidden', 'deleted') THEN COALESCE(p_reason, 'Moderation admin') ELSE NULL END,
      hidden_by = CASE WHEN p_status IN ('hidden', 'deleted') THEN v_user_id ELSE NULL END,
      hidden_at = CASE WHEN p_status IN ('hidden', 'deleted') THEN now() ELSE NULL END,
      updated_at = now()
    WHERE id = p_target_id;
  ELSIF p_target_type = 'comment' THEN
    UPDATE public.social_post_comments
    SET
      status = p_status,
      hidden_reason = CASE WHEN p_status IN ('hidden', 'deleted') THEN COALESCE(p_reason, 'Moderation admin') ELSE NULL END,
      hidden_by = CASE WHEN p_status IN ('hidden', 'deleted') THEN v_user_id ELSE NULL END,
      hidden_at = CASE WHEN p_status IN ('hidden', 'deleted') THEN now() ELSE NULL END,
      updated_at = now()
    WHERE id = p_target_id;
  ELSIF p_target_type = 'repost' THEN
    UPDATE public.social_post_reposts
    SET
      status = p_status,
      hidden_reason = CASE WHEN p_status IN ('hidden', 'deleted') THEN COALESCE(p_reason, 'Moderation admin') ELSE NULL END,
      hidden_by = CASE WHEN p_status IN ('hidden', 'deleted') THEN v_user_id ELSE NULL END,
      hidden_at = CASE WHEN p_status IN ('hidden', 'deleted') THEN now() ELSE NULL END,
      updated_at = now()
    WHERE id = p_target_id;
  ELSIF p_target_type = 'report' THEN
    UPDATE public.social_reports
    SET
      status = p_status,
      reviewed_by = v_user_id,
      reviewed_at = now(),
      resolution_notes = COALESCE(p_reason, resolution_notes),
      updated_at = now()
    WHERE id = p_target_id;
  ELSE
    RAISE EXCEPTION 'Cible sociale invalide.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_social_feed_v2(integer, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_social_post_thread(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_social_reaction(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.toggle_social_save(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_social_feed_event(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderate_social_target(text, uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_social_feed_v2(integer, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_post_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_social_reaction(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_social_save(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_social_feed_event(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_social_target(text, uuid, text, text) TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.social_post_saves TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.social_feed_feedback TO authenticated;
GRANT SELECT, INSERT ON public.social_feed_events TO authenticated;
GRANT SELECT ON public.social_post_metrics_daily TO authenticated;

DO $$
DECLARE
  realtime_table text;
BEGIN
  FOREACH realtime_table IN ARRAY ARRAY[
    'social_post_saves',
    'social_feed_feedback',
    'social_feed_events',
    'social_post_metrics_daily'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = realtime_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', realtime_table);
    END IF;
  END LOOP;
END
$$;
