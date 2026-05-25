ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS favorite_cuisines text[];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-post-media',
  'social-post-media',
  true,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'deleted')),
  likes_count integer NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  comments_count integer NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  reposts_count integer NOT NULL DEFAULT 0 CHECK (reposts_count >= 0),
  shares_count integer NOT NULL DEFAULT 0 CHECK (shares_count >= 0),
  published_at timestamptz NOT NULL DEFAULT now(),
  hidden_reason text,
  hidden_by uuid,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_path text,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0 AND sort_order < 10),
  alt_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.social_post_likes (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.social_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'deleted')),
  hidden_reason text,
  hidden_by uuid,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.restaurant_follows (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.social_post_reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  note text CHECK (note IS NULL OR length(trim(note)) <= 600),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'deleted')),
  hidden_reason text,
  hidden_by uuid,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.social_post_external_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'link',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('post', 'comment', 'repost')),
  target_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 120),
  details text CHECK (details IS NULL OR length(trim(details)) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'resolved')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_posts_restaurant_created_idx ON public.social_posts (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS social_posts_status_created_idx ON public.social_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS social_post_media_post_order_idx ON public.social_post_media (post_id, sort_order);
CREATE INDEX IF NOT EXISTS social_post_comments_post_created_idx ON public.social_post_comments (post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS social_post_reposts_post_created_idx ON public.social_post_reposts (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS restaurant_follows_user_idx ON public.restaurant_follows (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS social_reports_status_created_idx ON public.social_reports (status, created_at DESC);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_external_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_posts_select" ON public.social_posts;
CREATE POLICY "social_posts_select"
  ON public.social_posts
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
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
  );

DROP POLICY IF EXISTS "social_posts_update" ON public.social_posts;
CREATE POLICY "social_posts_update"
  ON public.social_posts
  FOR UPDATE
  TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin())
  WITH CHECK (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());

DROP POLICY IF EXISTS "social_posts_delete" ON public.social_posts;
CREATE POLICY "social_posts_delete"
  ON public.social_posts
  FOR DELETE
  TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());

DROP POLICY IF EXISTS "social_media_select" ON public.social_post_media;
CREATE POLICY "social_media_select"
  ON public.social_post_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_media.post_id
        AND (
          p.status = 'published'
          OR public.auth_owns_restaurant(p.restaurant_id)
          OR public.auth_is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "social_media_manage" ON public.social_post_media;
CREATE POLICY "social_media_manage"
  ON public.social_post_media
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_media.post_id
        AND (public.auth_owns_restaurant(p.restaurant_id) OR public.auth_is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_media.post_id
        AND (public.auth_owns_restaurant(p.restaurant_id) OR public.auth_is_admin())
    )
  );

DROP POLICY IF EXISTS "social_likes_select" ON public.social_post_likes;
CREATE POLICY "social_likes_select"
  ON public.social_post_likes
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_likes.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  );

DROP POLICY IF EXISTS "social_likes_insert" ON public.social_post_likes;
CREATE POLICY "social_likes_insert"
  ON public.social_post_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.social_posts p WHERE p.id = post_id AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "social_likes_delete" ON public.social_post_likes;
CREATE POLICY "social_likes_delete"
  ON public.social_post_likes
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin());

DROP POLICY IF EXISTS "social_comments_select" ON public.social_post_comments;
CREATE POLICY "social_comments_select"
  ON public.social_post_comments
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    OR user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_comments.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  );

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
  );

DROP POLICY IF EXISTS "social_comments_update" ON public.social_post_comments;
CREATE POLICY "social_comments_update"
  ON public.social_post_comments
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_comments.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_comments.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  );

DROP POLICY IF EXISTS "social_comments_delete" ON public.social_post_comments;
CREATE POLICY "social_comments_delete"
  ON public.social_post_comments
  FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_comments.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  );

DROP POLICY IF EXISTS "restaurant_follows_select" ON public.restaurant_follows;
CREATE POLICY "restaurant_follows_select"
  ON public.restaurant_follows
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "restaurant_follows_insert" ON public.restaurant_follows;
CREATE POLICY "restaurant_follows_insert"
  ON public.restaurant_follows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.is_active IS DISTINCT FROM false)
  );

DROP POLICY IF EXISTS "restaurant_follows_delete" ON public.restaurant_follows;
CREATE POLICY "restaurant_follows_delete"
  ON public.restaurant_follows
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin());

DROP POLICY IF EXISTS "social_reposts_select" ON public.social_post_reposts;
CREATE POLICY "social_reposts_select"
  ON public.social_post_reposts
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    OR user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_reposts.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  );

