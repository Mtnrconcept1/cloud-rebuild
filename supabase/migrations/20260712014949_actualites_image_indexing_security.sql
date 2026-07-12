-- Secure, zero-paid-by-default image indexing for Actualites and restaurant media.
--
-- The media tables are the source of truth. restaurant_images is now a derived,
-- server-managed search index; browser clients can no longer choose a bucket,
-- storage path, source row, analysis state, or generated metadata.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.restaurant_images
  ADD COLUMN IF NOT EXISTS social_post_media_id uuid,
  ADD COLUMN IF NOT EXISTS restaurant_media_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.restaurant_images'::regclass
      AND conname = 'restaurant_images_social_post_media_id_fkey'
  ) THEN
    ALTER TABLE public.restaurant_images
      ADD CONSTRAINT restaurant_images_social_post_media_id_fkey
      FOREIGN KEY (social_post_media_id)
      REFERENCES public.social_post_media(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.restaurant_images'::regclass
      AND conname = 'restaurant_images_restaurant_media_id_fkey'
  ) THEN
    ALTER TABLE public.restaurant_images
      ADD CONSTRAINT restaurant_images_restaurant_media_id_fkey
      FOREIGN KEY (restaurant_media_id)
      REFERENCES public.restaurant_media(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS social_post_media_media_path_unique_idx
  ON public.social_post_media (media_path)
  WHERE media_path IS NOT NULL AND btrim(media_path) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_media_storage_object_unique_idx
  ON public.restaurant_media (storage_bucket, storage_path)
  WHERE storage_bucket IS NOT NULL
    AND btrim(storage_bucket) <> ''
    AND storage_path IS NOT NULL
    AND btrim(storage_path) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_images_social_post_media_unique_idx
  ON public.restaurant_images (social_post_media_id)
  WHERE social_post_media_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_images_restaurant_media_unique_idx
  ON public.restaurant_images (restaurant_media_id)
  WHERE restaurant_media_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS restaurant_images_social_post_media_completed_idx
  ON public.restaurant_images (social_post_media_id)
  WHERE social_post_media_id IS NOT NULL AND analysis_status = 'completed';

CREATE INDEX IF NOT EXISTS restaurant_images_restaurant_media_completed_idx
  ON public.restaurant_images (restaurant_media_id)
  WHERE restaurant_media_id IS NOT NULL AND analysis_status = 'completed';

CREATE INDEX IF NOT EXISTS social_posts_body_search_vector_idx
  ON public.social_posts
  USING gin (to_tsvector('french'::regconfig, coalesce(body, '')));

CREATE INDEX IF NOT EXISTS social_posts_body_trgm_idx
  ON public.social_posts
  USING gin (lower(body) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS social_post_media_alt_text_trgm_idx
  ON public.social_post_media
  USING gin (lower(coalesce(alt_text, '')) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS restaurants_name_trgm_idx
  ON public.restaurants
  USING gin (lower(name) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS restaurants_city_trgm_idx
  ON public.restaurants
  USING gin (lower(city) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS restaurants_cuisine_type_trgm_idx
  ON public.restaurants
  USING gin (lower(coalesce(cuisine_type, '')) extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.prepare_actualites_media_for_indexing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_post public.social_posts%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_body text;
  v_fallback text;
  v_basename text;
  v_path_changed boolean;
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
      OR NEW.media_type IS DISTINCT FROM OLD.media_type;
  END IF;

  IF v_path_changed THEN
    IF NEW.media_type IN ('image', 'video') THEN
      IF nullif(btrim(NEW.media_path), '') IS NULL THEN
        RAISE EXCEPTION 'social_media_storage_path_required';
      END IF;

      IF NEW.media_path NOT LIKE v_post.restaurant_id::text || '/' || NEW.post_id::text || '/%' THEN
        RAISE EXCEPTION 'social_media_storage_path_invalid';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM storage.objects o
        WHERE o.bucket_id = 'social-post-media'
          AND o.name = NEW.media_path
      ) THEN
        RAISE EXCEPTION 'social_media_storage_object_not_found';
      END IF;
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
    'social-post-media',
    NEW.media_path,
    NEW.media_url,
    'actualites',
    'social_posts',
    NEW.post_id,
    jsonb_build_object(
      'postId', NEW.post_id,
      'mediaId', NEW.id,
      'sortOrder', NEW.sort_order
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

CREATE OR REPLACE FUNCTION public.prepare_restaurant_media_for_indexing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_restaurant public.restaurants%ROWTYPE;
  v_fallback text;
  v_basename text;
  v_storage_changed boolean;
BEGIN
  SELECT *
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restaurant_media_restaurant_not_found';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_storage_changed := true;
  ELSE
    v_storage_changed := NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
      OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
      OR NEW.storage_path IS DISTINCT FROM OLD.storage_path;
  END IF;

  -- Existing `images` rows remain readable during the transition. New or moved
  -- files must use the dedicated bucket and restaurant namespace.
  IF v_storage_changed THEN
    IF NEW.storage_bucket IS DISTINCT FROM 'restaurant-images' THEN
      RAISE EXCEPTION 'restaurant_media_bucket_invalid';
    END IF;

    IF nullif(btrim(NEW.storage_path), '') IS NULL
      OR NEW.storage_path NOT LIKE NEW.restaurant_id::text || '/%'
    THEN
      RAISE EXCEPTION 'restaurant_media_storage_path_invalid';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = 'restaurant-images'
        AND o.name = NEW.storage_path
    ) THEN
      RAISE EXCEPTION 'restaurant_media_storage_object_not_found';
    END IF;
  END IF;

  v_fallback := CASE
    WHEN nullif(btrim(v_restaurant.cuisine_type), '') IS NOT NULL THEN
      format(
        'Photo du restaurant %s, cuisine %s à %s.',
        v_restaurant.name,
        v_restaurant.cuisine_type,
        v_restaurant.city
      )
    ELSE
      format('Photo du restaurant %s à %s.', v_restaurant.name, v_restaurant.city)
  END;

  v_basename := lower(regexp_replace(coalesce(NEW.storage_path, ''), '^.*/', ''));
  IF nullif(btrim(NEW.alt_text), '') IS NULL
    OR lower(btrim(NEW.alt_text)) = v_basename
    OR lower(btrim(NEW.alt_text)) ~ '(^|[/\\])[^/\\]+\.(jpe?g|png|webp|gif|heic|avif)$'
    OR lower(btrim(NEW.alt_text)) ~ '^(img|image|photo|dsc|pxl|screenshot)[-_ ]?[a-z0-9_-]*$'
  THEN
    NEW.alt_text := left(v_fallback, 240);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_restaurant_media_image_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_restaurant public.restaurants%ROWTYPE;
  v_image_id uuid;
  v_description text;
  v_mime_type text;
BEGIN
  IF NEW.media_type NOT IN ('photo', 'image')
    OR nullif(btrim(NEW.storage_bucket), '') IS NULL
    OR nullif(btrim(NEW.storage_path), '') IS NULL
  THEN
    DELETE FROM public.restaurant_images
    WHERE restaurant_media_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restaurant_media_context_missing';
  END IF;

  v_description := left(
    coalesce(
      nullif(btrim(NEW.alt_text), ''),
      format('Photo du restaurant %s à %s.', v_restaurant.name, v_restaurant.city)
    ),
    900
  );
  v_mime_type := CASE
    WHEN lower(NEW.storage_path) ~ '\.png$' THEN 'image/png'
    WHEN lower(NEW.storage_path) ~ '\.webp$' THEN 'image/webp'
    WHEN lower(NEW.storage_path) ~ '\.gif$' THEN 'image/gif'
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
    NEW.restaurant_id,
    NEW.uploaded_by,
    NEW.storage_bucket,
    NEW.storage_path,
    NEW.media_url,
    'restaurant_gallery',
    'restaurant_media',
    NEW.id,
    jsonb_build_object('restaurantMediaId', NEW.id, 'position', NEW.position),
    regexp_replace(NEW.storage_path, '^.*/', ''),
    v_mime_type,
    'completed',
    NULL,
    v_description,
    left(v_description, 180),
    NEW.alt_text,
    left(v_restaurant.name || ' — Photos du restaurant', 90),
    left(v_description, 180),
    CASE
      WHEN nullif(btrim(v_restaurant.cuisine_type), '') IS NULL THEN '{}'::text[]
      ELSE ARRAY[v_restaurant.cuisine_type]
    END,
    'restaurant',
    0,
    jsonb_build_object(
      'provider', 'contextual',
      'model', 'tok-contextual-metadata-v1',
      'generated_by', 'database_trigger',
      'generated_at', now(),
      'visual_analysis_completed', false,
      'visual_analysis_available_via', jsonb_build_array('ollama')
    ),
    now(),
    NULL,
    NEW.id
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
    social_post_media_id = NULL,
    restaurant_media_id = EXCLUDED.restaurant_media_id,
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

  IF NEW.storage_bucket = 'restaurant-images' THEN
    INSERT INTO public.image_analysis_jobs (image_id, status)
    VALUES (v_image_id, 'queued')
    ON CONFLICT (image_id) DO NOTHING;
  ELSE
    -- Historical `images` objects remain contextually searchable but are not
    -- claimed by the strict worker, which only accepts restaurant-images.
    INSERT INTO public.image_analysis_jobs (image_id, status, completed_at)
    VALUES (v_image_id, 'completed', now())
    ON CONFLICT (image_id) DO UPDATE
    SET
      status = 'completed',
      locked_at = NULL,
      locked_by = NULL,
      error = NULL,
      completed_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_actualites_media_for_indexing_on_write
  ON public.social_post_media;
CREATE TRIGGER prepare_actualites_media_for_indexing_on_write
BEFORE INSERT OR UPDATE OF post_id, media_path, media_type, alt_text
ON public.social_post_media
FOR EACH ROW
EXECUTE FUNCTION public.prepare_actualites_media_for_indexing();

DROP TRIGGER IF EXISTS sync_actualites_media_image_index_on_write
  ON public.social_post_media;
CREATE TRIGGER sync_actualites_media_image_index_on_write
AFTER INSERT OR UPDATE OF post_id, media_url, media_path, media_type, sort_order, alt_text
ON public.social_post_media
FOR EACH ROW
EXECUTE FUNCTION public.sync_actualites_media_image_index();

DROP TRIGGER IF EXISTS prepare_restaurant_media_for_indexing_on_write
  ON public.restaurant_media;
CREATE TRIGGER prepare_restaurant_media_for_indexing_on_write
BEFORE INSERT OR UPDATE OF restaurant_id, storage_bucket, storage_path, alt_text
ON public.restaurant_media
FOR EACH ROW
EXECUTE FUNCTION public.prepare_restaurant_media_for_indexing();

DROP TRIGGER IF EXISTS sync_restaurant_media_image_index_on_write
  ON public.restaurant_media;
CREATE TRIGGER sync_restaurant_media_image_index_on_write
AFTER INSERT OR UPDATE OF restaurant_id, media_url, media_type, alt_text, position, uploaded_by, storage_bucket, storage_path
ON public.restaurant_media
FOR EACH ROW
EXECUTE FUNCTION public.sync_restaurant_media_image_index();

-- Re-run the preparation/synchronisation triggers to backfill historical rows.
-- This replaces filename-only alt text with contextual, readable sentences.
UPDATE public.social_post_media
SET alt_text = alt_text
WHERE media_type = 'image';

UPDATE public.restaurant_media
SET alt_text = alt_text
WHERE media_type IN ('photo', 'image');

-- Quarantine legacy rows that claimed to be Actualites/gallery data but cannot
-- be tied to a real source row. They are never exposed as published media.
UPDATE public.restaurant_images
SET
  source_type = 'other',
  source_table = NULL,
  source_id = NULL,
  source_context = '{}'::jsonb,
  analysis_status = 'failed',
  analysis_error = 'unverified_legacy_source'
WHERE source_type = 'actualites'
  AND social_post_media_id IS NULL;

UPDATE public.restaurant_images
SET
  source_type = 'other',
  source_table = NULL,
  source_id = NULL,
  source_context = '{}'::jsonb,
  analysis_status = 'failed',
  analysis_error = 'unverified_legacy_source'
WHERE source_type = 'restaurant_gallery'
  AND restaurant_media_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.restaurant_images'::regclass
      AND conname = 'restaurant_images_single_source_check'
  ) THEN
    ALTER TABLE public.restaurant_images
      ADD CONSTRAINT restaurant_images_single_source_check
      CHECK (num_nonnulls(social_post_media_id, restaurant_media_id) <= 1)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.restaurant_images'::regclass
      AND conname = 'restaurant_images_actualites_source_check'
  ) THEN
    ALTER TABLE public.restaurant_images
      ADD CONSTRAINT restaurant_images_actualites_source_check
      CHECK (
        source_type <> 'actualites'
        OR (
          social_post_media_id IS NOT NULL
          AND restaurant_media_id IS NULL
          AND bucket = 'social-post-media'
          AND source_table = 'social_posts'
          AND source_id IS NOT NULL
        )
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.restaurant_images'::regclass
      AND conname = 'restaurant_images_gallery_source_check'
  ) THEN
    ALTER TABLE public.restaurant_images
      ADD CONSTRAINT restaurant_images_gallery_source_check
      CHECK (
        source_type <> 'restaurant_gallery'
        OR (
          restaurant_media_id IS NOT NULL
          AND social_post_media_id IS NULL
          AND source_table = 'restaurant_media'
          AND source_id = restaurant_media_id
        )
      )
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.restaurant_images
  VALIDATE CONSTRAINT restaurant_images_social_post_media_id_fkey;
ALTER TABLE public.restaurant_images
  VALIDATE CONSTRAINT restaurant_images_restaurant_media_id_fkey;
ALTER TABLE public.restaurant_images
  VALIDATE CONSTRAINT restaurant_images_single_source_check;
ALTER TABLE public.restaurant_images
  VALIDATE CONSTRAINT restaurant_images_actualites_source_check;
ALTER TABLE public.restaurant_images
  VALIDATE CONSTRAINT restaurant_images_gallery_source_check;

CREATE OR REPLACE FUNCTION public.guard_restaurant_image_client_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'restaurant_images_are_server_managed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_restaurant_image_client_writes_on_write
  ON public.restaurant_images;
CREATE TRIGGER guard_restaurant_image_client_writes_on_write
BEFORE INSERT OR UPDATE
ON public.restaurant_images
FOR EACH ROW
EXECUTE FUNCTION public.guard_restaurant_image_client_writes();

-- Contextual rows are useful immediately without any paid API. A queued job is
-- retained so a self-hosted Ollama worker can enrich
-- them later. Recover stale pre-migration jobs without touching valid analyses.
UPDATE public.image_analysis_jobs j
SET
  status = 'queued',
  attempts = 0,
  locked_at = NULL,
  locked_by = NULL,
  error = NULL,
  completed_at = NULL
FROM public.restaurant_images i
WHERE i.id = j.image_id
  AND coalesce(i.ai_metadata ->> 'provider', 'contextual') = 'contextual'
  AND j.status IN ('processing', 'failed');

CREATE OR REPLACE FUNCTION public.claim_image_analysis_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  job_id uuid,
  image_id uuid,
  restaurant_id uuid,
  bucket text,
  storage_path text,
  public_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  RETURN QUERY
  WITH selected_jobs AS (
    SELECT j.id
    FROM public.image_analysis_jobs j
    JOIN public.restaurant_images i ON i.id = j.image_id
    WHERE j.attempts < j.max_attempts
      AND (
        j.status = 'queued'
        OR (j.status = 'processing' AND j.locked_at < now() - interval '15 minutes')
      )
      AND (
        i.analysis_status IN ('pending', 'processing', 'failed')
        OR (
          i.analysis_status = 'completed'
          AND coalesce(i.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        )
      )
    ORDER BY j.created_at ASC
    LIMIT least(greatest(coalesce(p_limit, 5), 1), 25)
    FOR UPDATE OF j SKIP LOCKED
  ),
  updated_jobs AS (
    UPDATE public.image_analysis_jobs j
    SET
      status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = nullif(left(btrim(p_worker_id), 180), ''),
      error = NULL,
      completed_at = NULL
    FROM selected_jobs sj
    WHERE j.id = sj.id
    RETURNING j.id, j.image_id
  ),
  updated_images AS (
    UPDATE public.restaurant_images i
    SET
      analysis_status = CASE
        WHEN coalesce(i.ai_metadata ->> 'provider', 'contextual') = 'contextual'
          THEN 'completed'
        ELSE 'processing'
      END,
      analysis_attempts = i.analysis_attempts + 1,
      analysis_error = CASE
        WHEN coalesce(i.ai_metadata ->> 'provider', 'contextual') = 'contextual'
          THEN i.analysis_error
        ELSE NULL
      END
    FROM updated_jobs uj
    WHERE i.id = uj.image_id
    RETURNING i.id, i.restaurant_id, i.bucket, i.storage_path, i.public_url
  )
  SELECT
    uj.id,
    ui.id,
    ui.restaurant_id,
    ui.bucket,
    ui.storage_path,
    ui.public_url
  FROM updated_jobs uj
  JOIN updated_images ui ON ui.id = uj.image_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_image_analysis_job_by_image_id(
  p_worker_id text,
  p_image_id uuid
)
RETURNS TABLE (
  job_id uuid,
  image_id uuid,
  restaurant_id uuid,
  bucket text,
  storage_path text,
  public_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  RETURN QUERY
  WITH selected_job AS (
    SELECT j.id
    FROM public.image_analysis_jobs j
    JOIN public.restaurant_images i ON i.id = j.image_id
    WHERE j.image_id = p_image_id
      AND j.attempts < j.max_attempts
      AND (
        j.status = 'queued'
        OR (j.status = 'processing' AND j.locked_at < now() - interval '15 minutes')
      )
      AND (
        i.analysis_status IN ('pending', 'processing', 'failed')
        OR (
          i.analysis_status = 'completed'
          AND coalesce(i.ai_metadata ->> 'provider', 'contextual') = 'contextual'
        )
      )
    ORDER BY j.created_at ASC
    LIMIT 1
    FOR UPDATE OF j SKIP LOCKED
  ),
  updated_jobs AS (
    UPDATE public.image_analysis_jobs j
    SET
      status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = nullif(left(btrim(p_worker_id), 180), ''),
      error = NULL,
      completed_at = NULL
    FROM selected_job sj
    WHERE j.id = sj.id
    RETURNING j.id, j.image_id
  ),
  updated_images AS (
    UPDATE public.restaurant_images i
    SET
      analysis_status = CASE
        WHEN coalesce(i.ai_metadata ->> 'provider', 'contextual') = 'contextual'
          THEN 'completed'
        ELSE 'processing'
      END,
      analysis_attempts = i.analysis_attempts + 1,
      analysis_error = CASE
        WHEN coalesce(i.ai_metadata ->> 'provider', 'contextual') = 'contextual'
          THEN i.analysis_error
        ELSE NULL
      END
    FROM updated_jobs uj
    WHERE i.id = uj.image_id
    RETURNING i.id, i.restaurant_id, i.bucket, i.storage_path, i.public_url
  )
  SELECT
    uj.id,
    ui.id,
    ui.restaurant_id,
    ui.bucket,
    ui.storage_path,
    ui.public_url
  FROM updated_jobs uj
  JOIN updated_images ui ON ui.id = uj.image_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_image_analysis_job(
  p_job_id uuid,
  p_image_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.image_analysis_jobs%ROWTYPE;
  v_image public.restaurant_images%ROWTYPE;
  v_terminal boolean;
  v_contextual boolean;
  v_row_count integer;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  SELECT *
  INTO v_job
  FROM public.image_analysis_jobs
  WHERE id = p_job_id
    AND image_id = p_image_id
  FOR UPDATE;

  IF NOT FOUND OR v_job.status = 'completed' THEN
    RETURN;
  END IF;

  IF v_job.status <> 'processing' THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_image
  FROM public.restaurant_images
  WHERE id = p_image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restaurant_image_not_found';
  END IF;

  v_terminal := v_job.attempts >= v_job.max_attempts;
  v_contextual := coalesce(v_image.ai_metadata ->> 'provider', 'contextual') = 'contextual';

  UPDATE public.image_analysis_jobs
  SET
    status = CASE WHEN v_terminal THEN 'failed' ELSE 'queued' END,
    error = left(coalesce(p_error, 'image_analysis_failed'), 2000),
    locked_at = NULL,
    locked_by = NULL,
    completed_at = NULL
  WHERE id = p_job_id
    AND image_id = p_image_id
    AND status = 'processing';

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'image_analysis_job_failure_update_failed';
  END IF;

  UPDATE public.restaurant_images
  SET
    analysis_status = CASE
      WHEN v_contextual THEN 'completed'
      WHEN v_terminal THEN 'failed'
      ELSE 'pending'
    END,
    analysis_error = left(coalesce(p_error, 'image_analysis_failed'), 2000)
  WHERE id = p_image_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'restaurant_image_failure_update_failed';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.complete_image_analysis_job(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  numeric,
  jsonb,
  extensions.vector
);

CREATE FUNCTION public.complete_image_analysis_job(
  p_job_id uuid,
  p_image_id uuid,
  p_description text,
  p_short_description text,
  p_alt_text text,
  p_seo_title text,
  p_seo_description text,
  p_detected_objects text[],
  p_food_items text[],
  p_ingredients text[],
  p_cuisine_types text[],
  p_moods text[],
  p_colors text[],
  p_hashtags text[],
  p_image_type text,
  p_is_food_photo boolean,
  p_has_people boolean,
  p_has_logo boolean,
  p_has_text boolean,
  p_quality_score numeric,
  p_ai_metadata jsonb,
  p_embedding extensions.vector
)
RETURNS TABLE (
  completed_image_id uuid,
  completed_media_id uuid,
  completion_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_job public.image_analysis_jobs%ROWTYPE;
  v_image public.restaurant_images%ROWTYPE;
  v_social_media public.social_post_media%ROWTYPE;
  v_restaurant_media public.restaurant_media%ROWTYPE;
  v_social_post public.social_posts%ROWTYPE;
  v_alt_text text;
  v_provider text;
  v_model text;
  v_row_count integer;
  v_media_id uuid;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  SELECT *
  INTO v_job
  FROM public.image_analysis_jobs
  WHERE id = p_job_id
    AND image_id = p_image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'image_analysis_job_not_found';
  END IF;

  SELECT *
  INTO v_image
  FROM public.restaurant_images
  WHERE id = p_image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restaurant_image_not_found';
  END IF;

  v_media_id := coalesce(v_image.social_post_media_id, v_image.restaurant_media_id);

  IF v_job.status = 'completed' AND v_image.analysis_status = 'completed' THEN
    RETURN QUERY SELECT v_image.id, v_media_id, 'already_completed'::text;
    RETURN;
  END IF;

  IF v_job.status <> 'processing' THEN
    RAISE EXCEPTION 'image_analysis_job_not_processing';
  END IF;

  IF v_image.social_post_media_id IS NOT NULL THEN
    SELECT *
    INTO v_social_media
    FROM public.social_post_media
    WHERE id = v_image.social_post_media_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'social_post_media_not_found';
    END IF;

    SELECT *
    INTO v_social_post
    FROM public.social_posts
    WHERE id = v_social_media.post_id;

    IF NOT FOUND
      OR v_image.bucket <> 'social-post-media'
      OR v_image.storage_path IS DISTINCT FROM v_social_media.media_path
      OR v_image.restaurant_id IS DISTINCT FROM v_social_post.restaurant_id
      OR v_image.source_id IS DISTINCT FROM v_social_media.post_id
    THEN
      RAISE EXCEPTION 'social_post_media_identity_mismatch';
    END IF;
  ELSIF v_image.restaurant_media_id IS NOT NULL THEN
    SELECT *
    INTO v_restaurant_media
    FROM public.restaurant_media
    WHERE id = v_image.restaurant_media_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_image.bucket IS DISTINCT FROM v_restaurant_media.storage_bucket
      OR v_image.storage_path IS DISTINCT FROM v_restaurant_media.storage_path
      OR v_image.restaurant_id IS DISTINCT FROM v_restaurant_media.restaurant_id
      OR v_image.source_id IS DISTINCT FROM v_restaurant_media.id
    THEN
      RAISE EXCEPTION 'restaurant_media_identity_mismatch';
    END IF;
  ELSE
    RAISE EXCEPTION 'verified_media_source_required';
  END IF;

  v_alt_text := coalesce(
    nullif(btrim(coalesce(p_alt_text, '')), ''),
    nullif(v_social_media.alt_text, ''),
    nullif(v_restaurant_media.alt_text, ''),
    'Photo du restaurant'
  );
  v_alt_text := regexp_replace(v_alt_text, '#[[:alnum:]_]+', ' ', 'g');
  v_alt_text := left(
    coalesce(nullif(regexp_replace(btrim(v_alt_text), '\s+', ' ', 'g'), ''), 'Photo du restaurant'),
    260
  );
  v_provider := left(coalesce(nullif(p_ai_metadata ->> 'provider', ''), 'unknown'), 60);
  v_model := left(coalesce(nullif(p_ai_metadata ->> 'model', ''), 'unknown'), 120);

  UPDATE public.restaurant_images
  SET
    analysis_status = 'completed',
    analysis_error = NULL,
    description = left(coalesce(p_description, ''), 900),
    short_description = left(coalesce(p_short_description, ''), 180),
    alt_text = v_alt_text,
    seo_title = left(coalesce(p_seo_title, ''), 90),
    seo_description = left(coalesce(p_seo_description, ''), 180),
    detected_objects = coalesce(p_detected_objects, '{}'),
    food_items = coalesce(p_food_items, '{}'),
    ingredients = coalesce(p_ingredients, '{}'),
    cuisine_types = coalesce(p_cuisine_types, '{}'),
    moods = coalesce(p_moods, '{}'),
    colors = coalesce(p_colors, '{}'),
    hashtags = coalesce(p_hashtags, '{}'),
    image_type = left(coalesce(p_image_type, 'autre'), 60),
    is_food_photo = coalesce(p_is_food_photo, false),
    has_people = coalesce(p_has_people, false),
    has_logo = coalesce(p_has_logo, false),
    has_text = coalesce(p_has_text, false),
    quality_score = least(greatest(coalesce(p_quality_score, 0), 0), 10),
    ai_metadata = coalesce(p_ai_metadata, '{}'::jsonb)
      || jsonb_build_object('provider', v_provider, 'model', v_model),
    embedding = p_embedding,
    processed_at = now()
  WHERE id = p_image_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'restaurant_image_completion_failed';
  END IF;

  IF v_image.social_post_media_id IS NOT NULL THEN
    UPDATE public.social_post_media
    SET
      alt_text = v_alt_text,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'image_analysis',
        jsonb_strip_nulls(jsonb_build_object(
          'restaurant_image_id', p_image_id,
          'provider', v_provider,
          'model', v_model,
          'analyzed_at', now(),
          'description', left(coalesce(p_description, ''), 900),
          'seo_title', left(coalesce(p_seo_title, ''), 90),
          'seo_description', left(coalesce(p_seo_description, ''), 180),
          'food_items', coalesce(p_food_items, '{}'),
          'ingredients', coalesce(p_ingredients, '{}'),
          'cuisine_types', coalesce(p_cuisine_types, '{}'),
          'detected_objects', coalesce(p_detected_objects, '{}'),
          'quality_score', least(greatest(coalesce(p_quality_score, 0), 0), 10)
        ))
      )
    WHERE id = v_image.social_post_media_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION 'social_post_media_completion_failed';
    END IF;
  ELSE
    UPDATE public.restaurant_media
    SET
      alt_text = v_alt_text,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'image_analysis',
        jsonb_strip_nulls(jsonb_build_object(
          'restaurant_image_id', p_image_id,
          'provider', v_provider,
          'model', v_model,
          'analyzed_at', now(),
          'description', left(coalesce(p_description, ''), 900),
          'seo_title', left(coalesce(p_seo_title, ''), 90),
          'seo_description', left(coalesce(p_seo_description, ''), 180),
          'food_items', coalesce(p_food_items, '{}'),
          'ingredients', coalesce(p_ingredients, '{}'),
          'cuisine_types', coalesce(p_cuisine_types, '{}'),
          'detected_objects', coalesce(p_detected_objects, '{}'),
          'quality_score', least(greatest(coalesce(p_quality_score, 0), 0), 10)
        ))
      )
    WHERE id = v_image.restaurant_media_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION 'restaurant_media_completion_failed';
    END IF;
  END IF;

  UPDATE public.image_analysis_jobs
  SET
    status = 'completed',
    completed_at = now(),
    locked_at = NULL,
    locked_by = NULL,
    error = NULL
  WHERE id = p_job_id
    AND image_id = p_image_id
    AND status = 'processing';

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'image_analysis_job_completion_failed';
  END IF;

  RETURN QUERY SELECT p_image_id, v_media_id, 'completed'::text;
END;
$$;

DROP FUNCTION IF EXISTS public.search_restaurant_images(text, uuid, integer, integer);

CREATE FUNCTION public.search_restaurant_images(
  p_query text,
  p_restaurant_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
  social_post_media_id uuid,
  restaurant_media_id uuid,
  source_id uuid,
  public_url text,
  storage_path text,
  description text,
  alt_text text,
  seo_title text,
  seo_description text,
  detected_objects text[],
  food_items text[],
  ingredients text[],
  cuisine_types text[],
  moods text[],
  hashtags text[],
  image_type text,
  quality_score numeric,
  rank real,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_query text := nullif(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g'), '');
  v_tsquery tsquery;
BEGIN
  IF v_query IS NOT NULL THEN
    v_tsquery := websearch_to_tsquery('french', extensions.unaccent(v_query));
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.restaurant_id,
    i.social_post_media_id,
    i.restaurant_media_id,
    i.source_id,
    i.public_url,
    i.storage_path,
    i.description,
    i.alt_text,
    i.seo_title,
    i.seo_description,
    i.detected_objects,
    i.food_items,
    i.ingredients,
    i.cuisine_types,
    i.moods,
    i.hashtags,
    i.image_type,
    i.quality_score,
    CASE
      WHEN v_tsquery IS NULL THEN 0::real
      ELSE (
        ts_rank_cd(i.search_vector, v_tsquery)
        + similarity(
          lower(extensions.unaccent(i.search_text)),
          lower(extensions.unaccent(v_query))
        ) * 0.25
      )::real
    END,
    i.created_at
  FROM public.restaurant_images i
  WHERE i.analysis_status = 'completed'
    AND (p_restaurant_id IS NULL OR i.restaurant_id = p_restaurant_id)
    AND (
      v_query IS NULL
      OR i.search_vector @@ v_tsquery
      OR strpos(
        lower(extensions.unaccent(i.search_text)),
        lower(extensions.unaccent(v_query))
      ) > 0
      OR similarity(
        lower(extensions.unaccent(i.search_text)),
        lower(extensions.unaccent(v_query))
      ) >= 0.18
    )
  ORDER BY 20 DESC, i.quality_score DESC NULLS LAST, i.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.search_actualites_posts(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  post_id uuid,
  rank real,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_query text := nullif(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g'), '');
  v_query_unaccented text;
  v_tsquery tsquery;
BEGIN
  IF v_query IS NOT NULL THEN
    v_query_unaccented := lower(extensions.unaccent(v_query));
    v_tsquery := websearch_to_tsquery('french', v_query_unaccented);
  END IF;

  RETURN QUERY
  WITH visible_posts AS (
    SELECT
      p.id,
      p.body,
      p.post_type,
      p.published_at,
      p.created_at,
      r.name AS restaurant_name,
      r.city AS restaurant_city,
      r.cuisine_type,
      concat_ws(
        ' ',
        p.body,
        p.post_type,
        r.name,
        r.city,
        r.cuisine_type
      ) AS post_search_text
    FROM public.social_posts p
    JOIN public.restaurants r ON r.id = p.restaurant_id
    WHERE p.status = 'published'
      AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
      AND (p.published_at IS NULL OR p.published_at <= now())
      AND p.visibility = 'public'
  ),
  scored AS (
    SELECT
      vp.id,
      vp.published_at,
      vp.created_at,
      CASE
        WHEN v_tsquery IS NULL THEN 0::real
        ELSE (
          ts_rank_cd(
            to_tsvector('french', extensions.unaccent(vp.post_search_text)),
            v_tsquery
          ) * 2.0
          + coalesce(media.media_rank, 0) * 1.5
          + greatest(
            similarity(
              lower(extensions.unaccent(vp.body)),
              v_query_unaccented
            ),
            similarity(
              lower(extensions.unaccent(vp.restaurant_name)),
              v_query_unaccented
            ),
            similarity(
              lower(extensions.unaccent(coalesce(vp.cuisine_type, ''))),
              v_query_unaccented
            ),
            similarity(
              lower(extensions.unaccent(vp.restaurant_city)),
              v_query_unaccented
            )
          ) * 0.6
        )::real
      END AS search_rank,
      media.media_matches
    FROM visible_posts vp
    LEFT JOIN LATERAL (
      SELECT
        bool_or(
          v_tsquery IS NOT NULL
          AND (
            i.search_vector @@ v_tsquery
            OR strpos(lower(extensions.unaccent(i.search_text)), v_query_unaccented) > 0
            OR strpos(lower(extensions.unaccent(coalesce(m.alt_text, ''))), v_query_unaccented) > 0
          )
        ) AS media_matches,
        max(
          CASE
            WHEN v_tsquery IS NULL THEN 0::real
            ELSE (
              ts_rank_cd(i.search_vector, v_tsquery)
              + similarity(
                lower(extensions.unaccent(i.search_text)),
                v_query_unaccented
              ) * 0.25
            )::real
          END
        ) AS media_rank
      FROM public.social_post_media m
      LEFT JOIN public.restaurant_images i
        ON i.social_post_media_id = m.id
       AND i.analysis_status = 'completed'
      WHERE m.post_id = vp.id
    ) media ON true
    WHERE v_query IS NULL
      OR to_tsvector('french', extensions.unaccent(vp.post_search_text)) @@ v_tsquery
      OR strpos(lower(extensions.unaccent(vp.post_search_text)), v_query_unaccented) > 0
      OR similarity(lower(extensions.unaccent(vp.body)), v_query_unaccented) >= 0.18
      OR similarity(lower(extensions.unaccent(vp.restaurant_name)), v_query_unaccented) >= 0.22
      OR similarity(lower(extensions.unaccent(coalesce(vp.cuisine_type, ''))), v_query_unaccented) >= 0.22
      OR similarity(lower(extensions.unaccent(vp.restaurant_city)), v_query_unaccented) >= 0.22
      OR coalesce(media.media_matches, false)
  ),
  counted AS (
    SELECT
      s.id,
      s.search_rank,
      s.published_at,
      s.created_at,
      count(*) OVER () AS match_count
    FROM scored s
  )
  SELECT c.id, c.search_rank, c.match_count
  FROM counted c
  ORDER BY c.search_rank DESC, c.published_at DESC NULLS LAST, c.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

-- Restrict public reads to media belonging to currently published public posts.
DROP POLICY IF EXISTS "restaurant_images_public_completed_select"
  ON public.restaurant_images;
DROP POLICY IF EXISTS "restaurant_images_owner_insert"
  ON public.restaurant_images;
DROP POLICY IF EXISTS "restaurant_images_owner_update"
  ON public.restaurant_images;
DROP POLICY IF EXISTS "restaurant_images_owner_delete"
  ON public.restaurant_images;
DROP POLICY IF EXISTS "restaurant_images_public_actualites_select"
  ON public.restaurant_images;
DROP POLICY IF EXISTS "restaurant_images_authenticated_select"
  ON public.restaurant_images;

CREATE POLICY "restaurant_images_public_actualites_select"
ON public.restaurant_images
FOR SELECT
TO anon
USING (
  analysis_status = 'completed'
  AND social_post_media_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.social_post_media m
    JOIN public.social_posts p ON p.id = m.post_id
    WHERE m.id = restaurant_images.social_post_media_id
      AND p.status = 'published'
      AND p.visibility = 'public'
      AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
      AND (p.published_at IS NULL OR p.published_at <= now())
  )
);

CREATE POLICY "restaurant_images_authenticated_select"
ON public.restaurant_images
FOR SELECT
TO authenticated
USING (
  public.auth_is_admin()
  OR public.auth_owns_restaurant(restaurant_id)
  OR (
    analysis_status = 'completed'
    AND restaurant_media_id IS NOT NULL
  )
  OR (
    analysis_status = 'completed'
    AND social_post_media_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.social_post_media m
      JOIN public.social_posts p ON p.id = m.post_id
      WHERE m.id = restaurant_images.social_post_media_id
        AND p.status = 'published'
        AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
        AND (p.published_at IS NULL OR p.published_at <= now())
        AND (
          p.visibility = 'public'
          OR (
            p.visibility = 'followers'
            AND EXISTS (
              SELECT 1
              FROM public.restaurant_follows rf
              WHERE rf.restaurant_id = p.restaurant_id
                AND rf.user_id = (SELECT auth.uid())
            )
          )
        )
    )
  )
);

DROP POLICY IF EXISTS "social_media_select" ON public.social_post_media;
DROP POLICY IF EXISTS "social_media_public_select" ON public.social_post_media;
DROP POLICY IF EXISTS "social_media_authenticated_select" ON public.social_post_media;

CREATE POLICY "social_media_public_select"
ON public.social_post_media
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.social_posts p
    WHERE p.id = social_post_media.post_id
      AND p.status = 'published'
      AND p.visibility = 'public'
      AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
      AND (p.published_at IS NULL OR p.published_at <= now())
  )
);

CREATE POLICY "social_media_authenticated_select"
ON public.social_post_media
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.social_posts p
    WHERE p.id = social_post_media.post_id
      AND (
        public.auth_is_admin()
        OR public.auth_owns_restaurant(p.restaurant_id)
        OR (
          p.status = 'published'
          AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
          AND (p.published_at IS NULL OR p.published_at <= now())
          AND (
            p.visibility = 'public'
            OR (
              p.visibility = 'followers'
              AND EXISTS (
                SELECT 1
                FROM public.restaurant_follows rf
                WHERE rf.restaurant_id = p.restaurant_id
                  AND rf.user_id = (SELECT auth.uid())
              )
            )
          )
        )
      )
  )
);

-- restaurant_images is a derived index. Source table triggers and service-role
-- workers are the only writers.
REVOKE ALL ON TABLE public.restaurant_images FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.restaurant_images TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.restaurant_images TO service_role;

REVOKE ALL ON FUNCTION public.prepare_actualites_media_for_indexing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_actualites_media_image_index() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_restaurant_media_for_indexing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_restaurant_media_image_index() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_restaurant_image_client_writes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_image_analysis_jobs(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_image_analysis_job_by_image_id(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_image_analysis_job(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_image_analysis_job(uuid, uuid, text, text, text, text, text, text[], text[], text[], text[], text[], text[], text[], text, boolean, boolean, boolean, boolean, numeric, jsonb, extensions.vector) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_restaurant_images(text, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_actualites_posts(text, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_image_analysis_jobs(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_image_analysis_job_by_image_id(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_image_analysis_job(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_image_analysis_job(uuid, uuid, text, text, text, text, text, text[], text[], text[], text[], text[], text[], text[], text, boolean, boolean, boolean, boolean, numeric, jsonb, extensions.vector) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_restaurant_images(text, uuid, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_actualites_posts(text, integer, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
