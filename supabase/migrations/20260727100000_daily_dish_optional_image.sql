-- Allow publishing a daily dish without a PhotoPro image.
-- Non-destructive: only relaxes NOT NULL constraints and updates the
-- publish function to handle the no-image path.

BEGIN;

ALTER TABLE public.restaurant_daily_dishes
  ALTER COLUMN image_url DROP NOT NULL,
  ALTER COLUMN ai_generated_asset_id DROP NOT NULL;

ALTER TABLE public.restaurant_daily_dishes
  DROP CONSTRAINT IF EXISTS restaurant_daily_dishes_image_url_check;

ALTER TABLE public.restaurant_daily_dishes
  ADD CONSTRAINT restaurant_daily_dishes_image_url_check
    CHECK (image_url IS NULL OR char_length(image_url) BETWEEN 10 AND 2048);

CREATE OR REPLACE FUNCTION public.publish_restaurant_daily_dish(
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_variant_id uuid,
  p_asset_id uuid,
  p_price_cents integer,
  p_description text,
  p_publish_actualite boolean,
  p_actualite_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_variant public.restaurant_daily_dish_variants%ROWTYPE;
  v_run public.restaurant_daily_dish_runs%ROWTYPE;
  v_asset public.ai_generated_assets%ROWTYPE;
  v_dish public.restaurant_daily_dishes%ROWTYPE;
  v_post_id uuid;
  v_name text;
  v_image_url text;
  v_media_path text;
  v_resolved_asset_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_restaurant_id IS NULL OR p_actor_user_id IS NULL OR p_variant_id IS NULL
     OR p_price_cents NOT BETWEEN 100 AND 1000000
     OR char_length(btrim(COALESCE(p_description, ''))) NOT BETWEEN 2 AND 1200
     OR (COALESCE(p_publish_actualite, false)
       AND char_length(btrim(COALESCE(p_actualite_body, ''))) NOT BETWEEN 2 AND 4000) THEN
    RAISE EXCEPTION 'invalid daily dish publication' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('daily-dish-publish:' || p_restaurant_id::text, 0)
  );

  SELECT * INTO v_variant
  FROM public.restaurant_daily_dish_variants variant
  WHERE variant.id = p_variant_id
    AND variant.restaurant_id = p_restaurant_id
  FOR UPDATE;
  IF v_variant.id IS NULL THEN
    RAISE EXCEPTION 'daily dish variant not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_run
  FROM public.restaurant_daily_dish_runs run
  WHERE run.id = v_variant.run_id
    AND run.restaurant_id = p_restaurant_id
    AND run.status = 'completed'
  FOR UPDATE;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'daily dish run is not publishable' USING ERRCODE = '55000';
  END IF;

  v_name := left(btrim(COALESCE(v_variant.payload->>'name', '')), 120);

  IF p_asset_id IS NOT NULL THEN
    SELECT * INTO v_asset
    FROM public.ai_generated_assets asset
    WHERE asset.id = p_asset_id
      AND asset.restaurant_id = p_restaurant_id
      AND asset.user_id = p_actor_user_id
      AND asset.status IN ('generated', 'stored')
    FOR SHARE;
    IF v_asset.id IS NULL THEN
      RAISE EXCEPTION 'PhotoPro asset not found' USING ERRCODE = '42501';
    END IF;

    v_image_url := COALESCE(
      NULLIF(v_asset.metadata->>'gallery_image_url', ''),
      NULLIF(v_asset.asset_url, '')
    );
    v_media_path := COALESCE(
      NULLIF(v_asset.metadata->>'gallery_storage_path', ''),
      NULLIF(v_asset.storage_path, '')
    );
    v_resolved_asset_id := v_asset.id;

    IF char_length(v_name) < 2 OR char_length(COALESCE(v_image_url, '')) NOT BETWEEN 10 AND 2048 THEN
      RAISE EXCEPTION 'daily dish publication asset invalid' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_image_url := NULL;
    v_media_path := NULL;
    v_resolved_asset_id := NULL;

    IF char_length(v_name) < 2 THEN
      RAISE EXCEPTION 'daily dish publication name invalid' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.restaurant_daily_dishes
  SET status = 'archived'
  WHERE restaurant_id = p_restaurant_id
    AND status = 'active'
    AND service_date <> v_run.generation_date;

  INSERT INTO public.restaurant_daily_dishes (
    restaurant_id, service_date, variant_id, name, description, price_cents,
    image_url, ai_generated_asset_id, status, published_by, published_at
  ) VALUES (
    p_restaurant_id, v_run.generation_date, v_variant.id, v_name,
    btrim(p_description), p_price_cents, v_image_url, v_resolved_asset_id, 'active',
    p_actor_user_id, now()
  )
  ON CONFLICT (restaurant_id, service_date) DO UPDATE
  SET variant_id = EXCLUDED.variant_id,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      price_cents = EXCLUDED.price_cents,
      image_url = EXCLUDED.image_url,
      ai_generated_asset_id = EXCLUDED.ai_generated_asset_id,
      status = 'active',
      published_by = EXCLUDED.published_by,
      published_at = now()
  RETURNING * INTO v_dish;

  UPDATE public.restaurant_daily_dish_variants
  SET status = CASE WHEN id = v_variant.id THEN 'published' ELSE 'archived' END
  WHERE run_id = v_variant.run_id;

  IF COALESCE(p_publish_actualite, false) THEN
    v_post_id := v_dish.actualites_post_id;
    IF v_post_id IS NULL THEN
      INSERT INTO public.social_posts (
        restaurant_id, author_id, body, status, post_type, cta_type,
        visibility, campaign_goal, campaign_name, audience_segment, published_at
      ) VALUES (
        p_restaurant_id, p_actor_user_id, btrim(p_actualite_body), 'published',
        'annonce', 'none', 'public', 'awareness', 'Plat du jour IA', 'local', now()
      ) RETURNING id INTO v_post_id;

      IF v_image_url IS NOT NULL THEN
        INSERT INTO public.social_post_media (
          post_id, media_url, media_path, media_type, sort_order, alt_text, metadata
        ) VALUES (
          v_post_id, v_image_url, v_media_path, 'image', 0,
          'Plat du jour : ' || v_name,
          jsonb_build_object('source', 'daily_dish_ai', 'asset_id', v_resolved_asset_id)
        );
      END IF;
    ELSE
      UPDATE public.social_posts
      SET body = btrim(p_actualite_body), status = 'published', published_at = now(), updated_at = now()
      WHERE id = v_post_id AND restaurant_id = p_restaurant_id;
      DELETE FROM public.social_post_media WHERE post_id = v_post_id;
      IF v_image_url IS NOT NULL THEN
        INSERT INTO public.social_post_media (
          post_id, media_url, media_path, media_type, sort_order, alt_text, metadata
        ) VALUES (
          v_post_id, v_image_url, v_media_path, 'image', 0,
          'Plat du jour : ' || v_name,
          jsonb_build_object('source', 'daily_dish_ai', 'asset_id', v_resolved_asset_id)
        );
      END IF;
    END IF;
    UPDATE public.restaurant_daily_dishes SET actualites_post_id = v_post_id WHERE id = v_dish.id;
  END IF;

  RETURN jsonb_build_object(
    'dish_id', v_dish.id,
    'post_id', v_post_id,
    'service_date', v_run.generation_date,
    'image_url', v_image_url
  );
END
$$;

COMMIT;