DROP POLICY IF EXISTS "social_reposts_insert" ON public.social_post_reposts;
CREATE POLICY "social_reposts_insert"
  ON public.social_post_reposts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.social_posts p WHERE p.id = post_id AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "social_reposts_update" ON public.social_post_reposts;
CREATE POLICY "social_reposts_update"
  ON public.social_post_reposts
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_reposts.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_reposts.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  );

DROP POLICY IF EXISTS "social_reposts_delete" ON public.social_post_reposts;
CREATE POLICY "social_reposts_delete"
  ON public.social_post_reposts
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.auth_is_admin());

DROP POLICY IF EXISTS "social_external_shares_select" ON public.social_post_external_shares;
CREATE POLICY "social_external_shares_select"
  ON public.social_post_external_shares
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = social_post_external_shares.post_id
        AND public.auth_owns_restaurant(p.restaurant_id)
    )
  );

DROP POLICY IF EXISTS "social_external_shares_insert" ON public.social_post_external_shares;
CREATE POLICY "social_external_shares_insert"
  ON public.social_post_external_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.social_posts p WHERE p.id = post_id AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "social_reports_select" ON public.social_reports;
CREATE POLICY "social_reports_select"
  ON public.social_reports
  FOR SELECT
  TO authenticated
  USING (reporter_id = (SELECT auth.uid()) OR public.auth_is_admin());

DROP POLICY IF EXISTS "social_reports_insert" ON public.social_reports;
CREATE POLICY "social_reports_insert"
  ON public.social_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "social_reports_update" ON public.social_reports;
CREATE POLICY "social_reports_update"
  ON public.social_reports
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

DROP POLICY IF EXISTS "social_posts_storage_select" ON storage.objects;
CREATE POLICY "social_posts_storage_select"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'social-post-media');

DROP POLICY IF EXISTS "social_posts_storage_insert" ON storage.objects;
CREATE POLICY "social_posts_storage_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'social-post-media'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND (
      public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
      OR public.auth_is_admin()
    )
  );

DROP POLICY IF EXISTS "social_posts_storage_update" ON storage.objects;
CREATE POLICY "social_posts_storage_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'social-post-media'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND (
      public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
      OR public.auth_is_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'social-post-media'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND (
      public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
      OR public.auth_is_admin()
    )
  );

DROP POLICY IF EXISTS "social_posts_storage_delete" ON storage.objects;
CREATE POLICY "social_posts_storage_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'social-post-media'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND (
      public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
      OR public.auth_is_admin()
    )
  );

DROP TRIGGER IF EXISTS set_updated_at_social_posts ON public.social_posts;
CREATE TRIGGER set_updated_at_social_posts
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_social_comments ON public.social_post_comments;
CREATE TRIGGER set_updated_at_social_comments
  BEFORE UPDATE ON public.social_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_social_reposts ON public.social_post_reposts;
CREATE TRIGGER set_updated_at_social_reposts
  BEFORE UPDATE ON public.social_post_reposts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_social_reports ON public.social_reports;
