BEGIN;

-- Canonical incident intelligence shared by Telegram/Codex, Guardian and Support Resolution.
-- Additive only: historical incidents and support records remain untouched.

ALTER TABLE public.ops_incidents
  ADD COLUMN IF NOT EXISTS evidence_hash text
    CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS repairability text NOT NULL DEFAULT 'unknown'
    CHECK (repairability IN (
      'code',
      'configuration',
      'data',
      'third_party',
      'transient',
      'expected_business_rule',
      'unknown'
    )),
  ADD COLUMN IF NOT EXISTS analysis_version integer NOT NULL DEFAULT 1
    CHECK (analysis_version > 0),
  ADD COLUMN IF NOT EXISTS analysis_source text
    CHECK (analysis_source IS NULL OR analysis_source IN (
      'deterministic',
      'openai',
      'fallback',
      'cache'
    )),
  ADD COLUMN IF NOT EXISTS analysis_model_requested text,
  ADD COLUMN IF NOT EXISTS analysis_model_returned text,
  ADD COLUMN IF NOT EXISTS analysis_usage jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(analysis_usage) = 'object'),
  ADD COLUMN IF NOT EXISTS analysis_cached boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS analysis_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_evidence_changed_at timestamptz;

CREATE INDEX IF NOT EXISTS ops_incidents_fingerprint_evidence_idx
  ON public.ops_incidents (fingerprint, evidence_hash, created_at DESC)
  WHERE evidence_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS ops_incidents_repairability_status_idx
  ON public.ops_incidents (repairability, status, last_seen_at DESC);

ALTER TABLE public.support_resolution_runs
  ADD COLUMN IF NOT EXISTS context_hash text
    CHECK (context_hash IS NULL OR context_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS analysis_version integer NOT NULL DEFAULT 1
    CHECK (analysis_version > 0),
  ADD COLUMN IF NOT EXISTS cached_from_run_id uuid
    REFERENCES public.support_resolution_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_resolution_runs_context_cache_idx
  ON public.support_resolution_runs (incident_id, context_hash, created_at DESC)
  WHERE context_hash IS NOT NULL;

ALTER TABLE public.ops_guardian_assessments
  ADD COLUMN IF NOT EXISTS evidence_hash text
    CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS analysis_source text NOT NULL DEFAULT 'deep'
    CHECK (analysis_source IN ('canonical', 'deep')),
  ADD COLUMN IF NOT EXISTS cached_from_assessment_id uuid
    REFERENCES public.ops_guardian_assessments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ops_guardian_assessments_evidence_cache_idx
  ON public.ops_guardian_assessments (incident_id, evidence_hash, analysis_source, created_at DESC)
  WHERE evidence_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.support_ops_incident_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_incident_id uuid NOT NULL
    REFERENCES public.support_incidents(id) ON DELETE CASCADE,
  ops_incident_id uuid NOT NULL
    REFERENCES public.ops_incidents(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'escalated'
    CHECK (link_type IN (
      'escalated',
      'duplicate_symptom',
      'root_cause',
      'related'
    )),
  technical_evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(technical_evidence) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (support_incident_id, ops_incident_id)
);

CREATE INDEX IF NOT EXISTS support_ops_incident_links_support_idx
  ON public.support_ops_incident_links (support_incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_ops_incident_links_ops_idx
  ON public.support_ops_incident_links (ops_incident_id, created_at DESC);

ALTER TABLE public.support_ops_incident_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.support_ops_incident_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.support_ops_incident_links TO authenticated;
GRANT ALL ON public.support_ops_incident_links TO service_role;

DROP POLICY IF EXISTS "Admins can read support incident technical links"
  ON public.support_ops_incident_links;
CREATE POLICY "Admins can read support incident technical links"
  ON public.support_ops_incident_links
  FOR SELECT
  TO authenticated
  USING (public.auth_is_admin());

COMMENT ON COLUMN public.ops_incidents.evidence_hash IS
  'SHA-256 of the bounded sanitized evidence used to prevent repeated AI analysis.';
COMMENT ON COLUMN public.ops_incidents.repairability IS
  'Deterministic routing result deciding whether Codex is appropriate.';
COMMENT ON TABLE public.support_ops_incident_links IS
  'PII-minimized relation between a support case and its canonical technical incident.';
COMMENT ON COLUMN public.support_resolution_runs.context_hash IS
  'SHA-256 of the compact support context and request, used to reuse an existing diagnosis.';
COMMENT ON COLUMN public.ops_guardian_assessments.analysis_source IS
  'canonical reuses the Telegram/Codex plan; deep represents an explicit additional analysis.';

COMMIT;
