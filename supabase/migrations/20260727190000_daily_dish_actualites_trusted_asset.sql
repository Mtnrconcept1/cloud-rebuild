-- Fix publication of a generated daily-dish photo into Actualités without
-- weakening the storage namespace checks applied to ordinary browser uploads.
--
-- Regular media must still live in social-post-media/<restaurant>/<post>/...
-- A daily-dish image may reference the stable public gallery copy only when
-- the server-created ai_generated_assets row proves the exact bucket, path,
-- URL, restaurant and author.

BEGIN;

ALTER TABLE public.restaurant_images
  DROP CONSTRAINT IF EXISTS restaurant_images_actualites_source_check;

ALTER TABLE public.restaurant_images
  ADD CONSTRAINT restaurant_images_actualites_source_check
  CHECK (
    source_type <> 'actualites'
    OR (
      social_post_media_id IS NOT NULL
      AND restaurant_media_id IS NULL
      AND bucket = ANY (ARRAY['social-post-media'::text, 'images'::text])
      AND source_table = 'social_posts'
      AND source_id IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.prepare_actualites_media_for_indexing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_post public.social_posts%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_asset public.ai_generated_assets%ROWTYPE;
  v_body text;
  v_fallback text;
  v_basename text;
  v_path_changed boolean;
  v_trusted_daily_dish boolean;
  v_asset_id_text text;
  v_storage_bucket text;
  v_asset_path text;
  v_asset_url text;
BEGIN
  SELECT *
  INTO v_post
  FROM public.social_posts
  WHERE id = NEW.post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_post_not_found';
  END IF;

  SELECT *
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = v_post.restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_post_restaurant_not_found';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_path_changed := true;
  ELSE
    v_path_changed := NEW.post_id IS DISTINCT FROM OLD.post_id
      OR NEW.media_path IS DISTINCT FROM OLD.media_path
      OR NEW.media_type IS DISTINCT FROM OLD.media_type
      OR NEW.media_url IS DISTINCT FROM OLD.media_url
      OR NEW.metadata IS DISTINCT FROM OLD.metadata;
  END IF;

  IF v_path_changed AND NEW.media_type IN ('image', 'video') THEN
    IF nullif(btrim(NEW.media_path), '') IS NULL THEN
      RAISE EXCEPTION 'social_media_storage_path_required';
    END IF;

    v_trusted_daily_dish := NEW.media_type = 'image'
      AND coalesce(NEW.metadata ->> 'source', '') = 'daily_dish_ai';

    IF v_trusted_daily_dish THEN
      v_asset_id_text := nullif(btrim(NEW.metadata ->> 'asset_id'), '');
      IF v_asset_id_text IS NULL
        OR v_asset_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'daily_dish_media_asset_invalid';
      END IF;

      SELECT *
      INTO v_asset
      FROM public.ai_generated_assets asset
      WHERE asset.id = v_asset_id_text::uuid
        AND asset.restaurant_id = v_post.restaurant_id
        AND asset.user_id = v_post.author_id
        AND asset.status IN ('generated', 'stored')
        AND (
          asset.asset_type = 'menu_visual'
          OR coalesce(asset.metadata ->> 'tool', '') = 'menu_photo'
        )
      FOR SHARE;

      IF v_asset.id IS NULL THEN
        RAISE EXCEPTION 'daily_dish_media_asset_not_found';
      END IF;

      v_storage_bucket := nullif(btrim(v_asset.metadata ->> 'gallery_storage_bucket'), '');
      v_asset_path := nullif(btrim(v_asset.metadata ->> 'gallery_storage_path'), '');
      v_asset_url := nullif(btrim(v_asset.metadata ->> 'gallery_image_url'), '');

      -- Public posts may only reuse the stable gallery copy. The private
      -- ai-generated-assets object and signed URLs are deliberately rejected.
      IF v_storage_bucket IS DISTINCT FROM 'images'
        OR v_asset_path IS NULL
        OR v_asset_url IS NULL
      THEN
        RAISE EXCEPTION 'daily_dish_media_gallery_unavailable';
      END IF;

      IF NEW.media_path IS DISTINCT FROM v_asset_path
        OR NEW.media_url IS DISTINCT FROM v_asset_url
      THEN
        RAISE EXCEPTION 'daily_dish_media_asset_mismatch';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM storage.objects object
        WHERE object.bucket_id = v_storage_bucket
          AND object.name = v_asset_path
      ) THEN
        RAISE EXCEPTION 'daily_dish_media_storage_object_not_found';
      END IF;

      NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source', 'daily_dish_ai',
          'asset_id', v_asset.id,
          'storage_bucket', v_storage_bucket,
          'trusted_asset', true
        );
    ELSE
      IF NEW.media_path NOT LIKE v_post.restaurant_id::text || '/' || NEW.post_id::text || '/%' THEN
        RAISE EXCEPTION 'social_media_storage_path_invalid';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM storage.objects object
        WHERE object.bucket_id = 'social-post-media'
          AND object.name = NEW.media_path
      ) THEN
        RAISE EXCEPTION 'social_media_storage_object_not_found';
      END IF;

      -- Never let browser metadata select another bucket. Only the verified
      -- daily-dish branch above can mark an external gallery object trusted.
      NEW.metadata := (
        coalesce(NEW.metadata, '{}'::jsonb)
        - 'storage_bucket'
        - 'trusted_asset'
      ) || jsonb_build_object(
        'storage_bucket', 'social-post-media',
        'trusted_asset', false
      );
    END IF;
  END IF;

  -- Keep hashtags in the post/search document, never in accessibility text.
  v_body := regexp_replace(coalesce(v_post.body, ''), '#[[:alnum:]_]+', ' ', 'g');
  v_body := regexp_replace(btrim(v_body), '\s+', ' ', 'g');
  v_fallback := CASE
    WHEN v_body <> '' THEN
      format('Photo publiée par %s : %s', v_restaurant.name, left(v_body, 170))
    WHEN nullif(btrim(v_restaurant.cuisine_type), '') IS NOT NULL THEN
      format(
        'Photo publiée par %s, restaurant de cuisine %s à %s.',
        v_restaurant.name,
        v_restaurant.cuisine_type,
        v_restaurant.city
      )
    ELSE
      format('Photo publiée par le restaurant %s à %s.', v_restaurant.name, v_restaurant.city)
  END;

  v_basename := lower(regexp_replace(coalesce(NEW.media_path, ''), '^.*/', ''));

  IF NEW.media_type = 'image' AND (
    nullif(btrim(NEW.alt_text), '') IS NULL
    OR lower(btrim(NEW.alt_text)) = v_basename
    OR lower(btrim(NEW.alt_text)) ~ '(^|[/\\])[^/\\]+\.(jpe?g|png|webp|gif|heic|avif)$'
    OR lower(btrim(NEW.alt_text)) ~ '^(img|image|photo|dsc|pxl|screenshot)[-_ ]?[a-z0-9_-]*$'
  ) THEN
    NEW.alt_text := left(v_fallback, 240);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_actualites_media_image_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_post public.social_posts%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_image_id uuid;
  v_description text;
  v_short_description text;
  v_seo_title text;
  v_seo_description text;
  v_image_type text;
  v_mime_type text;
  v_storage_bucket text;
