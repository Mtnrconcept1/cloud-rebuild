-- Actualites sponsored campaign audience scoring.
-- Adds weighted targeting for paid sponsored posts. Targeted campaigns must
-- match at least one viewer criterion; broad campaigns remain eligible.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_gender_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_gender_check
      CHECK (gender IS NULL OR gender IN ('female', 'male', 'other', 'unspecified'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.profiles.gender IS 'Optional audience signal used for sponsored campaign targeting. Values: female, male, other, unspecified.';

CREATE OR REPLACE FUNCTION public.social_campaign_targeting_score(
  p_target_criteria jsonb,
  p_restaurant_id uuid,
  p_restaurant_city text DEFAULT NULL,
  p_restaurant_cuisine text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_city text := '';
  v_profile_gender text := '';
  v_cities text[] := ARRAY[]::text[];
  v_cuisines text[] := ARRAY[]::text[];
  v_genders text[] := ARRAY[]::text[];
  v_journey_types text[] := ARRAY[]::text[];
  v_service_moments text[] := ARRAY[]::text[];
  v_user_cuisines text[] := ARRAY[]::text[];
  v_user_journeys text[] := ARRAY[]::text[];
  v_user_service_moments text[] := ARRAY[]::text[];
  v_interaction_count integer := 0;
  v_avg_basket numeric := 0;
  v_days_since_last_activity integer := NULL;
  v_last_activity timestamptz := NULL;
  v_favorites_only boolean := false;
  v_is_favorite boolean := false;
  v_min_orders numeric := 0;
  v_min_avg_basket numeric := 0;
  v_max_days_since_order numeric := 365;
  v_customer_segment text := 'all';
  v_score numeric := 0;
  v_has_targeting boolean := false;
BEGIN
  p_target_criteria := COALESCE(p_target_criteria, '{}'::jsonb);

  SELECT COALESCE(array_agg(lower(trim(value))), ARRAY[]::text[]) INTO v_cities
  FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_target_criteria->'cities') = 'array' THEN p_target_criteria->'cities' ELSE '[]'::jsonb END) AS value;

  SELECT COALESCE(array_agg(lower(trim(value))), ARRAY[]::text[]) INTO v_cuisines
  FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_target_criteria->'cuisines') = 'array' THEN p_target_criteria->'cuisines' ELSE '[]'::jsonb END) AS value;

  SELECT COALESCE(array_agg(lower(trim(value))), ARRAY[]::text[]) INTO v_genders
  FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_target_criteria->'genders') = 'array' THEN p_target_criteria->'genders' ELSE '[]'::jsonb END) AS value;

  SELECT COALESCE(array_agg(lower(trim(value))), ARRAY[]::text[]) INTO v_journey_types
  FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_target_criteria->'journeyTypes') = 'array' THEN p_target_criteria->'journeyTypes' ELSE '[]'::jsonb END) AS value;

  SELECT COALESCE(array_agg(lower(trim(value))), ARRAY[]::text[]) INTO v_service_moments
  FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_target_criteria->'serviceMoments') = 'array' THEN p_target_criteria->'serviceMoments' ELSE '[]'::jsonb END) AS value;

  v_favorites_only := COALESCE((p_target_criteria->>'favoritesOnly')::boolean, false);
  v_min_orders := GREATEST(0, COALESCE(NULLIF(p_target_criteria->>'minOrders', '')::numeric, 0));
  v_min_avg_basket := GREATEST(0, COALESCE(NULLIF(p_target_criteria->>'minAvgBasket', '')::numeric, 0));
  v_max_days_since_order := GREATEST(1, COALESCE(NULLIF(p_target_criteria->>'maxDaysSinceOrder', '')::numeric, 365));
  v_customer_segment := lower(trim(COALESCE(p_target_criteria->>'customerSegment', 'all')));

  v_has_targeting := cardinality(v_cities) > 0
    OR cardinality(v_cuisines) > 0
    OR (cardinality(v_genders) > 0 AND NOT ('all' = ANY(v_genders)))
    OR cardinality(v_journey_types) > 0
    OR cardinality(v_service_moments) > 0
    OR v_favorites_only
    OR v_min_orders > 0
    OR v_min_avg_basket > 0
    OR v_max_days_since_order < 365
    OR v_customer_segment <> 'all';

  IF NOT v_has_targeting THEN
    RETURN 1;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT lower(trim(COALESCE(p.city, ''))), lower(trim(COALESCE(p.gender, '')))
  INTO v_profile_city, v_profile_gender
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM public.favorites f
    WHERE f.user_id = v_user_id
      AND f.restaurant_id = p_restaurant_id
  ) INTO v_is_favorite;

  SELECT count(*)::integer, COALESCE(avg(NULLIF(o.total_amount, 0)), 0), max(o.created_at)
  INTO v_interaction_count, v_avg_basket, v_last_activity
  FROM public.orders o
  WHERE o.user_id = v_user_id
    AND o.restaurant_id IS NOT NULL
    AND COALESCE(o.status, '') NOT IN ('cancelled', 'refunded', 'payment_failed', 'failed');

  SELECT
    v_interaction_count + count(*)::integer,
    COALESCE(greatest(v_last_activity, max(rv.created_at)), v_last_activity, max(rv.created_at))
  INTO v_interaction_count, v_last_activity
  FROM public.reservations rv
  WHERE rv.user_id = v_user_id
    AND rv.restaurant_id IS NOT NULL
    AND COALESCE(rv.status, '') NOT IN ('cancelled', 'rejected', 'no_show');

  IF v_last_activity IS NOT NULL THEN
    v_days_since_last_activity := floor(extract(epoch from (now() - v_last_activity)) / 86400.0)::integer;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT lower(trim(token))), ARRAY[]::text[]) INTO v_user_cuisines
  FROM (
    SELECT unnest(COALESCE(up.favorite_cuisines, up.dietary_tags, ARRAY[]::text[])) AS token
    FROM public.user_preferences up
    WHERE up.user_id = v_user_id
    UNION ALL
    SELECT regexp_split_to_table(COALESCE(r.cuisine_type, ''), ',') AS token
    FROM public.restaurants r
    WHERE r.id IN (
      SELECT f.restaurant_id FROM public.favorites f WHERE f.user_id = v_user_id
      UNION
      SELECT o.restaurant_id FROM public.orders o WHERE o.user_id = v_user_id AND o.restaurant_id IS NOT NULL
      UNION
      SELECT rv.restaurant_id FROM public.reservations rv WHERE rv.user_id = v_user_id AND rv.restaurant_id IS NOT NULL
    )
  ) cuisine_source
  WHERE trim(token) <> '';

  SELECT COALESCE(array_agg(DISTINCT journey), ARRAY[]::text[]) INTO v_user_journeys
  FROM (
    SELECT CASE WHEN COALESCE(o.delivery_address, '') <> '' THEN 'delivery' ELSE 'takeaway' END AS journey
    FROM public.orders o
    WHERE o.user_id = v_user_id
      AND COALESCE(o.status, '') NOT IN ('cancelled', 'refunded', 'payment_failed', 'failed')
    UNION ALL
    SELECT 'reservation' AS journey
    FROM public.reservations rv
    WHERE rv.user_id = v_user_id
      AND COALESCE(rv.status, '') NOT IN ('cancelled', 'rejected', 'no_show')
  ) journey_source;

  SELECT COALESCE(array_agg(DISTINCT moment), ARRAY[]::text[]) INTO v_user_service_moments
  FROM (
    SELECT CASE WHEN extract(isodow from o.created_at) IN (6, 7) THEN 'weekend' WHEN extract(hour from o.created_at) < 15 THEN 'lunch' ELSE 'dinner' END AS moment
    FROM public.orders o
    WHERE o.user_id = v_user_id
      AND COALESCE(o.status, '') NOT IN ('cancelled', 'refunded', 'payment_failed', 'failed')
    UNION ALL
    SELECT CASE WHEN extract(isodow from rv.created_at) IN (6, 7) THEN 'weekend' WHEN extract(hour from rv.created_at) < 15 THEN 'lunch' ELSE 'dinner' END AS moment
    FROM public.reservations rv
    WHERE rv.user_id = v_user_id
      AND COALESCE(rv.status, '') NOT IN ('cancelled', 'rejected', 'no_show')
  ) moment_source;

  IF cardinality(v_genders) > 0 AND NOT ('all' = ANY(v_genders)) AND v_profile_gender = ANY(v_genders) THEN
    v_score := v_score + 1;
  END IF;

  IF cardinality(v_cities) > 0 AND lower(trim(COALESCE(v_profile_city, ''))) = ANY(v_cities) THEN
    v_score := v_score + 8;
  END IF;

  IF cardinality(v_cuisines) > 0 AND v_cuisines && v_user_cuisines THEN
    v_score := v_score + 10;
  END IF;

  IF v_favorites_only AND v_is_favorite THEN
    v_score := v_score + 8;
  END IF;

  IF v_min_orders > 0 AND v_interaction_count >= v_min_orders THEN
    v_score := v_score + 5;
  END IF;

  IF v_min_avg_basket > 0 AND v_avg_basket >= v_min_avg_basket THEN
    v_score := v_score + 5;
  END IF;

  IF v_max_days_since_order < 365 AND v_days_since_last_activity IS NOT NULL AND v_days_since_last_activity <= v_max_days_since_order THEN
    v_score := v_score + 5;
  END IF;

  IF cardinality(v_journey_types) > 0 AND v_journey_types && v_user_journeys THEN
    v_score := v_score + 4;
  END IF;

  IF cardinality(v_service_moments) > 0 AND v_service_moments && v_user_service_moments THEN
    v_score := v_score + 3;
  END IF;

  IF v_customer_segment = 'new' AND v_interaction_count = 0 THEN
    v_score := v_score + 6;
  ELSIF v_customer_segment = 'returning' AND v_interaction_count > 0 THEN
    v_score := v_score + 6;
  ELSIF v_customer_segment = 'loyal' AND (v_interaction_count >= 5 OR v_is_favorite) THEN
    v_score := v_score + 6;
  ELSIF v_customer_segment = 'inactive' AND v_interaction_count > 0 AND COALESCE(v_days_since_last_activity, 0) >= 45 THEN
    v_score := v_score + 6;
  END IF;

  RETURN v_score;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.social_campaign_targeting_score(jsonb, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_campaign_targeting_score(jsonb, uuid, text, text) TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_social_feed_v2(
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
    SELECT CASE WHEN p_scope IN ('for_you', 'followed', 'nearby', 'offers', 'saved') THEN p_scope ELSE 'for_you' END AS scope
  ),
  viewer AS (
    SELECT (SELECT auth.uid()) AS uid
  ),
  rotation AS (
    SELECT floor(extract(epoch from now()) / 900)::bigint AS bucket
  ),
  viewer_profile AS (
    SELECT p.city FROM public.profiles p, viewer v WHERE p.user_id = v.uid LIMIT 1
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
      SELECT f.restaurant_id FROM public.favorites f, viewer v WHERE f.user_id = v.uid
      UNION
      SELECT o.restaurant_id FROM public.orders o, viewer v WHERE o.user_id = v.uid
      UNION
      SELECT rv.restaurant_id FROM public.reservations rv, viewer v WHERE rv.user_id = v.uid
    ) source
    WHERE restaurant_id IS NOT NULL
  ),
  raw_user_post_signals AS (
    SELECT l.post_id, 5::numeric AS weight
    FROM public.social_post_likes l, viewer v
    WHERE l.user_id = v.uid
      AND l.created_at >= now() - interval '120 days'
    UNION ALL
    SELECT c.post_id, 8::numeric AS weight
    FROM public.social_post_comments c, viewer v
    WHERE c.user_id = v.uid
      AND c.status = 'published'
      AND c.created_at >= now() - interval '120 days'
    UNION ALL
    SELECT rp.post_id, 12::numeric AS weight
    FROM public.social_post_reposts rp, viewer v
    WHERE rp.user_id = v.uid
      AND rp.status = 'published'
      AND rp.created_at >= now() - interval '120 days'
    UNION ALL
    SELECT sh.post_id, 12::numeric AS weight
    FROM public.social_post_external_shares sh, viewer v
    WHERE sh.user_id = v.uid
      AND sh.created_at >= now() - interval '120 days'
    UNION ALL
    SELECT saved.post_id, 5::numeric AS weight
    FROM public.social_post_saves saved, viewer v
    WHERE saved.user_id = v.uid
      AND saved.created_at >= now() - interval '120 days'
    UNION ALL
    SELECT e.post_id,
      CASE
        WHEN e.event_type = 'impression' THEN 1
        WHEN e.event_type = 'click' THEN 3
        WHEN e.event_type = 'cta_click' THEN 3
        WHEN e.event_type = 'reaction' THEN 5
        WHEN e.event_type = 'comment' THEN 8
        WHEN e.event_type = 'share' THEN 12
        WHEN e.event_type = 'save' THEN 5
        WHEN e.event_type = 'follow' THEN 5
        WHEN e.event_type = 'repost' THEN 12
        ELSE 0
      END::numeric AS weight
    FROM public.social_feed_events e, viewer v
    WHERE e.user_id = v.uid
      AND e.created_at >= now() - interval '120 days'
    UNION ALL
    SELECT ff.post_id,
      CASE
        WHEN ff.feedback_type = 'show_more' THEN 20
        WHEN ff.feedback_type = 'not_interested' THEN -30
        WHEN ff.feedback_type = 'hide_post' THEN -20
        ELSE 0
      END::numeric AS weight
    FROM public.social_feed_feedback ff, viewer v
    WHERE ff.user_id = v.uid
      AND ff.post_id IS NOT NULL
      AND ff.feedback_type IN ('show_more', 'not_interested', 'hide_post')
      AND ff.created_at >= now() - interval '120 days'
  ),
  user_interest_signals AS (
    SELECT
      sp.id AS post_id,
      sp.restaurant_id,
      lower(trim(COALESCE(r.cuisine_type, ''))) AS cuisine,
      lower(trim(COALESCE(r.city, ''))) AS city,
      COALESCE(sp.post_type, 'annonce') AS post_type,
      sum(raw.weight)::numeric AS weight
    FROM raw_user_post_signals raw
    JOIN public.social_posts sp ON sp.id = raw.post_id
    JOIN public.restaurants r ON r.id = sp.restaurant_id
    GROUP BY sp.id, sp.restaurant_id, r.cuisine_type, r.city, sp.post_type
  ),
  user_conversion_signals AS (
    SELECT restaurant_id, sum(weight)::numeric AS weight
    FROM (
      SELECT o.restaurant_id, 25::numeric AS weight
      FROM public.orders o, viewer v
      WHERE o.user_id = v.uid
        AND o.restaurant_id IS NOT NULL
        AND o.created_at >= now() - interval '180 days'
      UNION ALL
      SELECT rv.restaurant_id, 20::numeric AS weight
      FROM public.reservations rv, viewer v
      WHERE rv.user_id = v.uid
        AND rv.restaurant_id IS NOT NULL
        AND rv.created_at >= now() - interval '180 days'
    ) conversions
    GROUP BY restaurant_id
  ),
  active_campaign_promotions AS (
    SELECT
      spp.post_id,
      spp.budget_amount,
      greatest(COALESCE(spp.boost_weight, 1), 0.1) AS boost_weight,
      ac.id AS campaign_id,
      ac.created_at AS campaign_created_at,
      COALESCE(ac.total_budget, 0)::numeric AS total_budget,
      COALESCE(ac.spent, 0)::numeric AS spent,
      COALESCE(ac.budget_daily, 0)::numeric AS budget_daily,
      CASE
        WHEN ac.daily_spent_date = current_date THEN COALESCE(ac.daily_spent, 0)::numeric
        ELSE 0::numeric
      END AS daily_spent_today,
      CASE
        WHEN ac.ends_at IS NOT NULL THEN greatest(1, ceil(extract(epoch from (ac.ends_at - now())) / 86400.0)::numeric)
        ELSE 1::numeric
      END AS days_remaining,
      targeting.score AS targeting_score
    FROM public.social_post_promotions spp
    JOIN public.ad_campaigns ac ON ac.id = spp.campaign_id
    JOIN public.social_posts promoted_post ON promoted_post.id = spp.post_id
    JOIN public.restaurants promoted_restaurant ON promoted_restaurant.id = promoted_post.restaurant_id
    CROSS JOIN LATERAL public.social_campaign_targeting_score(ac.target_criteria, promoted_restaurant.id, promoted_restaurant.city, promoted_restaurant.cuisine_type) AS targeting(score)
    WHERE spp.status = 'active'
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
      AND targeting.score > 0
  ),
  weighted_campaign_promotions AS (
    SELECT
      raw.*,
      CASE
        WHEN raw.total_budget > 0 THEN greatest(raw.total_budget - raw.spent, 0)
        ELSE greatest(COALESCE(raw.budget_amount, 0), raw.budget_daily, 1)
      END AS remaining_budget,
      CASE
        WHEN raw.budget_daily > 0 THEN raw.budget_daily
        WHEN raw.total_budget > 0 THEN greatest(raw.total_budget - raw.spent, 0) / greatest(raw.days_remaining, 1)
        ELSE greatest(COALESCE(raw.budget_amount, 0), 1)
      END AS daily_budget_plan,
      CASE
        WHEN raw.budget_daily > 0 THEN greatest(raw.budget_daily - raw.daily_spent_today, 0)
        WHEN raw.total_budget > 0 THEN greatest((greatest(raw.total_budget - raw.spent, 0) / greatest(raw.days_remaining, 1)) - raw.daily_spent_today, 0)
        ELSE greatest(COALESCE(raw.budget_amount, 1), 1)
      END AS daily_budget_remaining,
      greatest(1, least(2.5, 1 + (COALESCE(raw.targeting_score, 0) / 30.0))) AS targeting_multiplier
    FROM active_campaign_promotions raw
  ),
  paced_campaign_promotions AS (
    SELECT
      weighted.*,
      greatest(
        0,
        least(weighted.daily_budget_remaining, weighted.remaining_budget / greatest(weighted.days_remaining, 1))
      ) AS budget_pacing_score
    FROM weighted_campaign_promotions weighted
  ),
  active_promotions AS (
    SELECT
      paced.post_id,
      sum(paced.budget_pacing_score * paced.boost_weight * paced.targeting_multiplier)::numeric AS sponsored_weight,
      (array_agg(paced.campaign_id ORDER BY paced.targeting_score DESC, paced.budget_pacing_score DESC, paced.campaign_created_at DESC NULLS LAST, paced.campaign_id::text DESC))[1] AS representative_campaign_id
    FROM paced_campaign_promotions paced
    WHERE paced.budget_pacing_score > 0
    GROUP BY paced.post_id
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
          SELECT 1 FROM public.restaurant_follows rf, viewer v
          WHERE rf.restaurant_id = a.restaurant_id AND rf.user_id = v.uid
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.social_feed_feedback ff, viewer v
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
            SELECT 1 FROM public.restaurant_follows rf, viewer v
            WHERE rf.restaurant_id = a.restaurant_id AND rf.user_id = v.uid
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
        OR (
          p.scope = 'saved'
          AND EXISTS (
            SELECT 1 FROM public.social_post_saves saved, viewer v
            WHERE saved.post_id = a.post_id
              AND saved.user_id = v.uid
          )
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
        WHEN weighted.sponsored_weight > 0 THEN row_number() OVER (
          ORDER BY (-ln(greatest(0.000001, weighted.sponsored_random_u)) / greatest(weighted.sponsored_weight, 1)) ASC, weighted.activity_created_at DESC
        )
        ELSE NULL::bigint
      END AS sponsored_slot_rank
    FROM weighted
  ),
  components AS (
    SELECT
      sponsored_ranked.*,
      least(100, greatest(-100,
        COALESCE((SELECT sum(uis.weight) FROM user_interest_signals uis WHERE uis.restaurant_id = sponsored_ranked.restaurant_id), 0)
        + COALESCE((SELECT sum(uis.weight) * 0.65 FROM user_interest_signals uis WHERE uis.cuisine = lower(trim(COALESCE(sponsored_ranked.cuisine_type, ''))) AND uis.cuisine <> ''), 0)
        + COALESCE((SELECT sum(uis.weight) * 0.35 FROM user_interest_signals uis WHERE uis.post_type = COALESCE(sponsored_ranked.post_type, 'annonce')), 0)
        + COALESCE((SELECT ucs.weight FROM user_conversion_signals ucs WHERE ucs.restaurant_id = sponsored_ranked.restaurant_id), 0)
        + CASE WHEN EXISTS (
          SELECT 1 FROM public.restaurant_follows rf, viewer v
          WHERE rf.restaurant_id = sponsored_ranked.restaurant_id AND rf.user_id = v.uid
        ) THEN 35 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1 FROM public.favorites f, viewer v
          WHERE f.restaurant_id = sponsored_ranked.restaurant_id AND f.user_id = v.uid
        ) THEN 30 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1 FROM interacted_restaurants ir WHERE ir.restaurant_id = sponsored_ranked.restaurant_id
        ) THEN 25 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1 FROM preferred_cuisines pc
          WHERE lower(COALESCE(sponsored_ranked.cuisine_type, '')) = ANY (pc.cuisines)
        ) THEN 25 ELSE 0 END
      ))::numeric AS personal_interest_component,
      CASE
        WHEN lower(COALESCE(sponsored_ranked.city, '')) = lower(COALESCE((SELECT city FROM viewer_profile), ''))
          AND COALESCE(sponsored_ranked.city, '') <> ''
          THEN 100::numeric
        WHEN COALESCE((SELECT sum(uis.weight) FROM user_interest_signals uis WHERE uis.city = lower(trim(COALESCE(sponsored_ranked.city, ''))) AND uis.city <> ''), 0) > 0
          THEN least(70, COALESCE((SELECT sum(uis.weight) FROM user_interest_signals uis WHERE uis.city = lower(trim(COALESCE(sponsored_ranked.city, ''))) AND uis.city <> ''), 0))::numeric
        ELSE 0::numeric
      END AS proximity_component,
      least(
        100,
        (
          least(
            25,
            ln(1 + greatest(sponsored_ranked.likes_count, 0)) * 2.2
            + ln(1 + greatest(sponsored_ranked.comments_count, 0)) * 4
            + ln(1 + greatest(sponsored_ranked.reposts_count, 0)) * 5
            + ln(1 + greatest(sponsored_ranked.shares_count, 0)) * 3.2
          ) / 25.0 * 72
        )
        + (
          greatest(0, 32 - (extract(epoch from (now() - sponsored_ranked.activity_created_at)) / 3600.0) * 0.6) / 32.0 * 28
        )
      )::numeric AS engagement_component,
      CASE
        WHEN sponsored_ranked.sponsored_weight > 0
          THEN least(100, greatest(0, 100 - ((sponsored_ranked.sponsored_slot_rank - 1) * 16)))::numeric
        ELSE 0::numeric
      END AS sponsored_component
    FROM sponsored_ranked
  ),
  scored AS (
    SELECT
      components.*,
      (
        0.40 * components.personal_interest_component
        + 0.25 * components.proximity_component
        + 0.20 * components.engagement_component
        + 0.15 * components.sponsored_component
      )::numeric AS computed_score
    FROM components
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
    EXISTS (SELECT 1 FROM public.social_post_likes l, viewer v WHERE l.post_id = diversified.post_id AND l.user_id = v.uid) AS liked_by_me,
    (SELECT l.reaction_type FROM public.social_post_likes l, viewer v WHERE l.post_id = diversified.post_id AND l.user_id = v.uid LIMIT 1) AS my_reaction,
    COALESCE((
      SELECT jsonb_object_agg(reaction_type, reaction_count)
      FROM (
        SELECT l.reaction_type, count(*)::integer AS reaction_count
        FROM public.social_post_likes l
        WHERE l.post_id = diversified.post_id
        GROUP BY l.reaction_type
      ) grouped
    ), '{}'::jsonb) AS reaction_counts,
    EXISTS (SELECT 1 FROM public.restaurant_follows rf, viewer v WHERE rf.restaurant_id = diversified.restaurant_id AND rf.user_id = v.uid) AS followed_by_me,
    EXISTS (SELECT 1 FROM public.social_post_reposts rp, viewer v WHERE rp.post_id = diversified.post_id AND rp.user_id = v.uid AND rp.status = 'published') AS reposted_by_me,
    EXISTS (SELECT 1 FROM public.social_post_saves s, viewer v WHERE s.post_id = diversified.post_id AND s.user_id = v.uid) AS saved_by_me,
    to_jsonb(array_remove(ARRAY[
      CASE WHEN diversified.sponsored_weight > 0 THEN 'Sponsorise' END,
      CASE WHEN diversified.sponsored_weight > 0 THEN 'Budget quotidien et rotation' END,
      CASE WHEN (SELECT scope FROM params) = 'saved' THEN 'Sauvegarde' END,
      CASE WHEN EXISTS (
        SELECT 1 FROM user_interest_signals uis
        WHERE uis.weight >= 20
          AND (
            uis.restaurant_id = diversified.restaurant_id
            OR (uis.cuisine <> '' AND uis.cuisine = lower(trim(COALESCE(diversified.cuisine_type, ''))))
            OR uis.post_type = COALESCE(diversified.post_type, 'annonce')
          )
      ) THEN 'Plus comme ca' END,
      CASE WHEN diversified.personal_interest_component > 0 THEN 'Selon vos gouts' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.restaurant_follows rf, viewer v WHERE rf.restaurant_id = diversified.restaurant_id AND rf.user_id = v.uid) THEN 'Restaurant suivi' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.favorites f, viewer v WHERE f.restaurant_id = diversified.restaurant_id AND f.user_id = v.uid) THEN 'Dans vos favoris' END,
      CASE WHEN EXISTS (SELECT 1 FROM interacted_restaurants ir WHERE ir.restaurant_id = diversified.restaurant_id) THEN 'Deja commande ou reserve' END,
      CASE WHEN EXISTS (SELECT 1 FROM preferred_cuisines pc WHERE lower(COALESCE(diversified.cuisine_type, '')) = ANY (pc.cuisines)) THEN 'Cuisine preferee' END,
      CASE WHEN lower(COALESCE(diversified.city, '')) = lower(COALESCE((SELECT city FROM viewer_profile), '')) AND COALESCE(diversified.city, '') <> '' THEN 'A proximite' END,
      CASE WHEN diversified.post_type = 'promo' OR diversified.cta_type = 'offer' THEN 'Offre en cours' END
    ]::text[], NULL)) AS recommendation_reasons,
    round(diversified.computed_score, 2) AS score,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'postId', m.post_id, 'mediaUrl', m.media_url, 'mediaPath', m.media_path, 'mediaType', m.media_type, 'sortOrder', m.sort_order, 'altText', m.alt_text) ORDER BY m.sort_order ASC)
      FROM public.social_post_media m
      WHERE m.post_id = diversified.post_id
    ), '[]'::jsonb) AS media,
    jsonb_build_object('id', diversified.restaurant_id, 'name', diversified.name, 'imageUrl', diversified.image_url, 'city', diversified.city, 'cuisineType', diversified.cuisine_type) AS restaurant,
    CASE
      WHEN diversified.activity_type = 'repost' THEN jsonb_build_object('id', diversified.repost_id, 'userId', diversified.repost_user_id, 'note', diversified.repost_note, 'createdAt', diversified.repost_created_at, 'authorName', (SELECT p.full_name FROM public.profiles p WHERE p.user_id = diversified.repost_user_id LIMIT 1))
      ELSE NULL::jsonb
    END AS repost,
    diversified.post_type,
    diversified.cta_type,
    diversified.cta_target_id,
    diversified.scheduled_at,
    diversified.pinned_until,
    diversified.visibility
  FROM diversified, params
  WHERE diversified.sponsored_weight > 0
     OR diversified.restaurant_rank <= CASE WHEN params.scope IN ('followed', 'saved') THEN 8 ELSE 3 END
  ORDER BY diversified.computed_score DESC, diversified.activity_created_at DESC
  LIMIT least(greatest(COALESCE(p_limit, 20), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.get_social_feed_v2(integer, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_social_feed_v2(integer, timestamptz, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
