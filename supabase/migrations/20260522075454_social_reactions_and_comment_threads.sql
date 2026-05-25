ALTER TABLE public.social_post_likes
  ADD COLUMN IF NOT EXISTS reaction_type text NOT NULL DEFAULT 'like';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_post_likes_reaction_type_check'
      AND conrelid = 'public.social_post_likes'::regclass
  ) THEN
    ALTER TABLE public.social_post_likes
      ADD CONSTRAINT social_post_likes_reaction_type_check
      CHECK (reaction_type IN ('like', 'love', 'miam', 'wow', 'bravo', 'fire'));
  END IF;
END
$$;

ALTER TABLE public.social_post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.social_post_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reactions_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_comments_not_self_parent_check'
      AND conrelid = 'public.social_post_comments'::regclass
  ) THEN
    ALTER TABLE public.social_post_comments
      ADD CONSTRAINT social_comments_not_self_parent_check
      CHECK (parent_comment_id IS NULL OR parent_comment_id <> id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'social_comments_reactions_count_check'
      AND conrelid = 'public.social_post_comments'::regclass
  ) THEN
    ALTER TABLE public.social_post_comments
      ADD CONSTRAINT social_comments_reactions_count_check
      CHECK (reactions_count >= 0);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.social_comment_reactions (
  comment_id uuid NOT NULL REFERENCES public.social_post_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reaction_type text NOT NULL DEFAULT 'like' CHECK (reaction_type IN ('like', 'love', 'miam', 'wow', 'bravo', 'fire')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS social_post_likes_reaction_idx ON public.social_post_likes (post_id, reaction_type);
CREATE INDEX IF NOT EXISTS social_post_comments_parent_idx ON public.social_post_comments (parent_comment_id, created_at ASC);
CREATE INDEX IF NOT EXISTS social_comment_reactions_comment_idx ON public.social_comment_reactions (comment_id, reaction_type);

ALTER TABLE public.social_comment_reactions ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "social_comment_reactions_select" ON public.social_comment_reactions;
CREATE POLICY "social_comment_reactions_select"
  ON public.social_comment_reactions
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_post_comments c
      JOIN public.social_posts p ON p.id = c.post_id
      WHERE c.id = social_comment_reactions.comment_id
        AND (
          c.status = 'published'
          OR c.user_id = (SELECT auth.uid())
          OR public.auth_owns_restaurant(p.restaurant_id)
        )
    )
  );

DROP POLICY IF EXISTS "social_comment_reactions_insert" ON public.social_comment_reactions;
CREATE POLICY "social_comment_reactions_insert"
  ON public.social_comment_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.social_post_comments c
      JOIN public.social_posts p ON p.id = c.post_id
      WHERE c.id = comment_id
        AND c.status = 'published'
        AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "social_comment_reactions_delete" ON public.social_comment_reactions;
CREATE POLICY "social_comment_reactions_delete"
  ON public.social_comment_reactions
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin());

DROP POLICY IF EXISTS "social_comments_insert" ON public.social_post_comments;
CREATE POLICY "social_comments_insert"
  ON public.social_post_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.social_posts p WHERE p.id = post_id AND p.status = 'published'
    )
    AND (
      parent_comment_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.social_post_comments parent
        WHERE parent.id = parent_comment_id
          AND parent.post_id = post_id
          AND parent.status = 'published'
      )
    )
  );