BEGIN
  IF NEW.media_type <> 'image' OR nullif(btrim(NEW.media_path), '') IS NULL THEN
    DELETE FROM public.restaurant_images
    WHERE social_post_media_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_post
  FROM public.social_posts
  WHERE id = NEW.post_id;

  SELECT *
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = v_post.restaurant_id;

  IF v_post.id IS NULL OR v_restaurant.id IS NULL THEN
    RAISE EXCEPTION 'actualites_image_context_missing';
  END IF;

  v_storage_bucket := CASE
    WHEN coalesce(NEW.metadata ->> 'source', '') = 'daily_dish_ai'
      AND coalesce(NEW.metadata ->> 'trusted_asset', '') = 'true'
      THEN nullif(btrim(NEW.metadata ->> 'storage_bucket'), '')
    ELSE 'social-post-media'
  END;

  IF v_storage_bucket NOT IN ('social-post-media', 'images') THEN
    RAISE EXCEPTION 'actualites_image_bucket_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects object
    WHERE object.bucket_id = v_storage_bucket
      AND object.name = NEW.media_path
  ) THEN
    RAISE EXCEPTION 'actualites_image_storage_object_not_found';
  END IF;

  v_description := regexp_replace(btrim(coalesce(v_post.body, '')), '\s+', ' ', 'g');
  IF v_description = '' THEN
    v_description := left(coalesce(NEW.alt_text, format('Photo de %s', v_restaurant.name)), 900);
  END IF;

  v_short_description := left(v_description, 180);
  v_seo_title := left(
    concat_ws(
      ' — ',
      v_restaurant.name,
      CASE v_post.post_type
        WHEN 'plat' THEN 'Nouveau plat'
        WHEN 'promo' THEN 'Offre du restaurant'
        WHEN 'evenement' THEN 'Événement'
        WHEN 'coulisses' THEN 'Dans les coulisses'
        ELSE 'Actualité'
      END
    ),
    90
  );
  v_seo_description := left(v_description, 180);
  v_image_type := CASE v_post.post_type
    WHEN 'plat' THEN 'plat'
    WHEN 'promo' THEN 'promotion'
    WHEN 'evenement' THEN 'ambiance'
    WHEN 'coulisses' THEN 'ambiance'
    ELSE 'restaurant'
  END;
  v_mime_type := CASE
    WHEN lower(NEW.media_path) ~ '\.png$' THEN 'image/png'
    WHEN lower(NEW.media_path) ~ '\.webp$' THEN 'image/webp'
    WHEN lower(NEW.media_path) ~ '\.gif$' THEN 'image/gif'
    ELSE 'image/jpeg'
  END;

  INSERT INTO public.restaurant_images (
    restaurant_id,
    uploaded_by,
    bucket,
    storage_path,
    public_url,
    source_type,
    source_table,
    source_id,
    source_context,
    original_filename,
    mime_type,
    analysis_status,
    analysis_error,
    description,
    short_description,
    alt_text,
    seo_title,
    seo_description,
    cuisine_types,
    image_type,
    quality_score,
    ai_metadata,
    processed_at,
    social_post_media_id,
    restaurant_media_id
  )
  VALUES (
    v_post.restaurant_id,
    v_post.author_id,
    v_storage_bucket,
    NEW.media_path,
    NEW.media_url,
    'actualites',
    'social_posts',
    NEW.post_id,
    jsonb_build_object(
      'postId', NEW.post_id,
      'mediaId', NEW.id,
      'sortOrder', NEW.sort_order,
      'storageBucket', v_storage_bucket
    ),
    regexp_replace(NEW.media_path, '^.*/', ''),
    v_mime_type,
    'completed',
    NULL,
    v_description,
    v_short_description,
    NEW.alt_text,
    v_seo_title,
    v_seo_description,
    CASE
      WHEN nullif(btrim(v_restaurant.cuisine_type), '') IS NULL THEN '{}'::text[]
      ELSE ARRAY[v_restaurant.cuisine_type]
    END,
    v_image_type,
    0,
    jsonb_build_object(
      'provider', 'contextual',
      'model', 'tok-contextual-metadata-v1',
      'generated_by', 'database_trigger',
      'generated_at', now(),
      'storage_bucket', v_storage_bucket,
      'source', coalesce(NEW.metadata ->> 'source', 'social_post_media'),
      'asset_id', nullif(NEW.metadata ->> 'asset_id', ''),
      'visual_analysis_completed', false,
      'visual_analysis_available_via', jsonb_build_array('ollama')
    ),
    now(),
    NEW.id,
    NULL
  )
  ON CONFLICT (bucket, storage_path) DO UPDATE
  SET
    restaurant_id = EXCLUDED.restaurant_id,
    uploaded_by = EXCLUDED.uploaded_by,
    public_url = EXCLUDED.public_url,
    source_type = EXCLUDED.source_type,
    source_table = EXCLUDED.source_table,
    source_id = EXCLUDED.source_id,
    source_context = EXCLUDED.source_context,
    original_filename = EXCLUDED.original_filename,
    mime_type = EXCLUDED.mime_type,
    social_post_media_id = EXCLUDED.social_post_media_id,
    restaurant_media_id = NULL,
    analysis_status = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN 'completed'
      ELSE public.restaurant_images.analysis_status
    END,
    analysis_error = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN NULL
      ELSE public.restaurant_images.analysis_error
    END,
    description = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN EXCLUDED.description
      ELSE public.restaurant_images.description
    END,
    short_description = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN EXCLUDED.short_description
      ELSE public.restaurant_images.short_description
    END,
    alt_text = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN EXCLUDED.alt_text
      ELSE public.restaurant_images.alt_text
    END,
    seo_title = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN EXCLUDED.seo_title
      ELSE public.restaurant_images.seo_title
    END,
    seo_description = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN EXCLUDED.seo_description
      ELSE public.restaurant_images.seo_description
    END,
    cuisine_types = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN EXCLUDED.cuisine_types
      ELSE public.restaurant_images.cuisine_types
    END,
    image_type = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN EXCLUDED.image_type
      ELSE public.restaurant_images.image_type
    END,
    quality_score = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN EXCLUDED.quality_score
      ELSE public.restaurant_images.quality_score
    END,
    ai_metadata = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN EXCLUDED.ai_metadata
      ELSE public.restaurant_images.ai_metadata
    END,
    processed_at = CASE
      WHEN coalesce(public.restaurant_images.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        THEN now()
      ELSE public.restaurant_images.processed_at
    END
  RETURNING id INTO v_image_id;

  INSERT INTO public.image_analysis_jobs (image_id, status)
  VALUES (v_image_id, 'queued')
  ON CONFLICT (image_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prepare_actualites_media_for_indexing() IS
  'Validates ordinary Actualités uploads in social-post-media and permits only exact, server-proven daily-dish gallery assets from the public images bucket.';

COMMENT ON FUNCTION public.sync_actualites_media_image_index() IS
  'Indexes Actualités media using the storage bucket validated by prepare_actualites_media_for_indexing.';

COMMIT;
