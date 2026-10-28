-- Disposable PostgreSQL database only:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plinko_welcome_fixture.sql
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE TABLE public.feature_flags (
  name text PRIMARY KEY, label text NOT NULL, description text, is_active boolean NOT NULL
);
CREATE TABLE public.email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), to_email text NOT NULL,
  subject text NOT NULL, body_text text, status text DEFAULT 'queued',
  metadata jsonb DEFAULT '{}'::jsonb
);
\i supabase/migrations/20261028132220_tok_welcome_plinko.sql
\i supabase/tests/plinko_welcome_smoke.sql
