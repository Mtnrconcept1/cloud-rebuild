-- TheTOK Marketing Operations Center
-- Additive, admin-only foundation. External delivery is disconnected and the
-- global runtime is paused until an administrator explicitly enables it.

BEGIN;

-- Marketing administration never trusts the browser Supabase session. The BFF
-- sets this transaction-local actor only after validating an opaque, host-only
-- web session. Outside that context the helper falls back to auth.uid() for
-- service/worker compatibility, while marketing_require_admin() still fails
-- closed unless the BFF session context is present.
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

-- A telephone number is a durable suppression and frequency-cap identity.
-- Accept the three Swiss dialing forms used by operators, but persist a
-- generated E.164 value so formatting can never create a second identity.
CREATE OR REPLACE FUNCTION public.marketing_normalize_swiss_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_compact text;
  v_national text;
BEGIN
  IF p_phone IS NULL OR NULLIF(btrim(p_phone), '') IS NULL THEN
    RETURN NULL;
  END IF;
  IF char_length(p_phone) > 64
     OR regexp_replace(p_phone, '[-0-9+ ()./]', '', 'g') <> '' THEN
    RAISE EXCEPTION 'Invalid Swiss contact phone'
      USING ERRCODE = '22023';
  END IF;

  v_compact := regexp_replace(p_phone, '[- ()./]', '', 'g');
  IF v_compact ~ '^\+41[2-9][0-9]{8}$' THEN
    v_national := substring(v_compact FROM 4);
  ELSIF v_compact ~ '^0041[2-9][0-9]{8}$' THEN
    v_national := substring(v_compact FROM 5);
  ELSIF v_compact ~ '^0[2-9][0-9]{8}$' THEN
    v_national := substring(v_compact FROM 2);
  ELSE
    RAISE EXCEPTION 'Invalid Swiss contact phone'
      USING ERRCODE = '22023';
  END IF;

  RETURN '+41' || v_national;
END;
$$;

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  objective text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'scheduled', 'active', 'running', 'paused', 'completed', 'cancelled', 'failed'
  )),
  audience_id text,
  audience_name text NOT NULL DEFAULT 'Audience à définir',
  audience_definition jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(audience_definition) = 'object'),
  channels text[] NOT NULL DEFAULT '{}'::text[],
  timezone text NOT NULL DEFAULT 'Europe/Zurich',
  starts_at timestamptz,
  ends_at timestamptz,
  requires_approval boolean NOT NULL DEFAULT true CHECK (requires_approval IS TRUE),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_campaign_dates_valid CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.marketing_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE CHECK (provider ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN (
    'tok_news', 'in_app', 'email', 'push', 'instagram', 'facebook', 'linkedin',
    'tiktok', 'youtube', 'telegram', 'google_business', 'website',
    'manual_call', 'manual_email', 'manual_visit'
  )),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN (
    'disconnected', 'connected', 'blocked_configuration', 'manual', 'error', 'disabled'
  )),
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capabilities) = 'object'),
  public_configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_configuration) = 'object'),
  secret_ref text CHECK (secret_ref IS NULL OR secret_ref ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  description text NOT NULL DEFAULT '',
  configured_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_key text NOT NULL UNIQUE CHECK (automation_key ~ '^[a-z0-9][a-z0-9_.-]{1,95}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  trigger_type text NOT NULL DEFAULT 'manual',
  channel text CHECK (channel IS NULL OR channel IN (
    'tok_news', 'in_app', 'email', 'push', 'instagram', 'facebook', 'linkedin',
    'tiktok', 'youtube', 'telegram', 'google_business', 'website',
    'manual_call', 'manual_email', 'manual_visit'
  )),
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('draft', 'paused', 'active', 'disabled', 'error')),
  is_system boolean NOT NULL DEFAULT false,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(conditions) = 'object'),
  actions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(actions) = 'array'),
  run_count bigint NOT NULL DEFAULT 0 CHECK (run_count >= 0),
  error_count bigint NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_calendar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  integration_id uuid REFERENCES public.marketing_integrations(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  channel text NOT NULL CHECK (channel IN (
    'tok_news', 'in_app', 'email', 'push', 'instagram', 'facebook', 'linkedin',
    'tiktok', 'youtube', 'telegram', 'google_business', 'website',
    'manual_call', 'manual_email', 'manual_visit'
  )),
  item_type text NOT NULL DEFAULT 'broadcast' CHECK (item_type IN ('broadcast', 'publication', 'task')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'scheduled', 'queued', 'leased', 'processing', 'running', 'sent', 'published',
    'completed', 'partial', 'blocked_configuration', 'retrying', 'failed', 'cancelled'
  )),
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  scheduled_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Zurich',
  audience_name text NOT NULL DEFAULT 'Audience à définir',
  audience_size integer NOT NULL DEFAULT 0 CHECK (audience_size >= 0),
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
  targeting jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(targeting) = 'object'),
  notification_campaign_id uuid REFERENCES public.notification_campaigns(id) ON DELETE SET NULL,
  social_post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  ad_campaign_id uuid REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  provider_external_id text,
  idempotency_key text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_summary) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  published_at timestamptz,
  cancelled_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.marketing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_type text NOT NULL DEFAULT 'manual' CHECK (contact_type IN (
    'registered_user', 'restaurant_prospect', 'restaurant_lead', 'manual'
  )),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_objectid bigint,
  restaurant_lead_id uuid,
  source_system text NOT NULL DEFAULT 'manual',
  source_reference text,
  display_name text NOT NULL DEFAULT '',
  email text,
  email_normalized text GENERATED ALWAYS AS (NULLIF(lower(btrim(email)), '')) STORED,
  phone text,
  phone_normalized text GENERATED ALWAYS AS (public.marketing_normalize_swiss_phone(phone)) STORED,
  target_fingerprint text,
  locale text NOT NULL DEFAULT 'fr-CH',
  canton text,
  city text,
  category text,
  lead_score integer NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  lifecycle_status text NOT NULL DEFAULT 'new' CHECK (lifecycle_status IN (
    'new', 'qualified', 'contacted', 'follow_up', 'converted', 'opted_out'
  )),
  lawful_basis text NOT NULL DEFAULT 'none' CHECK (lawful_basis IN (
    'none', 'consent', 'existing_customer', 'legitimate_interest'
  )),
  consent_source text,
  consent_at timestamptz,
  opted_out_at timestamptz,
  suppression_reason text,
  last_verified_at timestamptz,
  last_contact_at timestamptz,
  next_action_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_contact_identifier_present CHECK (
    user_id IS NOT NULL OR source_objectid IS NOT NULL OR restaurant_lead_id IS NOT NULL
    OR email_normalized IS NOT NULL OR phone_normalized IS NOT NULL
  ),
  CONSTRAINT marketing_contact_consent_evidence CHECK (
    lawful_basis <> 'consent' OR (consent_at IS NOT NULL AND NULLIF(btrim(consent_source), '') IS NOT NULL)
  ),
  CONSTRAINT marketing_contact_optout_consistent CHECK (
    opted_out_at IS NULL OR lifecycle_status = 'opted_out'
  )
);

CREATE TABLE IF NOT EXISTS public.marketing_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.marketing_calendar_items(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN (
    'tok_news', 'in_app', 'email', 'push', 'instagram', 'facebook', 'linkedin',
    'tiktok', 'youtube', 'telegram', 'google_business', 'website',
    'manual_call', 'manual_email', 'manual_visit'
  )),
  target_masked text NOT NULL DEFAULT '***',
  target_hash text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'leased', 'processing', 'retrying', 'sent', 'delivered', 'opened', 'clicked',
    'converted', 'bounced', 'complained', 'unsubscribed', 'skipped',
    'blocked_configuration', 'manual_required', 'failed', 'cancelled'
  )),
  provider text NOT NULL DEFAULT 'tok',
  item_approved_at timestamptz,
  provider_message_id text,
  idempotency_key text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  scheduled_at timestamptz,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  converted_at timestamptz,
  bounced_at timestamptz,
  unsubscribed_at timestamptz,
  last_error text,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_delivery_target_present CHECK (contact_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.marketing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  item_id uuid REFERENCES public.marketing_calendar_items(id) ON DELETE SET NULL,
  delivery_id uuid REFERENCES public.marketing_deliveries(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 80),
  provider text,
  provider_event_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  value_chf numeric(12,2) CHECK (value_chf IS NULL OR value_chf >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Immutable, typed proof of every lawful-basis grant, reaffirmation or
-- revocation. Contact metadata remains useful operational context, but is no
-- longer the authoritative legal record and may be safely redacted in the
-- generic audit log.
CREATE TABLE IF NOT EXISTS public.marketing_lawful_basis_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'granted', 'changed', 'reaffirmed', 'revoked', 'opposed'
  )),
  lawful_basis_before text NOT NULL CHECK (lawful_basis_before IN (
    'none', 'consent', 'existing_customer', 'legitimate_interest'
  )),
  lawful_basis_after text NOT NULL CHECK (lawful_basis_after IN (
    'none', 'consent', 'existing_customer', 'legitimate_interest'
  )),
  evidence_source text NOT NULL CHECK (char_length(btrim(evidence_source)) BETWEEN 3 AND 200),
  evidence_note text NOT NULL CHECK (char_length(btrim(evidence_note)) BETWEEN 10 AND 1000),
  evidence_recorded_at timestamptz NOT NULL,
  evidence_quality text NOT NULL DEFAULT 'verified' CHECK (evidence_quality IN (
    'verified', 'system_event', 'migration_snapshot'
  )),
  source_system text NOT NULL CHECK (char_length(btrim(source_system)) BETWEEN 2 AND 80),
  source_reference text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evidence_fingerprint text NOT NULL CHECK (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_lawful_basis_evidence_recorded_at_valid CHECK (
    evidence_recorded_at <= created_at + interval '5 minutes'
  ),
  CONSTRAINT marketing_lawful_basis_evidence_source_reference_size CHECK (
    source_reference IS NULL OR char_length(source_reference) BETWEEN 1 AND 200
  ),
  UNIQUE (contact_id, evidence_fingerprint)
);

-- Opaque BFF authentication state. Only SECURITY DEFINER service-role RPCs may
-- touch these tables; neither PostgREST authenticated users nor browser code
-- receive direct privileges. Hashes are SHA-256 hex values computed by the BFF.
CREATE TABLE IF NOT EXISTS public.marketing_admin_auth_challenges (
  pending_sid_hash text PRIMARY KEY CHECK (pending_sid_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token_ciphertext bytea NOT NULL,
  refresh_token_ciphertext bytea NOT NULL,
  factor_id uuid NOT NULL,
  challenge_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  CONSTRAINT marketing_admin_auth_challenge_lifetime CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '10 minutes'
  )
);

