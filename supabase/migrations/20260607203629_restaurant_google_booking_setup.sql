-- Phase 1 Google Business booking button onboarding.
-- Restaurants copy a TOK reservation link manually into Google Business.

CREATE TABLE IF NOT EXISTS public.restaurant_google_booking_setup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  google_place_id text,
  google_business_url text,
  booking_slug text NOT NULL,
  tok_booking_url text NOT NULL,
  previous_booking_provider text,
  google_booking_status text NOT NULL DEFAULT 'not_configured',
  needs_google_help boolean NOT NULL DEFAULT false,
  copied_at timestamptz,
  preferred_link_confirmed_at timestamptz,
  confirmation_screenshot_url text,
  admin_notes text,
  last_admin_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id),
  UNIQUE (booking_slug),
  CHECK (google_booking_status IN ('not_configured', 'link_copied', 'in_progress', 'configured', 'problem')),
  CHECK (previous_booking_provider IS NULL OR previous_booking_provider IN ('thefork', 'other', 'none', 'unknown')),
  CHECK (google_business_url IS NULL OR google_business_url ~* '^https://'),
  CHECK (confirmation_screenshot_url IS NULL OR confirmation_screenshot_url ~* '^https://')
);

CREATE TABLE IF NOT EXISTS public.restaurant_google_booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  setup_id uuid REFERENCES public.restaurant_google_booking_setup(id) ON DELETE SET NULL,
  user_id uuid,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type IN (
    'google_booking_link_copied',
    'google_booking_help_requested',
    'google_booking_configured_confirmed',
    'google_booking_link_clicked',
    'google_booking_reservation_started',
    'google_booking_reservation_completed'
  ))
);

CREATE INDEX IF NOT EXISTS restaurant_google_booking_setup_status_idx
  ON public.restaurant_google_booking_setup (google_booking_status, needs_google_help, updated_at DESC);

CREATE INDEX IF NOT EXISTS restaurant_google_booking_setup_help_idx
  ON public.restaurant_google_booking_setup (needs_google_help, last_admin_contact_at DESC)
  WHERE needs_google_help = true;

CREATE INDEX IF NOT EXISTS restaurant_google_booking_events_restaurant_type_idx
  ON public.restaurant_google_booking_events (restaurant_id, event_type, created_at DESC);

ALTER TABLE public.restaurant_google_booking_setup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_google_booking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_google_booking_setup_owner_select" ON public.restaurant_google_booking_setup;
DROP POLICY IF EXISTS "restaurant_google_booking_setup_owner_update" ON public.restaurant_google_booking_setup;
DROP POLICY IF EXISTS "restaurant_google_booking_setup_admin_all" ON public.restaurant_google_booking_setup;
DROP POLICY IF EXISTS "restaurant_google_booking_events_owner_select" ON public.restaurant_google_booking_events;
DROP POLICY IF EXISTS "restaurant_google_booking_events_admin_all" ON public.restaurant_google_booking_events;

CREATE POLICY "restaurant_google_booking_setup_owner_select"
  ON public.restaurant_google_booking_setup
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_google_booking_setup.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "restaurant_google_booking_setup_owner_update"
  ON public.restaurant_google_booking_setup
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_google_booking_setup.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_google_booking_setup.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "restaurant_google_booking_setup_admin_all"
  ON public.restaurant_google_booking_setup
  FOR ALL
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "restaurant_google_booking_events_owner_select"
  ON public.restaurant_google_booking_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_google_booking_events.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "restaurant_google_booking_events_admin_all"
  ON public.restaurant_google_booking_events
  FOR ALL
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS set_updated_at_restaurant_google_booking_setup ON public.restaurant_google_booking_setup;
CREATE TRIGGER set_updated_at_restaurant_google_booking_setup
  BEFORE UPDATE ON public.restaurant_google_booking_setup
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.ensure_restaurant_google_booking_setup(p_restaurant_id uuid)
RETURNS public.restaurant_google_booking_setup
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.restaurant_google_booking_setup%ROWTYPE;
  v_restaurant record;
  v_base_slug text;
  v_candidate text;
  v_suffix integer := 1;
