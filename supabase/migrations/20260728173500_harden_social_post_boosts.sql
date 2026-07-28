-- Guarantee that every paid Actualites boost is renderable, actionable and has
-- a non-empty audience. This database-level guard covers all current and future
-- callers, including Edge Functions, dashboards and administrative tools.

CREATE OR REPLACE FUNCTION public.ensure_social_post_boost_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_campaign public.ad_campaigns%ROWTYPE;
  v_post public.social_posts%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_original_targeting jsonb;
  v_effective_targeting jsonb;
  v_fallback_targeting jsonb;
  v_estimated_audience integer := 0;
  v_fallback_audience integer := 0;
  v_image_url text;
  v_cta_type text;
  v_journey_types jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_campaign
  FROM public.ad_campaigns
  WHERE id = NEW.campaign_id
  FOR UPDATE;

  SELECT * INTO v_post
  FROM public.social_posts
  WHERE id = NEW.post_id
  FOR UPDATE;

  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF v_campaign.id IS NULL OR v_post.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'social_post_boost_invalid_reference';
  END IF;

  IF v_campaign.restaurant_id IS DISTINCT FROM NEW.restaurant_id
    OR v_post.restaurant_id IS DISTINCT FROM NEW.restaurant_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'social_post_boost_restaurant_mismatch';
  END IF;

  -- Keep one canonical, normalized targeting payload on both records.
  v_original_targeting := public.normalize_campaign_target_criteria(
    COALESCE(NEW.targeting, v_campaign.target_criteria, '{}'::jsonb)
  );
  v_effective_targeting := v_original_targeting;

  BEGIN
    v_estimated_audience := public.estimate_campaign_audience(
      NEW.restaurant_id,
      v_effective_targeting
    );
  EXCEPTION WHEN OTHERS THEN
    -- Campaign creation must not fail solely because estimation data is
    -- temporarily unavailable. The broad fallback below remains deterministic.
    v_estimated_audience := 0;
  END;

  IF COALESCE(v_estimated_audience, 0) <= 0 THEN
    -- First fallback: preserve geographic intent while removing behavioural
    -- intersections that commonly make a small local audience impossible.
    v_fallback_targeting := v_effective_targeting
      - 'cuisines'
      - 'journeyTypes'
      - 'serviceMoments'
      - 'favoritesOnly'
      - 'minAvgBasket'
      - 'minOrders'
      - 'maxDaysSinceOrder'
      - 'customerSegment';

    v_fallback_targeting := jsonb_set(v_fallback_targeting, '{cuisines}', '[]'::jsonb, true);
    v_fallback_targeting := jsonb_set(v_fallback_targeting, '{journeyTypes}', '[]'::jsonb, true);
    v_fallback_targeting := jsonb_set(v_fallback_targeting, '{serviceMoments}', '[]'::jsonb, true);
    v_fallback_targeting := jsonb_set(v_fallback_targeting, '{favoritesOnly}', 'false'::jsonb, true);
    v_fallback_targeting := jsonb_set(v_fallback_targeting, '{minAvgBasket}', '0'::jsonb, true);
    v_fallback_targeting := jsonb_set(v_fallback_targeting, '{minOrders}', '0'::jsonb, true);
    v_fallback_targeting := jsonb_set(v_fallback_targeting, '{customerSegment}', '"all"'::jsonb, true);

    BEGIN
      v_fallback_audience := public.estimate_campaign_audience(
        NEW.restaurant_id,
        v_fallback_targeting
      );
    EXCEPTION WHEN OTHERS THEN
      v_fallback_audience := 0;
    END;

    IF COALESCE(v_fallback_audience, 0) <= 0 THEN
      -- Final fallback: broad Actualites delivery. Paid content must never burn
      -- its entire schedule with zero eligible viewers.
      v_fallback_targeting := jsonb_set(v_fallback_targeting, '{cities}', '[]'::jsonb, true);
    END IF;

    v_effective_targeting := v_fallback_targeting
      || jsonb_build_object(
        'autoBroadened', true,
        'autoBroadenedAt', now(),
        'originalCriteria', v_original_targeting,
        'originalEstimatedAudience', COALESCE(v_estimated_audience, 0),
        'fallbackEstimatedAudience', COALESCE(v_fallback_audience, 0)
      );
  END IF;

  UPDATE public.ad_campaigns
  SET target_criteria = v_effective_targeting,
      updated_at = now()
  WHERE id = NEW.campaign_id;

  NEW.targeting := v_effective_targeting;

  -- A campaign image must also exist in the social media relation consumed by
  -- the Actualites UI. Prefer the campaign creative, then the restaurant image.
  v_image_url := NULLIF(trim(COALESCE(v_campaign.image_url, v_restaurant.image_url, '')), '');
  IF v_image_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.social_post_media media
      WHERE media.post_id = NEW.post_id
        AND media.media_type = 'image'
    ) THEN
    INSERT INTO public.social_post_media (
      post_id,
      media_url,
      media_path,
      media_type,
      sort_order,
      alt_text,
      metadata
    ) VALUES (
      NEW.post_id,
      v_image_url,
      NULL,
      'image',
      0,
      COALESCE(NULLIF(trim(v_campaign.title), ''), 'Publication sponsorisee')
        || ' - ' || COALESCE(NULLIF(trim(v_restaurant.name), ''), 'Restaurant'),
      jsonb_build_object(
        'source', 'social_post_boost_integrity',
        'campaign_id', NEW.campaign_id,
        'auto_attached', true
      )
    );
  END IF;

  -- A sponsored post must expose a measurable action. Preserve an existing CTA;
  -- otherwise prefer reservation when requested, then fall back to the menu.
  IF COALESCE(NULLIF(trim(v_post.cta_type), ''), 'none') = 'none' THEN
    v_journey_types := CASE
      WHEN jsonb_typeof(v_original_targeting->'journeyTypes') = 'array'
        THEN v_original_targeting->'journeyTypes'
      ELSE '[]'::jsonb
    END;

    v_cta_type := CASE
      WHEN v_journey_types ? 'reservation' THEN 'reserve'
      WHEN v_journey_types ? 'delivery' OR v_journey_types ? 'takeaway' THEN 'order'
      ELSE 'menu'
    END;

    UPDATE public.social_posts
    SET cta_type = v_cta_type,
        cta_target_id = COALESCE(cta_target_id, NEW.restaurant_id),
        updated_at = now()
    WHERE id = NEW.post_id;
  ELSIF v_post.cta_target_id IS NULL THEN
    UPDATE public.social_posts
    SET cta_target_id = NEW.restaurant_id,
        updated_at = now()
    WHERE id = NEW.post_id;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_social_post_boost_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_social_post_boost_integrity() TO service_role;

DROP TRIGGER IF EXISTS trg_ensure_social_post_boost_integrity
  ON public.social_post_promotions;

CREATE TRIGGER trg_ensure_social_post_boost_integrity
BEFORE INSERT OR UPDATE OF campaign_id, post_id, restaurant_id, targeting
ON public.social_post_promotions
FOR EACH ROW
EXECUTE FUNCTION public.ensure_social_post_boost_integrity();

-- Repair already-active boosts using the same invariant without charging again.
UPDATE public.social_post_promotions
SET targeting = targeting
WHERE status = 'active'
  AND starts_at <= now()
  AND ends_at >= now();
