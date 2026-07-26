-- Make the human approval and short-lived Codex context grant one atomic transition.

DROP FUNCTION IF EXISTS public.ops_decide_incident(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.ops_decide_incident(
  p_incident_id uuid,
  p_token_hash text,
  p_decision text,
  p_actor text,
  p_repair_context_token_hash text DEFAULT NULL,
  p_repair_context_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_incident public.ops_incidents%ROWTYPE;
  v_decision text := lower(trim(COALESCE(p_decision, '')));
  v_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  IF v_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Unsupported incident decision.' USING ERRCODE = '22023';
  END IF;

  IF v_decision = 'approve' THEN
    IF p_repair_context_token_hash IS NULL
       OR p_repair_context_token_hash !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Valid repair context token hash required.' USING ERRCODE = '22023';
    END IF;

    IF p_repair_context_expires_at IS NULL
       OR p_repair_context_expires_at <= now()
       OR p_repair_context_expires_at > now() + interval '12 hours' THEN
      RAISE EXCEPTION 'Valid repair context expiry required.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_repair_context_token_hash IS NOT NULL OR p_repair_context_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'Rejected incidents cannot receive a repair context.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_incident
  FROM public.ops_incidents
  WHERE id = p_incident_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found.' USING ERRCODE = '22023';
  END IF;

  IF v_incident.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'Incident is no longer awaiting approval.' USING ERRCODE = '55000';
  END IF;

  IF v_incident.approval_expires_at IS NULL OR v_incident.approval_expires_at <= now() THEN
    RAISE EXCEPTION 'Incident approval expired.' USING ERRCODE = '55000';
  END IF;

  IF v_incident.approval_token_hash IS NULL OR v_incident.approval_token_hash <> p_token_hash THEN
    RAISE EXCEPTION 'Invalid incident approval token.' USING ERRCODE = '42501';
  END IF;

  v_status := CASE WHEN v_decision = 'approve' THEN 'approved' ELSE 'rejected' END;

  UPDATE public.ops_incidents
  SET status = v_status,
      approval_actor = left(COALESCE(p_actor, 'telegram'), 240),
      approved_at = CASE WHEN v_decision = 'approve' THEN now() ELSE approved_at END,
      rejected_at = CASE WHEN v_decision = 'reject' THEN now() ELSE rejected_at END,
      approval_token_hash = NULL,
      approval_expires_at = NULL,
      repair_context_token_hash = CASE
        WHEN v_decision = 'approve' THEN p_repair_context_token_hash
        ELSE NULL
      END,
      repair_context_expires_at = CASE
        WHEN v_decision = 'approve' THEN p_repair_context_expires_at
        ELSE NULL
      END,
      failure_reason = NULL
  WHERE id = p_incident_id;

  INSERT INTO public.ops_incident_events (incident_id, event_type, actor, payload)
  VALUES (
    p_incident_id,
    CASE WHEN v_decision = 'approve' THEN 'repair_approved' ELSE 'repair_rejected' END,
    left(COALESCE(p_actor, 'telegram'), 240),
    jsonb_build_object(
      'decision', v_decision,
      'repair_context_expires_at', CASE
        WHEN v_decision = 'approve' THEN p_repair_context_expires_at
        ELSE NULL
      END
    )
  );

  RETURN jsonb_build_object(
    'incident_id', p_incident_id,
    'status', v_status,
    'decision', v_decision,
    'repair_context_expires_at', CASE
      WHEN v_decision = 'approve' THEN p_repair_context_expires_at
      ELSE NULL
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ops_decide_incident(uuid, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_decide_incident(uuid, text, text, text, text, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.ops_decide_incident(uuid, text, text, text, text, timestamptz) IS
  'Atomically records an incident decision and its short-lived Codex repair-context grant.';
