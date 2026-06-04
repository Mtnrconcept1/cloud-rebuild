-- Admin cuisine governance: audited RPCs and strict RLS for catalog taxonomy.
ALTER TABLE public.cuisines
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS cuisines_archived_name_idx
  ON public.cuisines (archived_at, name);

DROP POLICY IF EXISTS "Require auth for cuisines" ON public.cuisines;
DROP POLICY IF EXISTS "Public read for cuisines" ON public.cuisines;
DROP POLICY IF EXISTS "cuisines_public_select" ON public.cuisines;
DROP POLICY IF EXISTS "cuisines_admin_insert" ON public.cuisines;
DROP POLICY IF EXISTS "cuisines_admin_update" ON public.cuisines;
DROP POLICY IF EXISTS "cuisines_admin_delete" ON public.cuisines;

CREATE POLICY "cuisines_public_select"
  ON public.cuisines
  FOR SELECT
  USING (archived_at IS NULL OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cuisines_admin_insert"
  ON public.cuisines
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cuisines_admin_update"
  ON public.cuisines
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE INSERT, UPDATE, DELETE ON public.cuisines FROM authenticated;
GRANT SELECT ON public.cuisines TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_normalize_cuisine_slug(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(both '-' FROM regexp_replace(lower(trim(COALESCE(p_name, ''))), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_cuisine(
  p_cuisine_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS public.cuisines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name text := trim(COALESCE(p_name, ''));
  v_reason text := trim(COALESCE(p_reason, ''));
  v_slug text;
  v_old jsonb := NULL;
  v_row public.cuisines%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage cuisines';
  END IF;
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Cuisine name is required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  v_slug := public.admin_normalize_cuisine_slug(v_name);

  IF p_cuisine_id IS NULL THEN
    INSERT INTO public.cuisines (name, slug, archived_at, archived_by, archive_reason)
    VALUES (v_name, v_slug, NULL, NULL, NULL)
    ON CONFLICT (name) DO UPDATE
      SET archived_at = NULL,
          archived_by = NULL,
          archive_reason = NULL,
          slug = COALESCE(EXCLUDED.slug, public.cuisines.slug)
    RETURNING * INTO v_row;
  ELSE
    SELECT to_jsonb(c.*) INTO v_old
    FROM public.cuisines c
    WHERE c.id = p_cuisine_id;

    IF v_old IS NULL THEN
      RAISE EXCEPTION 'Cuisine not found';
    END IF;

    UPDATE public.cuisines
    SET name = v_name,
        slug = v_slug,
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL
    WHERE id = p_cuisine_id
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    CASE WHEN p_cuisine_id IS NULL THEN 'admin_create_cuisine' ELSE 'admin_update_cuisine' END,
    'cuisine',
    v_row.id,
    v_old,
    jsonb_build_object('cuisine', to_jsonb(v_row), 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_archive_cuisine(
  p_cuisine_id uuid,
  p_reason text
)
RETURNS public.cuisines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_old jsonb;
  v_row public.cuisines%ROWTYPE;
  v_links integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage cuisines';
  END IF;
  IF p_cuisine_id IS NULL THEN
    RAISE EXCEPTION 'Cuisine id is required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT to_jsonb(c.*) INTO v_old
  FROM public.cuisines c
  WHERE c.id = p_cuisine_id;

  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Cuisine not found';
  END IF;

  SELECT count(*)::integer INTO v_links
  FROM public.restaurant_cuisines rc
  WHERE rc.cuisine_id = p_cuisine_id;

  UPDATE public.cuisines
  SET archived_at = now(),
      archived_by = v_actor,
      archive_reason = v_reason
  WHERE id = p_cuisine_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'admin_archive_cuisine',
    'cuisine',
    v_row.id,
    v_old,
    jsonb_build_object('cuisine', to_jsonb(v_row), 'reason', v_reason, 'restaurant_links', v_links)
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_normalize_cuisine_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_cuisine(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_archive_cuisine(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_cuisine(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_archive_cuisine(uuid, text) TO authenticated;
