-- Sponsored Actualites delivery must be proportional to paid budget, but not fixed.
-- This replaces the feed RPC ranking with a deterministic weighted lottery.
-- Higher remaining budgets get more chances to win sponsored slots, while a
-- per-viewer / per-15-minute rotation seed prevents the same post from always
-- occupying the first sponsored position.

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
  rotation AS (
    SELECT floor(extract(epoch from now()) / 900)::bigint AS bucket
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
  active_promotions AS (
    SELECT
      spp.post_id,
      sum(
        greatest(
          1,
          COALESCE(NULLIF(spp.budget_amount, 0), NULLIF(ac.total_budget, 0), 1)
          * greatest(COALESCE(spp.boost_weight, 1), 0.1)
          * CASE
              WHEN COALESCE(ac.total_budget, 0) > 0 THEN greatest(0.05, 1 - (COALESCE(ac.spent, 0) / NULLIF(ac.total_budget, 0)))
              ELSE 1
            END
          * CASE
              WHEN COALESCE(ac.budget_daily, 0) > 0 AND ac.daily_spent_date = current_date
                THEN greatest(0.05, 1 - (COALESCE(ac.daily_spent, 0) / NULLIF(ac.budget_daily, 0)))
              ELSE 1
            END
        )
      )::numeric AS sponsored_weight,
      count(*)::integer AS active_promotion_count,
      max(ac.id) AS representative_campaign_id
    FROM public.social_post_promotions spp
    JOIN public.ad_campaigns ac ON ac.id = spp.campaign_id
    WHERE spp.status = 'active'
      AND ac.status = 'active'
      AND ac.payment_status = 'paid'
      AND (spp.starts_at IS NULL OR spp.starts_at <= now())
      AND (spp.ends_at IS NULL OR spp.ends_at >= now())
      AND (ac.starts_at IS NULL OR ac.starts_at <= now())
      AND (ac.ends_at IS NULL OR ac.ends_at >= now())
      AND (ac.target_pages IS NULL OR 'actualites' = ANY(ac.target_pages))
      AND (COALESCE(ac.total_budget, 0) <= 0 OR COALESCE(ac.spent, 0) < COALESCE(ac.total_budget, 0))
      AND (
        COALESCE(ac.budget_daily, 0) <= 0
        OR ac.daily_spent_date IS DISTINCT FROM current_date
        OR COALESCE(ac.daily_spent, 0) < COALESCE(ac.budget_daily, 0)
      )
    GROUP BY spp.post_id
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
    SELECT
      a.*,
      r.name,
      r.image_url,
      r.city,
      r.cuisine_type,
      COALESCE(ap.sponsored_weight, 0)::numeric AS sponsored_weight,
      COALESCE(ap.active_promotion_count, 0)::integer AS active_promotion_count,
      ap.representative_campaign_id
    FROM activities a
    JOIN public.restaurants r ON r.id = a.restaurant_id
    LEFT JOIN active_promotions ap ON ap.post_id = a.post_id
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
  weighted AS (
    SELECT
      deduped.*,
      CASE
        WHEN deduped.sponsored_weight > 0 THEN (
          ((('x' || substr(md5(concat_ws(
            '|',
            deduped.post_id::text,
            COALESCE((SELECT uid::text FROM viewer), 'anon'),
            (SELECT bucket::text FROM rotation),
            COALESCE(deduped.representative_campaign_id::text, '')
          )), 1, 15))::bit(60)::bigint)::numeric + 1)
          / 1152921504606846977.0
        )
        ELSE NULL::numeric
      END AS sponsored_random_u
    FROM deduped
    WHERE deduped.post_activity_rank = 1
  ),
  sponsored_ranked AS (
    SELECT
      weighted.*,
      CASE
        WHEN weighted.sponsored_weight > 0 THEN -ln(greatest(0.000001, weighted.sponsored_random_u)) / greatest(weighted.sponsored_weight, 1)
        ELSE NULL::numeric
      END AS sponsored_priority,
      CASE
        WHEN weighted.sponsored_weight > 0 THEN row_number() OVER (
          ORDER BY (-ln(greatest(0.000001, weighted.sponsored_random_u)) / greatest(weighted.sponsored_weight, 1)) ASC, weighted.activity_created_at DESC
        )
        ELSE NULL::bigint
      END AS sponsored_slot_rank
    FROM weighted
  ),
  scored AS (
    SELECT
      sponsored_ranked.*,
      (
        CASE WHEN sponsored_ranked.pinned_until IS NOT NULL AND sponsored_ranked.pinned_until > now() THEN 24 ELSE 0 END
        + greatest(0, 32 - (extract(epoch from (now() - sponsored_ranked.activity_created_at)) / 3600.0) * 0.6)
        + least(
          25,
          ln(1 + greatest(sponsored_ranked.likes_count, 0)) * 2.2
          + ln(1 + greatest(sponsored_ranked.comments_count, 0)) * 4
          + ln(1 + greatest(sponsored_ranked.reposts_count, 0)) * 5
          + ln(1 + greatest(sponsored_ranked.shares_count, 0)) * 3.2
        )
        + CASE WHEN EXISTS (
          SELECT 1 FROM public.restaurant_follows rf, viewer v
          WHERE rf.restaurant_id = sponsored_ranked.restaurant_id AND rf.user_id = v.uid
        ) THEN 100 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1 FROM public.favorites f, viewer v
          WHERE f.restaurant_id = sponsored_ranked.restaurant_id AND f.user_id = v.uid
        ) THEN 16 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1 FROM interacted_restaurants ir WHERE ir.restaurant_id = sponsored_ranked.restaurant_id
        ) THEN 18 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1
          FROM preferred_cuisines pc
          WHERE lower(COALESCE(sponsored_ranked.cuisine_type, '')) = ANY (pc.cuisines)
        ) THEN 35 ELSE 0 END
        + CASE WHEN lower(COALESCE(sponsored_ranked.city, '')) = lower(COALESCE((SELECT city FROM viewer_profile), '')) AND COALESCE(sponsored_ranked.city, '') <> '' THEN 22 ELSE 0 END
        + CASE WHEN sponsored_ranked.post_type = 'promo' OR sponsored_ranked.cta_type = 'offer' THEN 10 ELSE 0 END
        + CASE
            WHEN sponsored_ranked.sponsored_weight > 0 THEN greatest(0, 82 - ((sponsored_ranked.sponsored_slot_rank - 1) * 12))
            ELSE 0
          END
      )::numeric AS computed_score
    FROM sponsored_ranked
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
      CASE WHEN diversified.sponsored_weight > 0 THEN 'Sponsorise' END,
      CASE WHEN diversified.sponsored_weight > 0 THEN 'Mis en avant selon budget et rotation' END,
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

NOTIFY pgrst, 'reload schema';
