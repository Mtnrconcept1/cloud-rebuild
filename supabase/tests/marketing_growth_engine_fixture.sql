-- Disposable PostgreSQL fixture only. NEVER apply to TOK or a shared project.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES('11111111-1111-4111-8111-111111111111');
CREATE TABLE public.user_roles(user_id uuid,role text);
INSERT INTO public.user_roles VALUES('11111111-1111-4111-8111-111111111111','admin');
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION public.marketing_require_service_role() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
END; $$;
CREATE FUNCTION public.service_get_marketing_web_session(sid text,csrf text,touch boolean) RETURNS jsonb LANGUAGE sql AS $$
 SELECT CASE WHEN sid=repeat('1',64) AND csrf=repeat('2',64) THEN
 '{"user_id":"11111111-1111-4111-8111-111111111111","mfa_verified_at":"2026-11-01T08:00:00Z"}'::jsonb ELSE NULL END
$$;
CREATE FUNCTION public.marketing_runtime_enabled() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
