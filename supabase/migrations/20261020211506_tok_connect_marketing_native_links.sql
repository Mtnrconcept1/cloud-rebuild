-- Bind a delegated TOK client to an existing, separately MFA-verified marketing
-- session. No native credential is returned to the browser or delegated client.
BEGIN;

CREATE TABLE tok_connect_private.marketing_links (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  grant_id uuid NOT NULL REFERENCES public.tok_connect_oauth_grants(id) ON DELETE CASCADE,
  grant_revision bigint NOT NULL,
  challenge_hash text UNIQUE CHECK (challenge_hash ~ '^[0-9a-f]{64}$'),
  challenge_expires_at timestamptz,
  session_hash text CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  csrf_hash text CHECK (csrf_hash ~ '^[0-9a-f]{64}$'),
  authorized_at timestamptz,
  PRIMARY KEY (user_id, client_id),
  CHECK ((challenge_hash IS NULL) = (challenge_expires_at IS NULL)),
  CHECK ((session_hash IS NULL) = (csrf_hash IS NULL)),
  CHECK ((session_hash IS NULL) = (authorized_at IS NULL))
);
ALTER TABLE tok_connect_private.marketing_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tok_connect_private.marketing_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON tok_connect_private.marketing_links TO service_role;

CREATE FUNCTION public.service_create_tok_marketing_link(p_user_id uuid, p_client_id text, p_challenge_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_grant public.tok_connect_oauth_grants%ROWTYPE; v_expires timestamptz;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_challenge_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid marketing link challenge' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_grant FROM public.tok_connect_oauth_grants g
  WHERE g.user_id = p_user_id AND g.client_id = p_client_id
    AND g.revoked_at IS NULL AND g.expires_at > clock_timestamp() FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role::text = 'admin') THEN
    RETURN NULL;
  END IF;
  v_expires := LEAST(clock_timestamp() + interval '10 minutes', v_grant.expires_at);
  INSERT INTO tok_connect_private.marketing_links(user_id, client_id, grant_id, grant_revision, challenge_hash, challenge_expires_at)
  VALUES(p_user_id, p_client_id, v_grant.id, v_grant.revision, p_challenge_hash, v_expires)
  ON CONFLICT (user_id, client_id) DO UPDATE SET
    grant_id = EXCLUDED.grant_id, grant_revision = EXCLUDED.grant_revision,
    challenge_hash = EXCLUDED.challenge_hash, challenge_expires_at = EXCLUDED.challenge_expires_at,
    session_hash = NULL, csrf_hash = NULL, authorized_at = NULL;
  RETURN jsonb_build_object('status', 'pending', 'expires_at', v_expires);
END;
$$;

CREATE FUNCTION public.service_describe_tok_marketing_link(p_challenge_hash text, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  SELECT jsonb_build_object('client_name', g.client_name, 'expires_at', l.challenge_expires_at) INTO v_result
  FROM tok_connect_private.marketing_links l JOIN public.tok_connect_oauth_grants g ON g.id = l.grant_id
  WHERE l.challenge_hash = p_challenge_hash AND l.user_id = p_user_id
    AND l.challenge_expires_at > clock_timestamp() AND l.authorized_at IS NULL
    AND g.user_id = l.user_id AND g.client_id = l.client_id AND g.revision = l.grant_revision
    AND g.revoked_at IS NULL AND g.expires_at > clock_timestamp()
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role::text = 'admin');
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.service_authorize_tok_marketing_link(p_challenge_hash text, p_sid_hash text, p_csrf_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_link tok_connect_private.marketing_links%ROWTYPE; v_session jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_csrf_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE THEN RETURN NULL; END IF;
  SELECT * INTO v_link FROM tok_connect_private.marketing_links l
  WHERE l.challenge_hash = p_challenge_hash AND l.challenge_expires_at > clock_timestamp()
    AND l.authorized_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.tok_connect_oauth_grants g
  WHERE g.id = v_link.grant_id AND g.user_id = v_link.user_id AND g.client_id = v_link.client_id
    AND g.revision = v_link.grant_revision AND g.revoked_at IS NULL AND g.expires_at > clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_session := public.service_get_marketing_web_session(p_sid_hash, p_csrf_hash, false);
  IF v_session IS NULL OR (v_session->>'user_id')::uuid IS DISTINCT FROM v_link.user_id THEN RETURN NULL; END IF;
  UPDATE tok_connect_private.marketing_links SET challenge_hash = NULL, challenge_expires_at = NULL,
    session_hash = p_sid_hash, csrf_hash = p_csrf_hash, authorized_at = clock_timestamp()
  WHERE user_id = v_link.user_id AND client_id = v_link.client_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE FUNCTION public.service_get_tok_marketing_link(p_user_id uuid, p_client_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_link tok_connect_private.marketing_links%ROWTYPE; v_session jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  SELECT l.* INTO v_link FROM tok_connect_private.marketing_links l
  JOIN public.tok_connect_oauth_grants g ON g.id = l.grant_id
  WHERE l.user_id = p_user_id AND l.client_id = p_client_id AND l.authorized_at IS NOT NULL
    AND g.user_id = l.user_id AND g.client_id = l.client_id AND g.revision = l.grant_revision
    AND g.revoked_at IS NULL AND g.expires_at > clock_timestamp()
  FOR SHARE OF l, g;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_session := public.service_get_marketing_web_session(v_link.session_hash, v_link.csrf_hash, false);
  IF v_session IS NULL OR (v_session->>'user_id')::uuid IS DISTINCT FROM p_user_id THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('user_id', p_user_id, 'email', v_session->>'email',
    'expires_at', v_session->>'expires_at', 'session_hash', v_link.session_hash, 'csrf_hash', v_link.csrf_hash);
END;
$$;

CREATE FUNCTION public.service_revoke_tok_marketing_link(p_user_id uuid, p_client_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  PERFORM public.marketing_require_service_role();
  DELETE FROM tok_connect_private.marketing_links WHERE user_id = p_user_id AND client_id = p_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.service_create_tok_marketing_link(uuid,text,text),
  public.service_describe_tok_marketing_link(text,uuid),
  public.service_authorize_tok_marketing_link(text,text,text),
  public.service_get_tok_marketing_link(uuid,text), public.service_revoke_tok_marketing_link(uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_create_tok_marketing_link(uuid,text,text),
  public.service_describe_tok_marketing_link(text,uuid),
  public.service_authorize_tok_marketing_link(text,text,text),
  public.service_get_tok_marketing_link(uuid,text), public.service_revoke_tok_marketing_link(uuid,text)
TO service_role;
COMMIT;
