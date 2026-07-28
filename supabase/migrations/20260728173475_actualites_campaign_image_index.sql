-- The contextual image index must trust both verified daily-dish assets and
-- verified campaign images prepared by prepare_actualites_media_for_indexing.
-- This migration intentionally runs before the sponsored-media backfill.
CREATE OR REPLACE FUNCTION public.sync_actualites_media_image_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
  v_source text;
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

  v_source := coalesce(NEW.metadata ->> 'source', '');
  v_storage_bucket := CASE
    WHEN coalesce(NEW.metadata ->> 'trusted_asset', '') = 'true'
      AND v_source IN ('daily_dish_ai', 'campaign_image')
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
      'campaign_id', nullif(NEW.metadata ->> 'campaign_id', ''),
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
$function$;
