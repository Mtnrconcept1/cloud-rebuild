DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT c.conname
  INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'review_replies'
    AND c.contype = 'u'
    AND c.conkey = ARRAY[
      (
        SELECT a.attnum::smallint
        FROM pg_attribute a
        WHERE a.attrelid = t.oid
          AND a.attname = 'review_id'
      )
    ]::smallint[]
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.review_replies DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS review_replies_review_author_type_unique_idx
  ON public.review_replies (review_id, author_type);

CREATE INDEX IF NOT EXISTS review_replies_review_created_idx
  ON public.review_replies (review_id, created_at DESC);

DROP FUNCTION IF EXISTS public.restaurant_reply_review(uuid, text);
CREATE OR REPLACE FUNCTION public.restaurant_reply_review(
  p_review_id uuid,
  p_reply_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reply_text text := NULLIF(trim(COALESCE(p_reply_text, '')), '');
  v_restaurant_id uuid;
  v_existing_reply_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF v_reply_text IS NULL THEN
    RAISE EXCEPTION 'Reply text is required.';
  END IF;

  SELECT restaurant_id
  INTO v_restaurant_id
  FROM public.reviews
  WHERE id = p_review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;

  IF NOT (public.auth_owns_restaurant(v_restaurant_id) OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'Restaurant access required.';
  END IF;

  SELECT id
  INTO v_existing_reply_id
  FROM public.review_replies
  WHERE review_id = p_review_id
    AND author_type = 'restaurant_staff'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_reply_id IS NULL THEN
    INSERT INTO public.review_replies (review_id, author_id, author_type, reply_text)
    VALUES (p_review_id, v_actor, 'restaurant_staff', v_reply_text)
    RETURNING id INTO v_existing_reply_id;
  ELSE
    UPDATE public.review_replies
    SET reply_text = v_reply_text,
        author_id = v_actor,
        author_type = 'restaurant_staff'
    WHERE id = v_existing_reply_id;
  END IF;

  UPDATE public.reviews
  SET restaurant_read_at = COALESCE(restaurant_read_at, now()),
      restaurant_read_by = COALESCE(restaurant_read_by, v_actor)
  WHERE id = p_review_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_reply_review',
    'review',
    p_review_id,
    '{}'::jsonb,
    jsonb_build_object('reply_id', v_existing_reply_id, 'reply_text_length', length(v_reply_text))
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_reply_review(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_reply_review(
  p_review_id uuid,
  p_reply_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reply_text text := NULLIF(trim(COALESCE(p_reply_text, '')), '');
  v_existing_reply_id uuid;
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF v_reply_text IS NULL THEN
    RAISE EXCEPTION 'Reply text is required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = p_review_id) THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;

  SELECT id
  INTO v_existing_reply_id
  FROM public.review_replies
  WHERE review_id = p_review_id
    AND author_type = 'admin'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_reply_id IS NULL THEN
    INSERT INTO public.review_replies (review_id, author_id, author_type, reply_text)
    VALUES (p_review_id, v_actor, 'admin', v_reply_text)
    RETURNING id INTO v_existing_reply_id;
  ELSE
    UPDATE public.review_replies
    SET reply_text = v_reply_text,
        author_id = v_actor,
        author_type = 'admin'
    WHERE id = v_existing_reply_id;
  END IF;

  INSERT INTO public.admin_review_action_history (
    review_id,
    action,
    reason,
    admin_user_id,
    metadata
  )
  VALUES (
    p_review_id,
    'reply',
    'admin reply',
    v_actor,
    jsonb_build_object('reply_id', v_existing_reply_id)
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'admin_reply_review',
    'review',
    p_review_id,
    '{}'::jsonb,
    jsonb_build_object('reply_text_length', length(v_reply_text))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restaurant_reply_review(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reply_review(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.restaurant_reply_review(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reply_review(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
