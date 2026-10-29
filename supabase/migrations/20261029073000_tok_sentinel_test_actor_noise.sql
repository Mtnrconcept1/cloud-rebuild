-- TOK Sentinel: short-lived noise management for explicitly authorized QA identities.
-- Never exempts an actor from RLS, authentication, payment controls, or audit logging.
-- No account email or UID is seeded by the migration. Provision only after review.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tok_sentinel_test_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  reason text NOT NULL DEFAULT 'authorized_production_qa',
  CONSTRAINT tok_sentinel_test_accounts_bounded_period CHECK (
    expires_at > activated_at
    AND expires_at <= activated_at + interval '30 days'
  ),
  CONSTRAINT tok_sentinel_test_accounts_reason CHECK (
    reason = 'authorized_production_qa'
  )
);
COMMENT ON TABLE public.tok_sentinel_test_accounts IS
  'Service-only, time-bound alert-noise annotations. Not a security or transaction bypass.';

ALTER TABLE public.tok_sentinel_test_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tok_sentinel_test_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tok_sentinel_test_accounts TO service_role;

-- Store test-only correlations for later review rather than pretending they
-- were rejected by a human or hiding the underlying forensic events.
ALTER TABLE public.tok_sentinel_incidents
  DROP CONSTRAINT IF EXISTS tok_sentinel_incidents_status_check;
ALTER TABLE public.tok_sentinel_incidents
  ADD CONSTRAINT tok_sentinel_incidents_status_check
  CHECK (status IN (
    'awaiting_approval', 'contained', 'rejected', 'released', 'observed_test'
  ));

ALTER TABLE public.tok_sentinel_incidents
  DROP CONSTRAINT IF EXISTS tok_sentinel_test_observation_only;
ALTER TABLE public.tok_sentinel_incidents
  ADD CONSTRAINT tok_sentinel_test_observation_only
  CHECK (status <> 'observed_test' OR (
    severity = 'high'
    AND category IN ('authorization_probing', 'payment_abuse')
    AND scope IN ('administration', 'payments')
    AND approval_token_hash IS NULL
    AND approval_expires_at IS NULL
    AND decision_chat_id IS NULL
    AND decision_message_id IS NULL
  ));

COMMIT;
NOTIFY pgrst, 'reload schema';
