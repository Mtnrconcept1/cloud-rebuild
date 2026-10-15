-- Security centre: an administrator may approve only the immutable canonical
-- code-repair plan, through the server after a fresh AAL2 check. No browser role
-- can invoke this SECURITY DEFINER RPC directly.
BEGIN;

CREATE OR REPLACE FUNCTION public.ops_approve_incident_admin(
  p_incident_id uuid,
  p_expected_evidence_hash text,
  p_expected_plan jsonb,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $ops_approve_incident_admin$
DECLARE
  v_incident public.ops_incidents%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_actor_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin_identity_required' USING ERRCODE = '42501';
  END IF;

  IF p_expected_evidence_hash IS NULL
     OR p_expected_evidence_hash !~ '^[0-9a-f]{64}$'
     OR p_expected_plan IS NULL
     OR jsonb_typeof(p_expected_plan) <> 'object' THEN
    RAISE EXCEPTION 'invalid_approval_snapshot' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_incident
  FROM public.ops_incidents
  WHERE id = p_incident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'incident_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_incident.status <> 'awaiting_approval'
     OR v_incident.approval_token_hash IS NULL
     OR v_incident.approval_expires_at IS NULL
     OR v_incident.approval_expires_at <= now() THEN
    RAISE EXCEPTION 'approval_expired_or_processed' USING ERRCODE = '55000';
  END IF;

  IF v_incident.evidence_hash IS DISTINCT FROM p_expected_evidence_hash
     OR v_incident.repair_plan IS DISTINCT FROM p_expected_plan THEN
    RAISE EXCEPTION 'approval_snapshot_changed' USING ERRCODE = '55000';
  END IF;

  -- No arbitrarily typed prompt, shell command, SQL query or diagnostic response
  -- can become an executable job. Only the pre-existing code-repair workflow is
  -- eligible. A human still has to review/merge its isolated PR.
  IF v_incident.repairability <> 'code'
     OR COALESCE(v_incident.repair_plan->>'codex_eligible', 'false') <> 'true' THEN
    RAISE EXCEPTION 'automated_repair_not_permitted' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ops_incidents
  SET status = 'approved',
      approval_actor = left('admin-ui:' || p_actor_user_id::text, 240),
      approved_at = now(),
      approval_token_hash = NULL,
      approval_expires_at = NULL
  WHERE id = p_incident_id;

  INSERT INTO public.ops_incident_events (incident_id, event_type, actor, payload)
  VALUES (
    p_incident_id,
    'repair_approved',
    left('admin-ui:' || p_actor_user_id::text, 240),
    jsonb_build_object(
      'decision', 'approve',
      'channel', 'admin_ui',
      'evidence_hash', v_incident.evidence_hash
    )
  );

  RETURN jsonb_build_object(
    'incident_id', p_incident_id,
    'status', 'approved',
    'decision', 'approve',
    'evidence_hash', v_incident.evidence_hash
  );
END;
$ops_approve_incident_admin$;

REVOKE ALL ON FUNCTION public.ops_approve_incident_admin(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_approve_incident_admin(uuid, text, jsonb, uuid)
  TO service_role;

-- The legacy reset was deleting security evidence and closing business
-- incidents. Retire it without touching retained logs or historical tables.
CREATE OR REPLACE FUNCTION public.admin_reset_dashboard_logs(p_confirmation_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $admin_reset_dashboard_logs$
BEGIN
  RAISE EXCEPTION 'audit_evidence_reset_disabled'
    USING ERRCODE = '42501';
END;
$admin_reset_dashboard_logs$;

REVOKE ALL ON FUNCTION public.admin_reset_dashboard_logs(text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.ops_approve_incident_admin(uuid, text, jsonb, uuid)
  IS 'Atomic service-role-only approval after Edge-side admin AAL2 and exact immutable plan checks; no automatic merge or deploy.';
COMMENT ON FUNCTION public.admin_reset_dashboard_logs(text)
  IS 'Retired: security and audit evidence cannot be reset from the admin dashboard.';

COMMIT;