CREATE TABLE IF NOT EXISTS public.marketing_admin_web_sessions (
  sid_hash text PRIMARY KEY CHECK (sid_hash ~ '^[0-9a-f]{64}$'),
  csrf_hash text NOT NULL CHECK (csrf_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mfa_verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  CONSTRAINT marketing_admin_web_session_lifetime CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '4 hours'
  ),
  CONSTRAINT marketing_admin_web_session_mfa_time CHECK (
    mfa_verified_at >= created_at - interval '1 minute'
    AND mfa_verified_at <= created_at + interval '1 minute'
  ),
  CONSTRAINT marketing_admin_web_session_revocation CHECK (
    revoked_at IS NULL OR NULLIF(btrim(revoke_reason), '') IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.marketing_admin_login_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  blocked_until timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_admin_auth_challenges_user_expiry_idx
  ON public.marketing_admin_auth_challenges(user_id, expires_at);
CREATE INDEX IF NOT EXISTS marketing_admin_auth_challenges_expiry_idx
  ON public.marketing_admin_auth_challenges(expires_at);
CREATE INDEX IF NOT EXISTS marketing_admin_web_sessions_user_expiry_idx
  ON public.marketing_admin_web_sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_admin_web_sessions_expiry_idx
  ON public.marketing_admin_web_sessions(expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_admin_login_limits_cleanup_idx
  ON public.marketing_admin_login_limits(last_attempt_at);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_user_unique
  ON public.marketing_contacts(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_email_unique
  ON public.marketing_contacts(email_normalized) WHERE email_normalized IS NOT NULL;
-- Deliberately includes opted-out contacts: changing formatting or suppressing
-- a row never frees its telephone identity for a new marketing contact.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_phone_unique
  ON public.marketing_contacts(phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_source_unique
  ON public.marketing_contacts(source_system, source_reference) WHERE source_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_contacts_eligibility_idx
  ON public.marketing_contacts(lawful_basis, canton, contact_type) WHERE opted_out_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_contacts_next_action_idx
  ON public.marketing_contacts(next_action_at, id) WHERE next_action_at IS NOT NULL AND opted_out_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_contacts_list_idx
  ON public.marketing_contacts(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_contacts_status_list_idx
  ON public.marketing_contacts(lifecycle_status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_contacts_display_name_prefix_idx
  ON public.marketing_contacts(lower(display_name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS marketing_contacts_city_prefix_idx
  ON public.marketing_contacts(lower(city) text_pattern_ops) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_contacts_category_prefix_idx
  ON public.marketing_contacts(lower(category) text_pattern_ops) WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_calendar_campaign_schedule_idx
  ON public.marketing_calendar_items(campaign_id, scheduled_at DESC, id);
CREATE INDEX IF NOT EXISTS marketing_calendar_due_idx
  ON public.marketing_calendar_items(COALESCE(next_attempt_at, scheduled_at), scheduled_at, id)
  WHERE status IN ('scheduled', 'queued', 'retrying');
CREATE INDEX IF NOT EXISTS marketing_calendar_lease_idx
  ON public.marketing_calendar_items(lease_expires_at, id) WHERE status IN ('leased', 'processing', 'running');
CREATE UNIQUE INDEX IF NOT EXISTS marketing_calendar_notification_campaign_unique
  ON public.marketing_calendar_items(notification_campaign_id) WHERE notification_campaign_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_campaigns_client_request_unique
  ON public.marketing_campaigns ((metadata ->> 'client_request_id'))
  WHERE metadata ? 'client_request_id';

CREATE UNIQUE INDEX IF NOT EXISTS marketing_deliveries_item_contact_channel_unique
  ON public.marketing_deliveries(item_id, contact_id, channel) WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_deliveries_item_user_channel_unique
  ON public.marketing_deliveries(item_id, user_id, channel) WHERE user_id IS NOT NULL AND contact_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_deliveries_provider_message_unique
  ON public.marketing_deliveries(provider, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_deliveries_due_idx
  ON public.marketing_deliveries(COALESCE(next_attempt_at, scheduled_at, created_at), created_at, id)
  WHERE status IN ('queued', 'retrying');
CREATE INDEX IF NOT EXISTS marketing_deliveries_item_status_idx
  ON public.marketing_deliveries(item_id, status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS marketing_deliveries_list_idx
  ON public.marketing_deliveries(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_deliveries_status_channel_list_idx
  ON public.marketing_deliveries(status, channel, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_deliveries_contact_status_idx
  ON public.marketing_deliveries(contact_id, status) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_deliveries_provider_prefix_idx
  ON public.marketing_deliveries(lower(provider) text_pattern_ops);
CREATE INDEX IF NOT EXISTS marketing_deliveries_error_code_prefix_idx
  ON public.marketing_deliveries(lower(error_code) text_pattern_ops) WHERE error_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_events_provider_unique
  ON public.marketing_events(provider, provider_event_id)
  WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_events_campaign_time_idx
  ON public.marketing_events(campaign_id, occurred_at DESC, id);
CREATE INDEX IF NOT EXISTS marketing_events_delivery_time_idx
  ON public.marketing_events(delivery_id, occurred_at DESC, id);

CREATE INDEX IF NOT EXISTS marketing_lawful_basis_evidence_contact_time_idx
  ON public.marketing_lawful_basis_evidence(contact_id, evidence_recorded_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_lawful_basis_evidence_source_unique
  ON public.marketing_lawful_basis_evidence(contact_id, source_system, source_reference, event_type)
  WHERE source_reference IS NOT NULL;

-- Cursor and latest-per-user indexes keep each BFF synchronization batch
-- bounded independently of the total source-table size.
CREATE INDEX IF NOT EXISTS commercial_prospect_catalog_marketing_cursor_idx
  ON public.commercial_prospect_catalog(source_objectid);
CREATE INDEX IF NOT EXISTS consent_receipts_marketing_user_latest_idx
  ON public.consent_receipts(user_id, recorded_at DESC, created_at DESC, id DESC)
  WHERE user_id IS NOT NULL;

-- Existing notification workers gain database-level idempotence and efficient claims.
CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_notification_channel_unique
  ON public.notification_deliveries(notification_id, channel);
CREATE INDEX IF NOT EXISTS notification_deliveries_queue_claim_idx
  ON public.notification_deliveries(COALESCE(scheduled_at, created_at), created_at, id)
  WHERE status IN ('pending', 'queued', 'retrying');
CREATE INDEX IF NOT EXISTS notification_campaigns_due_idx
  ON public.notification_campaigns(scheduled_at, id)
  WHERE status = 'scheduled';

-- Source data is intentionally not copied during deployment. Prospect and
-- consent imports run only through the bounded, resumable BFF operations
-- defined below, so a large production catalogue cannot make this migration
-- unbounded or bypass per-batch auditing.

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

CREATE OR REPLACE FUNCTION public.marketing_bff_encryption_secret()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT NULLIF(btrim(s.decrypted_secret), '')
    INTO v_secret
  FROM vault.decrypted_secrets s
  WHERE s.name = 'marketing_bff_encryption_secret'
  ORDER BY s.updated_at DESC
  LIMIT 1;

  IF v_secret IS NULL OR octet_length(v_secret) < 32 THEN
    RAISE EXCEPTION 'Marketing BFF encryption secret is not configured'
      USING ERRCODE = '55000';
  END IF;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_store_marketing_auth_challenge(
  p_pending_sid_hash text,
  p_user_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_factor_id uuid,
  p_challenge_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz := v_now + interval '10 minutes';
  v_secret text;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_pending_sid_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE
     OR p_user_id IS NULL OR p_factor_id IS NULL OR p_challenge_id IS NULL
     OR NULLIF(p_access_token, '') IS NULL OR NULLIF(p_refresh_token, '') IS NULL THEN
    RAISE EXCEPTION 'Invalid marketing authentication challenge'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Marketing authentication user not found'
      USING ERRCODE = 'P0002';
  END IF;

  v_secret := public.marketing_bff_encryption_secret();
  DELETE FROM public.marketing_admin_auth_challenges c
  WHERE c.expires_at <= v_now;

  INSERT INTO public.marketing_admin_auth_challenges (
    pending_sid_hash, user_id, access_token_ciphertext,
    refresh_token_ciphertext, factor_id, challenge_id,
    created_at, expires_at
  ) VALUES (
    p_pending_sid_hash, p_user_id,
    extensions.pgp_sym_encrypt(
      p_access_token,
      v_secret,
      'cipher-algo=aes256, compress-algo=0'
    ),
    extensions.pgp_sym_encrypt(
      p_refresh_token,
      v_secret,
      'cipher-algo=aes256, compress-algo=0'
    ),
    p_factor_id, p_challenge_id, v_now, v_expires_at
  )
  ON CONFLICT (pending_sid_hash) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    access_token_ciphertext = EXCLUDED.access_token_ciphertext,
    refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
    factor_id = EXCLUDED.factor_id,
    challenge_id = EXCLUDED.challenge_id,
    created_at = v_now,
    last_used_at = NULL,
    expires_at = v_expires_at;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'factor_id', p_factor_id,
    'challenge_id', p_challenge_id,
    'expires_at', v_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_get_marketing_auth_challenge(
  p_pending_sid_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge public.marketing_admin_auth_challenges%ROWTYPE;
  v_secret text;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_pending_sid_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_challenge
  FROM public.marketing_admin_auth_challenges c
  WHERE c.pending_sid_hash = p_pending_sid_hash
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_challenge.expires_at <= clock_timestamp() THEN
    DELETE FROM public.marketing_admin_auth_challenges c
    WHERE c.pending_sid_hash = p_pending_sid_hash;
    RETURN NULL;
  END IF;

  v_secret := public.marketing_bff_encryption_secret();
  UPDATE public.marketing_admin_auth_challenges c
  SET last_used_at = clock_timestamp()
  WHERE c.pending_sid_hash = p_pending_sid_hash;

  RETURN jsonb_build_object(
    'user_id', v_challenge.user_id,
    'access_token', extensions.pgp_sym_decrypt(v_challenge.access_token_ciphertext, v_secret),
    'refresh_token', extensions.pgp_sym_decrypt(v_challenge.refresh_token_ciphertext, v_secret),
    'factor_id', v_challenge.factor_id,
    'challenge_id', v_challenge.challenge_id,
    'expires_at', v_challenge.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_finalize_marketing_web_session(
  p_pending_sid_hash text,
  p_sid_hash text,
  p_csrf_hash text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenge public.marketing_admin_auth_challenges%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_email text;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_pending_sid_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE
     OR COALESCE(p_sid_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE
     OR COALESCE(p_csrf_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE
     OR p_expires_at IS NULL OR p_expires_at <= v_now
     OR p_expires_at > v_now + interval '4 hours' THEN
    RAISE EXCEPTION 'Invalid marketing web session parameters'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.feature_flags f
    WHERE f.name = 'admin-marketing-operations'
      AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Marketing operations feature is disabled'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.marketing_admin_auth_challenges c
  WHERE c.pending_sid_hash = p_pending_sid_hash
    AND c.expires_at > v_now
  RETURNING * INTO v_challenge;
  IF NOT FOUND THEN
    DELETE FROM public.marketing_admin_auth_challenges c
    WHERE c.pending_sid_hash = p_pending_sid_hash;
    RAISE EXCEPTION 'Marketing authentication challenge not found or expired'
      USING ERRCODE = 'P0002';
  END IF;

  -- The trusted BFF calls this only after a fresh Supabase MFA verification.
  -- Role membership is nevertheless read again here and on every operation.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_challenge.user_id AND ur.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrator role required'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.marketing_admin_web_sessions (
    sid_hash, csrf_hash, user_id, mfa_verified_at,
    created_at, last_seen_at, expires_at
  ) VALUES (
    p_sid_hash, p_csrf_hash, v_challenge.user_id, v_now,
    v_now, v_now, p_expires_at
  );

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_challenge.user_id;
  RETURN jsonb_build_object(
    'user_id', v_challenge.user_id,
    'email', v_email,
    'expires_at', p_expires_at
  );
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

CREATE OR REPLACE FUNCTION public.service_revoke_marketing_web_session(
  p_sid_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_sid_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE THEN
    RETURN false;
  END IF;
  UPDATE public.marketing_admin_web_sessions s
  SET revoked_at = COALESCE(s.revoked_at, clock_timestamp()),
      revoke_reason = COALESCE(s.revoke_reason, 'logout')
  WHERE s.sid_hash = p_sid_hash;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_consume_marketing_auth_attempt(
  p_key_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit public.marketing_admin_login_limits%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_retry_after integer;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_key_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid marketing authentication limit key'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.marketing_admin_login_limits (
    key_hash, window_started_at, attempt_count, last_attempt_at
  ) VALUES (p_key_hash, v_now, 0, v_now)
  ON CONFLICT (key_hash) DO NOTHING;

  SELECT * INTO v_limit
  FROM public.marketing_admin_login_limits l
  WHERE l.key_hash = p_key_hash
  FOR UPDATE;

  IF v_limit.blocked_until IS NOT NULL AND v_limit.blocked_until > v_now THEN
    v_retry_after := GREATEST(
      1,
      ceil(extract(epoch FROM (v_limit.blocked_until - v_now)))::integer
    );
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry_after
    );
  END IF;

  IF v_limit.window_started_at <= v_now - v_window THEN
    v_limit.window_started_at := v_now;
    v_limit.attempt_count := 0;
    v_limit.blocked_until := NULL;
  END IF;
  v_limit.attempt_count := v_limit.attempt_count + 1;

  IF v_limit.attempt_count > v_max_attempts THEN
    v_limit.blocked_until := v_now + v_window;
    UPDATE public.marketing_admin_login_limits l
    SET window_started_at = v_limit.window_started_at,
        attempt_count = v_limit.attempt_count,
        blocked_until = v_limit.blocked_until,
        last_attempt_at = v_now
    WHERE l.key_hash = p_key_hash;
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', extract(epoch FROM v_window)::integer
    );
  END IF;

  UPDATE public.marketing_admin_login_limits l
  SET window_started_at = v_limit.window_started_at,
      attempt_count = v_limit.attempt_count,
      blocked_until = NULL,
      last_attempt_at = v_now
  WHERE l.key_hash = p_key_hash;
  RETURN jsonb_build_object(
    'allowed', true,
    'retry_after_seconds', 0,
    'attempts_remaining', v_max_attempts - v_limit.attempt_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_clear_marketing_auth_attempt(
  p_key_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_key_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE THEN
    RETURN;
  END IF;
  DELETE FROM public.marketing_admin_login_limits l WHERE l.key_hash = p_key_hash;
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

CREATE OR REPLACE FUNCTION public.marketing_redact_audit_record(p_record jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_record, '{}'::jsonb)
    - 'email' - 'email_normalized' - 'phone' - 'phone_normalized' - 'target_fingerprint'
    - 'secret_ref' - 'lease_token' - 'provider_message_id' - 'metadata'
    - 'last_error' - 'content' - 'targeting' - 'public_configuration'
    - 'result_summary';
$$;

CREATE OR REPLACE FUNCTION public.marketing_touch_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_touch_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entity_id uuid;
BEGIN
  v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(), public.marketing_actor_user_id(), lower(TG_OP), TG_TABLE_NAME, v_entity_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN public.marketing_redact_audit_record(to_jsonb(OLD)) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN public.marketing_redact_audit_record(to_jsonb(NEW)) END,
    now()
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'marketing_events is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_lawful_basis_evidence_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'marketing_lawful_basis_evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_capture_lawful_basis_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_context jsonb := '{}'::jsonb;
  v_context_text text := NULLIF(current_setting('app.marketing_lawful_basis_context', true), '');
  v_payload jsonb := CASE
    WHEN jsonb_typeof(NEW.metadata -> 'lawful_basis_evidence') = 'object'
      THEN NEW.metadata -> 'lawful_basis_evidence'
    ELSE '{}'::jsonb
  END;
  v_old_payload jsonb := '{}'::jsonb;
  v_before text;
  v_after text := NEW.lawful_basis;
  v_event_type text;
  v_source text;
  v_note text;
  v_recorded_at timestamptz;
  v_quality text;
  v_source_system text;
  v_source_reference text;
  v_fingerprint text;
  v_evidence_id uuid;
BEGIN
  IF v_context_text IS NOT NULL THEN
    BEGIN
      v_context := v_context_text::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid lawful-basis evidence context' USING ERRCODE = '22023';
    END;
    IF jsonb_typeof(v_context) <> 'object' THEN
      RAISE EXCEPTION 'Invalid lawful-basis evidence context' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_before := 'none';
    IF NEW.lawful_basis = 'none' AND NEW.opted_out_at IS NULL THEN RETURN NEW; END IF;
  ELSE
    v_before := OLD.lawful_basis;
    v_old_payload := CASE
      WHEN jsonb_typeof(OLD.metadata -> 'lawful_basis_evidence') = 'object'
        THEN OLD.metadata -> 'lawful_basis_evidence'
      ELSE '{}'::jsonb
    END;
    IF NEW.lawful_basis IS NOT DISTINCT FROM OLD.lawful_basis
       AND NEW.consent_source IS NOT DISTINCT FROM OLD.consent_source
       AND NEW.consent_at IS NOT DISTINCT FROM OLD.consent_at
       AND NEW.opted_out_at IS NOT DISTINCT FROM OLD.opted_out_at
       AND (v_payload = '{}'::jsonb OR v_payload IS NOT DISTINCT FROM v_old_payload) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event_type := CASE WHEN NEW.opted_out_at IS NOT NULL THEN 'opposed' ELSE 'granted' END;
  ELSE
    v_event_type := CASE
      WHEN NEW.opted_out_at IS NOT NULL AND OLD.opted_out_at IS NULL THEN 'opposed'
      WHEN v_after = 'none' AND v_before <> 'none' THEN 'revoked'
      WHEN v_before = 'none' AND v_after <> 'none' THEN 'granted'
      WHEN v_before <> v_after THEN 'changed'
      ELSE 'reaffirmed'
    END;
  END IF;

  IF v_event_type IN ('revoked','opposed') THEN
    v_source := COALESCE(
      NULLIF(btrim(v_context ->> 'source'), ''),
      CASE WHEN NEW.metadata ? 'receipt_id' THEN 'consent_receipts' END,
      CASE WHEN NEW.suppression_reason LIKE 'provider_%' THEN NEW.suppression_reason END,
      'marketing_admin_suppression'
    );
    v_note := COALESCE(
      NULLIF(btrim(v_context ->> 'note'), ''),
      CASE WHEN NULLIF(btrim(NEW.suppression_reason), '') IS NOT NULL THEN
        'Lawful basis revoked following recorded suppression: ' || left(btrim(NEW.suppression_reason), 900) END,
      'Lawful basis revoked following a recorded opposition or suppression event.'
    );
    v_recorded_at := COALESCE(
      NULLIF(v_context ->> 'recorded_at', '')::timestamptz,
      NEW.opted_out_at,
      clock_timestamp()
    );
  ELSE
    v_source := COALESCE(
      NULLIF(btrim(v_context ->> 'source'), ''),
      NULLIF(btrim(v_payload ->> 'source'), ''),
      NULLIF(btrim(NEW.consent_source), ''),
      NULLIF(btrim(NEW.source_system), '')
    );
    v_note := COALESCE(
      NULLIF(btrim(v_context ->> 'note'), ''),
      NULLIF(btrim(v_payload ->> 'note'), ''),
      CASE WHEN NEW.lawful_basis = 'consent' AND NEW.consent_source IS NOT NULL THEN
        'Explicit marketing consent receipt synchronized from the authoritative source.' END
    );
    v_recorded_at := COALESCE(
      NULLIF(v_context ->> 'recorded_at', '')::timestamptz,
      NULLIF(v_payload ->> 'recorded_at', '')::timestamptz,
      NEW.consent_at,
      clock_timestamp()
    );
  END IF;
  v_quality := COALESCE(NULLIF(v_context ->> 'quality', ''), 'verified');
  v_source_system := COALESCE(
    NULLIF(btrim(v_context ->> 'source_system'), ''),
    CASE WHEN NEW.metadata ? 'receipt_id' THEN 'consent_receipts' END,
    CASE WHEN NEW.suppression_reason LIKE 'provider_%' THEN 'provider_event' END,
    NULLIF(btrim(NEW.source_system), ''),
    'marketing_admin'
  );
  v_source_reference := COALESCE(
    NULLIF(v_context ->> 'source_reference', ''),
    NULLIF(NEW.metadata ->> 'receipt_id', '')
  );

  IF v_source IS NULL OR char_length(v_source) NOT BETWEEN 3 AND 200
     OR v_note IS NULL OR char_length(v_note) NOT BETWEEN 10 AND 1000
     OR v_recorded_at IS NULL OR v_recorded_at > clock_timestamp() + interval '5 minutes'
     OR v_quality NOT IN ('verified','system_event','migration_snapshot')
     OR char_length(v_source_system) NOT BETWEEN 2 AND 80
     OR (v_source_reference IS NOT NULL AND char_length(v_source_reference) > 200) THEN
    RAISE EXCEPTION 'Complete lawful-basis evidence is required before changing contact eligibility'
      USING ERRCODE = '22023';
  END IF;

  v_fingerprint := encode(extensions.digest(concat_ws('|',
    NEW.id::text, v_event_type, v_before, v_after, v_source_system,
    COALESCE(v_source_reference, ''), v_source, v_note,
    v_recorded_at::text, v_quality
  ), 'sha256'), 'hex');

  INSERT INTO public.marketing_lawful_basis_evidence (
    contact_id, event_type, lawful_basis_before, lawful_basis_after,
    evidence_source, evidence_note, evidence_recorded_at, evidence_quality,
    source_system, source_reference, actor_user_id, evidence_fingerprint
  ) VALUES (
    NEW.id, v_event_type, v_before, v_after,
    v_source, v_note, v_recorded_at, v_quality,
    v_source_system, v_source_reference, public.marketing_actor_user_id(), v_fingerprint
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_evidence_id;

  IF v_evidence_id IS NOT NULL THEN
    INSERT INTO public.audit_log (
      id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
    ) VALUES (
      gen_random_uuid(), public.marketing_actor_user_id(),
      'marketing_lawful_basis_evidence_recorded', 'marketing_lawful_basis_evidence',
      v_evidence_id, NULL,
      jsonb_build_object(
        'contact_id', NEW.id,
        'event_type', v_event_type,
        'lawful_basis_before', v_before,
        'lawful_basis_after', v_after,
        'evidence_quality', v_quality,
        'source_system', v_source_system,
        'evidence_fingerprint', v_fingerprint
      ),
      clock_timestamp()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_log_delivery_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT i.campaign_id INTO v_campaign_id
      FROM public.marketing_calendar_items i WHERE i.id = NEW.item_id;
    INSERT INTO public.marketing_events (
      campaign_id, item_id, delivery_id, event_type, provider, occurred_at, metadata
    ) VALUES (
      v_campaign_id, NEW.item_id, NEW.id, 'delivery_' || NEW.status, NEW.provider, now(),
      jsonb_build_object('attempt_count', NEW.attempt_count)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_validate_campaign_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF OLD.status IN ('completed', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Terminal campaign status cannot transition' USING ERRCODE = '22023';
  END IF;
  IF OLD.status = 'draft' AND NEW.status NOT IN ('scheduled', 'active', 'running', 'paused', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid campaign transition from draft' USING ERRCODE = '22023';
  ELSIF OLD.status = 'scheduled' AND NEW.status NOT IN ('draft', 'active', 'running', 'paused', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Invalid campaign transition from scheduled' USING ERRCODE = '22023';
  ELSIF OLD.status IN ('active', 'running') AND NEW.status NOT IN ('draft', 'active', 'running', 'paused', 'completed', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Invalid campaign transition from active' USING ERRCODE = '22023';
  ELSIF OLD.status = 'paused' AND NEW.status NOT IN ('draft', 'scheduled', 'active', 'running', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid campaign transition from paused' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketing_campaigns_touch ON public.marketing_campaigns;
CREATE TRIGGER marketing_campaigns_touch BEFORE UPDATE ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();
DROP TRIGGER IF EXISTS marketing_campaigns_transition ON public.marketing_campaigns;
CREATE TRIGGER marketing_campaigns_transition BEFORE UPDATE OF status ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.marketing_validate_campaign_transition();

DROP TRIGGER IF EXISTS marketing_integrations_touch ON public.marketing_integrations;
CREATE TRIGGER marketing_integrations_touch BEFORE UPDATE ON public.marketing_integrations
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();
DROP TRIGGER IF EXISTS marketing_automations_touch ON public.marketing_automations;
CREATE TRIGGER marketing_automations_touch BEFORE UPDATE ON public.marketing_automations
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();
DROP TRIGGER IF EXISTS marketing_calendar_touch ON public.marketing_calendar_items;
CREATE TRIGGER marketing_calendar_touch BEFORE UPDATE ON public.marketing_calendar_items
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();
DROP TRIGGER IF EXISTS marketing_contacts_touch ON public.marketing_contacts;
CREATE TRIGGER marketing_contacts_touch BEFORE UPDATE ON public.marketing_contacts
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();
DROP TRIGGER IF EXISTS marketing_deliveries_touch ON public.marketing_deliveries;
CREATE TRIGGER marketing_deliveries_touch BEFORE UPDATE ON public.marketing_deliveries
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_delivery();
DROP TRIGGER IF EXISTS marketing_deliveries_events ON public.marketing_deliveries;
CREATE TRIGGER marketing_deliveries_events AFTER INSERT OR UPDATE OF status ON public.marketing_deliveries
FOR EACH ROW EXECUTE FUNCTION public.marketing_log_delivery_transition();
DROP TRIGGER IF EXISTS marketing_events_no_update ON public.marketing_events;
CREATE TRIGGER marketing_events_no_update BEFORE UPDATE OR DELETE ON public.marketing_events
FOR EACH ROW EXECUTE FUNCTION public.marketing_events_append_only();
DROP TRIGGER IF EXISTS marketing_lawful_basis_evidence_no_update ON public.marketing_lawful_basis_evidence;
CREATE TRIGGER marketing_lawful_basis_evidence_no_update
BEFORE UPDATE OR DELETE ON public.marketing_lawful_basis_evidence
FOR EACH ROW EXECUTE FUNCTION public.marketing_lawful_basis_evidence_append_only();
DROP TRIGGER IF EXISTS marketing_contacts_lawful_basis_evidence ON public.marketing_contacts;
CREATE TRIGGER marketing_contacts_lawful_basis_evidence
AFTER INSERT OR UPDATE OF lawful_basis, consent_source, consent_at, opted_out_at, metadata
ON public.marketing_contacts
FOR EACH ROW EXECUTE FUNCTION public.marketing_capture_lawful_basis_evidence();

-- Defensive backfill for an installation where the table already existed.
-- Capture its current authoritative state once, explicitly marking incomplete
-- legacy context instead of presenting it as verified proof.
WITH evidence_rows AS (
  SELECT
    c.id AS contact_id,
    CASE WHEN c.opted_out_at IS NOT NULL THEN 'opposed' ELSE 'granted' END AS event_type,
    'none'::text AS lawful_basis_before,
    c.lawful_basis AS lawful_basis_after,
    COALESCE(
      NULLIF(btrim(c.metadata -> 'lawful_basis_evidence' ->> 'source'), ''),
      NULLIF(btrim(c.consent_source), ''),
      NULLIF(btrim(c.suppression_reason), ''),
      c.source_system
    ) AS evidence_source,
    COALESCE(
      NULLIF(btrim(c.metadata -> 'lawful_basis_evidence' ->> 'note'), ''),
      CASE WHEN c.lawful_basis = 'consent' THEN
        'Explicit marketing consent receipt imported from the authoritative source.' END,
      CASE WHEN c.opted_out_at IS NOT NULL THEN
        'Recorded opposition imported from the authoritative suppression state.' END,
      'Existing lawful-basis state migrated; supporting details require review.'
    ) AS evidence_note,
    COALESCE(
      NULLIF(c.metadata -> 'lawful_basis_evidence' ->> 'recorded_at', '')::timestamptz,
      c.consent_at, c.opted_out_at, c.created_at
    ) AS evidence_recorded_at,
    CASE
      WHEN c.lawful_basis = 'consent' AND c.consent_source IS NOT NULL AND c.consent_at IS NOT NULL
        THEN 'verified'
      WHEN c.metadata -> 'lawful_basis_evidence' ? 'source'
       AND c.metadata -> 'lawful_basis_evidence' ? 'note'
       AND c.metadata -> 'lawful_basis_evidence' ? 'recorded_at'
        THEN 'verified'
      WHEN c.opted_out_at IS NOT NULL THEN 'system_event'
      ELSE 'migration_snapshot'
    END AS evidence_quality,
    c.source_system,
    left(COALESCE(c.metadata ->> 'receipt_id', c.source_reference), 200) AS source_reference,
    c.created_by AS actor_user_id
  FROM public.marketing_contacts c
  WHERE c.lawful_basis <> 'none' OR c.opted_out_at IS NOT NULL
), prepared AS (
  SELECT e.*,
    encode(extensions.digest(concat_ws('|',
      e.contact_id::text, e.event_type, e.lawful_basis_before, e.lawful_basis_after,
      e.source_system, COALESCE(e.source_reference, ''), e.evidence_source,
      e.evidence_note, e.evidence_recorded_at::text, e.evidence_quality
    ), 'sha256'), 'hex') AS evidence_fingerprint
  FROM evidence_rows e
), inserted AS (
  INSERT INTO public.marketing_lawful_basis_evidence (
    contact_id, event_type, lawful_basis_before, lawful_basis_after,
    evidence_source, evidence_note, evidence_recorded_at, evidence_quality,
    source_system, source_reference, actor_user_id, evidence_fingerprint
  )
  SELECT
    contact_id, event_type, lawful_basis_before, lawful_basis_after,
    evidence_source, evidence_note, evidence_recorded_at, evidence_quality,
    source_system, source_reference, actor_user_id, evidence_fingerprint
  FROM prepared
  ON CONFLICT DO NOTHING
  RETURNING id, contact_id, event_type, lawful_basis_before, lawful_basis_after,
    evidence_quality, source_system, evidence_fingerprint
)
INSERT INTO public.audit_log (
  id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
)
SELECT
  gen_random_uuid(), NULL, 'marketing_lawful_basis_evidence_recorded',
  'marketing_lawful_basis_evidence', i.id, NULL,
  jsonb_build_object(
    'contact_id', i.contact_id,
    'event_type', i.event_type,
    'lawful_basis_before', i.lawful_basis_before,
    'lawful_basis_after', i.lawful_basis_after,
    'evidence_quality', i.evidence_quality,
    'source_system', i.source_system,
    'evidence_fingerprint', i.evidence_fingerprint
  ),
  clock_timestamp()
FROM inserted i;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'marketing_campaigns', 'marketing_integrations', 'marketing_automations',
    'marketing_calendar_items', 'marketing_contacts'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.marketing_write_audit()',
      v_table, v_table
    );
  END LOOP;
END;
$$;

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_calendar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_lawful_basis_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_lawful_basis_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_admin_auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_admin_auth_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_admin_web_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_admin_web_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_admin_login_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_admin_login_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketing_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketing_integrations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketing_automations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketing_calendar_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketing_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketing_deliveries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketing_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketing_lawful_basis_evidence FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.marketing_admin_auth_challenges FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.marketing_admin_web_sessions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.marketing_admin_login_limits FROM PUBLIC, anon, authenticated, service_role;

GRANT ALL ON public.marketing_campaigns, public.marketing_integrations,
  public.marketing_automations, public.marketing_calendar_items,
  public.marketing_contacts, public.marketing_deliveries, public.marketing_events TO service_role;

DROP POLICY IF EXISTS marketing_campaigns_admin_select ON public.marketing_campaigns;
DROP POLICY IF EXISTS marketing_integrations_admin_select ON public.marketing_integrations;
DROP POLICY IF EXISTS marketing_automations_admin_select ON public.marketing_automations;
DROP POLICY IF EXISTS marketing_calendar_admin_select ON public.marketing_calendar_items;

INSERT INTO public.marketing_integrations (
  provider, name, channel, status, capabilities, description, last_checked_at
) VALUES
  ('tok-platform', 'Actualités TheTOK', 'tok_news', 'manual', '{"manual":true,"adapter_deployed":false}'::jsonb, 'Publication éditoriale manuelle tant qu’aucun adaptateur générique n’est disponible.', now()),
  ('tok-notifications', 'Notifications internes', 'in_app', 'connected', '{"send":true,"adapter_deployed":true}'::jsonb, 'Notifications in-app déjà disponibles.', now()),
  ('manual-call', 'Appels manuels', 'manual_call', 'manual', '{"manual":true}'::jsonb, 'Tâches d’appel sans coût fournisseur.', now()),
  ('manual-email', 'E-mails manuels', 'manual_email', 'manual', '{"manual":true}'::jsonb, 'Tâches e-mail à valider manuellement.', now()),
  ('manual-visit', 'Visites manuelles', 'manual_visit', 'blocked_configuration', '{"manual":true,"requires_structured_address":true}'::jsonb, 'Bloqué tant qu’une adresse structurée et vérifiée n’est pas disponible.', now()),
  ('resend', 'Resend', 'email', 'blocked_configuration', '{"send":true,"webhook":true,"adapter_deployed":false}'::jsonb, 'Connexion, domaine vérifié et adaptateur déployé requis.', now()),
  ('firebase', 'Firebase Cloud Messaging', 'push', 'blocked_configuration', '{"send":true,"adapter_deployed":false}'::jsonb, 'Configuration, jetons actifs et adaptateur déployé requis.', now()),
  ('instagram', 'Instagram', 'instagram', 'disconnected', '{"publish":true,"adapter_deployed":false}'::jsonb, 'API Meta non connectée.', now()),
  ('facebook', 'Facebook', 'facebook', 'disconnected', '{"publish":true,"adapter_deployed":false}'::jsonb, 'API Meta non connectée.', now()),
  ('linkedin', 'LinkedIn', 'linkedin', 'disconnected', '{"publish":true,"adapter_deployed":false}'::jsonb, 'API LinkedIn non connectée.', now()),
  ('tiktok', 'TikTok', 'tiktok', 'disconnected', '{"publish":true,"adapter_deployed":false}'::jsonb, 'API TikTok non connectée.', now()),
  ('youtube', 'YouTube', 'youtube', 'disconnected', '{"publish":true,"adapter_deployed":false}'::jsonb, 'API YouTube non connectée.', now()),
  ('telegram', 'Telegram', 'telegram', 'disconnected', '{"publish":true,"adapter_deployed":false}'::jsonb, 'API Telegram non connectée.', now()),
  ('google-business', 'Google Business Profile', 'google_business', 'disconnected', '{"publish":true,"adapter_deployed":false}'::jsonb, 'API Google non connectée.', now()),
  ('website', 'Site TheTOK', 'website', 'disconnected', '{"publish":true,"adapter_deployed":false}'::jsonb, 'Publication site à connecter explicitement.', now())
ON CONFLICT (provider) DO NOTHING;

-- A phone number is not a safe substitute for a visit address. Keep the
-- channel fail-closed even if an earlier seed or manual edit marked it active.
UPDATE public.marketing_integrations SET
  status = 'blocked_configuration',
  capabilities = capabilities || '{"requires_structured_address":true}'::jsonb,
  description = 'Bloqué tant qu’une adresse structurée et vérifiée n’est pas disponible.',
  last_checked_at = now()
WHERE channel = 'manual_visit';

INSERT INTO public.marketing_automations (
  automation_key, name, description, trigger_type, status, is_system, conditions, actions
) VALUES (
  'global_runtime', 'Pause globale marketing',
  'Verrou de sécurité global: aucune tâche planifiée n’est réclamée tant qu’il est actif.',
  'system', 'paused', true,
  '{"global_pause":true,"reason":"Pause de sécurité initiale","daily_cap":500,"frequency_cap_hours":72,"quiet_hours":{"start":"08:00","end":"20:00","timezone":"Europe/Zurich"}}'::jsonb,
  '[]'::jsonb
)
ON CONFLICT (automation_key) DO NOTHING;

-- Preserve an existing emergency kill-switch: the seed only inserts when absent.
INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'admin-marketing-operations',
  'Centre des opérations marketing',
  'Interface marketing autonome réservée aux administrateurs.',
  true
)
ON CONFLICT (name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION public.marketing_mask_target(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NULLIF(btrim(p_value), '') IS NULL THEN '***'
    WHEN position('@' IN p_value) > 1 THEN
      left(split_part(p_value, '@', 1), 1) || '***@' || split_part(p_value, '@', 2)
    WHEN char_length(regexp_replace(p_value, '\D', '', 'g')) >= 4 THEN
      '***' || right(regexp_replace(p_value, '\D', '', 'g'), 3)
    WHEN char_length(p_value) > 4 THEN left(p_value, 2) || '***' || right(p_value, 2)
    ELSE '***'
  END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_channel_availability(p_channel text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_adapter_deployed boolean;
BEGIN
  SELECT i.status, COALESCE((i.capabilities ->> 'adapter_deployed')::boolean, false)
  INTO v_status, v_adapter_deployed
  FROM public.marketing_integrations i
  WHERE i.channel = p_channel
  ORDER BY (i.status = 'connected') DESC, i.updated_at DESC
  LIMIT 1;
  IF p_channel = 'manual_visit' THEN RETURN 'blocked_configuration'; END IF;
  IF p_channel IN ('manual_call', 'manual_email') THEN
    RETURN CASE WHEN v_status = 'manual' THEN 'manual' ELSE 'disconnected' END;
  END IF;
  IF v_status = 'connected' AND (p_channel = 'in_app' OR v_adapter_deployed) THEN RETURN 'available'; END IF;
  IF v_status = 'manual' THEN RETURN 'manual'; END IF;
  IF p_channel IN ('email', 'push') THEN RETURN 'blocked_configuration'; END IF;
  RETURN 'disconnected';
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_runtime_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE((
      SELECT (a.conditions ->> 'global_pause')::boolean IS FALSE
      FROM public.marketing_automations a
      WHERE a.automation_key = 'global_runtime'
    ), false)
    AND COALESCE((
      SELECT f.is_active
      FROM public.feature_flags f
      WHERE f.name = 'admin-marketing-operations'
    ), false);
$$;

CREATE OR REPLACE FUNCTION public.marketing_contact_is_eligible(p_contact_id uuid, p_channel text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT
      c.opted_out_at IS NULL
      AND CASE
        -- Existing-customer delivery is limited to a directly related service relationship;
        -- all other electronic marketing requires recorded consent.
        WHEN p_channel IN ('email','manual_email') THEN
          c.email_normalized IS NOT NULL
          AND COALESCE((c.metadata ->> 'email_suppressed')::boolean, false) IS FALSE
          AND c.lawful_basis IN ('consent','existing_customer')
          AND (c.user_id IS NULL OR EXISTS (
            SELECT 1 FROM public.notification_preferences p
            WHERE p.user_id = c.user_id
              AND COALESCE((p.categories ->> 'marketing')::boolean, false)
              AND COALESCE((p.channels ->> 'email')::boolean, true)
          ))
        WHEN p_channel IN ('push','in_app') THEN
          c.user_id IS NOT NULL AND c.lawful_basis IN ('consent','existing_customer')
          AND EXISTS (
            SELECT 1 FROM public.notification_preferences p
            WHERE p.user_id = c.user_id
              AND COALESCE((p.categories ->> 'marketing')::boolean, false)
              AND COALESCE((p.channels ->> p_channel)::boolean, true)
          )
        WHEN p_channel = 'manual_call' THEN
          c.phone_normalized IS NOT NULL
          AND c.lawful_basis IN ('consent','existing_customer','legitimate_interest')
        WHEN p_channel = 'manual_visit' THEN false
        -- Public/editorial channels never create individual deliveries.
        WHEN p_channel IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube',
          'telegram','google_business','website') THEN false
        ELSE false
      END
    FROM public.marketing_contacts c WHERE c.id = p_contact_id
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.marketing_validate_audience_filter(p_filter jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_kind text := COALESCE(NULLIF(btrim(p_filter ->> 'audience_kind'), ''), NULLIF(btrim(p_filter ->> 'kind'), ''));
  v_audience_id text := NULLIF(btrim(p_filter ->> 'audience_id'), '');
  v_id_kind text;
BEGIN
  IF COALESCE(jsonb_typeof(p_filter), 'null') <> 'object' THEN
    RAISE EXCEPTION 'Audience filter must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_filter = '{}'::jsonb THEN
    RAISE EXCEPTION 'Audience filter cannot be empty' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_filter)
  LOOP
    IF v_key NOT IN ('audience_kind','kind','canton','city','category','contact_type','audience_id') THEN
      RAISE EXCEPTION 'Unsupported audience filter key: %', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_filter -> v_key) <> 'string' THEN
      RAISE EXCEPTION 'Audience filter values must be strings' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF v_kind IS NULL AND v_audience_id IS NULL
     AND NULLIF(btrim(p_filter ->> 'canton'), '') IS NULL
     AND NULLIF(btrim(p_filter ->> 'city'), '') IS NULL
     AND NULLIF(btrim(p_filter ->> 'category'), '') IS NULL
     AND NULLIF(btrim(p_filter ->> 'contact_type'), '') IS NULL THEN
    RAISE EXCEPTION 'Audience filter requires an effective selector' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(p_filter ->> 'audience_kind', '') IS NOT NULL
     AND NULLIF(p_filter ->> 'kind', '') IS NOT NULL
     AND (p_filter ->> 'audience_kind') <> (p_filter ->> 'kind') THEN
    RAISE EXCEPTION 'audience_kind conflicts with legacy kind' USING ERRCODE = '22023';
  END IF;
  IF v_audience_id IS NOT NULL THEN
    IF v_audience_id !~ '^(computed|dynamic):(restaurant|client|mixed):([A-Za-z]{2}|CH)$' THEN
      RAISE EXCEPTION 'Unsupported audience_id; use a computed or dynamic audience' USING ERRCODE = '22023';
    END IF;
    v_id_kind := split_part(v_audience_id, ':', 2);
    IF v_kind IS NOT NULL AND v_kind <> v_id_kind THEN
      RAISE EXCEPTION 'Audience kind conflicts with audience_id' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_kind IS NOT NULL AND v_kind NOT IN ('restaurant','client','mixed') THEN
    RAISE EXCEPTION 'Invalid audience kind' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(p_filter ->> 'contact_type', '') IS NOT NULL
     AND (p_filter ->> 'contact_type') NOT IN ('registered_user','restaurant_prospect','restaurant_lead','manual') THEN
    RAISE EXCEPTION 'Invalid contact_type filter' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_contact_matches_filter(p_contact_id uuid, p_filter jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text := COALESCE(NULLIF(p_filter ->> 'audience_kind', ''), NULLIF(p_filter ->> 'kind', ''));
  v_canton text := NULLIF(p_filter ->> 'canton', '');
  v_audience_id text := NULLIF(p_filter ->> 'audience_id', '');
  v_matches boolean;
BEGIN
  PERFORM public.marketing_validate_audience_filter(COALESCE(p_filter, '{}'::jsonb));
  IF v_audience_id IS NOT NULL THEN
    v_kind := COALESCE(v_kind, split_part(v_audience_id, ':', 2));
    v_canton := COALESCE(v_canton, split_part(v_audience_id, ':', 3));
  END IF;
  IF upper(COALESCE(v_canton, 'CH')) IN ('CH','ALL') THEN v_canton := NULL; END IF;

  SELECT (
    CASE COALESCE(v_kind, 'mixed')
      WHEN 'restaurant' THEN c.contact_type IN ('restaurant_prospect','restaurant_lead')
      WHEN 'client' THEN c.contact_type = 'registered_user'
      ELSE true
    END
    AND (v_canton IS NULL OR upper(COALESCE(c.canton, '')) = upper(v_canton))
    AND (NULLIF(p_filter ->> 'city', '') IS NULL OR c.city = p_filter ->> 'city')
    AND (NULLIF(p_filter ->> 'category', '') IS NULL OR c.category = p_filter ->> 'category')
    AND (NULLIF(p_filter ->> 'contact_type', '') IS NULL OR c.contact_type = p_filter ->> 'contact_type')
  ) INTO v_matches
  FROM public.marketing_contacts c WHERE c.id = p_contact_id;
  RETURN COALESCE(v_matches, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_delivery_status_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_status
    WHEN 'sent' THEN 10 WHEN 'delivered' THEN 20 WHEN 'opened' THEN 30
    WHEN 'clicked' THEN 40 WHEN 'converted' THEN 50 ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_finalize_item_if_terminal(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.marketing_calendar_items%ROWTYPE;
  v_total bigint;
  v_active bigint;
  v_success bigint;
  v_failure bigint;
  v_status text;
BEGIN
  SELECT * INTO v_item FROM public.marketing_calendar_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.status IN ('retrying','draft','cancelled','published','completed','partial','failed') THEN
    RETURN;
  END IF;
  SELECT count(*),
    count(*) FILTER (WHERE d.status IN ('queued','leased','processing','retrying','manual_required')),
    count(*) FILTER (WHERE d.sent_at IS NOT NULL OR d.status IN ('sent','delivered','opened','clicked','converted')),
    count(*) FILTER (WHERE d.status IN ('failed','bounced','complained','unsubscribed','skipped','blocked_configuration','cancelled'))
  INTO v_total, v_active, v_success, v_failure
  FROM public.marketing_deliveries d WHERE d.item_id = p_item_id;
  IF v_total = 0 OR v_active > 0 THEN RETURN; END IF;
  v_status := CASE
    WHEN v_success > 0 AND v_failure > 0 THEN 'partial'
    WHEN v_success > 0 THEN 'completed'
    ELSE 'failed'
  END;
  UPDATE public.marketing_calendar_items SET
    status = v_status,
    sent_at = CASE WHEN v_success > 0 THEN COALESCE(sent_at, now()) ELSE sent_at END,
    lease_token = NULL, lease_expires_at = NULL,
    result_summary = result_summary || jsonb_build_object(
      'deliveries_total', v_total, 'deliveries_success', v_success, 'deliveries_failed', v_failure,
      'finalized_at', now()
    )
  WHERE id = p_item_id AND status NOT IN ('cancelled','published','completed','partial','failed');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_campaign(
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload ->> 'id', '')::uuid;
  v_existing public.marketing_campaigns%ROWTYPE;
  v_row public.marketing_campaigns%ROWTYPE;
  v_status text := COALESCE(NULLIF(p_payload ->> 'status', ''), 'draft');
  v_channels text[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload -> 'channels', '[]'::jsonb)));
  v_requires_approval boolean := true;
  v_requires_reapproval boolean := false;
BEGIN
  PERFORM public.marketing_require_admin();
  IF NULLIF(btrim(p_payload ->> 'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Campaign name is required' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('draft', 'scheduled', 'active', 'running', 'paused', 'completed', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Invalid campaign status' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_channels) c
    WHERE c NOT IN ('tok_news', 'in_app', 'email', 'push', 'instagram', 'facebook',
      'linkedin', 'tiktok', 'youtube', 'telegram', 'google_business', 'website',
      'manual_call', 'manual_email', 'manual_visit')
  ) THEN
    RAISE EXCEPTION 'Invalid campaign channel' USING ERRCODE = '22023';
  END IF;
  PERFORM public.marketing_validate_audience_filter(COALESCE(p_payload -> 'audience_definition', '{}'::jsonb));

  IF v_id IS NULL THEN
    IF v_requires_approval AND v_status IN ('scheduled','active','running') THEN
      v_status := 'draft';
    END IF;
    INSERT INTO public.marketing_campaigns (
      name, objective, content, status, audience_id, audience_name, audience_definition, channels,
      timezone, starts_at, ends_at, requires_approval, approved_by, approved_at, metadata, created_by
    ) VALUES (
      btrim(p_payload ->> 'name'), COALESCE(p_payload ->> 'objective', ''),
      COALESCE(p_payload -> 'content', '{}'::jsonb), v_status,
      NULLIF(p_payload ->> 'audience_id', ''),
      COALESCE(NULLIF(p_payload ->> 'audience_name', ''), 'Audience à définir'),
      COALESCE(p_payload -> 'audience_definition', '{}'::jsonb), v_channels,
      COALESCE(NULLIF(p_payload ->> 'timezone', ''), 'Europe/Zurich'),
      NULLIF(p_payload ->> 'starts_at', '')::timestamptz,
      NULLIF(p_payload ->> 'ends_at', '')::timestamptz,
      v_requires_approval,
      NULL, NULL,
      COALESCE(p_payload -> 'metadata', '{}'::jsonb), public.marketing_actor_user_id()
    ) RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_existing FROM public.marketing_campaigns WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002'; END IF;
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'Campaign was modified by another administrator' USING ERRCODE = '40001';
    END IF;
    v_requires_approval := true;
    v_requires_reapproval := v_existing.approved_at IS NOT NULL AND (
      ((p_payload ? 'name') AND btrim(p_payload ->> 'name') IS DISTINCT FROM v_existing.name)
      OR ((p_payload ? 'objective') AND (p_payload ->> 'objective') IS DISTINCT FROM v_existing.objective)
      OR ((p_payload ? 'content') AND (p_payload -> 'content') IS DISTINCT FROM v_existing.content)
      OR ((p_payload ? 'audience_id') AND NULLIF(p_payload ->> 'audience_id', '') IS DISTINCT FROM v_existing.audience_id)
      OR ((p_payload ? 'audience_name') AND NULLIF(p_payload ->> 'audience_name', '') IS DISTINCT FROM v_existing.audience_name)
      OR ((p_payload ? 'audience_definition') AND (p_payload -> 'audience_definition') IS DISTINCT FROM v_existing.audience_definition)
      OR ((p_payload ? 'channels') AND v_channels IS DISTINCT FROM v_existing.channels)
      OR ((p_payload ? 'starts_at') AND NULLIF(p_payload ->> 'starts_at', '')::timestamptz IS DISTINCT FROM v_existing.starts_at)
      OR ((p_payload ? 'ends_at') AND NULLIF(p_payload ->> 'ends_at', '')::timestamptz IS DISTINCT FROM v_existing.ends_at)
      OR ((p_payload ? 'metadata') AND (p_payload -> 'metadata') IS DISTINCT FROM v_existing.metadata)
    );
    IF v_requires_reapproval THEN
      v_status := 'draft';
    ELSIF v_requires_approval AND v_existing.approved_at IS NULL
      AND v_status IN ('scheduled','active','running') THEN
      RAISE EXCEPTION 'Campaign approval is required before activation' USING ERRCODE = '42501';
    END IF;
    UPDATE public.marketing_campaigns SET
      name = btrim(p_payload ->> 'name'),
      objective = COALESCE(p_payload ->> 'objective', objective),
      content = COALESCE(p_payload -> 'content', content),
      status = v_status,
      audience_id = CASE WHEN p_payload ? 'audience_id' THEN NULLIF(p_payload ->> 'audience_id', '') ELSE audience_id END,
      audience_name = COALESCE(NULLIF(p_payload ->> 'audience_name', ''), audience_name),
      audience_definition = COALESCE(p_payload -> 'audience_definition', audience_definition),
      channels = CASE WHEN p_payload ? 'channels' THEN v_channels ELSE channels END,
      timezone = COALESCE(NULLIF(p_payload ->> 'timezone', ''), timezone),
      starts_at = CASE WHEN p_payload ? 'starts_at' THEN NULLIF(p_payload ->> 'starts_at', '')::timestamptz ELSE starts_at END,
      ends_at = CASE WHEN p_payload ? 'ends_at' THEN NULLIF(p_payload ->> 'ends_at', '')::timestamptz ELSE ends_at END,
      requires_approval = v_requires_approval,
      approved_by = CASE WHEN v_requires_reapproval THEN NULL ELSE approved_by END,
      approved_at = CASE WHEN v_requires_reapproval THEN NULL ELSE approved_at END,
      metadata = COALESCE(p_payload -> 'metadata', metadata)
    WHERE id = v_id RETURNING * INTO v_row;
    IF v_requires_reapproval THEN
      UPDATE public.marketing_calendar_items SET
        approval_status = 'pending', approved_by = NULL, approved_at = NULL,
        status = 'draft', lease_token = NULL, lease_expires_at = NULL,
        next_attempt_at = NULL, last_error = 'Campaign changed; re-approval required'
      WHERE campaign_id = v_id
        AND status NOT IN ('sent','published','completed','cancelled');
      UPDATE public.marketing_deliveries d SET
        status = 'cancelled', last_error = 'Campaign changed; delivery invalidated',
        lease_token = NULL, lease_expires_at = NULL
      FROM public.marketing_calendar_items i
      WHERE d.item_id = i.id AND i.campaign_id = v_id
        AND d.status IN ('queued','leased','processing','retrying','manual_required','blocked_configuration');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'name', v_row.name, 'objective', v_row.objective, 'content', v_row.content,
    'status', CASE WHEN v_row.status = 'running' THEN 'active' ELSE v_row.status END,
    'audience_id', v_row.audience_id, 'audience_name', v_row.audience_name,
    'channels', to_jsonb(v_row.channels), 'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at,
    'sent', 0, 'delivered', 0, 'clicked', 0, 'conversions', 0,
    'requires_approval', v_row.requires_approval,
    'approval_status', CASE WHEN v_row.approved_at IS NOT NULL THEN 'approved' ELSE 'pending' END,
    'approved_at', v_row.approved_at, 'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_marketing_campaign(p_campaign_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_row public.marketing_campaigns%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_admin();
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Approval reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.marketing_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status IN ('completed','cancelled','failed') THEN
    RAISE EXCEPTION 'Terminal campaign cannot be approved' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(v_row.objective), '') IS NULL THEN
    RAISE EXCEPTION 'Campaign objective is required' USING ERRCODE = '22023';
  END IF;
  IF v_row.content = '{}'::jsonb OR NULLIF(btrim(v_row.content ->> 'message'), '') IS NULL THEN
    RAISE EXCEPTION 'Campaign content is required' USING ERRCODE = '22023';
  END IF;
  IF v_row.audience_definition = '{}'::jsonb THEN
    RAISE EXCEPTION 'Campaign audience is required' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_row.channels) = 0 THEN
    RAISE EXCEPTION 'At least one campaign channel is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.marketing_campaigns SET
    approved_by = public.marketing_actor_user_id(), approved_at = now(),
    metadata = jsonb_set(metadata, '{approval_reason}', to_jsonb(left(btrim(p_reason), 500)), true)
  WHERE id = p_campaign_id RETURNING * INTO v_row;
  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(), public.marketing_actor_user_id(), 'marketing_campaign_approved', 'marketing_campaigns', v_row.id,
    NULL, jsonb_build_object('reason', left(btrim(p_reason), 500), 'approved_at', v_row.approved_at), now()
  );
  RETURN jsonb_build_object(
    'id', v_row.id, 'status', CASE WHEN v_row.status = 'running' THEN 'active' ELSE v_row.status END,
    'approval_status', 'approved', 'approved_by', v_row.approved_by,
    'approved_at', v_row.approved_at, 'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_marketing_campaigns(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_items jsonb;
  v_has_more boolean;
BEGIN
  PERFORM public.marketing_require_admin();
  WITH page AS (
    SELECT c.*,
      count(d.id) FILTER (WHERE d.sent_at IS NOT NULL) AS sent,
      count(d.id) FILTER (WHERE d.delivered_at IS NOT NULL) AS delivered,
      count(d.id) FILTER (WHERE d.clicked_at IS NOT NULL) AS clicked,
      count(d.id) FILTER (WHERE d.converted_at IS NOT NULL) AS conversions
    FROM public.marketing_campaigns c
    LEFT JOIN public.marketing_calendar_items i ON i.campaign_id = c.id
    LEFT JOIN public.marketing_deliveries d ON d.item_id = i.id
    WHERE (p_status IS NULL OR c.status = p_status OR (p_status = 'active' AND c.status = 'running'))
      AND (p_cursor_updated_at IS NULL OR p_cursor_id IS NULL OR (c.updated_at, c.id) < (p_cursor_updated_at, p_cursor_id))
    GROUP BY c.id
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT v_limit + 1
  ), visible AS (
    SELECT * FROM page ORDER BY updated_at DESC, id DESC LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'objective', objective, 'content', content,
    'status', CASE WHEN status = 'running' THEN 'active' ELSE status END,
    'audience_id', audience_id, 'audience_name', audience_name, 'channels', to_jsonb(channels),
    'starts_at', starts_at, 'ends_at', ends_at, 'sent', sent, 'delivered', delivered,
    'clicked', clicked, 'conversions', conversions, 'requires_approval', requires_approval,
    'approval_status', CASE WHEN approved_at IS NOT NULL THEN 'approved' ELSE 'pending' END,
    'approved_at', approved_at, 'updated_at', updated_at
  ) ORDER BY updated_at DESC, id DESC), '[]'::jsonb),
  (SELECT count(*) > v_limit FROM page)
  INTO v_items, v_has_more FROM visible;

  RETURN jsonb_build_object(
    'items', v_items,
    'next_cursor', CASE WHEN v_has_more AND jsonb_array_length(v_items) > 0 THEN jsonb_build_object(
      'updated_at', v_items -> (jsonb_array_length(v_items) - 1) ->> 'updated_at',
      'id', v_items -> (jsonb_array_length(v_items) - 1) ->> 'id'
    ) ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_calendar_item(
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload ->> 'id', '')::uuid;
  v_existing public.marketing_calendar_items%ROWTYPE;
  v_row public.marketing_calendar_items%ROWTYPE;
  v_channel text := NULLIF(p_payload ->> 'channel', '');
  v_status text := COALESCE(NULLIF(p_payload ->> 'status', ''), 'draft');
  v_integration public.marketing_integrations%ROWTYPE;
  v_campaign_name text;
  v_requires_reapproval boolean := false;
BEGIN
  PERFORM public.marketing_require_admin();
  IF NULLIF(btrim(p_payload ->> 'title'), '') IS NULL OR v_channel IS NULL THEN
    RAISE EXCEPTION 'Title and channel are required' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'audience_definition' THEN
    RAISE EXCEPTION 'Use targeting for calendar audience filters' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'notification_campaign_id' OR p_payload ? 'social_post_id' OR p_payload ? 'ad_campaign_id' THEN
    RAISE EXCEPTION 'Provider mappings can only be attached by a dedicated service adapter' USING ERRCODE = '42501';
  END IF;
  IF NOT (p_payload ? 'targeting') OR COALESCE(p_payload -> 'targeting', '{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'Calendar targeting is required' USING ERRCODE = '22023';
  END IF;
  PERFORM public.marketing_validate_audience_filter(COALESCE(p_payload -> 'targeting', '{}'::jsonb));
  IF v_channel NOT IN ('tok_news', 'in_app', 'email', 'push', 'instagram', 'facebook',
    'linkedin', 'tiktok', 'youtube', 'telegram', 'google_business', 'website',
    'manual_call', 'manual_email', 'manual_visit') THEN
    RAISE EXCEPTION 'Invalid channel' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'active' THEN v_status := 'running'; END IF;
  IF v_status NOT IN ('draft','scheduled','queued','running','completed','failed','cancelled','blocked_configuration') THEN
    RAISE EXCEPTION 'Invalid editable calendar status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_integration FROM public.marketing_integrations
  WHERE channel = v_channel ORDER BY (status = 'connected') DESC, updated_at DESC LIMIT 1;
  IF v_channel IN ('email','push','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
     AND COALESCE(v_integration.status, 'disconnected') <> 'connected'
     AND v_status IN ('scheduled','queued','running') THEN
    v_status := 'blocked_configuration';
  END IF;

  IF v_id IS NULL THEN
    IF v_status IN ('scheduled','queued','running') THEN v_status := 'draft'; END IF;
    INSERT INTO public.marketing_calendar_items (
      campaign_id, integration_id, title, channel, item_type, status, approval_status,
      scheduled_at, timezone, audience_name, audience_size, content, targeting,
      notification_campaign_id, social_post_id, ad_campaign_id, max_attempts, created_by
    ) VALUES (
      NULLIF(p_payload ->> 'campaign_id', '')::uuid, v_integration.id,
      btrim(p_payload ->> 'title'), v_channel,
      COALESCE(NULLIF(p_payload ->> 'item_type', ''), 'broadcast'), v_status, 'pending',
      COALESCE(NULLIF(p_payload ->> 'scheduled_at', '')::timestamptz, now()),
      COALESCE(NULLIF(p_payload ->> 'timezone', ''), 'Europe/Zurich'),
      COALESCE(NULLIF(p_payload ->> 'audience_name', ''), 'Audience à définir'),
      COALESCE((p_payload ->> 'audience_size')::integer, 0),
      COALESCE(p_payload -> 'content', '{}'::jsonb), COALESCE(p_payload -> 'targeting', '{}'::jsonb),
      NULL, NULL, NULL,
      LEAST(GREATEST(COALESCE((p_payload ->> 'max_attempts')::integer, 3), 1), 10), public.marketing_actor_user_id()
    ) RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_existing FROM public.marketing_calendar_items WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Calendar item not found' USING ERRCODE = 'P0002'; END IF;
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'Calendar item was modified by another administrator' USING ERRCODE = '40001';
    END IF;
    IF v_existing.status IN ('sent','published','completed','cancelled') THEN
      RAISE EXCEPTION 'Completed calendar item is immutable' USING ERRCODE = '22023';
    END IF;
    v_requires_reapproval := v_existing.approval_status = 'approved' AND (
      ((p_payload ? 'campaign_id') AND NULLIF(p_payload ->> 'campaign_id', '')::uuid IS DISTINCT FROM v_existing.campaign_id)
      OR ((p_payload ? 'title') AND btrim(p_payload ->> 'title') IS DISTINCT FROM v_existing.title)
      OR v_channel IS DISTINCT FROM v_existing.channel
      OR ((p_payload ? 'scheduled_at') AND NULLIF(p_payload ->> 'scheduled_at', '')::timestamptz IS DISTINCT FROM v_existing.scheduled_at)
      OR ((p_payload ? 'audience_name') AND NULLIF(p_payload ->> 'audience_name', '') IS DISTINCT FROM v_existing.audience_name)
      OR ((p_payload ? 'audience_size') AND (p_payload ->> 'audience_size')::integer IS DISTINCT FROM v_existing.audience_size)
      OR ((p_payload ? 'content') AND (p_payload -> 'content') IS DISTINCT FROM v_existing.content)
      OR ((p_payload ? 'targeting') AND (p_payload -> 'targeting') IS DISTINCT FROM v_existing.targeting)
    );
    IF v_requires_reapproval THEN
      v_status := 'draft';
    ELSIF v_existing.approval_status <> 'approved'
      AND v_status IN ('scheduled','queued','running') THEN
      v_status := 'draft';
    END IF;
    UPDATE public.marketing_calendar_items SET
      campaign_id = CASE WHEN p_payload ? 'campaign_id' THEN NULLIF(p_payload ->> 'campaign_id', '')::uuid ELSE campaign_id END,
      integration_id = v_integration.id,
      title = btrim(p_payload ->> 'title'), channel = v_channel,
      item_type = COALESCE(NULLIF(p_payload ->> 'item_type', ''), item_type),
      status = v_status,
      approval_status = CASE WHEN v_requires_reapproval THEN 'pending' ELSE approval_status END,
      approved_by = CASE WHEN v_requires_reapproval THEN NULL ELSE approved_by END,
      approved_at = CASE WHEN v_requires_reapproval THEN NULL ELSE approved_at END,
      scheduled_at = COALESCE(NULLIF(p_payload ->> 'scheduled_at', '')::timestamptz, scheduled_at),
      timezone = COALESCE(NULLIF(p_payload ->> 'timezone', ''), timezone),
      audience_name = COALESCE(NULLIF(p_payload ->> 'audience_name', ''), audience_name),
      audience_size = COALESCE((p_payload ->> 'audience_size')::integer, audience_size),
      content = COALESCE(p_payload -> 'content', content), targeting = COALESCE(p_payload -> 'targeting', targeting),
      max_attempts = LEAST(GREATEST(COALESCE((p_payload ->> 'max_attempts')::integer, max_attempts), 1), 10),
      last_error = CASE WHEN v_status IN ('draft','scheduled','queued') THEN NULL ELSE last_error END
    WHERE id = v_id RETURNING * INTO v_row;
    IF v_requires_reapproval THEN
      UPDATE public.marketing_deliveries SET
        status = 'cancelled', last_error = 'Calendar item changed; delivery invalidated',
        lease_token = NULL, lease_expires_at = NULL
      WHERE item_id = v_id
        AND status IN ('queued','leased','processing','retrying','manual_required','blocked_configuration');
    END IF;
  END IF;

  SELECT c.name INTO v_campaign_name FROM public.marketing_campaigns c WHERE c.id = v_row.campaign_id;
  RETURN jsonb_build_object(
    'id', v_row.id, 'campaign_id', v_row.campaign_id,
    'campaign_name', COALESCE(v_campaign_name, 'Campagne'), 'title', v_row.title,
    'channel', v_row.channel,
    'status', CASE WHEN v_row.status IN ('queued','leased','processing','running','retrying') THEN 'running'
                   WHEN v_row.status IN ('sent','published','partial') THEN 'completed' ELSE v_row.status END,
    'scheduled_at', v_row.scheduled_at, 'timezone', v_row.timezone,
    'audience_name', v_row.audience_name, 'audience_size', v_row.audience_size,
    'approval_status', v_row.approval_status, 'content', v_row.content,
    'manual_outcome', v_row.result_summary ->> 'manual_outcome',
    'manual_note', left(v_row.result_summary ->> 'manual_note', 2000),
    'published_at', v_row.published_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_marketing_campaign_bundle(
  p_payload jsonb,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign_payload jsonb;
  v_campaign_result jsonb;
  v_item_payload jsonb;
  v_item_result jsonb;
  v_items jsonb := '[]'::jsonb;
  v_existing public.marketing_campaigns%ROWTYPE;
  v_campaign_id uuid;
  v_expected_items integer;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(jsonb_typeof(p_payload), 'null') <> 'object'
     OR COALESCE(jsonb_typeof(p_payload -> 'campaign'), 'null') <> 'object'
     OR COALESCE(jsonb_typeof(p_payload -> 'items'), 'null') <> 'array' THEN
    RAISE EXCEPTION 'Bundle requires campaign object and items array' USING ERRCODE = '22023';
  END IF;
  v_expected_items := jsonb_array_length(p_payload -> 'items');
  IF v_expected_items < 1 OR v_expected_items > 32 THEN
    RAISE EXCEPTION 'Bundle must contain between 1 and 32 calendar items' USING ERRCODE = '22023';
  END IF;
  IF (p_payload -> 'campaign') ? 'id' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_payload -> 'items') AS item(value) WHERE value ? 'id'
  ) THEN
    RAISE EXCEPTION 'Campaign bundles are create-only' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_request_id::text, 0));
  SELECT * INTO v_existing FROM public.marketing_campaigns
  WHERE metadata ->> 'client_request_id' = p_client_request_id::text FOR SHARE;
  IF FOUND THEN
    SELECT jsonb_build_object(
      'id', c.id, 'name', c.name, 'objective', c.objective, 'content', c.content,
      'status', CASE WHEN c.status = 'running' THEN 'active' ELSE c.status END,
      'audience_id', c.audience_id, 'audience_name', c.audience_name,
      'channels', to_jsonb(c.channels), 'starts_at', c.starts_at, 'ends_at', c.ends_at,
      'requires_approval', c.requires_approval,
      'approval_status', CASE WHEN c.approved_at IS NOT NULL THEN 'approved' ELSE 'pending' END,
      'approved_at', c.approved_at, 'updated_at', c.updated_at
    ) INTO v_campaign_result FROM public.marketing_campaigns c WHERE c.id = v_existing.id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id, 'campaign_id', i.campaign_id, 'campaign_name', v_existing.name,
      'title', i.title, 'channel', i.channel, 'status', i.status,
      'scheduled_at', i.scheduled_at, 'timezone', i.timezone,
      'audience_name', i.audience_name, 'audience_size', i.audience_size,
      'approval_status', i.approval_status, 'content', i.content,
      'manual_outcome', i.result_summary ->> 'manual_outcome',
      'manual_note', left(i.result_summary ->> 'manual_note', 2000),
      'published_at', i.published_at, 'updated_at', i.updated_at
    ) ORDER BY i.created_at, i.id), '[]'::jsonb)
    INTO v_items FROM public.marketing_calendar_items i WHERE i.campaign_id = v_existing.id;
    RETURN jsonb_build_object(
      'campaign', v_campaign_result, 'items', v_items,
      'complete', jsonb_array_length(v_items) = COALESCE((v_existing.metadata ->> 'bundle_item_count')::integer, v_expected_items),
      'duplicate', true
    );
  END IF;

  v_campaign_payload := jsonb_set(
    p_payload -> 'campaign', '{metadata}',
    COALESCE(p_payload -> 'campaign' -> 'metadata', '{}'::jsonb) || jsonb_build_object(
      'client_request_id', p_client_request_id::text,
      'bundle_item_count', v_expected_items
    ), true
  );
  v_campaign_result := public.admin_upsert_marketing_campaign(v_campaign_payload, NULL);
  v_campaign_id := (v_campaign_result ->> 'id')::uuid;

  FOR v_item_payload IN SELECT value FROM jsonb_array_elements(p_payload -> 'items')
  LOOP
    v_item_result := public.admin_upsert_marketing_calendar_item(
      jsonb_set(v_item_payload, '{campaign_id}', to_jsonb(v_campaign_id::text), true), NULL
    );
    v_items := v_items || jsonb_build_array(v_item_result);
  END LOOP;

  RETURN jsonb_build_object(
    'campaign', v_campaign_result, 'items', v_items,
    'complete', jsonb_array_length(v_items) = v_expected_items,
    'duplicate', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_marketing_item(p_item_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_row public.marketing_calendar_items%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_admin();
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Cancellation reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.marketing_calendar_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Calendar item not found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status IN ('sent','published','completed') THEN
    RAISE EXCEPTION 'A completed item cannot be cancelled' USING ERRCODE = '22023';
  END IF;
  UPDATE public.marketing_calendar_items SET
    status = 'cancelled', cancelled_at = now(), last_error = left(btrim(p_reason), 1000),
    lease_token = NULL, lease_expires_at = NULL
  WHERE id = p_item_id RETURNING * INTO v_row;
  UPDATE public.marketing_deliveries SET status = 'cancelled', last_error = left(btrim(p_reason), 1000)
  WHERE item_id = p_item_id AND status IN ('queued','leased','processing','retrying','manual_required');
  RETURN jsonb_build_object('id', v_row.id, 'status', 'cancelled', 'cancelled_at', v_row.cancelled_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_marketing_calendar(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_cursor_scheduled_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 300);
  v_items jsonb;
  v_has_more boolean;
BEGIN
  PERFORM public.marketing_require_admin();
  WITH page AS (
    SELECT i.*, COALESCE(c.name, 'Campagne') AS campaign_name
    FROM public.marketing_calendar_items i
    LEFT JOIN public.marketing_campaigns c ON c.id = i.campaign_id
    WHERE (p_from IS NULL OR i.scheduled_at >= p_from)
      AND (p_to IS NULL OR i.scheduled_at <= p_to)
      AND (p_channel IS NULL OR i.channel = p_channel)
      AND (
        p_status IS NULL OR i.status = p_status
        OR (p_status = 'running' AND i.status IN ('queued','leased','processing','retrying'))
        OR (p_status = 'completed' AND i.status IN ('sent','published','partial'))
      )
      AND (p_cursor_scheduled_at IS NULL OR p_cursor_id IS NULL OR (i.scheduled_at, i.id) > (p_cursor_scheduled_at, p_cursor_id))
    ORDER BY i.scheduled_at ASC, i.id ASC
    LIMIT v_limit + 1
  ), visible AS (
    SELECT * FROM page ORDER BY scheduled_at ASC, id ASC LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'campaign_id', campaign_id, 'campaign_name', campaign_name,
    'title', title, 'channel', channel,
    'status', CASE WHEN status IN ('queued','leased','processing','retrying') THEN 'running'
                   WHEN status IN ('sent','published','partial') THEN 'completed' ELSE status END,
    'scheduled_at', scheduled_at, 'timezone', timezone, 'audience_name', audience_name,
    'audience_size', audience_size, 'approval_status', approval_status, 'content', content,
    'manual_outcome', result_summary ->> 'manual_outcome',
    'manual_note', left(result_summary ->> 'manual_note', 2000),
    'published_at', published_at,
    'updated_at', updated_at
  ) ORDER BY scheduled_at ASC, id ASC), '[]'::jsonb),
  (SELECT count(*) > v_limit FROM page)
  INTO v_items, v_has_more FROM visible;

  RETURN jsonb_build_object(
    'items', v_items,
    'next_cursor', CASE WHEN v_has_more AND jsonb_array_length(v_items) > 0 THEN jsonb_build_object(
      'scheduled_at', v_items -> (jsonb_array_length(v_items) - 1) ->> 'scheduled_at',
      'id', v_items -> (jsonb_array_length(v_items) - 1) ->> 'id'
    ) ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_contact(
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload ->> 'id', '')::uuid;
  v_existing public.marketing_contacts%ROWTYPE;
  v_row public.marketing_contacts%ROWTYPE;
  v_user_id uuid := NULLIF(p_payload ->> 'user_id', '')::uuid;
  v_email text := NULLIF(btrim(p_payload ->> 'email'), '');
  v_phone text := NULLIF(btrim(p_payload ->> 'phone'), '');
  v_phone_normalized text;
  v_contact_type text := COALESCE(NULLIF(p_payload ->> 'contact_type', ''), 'manual');
  v_lawful_basis text := COALESCE(NULLIF(p_payload ->> 'lawful_basis', ''), 'none');
  v_requested_opted_out_at timestamptz := NULLIF(p_payload ->> 'opted_out_at', '')::timestamptz;
  v_evidence jsonb := COALESCE(p_payload -> 'metadata' -> 'lawful_basis_evidence', 'null'::jsonb);
  v_evidence_source text := NULLIF(btrim(v_evidence ->> 'source'), '');
  v_evidence_note text := NULLIF(btrim(v_evidence ->> 'note'), '');
  v_evidence_at timestamptz := NULLIF(v_evidence ->> 'recorded_at', '')::timestamptz;
  v_display_name text;
  v_fingerprint text;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Contact payload must be an object' USING ERRCODE = '22023';
  END IF;
  IF v_lawful_basis NOT IN ('none','consent','existing_customer','legitimate_interest') THEN
    RAISE EXCEPTION 'Invalid lawful basis' USING ERRCODE = '22023';
  END IF;
  IF v_contact_type NOT IN ('registered_user','restaurant_prospect','restaurant_lead','manual') THEN
    RAISE EXCEPTION 'Invalid marketing contact type' USING ERRCODE = '22023';
  END IF;
  IF v_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.marketing_contacts WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Marketing contact not found' USING ERRCODE = 'P0002'; END IF;
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'Contact was modified by another administrator' USING ERRCODE = '40001';
    END IF;
    IF v_existing.contact_type = 'registered_user'
       AND COALESCE(NULLIF(p_payload ->> 'contact_type', ''), v_existing.contact_type)
         IN ('restaurant_prospect','restaurant_lead') THEN
      RAISE EXCEPTION 'Registered client contacts cannot be converted into restaurant leads' USING ERRCODE = '42501';
    END IF;
    IF NOT (p_payload ? 'lawful_basis') THEN v_lawful_basis := v_existing.lawful_basis; END IF;
    v_email := CASE WHEN p_payload ? 'email' THEN v_email ELSE v_existing.email END;
    v_phone := CASE WHEN p_payload ? 'phone' THEN v_phone ELSE v_existing.phone END;
    v_user_id := CASE WHEN p_payload ? 'user_id' THEN v_user_id ELSE v_existing.user_id END;
    v_contact_type := COALESCE(NULLIF(p_payload ->> 'contact_type', ''), v_existing.contact_type);
  END IF;
  v_display_name := COALESCE(NULLIF(btrim(p_payload ->> 'display_name'), ''), v_existing.display_name);
  IF char_length(COALESCE(v_display_name, '')) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'Restaurant name must contain between 2 and 200 characters' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND (
    char_length(v_email) > 320 OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) THEN
    RAISE EXCEPTION 'Invalid contact email' USING ERRCODE = '22023';
  END IF;
  v_phone_normalized := public.marketing_normalize_swiss_phone(v_phone);
  IF v_existing.opted_out_at IS NOT NULL
     AND v_phone_normalized IS DISTINCT FROM v_existing.phone_normalized THEN
    RAISE EXCEPTION 'Suppressed contact phone identity cannot be changed or removed'
      USING ERRCODE = '42501';
  END IF;
  IF v_phone_normalized IS NOT NULL THEN
    -- Serialize the friendly duplicate check; the partial unique index remains
    -- the final database guard for writes outside this governed RPC.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('marketing-phone:' || v_phone_normalized, 0)
    );
    IF EXISTS (
      SELECT 1
      FROM public.marketing_contacts c
      WHERE c.phone_normalized = v_phone_normalized
        AND c.id IS DISTINCT FROM v_id
    ) THEN
      RAISE EXCEPTION 'Marketing phone identity already exists, including suppressed contacts'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  IF v_contact_type IN ('restaurant_prospect','restaurant_lead') AND v_lawful_basis <> 'none' THEN
    IF v_email IS NULL AND v_phone IS NULL THEN
      RAISE EXCEPTION 'A qualified restaurant requires an email or phone' USING ERRCODE = '22023';
    END IF;
    IF v_lawful_basis = 'legitimate_interest' AND v_phone IS NULL THEN
      RAISE EXCEPTION 'Legitimate interest is restricted to a manual phone task' USING ERRCODE = '22023';
    END IF;
    IF v_evidence_source IS NULL OR char_length(v_evidence_source) NOT BETWEEN 3 AND 200
       OR v_evidence_note IS NULL OR char_length(v_evidence_note) NOT BETWEEN 10 AND 1000
       OR v_evidence_at IS NULL OR v_evidence_at > clock_timestamp() + interval '5 minutes' THEN
      RAISE EXCEPTION 'Lawful basis requires a dated source and an evidence note' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_lawful_basis = 'consent' AND (
    NULLIF(btrim(p_payload ->> 'consent_source'), '') IS NULL
    OR NULLIF(p_payload ->> 'consent_at', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Consent requires source and timestamp' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := encode(extensions.digest(COALESCE(
    lower(v_email), v_phone_normalized, v_user_id::text,
    NULLIF(p_payload ->> 'source_reference', ''), v_existing.source_reference,
    NULLIF(p_payload ->> 'source_objectid', ''), v_existing.source_objectid::text
  ), 'sha256'), 'hex');

  IF v_id IS NULL THEN
    INSERT INTO public.marketing_contacts (
      contact_type, user_id, source_objectid, restaurant_lead_id, source_system, source_reference,
      display_name, email, phone, target_fingerprint, locale, canton, city, category, lead_score,
      lifecycle_status, lawful_basis, consent_source, consent_at, opted_out_at, suppression_reason,
      last_verified_at, last_contact_at, next_action_at, metadata, created_by
    ) VALUES (
      v_contact_type, v_user_id,
      NULLIF(p_payload ->> 'source_objectid', '')::bigint,
      NULLIF(p_payload ->> 'restaurant_lead_id', '')::uuid,
      COALESCE(NULLIF(p_payload ->> 'source_system', ''), 'manual'),
      NULLIF(p_payload ->> 'source_reference', ''), v_display_name,
      v_email, v_phone, v_fingerprint, COALESCE(NULLIF(p_payload ->> 'locale', ''), 'fr-CH'),
      NULLIF(p_payload ->> 'canton', ''), NULLIF(p_payload ->> 'city', ''),
      NULLIF(p_payload ->> 'category', ''), LEAST(GREATEST(COALESCE((p_payload ->> 'lead_score')::integer, 0), 0), 100),
      CASE WHEN v_requested_opted_out_at IS NOT NULL THEN 'opted_out'
           ELSE COALESCE(NULLIF(p_payload ->> 'lifecycle_status', ''), 'new') END,
      CASE WHEN v_requested_opted_out_at IS NOT NULL THEN 'none' ELSE v_lawful_basis END,
      NULLIF(p_payload ->> 'consent_source', ''), NULLIF(p_payload ->> 'consent_at', '')::timestamptz,
      v_requested_opted_out_at, NULLIF(p_payload ->> 'suppression_reason', ''),
      NULLIF(p_payload ->> 'last_verified_at', '')::timestamptz,
      NULLIF(p_payload ->> 'last_contact_at', '')::timestamptz,
      NULLIF(p_payload ->> 'next_action_at', '')::timestamptz,
      COALESCE(p_payload -> 'metadata', '{}'::jsonb), public.marketing_actor_user_id()
    ) RETURNING * INTO v_row;
  ELSE
    -- An ordinary admin edit can never turn an opt-out back into an opt-in.
    IF v_existing.opted_out_at IS NOT NULL AND p_payload ? 'opted_out_at' AND v_requested_opted_out_at IS NULL THEN
      RAISE EXCEPTION 'Opt-out cannot be cleared by contact upsert' USING ERRCODE = '42501';
    END IF;
    IF v_existing.opted_out_at IS NOT NULL AND v_lawful_basis <> 'none' THEN
      RAISE EXCEPTION 'Suppressed contact cannot regain a lawful basis through upsert' USING ERRCODE = '42501';
    END IF;

    UPDATE public.marketing_contacts SET
      contact_type = COALESCE(NULLIF(p_payload ->> 'contact_type', ''), contact_type),
      user_id = v_user_id,
      source_objectid = CASE WHEN p_payload ? 'source_objectid' THEN NULLIF(p_payload ->> 'source_objectid', '')::bigint ELSE source_objectid END,
      restaurant_lead_id = CASE WHEN p_payload ? 'restaurant_lead_id' THEN NULLIF(p_payload ->> 'restaurant_lead_id', '')::uuid ELSE restaurant_lead_id END,
      source_system = COALESCE(NULLIF(p_payload ->> 'source_system', ''), source_system),
      source_reference = CASE WHEN p_payload ? 'source_reference' THEN NULLIF(p_payload ->> 'source_reference', '') ELSE source_reference END,
      display_name = v_display_name,
      email = v_email, phone = v_phone, target_fingerprint = v_fingerprint,
      locale = COALESCE(NULLIF(p_payload ->> 'locale', ''), locale),
      canton = CASE WHEN p_payload ? 'canton' THEN NULLIF(p_payload ->> 'canton', '') ELSE canton END,
      city = CASE WHEN p_payload ? 'city' THEN NULLIF(p_payload ->> 'city', '') ELSE city END,
      category = CASE WHEN p_payload ? 'category' THEN NULLIF(p_payload ->> 'category', '') ELSE category END,
      lead_score = LEAST(GREATEST(COALESCE((p_payload ->> 'lead_score')::integer, lead_score), 0), 100),
      lifecycle_status = CASE WHEN opted_out_at IS NOT NULL OR v_requested_opted_out_at IS NOT NULL THEN 'opted_out'
        ELSE COALESCE(NULLIF(p_payload ->> 'lifecycle_status', ''), lifecycle_status) END,
      lawful_basis = CASE WHEN opted_out_at IS NOT NULL OR v_requested_opted_out_at IS NOT NULL THEN 'none' ELSE v_lawful_basis END,
      consent_source = CASE WHEN v_lawful_basis <> 'consent' THEN NULL
        WHEN p_payload ? 'consent_source' THEN NULLIF(p_payload ->> 'consent_source', '') ELSE consent_source END,
      consent_at = CASE WHEN v_lawful_basis <> 'consent' THEN NULL
        WHEN p_payload ? 'consent_at' THEN NULLIF(p_payload ->> 'consent_at', '')::timestamptz ELSE consent_at END,
      opted_out_at = COALESCE(opted_out_at, v_requested_opted_out_at),
      suppression_reason = CASE WHEN p_payload ? 'suppression_reason' THEN NULLIF(p_payload ->> 'suppression_reason', '') ELSE suppression_reason END,
      last_verified_at = CASE WHEN p_payload ? 'last_verified_at' THEN NULLIF(p_payload ->> 'last_verified_at', '')::timestamptz ELSE last_verified_at END,
      last_contact_at = CASE WHEN p_payload ? 'last_contact_at' THEN NULLIF(p_payload ->> 'last_contact_at', '')::timestamptz ELSE last_contact_at END,
      next_action_at = CASE WHEN p_payload ? 'next_action_at' THEN NULLIF(p_payload ->> 'next_action_at', '')::timestamptz ELSE next_action_at END,
      metadata = CASE
        WHEN COALESCE((metadata ->> 'email_suppressed')::boolean, false) THEN
          metadata || COALESCE(p_payload -> 'metadata', '{}'::jsonb) || '{"email_suppressed":true}'::jsonb
        ELSE metadata || COALESCE(p_payload -> 'metadata', '{}'::jsonb)
      END
    WHERE id = v_id RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'contact_type', v_row.contact_type, 'display_name', v_row.display_name,
    'email_masked', CASE WHEN v_row.email_normalized IS NULL THEN NULL
      ELSE public.marketing_mask_target(v_row.email) END,
    'phone_masked', CASE WHEN v_row.phone_normalized IS NULL THEN NULL
      ELSE public.marketing_mask_target(v_row.phone) END,
    'has_email', v_row.email_normalized IS NOT NULL,
    'has_phone', v_row.phone_normalized IS NOT NULL,
    'city', v_row.city, 'canton', v_row.canton, 'category', v_row.category,
    'status', v_row.lifecycle_status, 'lead_score', v_row.lead_score,
    'contactability', CASE WHEN v_row.opted_out_at IS NOT NULL THEN 'opted_out'
      WHEN public.marketing_contact_is_eligible(v_row.id, 'email')
        OR public.marketing_contact_is_eligible(v_row.id, 'manual_email')
        OR public.marketing_contact_is_eligible(v_row.id, 'push')
        OR public.marketing_contact_is_eligible(v_row.id, 'in_app')
        OR public.marketing_contact_is_eligible(v_row.id, 'manual_call')
        THEN 'ready' ELSE 'manual_research' END,
    'lawful_basis', v_row.lawful_basis, 'opted_out_at', v_row.opted_out_at,
    'last_contact_at', v_row.last_contact_at, 'next_action_at', v_row.next_action_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_suppress_marketing_contact(p_contact_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_row public.marketing_contacts%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_contact_id IS NULL OR NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Suppression reason must contain between 8 and 500 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config(
    'app.marketing_lawful_basis_context',
    jsonb_build_object(
      'source', 'marketing_admin_suppression',
      'note', 'Administrator recorded marketing suppression: ' || left(btrim(p_reason), 500),
      'recorded_at', clock_timestamp(),
      'quality', 'verified',
      'source_system', 'marketing_admin'
    )::text,
    true
  );
  UPDATE public.marketing_contacts SET
    opted_out_at = COALESCE(opted_out_at, now()), lifecycle_status = 'opted_out', lawful_basis = 'none',
    suppression_reason = left(btrim(p_reason), 500), next_action_at = NULL
  WHERE id = p_contact_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketing contact not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.marketing_deliveries SET
    status = 'cancelled', last_error = 'Contact suppressed', unsubscribed_at = COALESCE(unsubscribed_at, now())
  WHERE contact_id = p_contact_id AND status IN ('queued','leased','processing','retrying','manual_required');
  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.lifecycle_status, 'opted_out_at', v_row.opted_out_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_marketing_contacts(
  p_query text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_query text := NULLIF(lower(btrim(p_query)), '');
  v_status text := NULLIF(btrim(p_status), '');
  v_channel text := NULLIF(btrim(p_channel), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_offset integer := COALESCE(p_offset, 0);
  v_items jsonb;
  v_total bigint;
BEGIN
  PERFORM public.marketing_require_admin();
  IF v_query IS NOT NULL AND (
    char_length(v_query) > 80 OR position('%' IN v_query) > 0
    OR position('_' IN v_query) > 0 OR position(chr(92) IN v_query) > 0
  ) THEN
    RAISE EXCEPTION 'Contact search query is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN (
    'new','qualified','contacted','follow_up','converted','opted_out'
  ) THEN
    RAISE EXCEPTION 'Contact status filter is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_channel IS NOT NULL AND v_channel NOT IN (
    'tok_news','in_app','email','push','instagram','facebook','linkedin',
    'tiktok','youtube','telegram','google_business','website',
    'manual_call','manual_email','manual_visit'
  ) THEN
    RAISE EXCEPTION 'Contact channel filter is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_offset < 0 OR v_offset > 100000 THEN
    RAISE EXCEPTION 'Contact offset is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.marketing_contacts c
  WHERE (v_status IS NULL OR c.lifecycle_status = v_status)
    AND (v_channel IS NULL OR public.marketing_contact_is_eligible(c.id, v_channel))
    AND (v_query IS NULL OR
      lower(c.display_name) LIKE v_query || '%'
      OR lower(COALESCE(c.city, '')) LIKE v_query || '%'
      OR lower(COALESCE(c.canton, '')) LIKE v_query || '%'
      OR lower(COALESCE(c.category, '')) LIKE v_query || '%'
      OR lower(c.contact_type) LIKE v_query || '%'
      OR lower(c.lifecycle_status) LIKE v_query || '%'
      OR lower(c.lawful_basis) LIKE v_query || '%'
    );

  SELECT COALESCE(jsonb_agg(page.item ORDER BY page.updated_at DESC, page.id DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT c.updated_at, c.id, jsonb_build_object(
      'id', c.id, 'contact_type', c.contact_type, 'display_name', c.display_name,
      'email_masked', CASE WHEN c.email_normalized IS NULL THEN NULL
        ELSE public.marketing_mask_target(c.email) END,
      'phone_masked', CASE WHEN c.phone_normalized IS NULL THEN NULL
        ELSE public.marketing_mask_target(c.phone) END,
      'has_email', c.email_normalized IS NOT NULL,
      'has_phone', c.phone_normalized IS NOT NULL,
      'city', c.city, 'canton', c.canton, 'category', c.category, 'status', c.lifecycle_status,
      'lead_score', c.lead_score, 'contactability', CASE WHEN c.opted_out_at IS NOT NULL THEN 'opted_out'
        WHEN public.marketing_contact_is_eligible(c.id, 'email')
          OR public.marketing_contact_is_eligible(c.id, 'manual_email')
          OR public.marketing_contact_is_eligible(c.id, 'push')
          OR public.marketing_contact_is_eligible(c.id, 'in_app')
          OR public.marketing_contact_is_eligible(c.id, 'manual_call')
          THEN 'ready' ELSE 'manual_research' END,
      'lawful_basis', c.lawful_basis, 'last_contact_at', c.last_contact_at,
      'next_action_at', c.next_action_at, 'updated_at', c.updated_at
    ) AS item
    FROM public.marketing_contacts c
    WHERE (v_status IS NULL OR c.lifecycle_status = v_status)
      AND (v_channel IS NULL OR public.marketing_contact_is_eligible(c.id, v_channel))
      AND (v_query IS NULL OR
        lower(c.display_name) LIKE v_query || '%'
        OR lower(COALESCE(c.city, '')) LIKE v_query || '%'
        OR lower(COALESCE(c.canton, '')) LIKE v_query || '%'
        OR lower(COALESCE(c.category, '')) LIKE v_query || '%'
        OR lower(c.contact_type) LIKE v_query || '%'
        OR lower(c.lifecycle_status) LIKE v_query || '%'
        OR lower(c.lawful_basis) LIKE v_query || '%'
      )
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT v_limit OFFSET v_offset
  ) page;

  RETURN jsonb_build_object(
    'items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset,
    'has_more', v_offset::bigint + jsonb_array_length(v_items) < v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sync_marketing_prospect_catalog(
  p_limit integer DEFAULT 500,
  p_after_source_objectid bigint DEFAULT NULL,
  p_until_source_objectid bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
  v_watermark bigint := p_until_source_objectid;
  v_next_cursor bigint;
  v_processed integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_has_more boolean := false;
BEGIN
  PERFORM public.marketing_require_admin();

  -- The first request freezes a high-water mark. Subsequent batches keep the
  -- same value so inserts arriving during a run cannot make it endless.
  IF v_watermark IS NULL THEN
    SELECT max(c.source_objectid) INTO v_watermark
    FROM public.commercial_prospect_catalog c;
  END IF;
  IF v_watermark IS NOT NULL AND p_after_source_objectid IS NOT NULL
     AND p_after_source_objectid > v_watermark THEN
    RAISE EXCEPTION 'Prospect synchronization cursor exceeds its watermark'
      USING ERRCODE = '22023';
  END IF;

  WITH page AS MATERIALIZED (
    SELECT c.source_objectid, c.dataset_version
    FROM public.commercial_prospect_catalog c
    WHERE v_watermark IS NOT NULL
      AND (p_after_source_objectid IS NULL OR c.source_objectid > p_after_source_objectid)
      AND c.source_objectid <= v_watermark
    ORDER BY c.source_objectid
    LIMIT v_limit + 1
  ), batch AS MATERIALIZED (
    SELECT p.source_objectid, p.dataset_version
    FROM page p
    ORDER BY p.source_objectid
    LIMIT v_limit
  ), updated AS (
    UPDATE public.marketing_contacts m SET
      metadata = jsonb_set(m.metadata, '{dataset_version}', to_jsonb(b.dataset_version), true)
    FROM batch b
    WHERE m.source_system = 'commercial_prospect_catalog'
      AND m.source_reference = b.source_objectid::text
      AND (m.metadata -> 'dataset_version') IS DISTINCT FROM to_jsonb(b.dataset_version)
    RETURNING m.id
  ), inserted AS (
    INSERT INTO public.marketing_contacts (
      contact_type, source_objectid, source_system, source_reference, display_name,
      target_fingerprint, lawful_basis, lifecycle_status, metadata, created_by
    )
    SELECT
      'restaurant_prospect', c.source_objectid, 'commercial_prospect_catalog', c.source_objectid::text,
      'Restaurant #' || c.source_objectid::text,
      encode(extensions.digest('commercial_prospect_catalog:' || c.source_objectid::text, 'sha256'), 'hex'),
      'none', 'new', jsonb_build_object('dataset_version', c.dataset_version), public.marketing_actor_user_id()
    FROM batch c
    ON CONFLICT (source_system, source_reference) WHERE source_reference IS NOT NULL DO NOTHING
    RETURNING id
  )
  SELECT
    count(*)::integer,
    max(batch.source_objectid),
    (SELECT count(*)::integer FROM inserted),
    (SELECT count(*)::integer FROM updated),
    (SELECT count(*) > v_limit FROM page)
  INTO v_processed, v_next_cursor, v_inserted, v_updated, v_has_more
  FROM batch;

  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(), public.marketing_actor_user_id(), 'marketing_prospect_catalog_synced', 'marketing_contacts', NULL,
    jsonb_build_object(
      'cursor_from', p_after_source_objectid::text,
      'cursor_to', v_next_cursor::text,
      'watermark', v_watermark::text,
      'processed', v_processed,
      'inserted', v_inserted,
      'updated', v_updated,
      'has_more', v_has_more
    ), now()
  );
  RETURN jsonb_build_object(
    'processed', v_processed,
    'inserted', v_inserted,
    'updated', v_updated,
    -- Lookahead keeps the request bounded: when true, at least one row remains.
    'remaining', CASE WHEN v_has_more THEN 1 ELSE 0 END,
    'remaining_is_exact', NOT v_has_more,
    'has_more', v_has_more,
    'complete', NOT v_has_more,
    'next_cursor', CASE WHEN v_processed > 0 THEN v_next_cursor::text ELSE NULL END,
    'watermark', v_watermark::text,
    'contains_pii', false,
    'synced_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sync_marketing_client_consents(
  p_limit integer DEFAULT 250,
  p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 250), 1), 250);
  v_receipt record;
  v_contact public.marketing_contacts%ROWTYPE;
  v_contact_exists boolean;
  v_processed integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_suppressed integer := 0;
  v_reconsented integer := 0;
  v_has_more boolean := false;
  v_after_user_id uuid;
  v_next_cursor uuid;
  v_opaque_cursor text;
  v_cursor_payload text;
  v_cursor_parts text[];
  v_secret text;
  v_actor_user_id uuid;
BEGIN
  PERFORM public.marketing_require_admin();
  v_actor_user_id := public.marketing_actor_user_id();
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Marketing actor context is required' USING ERRCODE = '42501';
  END IF;

  -- The browser receives only an encrypted, actor-bound continuation token;
  -- the underlying auth.users UUID never crosses the BFF boundary.
  IF p_cursor IS NOT NULL THEN
    IF char_length(p_cursor) NOT BETWEEN 40 AND 512
       OR p_cursor !~ '^[A-Za-z0-9+/]+={0,2}$' THEN
      RAISE EXCEPTION 'Consent synchronization cursor is invalid' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_secret := public.marketing_bff_encryption_secret();
      v_cursor_payload := extensions.pgp_sym_decrypt(
        decode(p_cursor, 'base64'),
        v_secret
      );
      v_cursor_parts := string_to_array(v_cursor_payload, '|');
      IF cardinality(v_cursor_parts) <> 3
         OR v_cursor_parts[1] <> 'marketing-consent-v1'
         OR v_cursor_parts[2]::uuid IS DISTINCT FROM v_actor_user_id THEN
        RAISE EXCEPTION 'Consent synchronization cursor is invalid' USING ERRCODE = '22023';
      END IF;
      v_after_user_id := v_cursor_parts[3]::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Consent synchronization cursor is invalid' USING ERRCODE = '22023';
    END;
  END IF;

  FOR v_receipt IN
    WITH users AS MATERIALIZED (
      SELECT DISTINCT r.user_id
      FROM public.consent_receipts r
      WHERE r.user_id IS NOT NULL
        AND (v_after_user_id IS NULL OR r.user_id > v_after_user_id)
      ORDER BY r.user_id
      LIMIT v_limit + 1
    )
    SELECT latest.id, users.user_id, latest.consent_version, latest.marketing,
      latest.source, latest.recorded_at,
      row_number() OVER (ORDER BY users.user_id) AS batch_position
    FROM users
    CROSS JOIN LATERAL (
      SELECT r.id, r.consent_version, r.marketing, r.source, r.recorded_at
      FROM public.consent_receipts r
      WHERE r.user_id = users.user_id
      ORDER BY r.recorded_at DESC, r.created_at DESC, r.id DESC
      LIMIT 1
    ) latest
    ORDER BY users.user_id
  LOOP
    IF v_receipt.batch_position > v_limit THEN
      v_has_more := true;
      EXIT;
    END IF;

    v_processed := v_processed + 1;
    v_next_cursor := v_receipt.user_id;
    -- Two administrators may start the same resumable run. Serialize only the
    -- current user, never the whole catalogue.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('marketing-consent:' || v_receipt.user_id::text, 0)
    );
    SELECT * INTO v_contact FROM public.marketing_contacts
    WHERE user_id = v_receipt.user_id FOR UPDATE;
    v_contact_exists := FOUND;

    IF v_contact_exists
       AND v_contact.source_system = 'consent_receipts'
       AND v_contact.source_reference = v_receipt.id::text
       AND v_contact.metadata ->> 'receipt_id' = v_receipt.id::text THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    PERFORM set_config(
      'app.marketing_lawful_basis_context',
      jsonb_build_object(
        'source', left('consent_receipts:' || COALESCE(NULLIF(v_receipt.source, ''), 'unknown'), 200),
        'note', CASE WHEN v_receipt.marketing IS TRUE
          THEN 'Explicit marketing consent synchronized from the authoritative consent receipt.'
          ELSE 'Marketing opposition synchronized from the authoritative consent receipt.' END,
        'recorded_at', COALESCE(v_receipt.recorded_at, clock_timestamp()),
        'quality', 'verified',
        'source_system', 'consent_receipts',
        'source_reference', v_receipt.id::text
      )::text,
      true
    );

    IF NOT v_contact_exists THEN
      INSERT INTO public.marketing_contacts (
        contact_type, user_id, source_system, source_reference, display_name,
        target_fingerprint, lawful_basis, lifecycle_status, consent_source, consent_at,
        opted_out_at, suppression_reason, metadata, created_by
      ) VALUES (
        'registered_user', v_receipt.user_id, 'consent_receipts', v_receipt.id::text, 'Client TheTOK',
        encode(extensions.digest('consent_receipts:' || v_receipt.user_id::text, 'sha256'), 'hex'),
        CASE WHEN v_receipt.marketing IS TRUE THEN 'consent' ELSE 'none' END,
        CASE WHEN v_receipt.marketing IS TRUE THEN 'new' ELSE 'opted_out' END,
        CASE WHEN v_receipt.marketing IS TRUE THEN
          'consent_receipts:' || COALESCE(NULLIF(v_receipt.source, ''), 'unknown') ELSE NULL END,
        CASE WHEN v_receipt.marketing IS TRUE THEN
          COALESCE(v_receipt.recorded_at, clock_timestamp()) ELSE NULL END,
        CASE WHEN v_receipt.marketing IS TRUE THEN NULL
          ELSE COALESCE(v_receipt.recorded_at, clock_timestamp()) END,
        CASE WHEN v_receipt.marketing IS TRUE THEN NULL ELSE 'consent_receipt_opt_out' END,
        jsonb_build_object('receipt_id', v_receipt.id, 'consent_version', v_receipt.consent_version), public.marketing_actor_user_id()
      );
      v_inserted := v_inserted + 1;
      IF v_receipt.marketing IS NOT TRUE THEN v_suppressed := v_suppressed + 1; END IF;
    ELSIF v_receipt.marketing IS NOT TRUE THEN
      UPDATE public.marketing_contacts SET
        source_system = 'consent_receipts', source_reference = v_receipt.id::text,
        lawful_basis = 'none', lifecycle_status = 'opted_out',
        opted_out_at = GREATEST(
          COALESCE(opted_out_at, v_receipt.recorded_at, clock_timestamp()),
          COALESCE(v_receipt.recorded_at, clock_timestamp())
        ),
        suppression_reason = 'consent_receipt_opt_out', consent_source = NULL, consent_at = NULL,
        next_action_at = NULL,
        metadata = metadata || jsonb_build_object('receipt_id', v_receipt.id, 'consent_version', v_receipt.consent_version)
      WHERE id = v_contact.id;
      UPDATE public.marketing_deliveries SET
        status = 'cancelled', last_error = 'Contact opted out through consent receipt',
        unsubscribed_at = COALESCE(unsubscribed_at, v_receipt.recorded_at, clock_timestamp())
      WHERE contact_id = v_contact.id AND status IN ('queued','leased','processing','retrying','manual_required');
      v_updated := v_updated + 1;
      v_suppressed := v_suppressed + 1;
    ELSIF v_contact.opted_out_at IS NULL
       OR (v_receipt.source = 'settings' AND v_receipt.recorded_at > v_contact.opted_out_at) THEN
      -- Re-consent is accepted only from a newer explicit settings receipt.
      IF v_contact.opted_out_at IS NOT NULL THEN v_reconsented := v_reconsented + 1; END IF;
      UPDATE public.marketing_contacts SET
        source_system = 'consent_receipts', source_reference = v_receipt.id::text,
        lawful_basis = 'consent', lifecycle_status = CASE WHEN lifecycle_status = 'opted_out' THEN 'new' ELSE lifecycle_status END,
        consent_source = 'consent_receipts:' || COALESCE(NULLIF(v_receipt.source, ''), 'unknown'),
        consent_at = COALESCE(v_receipt.recorded_at, clock_timestamp()),
        opted_out_at = NULL, suppression_reason = NULL,
        metadata = metadata || jsonb_build_object('receipt_id', v_receipt.id, 'consent_version', v_receipt.consent_version)
      WHERE id = v_contact.id;
      v_updated := v_updated + 1;
    ELSE
      -- An opt-out is never cleared by a non-settings receipt. The user is
      -- advanced in this run, but the protected suppression state is retained.
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;
  IF v_has_more AND v_next_cursor IS NOT NULL THEN
    v_secret := COALESCE(v_secret, public.marketing_bff_encryption_secret());
    v_opaque_cursor := replace(encode(extensions.pgp_sym_encrypt(
      concat_ws('|', 'marketing-consent-v1', v_actor_user_id::text, v_next_cursor::text),
      v_secret,
      'cipher-algo=aes256, compress-algo=0'
    ), 'base64'), E'\n', '');
  END IF;
  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(), public.marketing_actor_user_id(), 'marketing_client_consents_synced', 'marketing_contacts', NULL,
    jsonb_build_object(
      'processed', v_processed, 'inserted', v_inserted, 'updated', v_updated,
      'skipped', v_skipped, 'suppressed', v_suppressed,
      'reconsented', v_reconsented, 'has_more', v_has_more
    ), now()
  );
  RETURN jsonb_build_object(
    'processed', v_processed,
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped,
    'suppressed', v_suppressed,
    'reconsented', v_reconsented,
    'remaining', CASE WHEN v_has_more THEN 1 ELSE 0 END,
    'remaining_is_exact', NOT v_has_more,
    'has_more', v_has_more,
    'complete', NOT v_has_more,
    'next_cursor', v_opaque_cursor,
    'contains_email', false,
    'synced_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_estimate_marketing_audience(
  p_filter jsonb DEFAULT '{}'::jsonb,
  p_channels text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total bigint;
  v_eligible bigint;
  v_channels jsonb;
  v_has_public boolean := COALESCE(p_channels, '{}'::text[]) && ARRAY[
    'tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website'
  ]::text[];
  v_has_individual boolean := EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_channels, '{}'::text[])) ch
    WHERE ch NOT IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
  );
BEGIN
  PERFORM public.marketing_require_admin();
  PERFORM public.marketing_validate_audience_filter(COALESCE(p_filter, '{}'::jsonb));
  SELECT count(*), count(*) FILTER (
    WHERE (v_has_public AND NOT v_has_individual) OR (
      c.opted_out_at IS NULL AND EXISTS (
        SELECT 1 FROM unnest(COALESCE(p_channels, '{}'::text[])) requested_channel
        WHERE public.marketing_contact_is_eligible(c.id, requested_channel)
      )
    )
  ) INTO v_total, v_eligible
  FROM public.marketing_contacts c
  WHERE public.marketing_contact_matches_filter(c.id, p_filter);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'channel', ch,
    'availability', public.marketing_channel_availability(ch),
    'delivery_mode', CASE WHEN ch IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
      THEN 'public' ELSE 'individual' END,
    'eligible', CASE WHEN ch IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
    THEN (
      SELECT count(*) FROM public.marketing_contacts c
      WHERE public.marketing_contact_matches_filter(c.id, p_filter)
    ) ELSE (
      SELECT count(*) FROM public.marketing_contacts c
      WHERE c.opted_out_at IS NULL
        AND public.marketing_contact_is_eligible(c.id, ch)
        AND public.marketing_contact_matches_filter(c.id, p_filter)
    ) END
  )), '[]'::jsonb) INTO v_channels
  FROM unnest(COALESCE(p_channels, '{}'::text[])) ch;

  RETURN jsonb_build_object(
    'total', v_total, 'eligible', v_eligible, 'eligible_count', v_eligible,
    'consent_coverage', CASE WHEN v_total = 0 THEN 0 ELSE round((v_eligible::numeric / v_total) * 100, 1) END,
    'channels', v_channels, 'estimated_at', now(),
    'warning', 'Estimate only; eligibility is rechecked atomically at dispatch time.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_marketing_item(
  p_item_id uuid,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.marketing_calendar_items%ROWTYPE;
  v_campaign public.marketing_campaigns%ROWTYPE;
  v_integration public.marketing_integrations%ROWTYPE;
  v_computed_audience_size bigint := 0;
  v_effective_scheduled_at timestamptz;
  v_local_time time;
BEGIN
  PERFORM public.marketing_require_admin();
  SELECT * INTO v_item FROM public.marketing_calendar_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Calendar item not found' USING ERRCODE = 'P0002'; END IF;
  IF v_item.status IN ('sent','published','completed','cancelled') THEN
    RAISE EXCEPTION 'Terminal calendar item cannot be approved' USING ERRCODE = '22023';
  END IF;
  IF v_item.content = '{}'::jsonb THEN
    RAISE EXCEPTION 'Content is required before approval' USING ERRCODE = '22023';
  END IF;
  v_effective_scheduled_at := COALESCE(p_scheduled_at, v_item.scheduled_at);
  IF v_effective_scheduled_at < now() + interval '2 minutes' THEN
    RAISE EXCEPTION 'Approved marketing must be scheduled at least two minutes in the future' USING ERRCODE = '22023';
  END IF;
  v_local_time := (v_effective_scheduled_at AT TIME ZONE 'Europe/Zurich')::time;
  IF v_item.channel NOT IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
     AND (v_local_time < time '08:00' OR v_local_time >= time '20:00') THEN
    RAISE EXCEPTION 'Individual marketing must be scheduled between 08:00 and 20:00 Europe/Zurich' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_integration FROM public.marketing_integrations
  WHERE id = v_item.integration_id FOR SHARE;
  IF NOT FOUND OR v_integration.status NOT IN ('connected','manual') THEN
    RAISE EXCEPTION 'Channel is not configured' USING ERRCODE = '55000';
  END IF;
  IF v_item.channel IN ('email','push','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
     AND v_integration.status <> 'connected' THEN
    RAISE EXCEPTION 'External channel is blocked by configuration' USING ERRCODE = '55000';
  END IF;

  IF v_item.campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign FROM public.marketing_campaigns WHERE id = v_item.campaign_id FOR SHARE;
    IF NOT FOUND OR v_campaign.status IN ('paused','completed','cancelled','failed') THEN
      RAISE EXCEPTION 'Campaign cannot be approved' USING ERRCODE = '22023';
    END IF;
    IF v_campaign.requires_approval AND v_campaign.approved_at IS NULL THEN
      RAISE EXCEPTION 'Campaign approval is required first' USING ERRCODE = '42501';
    END IF;
    IF v_item.targeting IS DISTINCT FROM v_campaign.audience_definition THEN
      RAISE EXCEPTION 'Calendar targeting differs from the approved campaign audience' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_item.channel IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website') THEN
    v_computed_audience_size := 0;
  ELSE
    SELECT count(*) INTO v_computed_audience_size
    FROM public.marketing_contacts c
    WHERE public.marketing_contact_matches_filter(c.id, v_item.targeting)
      AND public.marketing_contact_is_eligible(c.id, v_item.channel);
  END IF;
  IF v_computed_audience_size <= 0 AND v_item.channel NOT IN (
    'tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website'
  ) THEN
    RAISE EXCEPTION 'No eligible contact for this item and channel' USING ERRCODE = '22023';
  END IF;

  UPDATE public.marketing_calendar_items SET
    approval_status = 'approved', approved_by = public.marketing_actor_user_id(), approved_at = now(), status = 'scheduled',
    audience_size = v_computed_audience_size,
    scheduled_at = v_effective_scheduled_at,
    lease_token = NULL, lease_expires_at = NULL, next_attempt_at = NULL, last_error = NULL
  WHERE id = p_item_id RETURNING * INTO v_item;

  RETURN jsonb_build_object(
    'id', v_item.id, 'status', v_item.status, 'approval_status', v_item.approval_status,
    'scheduled_at', v_item.scheduled_at, 'updated_at', v_item.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_scheduler_ready()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_ready boolean := false;
  v_secrets_ready boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = ''tok-marketing-orchestrator'' AND active)'
    INTO v_job_ready;
  EXECUTE 'SELECT
    EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = ''internal_cron_secret'' AND NULLIF(btrim(decrypted_secret), '''') IS NOT NULL)
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = ''marketing_edge_url''
      AND btrim(decrypted_secret) ~ ''^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/marketing-orchestrator$'')'
    INTO v_secrets_ready;
  RETURN COALESCE(v_job_ready, false) AND COALESCE(v_secrets_ready, false);
EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_function THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_marketing_global_pause(p_paused boolean, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_row public.marketing_automations%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_admin();
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to change the global runtime' USING ERRCODE = '22023';
  END IF;
  IF p_paused IS FALSE AND public.marketing_scheduler_ready() IS NOT TRUE THEN
    RAISE EXCEPTION 'Marketing scheduler is not ready' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_row FROM public.marketing_automations
  WHERE automation_key = 'global_runtime' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Global runtime row is missing' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.marketing_automations SET
    status = CASE WHEN p_paused THEN 'paused' ELSE 'active' END,
    conditions = jsonb_set(
      jsonb_set(conditions, '{global_pause}', to_jsonb(p_paused), true),
      '{reason}', to_jsonb(left(btrim(p_reason), 500)), true
    ),
    last_error = NULL
  WHERE id = v_row.id RETURNING * INTO v_row;

  IF p_paused THEN
    UPDATE public.marketing_automations SET status = 'paused'
    WHERE is_system = false AND status = 'active';
  END IF;

  RETURN jsonb_build_object(
    'global_paused', p_paused, 'reason', v_row.conditions ->> 'reason', 'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_automation(
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload ->> 'id', '')::uuid;
  v_existing public.marketing_automations%ROWTYPE;
  v_row public.marketing_automations%ROWTYPE;
  v_status text := COALESCE(NULLIF(p_payload ->> 'status', ''), 'paused');
  v_global_paused boolean;
  v_channel_status text;
BEGIN
  PERFORM public.marketing_require_admin();
  IF NULLIF(btrim(p_payload ->> 'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Automation name is required' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('draft','paused','active','disabled') THEN
    RAISE EXCEPTION 'Invalid automation status' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'active' THEN
    RAISE EXCEPTION 'Automation rules engine is not enabled; use approved calendar scheduling' USING ERRCODE = '55000';
  END IF;
  SELECT COALESCE((conditions ->> 'global_pause')::boolean, true) INTO v_global_paused
  FROM public.marketing_automations WHERE automation_key = 'global_runtime';
  IF v_status = 'active' AND COALESCE(v_global_paused, true) THEN
    RAISE EXCEPTION 'Global marketing runtime is paused' USING ERRCODE = '55000';
  END IF;
  IF v_status = 'active' AND NULLIF(p_payload ->> 'channel', '') IS NOT NULL THEN
    v_channel_status := public.marketing_channel_availability(p_payload ->> 'channel');
    IF v_channel_status NOT IN ('available','manual') THEN
      RAISE EXCEPTION 'Automation channel is not available' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF v_id IS NULL THEN
    -- New automations always start paused, even when a client submits active.
    INSERT INTO public.marketing_automations (
      automation_key, name, description, trigger_type, channel, status,
      conditions, actions, next_run_at, created_by
    ) VALUES (
      COALESCE(NULLIF(p_payload ->> 'automation_key', ''), 'automation_' || replace(gen_random_uuid()::text, '-', '')),
      btrim(p_payload ->> 'name'), COALESCE(p_payload ->> 'description', ''),
      COALESCE(NULLIF(p_payload ->> 'trigger_type', ''), 'manual'),
      NULLIF(p_payload ->> 'channel', ''), 'paused',
      COALESCE(p_payload -> 'conditions', '{}'::jsonb), COALESCE(p_payload -> 'actions', '[]'::jsonb),
      NULLIF(p_payload ->> 'next_run_at', '')::timestamptz, public.marketing_actor_user_id()
    ) RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_existing FROM public.marketing_automations WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Automation not found' USING ERRCODE = 'P0002'; END IF;
    IF v_existing.is_system THEN RAISE EXCEPTION 'System automation is managed by its dedicated RPC' USING ERRCODE = '42501'; END IF;
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'Automation was modified by another administrator' USING ERRCODE = '40001';
    END IF;
    UPDATE public.marketing_automations SET
      name = btrim(p_payload ->> 'name'),
      description = COALESCE(p_payload ->> 'description', description),
      trigger_type = COALESCE(NULLIF(p_payload ->> 'trigger_type', ''), trigger_type),
      channel = CASE WHEN p_payload ? 'channel' THEN NULLIF(p_payload ->> 'channel', '') ELSE channel END,
      status = v_status,
      conditions = COALESCE(p_payload -> 'conditions', conditions),
      actions = COALESCE(p_payload -> 'actions', actions),
      next_run_at = CASE WHEN p_payload ? 'next_run_at' THEN NULLIF(p_payload ->> 'next_run_at', '')::timestamptz ELSE next_run_at END,
      last_error = CASE WHEN v_status IN ('draft','paused','active') THEN NULL ELSE last_error END
    WHERE id = v_id RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'name', v_row.name, 'description', v_row.description,
    'trigger', v_row.trigger_type, 'action', COALESCE(v_row.actions -> 0 ->> 'type', 'À configurer'),
    'channel', v_row.channel, 'status', v_row.status, 'runs', v_row.run_count,
    'errors', v_row.error_count, 'last_run_at', v_row.last_run_at,
    'next_run_at', v_row.next_run_at, 'updated_at', v_row.updated_at,
    'is_system', v_row.is_system, 'engine_connected', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_marketing_automations(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_items jsonb;
  v_has_more boolean;
BEGIN
  PERFORM public.marketing_require_admin();
  WITH page AS (
    SELECT * FROM public.marketing_automations a
    WHERE a.is_system = false AND (p_status IS NULL OR a.status = p_status)
      AND (p_cursor_updated_at IS NULL OR p_cursor_id IS NULL OR (a.updated_at, a.id) < (p_cursor_updated_at, p_cursor_id))
    ORDER BY a.updated_at DESC, a.id DESC LIMIT v_limit + 1
  ), visible AS (
    SELECT * FROM page ORDER BY updated_at DESC, id DESC LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'description', description, 'trigger', trigger_type,
    'action', COALESCE(actions -> 0 ->> 'type', 'À configurer'), 'channel', channel,
    'status', status, 'runs', run_count, 'errors', error_count,
    'last_run_at', last_run_at, 'next_run_at', next_run_at, 'updated_at', updated_at,
    'is_system', is_system, 'engine_connected', false
  ) ORDER BY updated_at DESC, id DESC), '[]'::jsonb),
  (SELECT count(*) > v_limit FROM page)
  INTO v_items, v_has_more FROM visible;
  RETURN jsonb_build_object(
    'items', v_items,
    'next_cursor', CASE WHEN v_has_more AND jsonb_array_length(v_items) > 0 THEN jsonb_build_object(
      'updated_at', v_items -> (jsonb_array_length(v_items) - 1) ->> 'updated_at',
      'id', v_items -> (jsonb_array_length(v_items) - 1) ->> 'id'
    ) ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_marketing_integrations(
  p_channel text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_items jsonb;
  v_has_more boolean;
BEGIN
  PERFORM public.marketing_require_admin();
  WITH page AS (
    SELECT * FROM public.marketing_integrations i
    WHERE (p_channel IS NULL OR i.channel = p_channel)
      AND (p_cursor_id IS NULL OR i.id > p_cursor_id)
    ORDER BY i.id ASC LIMIT v_limit + 1
  ), visible AS (
    SELECT * FROM page ORDER BY id ASC LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'channel', channel,
    'status', public.marketing_channel_availability(channel), 'backend_status', status,
    'description', description, 'configured_at', configured_at,
    'last_checked_at', COALESCE(last_checked_at, updated_at),
    'action_label', CASE WHEN status IN ('connected','manual') THEN 'Configurer' ELSE 'Connecter' END
  ) ORDER BY id ASC), '[]'::jsonb),
  (SELECT count(*) > v_limit FROM page)
  INTO v_items, v_has_more FROM visible;
  RETURN jsonb_build_object(
    'items', v_items,
    'next_cursor', CASE WHEN v_has_more AND jsonb_array_length(v_items) > 0 THEN jsonb_build_object(
      'id', v_items -> (jsonb_array_length(v_items) - 1) ->> 'id'
    ) ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_marketing_integration(
  p_integration_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.marketing_integrations%ROWTYPE;
  v_row public.marketing_integrations%ROWTYPE;
  v_status text;
  v_public jsonb := COALESCE(p_payload -> 'public_configuration', '{}'::jsonb);
BEGIN
  PERFORM public.marketing_require_admin();
  SELECT * INTO v_existing FROM public.marketing_integrations WHERE id = p_integration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Integration not found' USING ERRCODE = 'P0002'; END IF;
  IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Integration was modified by another administrator' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_public) k
    WHERE lower(k) ~ '(secret|token|password|api.?key|private.?key|credential)'
  ) THEN
    RAISE EXCEPTION 'Secrets must be stored as Edge Function secrets, never in public configuration' USING ERRCODE = '22023';
  END IF;
  v_status := COALESCE(NULLIF(p_payload ->> 'status', ''), v_existing.status);
  IF v_status NOT IN ('disconnected','connected','blocked_configuration','manual','error','disabled') THEN
    RAISE EXCEPTION 'Invalid integration status' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'connected' AND v_existing.channel NOT IN ('tok_news','in_app')
     AND NULLIF(p_payload ->> 'secret_ref', '') IS NULL AND v_existing.secret_ref IS NULL THEN
    RAISE EXCEPTION 'A secret reference is required before marking an external integration connected' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'connected' AND v_existing.channel NOT IN ('tok_news','in_app')
     AND COALESCE((v_existing.capabilities ->> 'adapter_deployed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'The provider adapter is not deployed; connected status is forbidden' USING ERRCODE = '55000';
  END IF;
  UPDATE public.marketing_integrations SET
    status = v_status,
    public_configuration = CASE WHEN p_payload ? 'public_configuration' THEN v_public ELSE public_configuration END,
    secret_ref = CASE WHEN p_payload ? 'secret_ref' THEN NULLIF(p_payload ->> 'secret_ref', '') ELSE secret_ref END,
    configured_at = CASE WHEN v_status = 'connected' THEN COALESCE(configured_at, now()) ELSE configured_at END,
    last_checked_at = now(), last_error = NULL
  WHERE id = p_integration_id RETURNING * INTO v_row;
  RETURN jsonb_build_object(
    'id', v_row.id, 'name', v_row.name, 'channel', v_row.channel,
    'status', public.marketing_channel_availability(v_row.channel), 'backend_status', v_row.status,
    'configured_at', v_row.configured_at, 'last_checked_at', v_row.last_checked_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_marketing_deliveries(
  p_query text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_query text := NULLIF(lower(btrim(p_query)), '');
  v_status text := NULLIF(btrim(p_status), '');
  v_channel text := NULLIF(btrim(p_channel), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_offset integer := COALESCE(p_offset, 0);
  v_items jsonb;
  v_total bigint;
BEGIN
  PERFORM public.marketing_require_admin();
  IF v_query IS NOT NULL AND (
    char_length(v_query) > 80 OR position('%' IN v_query) > 0
    OR position('_' IN v_query) > 0 OR position(chr(92) IN v_query) > 0
  ) THEN
    RAISE EXCEPTION 'Delivery search query is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN (
    'queued','leased','processing','retrying','sent','delivered','opened','clicked',
    'converted','bounced','complained','unsubscribed','skipped',
    'blocked_configuration','manual_required','failed','cancelled'
  ) THEN
    RAISE EXCEPTION 'Delivery status filter is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_channel IS NOT NULL AND v_channel NOT IN (
    'tok_news','in_app','email','push','instagram','facebook','linkedin',
    'tiktok','youtube','telegram','google_business','website',
    'manual_call','manual_email','manual_visit'
  ) THEN
    RAISE EXCEPTION 'Delivery channel filter is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_offset < 0 OR v_offset > 100000 THEN
    RAISE EXCEPTION 'Delivery offset is invalid' USING ERRCODE = '22023';
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT d.*, i.title AS item_title, COALESCE(c.name, 'Campagne') AS campaign_name
    FROM public.marketing_deliveries d
    JOIN public.marketing_calendar_items i ON i.id = d.item_id
    LEFT JOIN public.marketing_campaigns c ON c.id = i.campaign_id
    WHERE (v_status IS NULL OR d.status = v_status)
      AND (v_channel IS NULL OR d.channel = v_channel)
      AND (v_query IS NULL OR
        lower(COALESCE(c.name, 'Campagne')) LIKE v_query || '%'
        OR lower(i.title) LIKE v_query || '%'
        OR lower(d.provider) LIKE v_query || '%'
        OR lower(COALESCE(d.error_code, '')) LIKE v_query || '%'
        OR lower(d.status) LIKE v_query || '%'
        OR lower(d.channel) LIKE v_query || '%'
      )
  ), page AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC, id DESC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', page.id, 'item_id', page.item_id, 'item_title', page.item_title,
      'campaign_name', page.campaign_name,
      'target_masked', page.target_masked, 'channel', page.channel,
      'status', page.status, 'provider', page.provider, 'attempt', page.attempt_count,
      'scheduled_at', page.scheduled_at, 'sent_at', page.sent_at,
      'delivered_at', page.delivered_at, 'opened_at', page.opened_at,
      'clicked_at', page.clicked_at, 'converted_at', page.converted_at,
      'manual_outcome', page.metadata ->> 'manual_outcome',
      'manual_note', left(page.metadata ->> 'manual_note', 2000),
      'created_at', page.created_at, 'updated_at', page.updated_at,
      'error_code', page.error_code
    ) ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb),
    (SELECT count(*) FROM filtered)
  INTO v_items, v_total
  FROM page;

  RETURN jsonb_build_object(
    'items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset,
    'has_more', v_offset::bigint + jsonb_array_length(v_items) < v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reveal_manual_delivery_target(
  p_delivery_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery public.marketing_deliveries%ROWTYPE;
  v_item public.marketing_calendar_items%ROWTYPE;
  v_campaign public.marketing_campaigns%ROWTYPE;
  v_contact public.marketing_contacts%ROWTYPE;
  v_target text;
  v_revealed_at timestamptz := clock_timestamp();
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_delivery_id IS NULL OR NULLIF(btrim(p_reason), '') IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'A reveal reason between 8 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF public.marketing_runtime_enabled() IS NOT TRUE THEN
    RAISE EXCEPTION 'Marketing runtime or feature kill-switch is disabled' USING ERRCODE = '55000';
  END IF;
  IF (v_revealed_at AT TIME ZONE 'Europe/Zurich')::time < time '08:00'
     OR (v_revealed_at AT TIME ZONE 'Europe/Zurich')::time >= time '20:00' THEN
    RAISE EXCEPTION 'Manual marketing access is outside quiet hours' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_delivery
  FROM public.marketing_deliveries d
  WHERE d.id = p_delivery_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found' USING ERRCODE = 'P0002'; END IF;
  IF v_delivery.status <> 'manual_required' THEN
    RAISE EXCEPTION 'Only manual_required deliveries can reveal a target' USING ERRCODE = '22023';
  END IF;
  IF v_delivery.channel NOT IN ('manual_call','manual_email') THEN
    RAISE EXCEPTION 'Only manual call or email targets can be revealed' USING ERRCODE = '22023';
  END IF;
  IF v_delivery.contact_id IS NULL THEN
    RAISE EXCEPTION 'Manual delivery has no governed contact' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_item
  FROM public.marketing_calendar_items i
  WHERE i.id = v_delivery.item_id
  FOR SHARE;
  IF NOT FOUND OR v_item.approval_status <> 'approved' OR v_item.approved_at IS NULL
     OR v_item.approved_at IS DISTINCT FROM v_delivery.item_approved_at
     OR v_item.status IN ('draft','cancelled','failed','blocked_configuration') THEN
    RAISE EXCEPTION 'Parent item is not approved for this delivery revision' USING ERRCODE = '42501';
  END IF;
  IF v_item.campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign
    FROM public.marketing_campaigns c
    WHERE c.id = v_item.campaign_id
    FOR SHARE;
    IF NOT FOUND OR v_campaign.approved_at IS NULL
       OR v_campaign.status IN ('paused','completed','cancelled','failed') THEN
      RAISE EXCEPTION 'Parent campaign is not approved' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_contact
  FROM public.marketing_contacts c
  WHERE c.id = v_delivery.contact_id
  FOR SHARE;
  IF NOT FOUND OR public.marketing_contact_is_eligible(v_delivery.contact_id, v_delivery.channel) IS NOT TRUE THEN
    RAISE EXCEPTION 'Contact opted out or is no longer eligible' USING ERRCODE = '42501';
  END IF;
  v_target := CASE
    WHEN v_delivery.channel = 'manual_call' THEN v_contact.phone_normalized
    WHEN v_delivery.channel = 'manual_email' THEN v_contact.email_normalized
  END;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Manual target is unavailable' USING ERRCODE = '42501';
  END IF;

  -- Never persist or audit the raw target. Every reveal is still attributable
  -- to the active MFA-backed administrator session and its stated purpose.
  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(), public.marketing_actor_user_id(), 'marketing_manual_target_revealed',
    'marketing_deliveries', v_delivery.id, NULL,
    jsonb_build_object(
      'channel', v_delivery.channel,
      'reason', left(btrim(p_reason), 500),
      'revealed_at', v_revealed_at
    ),
    v_revealed_at
  );

  RETURN jsonb_build_object(
    'delivery_id', v_delivery.id,
    'channel', v_delivery.channel,
    'target', v_target,
    'revealed_at', v_revealed_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_retry_marketing_delivery(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery public.marketing_deliveries%ROWTYPE;
  v_integration_status text;
BEGIN
  PERFORM public.marketing_require_admin();
  SELECT * INTO v_delivery FROM public.marketing_deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found' USING ERRCODE = 'P0002'; END IF;
  IF v_delivery.status NOT IN ('failed','blocked_configuration') THEN
    RAISE EXCEPTION 'Delivery is not retryable' USING ERRCODE = '22023';
  END IF;
  IF v_delivery.attempt_count >= v_delivery.max_attempts THEN
    RAISE EXCEPTION 'Maximum delivery attempts reached' USING ERRCODE = '22023';
  END IF;
  IF v_delivery.contact_id IS NOT NULL
     AND NOT public.marketing_contact_is_eligible(v_delivery.contact_id, v_delivery.channel) THEN
    RAISE EXCEPTION 'Contact is no longer eligible' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.marketing_calendar_items item
    LEFT JOIN public.marketing_campaigns campaign ON campaign.id = item.campaign_id
    WHERE item.id = v_delivery.item_id
      AND item.approval_status = 'approved' AND item.approved_at = v_delivery.item_approved_at
      AND item.status NOT IN ('cancelled','failed','draft','blocked_configuration')
      AND (item.campaign_id IS NULL OR (
        campaign.approved_at IS NOT NULL AND campaign.status NOT IN ('completed','cancelled','failed')
      ))
  ) THEN
    RAISE EXCEPTION 'Parent item or campaign is not approved' USING ERRCODE = '42501';
  END IF;
  SELECT i.status INTO v_integration_status FROM public.marketing_integrations i
  WHERE i.channel = v_delivery.channel ORDER BY (i.status IN ('connected','manual')) DESC LIMIT 1;
  IF COALESCE(v_integration_status, 'disconnected') NOT IN ('connected','manual') THEN
    RAISE EXCEPTION 'Channel is still blocked by configuration' USING ERRCODE = '55000';
  END IF;
  UPDATE public.marketing_deliveries SET
    status = CASE WHEN v_integration_status = 'manual' THEN 'manual_required' ELSE 'queued' END,
    next_attempt_at = now(), lease_token = NULL, lease_expires_at = NULL,
    last_error = NULL, error_code = NULL
  WHERE id = p_delivery_id RETURNING * INTO v_delivery;
  RETURN jsonb_build_object(
    'id', v_delivery.id, 'status', v_delivery.status, 'attempt', v_delivery.attempt_count,
    'updated_at', v_delivery.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_complete_manual_marketing_delivery(
  p_delivery_id uuid,
  p_outcome text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery public.marketing_deliveries%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_outcome NOT IN ('completed','failed') THEN
    RAISE EXCEPTION 'Manual outcome must be completed or failed' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'A manual completion note is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_delivery FROM public.marketing_deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found' USING ERRCODE = 'P0002'; END IF;
  IF v_delivery.channel NOT IN ('manual_call','manual_email') THEN
    RAISE EXCEPTION 'Delivery is not a manual task' USING ERRCODE = '22023';
  END IF;
  IF v_delivery.status IN ('sent','failed')
     AND v_delivery.metadata ->> 'manual_outcome' = p_outcome THEN
    RETURN jsonb_build_object('id', v_delivery.id, 'status', v_delivery.status, 'duplicate', true);
  END IF;
  IF v_delivery.status <> 'manual_required' THEN
    RAISE EXCEPTION 'Only manual_required deliveries can be completed' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'completed' AND v_delivery.contact_id IS NOT NULL
     AND NOT public.marketing_contact_is_eligible(v_delivery.contact_id, v_delivery.channel) THEN
    RAISE EXCEPTION 'Contact opted out or is no longer eligible' USING ERRCODE = '42501';
  END IF;

  UPDATE public.marketing_deliveries SET
    status = CASE WHEN p_outcome = 'completed' THEN 'sent' ELSE 'failed' END,
    sent_at = CASE WHEN p_outcome = 'completed' THEN COALESCE(sent_at, now()) ELSE sent_at END,
    error_code = CASE WHEN p_outcome = 'failed' THEN 'manual_failed' ELSE NULL END,
    last_error = CASE WHEN p_outcome = 'failed' THEN left(btrim(p_note), 1000) ELSE NULL END,
    metadata = metadata || jsonb_build_object(
      'manual_outcome', p_outcome, 'manual_note', left(btrim(p_note), 2000),
      'completed_by', public.marketing_actor_user_id(), 'completed_at', now()
    )
  WHERE id = p_delivery_id RETURNING * INTO v_delivery;

  IF p_outcome = 'completed' AND v_delivery.contact_id IS NOT NULL THEN
    UPDATE public.marketing_contacts SET
      last_contact_at = now(),
      lifecycle_status = CASE WHEN lifecycle_status IN ('new','qualified','follow_up') THEN 'contacted' ELSE lifecycle_status END
    WHERE id = v_delivery.contact_id;
  END IF;
  IF p_outcome = 'completed' THEN
    INSERT INTO public.marketing_events (campaign_id, item_id, delivery_id, event_type, provider, occurred_at, metadata)
    SELECT i.campaign_id, i.id, v_delivery.id, 'delivery_sent', v_delivery.provider, now(), '{"manual":true}'::jsonb
    FROM public.marketing_calendar_items i WHERE i.id = v_delivery.item_id;
  END IF;
  PERFORM public.marketing_finalize_item_if_terminal(v_delivery.item_id);
  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(), public.marketing_actor_user_id(), 'marketing_manual_delivery_completed', 'marketing_deliveries',
    v_delivery.id, NULL, jsonb_build_object('outcome', p_outcome), now()
  );
  RETURN jsonb_build_object(
    'id', v_delivery.id, 'item_id', v_delivery.item_id, 'status', v_delivery.status,
    'outcome', p_outcome, 'duplicate', false, 'updated_at', v_delivery.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_complete_manual_marketing_item(
  p_item_id uuid,
  p_outcome text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.marketing_calendar_items%ROWTYPE;
  v_campaign public.marketing_campaigns%ROWTYPE;
  v_integration public.marketing_integrations%ROWTYPE;
  v_status text;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_outcome NOT IN ('published','failed') THEN
    RAISE EXCEPTION 'Manual item outcome must be published or failed' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'A manual publication note is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_item FROM public.marketing_calendar_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Calendar item not found' USING ERRCODE = 'P0002'; END IF;
  v_status := CASE WHEN p_outcome = 'published' THEN 'published' ELSE 'failed' END;
  IF v_item.status = v_status AND v_item.result_summary ->> 'manual_outcome' = p_outcome THEN
    RETURN jsonb_build_object(
      'id', v_item.id, 'status', v_item.status, 'outcome', p_outcome, 'duplicate', true,
      'published_at', v_item.published_at, 'updated_at', v_item.updated_at
    );
  END IF;
  IF v_item.channel NOT IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
     OR v_item.status NOT IN ('scheduled','queued','running')
     OR v_item.approval_status <> 'approved' OR v_item.approved_at IS NULL THEN
    RAISE EXCEPTION 'Only an approved scheduled public item can be completed manually' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_integration FROM public.marketing_integrations
  WHERE id = v_item.integration_id FOR SHARE;
  IF NOT FOUND OR v_integration.status <> 'manual' THEN
    RAISE EXCEPTION 'Calendar item is not assigned to a manual integration' USING ERRCODE = '22023';
  END IF;
  IF v_item.campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign FROM public.marketing_campaigns
    WHERE id = v_item.campaign_id FOR SHARE;
    IF NOT FOUND OR v_campaign.approved_at IS NULL
       OR v_campaign.status IN ('paused','completed','cancelled','failed') THEN
      RAISE EXCEPTION 'Parent campaign is no longer approved' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.marketing_calendar_items SET
    status = v_status,
    published_at = CASE WHEN p_outcome = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
    last_error = CASE WHEN p_outcome = 'failed' THEN left(btrim(p_note), 1000) ELSE NULL END,
    result_summary = result_summary || jsonb_build_object(
      'manual_outcome', p_outcome, 'manual_note', left(btrim(p_note), 2000),
      'completed_by', public.marketing_actor_user_id(), 'completed_at', now()
    )
  WHERE id = p_item_id RETURNING * INTO v_item;

  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(), public.marketing_actor_user_id(), 'marketing_manual_item_completed', 'marketing_calendar_items',
    v_item.id, NULL, jsonb_build_object('outcome', p_outcome), now()
  );
  RETURN jsonb_build_object(
    'id', v_item.id, 'status', v_item.status, 'outcome', p_outcome, 'duplicate', false,
    'published_at', v_item.published_at, 'updated_at', v_item.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_marketing_overview(
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT (now() + interval '60 days')
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_global_paused boolean;
  v_global_reason text;
  v_scheduled bigint;
  v_eligible bigint;
  v_sent bigint;
  v_delivered bigint;
  v_clicked bigint;
  v_conversions bigint;
  v_channels jsonb;
  v_integrations jsonb;
  v_automations jsonb;
  v_series jsonb;
  v_scheduler_ready boolean;
BEGIN
  PERFORM public.marketing_require_admin();
  v_scheduler_ready := public.marketing_scheduler_ready();
  SELECT COALESCE((conditions ->> 'global_pause')::boolean, true), conditions ->> 'reason'
  INTO v_global_paused, v_global_reason
  FROM public.marketing_automations WHERE automation_key = 'global_runtime';

  SELECT count(*) INTO v_scheduled FROM public.marketing_calendar_items
  WHERE status IN ('scheduled','queued','retrying') AND scheduled_at BETWEEN p_from AND p_to;
  SELECT count(*) INTO v_eligible FROM public.marketing_contacts c
  WHERE c.opted_out_at IS NULL AND (
    public.marketing_contact_is_eligible(c.id, 'email')
    OR public.marketing_contact_is_eligible(c.id, 'in_app')
    OR public.marketing_contact_is_eligible(c.id, 'manual_call')
  );
  SELECT
    count(*) FILTER (WHERE d.sent_at BETWEEN p_from AND p_to),
    count(*) FILTER (WHERE d.delivered_at BETWEEN p_from AND p_to),
    count(*) FILTER (WHERE d.clicked_at BETWEEN p_from AND p_to),
    count(*) FILTER (WHERE d.converted_at BETWEEN p_from AND p_to)
  INTO v_sent, v_delivered, v_clicked, v_conversions
  FROM public.marketing_deliveries d;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', x.channel, 'label', x.name, 'availability', public.marketing_channel_availability(x.channel),
    'reason', CASE
      WHEN x.status = 'connected' THEN 'Canal disponible'
      WHEN x.status = 'manual' THEN 'Action manuelle requise'
      WHEN x.status = 'blocked_configuration' THEN x.description
      ELSE 'API non connectée'
    END,
    'cost_model', CASE WHEN x.status = 'manual' THEN 'manual'
      WHEN x.channel IN ('tok_news','in_app') THEN 'free' ELSE 'provider_free_tier' END,
    'last_checked_at', COALESCE(x.last_checked_at, x.updated_at)
  ) ORDER BY x.channel), '[]'::jsonb) INTO v_channels
  FROM (
    SELECT DISTINCT ON (channel) channel, name, status, description, last_checked_at, updated_at
    FROM public.marketing_integrations
    ORDER BY channel, (status IN ('connected','manual')) DESC, updated_at DESC
  ) x;

  v_integrations := (public.admin_list_marketing_integrations(NULL, 100, NULL) -> 'items');
  v_automations := (public.admin_list_marketing_automations(NULL, 100, NULL, NULL) -> 'items');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day::date,
    'sent', sent, 'delivered', delivered, 'clicks', clicks, 'conversions', conversions
  ) ORDER BY day), '[]'::jsonb) INTO v_series
  FROM (
    SELECT date_trunc('day', e.occurred_at) AS day,
      count(*) FILTER (WHERE e.event_type = 'delivery_sent') AS sent,
      count(*) FILTER (WHERE e.event_type = 'delivery_delivered') AS delivered,
      count(*) FILTER (WHERE e.event_type = 'delivery_clicked') AS clicks,
      count(*) FILTER (WHERE e.event_type = 'delivery_converted') AS conversions
    FROM public.marketing_events e
    WHERE e.occurred_at BETWEEN p_from AND p_to
    GROUP BY date_trunc('day', e.occurred_at)
  ) daily;

  RETURN jsonb_build_object(
    'global_paused', COALESCE(v_global_paused, true), 'global_pause_reason', v_global_reason,
    'scheduler_ready', COALESCE(v_scheduler_ready, false),
    'free_only', true, 'approval_required', true, 'scheduled_count', COALESCE(v_scheduled, 0),
    'eligible_contacts', COALESCE(v_eligible, 0), 'sent', COALESCE(v_sent, 0),
    'delivered', COALESCE(v_delivered, 0), 'clicked', COALESCE(v_clicked, 0),
    'conversions', COALESCE(v_conversions, 0),
    'delivery_rate', CASE WHEN COALESCE(v_sent, 0) = 0 THEN 0 ELSE round(v_delivered::numeric / v_sent, 4) END,
    'click_rate', CASE WHEN COALESCE(v_delivered, 0) = 0 THEN 0 ELSE round(v_clicked::numeric / v_delivered, 4) END,
    'conversion_rate', CASE WHEN COALESCE(v_clicked, 0) = 0 THEN 0 ELSE round(v_conversions::numeric / v_clicked, 4) END,
    'updated_at', now(),
    'totals', jsonb_build_object('sent', COALESCE(v_sent, 0), 'delivered', COALESCE(v_delivered, 0),
      'clicked', COALESCE(v_clicked, 0), 'conversions', COALESCE(v_conversions, 0)),
    'channels', v_channels, 'series', v_series,
    'integrations', v_integrations, 'automations', v_automations
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_marketing_items(
  p_limit integer DEFAULT 25,
  p_worker_id text DEFAULT 'marketing-orchestrator',
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  id uuid,
  campaign_id uuid,
  channel text,
  item_type text,
  content jsonb,
  targeting jsonb,
  attempt_count integer,
  max_attempts integer,
  lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.marketing_require_service_role();
  IF public.marketing_runtime_enabled() IS NOT TRUE THEN RETURN; END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT i.id
    FROM public.marketing_calendar_items i
    JOIN public.marketing_integrations g ON g.id = i.integration_id
    LEFT JOIN public.marketing_campaigns campaign ON campaign.id = i.campaign_id
    WHERE i.approval_status = 'approved'
      AND (
        (i.status IN ('scheduled','queued','retrying') AND COALESCE(i.next_attempt_at, i.scheduled_at) <= now())
        OR (i.status IN ('leased','processing','running') AND i.lease_expires_at < now())
      )
      AND i.attempt_count < i.max_attempts
      AND (
        i.channel IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
        OR ((now() AT TIME ZONE 'Europe/Zurich')::time >= time '08:00'
          AND (now() AT TIME ZONE 'Europe/Zurich')::time < time '19:55')
      )
      AND (i.campaign_id IS NULL OR (
        campaign.approved_at IS NOT NULL
        AND campaign.status NOT IN ('paused','completed','cancelled','failed')
      ))
      AND (
        g.status = 'connected'
        OR (g.status = 'manual' AND i.channel IN ('manual_call','manual_email'))
      )
    ORDER BY COALESCE(i.next_attempt_at, i.scheduled_at), i.id
    FOR UPDATE OF i SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  ), claimed AS (
    UPDATE public.marketing_calendar_items i SET
      status = 'leased', attempt_count = i.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 30), 900)),
      result_summary = jsonb_set(i.result_summary, '{worker_id}', to_jsonb(left(COALESCE(p_worker_id, 'worker'), 120)), true)
    FROM candidates c WHERE i.id = c.id
    RETURNING i.*
  )
  SELECT c.id, c.campaign_id, c.channel, c.item_type, c.content, c.targeting,
    c.attempt_count, c.max_attempts, c.lease_token
  FROM claimed c;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_marketing_item(
  p_item_id uuid,
  p_worker_id text DEFAULT 'marketing-orchestrator',
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  id uuid,
  campaign_id uuid,
  channel text,
  item_type text,
  content jsonb,
  targeting jsonb,
  attempt_count integer,
  max_attempts integer,
  lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.marketing_require_service_role();
  IF public.marketing_runtime_enabled() IS NOT TRUE THEN
    RAISE EXCEPTION 'Marketing runtime or feature kill-switch is disabled' USING ERRCODE = '55000';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT i.id
    FROM public.marketing_calendar_items i
    JOIN public.marketing_integrations g ON g.id = i.integration_id
    LEFT JOIN public.marketing_campaigns campaign ON campaign.id = i.campaign_id
    WHERE i.id = p_item_id AND i.approval_status = 'approved'
      AND i.status IN ('scheduled','queued','retrying','failed','blocked_configuration')
      AND COALESCE(i.next_attempt_at, i.scheduled_at) <= now()
      AND i.attempt_count < i.max_attempts
      AND (
        i.channel IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
        OR ((now() AT TIME ZONE 'Europe/Zurich')::time >= time '08:00'
          AND (now() AT TIME ZONE 'Europe/Zurich')::time < time '19:55')
      )
      AND (i.campaign_id IS NULL OR (
        campaign.approved_at IS NOT NULL
        AND campaign.status NOT IN ('paused','completed','cancelled','failed')
      ))
      AND (
        g.status = 'connected'
        OR (g.status = 'manual' AND i.channel IN ('manual_call','manual_email'))
      )
    FOR UPDATE OF i SKIP LOCKED
  ), claimed AS (
    UPDATE public.marketing_calendar_items i SET
      status = 'leased', attempt_count = i.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 30), 900)),
      result_summary = jsonb_set(i.result_summary, '{worker_id}', to_jsonb(left(COALESCE(p_worker_id, 'worker'), 120)), true)
    FROM candidate c WHERE i.id = c.id RETURNING i.*
  )
  SELECT c.id, c.campaign_id, c.channel, c.item_type, c.content, c.targeting,
    c.attempt_count, c.max_attempts, c.lease_token
  FROM claimed c;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_marketing_item(
  p_item_id uuid,
  p_lease_token uuid,
  p_status text,
  p_result jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.marketing_calendar_items%ROWTYPE;
  v_campaign public.marketing_campaigns%ROWTYPE;
  v_status text := p_status;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF v_status NOT IN ('running','sent','published','completed','partial','blocked_configuration','retrying','failed') THEN
    RAISE EXCEPTION 'Invalid item completion status' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.marketing_calendar_items
  WHERE id = p_item_id AND lease_token = p_lease_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease mismatch or item not found' USING ERRCODE = '40001'; END IF;
  IF v_status = 'retrying' AND v_row.attempt_count >= v_row.max_attempts
     AND COALESCE((p_result ->> 'awaiting_materialization')::boolean, false) IS NOT TRUE THEN
    v_status := 'failed';
  END IF;
  IF v_status IN ('running','sent','published','completed','partial') THEN
    IF public.marketing_runtime_enabled() IS NOT TRUE THEN
      v_status := 'retrying';
      p_error := 'Marketing runtime or feature kill-switch is disabled';
    ELSIF v_row.approval_status <> 'approved' OR v_row.approved_at IS NULL THEN
      v_status := 'failed';
      p_error := 'Calendar item approval was invalidated';
    ELSIF v_row.campaign_id IS NOT NULL THEN
      SELECT * INTO v_campaign FROM public.marketing_campaigns
      WHERE id = v_row.campaign_id FOR SHARE;
      IF NOT FOUND OR v_campaign.approved_at IS NULL
         OR v_campaign.status IN ('paused','completed','cancelled','failed') THEN
        v_status := 'failed';
        p_error := 'Parent campaign was invalidated';
      END IF;
    END IF;
  END IF;

  UPDATE public.marketing_calendar_items SET
    status = v_status,
    attempt_count = CASE
      WHEN v_status = 'retrying'
        AND COALESCE((p_result ->> 'awaiting_materialization')::boolean, false)
      THEN GREATEST(attempt_count - 1, 0)
      ELSE attempt_count END,
    result_summary = COALESCE(p_result, '{}'::jsonb),
    last_error = CASE WHEN p_error IS NULL THEN NULL ELSE left(p_error, 1000) END,
    next_attempt_at = CASE WHEN v_status = 'retrying'
      THEN now() + (LEAST(power(2, v_row.attempt_count), 60)::text || ' minutes')::interval END,
    lease_token = NULL, lease_expires_at = NULL,
    sent_at = CASE WHEN v_status IN ('sent','completed','partial') THEN COALESCE(sent_at, now()) ELSE sent_at END,
    published_at = CASE WHEN v_status = 'published' THEN COALESCE(published_at, now()) ELSE published_at END
  WHERE id = p_item_id RETURNING * INTO v_row;
  IF v_status = 'running' THEN
    PERFORM public.marketing_finalize_item_if_terminal(p_item_id);
    SELECT * INTO v_row FROM public.marketing_calendar_items WHERE id = p_item_id;
  END IF;
  RETURN jsonb_build_object(
    'id', v_row.id, 'status', v_row.status, 'attempt_count', v_row.attempt_count,
    'next_attempt_at', v_row.next_attempt_at, 'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_dispatch_marketing_notification_item(
  p_item_id uuid,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.marketing_calendar_items%ROWTYPE;
  v_summary jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  SELECT * INTO v_item FROM public.marketing_calendar_items
  WHERE id = p_item_id AND lease_token = p_lease_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease mismatch or item not found' USING ERRCODE = '40001'; END IF;
  IF v_item.channel NOT IN ('in_app','email','push') THEN
    RAISE EXCEPTION 'Notification adapter only supports in_app, email or push' USING ERRCODE = '22023';
  END IF;
  -- Never call the legacy broad role/city campaign dispatcher here. The safe
  -- path first materializes consent-checked, per-contact deliveries.
  v_summary := public.service_materialize_marketing_deliveries(p_item_id, 5000);
  RETURN v_summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_materialize_marketing_deliveries(
  p_item_id uuid,
  p_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.marketing_calendar_items%ROWTYPE;
  v_campaign public.marketing_campaigns%ROWTYPE;
  v_integration public.marketing_integrations%ROWTYPE;
  v_inserted integer := 0;
  v_total integer := 0;
  v_frequency_cap_hours integer := 72;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF public.marketing_runtime_enabled() IS NOT TRUE THEN
    RAISE EXCEPTION 'Marketing runtime or feature kill-switch is disabled' USING ERRCODE = '55000';
  END IF;
  -- Serialize audience reservation so two campaigns cannot reserve the same
  -- contact inside the configured frequency window.
  PERFORM pg_catalog.pg_advisory_xact_lock(73104721920260802::bigint);
  SELECT * INTO v_item FROM public.marketing_calendar_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Calendar item not found' USING ERRCODE = 'P0002'; END IF;
  IF v_item.approval_status <> 'approved' OR v_item.approved_at IS NULL THEN
    RAISE EXCEPTION 'Calendar item is not approved' USING ERRCODE = '42501';
  END IF;
  IF v_item.status NOT IN ('scheduled','queued','leased','processing','running','retrying') THEN
    RAISE EXCEPTION 'Calendar item is not dispatchable' USING ERRCODE = '42501';
  END IF;
  IF v_item.campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign FROM public.marketing_campaigns
    WHERE id = v_item.campaign_id FOR SHARE;
    IF NOT FOUND OR v_campaign.approved_at IS NULL
       OR v_campaign.status IN ('paused','completed','cancelled','failed') THEN
      RAISE EXCEPTION 'Parent campaign is not approved' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_item.channel IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website') THEN
    RETURN jsonb_build_object('item_id', p_item_id, 'created', 0, 'public_channel', true);
  END IF;
  IF (now() AT TIME ZONE 'Europe/Zurich')::time < time '08:00'
     OR (now() AT TIME ZONE 'Europe/Zurich')::time >= time '20:00' THEN
    RAISE EXCEPTION 'Individual marketing dispatch is outside quiet hours' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_integration FROM public.marketing_integrations WHERE id = v_item.integration_id;
  IF NOT FOUND OR v_integration.status NOT IN ('connected','manual') THEN
    RAISE EXCEPTION 'Channel is not configured' USING ERRCODE = '55000';
  END IF;
  IF v_integration.status = 'connected' AND v_item.channel <> 'in_app'
     AND COALESCE((v_integration.capabilities ->> 'adapter_deployed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Provider adapter is not deployed' USING ERRCODE = '55000';
  END IF;
  SELECT LEAST(GREATEST(COALESCE((a.conditions ->> 'frequency_cap_hours')::integer, 72), 1), 720)
  INTO v_frequency_cap_hours
  FROM public.marketing_automations a WHERE a.automation_key = 'global_runtime';

  WITH eligible AS (
    SELECT c.*,
      CASE
        WHEN v_item.channel IN ('email','manual_email') THEN c.email_normalized
        WHEN v_item.channel IN ('manual_call','manual_visit') THEN c.phone_normalized
        ELSE c.user_id::text
      END AS raw_target
    FROM public.marketing_contacts c
    WHERE c.opted_out_at IS NULL
      AND c.lawful_basis <> 'none'
      AND public.marketing_contact_is_eligible(c.id, v_item.channel)
      AND public.marketing_contact_matches_filter(c.id, v_item.targeting)
      AND (c.last_contact_at IS NULL OR c.last_contact_at <= now() - make_interval(hours => v_frequency_cap_hours))
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_deliveries reserved
        WHERE reserved.contact_id = c.id
          AND reserved.item_id <> v_item.id
          AND reserved.status IN ('queued','leased','processing','retrying','manual_required')
          AND COALESCE(reserved.scheduled_at, reserved.created_at) >= now() - make_interval(hours => v_frequency_cap_hours)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_deliveries existing
        WHERE existing.item_id = v_item.id AND existing.contact_id = c.id AND existing.channel = v_item.channel
      )
    ORDER BY c.id LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 25000)
  ), inserted AS (
    INSERT INTO public.marketing_deliveries (
      item_id, contact_id, user_id, channel, target_masked, target_hash, status,
      provider, item_approved_at, idempotency_key, max_attempts, scheduled_at
    )
    SELECT v_item.id, e.id, e.user_id, v_item.channel,
      public.marketing_mask_target(e.raw_target),
      encode(extensions.digest(COALESCE(e.target_fingerprint, e.raw_target) || ':' || v_item.id::text || ':' || v_item.channel, 'sha256'), 'hex'),
      CASE WHEN v_integration.status = 'manual' THEN 'manual_required' ELSE 'queued' END,
      v_integration.provider, v_item.approved_at,
      encode(extensions.digest(v_item.id::text || ':' || e.id::text || ':' || v_item.channel, 'sha256'), 'hex'),
      v_item.max_attempts, v_item.scheduled_at
    FROM eligible e
    ON CONFLICT (item_id, contact_id, channel) WHERE contact_id IS NOT NULL DO NOTHING
    RETURNING id
  ) SELECT count(*) INTO v_inserted FROM inserted;

  SELECT count(*) INTO v_total FROM public.marketing_deliveries WHERE item_id = p_item_id;
  UPDATE public.marketing_calendar_items SET
    audience_size = GREATEST(audience_size, v_total),
    result_summary = jsonb_set(result_summary, '{materialized_deliveries}', to_jsonb(v_total), true)
  WHERE id = p_item_id;
  RETURN jsonb_build_object(
    'item_id', p_item_id, 'created', v_inserted, 'total', v_total,
    'batch_complete', v_inserted < LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 25000),
    'public_channel', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_marketing_deliveries(
  p_limit integer DEFAULT 100,
  p_worker_id text DEFAULT 'marketing-orchestrator',
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  contact_id uuid,
  user_id uuid,
  channel text,
  provider text,
  raw_target text,
  content jsonb,
  attempt_count integer,
  max_attempts integer,
  lease_token uuid,
  idempotency_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_daily_cap integer := 500;
  v_reserved_today bigint := 0;
  v_frequency_cap_hours integer := 72;
  v_claim_limit integer;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF public.marketing_runtime_enabled() IS NOT TRUE THEN RETURN; END IF;

  -- Claims reserve daily capacity. The transaction-level lock makes the
  -- read-and-reserve sequence atomic across concurrent orchestrator calls.
  PERFORM pg_catalog.pg_advisory_xact_lock(73104721920260801::bigint);
  SELECT
    LEAST(GREATEST(COALESCE((a.conditions ->> 'daily_cap')::integer, 500), 1), 10000),
    LEAST(GREATEST(COALESCE((a.conditions ->> 'frequency_cap_hours')::integer, 72), 1), 720)
  INTO v_daily_cap, v_frequency_cap_hours
  FROM public.marketing_automations a WHERE a.automation_key = 'global_runtime';
  SELECT count(*) INTO v_reserved_today FROM public.marketing_deliveries d
  WHERE d.sent_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich')
     OR (d.status IN ('leased','processing') AND d.lease_expires_at > now());
  v_claim_limit := LEAST(
    LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500),
    GREATEST(v_daily_cap - v_reserved_today, 0)
  );
  IF v_claim_limit <= 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT d.id,
      COALESCE(d.next_attempt_at, d.scheduled_at, d.created_at) AS due_at,
      row_number() OVER (
        PARTITION BY d.contact_id
        ORDER BY COALESCE(d.next_attempt_at, d.scheduled_at, d.created_at), d.id
      ) AS contact_rank
    FROM public.marketing_deliveries d
    JOIN public.marketing_contacts c ON c.id = d.contact_id
    JOIN public.marketing_integrations g ON g.channel = d.channel AND g.provider = d.provider
    JOIN public.marketing_calendar_items i ON i.id = d.item_id
    LEFT JOIN public.marketing_campaigns campaign ON campaign.id = i.campaign_id
    WHERE (
      (d.status IN ('queued','retrying') AND COALESCE(d.next_attempt_at, d.scheduled_at, d.created_at) <= now())
      OR (d.status IN ('leased','processing') AND d.lease_expires_at < now())
    )
      AND d.attempt_count < d.max_attempts
      AND c.opted_out_at IS NULL
      AND c.lawful_basis <> 'none'
      AND public.marketing_contact_is_eligible(c.id, d.channel)
      AND g.status = 'connected'
      AND (d.channel = 'in_app' OR COALESCE((g.capabilities ->> 'adapter_deployed')::boolean, false))
      AND i.approval_status = 'approved' AND i.approved_at = d.item_approved_at
      AND i.status IN ('scheduled','queued','leased','processing','running')
      AND (now() AT TIME ZONE 'Europe/Zurich')::time >= time '08:00'
      AND (now() AT TIME ZONE 'Europe/Zurich')::time < time '19:55'
      AND (c.last_contact_at IS NULL OR c.last_contact_at <= now() - make_interval(hours => v_frequency_cap_hours))
      AND (i.campaign_id IS NULL OR (
        campaign.approved_at IS NOT NULL AND campaign.status NOT IN ('paused','completed','cancelled','failed')
      ))
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_deliveries active
        WHERE active.contact_id = d.contact_id AND active.id <> d.id
          AND active.status IN ('leased','processing') AND active.lease_expires_at > now()
      )
  ), selected AS (
    SELECT r.id, r.due_at
    FROM ranked r
    WHERE r.contact_rank = 1
    ORDER BY r.due_at, r.id
    LIMIT v_claim_limit
  ), candidates AS (
    SELECT d.id
    FROM public.marketing_deliveries d
    JOIN selected s ON s.id = d.id
    ORDER BY s.due_at, s.id
    FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.marketing_deliveries d SET
      status = 'leased', attempt_count = d.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 30), 900)),
      metadata = jsonb_set(d.metadata, '{worker_id}', to_jsonb(left(COALESCE(p_worker_id, 'worker'), 120)), true)
    FROM candidates c WHERE d.id = c.id RETURNING d.*
  )
  SELECT d.id, d.item_id, d.contact_id, d.user_id, d.channel, d.provider,
    CASE WHEN d.channel = 'email' THEN c.email_normalized
         WHEN d.channel IN ('manual_call','manual_visit') THEN c.phone_normalized
         ELSE c.user_id::text END AS raw_target,
    i.content, d.attempt_count, d.max_attempts, d.lease_token, d.idempotency_key
  FROM claimed d
  JOIN public.marketing_contacts c ON c.id = d.contact_id
  JOIN public.marketing_calendar_items i ON i.id = d.item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_send_marketing_in_app_delivery(
  p_delivery_id uuid,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery public.marketing_deliveries%ROWTYPE;
  v_item public.marketing_calendar_items%ROWTYPE;
  v_campaign public.marketing_campaigns%ROWTYPE;
  v_contact public.marketing_contacts%ROWTYPE;
  v_preferences public.notification_preferences%ROWTYPE;
  v_frequency_cap_hours integer := 72;
  v_daily_cap integer := 500;
  v_sent_today bigint := 0;
  v_local_time time;
  v_queue_count integer := 0;
BEGIN
  PERFORM public.marketing_require_service_role();
  PERFORM pg_catalog.pg_advisory_xact_lock(73104721920260801::bigint);
  SELECT * INTO v_delivery FROM public.marketing_deliveries
  WHERE id = p_delivery_id AND lease_token = p_lease_token
    AND status = 'leased' AND lease_expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease mismatch or delivery not found' USING ERRCODE = '40001'; END IF;
  IF public.marketing_runtime_enabled() IS NOT TRUE THEN
    UPDATE public.marketing_deliveries SET
      status = 'retrying', next_attempt_at = now() + interval '15 minutes',
      error_code = 'runtime_disabled', last_error = 'Marketing runtime or feature kill-switch is disabled',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('id', v_delivery.id, 'status', 'retrying', 'reason', 'runtime_disabled');
  END IF;
  IF v_delivery.channel <> 'in_app' OR v_delivery.user_id IS NULL OR v_delivery.contact_id IS NULL THEN
    RAISE EXCEPTION 'In-app delivery requires a registered marketing contact' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_item FROM public.marketing_calendar_items WHERE id = v_delivery.item_id FOR SHARE;
  IF NOT FOUND OR v_item.approval_status <> 'approved' OR v_item.approved_at IS DISTINCT FROM v_delivery.item_approved_at
     OR v_item.status NOT IN ('scheduled','queued','leased','processing','running') THEN
    UPDATE public.marketing_deliveries SET
      status = 'cancelled', error_code = 'parent_invalidated', last_error = 'Calendar item is no longer approved',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('id', v_delivery.id, 'status', 'cancelled', 'reason', 'parent_invalidated');
  END IF;
  IF v_item.campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign FROM public.marketing_campaigns
    WHERE id = v_item.campaign_id FOR SHARE;
    IF NOT FOUND OR v_campaign.approved_at IS NULL
       OR v_campaign.status IN ('paused','completed','cancelled','failed') THEN
      UPDATE public.marketing_deliveries SET
        status = 'cancelled', error_code = 'campaign_invalidated', last_error = 'Campaign is no longer approved',
        lease_token = NULL, lease_expires_at = NULL
      WHERE id = v_delivery.id;
      RETURN jsonb_build_object('id', v_delivery.id, 'status', 'cancelled', 'reason', 'campaign_invalidated');
    END IF;
  END IF;

  v_local_time := (now() AT TIME ZONE 'Europe/Zurich')::time;
  IF v_local_time < time '08:00' OR v_local_time >= time '20:00' THEN
    UPDATE public.marketing_deliveries SET
      status = 'retrying',
      next_attempt_at = CASE WHEN v_local_time < time '08:00'
        THEN (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') + interval '8 hours') AT TIME ZONE 'Europe/Zurich'
        ELSE (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') + interval '1 day 8 hours') AT TIME ZONE 'Europe/Zurich' END,
      error_code = 'quiet_hours', last_error = 'Deferred outside the 08:00-20:00 Europe/Zurich window',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('id', v_delivery.id, 'status', 'retrying', 'reason', 'quiet_hours');
  END IF;

  SELECT * INTO v_contact FROM public.marketing_contacts WHERE id = v_delivery.contact_id FOR UPDATE;
  SELECT
    LEAST(GREATEST(COALESCE((a.conditions ->> 'frequency_cap_hours')::integer, 72), 1), 720),
    LEAST(GREATEST(COALESCE((a.conditions ->> 'daily_cap')::integer, 500), 1), 10000)
  INTO v_frequency_cap_hours, v_daily_cap
  FROM public.marketing_automations a WHERE a.automation_key = 'global_runtime';
  IF NOT FOUND OR NOT public.marketing_contact_is_eligible(v_contact.id, 'in_app')
     OR NOT public.marketing_contact_matches_filter(v_contact.id, v_item.targeting) THEN
    UPDATE public.marketing_deliveries SET
      status = 'skipped', error_code = 'contact_ineligible', last_error = 'Contact is not eligible',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('id', v_delivery.id, 'status', 'skipped', 'reason', 'contact_ineligible');
  END IF;
  IF v_contact.last_contact_at IS NOT NULL
     AND v_contact.last_contact_at > now() - make_interval(hours => v_frequency_cap_hours) THEN
    UPDATE public.marketing_deliveries SET
      status = 'skipped', error_code = 'frequency_cap', last_error = 'Contact frequency cap is active',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('id', v_delivery.id, 'status', 'skipped', 'reason', 'frequency_cap');
  END IF;

  SELECT count(*) INTO v_sent_today FROM public.marketing_deliveries d
  WHERE d.sent_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich');
  IF v_sent_today >= v_daily_cap THEN
    UPDATE public.marketing_deliveries SET
      status = 'retrying',
      next_attempt_at = (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') + interval '1 day 8 hours') AT TIME ZONE 'Europe/Zurich',
      error_code = 'daily_cap', last_error = 'Daily marketing cap reached',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('id', v_delivery.id, 'status', 'retrying', 'reason', 'daily_cap');
  END IF;

  SELECT * INTO v_preferences FROM public.notification_preferences
  WHERE user_id = v_delivery.user_id;
  IF NOT FOUND
     OR COALESCE((v_preferences.categories ->> 'marketing')::boolean, false) IS NOT TRUE
     OR COALESCE((v_preferences.channels ->> 'in_app')::boolean, true) IS NOT TRUE THEN
    UPDATE public.marketing_deliveries SET
      status = 'skipped', error_code = 'notification_preference_blocked',
      last_error = 'Marketing notification preference is disabled',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('id', v_delivery.id, 'status', 'skipped', 'reason', 'notification_preference_blocked');
  END IF;

  INSERT INTO public.notifications (id, user_id, title, body, type, category, data)
  VALUES (
    v_delivery.id, v_delivery.user_id, v_item.title,
    COALESCE(NULLIF(v_item.content ->> 'message', ''), NULLIF(v_item.content ->> 'body', ''), v_item.title),
    'campaign', 'marketing',
    jsonb_build_object(
      'marketing_item_id', v_item.id, 'marketing_delivery_id', v_delivery.id,
      'url', COALESCE(NULLIF(v_item.content ->> 'url', ''), '/notifications'),
      'requested_channels', jsonb_build_object('in_app', true, 'push', false, 'email', false)
    )
  ) ON CONFLICT (id) DO NOTHING;
  v_queue_count := public.queue_notification_deliveries(
    v_delivery.id, v_delivery.user_id, 'marketing',
    jsonb_build_object('requested_channels', jsonb_build_object('in_app', true, 'push', false, 'email', false))
  );

  UPDATE public.marketing_deliveries SET
    status = 'sent', sent_at = COALESCE(sent_at, now()),
    lease_token = NULL, lease_expires_at = NULL, last_error = NULL, error_code = NULL,
    metadata = metadata || jsonb_build_object('notification_id', v_delivery.id, 'queue_count', v_queue_count)
  WHERE id = v_delivery.id;
  UPDATE public.marketing_contacts SET last_contact_at = now(), lifecycle_status = CASE
    WHEN lifecycle_status IN ('new','qualified','follow_up') THEN 'contacted' ELSE lifecycle_status END
  WHERE id = v_contact.id;
  INSERT INTO public.marketing_events (campaign_id, item_id, delivery_id, event_type, provider, occurred_at, metadata)
  VALUES (v_item.campaign_id, v_item.id, v_delivery.id, 'delivery_sent', 'tok-notifications', now(), '{}'::jsonb);
  PERFORM public.marketing_finalize_item_if_terminal(v_item.id);
  RETURN jsonb_build_object('id', v_delivery.id, 'status', 'sent', 'notification_id', v_delivery.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_marketing_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.marketing_deliveries%ROWTYPE;
  v_item public.marketing_calendar_items%ROWTYPE;
  v_campaign public.marketing_campaigns%ROWTYPE;
  v_contact public.marketing_contacts%ROWTYPE;
  v_status text := p_status;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF v_status NOT IN ('sent','delivered','retrying','failed','bounced','skipped','blocked_configuration') THEN
    RAISE EXCEPTION 'Invalid delivery completion status' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.marketing_deliveries
  WHERE id = p_delivery_id AND lease_token = p_lease_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease mismatch or delivery not found' USING ERRCODE = '40001'; END IF;
  IF v_status = 'retrying' AND v_row.attempt_count >= v_row.max_attempts THEN v_status := 'failed'; END IF;
  SELECT * INTO v_item FROM public.marketing_calendar_items
  WHERE id = v_row.item_id FOR SHARE;
  IF v_status IN ('sent','delivered','retrying') AND (
    NOT FOUND OR v_item.approval_status <> 'approved'
    OR v_item.approved_at IS DISTINCT FROM v_row.item_approved_at
    OR v_item.status NOT IN ('scheduled','queued','leased','processing','running')
  ) THEN
    v_status := 'cancelled';
    p_error_code := 'parent_invalidated';
    p_error := 'Calendar item was invalidated before completion';
  ELSIF v_status IN ('sent','delivered','retrying') AND v_item.campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign FROM public.marketing_campaigns
    WHERE id = v_item.campaign_id FOR SHARE;
    IF NOT FOUND OR v_campaign.approved_at IS NULL
       OR v_campaign.status IN ('paused','completed','cancelled','failed') THEN
      v_status := 'cancelled';
      p_error_code := 'campaign_invalidated';
      p_error := 'Campaign was invalidated before completion';
    END IF;
  END IF;
  IF v_status IN ('sent','delivered') AND public.marketing_runtime_enabled() IS NOT TRUE THEN
    v_status := 'cancelled';
    p_error_code := 'runtime_disabled';
    p_error := 'Marketing runtime or feature kill-switch was disabled before completion';
  END IF;
  IF v_row.contact_id IS NOT NULL THEN
    SELECT * INTO v_contact FROM public.marketing_contacts WHERE id = v_row.contact_id FOR UPDATE;
    IF v_status IN ('sent','delivered')
       AND (NOT FOUND OR NOT public.marketing_contact_is_eligible(v_row.contact_id, v_row.channel)) THEN
      v_status := 'skipped';
      p_error_code := 'contact_ineligible';
      p_error := 'Contact became ineligible before completion';
    END IF;
  END IF;
  UPDATE public.marketing_deliveries SET
    status = v_status, provider_message_id = COALESCE(NULLIF(p_provider_message_id, ''), provider_message_id),
    error_code = NULLIF(p_error_code, ''), last_error = CASE WHEN p_error IS NULL THEN NULL ELSE left(p_error, 1000) END,
    metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
    next_attempt_at = CASE WHEN v_status = 'retrying'
      THEN now() + (LEAST(power(2, v_row.attempt_count), 60)::text || ' minutes')::interval END,
    lease_token = NULL, lease_expires_at = NULL,
    sent_at = CASE WHEN v_status IN ('sent','delivered') THEN COALESCE(sent_at, now()) ELSE sent_at END,
    delivered_at = CASE WHEN v_status = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
    bounced_at = CASE WHEN v_status = 'bounced' THEN COALESCE(bounced_at, now()) ELSE bounced_at END
  WHERE id = p_delivery_id RETURNING * INTO v_row;
  IF v_row.contact_id IS NOT NULL AND v_status IN ('sent','delivered') THEN
    UPDATE public.marketing_contacts SET
      last_contact_at = now(),
      lifecycle_status = CASE WHEN lifecycle_status IN ('new','qualified','follow_up') THEN 'contacted' ELSE lifecycle_status END
    WHERE id = v_row.contact_id;
  END IF;
  IF v_status IN ('sent','delivered') THEN
    INSERT INTO public.marketing_events (campaign_id, item_id, delivery_id, event_type, provider, occurred_at, metadata)
    VALUES (
      v_item.campaign_id, v_item.id, v_row.id,
      CASE WHEN v_status = 'delivered' THEN 'delivery_delivered' ELSE 'delivery_sent' END,
      v_row.provider, now(), COALESCE(p_metadata, '{}'::jsonb)
    );
  END IF;
  PERFORM public.marketing_finalize_item_if_terminal(v_row.item_id);
  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updated_at', v_row.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_marketing_provider_event(
  p_provider text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_occurred_at timestamptz DEFAULT now(),
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery public.marketing_deliveries%ROWTYPE;
  v_status text;
  v_inserted_id uuid;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF NULLIF(p_provider, '') IS NULL OR NULLIF(p_provider_event_id, '') IS NULL
     OR NULLIF(p_provider_message_id, '') IS NULL THEN
    RAISE EXCEPTION 'Provider identifiers are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_delivery FROM public.marketing_deliveries
  WHERE provider = p_provider AND provider_message_id = p_provider_message_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('accepted', false, 'reason', 'delivery_not_found'); END IF;

  INSERT INTO public.marketing_events (
    campaign_id, item_id, delivery_id, event_type, provider, provider_event_id, occurred_at, metadata
  ) SELECT i.campaign_id, v_delivery.item_id, v_delivery.id, left(p_event_type, 80),
      p_provider, p_provider_event_id, COALESCE(p_occurred_at, now()), COALESCE(p_metadata, '{}'::jsonb)
    FROM public.marketing_calendar_items i WHERE i.id = v_delivery.item_id
  ON CONFLICT (provider, provider_event_id) WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_inserted_id;
  IF v_inserted_id IS NULL THEN RETURN jsonb_build_object('accepted', true, 'duplicate', true); END IF;

  v_status := CASE lower(p_event_type)
    WHEN 'delivered' THEN 'delivered' WHEN 'opened' THEN 'opened' WHEN 'clicked' THEN 'clicked'
    WHEN 'converted' THEN 'converted' WHEN 'bounced' THEN 'bounced'
    WHEN 'complained' THEN 'complained' WHEN 'unsubscribed' THEN 'unsubscribed'
    ELSE NULL END;
  IF v_status IS NOT NULL THEN
    UPDATE public.marketing_deliveries SET
      status = CASE
        WHEN status IN ('bounced','complained','unsubscribed','cancelled') THEN status
        WHEN v_status IN ('bounced','complained','unsubscribed') THEN v_status
        WHEN public.marketing_delivery_status_rank(v_status) > public.marketing_delivery_status_rank(status) THEN v_status
        ELSE status
      END,
      delivered_at = CASE WHEN v_status = 'delivered' THEN COALESCE(delivered_at, p_occurred_at, now()) ELSE delivered_at END,
      opened_at = CASE WHEN v_status = 'opened' THEN COALESCE(opened_at, p_occurred_at, now()) ELSE opened_at END,
      clicked_at = CASE WHEN v_status = 'clicked' THEN COALESCE(clicked_at, p_occurred_at, now()) ELSE clicked_at END,
      converted_at = CASE WHEN v_status = 'converted' THEN COALESCE(converted_at, p_occurred_at, now()) ELSE converted_at END,
      bounced_at = CASE WHEN v_status = 'bounced' THEN COALESCE(bounced_at, p_occurred_at, now()) ELSE bounced_at END,
      unsubscribed_at = CASE WHEN v_status = 'unsubscribed' THEN COALESCE(unsubscribed_at, p_occurred_at, now()) ELSE unsubscribed_at END
    WHERE id = v_delivery.id;
  END IF;
  IF v_status IN ('unsubscribed','complained') AND v_delivery.contact_id IS NOT NULL THEN
    PERFORM set_config(
      'app.marketing_lawful_basis_context',
      jsonb_build_object(
        'source', left('provider_event:' || p_provider, 200),
        'note', 'Marketing suppression recorded from provider event: ' || v_status || '.',
        'recorded_at', COALESCE(p_occurred_at, clock_timestamp()),
        'quality', 'system_event',
        'source_system', 'provider_event',
        'source_reference', left(p_provider_event_id, 200)
      )::text,
      true
    );
    UPDATE public.marketing_contacts SET
      opted_out_at = COALESCE(opted_out_at, p_occurred_at, now()), lifecycle_status = 'opted_out',
      lawful_basis = 'none', suppression_reason = 'provider_' || v_status, next_action_at = NULL
    WHERE id = v_delivery.contact_id;
    UPDATE public.marketing_deliveries SET status = 'cancelled', last_error = 'Contact suppressed by provider event'
    WHERE contact_id = v_delivery.contact_id AND id <> v_delivery.id
      AND status IN ('queued','leased','processing','retrying','manual_required');
  END IF;
  IF v_status = 'bounced' AND v_delivery.contact_id IS NOT NULL AND v_delivery.channel = 'email' THEN
    UPDATE public.marketing_contacts SET
      metadata = metadata || jsonb_build_object(
        'email_suppressed', true, 'email_suppressed_at', COALESCE(p_occurred_at, now()),
        'email_suppression_reason', 'provider_bounce'
      )
    WHERE id = v_delivery.contact_id;
    UPDATE public.marketing_deliveries SET
      status = 'cancelled', last_error = 'Email target suppressed after provider bounce'
    WHERE contact_id = v_delivery.contact_id AND id <> v_delivery.id AND channel = 'email'
      AND status IN ('queued','leased','processing','retrying','manual_required');
  END IF;
  RETURN jsonb_build_object('accepted', true, 'duplicate', false, 'delivery_id', v_delivery.id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_marketing_orchestrator_cron()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_edge_url text;
  v_cron_secret text;
  v_request_id bigint;
  v_global_paused boolean;
  v_feature_active boolean;
BEGIN
  SELECT COALESCE((a.conditions ->> 'global_pause')::boolean, true) INTO v_global_paused
  FROM public.marketing_automations a WHERE a.automation_key = 'global_runtime';
  SELECT f.is_active INTO v_feature_active FROM public.feature_flags f
  WHERE f.name = 'admin-marketing-operations';
  IF COALESCE(v_global_paused, true) OR COALESCE(v_feature_active, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Environment-bound URL prevents a branch scheduler from ever calling production.
  SELECT s.decrypted_secret INTO v_edge_url
  FROM vault.decrypted_secrets s WHERE s.name = 'marketing_edge_url' LIMIT 1;
  SELECT s.decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets s WHERE s.name = 'internal_cron_secret' LIMIT 1;
  v_edge_url := btrim(v_edge_url);
  v_cron_secret := btrim(v_cron_secret);
  IF NULLIF(v_cron_secret, '') IS NULL
     OR COALESCE(v_edge_url ~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/marketing-orchestrator$', false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-cron-secret', v_cron_secret
    ),
    body := '{"action":"run_due","limit":25}'::jsonb,
    timeout_milliseconds := 15000
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$;

-- Single BFF entrypoint for browser-driven marketing administration. The
-- service role remains server-side; operation names and argument casts are
-- explicit so callers cannot turn this function into an arbitrary RPC proxy.
CREATE OR REPLACE FUNCTION public.service_execute_marketing_admin_operation(
  p_sid_hash text,
  p_csrf_hash text,
  p_operation text,
  p_args jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session jsonb;
  v_actor_user_id uuid;
  v_args jsonb := COALESCE(p_args, '{}'::jsonb);
  v_result jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF jsonb_typeof(v_args) <> 'object' THEN
    RAISE EXCEPTION 'Marketing operation arguments must be an object'
      USING ERRCODE = '22023';
  END IF;

  v_session := public.service_get_marketing_web_session(
    p_sid_hash,
    p_csrf_hash,
    true
  );
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Active marketing BFF session and CSRF proof required'
      USING ERRCODE = '42501';
  END IF;
  v_actor_user_id := NULLIF(v_session ->> 'user_id', '')::uuid;

  -- Re-evaluate authorization from the database instead of trusting a stale
  -- JWT or an actor identifier supplied by the browser.
  IF v_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_actor_user_id AND ur.role::text = 'admin'
  ) THEN
    UPDATE public.marketing_admin_web_sessions s
    SET revoked_at = COALESCE(s.revoked_at, clock_timestamp()),
        revoke_reason = COALESCE(s.revoke_reason, 'admin_role_removed')
    WHERE s.sid_hash = p_sid_hash;
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.marketing_actor_user_id', v_actor_user_id::text, true);
  PERFORM set_config('app.marketing_web_session_sid_hash', p_sid_hash, true);
  PERFORM set_config('app.marketing_operation', COALESCE(p_operation, ''), true);

  CASE p_operation
    WHEN 'admin_get_marketing_overview' THEN
      v_result := public.admin_get_marketing_overview(
        COALESCE(NULLIF(v_args ->> 'p_from', '')::timestamptz, now() - interval '30 days'),
        COALESCE(NULLIF(v_args ->> 'p_to', '')::timestamptz, now() + interval '60 days')
      );
    WHEN 'admin_list_marketing_campaigns' THEN
      v_result := public.admin_list_marketing_campaigns(
        NULLIF(v_args ->> 'p_status', ''),
        COALESCE(NULLIF(v_args ->> 'p_limit', '')::integer, 50),
        NULLIF(v_args ->> 'p_cursor_updated_at', '')::timestamptz,
        NULLIF(v_args ->> 'p_cursor_id', '')::uuid
      );
    WHEN 'admin_list_marketing_calendar' THEN
      v_result := public.admin_list_marketing_calendar(
        NULLIF(v_args ->> 'p_from', '')::timestamptz,
        NULLIF(v_args ->> 'p_to', '')::timestamptz,
        NULLIF(v_args ->> 'p_status', ''),
        NULLIF(v_args ->> 'p_channel', ''),
        COALESCE(NULLIF(v_args ->> 'p_limit', '')::integer, 100),
        NULLIF(v_args ->> 'p_cursor_scheduled_at', '')::timestamptz,
        NULLIF(v_args ->> 'p_cursor_id', '')::uuid
      );
    WHEN 'admin_list_marketing_deliveries' THEN
      v_result := public.admin_list_marketing_deliveries(
        NULLIF(v_args ->> 'p_query', ''),
        NULLIF(v_args ->> 'p_status', ''),
        NULLIF(v_args ->> 'p_channel', ''),
        COALESCE(NULLIF(v_args ->> 'p_limit', '')::integer, 100),
        COALESCE(NULLIF(v_args ->> 'p_offset', '')::integer, 0)
      );
    WHEN 'admin_list_marketing_automations' THEN
      v_result := public.admin_list_marketing_automations(
        NULLIF(v_args ->> 'p_status', ''),
        COALESCE(NULLIF(v_args ->> 'p_limit', '')::integer, 50),
        NULLIF(v_args ->> 'p_cursor_updated_at', '')::timestamptz,
        NULLIF(v_args ->> 'p_cursor_id', '')::uuid
      );
    WHEN 'admin_list_marketing_integrations' THEN
      v_result := public.admin_list_marketing_integrations(
        NULLIF(v_args ->> 'p_channel', ''),
        COALESCE(NULLIF(v_args ->> 'p_limit', '')::integer, 100),
        NULLIF(v_args ->> 'p_cursor_id', '')::uuid
      );
    WHEN 'admin_list_marketing_contacts' THEN
      v_result := public.admin_list_marketing_contacts(
        NULLIF(v_args ->> 'p_query', ''),
        NULLIF(v_args ->> 'p_status', ''),
        NULLIF(v_args ->> 'p_channel', ''),
        COALESCE(NULLIF(v_args ->> 'p_limit', '')::integer, 100),
        COALESCE(NULLIF(v_args ->> 'p_offset', '')::integer, 0)
      );
    WHEN 'admin_upsert_marketing_contact' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_payload','p_expected_updated_at')
      ) OR jsonb_typeof(v_args -> 'p_payload') <> 'object' OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args -> 'p_payload') AS field(k)
        WHERE field.k NOT IN (
          'id','display_name','email','phone','city','canton','category',
          'lawful_basis','evidence_source','evidence_note','evidence_at'
        )
      ) THEN
        RAISE EXCEPTION 'Restaurant qualification contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      IF NULLIF(btrim(v_args -> 'p_payload' ->> 'display_name'), '') IS NULL
         OR NULLIF(btrim(v_args -> 'p_payload' ->> 'city'), '') IS NULL
         OR COALESCE(v_args -> 'p_payload' ->> 'canton', '') !~ '^[A-Za-z]{2}$'
         OR COALESCE(v_args -> 'p_payload' ->> 'lawful_basis', '')
           NOT IN ('consent','existing_customer','legitimate_interest') THEN
        RAISE EXCEPTION 'Restaurant identity, location and positive lawful basis are required' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_upsert_marketing_contact(
        jsonb_strip_nulls(jsonb_build_object(
          'id', NULLIF(v_args -> 'p_payload' ->> 'id', ''),
          'contact_type', 'restaurant_lead',
          'display_name', NULLIF(btrim(v_args -> 'p_payload' ->> 'display_name'), ''),
          'email', NULLIF(btrim(v_args -> 'p_payload' ->> 'email'), ''),
          'phone', NULLIF(btrim(v_args -> 'p_payload' ->> 'phone'), ''),
          'city', NULLIF(btrim(v_args -> 'p_payload' ->> 'city'), ''),
          'canton', upper(v_args -> 'p_payload' ->> 'canton'),
          'category', COALESCE(NULLIF(btrim(v_args -> 'p_payload' ->> 'category'), ''), 'Restaurant'),
          'lifecycle_status', 'qualified',
          'lawful_basis', v_args -> 'p_payload' ->> 'lawful_basis',
          'consent_source', CASE
            WHEN v_args -> 'p_payload' ->> 'lawful_basis' = 'consent'
              THEN NULLIF(btrim(v_args -> 'p_payload' ->> 'evidence_source'), '')
          END,
          'consent_at', CASE
            WHEN v_args -> 'p_payload' ->> 'lawful_basis' = 'consent'
              THEN NULLIF(v_args -> 'p_payload' ->> 'evidence_at', '')
          END,
          'last_verified_at', NULLIF(v_args -> 'p_payload' ->> 'evidence_at', ''),
          'metadata', jsonb_build_object(
            'lawful_basis_evidence', jsonb_build_object(
              'source', NULLIF(btrim(v_args -> 'p_payload' ->> 'evidence_source'), ''),
              'note', NULLIF(btrim(v_args -> 'p_payload' ->> 'evidence_note'), ''),
              'recorded_at', NULLIF(v_args -> 'p_payload' ->> 'evidence_at', '')
            ),
            'qualified_manually', true
          )
        )),
        NULLIF(v_args ->> 'p_expected_updated_at', '')::timestamptz
      );
    WHEN 'admin_suppress_marketing_contact' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_contact_id','p_reason')
      ) THEN
        RAISE EXCEPTION 'Contact suppression contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_suppress_marketing_contact(
        NULLIF(v_args ->> 'p_contact_id', '')::uuid,
        v_args ->> 'p_reason'
      );
    WHEN 'admin_upsert_marketing_campaign' THEN
      v_result := public.admin_upsert_marketing_campaign(
        v_args -> 'p_payload',
        NULLIF(v_args ->> 'p_expected_updated_at', '')::timestamptz
      );
    WHEN 'admin_create_marketing_campaign_bundle' THEN
      v_result := public.admin_create_marketing_campaign_bundle(
        v_args -> 'p_payload',
        NULLIF(v_args ->> 'p_client_request_id', '')::uuid
      );
    WHEN 'admin_upsert_marketing_calendar_item' THEN
      v_result := public.admin_upsert_marketing_calendar_item(
        v_args -> 'p_payload',
        NULLIF(v_args ->> 'p_expected_updated_at', '')::timestamptz
      );
    WHEN 'admin_cancel_marketing_item' THEN
      v_result := public.admin_cancel_marketing_item(
        NULLIF(v_args ->> 'p_item_id', '')::uuid,
        v_args ->> 'p_reason'
      );
    WHEN 'admin_complete_manual_marketing_item' THEN
      v_result := public.admin_complete_manual_marketing_item(
        NULLIF(v_args ->> 'p_item_id', '')::uuid,
        v_args ->> 'p_outcome',
        v_args ->> 'p_note'
      );
    WHEN 'admin_estimate_marketing_audience' THEN
      v_result := public.admin_estimate_marketing_audience(
        COALESCE(v_args -> 'p_filter', '{}'::jsonb),
        CASE
          WHEN jsonb_typeof(v_args -> 'p_channels') = 'array' THEN
            ARRAY(SELECT jsonb_array_elements_text(v_args -> 'p_channels'))
          ELSE '{}'::text[]
        END
      );
    WHEN 'admin_approve_marketing_campaign' THEN
      v_result := public.admin_approve_marketing_campaign(
        NULLIF(v_args ->> 'p_campaign_id', '')::uuid,
        v_args ->> 'p_reason'
      );
    WHEN 'admin_approve_marketing_item' THEN
      v_result := public.admin_approve_marketing_item(
        NULLIF(v_args ->> 'p_item_id', '')::uuid,
        NULLIF(v_args ->> 'p_scheduled_at', '')::timestamptz
      );
    WHEN 'admin_retry_marketing_delivery' THEN
      v_result := public.admin_retry_marketing_delivery(
        NULLIF(v_args ->> 'p_delivery_id', '')::uuid
      );
    WHEN 'admin_complete_manual_marketing_delivery' THEN
      v_result := public.admin_complete_manual_marketing_delivery(
        NULLIF(v_args ->> 'p_delivery_id', '')::uuid,
        v_args ->> 'p_outcome',
        v_args ->> 'p_note'
      );
    WHEN 'admin_reveal_manual_delivery_target' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_delivery_id','p_reason')
      ) THEN
        RAISE EXCEPTION 'Manual target reveal contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_reveal_manual_delivery_target(
        NULLIF(v_args ->> 'p_delivery_id', '')::uuid,
        v_args ->> 'p_reason'
      );
    WHEN 'admin_set_marketing_global_pause' THEN
      v_result := public.admin_set_marketing_global_pause(
        NULLIF(v_args ->> 'p_paused', '')::boolean,
        v_args ->> 'p_reason'
      );
    WHEN 'admin_sync_marketing_prospect_catalog' THEN
      v_result := public.admin_sync_marketing_prospect_catalog(
        COALESCE(NULLIF(v_args ->> 'p_limit', '')::integer, 500),
        NULLIF(v_args ->> 'p_after_source_objectid', '')::bigint,
        NULLIF(v_args ->> 'p_until_source_objectid', '')::bigint
      );
    WHEN 'admin_sync_marketing_client_consents' THEN
      v_result := public.admin_sync_marketing_client_consents(
        COALESCE(NULLIF(v_args ->> 'p_limit', '')::integer, 250),
        NULLIF(v_args ->> 'p_cursor', '')
      );
    WHEN 'admin_upsert_marketing_automation' THEN
      v_result := public.admin_upsert_marketing_automation(
        v_args -> 'p_payload',
        NULLIF(v_args ->> 'p_expected_updated_at', '')::timestamptz
      );
    ELSE
      RAISE EXCEPTION 'Marketing operation is not allowlisted'
        USING ERRCODE = '22023';
  END CASE;

  RETURN v_result;
END;
$$;

-- Revoke the default PUBLIC EXECUTE privilege from every new marketing helper.
DO $marketing_acl$
DECLARE v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname ~ '^(admin_.*marketing|marketing_|claim_.*marketing|complete_marketing|service_.*marketing|record_marketing|invoke_marketing)'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_function.signature);
  END LOOP;
END;
$marketing_acl$;

GRANT EXECUTE ON FUNCTION
  public.service_store_marketing_auth_challenge(text, uuid, text, text, uuid, uuid),
  public.service_get_marketing_auth_challenge(text),
  public.service_finalize_marketing_web_session(text, text, text, timestamptz),
  public.service_get_marketing_web_session(text, text, boolean),
  public.service_revoke_marketing_web_session(text),
  public.service_consume_marketing_auth_attempt(text),
  public.service_clear_marketing_auth_attempt(text),
  public.service_execute_marketing_admin_operation(text, text, text, jsonb),
  public.claim_due_marketing_items(integer, text, integer),
  public.claim_marketing_item(uuid, text, integer),
  public.complete_marketing_item(uuid, uuid, text, jsonb, text),
  public.service_dispatch_marketing_notification_item(uuid, uuid),
  public.service_materialize_marketing_deliveries(uuid, integer),
  public.claim_marketing_deliveries(integer, text, integer),
  public.service_send_marketing_in_app_delivery(uuid, uuid),
  public.complete_marketing_delivery(uuid, uuid, text, text, text, text, jsonb),
  public.record_marketing_provider_event(text, text, text, text, timestamptz, jsonb)
TO service_role;

-- The schedule stores only a call to the safe wrapper. Secrets and the
-- environment-specific Edge URL remain in Vault and are resolved at runtime.
DO $marketing_scheduler$
DECLARE
  v_job_id bigint;
  v_has_secrets boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'Marketing scheduler not installed: pg_cron, pg_net or Vault unavailable';
    RETURN;
  END IF;
  SELECT
    EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret'
      AND NULLIF(btrim(decrypted_secret), '') IS NOT NULL)
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'marketing_edge_url'
      AND btrim(decrypted_secret) ~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/marketing-orchestrator$')
  INTO v_has_secrets;
  IF NOT v_has_secrets THEN
    RAISE NOTICE 'Marketing scheduler not installed: required Vault entries are missing';
    RETURN;
  END IF;
  FOR v_job_id IN SELECT jobid FROM cron.job WHERE jobname = 'tok-marketing-orchestrator'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
  PERFORM cron.schedule(
    'tok-marketing-orchestrator',
    '* * * * *',
    'SELECT public.invoke_marketing_orchestrator_cron();'
  );
END;
$marketing_scheduler$;

COMMIT;
