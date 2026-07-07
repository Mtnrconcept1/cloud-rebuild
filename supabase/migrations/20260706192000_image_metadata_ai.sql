CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'restaurant-images',
  'restaurant-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.restaurant_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  uploaded_by uuid,
  bucket text NOT NULL DEFAULT 'restaurant-images',
  storage_path text NOT NULL,
  public_url text,
  source_type text NOT NULL DEFAULT 'restaurant_gallery'
    CHECK (source_type IN ('restaurant_gallery', 'actualites', 'marketing', 'other')),
  source_table text,
  source_id uuid,
  source_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  original_filename text,
  mime_type text,
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  analysis_status text NOT NULL DEFAULT 'pending'
    CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')),
  analysis_error text,
  analysis_attempts integer NOT NULL DEFAULT 0 CHECK (analysis_attempts >= 0),
  description text,
  short_description text,
  alt_text text,
  seo_title text,
  seo_description text,
  detected_objects text[] NOT NULL DEFAULT '{}',
  food_items text[] NOT NULL DEFAULT '{}',
  ingredients text[] NOT NULL DEFAULT '{}',
  cuisine_types text[] NOT NULL DEFAULT '{}',
  moods text[] NOT NULL DEFAULT '{}',
  colors text[] NOT NULL DEFAULT '{}',
  hashtags text[] NOT NULL DEFAULT '{}',
  image_type text,
  is_food_photo boolean DEFAULT false,
  has_people boolean DEFAULT false,
  has_logo boolean DEFAULT false,
  has_text boolean DEFAULT false,
  quality_score numeric(4,2) CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 10),
  ai_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_text text NOT NULL DEFAULT '',
  search_vector tsvector NOT NULL DEFAULT ''::tsvector,
  embedding extensions.vector(384),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (bucket, storage_path)
);

CREATE TABLE IF NOT EXISTS public.image_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.restaurant_images(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  locked_at timestamptz,
  locked_by text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (image_id)
);

CREATE INDEX IF NOT EXISTS restaurant_images_restaurant_id_idx
ON public.restaurant_images (restaurant_id);

CREATE INDEX IF NOT EXISTS restaurant_images_analysis_status_idx
ON public.restaurant_images (analysis_status);

CREATE INDEX IF NOT EXISTS restaurant_images_created_at_idx
ON public.restaurant_images (created_at DESC);

CREATE INDEX IF NOT EXISTS restaurant_images_source_idx
ON public.restaurant_images (source_type, source_id);

CREATE INDEX IF NOT EXISTS restaurant_images_search_vector_idx
ON public.restaurant_images USING gin (search_vector);

CREATE INDEX IF NOT EXISTS restaurant_images_detected_objects_idx
ON public.restaurant_images USING gin (detected_objects);

CREATE INDEX IF NOT EXISTS restaurant_images_food_items_idx
ON public.restaurant_images USING gin (food_items);

CREATE INDEX IF NOT EXISTS restaurant_images_ingredients_idx
ON public.restaurant_images USING gin (ingredients);

CREATE INDEX IF NOT EXISTS restaurant_images_hashtags_idx
ON public.restaurant_images USING gin (hashtags);

CREATE INDEX IF NOT EXISTS restaurant_images_ai_metadata_idx
ON public.restaurant_images USING gin (ai_metadata);

CREATE INDEX IF NOT EXISTS restaurant_images_embedding_hnsw_idx
ON public.restaurant_images
USING hnsw (embedding extensions.vector_cosine_ops)
WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS image_analysis_jobs_status_created_idx
ON public.image_analysis_jobs (status, created_at);