CREATE OR REPLACE FUNCTION public.refresh_social_comment_counts(p_comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.social_post_comments
  SET reactions_count = COALESCE((
    SELECT count(*)::integer
    FROM public.social_comment_reactions
    WHERE comment_id = p_comment_id
  ), 0)
  WHERE id = p_comment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.social_comment_counts_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment_id uuid;
BEGIN
  v_comment_id := COALESCE(NEW.comment_id, OLD.comment_id);
  IF v_comment_id IS NOT NULL THEN
    PERFORM public.refresh_social_comment_counts(v_comment_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS social_comment_reactions_refresh_counts ON public.social_comment_reactions;
CREATE TRIGGER social_comment_reactions_refresh_counts
  AFTER INSERT OR DELETE ON public.social_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION public.social_comment_counts_trigger();

DROP FUNCTION IF EXISTS public.get_social_feed(integer, timestamptz);

CREATE FUNCTION public.get_social_feed(
  p_limit integer DEFAULT 20,
  p_cursor timestamptz DEFAULT NULL
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
  score numeric,
  media jsonb,
  restaurant jsonb,
  repost jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH viewer AS (
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
      NULL::uuid AS repost_id,
      NULL::uuid AS repost_user_id,
      NULL::text AS repost_note,
      NULL::timestamptz AS repost_created_at
    FROM public.social_posts p
    WHERE p.status = 'published'
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
      rp.id AS repost_id,
      rp.user_id AS repost_user_id,
      rp.note AS repost_note,
      rp.created_at AS repost_created_at
    FROM public.social_post_reposts rp
    JOIN public.social_posts p ON p.id = rp.post_id
    WHERE rp.status = 'published'
      AND p.status = 'published'
  ),
  scoped AS (
    SELECT a.*, r.name, r.image_url, r.city, r.cuisine_type
    FROM activities a
    JOIN public.restaurants r ON r.id = a.restaurant_id
    WHERE (p_cursor IS NULL OR a.activity_created_at < p_cursor)
      AND r.is_active IS DISTINCT FROM false
  ),
  scored AS (
    SELECT
      scoped.*,
      (
        greatest(0, 32 - (extract(epoch from (now() - scoped.activity_created_at)) / 3600.0) * 0.6)
        + least(
          25,
          ln(1 + greatest(scoped.likes_count, 0)) * 2.2
          + ln(1 + greatest(scoped.comments_count, 0)) * 4
          + ln(1 + greatest(scoped.reposts_count, 0)) * 5
          + ln(1 + greatest(scoped.shares_count, 0)) * 3.2
        )
        + CASE WHEN EXISTS (
          SELECT 1 FROM public.restaurant_follows rf, viewer v
          WHERE rf.restaurant_id = scoped.restaurant_id AND rf.user_id = v.uid
        ) THEN 100 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1 FROM public.favorites f, viewer v
          WHERE f.restaurant_id = scoped.restaurant_id AND f.user_id = v.uid
        ) THEN 16 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1 FROM interacted_restaurants ir WHERE ir.restaurant_id = scoped.restaurant_id
        ) THEN 18 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1
          FROM preferred_cuisines pc
          WHERE lower(COALESCE(scoped.cuisine_type, '')) = ANY (pc.cuisines)
        ) THEN 35 ELSE 0 END
        + CASE WHEN lower(COALESCE(scoped.city, '')) = lower(COALESCE((SELECT city FROM viewer_profile), '')) AND COALESCE(scoped.city, '') <> '' THEN 22 ELSE 0 END
      )::numeric AS computed_score
    FROM scoped
  )
  SELECT
    scored.activity_id,
    scored.activity_type,
    scored.post_id,
    scored.restaurant_id,
    scored.author_id,
    scored.body,
    scored.status,
    scored.activity_created_at AS created_at,
    scored.published_at,
    scored.likes_count,
    scored.comments_count,
    scored.reposts_count,
    scored.shares_count,
    EXISTS (
      SELECT 1 FROM public.social_post_likes l, viewer v
      WHERE l.post_id = scored.post_id AND l.user_id = v.uid
    ) AS liked_by_me,
    (
      SELECT l.reaction_type
      FROM public.social_post_likes l, viewer v
      WHERE l.post_id = scored.post_id AND l.user_id = v.uid
      LIMIT 1
    ) AS my_reaction,
    COALESCE((
      SELECT jsonb_object_agg(reaction_type, reaction_count)
      FROM (
        SELECT l.reaction_type, count(*)::integer AS reaction_count
        FROM public.social_post_likes l
        WHERE l.post_id = scored.post_id
        GROUP BY l.reaction_type
      ) grouped
    ), '{}'::jsonb) AS reaction_counts,
    EXISTS (
      SELECT 1 FROM public.restaurant_follows rf, viewer v
      WHERE rf.restaurant_id = scored.restaurant_id AND rf.user_id = v.uid
    ) AS followed_by_me,
    EXISTS (
      SELECT 1 FROM public.social_post_reposts rp, viewer v
      WHERE rp.post_id = scored.post_id AND rp.user_id = v.uid AND rp.status = 'published'
    ) AS reposted_by_me,
    round(scored.computed_score, 2) AS score,
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
      WHERE m.post_id = scored.post_id
    ), '[]'::jsonb) AS media,
    jsonb_build_object(
      'id', scored.restaurant_id,
      'name', scored.name,
      'imageUrl', scored.image_url,
      'city', scored.city,
      'cuisineType', scored.cuisine_type
    ) AS restaurant,
    CASE
      WHEN scored.activity_type = 'repost' THEN jsonb_build_object(
        'id', scored.repost_id,
        'userId', scored.repost_user_id,
        'note', scored.repost_note,
        'createdAt', scored.repost_created_at,
        'authorName', (
          SELECT p.full_name
          FROM public.profiles p
          WHERE p.user_id = scored.repost_user_id
          LIMIT 1
        )
      )
      ELSE NULL::jsonb
    END AS repost
  FROM scored
  ORDER BY scored.computed_score DESC, scored.activity_created_at DESC
  LIMIT least(greatest(COALESCE(p_limit, 20), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.refresh_social_comment_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_comment_counts_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_social_feed(integer, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.refresh_social_comment_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_feed(integer, timestamptz) TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.social_comment_reactions TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'social_comment_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.social_comment_reactions;
  END IF;
END
$$;