CREATE TRIGGER set_updated_at_social_reports
  BEFORE UPDATE ON public.social_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.refresh_social_post_counts(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.social_posts
  SET
    likes_count = COALESCE((SELECT count(*)::integer FROM public.social_post_likes WHERE post_id = p_post_id), 0),
    comments_count = COALESCE((SELECT count(*)::integer FROM public.social_post_comments WHERE post_id = p_post_id AND status = 'published'), 0),
    reposts_count = COALESCE((SELECT count(*)::integer FROM public.social_post_reposts WHERE post_id = p_post_id AND status = 'published'), 0),
    shares_count = COALESCE((SELECT count(*)::integer FROM public.social_post_external_shares WHERE post_id = p_post_id), 0)
  WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.social_post_counts_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id uuid;
BEGIN
  v_post_id := COALESCE(NEW.post_id, OLD.post_id);
  IF v_post_id IS NOT NULL THEN
    PERFORM public.refresh_social_post_counts(v_post_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS social_likes_refresh_counts ON public.social_post_likes;
CREATE TRIGGER social_likes_refresh_counts
  AFTER INSERT OR DELETE ON public.social_post_likes
  FOR EACH ROW EXECUTE FUNCTION public.social_post_counts_trigger();

DROP TRIGGER IF EXISTS social_comments_refresh_counts ON public.social_post_comments;
CREATE TRIGGER social_comments_refresh_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.social_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.social_post_counts_trigger();

DROP TRIGGER IF EXISTS social_reposts_refresh_counts ON public.social_post_reposts;
CREATE TRIGGER social_reposts_refresh_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.social_post_reposts
  FOR EACH ROW EXECUTE FUNCTION public.social_post_counts_trigger();

DROP TRIGGER IF EXISTS social_external_shares_refresh_counts ON public.social_post_external_shares;
CREATE TRIGGER social_external_shares_refresh_counts
  AFTER INSERT OR DELETE ON public.social_post_external_shares
  FOR EACH ROW EXECUTE FUNCTION public.social_post_counts_trigger();

CREATE OR REPLACE FUNCTION public.notify_social_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_restaurant_name text;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  SELECT r.owner_id, r.name
  INTO v_owner_id, v_restaurant_name
  FROM public.social_posts p
  JOIN public.restaurants r ON r.id = p.restaurant_id
  WHERE p.id = NEW.post_id;

  IF v_owner_id IS NOT NULL AND v_owner_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.enqueue_notification(
      v_owner_id,
      'Nouveau commentaire',
      'Un client a commente une actualite de ' || COALESCE(v_restaurant_name, 'votre restaurant') || '.',
      'social_comment',
      'product',
      jsonb_build_object(
        'post_id', NEW.post_id,
        'comment_id', NEW.id,
        'url', '/dashboard/actualites',
        'requested_channels', jsonb_build_object('in_app', true, 'push', true, 'email', false)
      )::json
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_restaurant_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_restaurant_name text;
BEGIN
  SELECT owner_id, name
  INTO v_owner_id, v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF v_owner_id IS NOT NULL AND v_owner_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.enqueue_notification(
      v_owner_id,
      'Nouveau follower',
      'Un client suit maintenant ' || COALESCE(v_restaurant_name, 'votre restaurant') || '.',
      'social_follow',
      'product',
      jsonb_build_object(
        'restaurant_id', NEW.restaurant_id,
        'url', '/dashboard/actualites',
        'requested_channels', jsonb_build_object('in_app', true, 'push', true, 'email', false)
      )::json
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_social_repost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_restaurant_name text;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  SELECT r.owner_id, r.name
  INTO v_owner_id, v_restaurant_name
  FROM public.social_posts p
  JOIN public.restaurants r ON r.id = p.restaurant_id
  WHERE p.id = NEW.post_id;

  IF v_owner_id IS NOT NULL AND v_owner_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.enqueue_notification(
      v_owner_id,
      'Actualite repartagee',
      'Un client a repartage une actualite de ' || COALESCE(v_restaurant_name, 'votre restaurant') || '.',
      'social_repost',
      'product',
      jsonb_build_object(
        'post_id', NEW.post_id,
        'repost_id', NEW.id,
        'url', '/dashboard/actualites',
        'requested_channels', jsonb_build_object('in_app', true, 'push', true, 'email', false)
      )::json
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_social_comment_insert ON public.social_post_comments;
CREATE TRIGGER notify_social_comment_insert
  AFTER INSERT ON public.social_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_social_comment();

DROP TRIGGER IF EXISTS notify_restaurant_follow_insert ON public.restaurant_follows;
CREATE TRIGGER notify_restaurant_follow_insert
  AFTER INSERT ON public.restaurant_follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_restaurant_follow();

DROP TRIGGER IF EXISTS notify_social_repost_insert ON public.social_post_reposts;
CREATE TRIGGER notify_social_repost_insert
  AFTER INSERT ON public.social_post_reposts
  FOR EACH ROW EXECUTE FUNCTION public.notify_social_repost();

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

REVOKE ALL ON FUNCTION public.refresh_social_post_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_post_counts_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_social_comment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_restaurant_follow() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_social_repost() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_social_feed(integer, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.refresh_social_post_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_feed(integer, timestamptz) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_media TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.social_post_likes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_comments TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.restaurant_follows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_reposts TO authenticated;
GRANT SELECT, INSERT ON public.social_post_external_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.social_reports TO authenticated;

DO $$
DECLARE
  realtime_table text;
BEGIN
  FOREACH realtime_table IN ARRAY ARRAY[
    'social_posts',
    'social_post_media',
    'social_post_likes',
    'social_post_comments',
    'restaurant_follows',
    'social_post_reposts',
    'social_post_external_shares',
    'social_reports'
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

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  ('actualites-sociales', 'Actualites sociales', 'Active le fil social client pour les restaurants.', true),
  ('dashboard-actualites', 'Dashboard: Actualites', 'Expose la creation et la gestion des posts restaurateur.', true),
  ('admin-actualites', 'Admin actualites', 'Expose la moderation admin du fil social.', true)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();