DROP TRIGGER IF EXISTS set_restaurant_images_updated_at ON public.restaurant_images;
CREATE TRIGGER set_restaurant_images_updated_at
BEFORE UPDATE ON public.restaurant_images
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_image_analysis_jobs_updated_at ON public.image_analysis_jobs;
CREATE TRIGGER set_image_analysis_jobs_updated_at
BEFORE UPDATE ON public.image_analysis_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.update_restaurant_images_search_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_text := trim(
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.short_description, '') || ' ' ||
    coalesce(NEW.alt_text, '') || ' ' ||
    coalesce(NEW.seo_title, '') || ' ' ||
    coalesce(NEW.seo_description, '') || ' ' ||
    array_to_string(coalesce(NEW.detected_objects, '{}'), ' ') || ' ' ||
    array_to_string(coalesce(NEW.food_items, '{}'), ' ') || ' ' ||
    array_to_string(coalesce(NEW.ingredients, '{}'), ' ') || ' ' ||
    array_to_string(coalesce(NEW.cuisine_types, '{}'), ' ') || ' ' ||
    array_to_string(coalesce(NEW.moods, '{}'), ' ') || ' ' ||
    array_to_string(coalesce(NEW.colors, '{}'), ' ') || ' ' ||
    array_to_string(coalesce(NEW.hashtags, '{}'), ' ') || ' ' ||
    coalesce(NEW.image_type, '')
  );

  NEW.search_vector :=
    setweight(to_tsvector('french', coalesce(NEW.seo_title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW.alt_text, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(NEW.seo_description, '')), 'B') ||
    setweight(to_tsvector('french', array_to_string(coalesce(NEW.food_items, '{}'), ' ')), 'A') ||
    setweight(to_tsvector('french', array_to_string(coalesce(NEW.ingredients, '{}'), ' ')), 'A') ||
    setweight(to_tsvector('french', array_to_string(coalesce(NEW.detected_objects, '{}'), ' ')), 'C') ||
    setweight(to_tsvector('french', array_to_string(coalesce(NEW.cuisine_types, '{}'), ' ')), 'B') ||
    setweight(to_tsvector('french', array_to_string(coalesce(NEW.moods, '{}'), ' ')), 'C') ||
    setweight(to_tsvector('french', array_to_string(coalesce(NEW.hashtags, '{}'), ' ')), 'C');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_restaurant_images_search_fields_on_change ON public.restaurant_images;
CREATE TRIGGER update_restaurant_images_search_fields_on_change
BEFORE INSERT OR UPDATE OF
  description,
  short_description,
  alt_text,
  seo_title,
  seo_description,
  detected_objects,
  food_items,
  ingredients,
  cuisine_types,
  moods,
  colors,
  hashtags,
  image_type
ON public.restaurant_images
FOR EACH ROW
EXECUTE FUNCTION public.update_restaurant_images_search_fields();

CREATE OR REPLACE FUNCTION public.enqueue_image_analysis_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.image_analysis_jobs (image_id)
  VALUES (NEW.id)
  ON CONFLICT (image_id) DO UPDATE
  SET
    status = 'queued',
    attempts = 0,
    locked_at = NULL,
    locked_by = NULL,
    error = NULL,
    completed_at = NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_image_analysis_job_on_insert ON public.restaurant_images;
CREATE TRIGGER enqueue_image_analysis_job_on_insert
AFTER INSERT ON public.restaurant_images
FOR EACH ROW
WHEN (NEW.analysis_status = 'pending')
EXECUTE FUNCTION public.enqueue_image_analysis_job();

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
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
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
      AND i.analysis_status IN ('pending', 'processing', 'failed')
    ORDER BY j.created_at ASC
    LIMIT least(greatest(coalesce(p_limit, 5), 1), 25)
    FOR UPDATE SKIP LOCKED
  ),
  updated_jobs AS (
    UPDATE public.image_analysis_jobs j
    SET
      status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      error = NULL
    FROM selected_jobs sj
    WHERE j.id = sj.id
    RETURNING j.id, j.image_id
  ),
  updated_images AS (
    UPDATE public.restaurant_images i
    SET
      analysis_status = 'processing',
      analysis_attempts = i.analysis_attempts + 1,
      analysis_error = NULL
    FROM updated_jobs uj
    WHERE i.id = uj.image_id
    RETURNING i.id, i.restaurant_id, i.bucket, i.storage_path, i.public_url
  )
  SELECT
    uj.id AS job_id,
    ui.id AS image_id,
    ui.restaurant_id,
    ui.bucket,
    ui.storage_path,
    ui.public_url
  FROM updated_jobs uj
  JOIN updated_images ui ON ui.id = uj.image_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_image_analysis_job(
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
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  UPDATE public.restaurant_images
  SET
    analysis_status = 'completed',
    analysis_error = NULL,
    description = p_description,
    short_description = p_short_description,
    alt_text = p_alt_text,
    seo_title = p_seo_title,
    seo_description = p_seo_description,
    detected_objects = coalesce(p_detected_objects, '{}'),
    food_items = coalesce(p_food_items, '{}'),
    ingredients = coalesce(p_ingredients, '{}'),
    cuisine_types = coalesce(p_cuisine_types, '{}'),
    moods = coalesce(p_moods, '{}'),
    colors = coalesce(p_colors, '{}'),
    hashtags = coalesce(p_hashtags, '{}'),
    image_type = p_image_type,
    is_food_photo = coalesce(p_is_food_photo, false),
    has_people = coalesce(p_has_people, false),
    has_logo = coalesce(p_has_logo, false),
    has_text = coalesce(p_has_text, false),
    quality_score = least(greatest(coalesce(p_quality_score, 0), 0), 10),
    ai_metadata = coalesce(p_ai_metadata, '{}'::jsonb),
    embedding = p_embedding,
    processed_at = now()
  WHERE id = p_image_id;

  UPDATE public.image_analysis_jobs
  SET
    status = 'completed',
    completed_at = now(),
    locked_at = NULL,
    locked_by = NULL,
    error = NULL
  WHERE id = p_job_id
    AND image_id = p_image_id;
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
SET search_path = public
AS $$
DECLARE
  v_attempts integer;
  v_max_attempts integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  SELECT attempts, max_attempts
  INTO v_attempts, v_max_attempts
  FROM public.image_analysis_jobs
  WHERE id = p_job_id
    AND image_id = p_image_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_attempts >= v_max_attempts THEN
    UPDATE public.image_analysis_jobs
    SET status = 'failed', error = left(p_error, 2000), locked_at = NULL, locked_by = NULL
    WHERE id = p_job_id;

    UPDATE public.restaurant_images
    SET analysis_status = 'failed', analysis_error = left(p_error, 2000)
    WHERE id = p_image_id;
  ELSE
    UPDATE public.image_analysis_jobs
    SET status = 'queued', error = left(p_error, 2000), locked_at = NULL, locked_by = NULL
    WHERE id = p_job_id;

    UPDATE public.restaurant_images
    SET analysis_status = 'pending', analysis_error = left(p_error, 2000)
    WHERE id = p_image_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_restaurant_images(
  p_query text,
  p_restaurant_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
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
SET search_path = public
AS $$
DECLARE
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_tsquery tsquery;
BEGIN
  IF v_query IS NOT NULL THEN
    v_tsquery := websearch_to_tsquery('french', v_query);
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.restaurant_id,
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
    CASE WHEN v_tsquery IS NULL THEN 0 ELSE ts_rank(i.search_vector, v_tsquery) END AS rank,
    i.created_at
  FROM public.restaurant_images i
  WHERE i.analysis_status = 'completed'
    AND (p_restaurant_id IS NULL OR i.restaurant_id = p_restaurant_id)
    AND (
      v_query IS NULL
      OR i.search_vector @@ v_tsquery
      OR i.search_text ILIKE '%' || v_query || '%'
    )
  ORDER BY
    CASE WHEN v_tsquery IS NULL THEN 0 ELSE ts_rank(i.search_vector, v_tsquery) END DESC,
    i.quality_score DESC NULLS LAST,
    i.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.match_restaurant_images(
  p_embedding extensions.vector,
  p_match_threshold float DEFAULT 0.65,
  p_match_count integer DEFAULT 30,
  p_restaurant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
  public_url text,
  storage_path text,
  description text,
  alt_text text,
  seo_title text,
  food_items text[],
  ingredients text[],
  cuisine_types text[],
  hashtags text[],
  similarity float
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT
    i.id,
    i.restaurant_id,
    i.public_url,
    i.storage_path,
    i.description,
    i.alt_text,
    i.seo_title,
    i.food_items,
    i.ingredients,
    i.cuisine_types,
    i.hashtags,
    1 - (i.embedding <=> p_embedding) AS similarity
  FROM public.restaurant_images i
  WHERE i.analysis_status = 'completed'
    AND i.embedding IS NOT NULL
    AND (p_restaurant_id IS NULL OR i.restaurant_id = p_restaurant_id)
    AND i.embedding <=> p_embedding < 1 - p_match_threshold
  ORDER BY i.embedding <=> p_embedding ASC
  LIMIT least(greatest(coalesce(p_match_count, 30), 1), 100);
$$;

ALTER TABLE public.restaurant_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_analysis_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_images_public_completed_select" ON public.restaurant_images;
CREATE POLICY "restaurant_images_public_completed_select"
ON public.restaurant_images
FOR SELECT
USING (
  analysis_status = 'completed'
  OR public.auth_owns_restaurant(restaurant_id)
  OR public.auth_is_admin()
);

DROP POLICY IF EXISTS "restaurant_images_owner_insert" ON public.restaurant_images;
CREATE POLICY "restaurant_images_owner_insert"
ON public.restaurant_images
FOR INSERT
TO authenticated
WITH CHECK (
  (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin())
  AND (uploaded_by IS NULL OR uploaded_by = auth.uid() OR public.auth_is_admin())
);

DROP POLICY IF EXISTS "restaurant_images_owner_update" ON public.restaurant_images;
CREATE POLICY "restaurant_images_owner_update"
ON public.restaurant_images
FOR UPDATE
TO authenticated
USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin())
WITH CHECK (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());

DROP POLICY IF EXISTS "restaurant_images_owner_delete" ON public.restaurant_images;
CREATE POLICY "restaurant_images_owner_delete"
ON public.restaurant_images
FOR DELETE
TO authenticated
USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());

DROP POLICY IF EXISTS "image_analysis_jobs_admin_select" ON public.image_analysis_jobs;
CREATE POLICY "image_analysis_jobs_admin_select"
ON public.image_analysis_jobs
FOR SELECT
TO authenticated
USING (public.auth_is_admin());

DROP POLICY IF EXISTS "restaurant_images_storage_owner_select" ON storage.objects;
CREATE POLICY "restaurant_images_storage_owner_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'restaurant-images'
  AND (
    public.auth_is_admin()
    OR (
      (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "restaurant_images_storage_owner_insert" ON storage.objects;
CREATE POLICY "restaurant_images_storage_owner_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-images'
  AND (
    public.auth_is_admin()
    OR (
      (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "restaurant_images_storage_owner_update" ON storage.objects;
CREATE POLICY "restaurant_images_storage_owner_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'restaurant-images'
  AND (
    public.auth_is_admin()
    OR (
      (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
    )
  )
)
WITH CHECK (
  bucket_id = 'restaurant-images'
  AND (
    public.auth_is_admin()
    OR (
      (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "restaurant_images_storage_owner_delete" ON storage.objects;
CREATE POLICY "restaurant_images_storage_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'restaurant-images'
  AND (
    public.auth_is_admin()
    OR (
      (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
    )
  )
);

REVOKE ALL ON public.restaurant_images FROM PUBLIC;
REVOKE ALL ON public.image_analysis_jobs FROM PUBLIC;
GRANT SELECT ON public.restaurant_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.restaurant_images TO authenticated;
GRANT SELECT ON public.image_analysis_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_analysis_jobs TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_image_analysis_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_restaurant_images_search_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_image_analysis_jobs(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_image_analysis_job(uuid, uuid, text, text, text, text, text, text[], text[], text[], text[], text[], text[], text[], text, boolean, boolean, boolean, boolean, numeric, jsonb, extensions.vector) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_image_analysis_job(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_restaurant_images(text, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_restaurant_images(extensions.vector, float, integer, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_image_analysis_jobs(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_image_analysis_job(uuid, uuid, text, text, text, text, text, text[], text[], text[], text[], text[], text[], text[], text, boolean, boolean, boolean, boolean, numeric, jsonb, extensions.vector) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_image_analysis_job(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_restaurant_images(text, uuid, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_restaurant_images(extensions.vector, float, integer, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
