BEGIN;

CREATE TABLE IF NOT EXISTS public.tok_connect_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  partner_type text NOT NULL DEFAULT 'developer',
  status text NOT NULL DEFAULT 'pending',
  environment text NOT NULL DEFAULT 'sandbox',
  website_url text,
  contact_email text,
  billing_tier text NOT NULL DEFAULT 'free_developer',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tok_connect_partners_status_check CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT tok_connect_partners_environment_check CHECK (environment IN ('sandbox', 'production'))
);

CREATE TABLE IF NOT EXISTS public.tok_connect_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.tok_connect_partners(id) ON DELETE CASCADE,
  client_id text NOT NULL UNIQUE,
  client_secret_hash text NOT NULL,
  name text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  allowed_scopes text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'active',
  token_ttl_seconds integer NOT NULL DEFAULT 900,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_rotated_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tok_connect_clients_status_check CHECK (status IN ('active', 'suspended', 'revoked')),
  CONSTRAINT tok_connect_clients_environment_check CHECK (environment IN ('sandbox', 'production')),
  CONSTRAINT tok_connect_clients_ttl_check CHECK (token_ttl_seconds BETWEEN 60 AND 3600)
);

CREATE TABLE IF NOT EXISTS public.tok_connect_partner_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.tok_connect_partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, user_id),
  CONSTRAINT tok_connect_partner_members_role_check CHECK (role IN ('owner', 'developer', 'viewer')),
  CONSTRAINT tok_connect_partner_members_status_check CHECK (status IN ('active', 'suspended'))
);

CREATE TABLE IF NOT EXISTS public.tok_connect_restaurant_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.tok_connect_partners(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  allowed_scopes text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'pending',
  allow_mcp boolean NOT NULL DEFAULT false,
  max_daily_reservations integer NOT NULL DEFAULT 0,
  max_party_size integer NOT NULL DEFAULT 8,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, restaurant_id),
  CONSTRAINT tok_connect_restaurant_grants_status_check CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT tok_connect_restaurant_grants_limits_check CHECK (max_daily_reservations >= 0 AND max_party_size BETWEEN 1 AND 50)
);

CREATE TABLE IF NOT EXISTS public.tok_connect_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.tok_connect_partners(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.tok_connect_clients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  environment text NOT NULL DEFAULT 'sandbox',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tok_connect_access_tokens_environment_check CHECK (environment IN ('sandbox', 'production'))
);

CREATE TABLE IF NOT EXISTS public.tok_connect_api_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.tok_connect_partners(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.tok_connect_clients(id) ON DELETE SET NULL,
  access_token_id uuid REFERENCES public.tok_connect_access_tokens(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  request_id text NOT NULL UNIQUE,
  method text NOT NULL,
  route text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  status_code integer,
  latency_ms integer,
  idempotency_key text,
  error_code text,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tok_connect_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.tok_connect_partners(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.tok_connect_clients(id) ON DELETE CASCADE,
  key text NOT NULL,
  operation text NOT NULL,
  request_hash text,
  response_body jsonb,
  status_code integer,
  resource_type text,
  resource_id uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, key)
);

CREATE TABLE IF NOT EXISTS public.tok_connect_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.tok_connect_partners(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}'::text[],
  signing_secret text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_rotated_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tok_connect_webhook_endpoints_status_check CHECK (status IN ('active', 'paused', 'revoked'))
);

