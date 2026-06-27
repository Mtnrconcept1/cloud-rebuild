BEGIN;

ALTER TABLE public.tok_connect_agent_runs
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.tok_connect_agent_runs
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.tok_connect_agent_runs
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.tok_connect_agent_runs
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

ALTER TABLE public.tok_connect_agent_runs
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.tok_connect_agent_runs
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'low';

ALTER TABLE public.tok_connect_agent_runs
  ADD COLUMN IF NOT EXISTS execution_policy jsonb NOT NULL DEFAULT jsonb_build_object(
    'human_approval_required', true,
    'autonomous_mutation_allowed', false,
    'max_budget_chf', 0
  );

ALTER TABLE public.tok_connect_agent_runs
  DROP CONSTRAINT IF EXISTS tok_connect_agent_runs_mode_check;

ALTER TABLE public.tok_connect_agent_runs
  ADD CONSTRAINT tok_connect_agent_runs_mode_check
  CHECK (mode IN ('read_only', 'suggest', 'preview', 'autopilot_bounded'));

ALTER TABLE public.tok_connect_agent_runs
  DROP CONSTRAINT IF EXISTS tok_connect_agent_runs_status_check;

ALTER TABLE public.tok_connect_agent_runs
  ADD CONSTRAINT tok_connect_agent_runs_status_check
  CHECK (status IN ('preview', 'pending_approval', 'approved', 'rejected', 'blocked', 'failed'));

ALTER TABLE public.tok_connect_agent_runs
  DROP CONSTRAINT IF EXISTS tok_connect_agent_runs_risk_level_check;

ALTER TABLE public.tok_connect_agent_runs
  ADD CONSTRAINT tok_connect_agent_runs_risk_level_check
  CHECK (risk_level IN ('low', 'medium', 'high'));

CREATE INDEX IF NOT EXISTS idx_tok_connect_agent_runs_restaurant_status
  ON public.tok_connect_agent_runs(restaurant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tok_connect_agent_runs_pending_approval
  ON public.tok_connect_agent_runs(created_at DESC)
  WHERE status = 'pending_approval';

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'tok-connect-autopilot',
  'TOK Connect Autopilot',
  'Active les plans Autopilot bornes TOK Connect; les mutations autonomes restent bloquees sans validation humaine.',
  false
)
ON CONFLICT (name) DO NOTHING;

COMMENT ON COLUMN public.tok_connect_agent_runs.execution_policy IS
  'Bounded Autopilot policy snapshot. Human approval remains required before any downstream execution.';

COMMIT;