BEGIN
  SELECT id, name, slug
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF v_restaurant.id IS NULL THEN
    RAISE EXCEPTION 'Restaurant introuvable.';
  END IF;

  SELECT *
  INTO v_row
  FROM public.restaurant_google_booking_setup
  WHERE restaurant_id = p_restaurant_id;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  v_base_slug := NULLIF(public.tok_slugify(COALESCE(v_restaurant.slug, v_restaurant.name)), '');
  IF v_base_slug IS NULL THEN
    v_base_slug := 'restaurant-' || left(p_restaurant_id::text, 8);
  END IF;

  v_candidate := v_base_slug;
  WHILE EXISTS (
    SELECT 1
    FROM public.restaurant_google_booking_setup
    WHERE booking_slug = v_candidate
  ) LOOP
    IF v_suffix = 1 THEN
      v_candidate := v_base_slug || '-' || left(p_restaurant_id::text, 8);
    ELSE
      v_candidate := v_base_slug || '-' || left(p_restaurant_id::text, 8) || '-' || v_suffix::text;
    END IF;
    v_suffix := v_suffix + 1;
  END LOOP;

  INSERT INTO public.restaurant_google_booking_setup (
    restaurant_id,
    booking_slug,
    tok_booking_url
  )
  VALUES (
    p_restaurant_id,
    v_candidate,
    'https://www.thetok.ch/r/' || v_candidate
  )
  ON CONFLICT (restaurant_id) DO UPDATE
  SET updated_at = public.restaurant_google_booking_setup.updated_at
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_get_google_booking_setup(p_restaurant_id uuid)
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
  restaurant_name text,
  city text,
  google_place_id text,
  google_business_url text,
  booking_slug text,
  tok_booking_url text,
  previous_booking_provider text,
  google_booking_status text,
  needs_google_help boolean,
  copied_at timestamptz,
  preferred_link_confirmed_at timestamptz,
  confirmation_screenshot_url text,
  created_at timestamptz,
  updated_at timestamptz,
  link_clicks bigint,
  reservation_starts bigint,
  reservation_completions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_setup public.restaurant_google_booking_setup%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.';
  END IF;

  IF NOT (
    public.has_role(v_actor_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = p_restaurant_id
        AND r.owner_id = v_actor_id
    )
  ) THEN
    RAISE EXCEPTION 'Acces refuse.';
  END IF;

  v_setup := public.ensure_restaurant_google_booking_setup(p_restaurant_id);

  RETURN QUERY
  SELECT
    v_setup.id,
    r.id,
    r.name,
    r.city,
    v_setup.google_place_id,
    v_setup.google_business_url,
    v_setup.booking_slug,
    v_setup.tok_booking_url,
    v_setup.previous_booking_provider,
    v_setup.google_booking_status,
    v_setup.needs_google_help,
    v_setup.copied_at,
    v_setup.preferred_link_confirmed_at,
    v_setup.confirmation_screenshot_url,
    v_setup.created_at,
    v_setup.updated_at,
    COUNT(e.id) FILTER (WHERE e.event_type = 'google_booking_link_clicked')::bigint,
    COUNT(e.id) FILTER (WHERE e.event_type = 'google_booking_reservation_started')::bigint,
    COUNT(e.id) FILTER (WHERE e.event_type = 'google_booking_reservation_completed')::bigint
  FROM public.restaurants r
  LEFT JOIN public.restaurant_google_booking_events e ON e.restaurant_id = r.id
  WHERE r.id = p_restaurant_id
  GROUP BY r.id, r.name, r.city;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_update_google_booking_setup(
  p_restaurant_id uuid,
  p_google_business_url text DEFAULT NULL,
  p_previous_booking_provider text DEFAULT NULL,
  p_needs_google_help boolean DEFAULT NULL,
  p_confirmation_screenshot_url text DEFAULT NULL,
  p_action text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
  restaurant_name text,
  city text,
  google_place_id text,
  google_business_url text,
  booking_slug text,
  tok_booking_url text,
  previous_booking_provider text,
  google_booking_status text,
  needs_google_help boolean,
  copied_at timestamptz,
  preferred_link_confirmed_at timestamptz,
  confirmation_screenshot_url text,
  created_at timestamptz,
  updated_at timestamptz,
  link_clicks bigint,
  reservation_starts bigint,
  reservation_completions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_setup public.restaurant_google_booking_setup%ROWTYPE;
  v_google_url text := NULLIF(trim(COALESCE(p_google_business_url, '')), '');
  v_screenshot_url text := NULLIF(trim(COALESCE(p_confirmation_screenshot_url, '')), '');
  v_provider text := NULLIF(trim(COALESCE(p_previous_booking_provider, '')), '');
  v_event_type text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Acces refuse.';
  END IF;

  IF p_action IS NOT NULL AND p_action NOT IN ('copy', 'help', 'configured', 'problem', 'save') THEN
    RAISE EXCEPTION 'Action Google Business invalide: %', p_action;
  END IF;

  IF v_google_url IS NOT NULL AND v_google_url !~* '^https://' THEN
    RAISE EXCEPTION 'URL Google Business invalide.';
  END IF;

  IF v_screenshot_url IS NOT NULL AND v_screenshot_url !~* '^https://' THEN
    RAISE EXCEPTION 'URL de preuve invalide.';
  END IF;

  IF v_provider IS NOT NULL AND v_provider NOT IN ('thefork', 'other', 'none', 'unknown') THEN
    RAISE EXCEPTION 'Ancien fournisseur invalide.';
  END IF;

  v_setup := public.ensure_restaurant_google_booking_setup(p_restaurant_id);

  UPDATE public.restaurant_google_booking_setup s
  SET
    google_business_url = CASE WHEN p_google_business_url IS NULL THEN s.google_business_url ELSE v_google_url END,
    previous_booking_provider = CASE WHEN p_previous_booking_provider IS NULL THEN s.previous_booking_provider ELSE v_provider END,
    needs_google_help = CASE
      WHEN p_action = 'help' THEN true
      WHEN p_action = 'configured' THEN false
      WHEN p_needs_google_help IS NULL THEN s.needs_google_help
      ELSE p_needs_google_help
    END,
    confirmation_screenshot_url = CASE
      WHEN p_confirmation_screenshot_url IS NULL THEN s.confirmation_screenshot_url
      ELSE v_screenshot_url
    END,
    google_booking_status = CASE
      WHEN p_action = 'copy' AND s.google_booking_status <> 'configured' THEN 'link_copied'
      WHEN p_action = 'help' AND s.google_booking_status <> 'configured' THEN 'in_progress'
      WHEN p_action = 'configured' THEN 'configured'
      WHEN p_action = 'problem' THEN 'problem'
      ELSE s.google_booking_status
    END,
    copied_at = CASE WHEN p_action = 'copy' THEN now() ELSE s.copied_at END,
    preferred_link_confirmed_at = CASE WHEN p_action = 'configured' THEN now() ELSE s.preferred_link_confirmed_at END
  WHERE s.restaurant_id = p_restaurant_id
  RETURNING * INTO v_setup;

  v_event_type := CASE p_action
    WHEN 'copy' THEN 'google_booking_link_copied'
    WHEN 'help' THEN 'google_booking_help_requested'
    WHEN 'configured' THEN 'google_booking_configured_confirmed'
    ELSE NULL
  END;

  IF v_event_type IS NOT NULL THEN
    INSERT INTO public.restaurant_google_booking_events (
      restaurant_id,
      setup_id,
      user_id,
      event_type,
      metadata
    )
    VALUES (
      p_restaurant_id,
      v_setup.id,
      v_actor_id,
      v_event_type,
      jsonb_build_object('source', 'restaurant_dashboard')
    );
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.restaurant_get_google_booking_setup(p_restaurant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_google_booking_setups(
  p_status text DEFAULT NULL,
  p_help_only boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
  restaurant_name text,
  city text,
  google_business_url text,
  booking_slug text,
  tok_booking_url text,
  previous_booking_provider text,
  google_booking_status text,
  needs_google_help boolean,
  copied_at timestamptz,
  preferred_link_confirmed_at timestamptz,
  confirmation_screenshot_url text,
  admin_notes text,
  last_admin_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  link_clicks bigint,
  reservation_starts bigint,
  reservation_completions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acces admin requis.';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('not_configured', 'link_copied', 'in_progress', 'configured', 'problem') THEN
    RAISE EXCEPTION 'Statut Google Business invalide: %', p_status;
  END IF;

  RETURN QUERY
  WITH scoped_restaurants AS (
    SELECT r.id
    FROM public.restaurants r
    WHERE NULLIF(trim(COALESCE(p_search, '')), '') IS NULL
      OR r.name ILIKE '%' || trim(p_search) || '%'
      OR r.city ILIKE '%' || trim(p_search) || '%'
    ORDER BY r.name ASC, r.id ASC
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    s.id,
    r.id,
    r.name,
    r.city,
    s.google_business_url,
    s.booking_slug,
    s.tok_booking_url,
    s.previous_booking_provider,
    s.google_booking_status,
    s.needs_google_help,
    s.copied_at,
    s.preferred_link_confirmed_at,
    s.confirmation_screenshot_url,
    s.admin_notes,
    s.last_admin_contact_at,
    s.created_at,
    s.updated_at,
    COALESCE(metrics.link_clicks, 0)::bigint,
    COALESCE(metrics.reservation_starts, 0)::bigint,
    COALESCE(metrics.reservation_completions, 0)::bigint
  FROM scoped_restaurants sr
  JOIN public.restaurants r ON r.id = sr.id
  JOIN LATERAL public.ensure_restaurant_google_booking_setup(r.id) s ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE e.event_type = 'google_booking_link_clicked') AS link_clicks,
      COUNT(*) FILTER (WHERE e.event_type = 'google_booking_reservation_started') AS reservation_starts,
      COUNT(*) FILTER (WHERE e.event_type = 'google_booking_reservation_completed') AS reservation_completions
    FROM public.restaurant_google_booking_events e
    WHERE e.restaurant_id = r.id
  ) metrics ON true
  WHERE (p_status IS NULL OR s.google_booking_status = p_status)
    AND (COALESCE(p_help_only, false) = false OR s.needs_google_help = true)
  ORDER BY
    s.needs_google_help DESC,
    CASE s.google_booking_status
      WHEN 'problem' THEN 1
      WHEN 'not_configured' THEN 2
      WHEN 'in_progress' THEN 3
      WHEN 'link_copied' THEN 4
      WHEN 'configured' THEN 5
      ELSE 6
    END,
    r.name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_google_booking_setup(
  p_restaurant_id uuid,
  p_google_booking_status text DEFAULT NULL,
  p_admin_notes text DEFAULT NULL,
  p_last_admin_contact_at timestamptz DEFAULT NULL,
  p_confirmation_screenshot_url text DEFAULT NULL,
  p_needs_google_help boolean DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
  restaurant_name text,
  city text,
  google_business_url text,
  booking_slug text,
  tok_booking_url text,
  previous_booking_provider text,
  google_booking_status text,
  needs_google_help boolean,
  copied_at timestamptz,
  preferred_link_confirmed_at timestamptz,
  confirmation_screenshot_url text,
  admin_notes text,
  last_admin_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  link_clicks bigint,
  reservation_starts bigint,
  reservation_completions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_setup public.restaurant_google_booking_setup%ROWTYPE;
  v_admin_notes text := NULLIF(trim(COALESCE(p_admin_notes, '')), '');
  v_screenshot_url text := NULLIF(trim(COALESCE(p_confirmation_screenshot_url, '')), '');
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acces admin requis.';
  END IF;

  IF p_google_booking_status IS NOT NULL AND p_google_booking_status NOT IN ('not_configured', 'link_copied', 'in_progress', 'configured', 'problem') THEN
    RAISE EXCEPTION 'Statut Google Business invalide: %', p_google_booking_status;
  END IF;

  IF v_screenshot_url IS NOT NULL AND v_screenshot_url !~* '^https://' THEN
    RAISE EXCEPTION 'URL de preuve invalide.';
  END IF;

  v_setup := public.ensure_restaurant_google_booking_setup(p_restaurant_id);

  UPDATE public.restaurant_google_booking_setup s
  SET
    google_booking_status = COALESCE(p_google_booking_status, s.google_booking_status),
    admin_notes = CASE WHEN p_admin_notes IS NULL THEN s.admin_notes ELSE v_admin_notes END,
    last_admin_contact_at = COALESCE(p_last_admin_contact_at, s.last_admin_contact_at),
    confirmation_screenshot_url = CASE
      WHEN p_confirmation_screenshot_url IS NULL THEN s.confirmation_screenshot_url
      ELSE v_screenshot_url
    END,
    needs_google_help = COALESCE(p_needs_google_help, s.needs_google_help),
    preferred_link_confirmed_at = CASE
      WHEN p_google_booking_status = 'configured' AND s.preferred_link_confirmed_at IS NULL THEN now()
      ELSE s.preferred_link_confirmed_at
    END
  WHERE s.restaurant_id = p_restaurant_id
  RETURNING * INTO v_setup;

  RETURN QUERY
  SELECT
    s.id,
    r.id,
    r.name,
    r.city,
    s.google_business_url,
    s.booking_slug,
    s.tok_booking_url,
    s.previous_booking_provider,
    s.google_booking_status,
    s.needs_google_help,
    s.copied_at,
    s.preferred_link_confirmed_at,
    s.confirmation_screenshot_url,
    s.admin_notes,
    s.last_admin_contact_at,
    s.created_at,
    s.updated_at,
    COALESCE(metrics.link_clicks, 0)::bigint,
    COALESCE(metrics.reservation_starts, 0)::bigint,
    COALESCE(metrics.reservation_completions, 0)::bigint
  FROM public.restaurants r
  JOIN public.restaurant_google_booking_setup s ON s.restaurant_id = r.id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE e.event_type = 'google_booking_link_clicked') AS link_clicks,
      COUNT(*) FILTER (WHERE e.event_type = 'google_booking_reservation_started') AS reservation_starts,
      COUNT(*) FILTER (WHERE e.event_type = 'google_booking_reservation_completed') AS reservation_completions
    FROM public.restaurant_google_booking_events e
    WHERE e.restaurant_id = r.id
  ) metrics ON true
  WHERE r.id = p_restaurant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_google_booking_slug(p_booking_slug text)
RETURNS TABLE (
  restaurant_id uuid,
  restaurant_name text,
  city text,
  slug text,
  booking_slug text,
  is_active boolean,
  status text,
  supports_reservation boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT
    r.id,
    r.name,
    r.city,
    r.slug,
    s.booking_slug,
    r.is_active,
    r.status,
    r.supports_reservation
  FROM public.restaurant_google_booking_setup s
  JOIN public.restaurants r ON r.id = s.restaurant_id
  WHERE s.booking_slug = public.tok_slugify(p_booking_slug)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.track_google_booking_event(
  p_restaurant_id uuid,
  p_event_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_setup public.restaurant_google_booking_setup%ROWTYPE;
  v_event_id uuid;
BEGIN
  IF p_event_type NOT IN (
    'google_booking_link_copied',
    'google_booking_help_requested',
    'google_booking_configured_confirmed',
    'google_booking_link_clicked',
    'google_booking_reservation_started',
    'google_booking_reservation_completed'
  ) THEN
    RAISE EXCEPTION 'Type evenement Google Business invalide: %', p_event_type;
  END IF;

  IF v_actor_id IS NULL AND p_event_type NOT IN ('google_booking_link_clicked', 'google_booking_reservation_started') THEN
    RAISE EXCEPTION 'Connexion requise.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'Restaurant introuvable.';
  END IF;

  v_setup := public.ensure_restaurant_google_booking_setup(p_restaurant_id);

  INSERT INTO public.restaurant_google_booking_events (
    restaurant_id,
    setup_id,
    user_id,
    event_type,
    metadata
  )
  VALUES (
    p_restaurant_id,
    v_setup.id,
    v_actor_id,
    p_event_type,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON public.restaurant_google_booking_setup FROM anon, authenticated;
REVOKE ALL ON public.restaurant_google_booking_events FROM anon, authenticated;
GRANT ALL ON public.restaurant_google_booking_setup TO service_role;
GRANT ALL ON public.restaurant_google_booking_events TO service_role;

REVOKE ALL ON FUNCTION public.ensure_restaurant_google_booking_setup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_restaurant_google_booking_setup(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.restaurant_get_google_booking_setup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_get_google_booking_setup(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.restaurant_update_google_booking_setup(uuid, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_update_google_booking_setup(uuid, text, text, boolean, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_google_booking_setups(text, boolean, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_google_booking_setups(text, boolean, text, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_update_google_booking_setup(uuid, text, text, timestamptz, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_google_booking_setup(uuid, text, text, timestamptz, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_google_booking_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_google_booking_slug(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.track_google_booking_event(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_google_booking_event(uuid, text, jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
