-- TOK delegated applications: explicit business grants, opaque broker tokens and
-- server-only request permits. No change to Supabase Auth-owned tables.
BEGIN;

CREATE TABLE public.tok_connect_oauth_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 256 AND client_id ~ '^[A-Za-z0-9_.:-]+$'),
  client_name text NOT NULL DEFAULT '' CHECK (length(client_name) <= 180),
  scopes text[] NOT NULL DEFAULT '{}' CHECK (cardinality(scopes) <= 20),
  restaurant_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(restaurant_ids) <= 100),
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days', revoked_at timestamptz,
  UNIQUE (user_id, client_id)
);
ALTER TABLE public.tok_connect_oauth_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tok_connect_oauth_grants_native_owner ON public.tok_connect_oauth_grants
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) AND NOT ((SELECT auth.jwt()) ? 'client_id'));
REVOKE ALL ON public.tok_connect_oauth_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tok_connect_oauth_grants TO authenticated;
GRANT ALL ON public.tok_connect_oauth_grants TO service_role;

CREATE SCHEMA IF NOT EXISTS tok_connect_private;
REVOKE ALL ON SCHEMA tok_connect_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA tok_connect_private TO service_role;
CREATE TABLE tok_connect_private.broker_clients (
  client_id text PRIMARY KEY CHECK (length(client_id) BETWEEN 1 AND 256 AND client_id ~ '^[A-Za-z0-9_.:-]+$'),
  client_name text NOT NULL CHECK (length(client_name) BETWEEN 1 AND 180),
  redirect_uris text[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
  client_secret_ciphertext text NOT NULL CHECK (length(client_secret_ciphertext) BETWEEN 32 AND 16384),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tok_connect_private.broker_sessions (
  id uuid PRIMARY KEY, client_id text NOT NULL REFERENCES tok_connect_private.broker_clients(client_id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_hash text NOT NULL UNIQUE CHECK (access_hash ~ '^[0-9a-f]{64}$'),
  refresh_hash text NOT NULL UNIQUE CHECK (refresh_hash ~ '^[0-9a-f]{64}$'),
  supabase_access_ciphertext text NOT NULL CHECK (length(supabase_access_ciphertext) BETWEEN 32 AND 32768),
  supabase_refresh_ciphertext text NOT NULL CHECK (length(supabase_refresh_ciphertext) BETWEEN 32 AND 32768),
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days',
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'refreshing', 'revoked')),
  rotation bigint NOT NULL DEFAULT 0, refresh_claim_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tok_broker_sessions_owner_idx ON tok_connect_private.broker_sessions(user_id, client_id);
CREATE INDEX tok_broker_sessions_expiry_idx ON tok_connect_private.broker_sessions(refresh_expires_at);
ALTER TABLE tok_connect_private.broker_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tok_connect_private.broker_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tok_connect_private.broker_clients, tok_connect_private.broker_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON tok_connect_private.broker_clients, tok_connect_private.broker_sessions TO service_role;

-- Retain spent hashes for the entire refresh family lifetime. A same-client
-- replay revokes descendants, including a refresh concurrently in progress.
CREATE TABLE tok_connect_private.broker_refresh_history (
  refresh_hash text PRIMARY KEY CHECK (refresh_hash ~ '^[0-9a-f]{64}$'),
  session_id uuid NOT NULL REFERENCES tok_connect_private.broker_sessions(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES tok_connect_private.broker_clients(client_id),
  consumed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tok_broker_refresh_history_session_idx ON tok_connect_private.broker_refresh_history(session_id);
ALTER TABLE tok_connect_private.broker_refresh_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tok_connect_private.broker_refresh_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON tok_connect_private.broker_refresh_history TO service_role;

-- Fail closed on an incompatible GoTrue schema. S256 is checked against the
-- approved, unexpired native code; the request's challenge-method hint is insufficient.
DO $schema_check$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'oauth_authorizations'
        AND column_name IN ('client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method',
          'authorization_code', 'status', 'expires_at', 'response_type')) <> 8 THEN
    RAISE EXCEPTION 'Unsupported GoTrue OAuth authorization schema';
  END IF;
END;
$schema_check$;
CREATE FUNCTION public.service_verify_tok_connect_broker_authorization(
  p_client_id text, p_code_hash text, p_redirect_uri text, p_code_challenge text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.oauth_authorizations a
    WHERE a.client_id::text = p_client_id AND a.redirect_uri = p_redirect_uri
      AND a.code_challenge_method::text = 's256' AND a.code_challenge = p_code_challenge
      AND a.authorization_code IS NOT NULL
      AND encode(extensions.digest(a.authorization_code::text, 'sha256'), 'hex') = p_code_hash
      AND a.status::text = 'approved' AND a.response_type::text = 'code' AND a.expires_at > now()
      AND EXISTS (SELECT 1 FROM tok_connect_private.broker_clients c WHERE c.client_id = p_client_id AND c.status = 'active')
  );
$$;
CREATE FUNCTION public.service_store_tok_connect_broker_client(
  p_client_id text, p_client_name text, p_redirect_uris text[], p_client_secret_ciphertext text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO tok_connect_private.broker_clients(client_id, client_name, redirect_uris, client_secret_ciphertext)
  VALUES (p_client_id, p_client_name, p_redirect_uris, p_client_secret_ciphertext);
  RETURN true;
END;
$$;
CREATE FUNCTION public.service_get_tok_connect_broker_client(p_client_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT to_jsonb(c) FROM tok_connect_private.broker_clients c WHERE c.client_id = p_client_id AND c.status = 'active';
$$;
CREATE FUNCTION public.get_tok_connect_managed_oauth_clients(p_client_ids text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.jwt() ? 'client_id' THEN RAISE EXCEPTION 'native_session_required' USING ERRCODE = '42501'; END IF;
  IF p_client_ids IS NULL OR cardinality(p_client_ids) > 100 THEN RAISE EXCEPTION 'client_ids_invalid' USING ERRCODE = '22023'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(c.client_id ORDER BY c.client_id), '[]'::jsonb)
    FROM tok_connect_private.broker_clients c WHERE c.status = 'active' AND c.client_id = ANY(p_client_ids));
END;
$$;
CREATE FUNCTION public.service_create_tok_connect_broker_session(
  p_id uuid, p_client_id text, p_user_id uuid, p_access_hash text, p_refresh_hash text,
  p_supabase_access_ciphertext text, p_supabase_refresh_ciphertext text, p_access_expires_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Serialize session creation with the native user's grant revocation.
  PERFORM 1 FROM public.tok_connect_oauth_grants g WHERE g.user_id = p_user_id AND g.client_id = p_client_id
    AND g.revoked_at IS NULL AND g.expires_at > now() FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM tok_connect_private.broker_clients c WHERE c.client_id = p_client_id AND c.status = 'active')
    OR p_access_expires_at IS NULL OR p_access_expires_at <= now() OR p_access_expires_at > now() + interval '301 seconds' THEN
    RAISE EXCEPTION 'active_grant_required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM tok_connect_private.broker_sessions WHERE id IN
    (SELECT id FROM tok_connect_private.broker_sessions WHERE refresh_expires_at < now() ORDER BY refresh_expires_at LIMIT 32 FOR UPDATE SKIP LOCKED);
  INSERT INTO tok_connect_private.broker_sessions(id, client_id, user_id, access_hash, refresh_hash, supabase_access_ciphertext, supabase_refresh_ciphertext, access_expires_at)
  VALUES (p_id, p_client_id, p_user_id, p_access_hash, p_refresh_hash, p_supabase_access_ciphertext, p_supabase_refresh_ciphertext, p_access_expires_at);
  RETURN true;
END;
$$;
CREATE FUNCTION public.service_resolve_tok_connect_broker_access(p_access_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', s.id, 'client_id', s.client_id, 'user_id', s.user_id, 'supabase_access_ciphertext', s.supabase_access_ciphertext)
  FROM tok_connect_private.broker_sessions s JOIN tok_connect_private.broker_clients c USING (client_id)
  WHERE s.access_hash = p_access_hash AND s.state = 'active' AND s.access_expires_at > now() AND s.refresh_expires_at > now() AND c.status = 'active';
$$;
CREATE FUNCTION public.service_claim_tok_connect_broker_refresh(p_refresh_hash text, p_client_id text, p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE claimed tok_connect_private.broker_sessions%ROWTYPE;
BEGIN
  IF p_claim_id IS NULL THEN RETURN NULL; END IF;
  SELECT s.* INTO claimed FROM tok_connect_private.broker_sessions s
  WHERE s.client_id = p_client_id AND (s.refresh_hash = p_refresh_hash OR EXISTS (
    SELECT 1 FROM tok_connect_private.broker_refresh_history h WHERE h.session_id = s.id
      AND h.client_id = p_client_id AND h.refresh_hash = p_refresh_hash)) FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF claimed.state <> 'active' OR claimed.refresh_expires_at <= now()
    OR EXISTS (SELECT 1 FROM tok_connect_private.broker_refresh_history h WHERE h.refresh_hash = p_refresh_hash AND h.client_id = p_client_id)
    OR NOT EXISTS (SELECT 1 FROM tok_connect_private.broker_clients c WHERE c.client_id = p_client_id AND c.status = 'active')
    OR NOT EXISTS (SELECT 1 FROM public.tok_connect_oauth_grants g WHERE g.user_id = claimed.user_id AND g.client_id = p_client_id AND g.revoked_at IS NULL AND g.expires_at > now()) THEN
    UPDATE tok_connect_private.broker_sessions SET state = 'revoked', refresh_claim_id = NULL, updated_at = now() WHERE id = claimed.id;
    RETURN NULL;
  END IF;
  INSERT INTO tok_connect_private.broker_refresh_history(refresh_hash, session_id, client_id) VALUES (p_refresh_hash, claimed.id, p_client_id);
  UPDATE tok_connect_private.broker_sessions SET state = 'refreshing', refresh_claim_id = p_claim_id, updated_at = now() WHERE id = claimed.id;
  RETURN jsonb_build_object('id', claimed.id, 'client_id', claimed.client_id, 'user_id', claimed.user_id, 'supabase_refresh_ciphertext', claimed.supabase_refresh_ciphertext);
END;
$$;
CREATE FUNCTION public.service_rotate_tok_connect_broker_refresh(
  p_id uuid, p_claim_id uuid, p_access_hash text, p_refresh_hash text,
  p_supabase_access_ciphertext text, p_supabase_refresh_ciphertext text, p_access_expires_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_access_expires_at IS NULL OR p_access_expires_at <= now() OR p_access_expires_at > now() + interval '301 seconds' THEN RETURN false; END IF;
  UPDATE tok_connect_private.broker_sessions s SET access_hash = p_access_hash, refresh_hash = p_refresh_hash,
    supabase_access_ciphertext = p_supabase_access_ciphertext, supabase_refresh_ciphertext = p_supabase_refresh_ciphertext,
    access_expires_at = p_access_expires_at, state = 'active', refresh_claim_id = NULL, rotation = rotation + 1, updated_at = now()
  WHERE s.id = p_id AND s.refresh_claim_id = p_claim_id AND s.state = 'refreshing' AND s.refresh_expires_at > now()
    AND EXISTS (SELECT 1 FROM tok_connect_private.broker_clients c WHERE c.client_id = s.client_id AND c.status = 'active')
    AND EXISTS (SELECT 1 FROM public.tok_connect_oauth_grants g WHERE g.user_id = s.user_id AND g.client_id = s.client_id AND g.revoked_at IS NULL AND g.expires_at > now());
  RETURN FOUND;
END;
$$;
CREATE FUNCTION public.service_revoke_tok_connect_broker_session(p_id uuid, p_claim_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE tok_connect_private.broker_sessions SET state = 'revoked', refresh_claim_id = NULL, updated_at = now()
  WHERE id = p_id AND refresh_claim_id = p_claim_id AND state = 'refreshing';
  RETURN FOUND;
END;
$$;

CREATE TABLE tok_connect_private.execution_permits (
  permit_hash text PRIMARY KEY CHECK (permit_hash ~ '^[0-9a-f]{64}$'),
  grant_id uuid NOT NULL REFERENCES public.tok_connect_oauth_grants(id) ON DELETE CASCADE,
  grant_revision bigint NOT NULL, user_id uuid NOT NULL, client_id text NOT NULL, session_id text NOT NULL,
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'), scope text NOT NULL,
  operation text NOT NULL, restaurant_id uuid,
  audience text NOT NULL CHECK (audience IN ('data', 'edge')),
  method text NOT NULL CHECK (method IN ('GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'PUT')),
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 512), body_hash text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '120 seconds'
);
CREATE INDEX tok_oauth_permits_expiry_idx ON tok_connect_private.execution_permits(expires_at);
ALTER TABLE tok_connect_private.execution_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tok_connect_private.execution_permits FROM PUBLIC, anon, authenticated;
GRANT ALL ON tok_connect_private.execution_permits TO service_role;

CREATE FUNCTION public.list_tok_connect_oauth_restaurants()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.jwt() ? 'client_id' THEN RAISE EXCEPTION 'native_session_required' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(eligible)), '[]'::jsonb) FROM (
    SELECT r.id, r.name, r.owner_id = auth.uid() AS is_owner FROM public.restaurants r
    WHERE r.tok_connect_mcp_enabled = true AND (r.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.restaurant_staff s WHERE s.restaurant_id = r.id AND s.user_id = auth.uid()
        AND lower(s.role::text) IN ('owner', 'manager', 'finance', 'marketing', 'analyst')))
    ORDER BY r.name, r.id LIMIT 100
  ) eligible);
END;
$$;
CREATE FUNCTION public.set_tok_connect_oauth_grant(p_client_id text, p_client_name text, p_scopes text[], p_restaurant_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public.tok_connect_oauth_grants%ROWTYPE;
allowed constant text[] := ARRAY['restaurants:read','availability:read','reservations:create','reservations:cancel',
  'account:read','account:write','orders:read','orders:create','subscriptions:read','subscriptions:write','loyalty:write','reviews:write',
  'support:write','restaurant:read','restaurant:write','restaurant:generate','credits:read','campaigns:preview','analytics:read','autopilot:plan'];
owner_scopes constant text[] := ARRAY['restaurant:read','restaurant:write','restaurant:generate'];
restaurant_scopes constant text[] := ARRAY['restaurant:read','restaurant:write','restaurant:generate','credits:read','campaigns:preview','analytics:read','autopilot:plan'];
BEGIN
  IF auth.uid() IS NULL OR auth.jwt() ? 'client_id' THEN RAISE EXCEPTION 'native_session_required' USING ERRCODE = '42501'; END IF;
  IF p_client_id IS NULL OR length(p_client_id) NOT BETWEEN 1 AND 256 OR p_client_id !~ '^[A-Za-z0-9_.:-]+$' OR p_scopes IS NULL OR cardinality(p_scopes) NOT BETWEEN 1 AND 20
    OR NOT (p_scopes <@ allowed) OR array_position(p_scopes, NULL) IS NOT NULL OR p_restaurant_ids IS NULL
    OR cardinality(p_restaurant_ids) > 100 OR array_position(p_restaurant_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'grant_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tok_connect_private.broker_clients c WHERE c.client_id = p_client_id AND c.status = 'active') THEN
    RAISE EXCEPTION 'managed_client_required' USING ERRCODE = '42501';
  END IF;
  IF p_scopes && restaurant_scopes AND cardinality(p_restaurant_ids) = 0 THEN RAISE EXCEPTION 'restaurant_selection_required' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_restaurant_ids) AS requested(restaurant_id) WHERE NOT EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.id = requested.restaurant_id AND r.tok_connect_mcp_enabled = true
      AND (r.owner_id = auth.uid() OR (NOT (p_scopes && owner_scopes) AND EXISTS (
        SELECT 1 FROM public.restaurant_staff s WHERE s.restaurant_id = r.id AND s.user_id = auth.uid()
          AND lower(s.role::text) IN ('owner', 'manager', 'finance', 'marketing', 'analyst'))))
  )) THEN RAISE EXCEPTION 'restaurant_access_required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tok_connect_oauth_grants g WHERE g.user_id = auth.uid() AND g.client_id = p_client_id)
    AND (SELECT count(*) FROM public.tok_connect_oauth_grants g WHERE g.user_id = auth.uid()) >= 100 THEN
    RAISE EXCEPTION 'grant_limit_reached' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.tok_connect_oauth_grants(user_id, client_id, client_name, scopes, restaurant_ids)
  VALUES (auth.uid(), p_client_id, left(coalesce(p_client_name, ''), 180), ARRAY(SELECT DISTINCT unnest(p_scopes)), ARRAY(SELECT DISTINCT unnest(p_restaurant_ids)))
  ON CONFLICT (user_id, client_id) DO UPDATE SET client_name = EXCLUDED.client_name, scopes = EXCLUDED.scopes,
    restaurant_ids = EXCLUDED.restaurant_ids, revision = tok_connect_oauth_grants.revision + 1,
    updated_at = now(), expires_at = now() + interval '90 days', revoked_at = NULL RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$$;
CREATE FUNCTION public.revoke_tok_connect_oauth_grant(p_client_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.jwt() ? 'client_id' THEN RAISE EXCEPTION 'native_session_required' USING ERRCODE = '42501'; END IF;
  UPDATE public.tok_connect_oauth_grants SET revoked_at = now(), revision = revision + 1, updated_at = now()
    WHERE user_id = auth.uid() AND client_id = p_client_id;
  UPDATE tok_connect_private.broker_sessions SET state = 'revoked', refresh_claim_id = NULL, updated_at = now()
    WHERE user_id = auth.uid() AND client_id = p_client_id;
  RETURN true;
END;
$$;
CREATE FUNCTION public.service_create_tok_connect_oauth_permit(
  p_permit_hash text, p_grant_id uuid, p_grant_revision bigint, p_user_id uuid, p_client_id text,
  p_session_id text, p_token_hash text, p_scope text, p_operation text, p_restaurant_id uuid,
  p_audience text, p_method text, p_path text, p_body_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) NOT BETWEEN 1 AND 256 OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_operation IS NULL OR p_operation !~ '^tok_[a-z_]{1,100}$' THEN RAISE EXCEPTION 'permit_invalid' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.tok_connect_oauth_grants g WHERE g.id = p_grant_id AND g.user_id = p_user_id AND g.client_id = p_client_id
    AND g.revision = p_grant_revision AND g.revoked_at IS NULL AND g.expires_at > now() AND p_scope = ANY(g.scopes)
    AND (p_restaurant_id IS NULL OR p_restaurant_id = ANY(g.restaurant_ids)) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_grant_required' USING ERRCODE = '42501'; END IF;
  DELETE FROM tok_connect_private.execution_permits WHERE permit_hash IN
    (SELECT permit_hash FROM tok_connect_private.execution_permits WHERE expires_at < now() ORDER BY expires_at LIMIT 32 FOR UPDATE SKIP LOCKED);
  INSERT INTO tok_connect_private.execution_permits(permit_hash, grant_id, grant_revision, user_id, client_id, session_id, token_hash, scope, operation, restaurant_id, audience, method, path, body_hash)
  VALUES (p_permit_hash, p_grant_id, p_grant_revision, p_user_id, p_client_id, p_session_id, p_token_hash, p_scope, p_operation, p_restaurant_id, p_audience, p_method, p_path, p_body_hash);
  RETURN true;
END;
$$;
CREATE FUNCTION public.service_validate_tok_connect_oauth_edge_permit(
  p_permit_hash text, p_user_id uuid, p_client_id text, p_session_id text, p_token_hash text,
  p_method text, p_path text, p_body_hash text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('grant', to_jsonb(g), 'scope', p.scope, 'operation', p.operation, 'restaurant_id', p.restaurant_id)
  FROM tok_connect_private.execution_permits p JOIN public.tok_connect_oauth_grants g ON g.id = p.grant_id
  WHERE p.permit_hash = p_permit_hash AND p.user_id = p_user_id AND p.client_id = p_client_id
    AND p.session_id = p_session_id AND p.token_hash = p_token_hash AND p.method = p_method
    AND p.path = p_path AND p.body_hash = p_body_hash AND p.audience = 'edge' AND p.expires_at > now()
    AND g.user_id = p.user_id AND g.client_id = p.client_id AND g.revision = p.grant_revision
    AND g.revoked_at IS NULL AND g.expires_at > now() AND p.scope = ANY(g.scopes);
$$;
CREATE FUNCTION public.tok_connect_oauth_request_allowed()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE claims jsonb := auth.jwt(); headers jsonb; permit text; token text;
BEGIN
  IF NOT (claims ? 'client_id') THEN RETURN true; END IF;
  headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  permit := headers->>'x-tok-oauth-permit'; token := regexp_replace(headers->>'authorization', '^Bearer ', '');
  IF permit IS NULL OR permit !~ '^[0-9a-f]{64}$' OR token IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM tok_connect_private.execution_permits p
    JOIN public.tok_connect_oauth_grants g ON g.id = p.grant_id
    WHERE p.permit_hash = encode(extensions.digest(permit, 'sha256'), 'hex') AND p.audience = 'data'
      AND p.user_id = auth.uid() AND p.client_id = claims->>'client_id' AND p.session_id = claims->>'session_id'
      AND p.token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
      AND p.method = current_setting('request.method', true)
      AND p.path = regexp_replace(current_setting('request.path', true), '^/rest/v1', '')
      AND p.expires_at > now() AND g.user_id = p.user_id AND g.client_id = p.client_id
      AND g.revision = p.grant_revision AND g.revoked_at IS NULL AND g.expires_at > now() AND p.scope = ANY(g.scopes));
EXCEPTION WHEN others THEN RETURN false;
END;
$$;
CREATE FUNCTION public.enforce_tok_connect_oauth_and_launch_gate()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.tok_connect_oauth_request_allowed() THEN
    RAISE EXCEPTION 'tok_connect_native_access_forbidden' USING ERRCODE = 'PT403', DETAIL = 'Use the TOK connector with explicit permissions.';
  END IF;
  PERFORM public.enforce_launch_gate();
END;
$$;

-- Restrictive policies compose with existing tenant policies (AND), including
-- Storage and Realtime entry points which do not run PostgREST's pre-request hook.
DO $policies$
DECLARE target record;
BEGIN
  FOR target IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relrowsecurity AND c.relkind IN ('r', 'p') AND
      (n.nspname = 'public' OR (n.nspname = 'storage' AND c.relname = 'objects') OR (n.nspname = 'realtime' AND c.relname = 'messages'))
  LOOP
    EXECUTE format('CREATE POLICY tok_connect_oauth_isolation ON %I.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING ((SELECT public.tok_connect_oauth_request_allowed())) WITH CHECK ((SELECT public.tok_connect_oauth_request_allowed()))', target.nspname, target.relname);
  END LOOP;
END;
$policies$;

REVOKE ALL ON FUNCTION public.get_tok_connect_managed_oauth_clients(text[]), public.list_tok_connect_oauth_restaurants(),
  public.set_tok_connect_oauth_grant(text,text,text[],uuid[]), public.revoke_tok_connect_oauth_grant(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tok_connect_managed_oauth_clients(text[]), public.list_tok_connect_oauth_restaurants(),
  public.set_tok_connect_oauth_grant(text,text,text[],uuid[]), public.revoke_tok_connect_oauth_grant(text) TO authenticated;
REVOKE ALL ON FUNCTION public.service_verify_tok_connect_broker_authorization(text,text,text,text),
  public.service_store_tok_connect_broker_client(text,text,text[],text), public.service_get_tok_connect_broker_client(text),
  public.service_create_tok_connect_broker_session(uuid,text,uuid,text,text,text,text,timestamptz), public.service_resolve_tok_connect_broker_access(text),
  public.service_claim_tok_connect_broker_refresh(text,text,uuid), public.service_rotate_tok_connect_broker_refresh(uuid,uuid,text,text,text,text,timestamptz),
  public.service_revoke_tok_connect_broker_session(uuid,uuid),
  public.service_create_tok_connect_oauth_permit(text,uuid,bigint,uuid,text,text,text,text,text,uuid,text,text,text,text),
  public.service_validate_tok_connect_oauth_edge_permit(text,uuid,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_verify_tok_connect_broker_authorization(text,text,text,text),
  public.service_store_tok_connect_broker_client(text,text,text[],text), public.service_get_tok_connect_broker_client(text),
  public.service_create_tok_connect_broker_session(uuid,text,uuid,text,text,text,text,timestamptz), public.service_resolve_tok_connect_broker_access(text),
  public.service_claim_tok_connect_broker_refresh(text,text,uuid), public.service_rotate_tok_connect_broker_refresh(uuid,uuid,text,text,text,text,timestamptz),
  public.service_revoke_tok_connect_broker_session(uuid,uuid),
  public.service_create_tok_connect_oauth_permit(text,uuid,bigint,uuid,text,text,text,text,text,uuid,text,text,text,text),
  public.service_validate_tok_connect_oauth_edge_permit(text,uuid,text,text,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.tok_connect_oauth_request_allowed(), public.enforce_tok_connect_oauth_and_launch_gate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tok_connect_oauth_request_allowed(), public.enforce_tok_connect_oauth_and_launch_gate() TO anon, authenticated, service_role;

DO $hook$
DECLARE current_hook text;
BEGIN
  SELECT split_part(setting, '=', 2) INTO current_hook FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
    CROSS JOIN LATERAL unnest(s.setconfig) AS config(setting)
    WHERE r.rolname = 'authenticator' AND setting LIKE 'pgrst.db_pre_request=%'
      AND s.setdatabase IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
    ORDER BY s.setdatabase DESC LIMIT 1;
  IF current_hook IS DISTINCT FROM 'public.enforce_launch_gate' THEN
    RAISE EXCEPTION 'Review existing PostgREST pre-request hook before composing TOK OAuth isolation';
  END IF;
  -- A database-specific role setting overrides the global role setting. Set the
  -- effective scope explicitly so an existing launch hook cannot shadow this one.
  EXECUTE format('ALTER ROLE authenticator IN DATABASE %I SET pgrst.db_pre_request = %L',
    current_database(), 'public.enforce_tok_connect_oauth_and_launch_gate');
END;
$hook$;
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
COMMIT;