CREATE TABLE IF NOT EXISTS public.tok_connect_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid REFERENCES public.tok_connect_webhook_endpoints(id) ON DELETE SET NULL,
  partner_id uuid NOT NULL REFERENCES public.tok_connect_partners(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  response_status integer,
  error_message text,
  signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tok_connect_webhook_deliveries_status_check CHECK (status IN ('pending', 'delivered', 'failed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.tok_connect_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.tok_connect_partners(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'suggest',
  tool_name text NOT NULL,
  status text NOT NULL DEFAULT 'preview',
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tok_connect_agent_runs_mode_check CHECK (mode IN ('read_only', 'suggest', 'preview')),
  CONSTRAINT tok_connect_agent_runs_status_check CHECK (status IN ('preview', 'approved', 'rejected', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_tok_connect_clients_partner_id ON public.tok_connect_clients(partner_id);
CREATE INDEX IF NOT EXISTS idx_tok_connect_partner_members_user_id ON public.tok_connect_partner_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tok_connect_restaurant_grants_restaurant_id ON public.tok_connect_restaurant_grants(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tok_connect_restaurant_grants_partner_restaurant ON public.tok_connect_restaurant_grants(partner_id, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tok_connect_access_tokens_token_hash ON public.tok_connect_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_tok_connect_api_requests_client_created ON public.tok_connect_api_requests(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tok_connect_webhook_deliveries_endpoint_status ON public.tok_connect_webhook_deliveries(endpoint_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tok_connect_webhook_endpoints_partner_id ON public.tok_connect_webhook_endpoints(partner_id);
CREATE INDEX IF NOT EXISTS idx_tok_connect_agent_runs_partner_created ON public.tok_connect_agent_runs(partner_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tok_connect_is_partner_member(p_partner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tok_connect_partner_members member
    WHERE member.partner_id = p_partner_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.tok_connect_restaurant_grant_enabled(
  p_partner_id uuid,
  p_restaurant_id uuid,
  p_scope text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tok_connect_restaurant_grants grant_row
    WHERE grant_row.partner_id = p_partner_id
      AND grant_row.restaurant_id = p_restaurant_id
      AND grant_row.status = 'active'
      AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())
      AND p_scope = ANY(grant_row.allowed_scopes)
  );
$$;

REVOKE ALL ON FUNCTION public.tok_connect_is_partner_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tok_connect_restaurant_grant_enabled(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tok_connect_is_partner_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tok_connect_restaurant_grant_enabled(uuid, uuid, text) TO authenticated, service_role;

ALTER TABLE public.tok_connect_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_connect_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_connect_partner_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_connect_restaurant_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_connect_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_connect_api_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_connect_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_connect_webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_connect_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tok_connect_agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tok_connect_partners_admin_all" ON public.tok_connect_partners;
DROP POLICY IF EXISTS "tok_connect_partners_member_select" ON public.tok_connect_partners;
DROP POLICY IF EXISTS "tok_connect_clients_admin_all" ON public.tok_connect_clients;
DROP POLICY IF EXISTS "tok_connect_clients_member_select" ON public.tok_connect_clients;
DROP POLICY IF EXISTS "tok_connect_partner_members_admin_all" ON public.tok_connect_partner_members;
DROP POLICY IF EXISTS "tok_connect_partner_members_member_select" ON public.tok_connect_partner_members;
DROP POLICY IF EXISTS "tok_connect_restaurant_grants_admin_all" ON public.tok_connect_restaurant_grants;
DROP POLICY IF EXISTS "tok_connect_restaurant_grants_restaurant_select" ON public.tok_connect_restaurant_grants;
DROP POLICY IF EXISTS "tok_connect_restaurant_grants_restaurant_update" ON public.tok_connect_restaurant_grants;
DROP POLICY IF EXISTS "tok_connect_access_tokens_admin_select" ON public.tok_connect_access_tokens;
DROP POLICY IF EXISTS "tok_connect_api_requests_admin_select" ON public.tok_connect_api_requests;
DROP POLICY IF EXISTS "tok_connect_api_requests_member_select" ON public.tok_connect_api_requests;
DROP POLICY IF EXISTS "tok_connect_idempotency_keys_admin_select" ON public.tok_connect_idempotency_keys;
DROP POLICY IF EXISTS "tok_connect_webhook_endpoints_admin_all" ON public.tok_connect_webhook_endpoints;
DROP POLICY IF EXISTS "tok_connect_webhook_endpoints_member_select" ON public.tok_connect_webhook_endpoints;
DROP POLICY IF EXISTS "tok_connect_webhook_deliveries_admin_select" ON public.tok_connect_webhook_deliveries;
DROP POLICY IF EXISTS "tok_connect_webhook_deliveries_member_select" ON public.tok_connect_webhook_deliveries;
DROP POLICY IF EXISTS "tok_connect_agent_runs_admin_select" ON public.tok_connect_agent_runs;
DROP POLICY IF EXISTS "tok_connect_agent_runs_member_select" ON public.tok_connect_agent_runs;

CREATE POLICY "tok_connect_partners_admin_all"
  ON public.tok_connect_partners
  FOR ALL
  TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY "tok_connect_partners_member_select"
  ON public.tok_connect_partners
  FOR SELECT
  TO authenticated
  USING (public.tok_connect_is_partner_member(id));

CREATE POLICY "tok_connect_clients_admin_all"
  ON public.tok_connect_clients
  FOR ALL
  TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY "tok_connect_partner_members_admin_all"
  ON public.tok_connect_partner_members
  FOR ALL
  TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY "tok_connect_partner_members_member_select"
  ON public.tok_connect_partner_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.tok_connect_is_partner_member(partner_id));

CREATE POLICY "tok_connect_restaurant_grants_admin_all"
  ON public.tok_connect_restaurant_grants
  FOR ALL
  TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY "tok_connect_restaurant_grants_restaurant_select"
  ON public.tok_connect_restaurant_grants
  FOR SELECT
  TO authenticated
  USING (
    public.auth_owns_restaurant(restaurant_id)
    OR public.auth_is_admin()
    OR public.tok_connect_is_partner_member(partner_id)
  );

CREATE POLICY "tok_connect_restaurant_grants_restaurant_update"
  ON public.tok_connect_restaurant_grants
  FOR UPDATE
  TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin())
  WITH CHECK (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());

CREATE POLICY "tok_connect_access_tokens_admin_select"
  ON public.tok_connect_access_tokens
  FOR SELECT
  TO authenticated
  USING (public.auth_is_admin());

CREATE POLICY "tok_connect_api_requests_admin_select"
  ON public.tok_connect_api_requests
  FOR SELECT
  TO authenticated
  USING (public.auth_is_admin());

CREATE POLICY "tok_connect_api_requests_member_select"
  ON public.tok_connect_api_requests
  FOR SELECT
  TO authenticated
  USING (partner_id IS NOT NULL AND public.tok_connect_is_partner_member(partner_id));

CREATE POLICY "tok_connect_idempotency_keys_admin_select"
  ON public.tok_connect_idempotency_keys
  FOR SELECT
  TO authenticated
  USING (public.auth_is_admin());

CREATE POLICY "tok_connect_webhook_endpoints_admin_all"
  ON public.tok_connect_webhook_endpoints
  FOR ALL
  TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY "tok_connect_webhook_deliveries_admin_select"
  ON public.tok_connect_webhook_deliveries
  FOR SELECT
  TO authenticated
  USING (public.auth_is_admin());

CREATE POLICY "tok_connect_webhook_deliveries_member_select"
  ON public.tok_connect_webhook_deliveries
  FOR SELECT
  TO authenticated
  USING (public.tok_connect_is_partner_member(partner_id));

CREATE POLICY "tok_connect_agent_runs_admin_select"
  ON public.tok_connect_agent_runs
  FOR SELECT
  TO authenticated
  USING (public.auth_is_admin());

CREATE POLICY "tok_connect_agent_runs_member_select"
  ON public.tok_connect_agent_runs
  FOR SELECT
  TO authenticated
  USING (partner_id IS NOT NULL AND public.tok_connect_is_partner_member(partner_id));

REVOKE ALL ON public.tok_connect_partners FROM anon;
REVOKE ALL ON public.tok_connect_clients FROM anon;
REVOKE ALL ON public.tok_connect_partner_members FROM anon;
REVOKE ALL ON public.tok_connect_restaurant_grants FROM anon;
REVOKE ALL ON public.tok_connect_access_tokens FROM anon;
REVOKE ALL ON public.tok_connect_api_requests FROM anon;
REVOKE ALL ON public.tok_connect_idempotency_keys FROM anon;
REVOKE ALL ON public.tok_connect_webhook_endpoints FROM anon;
REVOKE ALL ON public.tok_connect_webhook_deliveries FROM anon;
REVOKE ALL ON public.tok_connect_agent_runs FROM anon;

GRANT SELECT ON public.tok_connect_partners TO authenticated;
GRANT SELECT ON public.tok_connect_clients TO authenticated;
GRANT SELECT ON public.tok_connect_partner_members TO authenticated;
GRANT SELECT, UPDATE ON public.tok_connect_restaurant_grants TO authenticated;
GRANT SELECT ON public.tok_connect_access_tokens TO authenticated;
GRANT SELECT ON public.tok_connect_api_requests TO authenticated;
GRANT SELECT ON public.tok_connect_idempotency_keys TO authenticated;
GRANT SELECT ON public.tok_connect_webhook_endpoints TO authenticated;
GRANT SELECT ON public.tok_connect_webhook_deliveries TO authenticated;
GRANT SELECT ON public.tok_connect_agent_runs TO authenticated;

GRANT ALL ON public.tok_connect_partners TO service_role;
GRANT ALL ON public.tok_connect_clients TO service_role;
GRANT ALL ON public.tok_connect_partner_members TO service_role;
GRANT ALL ON public.tok_connect_restaurant_grants TO service_role;
GRANT ALL ON public.tok_connect_access_tokens TO service_role;
GRANT ALL ON public.tok_connect_api_requests TO service_role;
GRANT ALL ON public.tok_connect_idempotency_keys TO service_role;
GRANT ALL ON public.tok_connect_webhook_endpoints TO service_role;
GRANT ALL ON public.tok_connect_webhook_deliveries TO service_role;
GRANT ALL ON public.tok_connect_agent_runs TO service_role;

DROP TRIGGER IF EXISTS set_updated_at_tok_connect_partners ON public.tok_connect_partners;
CREATE TRIGGER set_updated_at_tok_connect_partners
  BEFORE UPDATE ON public.tok_connect_partners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_tok_connect_clients ON public.tok_connect_clients;
CREATE TRIGGER set_updated_at_tok_connect_clients
  BEFORE UPDATE ON public.tok_connect_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_tok_connect_restaurant_grants ON public.tok_connect_restaurant_grants;
CREATE TRIGGER set_updated_at_tok_connect_restaurant_grants
  BEFORE UPDATE ON public.tok_connect_restaurant_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_tok_connect_webhook_endpoints ON public.tok_connect_webhook_endpoints;
CREATE TRIGGER set_updated_at_tok_connect_webhook_endpoints
  BEFORE UPDATE ON public.tok_connect_webhook_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  ('tok-connect', 'TOK Connect', 'Active le portail public TOK Connect et son portail développeur.', true),
  ('tok-connect-api', 'TOK Connect API', 'Active l API REST versionnée TOK Connect.', true),
  ('tok-connect-mcp', 'TOK Connect MCP', 'Active le serveur MCP prudent TOK Connect.', true),
  ('tok-connect-webhooks', 'TOK Connect Webhooks', 'Active les webhooks sortants signés TOK Connect.', true),
  ('tok-connect-autopilot', 'TOK Connect Autopilot', 'Garde les actions autonomes désactivées en v1.', false),
  ('dashboard-tok-connect', 'Dashboard: TOK Connect', 'Expose les consentements partenaires par restaurant.', true),
  ('admin-tok-connect', 'Admin: TOK Connect', 'Expose la supervision admin des partenaires TOK Connect.', true)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_active = CASE
    WHEN EXCLUDED.name = 'tok-connect-autopilot' THEN false
    ELSE COALESCE(public.feature_flags.is_active, EXCLUDED.is_active)
  END,
  updated_at = now();

COMMIT;
