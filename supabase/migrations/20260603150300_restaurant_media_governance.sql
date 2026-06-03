ALTER TABLE public.restaurant_media
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text;

WITH ranked_cover AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY restaurant_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
    ) AS rank
  FROM public.restaurant_media
  WHERE is_cover = true
)
UPDATE public.restaurant_media rm
SET is_cover = false
FROM ranked_cover rc
WHERE rm.id = rc.id
  AND rc.rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_media_one_cover_per_restaurant_idx
  ON public.restaurant_media(restaurant_id)
  WHERE is_cover = true;

CREATE INDEX IF NOT EXISTS idx_restaurant_media_storage_object
  ON public.restaurant_media(storage_bucket, storage_path)
  WHERE storage_bucket IS NOT NULL AND storage_path IS NOT NULL;

CREATE OR REPLACE FUNCTION public.restaurant_set_cover_media(p_media_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_media record;
  v_previous_cover_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT
    rm.id,
    rm.restaurant_id,
    rm.media_url,
    r.owner_id
  INTO v_media
  FROM public.restaurant_media rm
  JOIN public.restaurants r ON r.id = rm.restaurant_id
  WHERE rm.id = p_media_id
  FOR UPDATE OF rm, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'media_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.auth_is_admin() AND v_media.owner_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id
  INTO v_previous_cover_id
  FROM public.restaurant_media
  WHERE restaurant_id = v_media.restaurant_id
    AND is_cover = true
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
  LIMIT 1
  FOR UPDATE;

  UPDATE public.restaurant_media
  SET is_cover = false
  WHERE restaurant_id = v_media.restaurant_id
    AND is_cover = true
    AND id <> p_media_id;

  UPDATE public.restaurant_media
  SET is_cover = true
  WHERE id = p_media_id;

  UPDATE public.restaurants
  SET image_url = v_media.media_url
  WHERE id = v_media.restaurant_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'restaurant_media_set_cover',
    'restaurant_media',
    p_media_id,
    jsonb_build_object('previous_cover_id', v_previous_cover_id),
    jsonb_build_object(
      'media_id', p_media_id,
      'restaurant_id', v_media.restaurant_id,
      'image_url', v_media.media_url
    )
  );

  RETURN jsonb_build_object(
    'media_id', p_media_id,
    'restaurant_id', v_media.restaurant_id,
    'image_url', v_media.media_url
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_delete_media_metadata(p_media_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_media record;
  v_next_cover record;
  v_next_cover_id uuid := NULL;
  v_image_url text := NULL;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT
    rm.id,
    rm.restaurant_id,
    rm.media_url,
    rm.media_type,
    rm.alt_text,
    rm.is_cover,
    rm.position,
    rm.uploaded_by,
    rm.storage_bucket,
    rm.storage_path,
    r.owner_id
  INTO v_media
  FROM public.restaurant_media rm
  JOIN public.restaurants r ON r.id = rm.restaurant_id
  WHERE rm.id = p_media_id
  FOR UPDATE OF rm, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'media_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.auth_is_admin() AND v_media.owner_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.restaurant_media
  WHERE id = p_media_id;

  IF v_media.is_cover THEN
    SELECT id, media_url
    INTO v_next_cover
    FROM public.restaurant_media
    WHERE restaurant_id = v_media.restaurant_id
    ORDER BY position ASC, created_at ASC, id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      v_next_cover_id := v_next_cover.id;
      v_image_url := v_next_cover.media_url;

      UPDATE public.restaurant_media
      SET is_cover = true
      WHERE id = v_next_cover_id;
    END IF;

    UPDATE public.restaurants
    SET image_url = v_image_url
    WHERE id = v_media.restaurant_id;
  ELSE
    SELECT image_url
    INTO v_image_url
    FROM public.restaurants
    WHERE id = v_media.restaurant_id;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'restaurant_media_delete',
    'restaurant_media',
    p_media_id,
    jsonb_build_object(
      'media_id', v_media.id,
      'restaurant_id', v_media.restaurant_id,
      'media_url', v_media.media_url,
      'media_type', v_media.media_type,
      'alt_text', v_media.alt_text,
      'is_cover', v_media.is_cover,
      'storage_bucket', v_media.storage_bucket,
      'storage_path', v_media.storage_path
    ),
    jsonb_build_object(
      'restaurant_id', v_media.restaurant_id,
      'next_cover_id', v_next_cover_id,
      'image_url', v_image_url
    )
  );

  RETURN jsonb_build_object(
    'media_id', v_media.id,
    'restaurant_id', v_media.restaurant_id,
    'media_url', v_media.media_url,
    'media_type', v_media.media_type,
    'uploaded_by', v_media.uploaded_by,
    'storage_bucket', v_media.storage_bucket,
    'storage_path', v_media.storage_path,
    'was_cover', v_media.is_cover,
    'next_cover_id', v_next_cover_id,
    'image_url', v_image_url
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_set_cover_media(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_delete_media_metadata(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.restaurant_set_cover_media(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_set_cover_media(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_delete_media_metadata(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_delete_media_metadata(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
