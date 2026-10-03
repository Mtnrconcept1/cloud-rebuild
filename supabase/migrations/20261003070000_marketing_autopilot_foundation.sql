-- TOK Marketing Autopilot: additive, fail-closed database foundation.
--
-- This migration deliberately ships no external executor. Providers start
-- unconfigured, automation templates start disabled, and prepared actions are
-- immutable drafts requiring a later, separately reviewed approval/execution
-- path. Secrets are referenced by name only and are never accepted by the
-- browser-facing dispatcher.

BEGIN;

-- Campaign governance remains approval-first. The final CHECK permanently
-- fails closed for this release; enabling external effects requires a future
-- migration with its own release evidence.
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS objective_code text NOT NULL DEFAULT 'awareness'
    CHECK (objective_code IN (
      'awareness', 'acquisition', 'activation', 'retention', 'revenue',
      'anti_waste', 'operations', 'other'
    )),
  ADD COLUMN IF NOT EXISTS budget_minor bigint NOT NULL DEFAULT 0
    CHECK (budget_minor >= 0),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CHF'
    CHECK (currency ~ '^[A-Z]{3}$'),
  ADD COLUMN IF NOT EXISTS cost_center text
    CHECK (cost_center IS NULL OR char_length(btrim(cost_center)) BETWEEN 1 AND 80),
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS autonomy_level smallint NOT NULL DEFAULT 0
    CHECK (autonomy_level BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS attribution_model text NOT NULL DEFAULT 'last_touch'
    CHECK (attribution_model IN ('first_touch', 'last_touch', 'linear')),
  ADD COLUMN IF NOT EXISTS attribution_window_hours integer NOT NULL DEFAULT 720
    CHECK (attribution_window_hours BETWEEN 1 AND 8760),
  ADD COLUMN IF NOT EXISTS external_actions_enabled boolean NOT NULL DEFAULT false
    CHECK (external_actions_enabled IS FALSE);

CREATE TABLE IF NOT EXISTS public.marketing_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE
    CHECK (provider ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  display_name text NOT NULL
    CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 120),
  provider_kind text NOT NULL CHECK (provider_kind IN (
    'social_management', 'crm', 'search_analytics', 'advertising', 'design'
  )),
  -- A provider can expose several delivery/analytics capabilities; it is not
  -- a marketing channel and must never be modelled as one.
  channels text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (cardinality(channels) <= 16),
  capabilities text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (cardinality(capabilities) <= 32),
  control_state text NOT NULL DEFAULT 'unconfigured'
    CHECK (control_state IN ('unconfigured', 'paused')),
  observed_state text NOT NULL DEFAULT 'unconfigured'
    CHECK (observed_state IN (
      'unconfigured', 'invalid_configuration', 'ready', 'degraded'
    )),
  adapter_deployed boolean NOT NULL DEFAULT false,
  external_actions_enabled boolean NOT NULL DEFAULT false
    CHECK (external_actions_enabled IS FALSE),
  credential_ref text
    CHECK (credential_ref IS NULL OR credential_ref ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  external_account_ref text
    CHECK (external_account_ref IS NULL OR char_length(external_account_ref) <= 200),
  granted_scopes text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (cardinality(granted_scopes) <= 64),
  token_expires_at timestamptz,
  control_reason text NOT NULL DEFAULT 'Provider is not configured'
    CHECK (char_length(control_reason) BETWEEN 8 AND 500),
  last_probe_at timestamptz,
  last_probe_status text,
  last_error_code text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
    DEFAULT public.marketing_actor_user_id(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_provider_accounts_ready_guard CHECK (
    observed_state <> 'ready'
    OR (adapter_deployed IS TRUE AND last_probe_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.marketing_provider_probes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id uuid NOT NULL
    REFERENCES public.marketing_provider_accounts(id) ON DELETE RESTRICT,
  probe_key text NOT NULL UNIQUE CHECK (probe_key ~ '^[0-9a-f]{64}$'),
  probe_status text NOT NULL CHECK (probe_status IN (
    'invalid_configuration', 'ready', 'degraded', 'failed'
  )),
  adapter_version text NOT NULL DEFAULT '' CHECK (char_length(adapter_version) <= 80),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms BETWEEN 0 AND 300000),
  quota_remaining bigint CHECK (quota_remaining IS NULL OR quota_remaining >= 0),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_.-]{1,80}$'),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  probed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_provider_probes_account_time_idx
  ON public.marketing_provider_probes(provider_account_id, probed_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.marketing_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_bucket text NOT NULL
    CHECK (storage_bucket ~ '^[a-z0-9][a-z0-9._-]{1,62}$'),
  storage_path text NOT NULL
    CHECK (
      char_length(storage_path) BETWEEN 1 AND 1024
      AND storage_path !~ '(^|/)\.\.(/|$)'
      AND storage_path !~ '^/'
    ),
  content_hash text CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  mime_type text NOT NULL
    CHECK (mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
  byte_size bigint CHECK (byte_size IS NULL OR byte_size BETWEEN 0 AND 1073741824),
  width integer CHECK (width IS NULL OR width BETWEEN 1 AND 32768),
  height integer CHECK (height IS NULL OR height BETWEEN 1 AND 32768),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000),
  locale text CHECK (locale IS NULL OR locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'rejected', 'archived')),
  source_provider text
    CHECK (source_provider IS NULL OR source_provider ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  source_reference text
    CHECK (source_reference IS NULL OR char_length(source_reference) <= 500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
    DEFAULT public.marketing_actor_user_id(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path),
  UNIQUE (content_hash)
);

CREATE TABLE IF NOT EXISTS public.marketing_asset_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.marketing_assets(id) ON DELETE RESTRICT,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  rights_basis text NOT NULL CHECK (rights_basis IN (
    'owned', 'licensed', 'provider_terms', 'public_domain'
  )),
  owner_name text NOT NULL CHECK (char_length(btrim(owner_name)) BETWEEN 1 AND 200),
  license_identifier text
    CHECK (license_identifier IS NULL OR char_length(license_identifier) <= 240),
  source_reference text
    CHECK (source_reference IS NULL OR char_length(source_reference) <= 500),
  valid_from date,
  valid_until date,
  territories text[] NOT NULL DEFAULT ARRAY['CH']::text[]
    CHECK (cardinality(territories) BETWEEN 1 AND 64),
  evidence_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence_metadata) = 'object'),
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
    DEFAULT public.marketing_actor_user_id(),
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_asset_rights_dates_valid CHECK (
    valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from
  ),
  UNIQUE (asset_id, evidence_hash)
);

CREATE INDEX IF NOT EXISTS marketing_asset_rights_current_idx
  ON public.marketing_asset_rights(asset_id, approved_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.marketing_campaign_assets (
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.marketing_assets(id) ON DELETE RESTRICT,
  usage text NOT NULL CHECK (usage IN (
    'hero', 'social', 'email', 'advertisement', 'print', 'thumbnail', 'other'
  )),
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, asset_id, usage)
);

CREATE TABLE IF NOT EXISTS public.marketing_utm_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  utm_source text NOT NULL CHECK (utm_source ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  utm_medium text NOT NULL CHECK (utm_medium ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  utm_campaign text NOT NULL CHECK (utm_campaign ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  utm_content text CHECK (utm_content IS NULL OR utm_content ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  utm_term text CHECK (utm_term IS NULL OR utm_term ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
    DEFAULT public.marketing_actor_user_id(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (
    campaign_id, channel, utm_source, utm_medium, utm_campaign, utm_content, utm_term
  )
);

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS default_utm_plan_id uuid
    REFERENCES public.marketing_utm_plans(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.marketing_automation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE
    CHECK (template_key ~ '^tok\.[a-z0-9][a-z0-9_.-]{1,91}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  trigger_contract jsonb NOT NULL CHECK (jsonb_typeof(trigger_contract) = 'object'),
  condition_contract jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(condition_contract) = 'object'),
  action_contract jsonb NOT NULL CHECK (jsonb_typeof(action_contract) = 'object'),
  default_autonomy_level smallint NOT NULL DEFAULT 0
    CHECK (default_autonomy_level BETWEEN 0 AND 4),
  requires_approval boolean NOT NULL DEFAULT true CHECK (requires_approval IS TRUE),
  is_enabled boolean NOT NULL DEFAULT false,
  external_effects_enabled boolean NOT NULL DEFAULT false
    CHECK (external_effects_enabled IS FALSE),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_automations
  ADD COLUMN IF NOT EXISTS template_id uuid
    REFERENCES public.marketing_automation_templates(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1
    CHECK (schema_version > 0),
  ADD COLUMN IF NOT EXISTS autonomy_level smallint NOT NULL DEFAULT 0
    CHECK (autonomy_level BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'human_required'
    CHECK (approval_mode = 'human_required'),
  ADD COLUMN IF NOT EXISTS external_effects_enabled boolean NOT NULL DEFAULT false
    CHECK (external_effects_enabled IS FALSE),
  ADD COLUMN IF NOT EXISTS last_simulated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.marketing_automation_simulation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_key text NOT NULL UNIQUE CHECK (simulation_key ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  automation_id uuid NOT NULL
    REFERENCES public.marketing_automations(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL
    REFERENCES public.marketing_automation_templates(id) ON DELETE RESTRICT,
  definition_version integer NOT NULL CHECK (definition_version > 0),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  plan_hash text NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  action_type text NOT NULL CHECK (action_type IN (
    'prepare_campaign_draft', 'prepare_social_draft', 'prepare_ad_draft',
    'prepare_print_draft', 'prepare_in_app_draft',
    'prepare_accounting_insight_draft'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz,
  consumed_by_action_id uuid,
  CONSTRAINT marketing_automation_simulation_receipt_lifetime CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '15 minutes'
  ),
  CONSTRAINT marketing_automation_simulation_receipt_consumption CHECK (
    (consumed_at IS NULL AND consumed_by_action_id IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_by_action_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.marketing_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL
    REFERENCES public.marketing_automations(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL
    REFERENCES public.marketing_automation_templates(id) ON DELETE RESTRICT,
  simulation_receipt_id uuid NOT NULL UNIQUE
    REFERENCES public.marketing_automation_simulation_receipts(id) ON DELETE RESTRICT,
  client_request_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 8 AND 500),
  mode text NOT NULL DEFAULT 'draft' CHECK (mode = 'draft'),
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN (
    'prepared', 'cancelled'
  )),
  definition_version integer NOT NULL CHECK (definition_version > 0),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, client_request_id)
);

CREATE TABLE IF NOT EXISTS public.marketing_automation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.marketing_automation_runs(id) ON DELETE RESTRICT,
  action_type text NOT NULL CHECK (action_type IN (
    'prepare_campaign_draft', 'prepare_social_draft', 'prepare_ad_draft',
    'prepare_print_draft', 'prepare_in_app_draft',
    'prepare_accounting_insight_draft'
  )),
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  requires_approval boolean NOT NULL DEFAULT true CHECK (requires_approval IS TRUE),
  external_effects_enabled boolean NOT NULL DEFAULT false
    CHECK (external_effects_enabled IS FALSE),
  draft_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(draft_payload) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
    DEFAULT public.marketing_actor_user_id(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_automation_simulation_receipts
  ADD CONSTRAINT marketing_automation_simulation_receipts_action_fk
  FOREIGN KEY (consumed_by_action_id)
  REFERENCES public.marketing_automation_actions(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS marketing_automation_simulation_receipts_expiry_idx
  ON public.marketing_automation_simulation_receipts(expires_at, id)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_automation_runs_created_idx
  ON public.marketing_automation_runs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_automation_actions_run_idx
  ON public.marketing_automation_actions(run_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.marketing_attribution_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL CHECK (source_system ~ '^[a-z0-9][a-z0-9_.-]{1,79}$'),
  source_fact_id text NOT NULL CHECK (char_length(btrim(source_fact_id)) BETWEEN 1 AND 240),
  fact_type text NOT NULL CHECK (fact_type IN (
    'impression', 'open', 'click', 'lead', 'conversion', 'revenue', 'spend'
  )),
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.marketing_assets(id) ON DELETE SET NULL,
  utm_plan_id uuid REFERENCES public.marketing_utm_plans(id) ON DELETE SET NULL,
  marketing_event_id uuid REFERENCES public.marketing_events(id) ON DELETE SET NULL,
  provider_account_id uuid
    REFERENCES public.marketing_provider_accounts(id) ON DELETE SET NULL,
  subject_hash text CHECK (subject_hash IS NULL OR subject_hash ~ '^[0-9a-f]{64}$'),
  value_minor bigint CHECK (
    value_minor IS NULL OR value_minor >= 0
  ),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  observed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_attribution_value_required CHECK (
    fact_type NOT IN ('revenue', 'spend')
    OR (value_minor IS NOT NULL AND currency IS NOT NULL)
  ),
  UNIQUE (source_system, source_fact_id)
);

CREATE INDEX IF NOT EXISTS marketing_attribution_facts_campaign_time_idx
  ON public.marketing_attribution_facts(campaign_id, observed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_attribution_facts_type_time_idx
  ON public.marketing_attribution_facts(fact_type, observed_at DESC, id DESC);

-- Historical webhook values are normalized at read time. No destructive
-- backfill is required and new canonical values remain indistinguishable in
-- aggregate reporting.
CREATE OR REPLACE VIEW public.marketing_event_facts
WITH (security_invoker = true)
AS
SELECT
  e.id,
  e.campaign_id,
  e.item_id,
  e.delivery_id,
  CASE e.event_type
    WHEN 'sent' THEN 'delivery_sent'
    WHEN 'delivered' THEN 'delivery_delivered'
    WHEN 'opened' THEN 'delivery_opened'
    WHEN 'clicked' THEN 'delivery_clicked'
    WHEN 'converted' THEN 'delivery_converted'
    ELSE e.event_type
  END AS event_type,
  e.event_type AS source_event_type,
  e.provider,
  e.provider_event_id,
  e.occurred_at,
  e.value_chf,
  e.metadata,
  e.created_at
FROM public.marketing_events e;

-- The AI run ledger previously enabled RLS but did not force it or explicitly
-- remove direct service-role table access. All access remains through its
-- existing SECURITY DEFINER service functions.
ALTER TABLE public.marketing_ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ai_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_ai_runs
  FROM PUBLIC, anon, authenticated, service_role;

-- All new tables are deny-by-default. SECURITY DEFINER functions below are the
-- only browser-reachable path, through the dedicated service dispatcher.
ALTER TABLE public.marketing_provider_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_provider_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_provider_probes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_provider_probes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_asset_rights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_asset_rights FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaign_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaign_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_utm_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_utm_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automation_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automation_simulation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automation_simulation_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automation_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automation_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_attribution_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_attribution_facts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.marketing_provider_accounts,
  public.marketing_provider_probes,
  public.marketing_assets,
  public.marketing_asset_rights,
  public.marketing_campaign_assets,
  public.marketing_utm_plans,
  public.marketing_automation_templates,
  public.marketing_automation_simulation_receipts,
  public.marketing_automation_runs,
  public.marketing_automation_actions,
  public.marketing_attribution_facts,
  public.marketing_event_facts
FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.marketing_provider_accounts (
  provider, display_name, provider_kind, channels, capabilities,
  control_state, observed_state, adapter_deployed,
  external_actions_enabled, control_reason
)
VALUES
  ('metricool', 'Metricool', 'social_management',
    ARRAY['instagram','facebook','linkedin','tiktok','youtube'],
    ARRAY['draft','schedule','analytics'],
    'unconfigured', 'unconfigured', false, false, 'Provider adapter and credentials are not configured'),
  ('hubspot', 'HubSpot', 'crm', ARRAY[]::text[],
    ARRAY['contacts_read','contacts_write','webhooks'],
    'unconfigured', 'unconfigured', false, false, 'Provider adapter and credentials are not configured'),
  ('google-search-console', 'Google Search Console', 'search_analytics', ARRAY['website'],
    ARRAY['query_analytics','page_analytics'],
    'unconfigured', 'unconfigured', false, false, 'Provider adapter and credentials are not configured'),
  ('meta-ads', 'Meta Ads', 'advertising', ARRAY['instagram','facebook'],
    ARRAY['campaign_draft','spend_read','conversion_read'],
    'unconfigured', 'unconfigured', false, false, 'Provider adapter and credentials are not configured'),
  ('google-ads', 'Google Ads', 'advertising', ARRAY['website','youtube'],
    ARRAY['campaign_draft','spend_read','conversion_read'],
    'unconfigured', 'unconfigured', false, false, 'Provider adapter and credentials are not configured'),
  ('tiktok-ads', 'TikTok Ads', 'advertising', ARRAY['tiktok'],
    ARRAY['campaign_draft','spend_read','conversion_read'],
    'unconfigured', 'unconfigured', false, false, 'Provider adapter and credentials are not configured'),
  ('canva', 'Canva', 'design', ARRAY[]::text[],
    ARRAY['asset_import','design_reference'],
    'unconfigured', 'unconfigured', false, false, 'Provider adapter and credentials are not configured')
ON CONFLICT (provider) DO NOTHING;

INSERT INTO public.marketing_automation_templates (
  template_key, name, description, trigger_contract, condition_contract,
  action_contract, default_autonomy_level, requires_approval,
  is_enabled, external_effects_enabled
)
VALUES
  ('tok.zero_attente', 'Zéro Attente', 'Prépare un brouillon in-app à partir de signaux opérationnels.',
    '{"event_type":"wait_time_signal","version":1}'::jsonb, '{"draft_only":true}'::jsonb,
    '{"action_type":"prepare_in_app_draft","external_effect":false}'::jsonb, 0, true, false, false),
  ('tok.ventes_flash', 'Ventes Flash', 'Prépare une campagne promotionnelle sans la publier.',
    '{"event_type":"flash_sale_candidate","version":1}'::jsonb, '{"draft_only":true}'::jsonb,
    '{"action_type":"prepare_campaign_draft","external_effect":false}'::jsonb, 0, true, false, false),
  ('tok.anti_gaspillage', 'Anti-Gaspillage', 'Prépare une campagne anti-gaspillage soumise à approbation.',
    '{"event_type":"surplus_signal","version":1}'::jsonb, '{"draft_only":true}'::jsonb,
    '{"action_type":"prepare_campaign_draft","external_effect":false}'::jsonb, 0, true, false, false),
  ('tok.print_studio', 'Print Studio', 'Prépare un brief print sans commander ni publier.',
    '{"event_type":"print_brief_requested","version":1}'::jsonb, '{"draft_only":true}'::jsonb,
    '{"action_type":"prepare_print_draft","external_effect":false}'::jsonb, 0, true, false, false),
  ('tok.plan_salle', 'Plan de Salle', 'Prépare un brouillon de communication lié au plan de salle.',
    '{"event_type":"floor_plan_signal","version":1}'::jsonb, '{"draft_only":true}'::jsonb,
    '{"action_type":"prepare_campaign_draft","external_effect":false}'::jsonb, 0, true, false, false),
  ('tok.tok_social', 'TOK Social', 'Prépare un brouillon social sans publication externe.',
    '{"event_type":"social_content_requested","version":1}'::jsonb, '{"draft_only":true}'::jsonb,
    '{"action_type":"prepare_social_draft","external_effect":false}'::jsonb, 0, true, false, false),
  ('tok.publicites_ia', 'Publicités IA', 'Prépare un brouillon publicitaire avec budget non exécutable.',
    '{"event_type":"ad_draft_requested","version":1}'::jsonb, '{"draft_only":true}'::jsonb,
    '{"action_type":"prepare_ad_draft","external_effect":false}'::jsonb, 0, true, false, false),
  ('tok.comptabilite_ia', 'Comptabilité IA', 'Prépare une suggestion fondée sur des insights comptables agrégés.',
    '{"event_type":"accounting_insight_available","version":1}'::jsonb, '{"draft_only":true,"aggregates_only":true}'::jsonb,
    '{"action_type":"prepare_accounting_insight_draft","external_effect":false}'::jsonb, 0, true, false, false)
ON CONFLICT (template_key) DO UPDATE SET
  is_enabled = false,
  external_effects_enabled = false,
  requires_approval = true,
  updated_at = now();

INSERT INTO public.marketing_automations (
  automation_key, name, description, trigger_type, channel, status,
  is_system, conditions, actions, template_id, schema_version,
  autonomy_level, approval_mode, external_effects_enabled
)
SELECT
  t.template_key,
  t.name,
  t.description,
  t.trigger_contract ->> 'event_type',
  NULL,
  'disabled',
  true,
  jsonb_build_object('global_pause', true, 'draft_only', true),
  jsonb_build_array(t.action_contract),
  t.id,
  t.schema_version,
  0,
  'human_required',
  false
FROM public.marketing_automation_templates t
WHERE t.template_key IN (
  'tok.zero_attente', 'tok.ventes_flash', 'tok.anti_gaspillage',
  'tok.print_studio', 'tok.plan_salle', 'tok.tok_social',
  'tok.publicites_ia', 'tok.comptabilite_ia'
)
ON CONFLICT (automation_key) DO UPDATE SET
  status = 'disabled',
  template_id = EXCLUDED.template_id,
  schema_version = EXCLUDED.schema_version,
  autonomy_level = 0,
  approval_mode = 'human_required',
  external_effects_enabled = false,
  conditions = EXCLUDED.conditions,
  actions = EXCLUDED.actions;

-- Redact the additional operational and rights fields before generic table
-- audit triggers persist a change summary. The dedicated dispatcher below
-- records no caller payload at all.
CREATE OR REPLACE FUNCTION public.marketing_redact_audit_record(p_record jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_record, '{}'::jsonb)
    - 'email' - 'email_normalized' - 'phone' - 'phone_normalized' - 'target_fingerprint'
    - 'secret_ref' - 'credential_ref' - 'external_account_ref' - 'granted_scopes'
    - 'lease_token' - 'provider_message_id' - 'metadata' - 'details'
    - 'last_error' - 'last_error_code' - 'content' - 'targeting' - 'public_configuration'
    - 'result_summary' - 'storage_path' - 'source_reference' - 'owner_name'
    - 'body' - 'context' - 'notes' - 'verification_note' - 'result_note'
    - 'suggested_angle' - 'license_identifier' - 'evidence_metadata'
    - 'draft_payload' - 'input_hash' - 'plan_hash' - 'simulation_key'
    - 'simulation_receipt_id' - 'reason';
$$;

CREATE OR REPLACE FUNCTION public.marketing_autopilot_payload_is_safe(p_payload jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    jsonb_typeof(COALESCE(p_payload, '{}'::jsonb)) = 'object'
    AND octet_length(COALESCE(p_payload, '{}'::jsonb)::text) <= 32768
    AND COALESCE(p_payload, '{}'::jsonb)::text !~* '"(password|secret|token|authorization|cookie|api[_-]?key|email|phone)"[[:space:]]*:';
$$;

CREATE OR REPLACE FUNCTION public.marketing_autopilot_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_autopilot_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_asset_require_current_rights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'approved' AND NOT EXISTS (
    SELECT 1
    FROM public.marketing_asset_rights r
    WHERE r.asset_id = NEW.id
      AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
      AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Approved marketing asset requires current rights evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketing_provider_accounts_touch ON public.marketing_provider_accounts;
CREATE TRIGGER marketing_provider_accounts_touch
BEFORE UPDATE ON public.marketing_provider_accounts
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();

DROP TRIGGER IF EXISTS marketing_assets_touch ON public.marketing_assets;
CREATE TRIGGER marketing_assets_touch
BEFORE UPDATE ON public.marketing_assets
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();

DROP TRIGGER IF EXISTS marketing_utm_plans_touch ON public.marketing_utm_plans;
CREATE TRIGGER marketing_utm_plans_touch
BEFORE UPDATE ON public.marketing_utm_plans
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();

DROP TRIGGER IF EXISTS marketing_automation_templates_touch ON public.marketing_automation_templates;
CREATE TRIGGER marketing_automation_templates_touch
BEFORE UPDATE ON public.marketing_automation_templates
FOR EACH ROW EXECUTE FUNCTION public.marketing_autopilot_touch_updated_at();

DROP TRIGGER IF EXISTS marketing_asset_current_rights_guard ON public.marketing_assets;
CREATE CONSTRAINT TRIGGER marketing_asset_current_rights_guard
AFTER INSERT OR UPDATE OF status ON public.marketing_assets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.marketing_asset_require_current_rights();

DROP TRIGGER IF EXISTS marketing_provider_probes_append_only ON public.marketing_provider_probes;
CREATE TRIGGER marketing_provider_probes_append_only
BEFORE UPDATE OR DELETE ON public.marketing_provider_probes
FOR EACH ROW EXECUTE FUNCTION public.marketing_autopilot_append_only();

DROP TRIGGER IF EXISTS marketing_asset_rights_append_only ON public.marketing_asset_rights;
CREATE TRIGGER marketing_asset_rights_append_only
BEFORE UPDATE OR DELETE ON public.marketing_asset_rights
FOR EACH ROW EXECUTE FUNCTION public.marketing_autopilot_append_only();

DROP TRIGGER IF EXISTS marketing_automation_actions_append_only ON public.marketing_automation_actions;
CREATE TRIGGER marketing_automation_actions_append_only
BEFORE UPDATE OR DELETE ON public.marketing_automation_actions
FOR EACH ROW EXECUTE FUNCTION public.marketing_autopilot_append_only();

DROP TRIGGER IF EXISTS marketing_attribution_facts_append_only ON public.marketing_attribution_facts;
CREATE TRIGGER marketing_attribution_facts_append_only
BEFORE UPDATE OR DELETE ON public.marketing_attribution_facts
FOR EACH ROW EXECUTE FUNCTION public.marketing_autopilot_append_only();

DO $marketing_autopilot_audit_triggers$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'marketing_provider_accounts',
    'marketing_assets',
    'marketing_asset_rights',
    'marketing_automation_templates',
    'marketing_automation_runs',
    'marketing_automation_actions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.marketing_write_audit()',
      v_table,
      v_table
    );
  END LOOP;
END;
$marketing_autopilot_audit_triggers$;

CREATE OR REPLACE FUNCTION public.admin_simulate_marketing_automation(
  p_automation_key text,
  p_input jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template public.marketing_automation_templates%ROWTYPE;
  v_automation public.marketing_automations%ROWTYPE;
  v_input jsonb := COALESCE(p_input, '{}'::jsonb);
  v_actor_user_id uuid := public.marketing_actor_user_id();
  v_input_hash text;
  v_simulation_key text;
  v_plan_hash text;
  v_created_at timestamptz := clock_timestamp();
  v_expires_at timestamptz;
BEGIN
  PERFORM public.marketing_require_admin();
  IF public.marketing_autopilot_payload_is_safe(v_input) IS NOT TRUE THEN
    RAISE EXCEPTION 'Automation input must be a small object without credentials or contact data'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_automation
  FROM public.marketing_automations a
  WHERE a.automation_key = NULLIF(btrim(p_automation_key), '');
  IF NOT FOUND OR v_automation.template_id IS NULL THEN
    RAISE EXCEPTION 'Unknown TOK automation template' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO STRICT v_template
  FROM public.marketing_automation_templates t
  WHERE t.id = v_automation.template_id;

  v_input_hash := encode(
    extensions.digest(v_input::text, 'sha256'),
    'hex'
  );
  v_plan_hash := encode(
    extensions.digest(
      concat_ws(':', v_template.template_key, v_template.schema_version::text, v_input_hash),
      'sha256'
    ),
    'hex'
  );
  v_simulation_key := encode(
    extensions.digest(
      concat_ws(
        ':', gen_random_uuid()::text, v_actor_user_id::text,
        v_automation.id::text, v_created_at::text
      ),
      'sha256'
    ),
    'hex'
  );
  v_expires_at := v_created_at + interval '15 minutes';

  INSERT INTO public.marketing_automation_simulation_receipts (
    simulation_key, actor_user_id, automation_id, template_id,
    definition_version, input_hash, plan_hash, action_type,
    created_at, expires_at
  ) VALUES (
    v_simulation_key, v_actor_user_id, v_automation.id, v_template.id,
    v_template.schema_version, v_input_hash, v_plan_hash,
    v_template.action_contract ->> 'action_type', v_created_at, v_expires_at
  );

  RETURN jsonb_build_object(
    'simulation_key', v_simulation_key,
    'plan_hash', v_plan_hash,
    'expires_at', v_expires_at,
    'input_hash', v_input_hash,
    'automation_key', v_template.template_key,
    'definition_version', v_template.schema_version,
    'template_enabled', v_template.is_enabled,
    'automation_status', v_automation.status,
    'action_type', v_template.action_contract ->> 'action_type',
    'action_status', 'draft',
    'requires_approval', true,
    'external_effect', false,
    'deterministic', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_prepare_marketing_automation_action(
  p_automation_key text,
  p_input jsonb,
  p_simulation_key text,
  p_client_request_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template public.marketing_automation_templates%ROWTYPE;
  v_automation public.marketing_automations%ROWTYPE;
  v_receipt public.marketing_automation_simulation_receipts%ROWTYPE;
  v_run public.marketing_automation_runs%ROWTYPE;
  v_action public.marketing_automation_actions%ROWTYPE;
  v_input jsonb := COALESCE(p_input, '{}'::jsonb);
  v_actor_user_id uuid := public.marketing_actor_user_id();
  v_input_hash text;
  v_run_key text;
  v_action_key text;
  v_duplicate boolean := false;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Client request id is required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_simulation_key ~ '^[0-9a-f]{64}$', false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Recent matching simulation receipt is required'
      USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Automation draft reason must contain between 8 and 500 characters'
      USING ERRCODE = '22023';
  END IF;
  IF public.marketing_autopilot_payload_is_safe(v_input) IS NOT TRUE THEN
    RAISE EXCEPTION 'Automation input must be a small object without credentials or contact data'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_automation
  FROM public.marketing_automations a
  WHERE a.automation_key = NULLIF(btrim(p_automation_key), '');
  IF NOT FOUND OR v_automation.template_id IS NULL THEN
    RAISE EXCEPTION 'Unknown TOK automation template' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO STRICT v_template
  FROM public.marketing_automation_templates t
  WHERE t.id = v_automation.template_id;

  -- A disabled template may be simulated and may prepare a reviewable draft,
  -- but it can never execute. No provider or calendar function is called.
  IF v_template.external_effects_enabled IS TRUE
     OR v_automation.external_effects_enabled IS TRUE
     OR v_automation.approval_mode <> 'human_required' THEN
    RAISE EXCEPTION 'Automation is not in fail-closed draft mode' USING ERRCODE = '55000';
  END IF;

  v_input_hash := encode(extensions.digest(v_input::text, 'sha256'), 'hex');

  SELECT * INTO v_receipt
  FROM public.marketing_automation_simulation_receipts r
  WHERE r.simulation_key = p_simulation_key
  FOR UPDATE;

  IF NOT FOUND
     OR v_receipt.actor_user_id IS DISTINCT FROM v_actor_user_id
     OR v_receipt.automation_id <> v_automation.id
     OR v_receipt.template_id <> v_template.id
     OR v_receipt.definition_version <> v_template.schema_version
     OR v_receipt.input_hash <> v_input_hash
     OR v_receipt.action_type <> (v_template.action_contract ->> 'action_type')
     OR (v_receipt.consumed_at IS NULL AND v_receipt.expires_at <= clock_timestamp()) THEN
    RAISE EXCEPTION 'Recent matching simulation receipt is required'
      USING ERRCODE = '42501';
  END IF;

  v_run_key := encode(
    extensions.digest(
      concat_ws(
        ':', v_automation.id::text, v_template.schema_version::text,
        p_client_request_id::text, v_input_hash, v_receipt.id::text
      ),
      'sha256'
    ),
    'hex'
  );
  v_action_key := encode(
    extensions.digest(v_run_key || ':' || (v_template.action_contract ->> 'action_type'), 'sha256'),
    'hex'
  );

  SELECT * INTO v_run
  FROM public.marketing_automation_runs r
  WHERE r.simulation_receipt_id = v_receipt.id;

  IF FOUND THEN
    IF v_run.client_request_id <> p_client_request_id THEN
      RAISE EXCEPTION 'Simulation receipt was already consumed by another request'
        USING ERRCODE = '42501';
    END IF;
    IF v_run.input_hash <> v_input_hash THEN
      RAISE EXCEPTION 'Client request id was already used with different input'
        USING ERRCODE = '22023';
    END IF;
    IF v_run.reason <> btrim(p_reason) THEN
      RAISE EXCEPTION 'Client request id was already used with a different reason'
        USING ERRCODE = '22023';
    END IF;
    v_duplicate := true;
  ELSE
    INSERT INTO public.marketing_automation_runs (
      automation_id, template_id, simulation_receipt_id,
      client_request_id, idempotency_key,
      input_hash, reason, mode, status, definition_version, actor_user_id
    ) VALUES (
      v_automation.id, v_template.id, v_receipt.id,
      p_client_request_id, v_run_key,
      v_input_hash, btrim(p_reason), 'draft', 'prepared', v_template.schema_version,
      public.marketing_actor_user_id()
    )
    ON CONFLICT (automation_id, client_request_id) DO NOTHING
    RETURNING * INTO v_run;

    IF NOT FOUND THEN
      SELECT * INTO STRICT v_run
      FROM public.marketing_automation_runs r
      WHERE r.automation_id = v_automation.id
        AND r.client_request_id = p_client_request_id;
      IF v_run.simulation_receipt_id <> v_receipt.id THEN
        RAISE EXCEPTION 'Client request id was already used with another simulation receipt'
          USING ERRCODE = '40001';
      END IF;
      IF v_run.input_hash <> v_input_hash THEN
        RAISE EXCEPTION 'Client request id was concurrently used with different input'
          USING ERRCODE = '40001';
      END IF;
      IF v_run.reason <> btrim(p_reason) THEN
        RAISE EXCEPTION 'Client request id was concurrently used with a different reason'
          USING ERRCODE = '40001';
      END IF;
      v_duplicate := true;
    END IF;
  END IF;

  SELECT * INTO v_action
  FROM public.marketing_automation_actions a
  WHERE a.run_id = v_run.id;

  IF NOT FOUND THEN
    INSERT INTO public.marketing_automation_actions (
      run_id, action_type, idempotency_key, status, requires_approval,
      external_effects_enabled, draft_payload, created_by
    ) VALUES (
      v_run.id,
      v_template.action_contract ->> 'action_type',
      v_action_key,
      'draft',
      true,
      false,
      jsonb_build_object(
        'automation_key', v_template.template_key,
        'definition_version', v_template.schema_version,
        'input_hash', v_input_hash,
        'approval_required', true,
        'external_effect', false
      ),
      public.marketing_actor_user_id()
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING * INTO v_action;

    IF NOT FOUND THEN
      SELECT * INTO STRICT v_action
      FROM public.marketing_automation_actions a
      WHERE a.idempotency_key = v_action_key;
      v_duplicate := true;
    END IF;
  ELSE
    v_duplicate := true;
  END IF;

  IF v_receipt.consumed_at IS NULL THEN
    UPDATE public.marketing_automation_simulation_receipts r
    SET consumed_at = clock_timestamp(),
        consumed_by_action_id = v_action.id
    WHERE r.id = v_receipt.id
      AND r.consumed_at IS NULL;
  ELSIF v_receipt.consumed_by_action_id IS DISTINCT FROM v_action.id THEN
    RAISE EXCEPTION 'Simulation receipt was already consumed by another action'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'id', v_action.id,
    'run_id', v_run.id,
    'simulation_key', p_simulation_key,
    'automation_key', v_template.template_key,
    'status', v_action.status,
    'requires_approval', v_action.requires_approval,
    'external_effect', false,
    'duplicate', v_duplicate,
    'idempotency_key', v_action.idempotency_key,
    'created_at', v_action.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_asset(
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_rights jsonb := COALESCE(p_payload -> 'rights', '{}'::jsonb);
  v_asset public.marketing_assets%ROWTYPE;
  v_asset_id uuid := NULLIF(p_payload ->> 'id', '')::uuid;
  v_requested_status text := NULLIF(p_payload ->> 'status', '');
  v_evidence_hash text;
BEGIN
  PERFORM public.marketing_require_admin();
  IF jsonb_typeof(v_payload) <> 'object'
     OR octet_length(v_payload::text) > 65536 THEN
    RAISE EXCEPTION 'Asset payload must be a small object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_payload) AS field(k)
    WHERE field.k NOT IN (
      'id', 'storage_bucket', 'storage_path', 'content_hash', 'mime_type',
      'byte_size', 'width', 'height', 'duration_ms', 'locale', 'status',
      'source_provider', 'source_reference', 'metadata', 'rights'
    )
  ) THEN
    RAISE EXCEPTION 'Asset payload contains unsupported fields' USING ERRCODE = '22023';
  END IF;
  IF v_requested_status IS NOT NULL
     AND v_requested_status NOT IN ('draft', 'approved', 'rejected', 'archived') THEN
    RAISE EXCEPTION 'Unsupported asset status' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(v_payload -> 'metadata', '{}'::jsonb)) <> 'object'
     OR octet_length(COALESCE(v_payload -> 'metadata', '{}'::jsonb)::text) > 16384
     OR public.marketing_autopilot_payload_is_safe(
       COALESCE(v_payload -> 'metadata', '{}'::jsonb)
     ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Asset metadata is invalid or contains restricted data'
      USING ERRCODE = '22023';
  END IF;
  IF v_payload ? 'rights' AND (
    jsonb_typeof(v_rights) <> 'object'
    OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_rights) AS field(k)
      WHERE field.k NOT IN (
        'rights_basis', 'owner_name', 'license_identifier', 'source_reference',
        'valid_from', 'valid_until', 'territories', 'evidence_metadata'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Asset rights payload contains unsupported fields'
      USING ERRCODE = '22023';
  END IF;

  IF v_asset_id IS NULL THEN
    IF NULLIF(btrim(v_payload ->> 'storage_bucket'), '') IS NULL
       OR NULLIF(btrim(v_payload ->> 'storage_path'), '') IS NULL
       OR NULLIF(btrim(v_payload ->> 'mime_type'), '') IS NULL THEN
      RAISE EXCEPTION 'Asset bucket, path and MIME type are required'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.marketing_assets (
      storage_bucket, storage_path, content_hash, mime_type, byte_size,
      width, height, duration_ms, locale, status, source_provider,
      source_reference, metadata, created_by, updated_by
    ) VALUES (
      btrim(v_payload ->> 'storage_bucket'),
      btrim(v_payload ->> 'storage_path'),
      NULLIF(lower(btrim(v_payload ->> 'content_hash')), ''),
      lower(btrim(v_payload ->> 'mime_type')),
      NULLIF(v_payload ->> 'byte_size', '')::bigint,
      NULLIF(v_payload ->> 'width', '')::integer,
      NULLIF(v_payload ->> 'height', '')::integer,
      NULLIF(v_payload ->> 'duration_ms', '')::integer,
      NULLIF(v_payload ->> 'locale', ''),
      'draft',
      NULLIF(lower(btrim(v_payload ->> 'source_provider')), ''),
      NULLIF(btrim(v_payload ->> 'source_reference'), ''),
      COALESCE(v_payload -> 'metadata', '{}'::jsonb),
      public.marketing_actor_user_id(),
      public.marketing_actor_user_id()
    )
    RETURNING * INTO v_asset;
    v_requested_status := COALESCE(v_requested_status, 'draft');
  ELSE
    SELECT * INTO v_asset
    FROM public.marketing_assets a
    WHERE a.id = v_asset_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Marketing asset not found' USING ERRCODE = 'P0002';
    END IF;
    IF p_expected_updated_at IS NULL OR v_asset.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'Marketing asset changed since it was loaded'
        USING ERRCODE = '40001';
    END IF;
    v_requested_status := COALESCE(v_requested_status, v_asset.status);

    UPDATE public.marketing_assets a SET
      storage_bucket = CASE WHEN v_payload ? 'storage_bucket'
        THEN btrim(v_payload ->> 'storage_bucket') ELSE a.storage_bucket END,
      storage_path = CASE WHEN v_payload ? 'storage_path'
        THEN btrim(v_payload ->> 'storage_path') ELSE a.storage_path END,
      content_hash = CASE WHEN v_payload ? 'content_hash'
        THEN NULLIF(lower(btrim(v_payload ->> 'content_hash')), '') ELSE a.content_hash END,
      mime_type = CASE WHEN v_payload ? 'mime_type'
        THEN lower(btrim(v_payload ->> 'mime_type')) ELSE a.mime_type END,
      byte_size = CASE WHEN v_payload ? 'byte_size'
        THEN NULLIF(v_payload ->> 'byte_size', '')::bigint ELSE a.byte_size END,
      width = CASE WHEN v_payload ? 'width'
        THEN NULLIF(v_payload ->> 'width', '')::integer ELSE a.width END,
      height = CASE WHEN v_payload ? 'height'
        THEN NULLIF(v_payload ->> 'height', '')::integer ELSE a.height END,
      duration_ms = CASE WHEN v_payload ? 'duration_ms'
        THEN NULLIF(v_payload ->> 'duration_ms', '')::integer ELSE a.duration_ms END,
      locale = CASE WHEN v_payload ? 'locale'
        THEN NULLIF(v_payload ->> 'locale', '') ELSE a.locale END,
      source_provider = CASE WHEN v_payload ? 'source_provider'
        THEN NULLIF(lower(btrim(v_payload ->> 'source_provider')), '') ELSE a.source_provider END,
      source_reference = CASE WHEN v_payload ? 'source_reference'
        THEN NULLIF(btrim(v_payload ->> 'source_reference'), '') ELSE a.source_reference END,
      metadata = CASE WHEN v_payload ? 'metadata'
        THEN v_payload -> 'metadata' ELSE a.metadata END,
      updated_by = public.marketing_actor_user_id()
    WHERE a.id = v_asset.id
    RETURNING * INTO v_asset;
  END IF;

  IF v_payload ? 'rights' THEN
    IF COALESCE(v_rights ->> 'rights_basis', '') NOT IN (
      'owned', 'licensed', 'provider_terms', 'public_domain'
    ) OR NULLIF(btrim(v_rights ->> 'owner_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Asset rights basis and owner are required'
        USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(v_rights -> 'evidence_metadata', '{}'::jsonb)) <> 'object'
       OR public.marketing_autopilot_payload_is_safe(
         COALESCE(v_rights -> 'evidence_metadata', '{}'::jsonb)
       ) IS NOT TRUE THEN
      RAISE EXCEPTION 'Asset rights evidence contains restricted data'
        USING ERRCODE = '22023';
    END IF;

    v_evidence_hash := encode(
      extensions.digest(
        jsonb_build_object(
          'rights_basis', v_rights ->> 'rights_basis',
          'owner_name', btrim(v_rights ->> 'owner_name'),
          'license_identifier', NULLIF(btrim(v_rights ->> 'license_identifier'), ''),
          'source_reference', NULLIF(btrim(v_rights ->> 'source_reference'), ''),
          'valid_from', NULLIF(v_rights ->> 'valid_from', ''),
          'valid_until', NULLIF(v_rights ->> 'valid_until', ''),
          'territories', COALESCE(v_rights -> 'territories', '["CH"]'::jsonb)
        )::text,
        'sha256'
      ),
      'hex'
    );

    INSERT INTO public.marketing_asset_rights (
      asset_id, evidence_hash, rights_basis, owner_name, license_identifier,
      source_reference, valid_from, valid_until, territories,
      evidence_metadata, approved_by
    ) VALUES (
      v_asset.id,
      v_evidence_hash,
      v_rights ->> 'rights_basis',
      btrim(v_rights ->> 'owner_name'),
      NULLIF(btrim(v_rights ->> 'license_identifier'), ''),
      NULLIF(btrim(v_rights ->> 'source_reference'), ''),
      NULLIF(v_rights ->> 'valid_from', '')::date,
      NULLIF(v_rights ->> 'valid_until', '')::date,
      CASE
        WHEN jsonb_typeof(v_rights -> 'territories') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_rights -> 'territories'))
        ELSE ARRAY['CH']::text[]
      END,
      COALESCE(v_rights -> 'evidence_metadata', '{}'::jsonb),
      public.marketing_actor_user_id()
    )
    ON CONFLICT (asset_id, evidence_hash) DO NOTHING;
  END IF;

  UPDATE public.marketing_assets a
  SET status = v_requested_status,
      updated_by = public.marketing_actor_user_id()
  WHERE a.id = v_asset.id
    AND a.status IS DISTINCT FROM v_requested_status
  RETURNING * INTO v_asset;

  IF NOT FOUND THEN
    SELECT * INTO STRICT v_asset FROM public.marketing_assets a WHERE a.id = v_asset.id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_asset.id,
    'status', v_asset.status,
    'rights_recorded', EXISTS (
      SELECT 1 FROM public.marketing_asset_rights r WHERE r.asset_id = v_asset.id
    ),
    'version', v_asset.version,
    'updated_at', v_asset.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_marketing_provider_control(
  p_provider text,
  p_control_state text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.marketing_provider_accounts%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_control_state NOT IN ('unconfigured', 'paused') THEN
    RAISE EXCEPTION 'Provider control is limited to unconfigured or paused'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Provider control reason must contain between 8 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.marketing_provider_accounts a SET
    control_state = p_control_state,
    control_reason = btrim(p_reason),
    external_actions_enabled = false,
    updated_by = public.marketing_actor_user_id()
  WHERE a.provider = NULLIF(lower(btrim(p_provider)), '')
  RETURNING * INTO v_account;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketing provider account not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', v_account.id,
    'provider', v_account.provider,
    'control_state', v_account.control_state,
    'observed_state', v_account.observed_state,
    'adapter_deployed', v_account.adapter_deployed,
    'external_actions_enabled', false,
    'version', v_account.version,
    'updated_at', v_account.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_marketing_autopilot_dashboard(
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_global_paused boolean := true;
  v_global_reason text;
  v_providers jsonb := '[]'::jsonb;
  v_automations jsonb := '[]'::jsonb;
  v_assets jsonb := '{}'::jsonb;
  v_sent bigint;
  v_delivered bigint;
  v_clicked bigint;
  v_event_conversions bigint;
  v_event_count bigint := 0;
  v_leads bigint;
  v_business_conversions bigint;
  v_spend_minor bigint;
  v_revenue_minor bigint;
  v_currency text;
  v_currency_count integer := 0;
  v_unavailable_reasons jsonb := '[]'::jsonb;
  v_completeness text;
  v_analytics jsonb;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to
     OR p_to - p_from > interval '366 days' THEN
    RAISE EXCEPTION 'Dashboard interval must be positive and at most 366 days'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE((a.conditions ->> 'global_pause')::boolean, true),
    a.conditions ->> 'reason'
  INTO v_global_paused, v_global_reason
  FROM public.marketing_automations a
  WHERE a.automation_key = 'global_runtime';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'provider', p.provider,
    'display_name', p.display_name,
    'provider_kind', p.provider_kind,
    'channels', to_jsonb(p.channels),
    'capabilities', to_jsonb(p.capabilities),
    'granted_scopes', to_jsonb(p.granted_scopes),
    'control_state', p.control_state,
    'observed_state', p.observed_state,
    'adapter_deployed', p.adapter_deployed,
    'probe_ready', (
      p.control_state <> 'paused'
      AND p.observed_state = 'ready'
      AND p.adapter_deployed IS TRUE
      AND p.last_probe_at >= now() - interval '24 hours'
    ),
    'ready', false,
    'external_actions_enabled', false,
    'last_probe_at', p.last_probe_at,
    'last_probe_status', p.last_probe_status,
    'last_error_code', p.last_error_code,
    'control_reason', p.control_reason,
    'updated_at', p.updated_at
  ) ORDER BY p.provider), '[]'::jsonb)
  INTO v_providers
  FROM public.marketing_provider_accounts p;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'automation_key', t.template_key,
    'template_key', t.template_key,
    'name', t.name,
    'schema_version', t.schema_version,
    'template_enabled', t.is_enabled,
    'automation_status', COALESCE(a.status, 'disabled'),
    'status', COALESCE(a.status, 'disabled'),
    'autonomy_level', COALESCE(a.autonomy_level, 0),
    'approval_mode', COALESCE(a.approval_mode, 'human_required'),
    'requires_approval', true,
    'external_effects_enabled', false,
    'action_type', t.action_contract ->> 'action_type'
  ) ORDER BY t.template_key), '[]'::jsonb)
  INTO v_automations
  FROM public.marketing_automation_templates t
  LEFT JOIN public.marketing_automations a ON a.template_id = t.id
  WHERE t.template_key LIKE 'tok.%';

  SELECT jsonb_build_object(
    'total', count(*),
    'draft', count(*) FILTER (WHERE a.status = 'draft'),
    'approved', count(*) FILTER (WHERE a.status = 'approved'),
    'rejected', count(*) FILTER (WHERE a.status = 'rejected'),
    'archived', count(*) FILTER (WHERE a.status = 'archived'),
    'with_current_rights', count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.marketing_asset_rights r
      WHERE r.asset_id = a.id
        AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
        AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
    ))
  )
  INTO v_assets
  FROM public.marketing_assets a;

  SELECT
    count(*),
    NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_sent'), 0),
    NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_delivered'), 0),
    NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_clicked'), 0),
    NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_converted'), 0)
  INTO v_event_count, v_sent, v_delivered, v_clicked, v_event_conversions
  FROM public.marketing_event_facts e
  WHERE e.occurred_at >= p_from AND e.occurred_at < p_to;

  SELECT
    NULLIF(count(*) FILTER (WHERE f.fact_type = 'lead'), 0),
    NULLIF(count(*) FILTER (WHERE f.fact_type = 'conversion'), 0),
    sum(f.value_minor) FILTER (WHERE f.fact_type = 'spend'),
    sum(f.value_minor) FILTER (WHERE f.fact_type = 'revenue'),
    count(DISTINCT f.currency) FILTER (WHERE f.fact_type IN ('spend', 'revenue')),
    min(f.currency) FILTER (WHERE f.fact_type IN ('spend', 'revenue'))
  INTO
    v_leads, v_business_conversions, v_spend_minor, v_revenue_minor,
    v_currency_count, v_currency
  FROM public.marketing_attribution_facts f
  WHERE f.observed_at >= p_from AND f.observed_at < p_to;

  IF v_event_count = 0 THEN
    v_unavailable_reasons := v_unavailable_reasons || jsonb_build_array('delivery_events_unavailable');
  END IF;
  IF v_sent IS NULL THEN
    v_unavailable_reasons := v_unavailable_reasons || jsonb_build_array('sent_data_unavailable');
  END IF;
  IF v_delivered IS NULL THEN
    v_unavailable_reasons := v_unavailable_reasons || jsonb_build_array('delivered_data_unavailable');
  END IF;
  IF v_clicked IS NULL THEN
    v_unavailable_reasons := v_unavailable_reasons || jsonb_build_array('click_data_unavailable');
  END IF;
  IF v_event_conversions IS NULL THEN
    v_unavailable_reasons := v_unavailable_reasons
      || jsonb_build_array('delivery_conversion_data_unavailable');
  END IF;
  IF v_spend_minor IS NULL THEN
    v_unavailable_reasons := v_unavailable_reasons || jsonb_build_array('spend_data_unavailable');
  END IF;
  IF v_revenue_minor IS NULL THEN
    v_unavailable_reasons := v_unavailable_reasons || jsonb_build_array('revenue_data_unavailable');
  END IF;
  IF v_currency_count > 1 THEN
    v_unavailable_reasons := v_unavailable_reasons || jsonb_build_array('mixed_currencies');
    v_spend_minor := NULL;
    v_revenue_minor := NULL;
    v_currency := NULL;
  END IF;
  IF v_leads IS NULL THEN
    v_unavailable_reasons := v_unavailable_reasons || jsonb_build_array('lead_data_unavailable');
  END IF;
  IF v_business_conversions IS NULL THEN
    v_unavailable_reasons := v_unavailable_reasons
      || jsonb_build_array('conversion_data_unavailable');
  END IF;
  -- The foundation has no trustworthy first-customer fact yet. CAC must stay
  -- distinct from CPA and explicitly unavailable until that source exists.
  v_unavailable_reasons := v_unavailable_reasons
    || jsonb_build_array('customer_acquisition_data_unavailable');

  v_completeness := CASE
    WHEN jsonb_array_length(v_unavailable_reasons) = 0 THEN 'complete'
    WHEN v_event_count = 0
      AND v_spend_minor IS NULL
      AND v_revenue_minor IS NULL
      AND v_leads IS NULL
      AND v_business_conversions IS NULL THEN 'unavailable'
    ELSE 'partial'
  END;

  v_analytics := jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'sent', v_sent,
    'delivered', v_delivered,
    'clicked', v_clicked,
    'delivery_conversions', v_event_conversions,
    'leads', v_leads,
    'business_conversions', v_business_conversions,
    'spend_minor', v_spend_minor,
    'revenue_minor', v_revenue_minor,
    'currency', CASE WHEN v_currency_count = 1 THEN v_currency ELSE NULL END,
    'cpl_minor', CASE
      WHEN v_spend_minor IS NOT NULL AND v_leads > 0
        THEN round(v_spend_minor::numeric / v_leads, 2)
      ELSE NULL
    END,
    'cpa_minor', CASE
      WHEN v_spend_minor IS NOT NULL AND v_business_conversions > 0
        THEN round(v_spend_minor::numeric / v_business_conversions, 2)
      ELSE NULL
    END,
    'cac_minor', NULL,
    'roas', CASE
      WHEN v_spend_minor IS NOT NULL AND v_spend_minor > 0 AND v_revenue_minor IS NOT NULL
        THEN round(v_revenue_minor::numeric / v_spend_minor, 4)
      ELSE NULL
    END,
    'completeness', v_completeness,
    'unavailable_reasons', v_unavailable_reasons
  );

  RETURN jsonb_build_object(
    'generated_at', now(),
    'governance', jsonb_build_object(
      'global_paused', COALESCE(v_global_paused, true),
      'global_pause_reason', v_global_reason,
      'approval_required', true,
      'draft_only', true,
      'external_actions_enabled', false,
      'provider_readiness_requires_fresh_probe', true,
      'max_campaign_autonomy_level', COALESCE((
        SELECT max(c.autonomy_level) FROM public.marketing_campaigns c
      ), 0)
    ),
    'providers', v_providers,
    'automations', v_automations,
    'assets', v_assets,
    'analytics', CASE WHEN v_completeness = 'unavailable' THEN NULL ELSE v_analytics END,
    'completeness', v_completeness,
    'unavailable_reasons', v_unavailable_reasons
  );
END;
$$;

-- Keep the existing overview correct for both historical raw webhook values
-- and canonical event values by reading through marketing_event_facts.
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
    FROM public.marketing_event_facts e
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

-- Isolated BFF dispatcher. It repeats the existing session/CSRF/database-role
-- checks and exposes exactly five operations; it cannot proxy arbitrary RPCs.
CREATE OR REPLACE FUNCTION public.service_execute_marketing_autopilot_operation(
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
  v_entity_id uuid;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF jsonb_typeof(v_args) <> 'object' OR octet_length(v_args::text) > 131072 THEN
    RAISE EXCEPTION 'Marketing autopilot operation arguments must be a bounded object'
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
    WHEN 'admin_get_marketing_autopilot_dashboard' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_from', 'p_to')
      ) THEN
        RAISE EXCEPTION 'Dashboard request contains unsupported fields'
          USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_get_marketing_autopilot_dashboard(
        COALESCE(NULLIF(v_args ->> 'p_from', '')::timestamptz, now() - interval '30 days'),
        COALESCE(NULLIF(v_args ->> 'p_to', '')::timestamptz, now())
      );

    WHEN 'admin_simulate_marketing_automation' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_automation_key', 'p_input')
      ) THEN
        RAISE EXCEPTION 'Automation simulation contains unsupported fields'
          USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_simulate_marketing_automation(
        v_args ->> 'p_automation_key',
        COALESCE(v_args -> 'p_input', '{}'::jsonb)
      );

    WHEN 'admin_prepare_marketing_automation_action' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN (
          'p_automation_key', 'p_input', 'p_simulation_key',
          'p_client_request_id', 'p_reason'
        )
      ) THEN
        RAISE EXCEPTION 'Automation draft request contains unsupported fields'
          USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_prepare_marketing_automation_action(
        v_args ->> 'p_automation_key',
        COALESCE(v_args -> 'p_input', '{}'::jsonb),
        v_args ->> 'p_simulation_key',
        NULLIF(v_args ->> 'p_client_request_id', '')::uuid,
        v_args ->> 'p_reason'
      );

    WHEN 'admin_upsert_marketing_asset' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_payload', 'p_expected_updated_at')
      ) OR jsonb_typeof(v_args -> 'p_payload') <> 'object' THEN
        RAISE EXCEPTION 'Asset request contains unsupported fields'
          USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_upsert_marketing_asset(
        v_args -> 'p_payload',
        NULLIF(v_args ->> 'p_expected_updated_at', '')::timestamptz
      );

    WHEN 'admin_update_marketing_provider_control' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_provider', 'p_control_state', 'p_reason')
      ) THEN
        RAISE EXCEPTION 'Provider control request contains unsupported fields'
          USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_update_marketing_provider_control(
        v_args ->> 'p_provider',
        v_args ->> 'p_control_state',
        v_args ->> 'p_reason'
      );

    ELSE
      RAISE EXCEPTION 'Marketing autopilot operation is not allowlisted'
        USING ERRCODE = '22023';
  END CASE;

  IF COALESCE(v_result ->> 'id', '') ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_entity_id := (v_result ->> 'id')::uuid;
  END IF;

  -- Deliberately omit p_args and business payloads. The audit contains only
  -- the operation identity and non-sensitive outcome controls.
  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(),
    v_actor_user_id,
    'marketing_autopilot_operation',
    'marketing_autopilot',
    v_entity_id,
    NULL,
    jsonb_strip_nulls(jsonb_build_object(
      'operation', p_operation,
      'status', v_result ->> 'status',
      'duplicate', NULLIF(v_result ->> 'duplicate', '')::boolean,
      'control_state', v_result ->> 'control_state',
      'external_effect', false
    )),
    now()
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION
  public.marketing_autopilot_payload_is_safe(jsonb),
  public.marketing_autopilot_append_only(),
  public.marketing_autopilot_touch_updated_at(),
  public.marketing_asset_require_current_rights(),
  public.admin_get_marketing_autopilot_dashboard(timestamptz, timestamptz),
  public.admin_simulate_marketing_automation(text, jsonb),
  public.admin_prepare_marketing_automation_action(text, jsonb, text, uuid, text),
  public.admin_upsert_marketing_asset(jsonb, timestamptz),
  public.admin_update_marketing_provider_control(text, text, text),
  public.service_execute_marketing_autopilot_operation(text, text, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.service_execute_marketing_autopilot_operation(text, text, text, jsonb)
TO service_role;

COMMIT;
