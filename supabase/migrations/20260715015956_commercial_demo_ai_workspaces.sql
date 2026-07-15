-- Zero-cost AI workspaces used exclusively by administrator-managed commercial demos.
-- The tables below never reference production AI conversations, usage credits, media,
-- orders, invoices, or restaurant mutations. Authenticated commercial users only get
-- SELECT access to their own rows; every write is performed by the scoped RPCs below.

CREATE TABLE public.commercial_demo_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  commercial_user_id uuid NOT NULL,
  demo_restaurant_id uuid NOT NULL,
  tool text NOT NULL CHECK (tool IN ('assistant', 'support_chat', 'marketing_studio', 'photo_studio')),
  surface text NOT NULL CHECK (surface IN ('client', 'restaurant', 'courier')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_demo_ai_conversations_session_fk
    FOREIGN KEY (session_id, commercial_user_id, demo_restaurant_id)
    REFERENCES public.commercial_demo_order_sessions (id, commercial_user_id, demo_restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT commercial_demo_ai_conversations_identity_unique
    UNIQUE (id, session_id, commercial_user_id, demo_restaurant_id)
);

CREATE INDEX commercial_demo_ai_conversations_session_tool_idx
  ON public.commercial_demo_ai_conversations (session_id, tool, updated_at DESC, id);

CREATE TABLE public.commercial_demo_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  session_id uuid NOT NULL,
  commercial_user_id uuid NOT NULL,
  demo_restaurant_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 8000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_demo_ai_messages_conversation_fk
    FOREIGN KEY (conversation_id, session_id, commercial_user_id, demo_restaurant_id)
    REFERENCES public.commercial_demo_ai_conversations (id, session_id, commercial_user_id, demo_restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX commercial_demo_ai_messages_conversation_created_idx
  ON public.commercial_demo_ai_messages (conversation_id, created_at, id);
CREATE INDEX commercial_demo_ai_messages_session_identity_idx
  ON public.commercial_demo_ai_messages (session_id, commercial_user_id, demo_restaurant_id);
CREATE INDEX commercial_demo_ai_messages_session_created_idx
  ON public.commercial_demo_ai_messages (session_id, created_at DESC, id);

CREATE TABLE public.commercial_demo_ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  commercial_user_id uuid NOT NULL,
  demo_restaurant_id uuid NOT NULL,
  tool text NOT NULL CHECK (tool IN ('marketing_studio', 'photo_studio', 'advisor_visual')),
  prompt text NOT NULL CHECK (char_length(btrim(prompt)) BETWEEN 1 AND 8000),
  format text NOT NULL CHECK (format IN ('landscape', 'square', 'portrait')),
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'archived')),
  output_mime_type text NOT NULL DEFAULT 'image/svg+xml' CHECK (output_mime_type = 'image/svg+xml'),
  output_svg text NOT NULL CHECK (char_length(output_svg) BETWEEN 100 AND 200000),
  model text NOT NULL DEFAULT 'tok-demo-zero-cost-v1' CHECK (model = 'tok-demo-zero-cost-v1'),
  credit_units integer NOT NULL DEFAULT 0 CHECK (credit_units = 0),
  estimated_cost_chf numeric(10, 4) NOT NULL DEFAULT 0 CHECK (estimated_cost_chf = 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_demo_ai_generations_session_fk
    FOREIGN KEY (session_id, commercial_user_id, demo_restaurant_id)
    REFERENCES public.commercial_demo_order_sessions (id, commercial_user_id, demo_restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX commercial_demo_ai_generations_session_created_idx
  ON public.commercial_demo_ai_generations (session_id, created_at DESC, id);
CREATE INDEX commercial_demo_ai_generations_session_identity_idx
  ON public.commercial_demo_ai_generations (session_id, commercial_user_id, demo_restaurant_id);

ALTER TABLE public.commercial_demo_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_demo_ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_demo_ai_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_demo_ai_conversations_select
  ON public.commercial_demo_ai_conversations FOR SELECT TO authenticated
  USING (public.commercial_demo_can_access_user(commercial_user_id));

CREATE POLICY commercial_demo_ai_messages_select
  ON public.commercial_demo_ai_messages FOR SELECT TO authenticated
  USING (public.commercial_demo_can_access_user(commercial_user_id));

CREATE POLICY commercial_demo_ai_generations_select
  ON public.commercial_demo_ai_generations FOR SELECT TO authenticated
  USING (public.commercial_demo_can_access_user(commercial_user_id));

REVOKE ALL ON TABLE public.commercial_demo_ai_conversations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.commercial_demo_ai_messages FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.commercial_demo_ai_generations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_demo_ai_conversations TO authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_demo_ai_messages TO authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_demo_ai_generations TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._commercial_demo_xml_escape(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT replace(
    replace(
      replace(
        replace(
          replace(p_value, '&', '&amp;'),
          '<', '&lt;'),
        '>', '&gt;'),
      '"', '&quot;'),
    '''', '&apos;')
$$;

REVOKE ALL ON FUNCTION public._commercial_demo_xml_escape(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_respond(
  p_session_id uuid,
  p_tool text,
  p_message text,
  p_conversation_id uuid DEFAULT NULL,
  p_surface text DEFAULT 'restaurant',
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_conversation public.commercial_demo_ai_conversations%ROWTYPE;
  v_restaurant_name text;
  v_message text := btrim(COALESCE(p_message, ''));
  v_reply text;
  v_required_feature text;
  v_active_features integer := 0;
  v_order_status text := 'aucune commande en cours';
  v_reservation_count integer := 0;
BEGIN
  IF p_tool NOT IN ('assistant', 'support_chat') THEN
    RAISE EXCEPTION 'Unsupported commercial demo AI tool' USING ERRCODE = '22023';
  END IF;
  IF p_surface NOT IN ('client', 'restaurant', 'courier') THEN
    RAISE EXCEPTION 'Unsupported commercial demo AI surface' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_context, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Commercial demo AI context must be an object' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(COALESCE(p_context, '{}'::jsonb)) > 32768 THEN
    RAISE EXCEPTION 'Commercial demo AI context is too large' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_message) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Commercial demo AI message must contain between 1 and 4000 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = p_session_id
    AND session.status = 'active';

  IF v_session.id IS NULL
     OR NOT public.commercial_demo_can_access_user(v_session.commercial_user_id) THEN
    RAISE EXCEPTION 'Commercial demo AI session not found or forbidden' USING ERRCODE = '42501';
  END IF;

  v_required_feature := CASE p_tool
    WHEN 'assistant' THEN 'dashboard-advisor'
    WHEN 'support_chat' THEN 'ai_support_chat'
  END;
  IF v_required_feature IS NULL OR NOT public.is_feature_flag_active(v_required_feature) THEN
    RAISE EXCEPTION 'Commercial demo AI tool is disabled by administrator'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize quota checks per session so concurrent browser panes cannot race
  -- past the limits below.
  PERFORM pg_advisory_xact_lock(hashtext('commercial-demo-ai:' || p_session_id::text)::bigint);

  IF (
    SELECT count(*)
    FROM public.commercial_demo_ai_messages message
    WHERE message.session_id = p_session_id
      AND message.created_at > now() - interval '1 minute'
  ) >= 40 THEN
    RAISE EXCEPTION 'Commercial demo AI rate limit reached' USING ERRCODE = 'P0001';
  END IF;
  IF (
    SELECT count(*)
    FROM public.commercial_demo_ai_messages message
    WHERE message.session_id = p_session_id
  ) >= 1000 THEN
    RAISE EXCEPTION 'Commercial demo AI session history limit reached' USING ERRCODE = 'P0001';
  END IF;

  SELECT restaurant.name INTO v_restaurant_name
  FROM public.restaurants restaurant
  WHERE restaurant.id = v_session.demo_restaurant_id
    AND restaurant.is_demo;
  IF v_restaurant_name IS NULL THEN
    RAISE EXCEPTION 'Commercial demo restaurant not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_conversation_id IS NOT NULL THEN
    SELECT * INTO v_conversation
    FROM public.commercial_demo_ai_conversations conversation
    WHERE conversation.id = p_conversation_id
      AND conversation.session_id = p_session_id
      AND conversation.commercial_user_id = v_session.commercial_user_id
      AND conversation.demo_restaurant_id = v_session.demo_restaurant_id
      AND conversation.tool = p_tool
      AND conversation.status = 'active'
    FOR UPDATE;
    IF v_conversation.id IS NULL THEN
      RAISE EXCEPTION 'Commercial demo AI conversation not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    IF (
      SELECT count(*)
      FROM public.commercial_demo_ai_conversations conversation
      WHERE conversation.session_id = p_session_id
        AND conversation.status = 'active'
    ) >= 50 THEN
      RAISE EXCEPTION 'Commercial demo AI active conversation limit reached' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.commercial_demo_ai_conversations (
      session_id, commercial_user_id, demo_restaurant_id, tool, surface, title, metadata
    ) VALUES (
      p_session_id,
      v_session.commercial_user_id,
      v_session.demo_restaurant_id,
      p_tool,
      p_surface,
      left(regexp_replace(v_message, E'[\\n\\r\\t]+', ' ', 'g'), 120),
      jsonb_build_object(
        'engine', 'tok-demo-zero-cost-v1',
        'zero_cost', true,
        'production_data', false
      )
    ) RETURNING * INTO v_conversation;
  END IF;

  IF (
    SELECT count(*)
    FROM public.commercial_demo_ai_messages message
    WHERE message.conversation_id = v_conversation.id
  ) >= 200 THEN
    RAISE EXCEPTION 'Commercial demo AI conversation history limit reached' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_active_features
  FROM public.feature_flags flag
  WHERE flag.is_active
    AND public.is_feature_flag_active(flag.name);

  SELECT COALESCE(replace(demo_order.status, '_', ' '), 'aucune commande en cours')
  INTO v_order_status
  FROM public.commercial_demo_orders demo_order
  WHERE demo_order.session_id = p_session_id;
  v_order_status := COALESCE(v_order_status, 'aucune commande en cours');

  SELECT count(*) INTO v_reservation_count
  FROM public.commercial_demo_reservations reservation
  WHERE reservation.session_id = p_session_id
    AND reservation.status <> 'cancelled';

  IF p_tool = 'support_chat' THEN
    v_reply := format(
      E'Je vous réponds depuis le Chat IA de démonstration de %s.\\n\\n'
      || E'Votre demande : « %s »\\n\\n'
      || E'Actions conseillées :\\n1. vérifier le parcours dans les trois fenêtres ;\\n'
      || E'2. reproduire l’action concernée ;\\n3. consulter les notifications temps réel.\\n\\n'
      || E'Cette réponse et cet historique restent dans les tables de démonstration : aucun ticket, crédit ou message de production n’est créé.',
      v_restaurant_name,
      left(v_message, 700)
    );
  ELSE
    v_reply := format(
      E'### Analyse de démonstration — %s\\n\\n'
      || E'J’ai analysé le contexte isolé de cette session : **%s**, **%s réservation(s)** et **%s fonctionnalités actives**.\\n\\n'
      || E'Pour votre demande — « %s » — je recommande :\\n\\n'
      || E'1. mettre en avant une offre claire dans le Studio Marketing ;\\n'
      || E'2. tester le parcours client jusqu’à la commande ou la réservation ;\\n'
      || E'3. montrer au restaurateur la notification reçue puis la mise à jour en temps réel ;\\n'
      || E'4. comparer ensuite commandes, réservations et performances depuis le dashboard.\\n\\n'
      || E'_Moteur de démonstration zéro coût : aucune API payante, aucun crédit TOK et aucune donnée de production._',
      v_restaurant_name,
      v_order_status,
      v_reservation_count,
      v_active_features,
      left(v_message, 900)
    );
  END IF;

  INSERT INTO public.commercial_demo_ai_messages (
    conversation_id, session_id, commercial_user_id, demo_restaurant_id,
    role, content, metadata
  ) VALUES
  (
    v_conversation.id, p_session_id, v_session.commercial_user_id,
    v_session.demo_restaurant_id, 'user', v_message,
    jsonb_build_object('surface', p_surface, 'context', COALESCE(p_context, '{}'::jsonb))
  ),
  (
    v_conversation.id, p_session_id, v_session.commercial_user_id,
    v_session.demo_restaurant_id, 'assistant', v_reply,
    jsonb_build_object(
      'surface', p_surface,
      'engine', 'tok-demo-zero-cost-v1',
      'zero_cost', true,
      'estimated_cost_chf', 0
    )
  );

  UPDATE public.commercial_demo_ai_conversations
  SET updated_at = now(), metadata = metadata || jsonb_build_object('last_surface', p_surface)
  WHERE id = v_conversation.id;

  RETURN jsonb_build_object(
    'conversation_id', v_conversation.id,
    'reply', v_reply,
    'tool', p_tool,
    'model', 'tok-demo-zero-cost-v1',
    'credit_units', 0,
    'estimated_cost_chf', 0,
    'created_at', now()
  );
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_history(
  p_session_id uuid,
  p_tool text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = p_session_id
    AND session.status = 'active';
  IF v_session.id IS NULL
     OR NOT public.commercial_demo_can_access_user(v_session.commercial_user_id) THEN
    RAISE EXCEPTION 'Commercial demo AI session not found or forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_tool IS NOT NULL AND p_tool NOT IN ('assistant', 'support_chat', 'marketing_studio', 'photo_studio') THEN
    RAISE EXCEPTION 'Unsupported commercial demo AI tool' USING ERRCODE = '22023';
  END IF;
  IF (p_tool = 'assistant' AND NOT public.is_feature_flag_active('dashboard-advisor'))
     OR (p_tool = 'support_chat' AND NOT public.is_feature_flag_active('ai_support_chat'))
     OR (p_tool IN ('marketing_studio', 'photo_studio') AND NOT public.is_feature_flag_active('dashboard-photos'))
     OR (p_tool IS NULL
       AND NOT public.is_feature_flag_active('dashboard-advisor')
       AND NOT public.is_feature_flag_active('ai_support_chat')
       AND NOT public.is_feature_flag_active('dashboard-photos')) THEN
    RAISE EXCEPTION 'Commercial demo AI history is disabled by administrator'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(conversation_row) ORDER BY conversation_row.updated_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      conversation.id,
      conversation.tool,
      conversation.surface,
      conversation.title,
      conversation.status,
      conversation.created_at,
      conversation.updated_at,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', recent_message.id,
            'role', recent_message.role,
            'content', recent_message.content,
            'metadata', recent_message.metadata,
            'created_at', recent_message.created_at
          ) ORDER BY recent_message.created_at, recent_message.id
        )
        FROM (
          SELECT message.id, message.role, message.content, message.metadata, message.created_at
          FROM public.commercial_demo_ai_messages message
          WHERE message.conversation_id = conversation.id
          ORDER BY message.created_at DESC, message.id DESC
          LIMIT 100
        ) recent_message
      ), '[]'::jsonb) AS messages
    FROM public.commercial_demo_ai_conversations conversation
    WHERE conversation.session_id = p_session_id
      AND conversation.status = 'active'
      AND (p_tool IS NULL OR conversation.tool = p_tool)
    ORDER BY conversation.updated_at DESC
    LIMIT 20
  ) conversation_row;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_archive_conversation(
  p_session_id uuid,
  p_conversation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.commercial_demo_order_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = p_session_id
    AND session.status = 'active';
  IF v_session.id IS NULL
     OR NOT public.commercial_demo_can_access_user(v_session.commercial_user_id) THEN
    RAISE EXCEPTION 'Commercial demo AI session not found or forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.commercial_demo_ai_conversations conversation
  SET status = 'archived', updated_at = now()
  WHERE conversation.id = p_conversation_id
    AND conversation.session_id = p_session_id
    AND conversation.commercial_user_id = v_session.commercial_user_id;
  RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_generate_visual(
  p_session_id uuid,
  p_prompt text,
  p_format text DEFAULT 'landscape',
  p_style text DEFAULT 'premium',
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_generation public.commercial_demo_ai_generations%ROWTYPE;
  v_prompt text := btrim(COALESCE(p_prompt, ''));
  v_restaurant_name text;
  v_restaurant_image text;
  v_headline text;
  v_subheadline text;
  v_cta text;
  v_width integer;
  v_height integer;
  v_primary text := '#ff6b00';
  v_secondary text := '#ffb347';
  v_background text := '#111827';
  v_svg text;
  v_image_layer text := '';
  v_generation_tool text;
  v_reference_label text := '';
BEGIN
  IF p_format NOT IN ('landscape', 'square', 'portrait') THEN
    RAISE EXCEPTION 'Unsupported commercial demo visual format' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_context, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Commercial demo visual context must be an object' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(COALESCE(p_context, '{}'::jsonb)) > 32768
     OR char_length(COALESCE(p_style, '')) > 80 THEN
    RAISE EXCEPTION 'Commercial demo visual context is too large' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_prompt) NOT BETWEEN 1 AND 6000 THEN
    RAISE EXCEPTION 'Commercial demo visual prompt must contain between 1 and 6000 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = p_session_id
    AND session.status = 'active';
  IF v_session.id IS NULL
     OR NOT public.commercial_demo_can_access_user(v_session.commercial_user_id) THEN
    RAISE EXCEPTION 'Commercial demo visual session not found or forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_feature_flag_active('dashboard-photos') THEN
    RAISE EXCEPTION 'Commercial demo visual tool is disabled by administrator'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('commercial-demo-visual:' || p_session_id::text)::bigint);

  v_generation_tool := CASE
    WHEN p_context->>'asset_type' IN ('menu_visual', 'image') THEN 'photo_studio'
    ELSE 'marketing_studio'
  END;

  IF (
    SELECT count(*)
    FROM public.commercial_demo_ai_generations generation
    WHERE generation.session_id = p_session_id
      AND generation.created_at > now() - interval '1 minute'
  ) >= 12 THEN
    RAISE EXCEPTION 'Commercial demo visual rate limit reached' USING ERRCODE = 'P0001';
  END IF;
  IF (
    SELECT count(*)
    FROM public.commercial_demo_ai_generations generation
    WHERE generation.session_id = p_session_id
  ) >= 300 THEN
    RAISE EXCEPTION 'Commercial demo visual history limit reached' USING ERRCODE = 'P0001';
  END IF;

  SELECT restaurant.name, restaurant.image_url
  INTO v_restaurant_name, v_restaurant_image
  FROM public.restaurants restaurant
  WHERE restaurant.id = v_session.demo_restaurant_id
    AND restaurant.is_demo;
  IF v_restaurant_name IS NULL THEN
    RAISE EXCEPTION 'Commercial demo restaurant not found' USING ERRCODE = 'P0002';
  END IF;

  v_width := CASE p_format WHEN 'portrait' THEN 1080 WHEN 'square' THEN 1080 ELSE 1600 END;
  v_height := CASE p_format WHEN 'portrait' THEN 1350 WHEN 'square' THEN 1080 ELSE 900 END;

  IF lower(COALESCE(p_style, '')) ~ 'fresh|nature|green' THEN
    v_primary := '#16a34a'; v_secondary := '#86efac'; v_background := '#052e16';
  ELSIF lower(COALESCE(p_style, '')) ~ 'luxe|premium|gold' THEN
    v_primary := '#f59e0b'; v_secondary := '#fde68a'; v_background := '#09090b';
  ELSIF lower(COALESCE(p_style, '')) ~ 'fun|pop|color' THEN
    v_primary := '#f97316'; v_secondary := '#f0abfc'; v_background := '#581c87';
  ELSIF lower(COALESCE(p_style, '')) ~ 'minimal|imprim|sobre|neutral' THEN
    v_primary := '#334155'; v_secondary := '#e2e8f0'; v_background := '#0f172a';
  END IF;

  -- The browser samples selected reference images locally (including blob uploads)
  -- and sends only a bounded palette. This lets references influence the free SVG
  -- without uploading the source files or calling an external image API.
  IF COALESCE(p_context->>'primary_color', '') ~ '^#[0-9a-fA-F]{6}$' THEN
    v_primary := p_context->>'primary_color';
  END IF;
  IF COALESCE(p_context->>'secondary_color', '') ~ '^#[0-9a-fA-F]{6}$' THEN
    v_secondary := p_context->>'secondary_color';
  END IF;
  IF COALESCE(p_context->>'background_color', '') ~ '^#[0-9a-fA-F]{6}$' THEN
    v_background := p_context->>'background_color';
  END IF;
  v_reference_label := left(COALESCE(NULLIF(btrim(p_context->>'reference_label'), ''), ''), 90);

  v_headline := left(COALESCE(NULLIF(btrim(p_context->>'headline'), ''), 'UNE EXPÉRIENCE À DÉCOUVRIR'), 70);
  v_subheadline := left(COALESCE(NULLIF(btrim(p_context->>'subheadline'), ''), v_prompt), 150);
  v_cta := left(COALESCE(NULLIF(btrim(p_context->>'cta'), ''), 'RÉSERVER SUR TOK'), 45);

  IF COALESCE(v_restaurant_image, '') ~ '^https://' THEN
    v_image_layer := '<image href="' || public._commercial_demo_xml_escape(v_restaurant_image)
      || '" x="0" y="0" width="' || v_width || '" height="' || v_height
      || '" preserveAspectRatio="xMidYMid slice" opacity="0.58"/>';
  END IF;

  v_svg := '<svg xmlns="http://www.w3.org/2000/svg" width="' || v_width
    || '" height="' || v_height || '" viewBox="0 0 ' || v_width || ' ' || v_height || '">'
    || '<title>' || public._commercial_demo_xml_escape('Visuel marketing ' || v_restaurant_name) || '</title>'
    || '<defs><linearGradient id="tokBg" x1="0" y1="0" x2="1" y2="1">'
    || '<stop offset="0" stop-color="' || v_background || '"/><stop offset="1" stop-color="' || v_primary || '"/>'
    || '</linearGradient><filter id="tokShadow"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-opacity="0.35"/></filter></defs>'
    || '<rect width="100%" height="100%" fill="url(#tokBg)"/>' || v_image_layer
    || '<rect width="100%" height="100%" fill="url(#tokBg)" opacity="0.52"/>'
    || '<circle cx="' || round(v_width * 0.88) || '" cy="' || round(v_height * 0.12)
    || '" r="' || round(least(v_width, v_height) * 0.18) || '" fill="' || v_secondary || '" opacity="0.28"/>'
    || '<g transform="translate(' || round(v_width * 0.08) || ' ' || round(v_height * 0.12) || ')">'
    || '<rect x="0" y="0" rx="22" width="' || round(v_width * 0.32) || '" height="58" fill="' || v_primary || '" filter="url(#tokShadow)"/>'
    || '<text x="28" y="39" fill="#ffffff" font-family="Arial,sans-serif" font-size="24" font-weight="700" letter-spacing="3">TOK • DÉMONSTRATION</text>'
    || '<text x="0" y="' || round(v_height * 0.30) || '" fill="#ffffff" font-family="Arial,sans-serif" font-size="'
    || greatest(48, round(least(v_width, v_height) * 0.075)) || '" font-weight="900">'
    || public._commercial_demo_xml_escape(v_headline) || '</text>'
    || '<text x="0" y="' || round(v_height * 0.41) || '" fill="' || v_secondary
    || '" font-family="Arial,sans-serif" font-size="' || greatest(30, round(least(v_width, v_height) * 0.042))
    || '" font-weight="700">' || public._commercial_demo_xml_escape(v_restaurant_name) || '</text>'
    || '<text x="0" y="' || round(v_height * 0.49) || '" fill="#ffffff" font-family="Arial,sans-serif" font-size="'
    || greatest(24, round(least(v_width, v_height) * 0.03)) || '" font-weight="500">'
    || '<tspan x="0" dy="0">' || public._commercial_demo_xml_escape(substring(v_subheadline FROM 1 FOR 52)) || '</tspan>'
    || '<tspan x="0" dy="1.35em">' || public._commercial_demo_xml_escape(substring(v_subheadline FROM 53 FOR 52)) || '</tspan>'
    || '<tspan x="0" dy="1.35em">' || public._commercial_demo_xml_escape(substring(v_subheadline FROM 105 FOR 46)) || '</tspan></text>'
    || '<rect x="0" y="' || round(v_height * 0.75) || '" rx="30" width="' || round(v_width * 0.34)
    || '" height="84" fill="' || v_primary || '" filter="url(#tokShadow)"/>'
    || '<text x="32" y="' || round(v_height * 0.75 + 55) || '" fill="#ffffff" font-family="Arial,sans-serif" font-size="28" font-weight="800">'
    || public._commercial_demo_xml_escape(v_cta) || '</text></g>'
    || '<text x="' || round(v_width * 0.92) || '" y="' || round(v_height * 0.93)
    || '" text-anchor="end" fill="#ffffff" opacity="0.78" font-family="Arial,sans-serif" font-size="22">Moteur démo zéro coût • 0 crédit</text>'
    || CASE WHEN v_reference_label <> '' THEN
      '<text x="' || round(v_width * 0.08) || '" y="' || round(v_height * 0.93)
      || '" fill="#ffffff" opacity="0.72" font-family="Arial,sans-serif" font-size="18">Palette issue de : '
      || public._commercial_demo_xml_escape(v_reference_label) || '</text>'
      ELSE '' END
    || '</svg>';

  INSERT INTO public.commercial_demo_ai_generations (
    session_id, commercial_user_id, demo_restaurant_id, tool,
    prompt, format, output_svg, metadata
  ) VALUES (
    p_session_id,
    v_session.commercial_user_id,
    v_session.demo_restaurant_id,
    v_generation_tool,
    v_prompt,
    p_format,
    v_svg,
    jsonb_build_object(
      'style', left(COALESCE(p_style, 'premium'), 80),
      'width', v_width,
      'height', v_height,
      'engine', 'tok-demo-zero-cost-v1',
      'zero_cost', true,
      'production_storage', false,
      'reference_fingerprint', left(COALESCE(p_context->>'reference_fingerprint', ''), 240),
      'reference_label', v_reference_label,
      'source_context', COALESCE(p_context, '{}'::jsonb)
    )
  ) RETURNING * INTO v_generation;

  RETURN jsonb_build_object(
    'generation_id', v_generation.id,
    'output_svg', v_generation.output_svg,
    'output_mime_type', v_generation.output_mime_type,
    'model', v_generation.model,
    'format', v_generation.format,
    'width', v_width,
    'height', v_height,
    'credit_units', 0,
    'estimated_cost_chf', 0,
    'alt_text', format('Visuel marketing de démonstration pour %s : %s', v_restaurant_name, left(v_prompt, 180)),
    'created_at', v_generation.created_at
  );
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_generation_history(
  p_session_id uuid,
  p_tool text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_result jsonb;
  v_limit integer := least(greatest(COALESCE(p_limit, 30), 1), 60);
  v_restaurant_name text;
BEGIN
  IF p_tool IS NOT NULL AND p_tool NOT IN ('marketing_studio', 'photo_studio', 'advisor_visual') THEN
    RAISE EXCEPTION 'Unsupported commercial demo visual history tool' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = p_session_id
    AND session.status = 'active';
  IF v_session.id IS NULL
     OR NOT public.commercial_demo_can_access_user(v_session.commercial_user_id) THEN
    RAISE EXCEPTION 'Commercial demo visual session not found or forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_feature_flag_active('dashboard-photos') THEN
    RAISE EXCEPTION 'Commercial demo visual tool is disabled by administrator'
      USING ERRCODE = '42501';
  END IF;

  SELECT restaurant.name INTO v_restaurant_name
  FROM public.restaurants restaurant
  WHERE restaurant.id = v_session.demo_restaurant_id
    AND restaurant.is_demo;
  IF v_restaurant_name IS NULL THEN
    RAISE EXCEPTION 'Commercial demo restaurant not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(generation_row) ORDER BY generation_row.created_at DESC, generation_row.generation_id),
    '[]'::jsonb
  ) INTO v_result
  FROM (
    SELECT
      generation.id AS generation_id,
      generation.tool,
      generation.prompt,
      generation.format,
      generation.output_svg,
      generation.output_mime_type,
      generation.model,
      generation.credit_units,
      generation.estimated_cost_chf,
      generation.metadata,
      generation.metadata->'width' AS width,
      generation.metadata->'height' AS height,
      generation.metadata->>'style' AS style,
      format(
        'Visuel marketing de démonstration pour %s : %s',
        v_restaurant_name,
        left(generation.prompt, 180)
      ) AS alt_text,
      generation.created_at
    FROM public.commercial_demo_ai_generations generation
    WHERE generation.session_id = p_session_id
      AND generation.status = 'generated'
      AND (p_tool IS NULL OR generation.tool = p_tool)
    ORDER BY generation.created_at DESC, generation.id DESC
    LIMIT v_limit
  ) generation_row;

  RETURN v_result;
END
$$;

REVOKE ALL ON FUNCTION public.commercial_demo_ai_respond(uuid, text, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_ai_history(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_ai_archive_conversation(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_ai_generate_visual(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_ai_generation_history(uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_respond(uuid, text, text, uuid, text, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_history(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_archive_conversation(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_generate_visual(uuid, text, text, text, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_generation_history(uuid, text, integer)
  TO authenticated;

ALTER TABLE public.commercial_demo_ai_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'commercial_demo_ai_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.commercial_demo_ai_messages;
    END IF;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
