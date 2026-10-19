-- ISOLATED TEST DATABASE ONLY. Minimal schema plus the existing session guards.
-- Guard bodies below are copied unchanged from 20260801190000_marketing_operations_center.sql.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(auth.jwt()->>'sub','')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE TABLE public.user_roles(user_id uuid,role text,PRIMARY KEY(user_id,role));
CREATE TABLE public.feature_flags(name text PRIMARY KEY,is_active boolean NOT NULL);
CREATE TABLE public.marketing_admin_web_sessions(
  sid_hash text PRIMARY KEY,csrf_hash text NOT NULL,user_id uuid REFERENCES auth.users(id),
  revoked_at timestamptz,revoke_reason text,expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),mfa_verified_at timestamptz
);
CREATE TABLE public.restaurants(id uuid PRIMARY KEY,name text,city text,opening_hours jsonb,directory_source_reference text,is_demo boolean DEFAULT false);
CREATE TABLE public.marketing_contacts(id uuid PRIMARY KEY,source_system text,source_reference text,source_objectid bigint,website text);
CREATE UNIQUE INDEX marketing_contacts_source_unique ON public.marketing_contacts(source_system,source_reference) WHERE source_reference IS NOT NULL;
CREATE TABLE public.marketing_integrations(id uuid PRIMARY KEY,name text,channel text,status text,public_configuration jsonb,secret_ref text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.audit_log(id uuid PRIMARY KEY,user_id uuid,action text,entity_type text,entity_id uuid,old_data jsonb,new_data jsonb,created_at timestamptz);
CREATE OR REPLACE FUNCTION public.marketing_actor_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.marketing_actor_user_id', true), '')::uuid,
    auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.marketing_require_service_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_get_marketing_web_session(
  p_sid_hash text,
  p_csrf_hash text DEFAULT NULL,
  p_touch boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.marketing_admin_web_sessions%ROWTYPE;
  v_email text;
  v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_sid_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE
     OR (p_csrf_hash IS NOT NULL AND COALESCE(p_csrf_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_session
  FROM public.marketing_admin_web_sessions s
  WHERE s.sid_hash = p_sid_hash;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.feature_flags f
    WHERE f.name = 'admin-marketing-operations'
      AND f.is_active IS TRUE
  ) THEN
    UPDATE public.marketing_admin_web_sessions s
    SET revoked_at = COALESCE(s.revoked_at, v_now),
        revoke_reason = COALESCE(s.revoke_reason, 'feature_disabled')
    WHERE s.sid_hash = p_sid_hash;
    RETURN NULL;
  END IF;

  IF v_session.revoked_at IS NOT NULL OR v_session.expires_at <= v_now THEN
    IF v_session.revoked_at IS NULL THEN
      UPDATE public.marketing_admin_web_sessions s
      SET revoked_at = v_now, revoke_reason = 'expired'
      WHERE s.sid_hash = p_sid_hash;
    END IF;
    RETURN NULL;
  END IF;
  IF p_csrf_hash IS NOT NULL AND v_session.csrf_hash <> p_csrf_hash THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_session.user_id AND ur.role::text = 'admin'
  ) THEN
    UPDATE public.marketing_admin_web_sessions s
    SET revoked_at = v_now, revoke_reason = 'admin_role_removed'
    WHERE s.sid_hash = p_sid_hash;
    RETURN NULL;
  END IF;

  IF COALESCE(p_touch, false) THEN
    UPDATE public.marketing_admin_web_sessions s
    SET last_seen_at = GREATEST(s.last_seen_at, v_now)
    WHERE s.sid_hash = p_sid_hash
      AND s.revoked_at IS NULL
      AND s.expires_at > v_now;
    v_session.last_seen_at := v_now;
  END IF;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_session.user_id;

  RETURN jsonb_build_object(
    'user_id', v_session.user_id,
    'email', v_email,
    'mfa_verified_at', v_session.mfa_verified_at,
    'last_seen_at', v_session.last_seen_at,
    'expires_at', v_session.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_user_id uuid := public.marketing_actor_user_id();
  v_sid_hash text := NULLIF(current_setting('app.marketing_web_session_sid_hash', true), '');
BEGIN
  PERFORM public.marketing_require_service_role();
  IF v_actor_user_id IS NULL
     OR COALESCE(v_sid_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1
       FROM public.feature_flags f
       WHERE f.name = 'admin-marketing-operations'
         AND f.is_active IS TRUE
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.marketing_admin_web_sessions s
       WHERE s.sid_hash = v_sid_hash
         AND s.user_id = v_actor_user_id
         AND s.revoked_at IS NULL
         AND s.expires_at > clock_timestamp()
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = v_actor_user_id AND ur.role::text = 'admin'
     ) THEN
    RAISE EXCEPTION 'Active marketing BFF administrator session required'
      USING ERRCODE = '42501';
  END IF;
END;
$$;
