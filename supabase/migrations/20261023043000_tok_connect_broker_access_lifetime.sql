-- Keep TOK's opaque access token outside ChatGPT's eager refresh window while
-- preserving the native JWT expiration and every server-side revocation check.

CREATE OR REPLACE FUNCTION public.service_create_tok_connect_broker_session(
  p_id uuid, p_client_id text, p_user_id uuid, p_access_hash text, p_refresh_hash text,
  p_supabase_access_ciphertext text, p_supabase_refresh_ciphertext text, p_access_expires_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Serialize session creation with the native user's grant revocation.
  PERFORM 1 FROM public.tok_connect_oauth_grants g WHERE g.user_id = p_user_id AND g.client_id = p_client_id
    AND g.revoked_at IS NULL AND g.expires_at > now() FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM tok_connect_private.broker_clients c WHERE c.client_id = p_client_id AND c.status = 'active')
    OR p_access_expires_at IS NULL OR p_access_expires_at <= now() OR p_access_expires_at > now() + interval '3601 seconds' THEN
    RAISE EXCEPTION 'active_grant_required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM tok_connect_private.broker_sessions WHERE id IN
    (SELECT id FROM tok_connect_private.broker_sessions WHERE refresh_expires_at < now() ORDER BY refresh_expires_at LIMIT 32 FOR UPDATE SKIP LOCKED);
  INSERT INTO tok_connect_private.broker_sessions(id, client_id, user_id, access_hash, refresh_hash, supabase_access_ciphertext, supabase_refresh_ciphertext, access_expires_at)
  VALUES (p_id, p_client_id, p_user_id, p_access_hash, p_refresh_hash, p_supabase_access_ciphertext, p_supabase_refresh_ciphertext, p_access_expires_at);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_rotate_tok_connect_broker_refresh(
  p_id uuid, p_claim_id uuid, p_access_hash text, p_refresh_hash text,
  p_supabase_access_ciphertext text, p_supabase_refresh_ciphertext text, p_access_expires_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_access_expires_at IS NULL OR p_access_expires_at <= now() OR p_access_expires_at > now() + interval '3601 seconds' THEN RETURN false; END IF;
  UPDATE tok_connect_private.broker_sessions s SET access_hash = p_access_hash, refresh_hash = p_refresh_hash,
    supabase_access_ciphertext = p_supabase_access_ciphertext, supabase_refresh_ciphertext = p_supabase_refresh_ciphertext,
    access_expires_at = p_access_expires_at, state = 'active', refresh_claim_id = NULL, rotation = rotation + 1, updated_at = now()
  WHERE s.id = p_id AND s.refresh_claim_id = p_claim_id AND s.state = 'refreshing' AND s.refresh_expires_at > now()
    AND EXISTS (SELECT 1 FROM tok_connect_private.broker_clients c WHERE c.client_id = s.client_id AND c.status = 'active')
    AND EXISTS (SELECT 1 FROM public.tok_connect_oauth_grants g WHERE g.user_id = s.user_id AND g.client_id = s.client_id AND g.revoked_at IS NULL AND g.expires_at > now());
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.service_create_tok_connect_broker_session(
  uuid, text, uuid, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_rotate_tok_connect_broker_refresh(
  uuid, uuid, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_create_tok_connect_broker_session(
  uuid, text, uuid, text, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_rotate_tok_connect_broker_refresh(
  uuid, uuid, text, text, text, text, timestamptz
) TO service_role;
