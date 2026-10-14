-- Restaurant-owned Meta connections are separate from TOK's platform marketing account.
-- No browser role can read provider credentials or OAuth state.
CREATE TABLE IF NOT EXISTS public.restaurant_meta_oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_meta_oauth_states_expiry_idx
  ON public.restaurant_meta_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS public.restaurant_meta_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  connected_by uuid NOT NULL REFERENCES auth.users(id),
  page_id text NOT NULL CHECK (length(page_id) BETWEEN 5 AND 60 AND page_id ~ '^[0-9]+$'),
  page_name text NOT NULL CHECK (length(page_name) BETWEEN 1 AND 200),
  instagram_user_id text,
  instagram_username text,
  encrypted_page_token text,
  enabled boolean NOT NULL DEFAULT false,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, page_id),
  CONSTRAINT enabled_requires_token CHECK (NOT enabled OR encrypted_page_token IS NOT NULL),
  CONSTRAINT ig_id_digits CHECK (instagram_user_id IS NULL OR instagram_user_id ~ '^[0-9]+$')
);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_meta_one_active_page_per_restaurant
  ON public.restaurant_meta_accounts (restaurant_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS restaurant_meta_accounts_restaurant_idx
  ON public.restaurant_meta_accounts (restaurant_id);

CREATE TABLE IF NOT EXISTS public.restaurant_meta_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.restaurant_meta_accounts(id),
  source_type text NOT NULL CHECK (source_type IN ('post', 'campaign')),
  source_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('facebook', 'instagram')),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'published', 'failed', 'unknown')),
  external_id text,
  failure_code text,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (account_id, source_type, source_id, channel)
);
CREATE INDEX IF NOT EXISTS restaurant_meta_publications_history_idx
  ON public.restaurant_meta_publications (restaurant_id, created_at DESC);

ALTER TABLE public.restaurant_meta_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_meta_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_meta_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_meta_oauth_states FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.restaurant_meta_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.restaurant_meta_publications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_meta_oauth_states TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_meta_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_meta_publications TO service_role;
-- Deliberately no anon/authenticated policies: only the server-side Edge function
-- enforces current ownership and returns a credential-free account summary.
NOTIFY pgrst, 'reload schema';