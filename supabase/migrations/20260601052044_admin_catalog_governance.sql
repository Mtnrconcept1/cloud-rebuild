ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS public.admin_catalog_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  reason text,
  admin_user_id uuid DEFAULT auth.uid(),
  old_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_catalog_change_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_catalog_change_history_admin_select" ON public.admin_catalog_change_history;
CREATE POLICY "admin_catalog_change_history_admin_select"
  ON public.admin_catalog_change_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_catalog_change_history_admin_insert" ON public.admin_catalog_change_history;
CREATE POLICY "admin_catalog_change_history_admin_insert"
  ON public.admin_catalog_change_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT ON public.admin_catalog_change_history TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_catalog_collection(
  p_collection_id uuid,
  p_payload jsonb,
  p_restaurant_ids uuid[],
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection_id uuid := p_collection_id;
  v_old_data jsonb := '{}'::jsonb;
  v_restaurant_id uuid;
  v_index integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF COALESCE((p_payload ->> 'is_active')::boolean, false) AND COALESCE(array_length(p_restaurant_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'collection cannot be published without restaurants';
  END IF;

  IF v_collection_id IS NOT NULL THEN
    SELECT to_jsonb(c.*) INTO v_old_data FROM public.collections c WHERE c.id = v_collection_id;
    UPDATE public.collections
    SET
      title = p_payload ->> 'title',
      description = NULLIF(p_payload ->> 'description', ''),
      image_url = NULLIF(p_payload ->> 'image_url', ''),
      is_active = COALESCE((p_payload ->> 'is_active')::boolean, false),
      sort_order = COALESCE((p_payload ->> 'sort_order')::integer, sort_order)
    WHERE id = v_collection_id;
  ELSE
    INSERT INTO public.collections (title, description, image_url, is_active, sort_order)
    VALUES (
      p_payload ->> 'title',
      NULLIF(p_payload ->> 'description', ''),
      NULLIF(p_payload ->> 'image_url', ''),
      COALESCE((p_payload ->> 'is_active')::boolean, false),
      COALESCE((p_payload ->> 'sort_order')::integer, 0)
    )
    RETURNING id INTO v_collection_id;
  END IF;

  DELETE FROM public.collection_restaurants WHERE collection_id = v_collection_id;

  FOREACH v_restaurant_id IN ARRAY COALESCE(p_restaurant_ids, ARRAY[]::uuid[])
  LOOP
    INSERT INTO public.collection_restaurants (collection_id, restaurant_id, sort_order)
    VALUES (v_collection_id, v_restaurant_id, v_index);
    v_index := v_index + 1;
  END LOOP;

  INSERT INTO public.admin_catalog_change_history (entity_type, entity_id, action, reason, admin_user_id, old_data, new_data)
  VALUES ('collection', v_collection_id, CASE WHEN p_collection_id IS NULL THEN 'create' ELSE 'update' END, p_reason, auth.uid(), COALESCE(v_old_data, '{}'::jsonb), p_payload);

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'admin_save_catalog_collection', 'collection', v_collection_id, COALESCE(v_old_data, '{}'::jsonb), p_payload);

  RETURN v_collection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_archive_catalog_collection(p_collection_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_data jsonb;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT to_jsonb(c.*) INTO v_old_data FROM public.collections c WHERE c.id = p_collection_id;
  UPDATE public.collections SET is_active = false, archived_at = now() WHERE id = p_collection_id;

  INSERT INTO public.admin_catalog_change_history (entity_type, entity_id, action, reason, admin_user_id, old_data, new_data)
  VALUES ('collection', p_collection_id, 'archive', v_reason, auth.uid(), COALESCE(v_old_data, '{}'::jsonb), jsonb_build_object('is_active', false));

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'admin_archive_catalog_collection', 'collection', p_collection_id, COALESCE(v_old_data, '{}'::jsonb), jsonb_build_object('is_active', false, 'reason', v_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reorder_catalog_collections(p_collection_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_index integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_collection_ids, ARRAY[]::uuid[])
  LOOP
    UPDATE public.collections SET sort_order = v_index WHERE id = v_id;
    v_index := v_index + 1;
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, old_data, new_data)
  VALUES (auth.uid(), 'admin_reorder_catalog_collections', 'collection', '{}'::jsonb, jsonb_build_object('collection_ids', p_collection_ids));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_save_catalog_collection(uuid, jsonb, uuid[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_archive_catalog_collection(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reorder_catalog_collections(uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_save_catalog_collection(uuid, jsonb, uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_archive_catalog_collection(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reorder_catalog_collections(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
