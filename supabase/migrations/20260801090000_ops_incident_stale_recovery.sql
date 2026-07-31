-- Recover incident fingerprints blocked by expired approvals or abandoned repair runs.
-- Existing migrations remain immutable; this migration updates the registration
-- function and closes already-stale operational rows without deleting history.

WITH stale AS (
  UPDATE public.ops_incidents
  SET status = 'failed',
      failure_reason = CASE status
        WHEN 'awaiting_approval' THEN 'approval_expired'
        WHEN 'approved' THEN 'repair_dispatch_timed_out'
        WHEN 'analyzing' THEN 'analysis_timed_out'
        WHEN 'repairing' THEN 'repair_workflow_timed_out'
        WHEN 'no_changes' THEN 'no_changes_recurrence_window_expired'
        ELSE 'incident_state_expired'
      END,
      approval_token_hash = NULL,
      approval_expires_at = NULL,
      repair_context_token_hash = NULL,
      repair_context_expires_at = NULL
  WHERE (
      status = 'awaiting_approval'
      AND (
        approval_expires_at <= now()
        OR (approval_expires_at IS NULL AND updated_at <= now() - interval '15 minutes')
      )
    )
    OR (
      status = 'approved'
      AND github_run_id IS NULL
      AND (
        repair_context_expires_at <= now()
        OR (repair_context_expires_at IS NULL AND updated_at <= now() - interval '15 minutes')
      )
    )
    OR (
      status = 'analyzing'
      AND updated_at <= now() - interval '30 minutes'
    )
    OR (
      status = 'repairing'
      AND github_pr_number IS NULL
      AND updated_at <= now() - interval '6 hours'
    )
    OR (
      status = 'no_changes'
      AND last_seen_at <= now() - interval '24 hours'
    )
  RETURNING id, failure_reason
)
INSERT INTO public.ops_incident_events (incident_id, event_type, actor, payload)
SELECT
  id,
  'stale_incident_expired',
  'ops-incident-stale-recovery-migration',
  jsonb_build_object('reason', failure_reason)
FROM stale;

CREATE OR REPLACE FUNCTION public.ops_register_incident(
  p_fingerprint text,
  p_source text,
  p_source_event_id text,
  p_severity text,
  p_title text,
  p_summary text,
  p_technical_details jsonb DEFAULT '{}'::jsonb,
  p_sanitized_context jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  incident_id uuid,
  created_new boolean,
  incident_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_existing public.ops_incidents%ROWTYPE;
  v_incident_id uuid;
  v_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  IF p_fingerprint IS NULL OR char_length(trim(p_fingerprint)) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'Invalid incident fingerprint.' USING ERRCODE = '22023';
  END IF;

  IF p_source NOT IN ('edge_audit', 'github_actions', 'sentry', 'manual', 'external') THEN
    RAISE EXCEPTION 'Invalid incident source.' USING ERRCODE = '22023';
  END IF;

  IF p_severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Invalid incident severity.' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(p_title, ''))) < 3 THEN
    RAISE EXCEPTION 'Incident title is required.' USING ERRCODE = '22023';
  END IF;

  -- Serialize identical fingerprints before expiring or deduplicating them.
  PERFORM pg_advisory_xact_lock(hashtext(p_fingerprint)::bigint);

  WITH stale AS (
    UPDATE public.ops_incidents
    SET status = 'failed',
        failure_reason = CASE status
          WHEN 'awaiting_approval' THEN 'approval_expired'
          WHEN 'approved' THEN 'repair_dispatch_timed_out'
          WHEN 'analyzing' THEN 'analysis_timed_out'
          WHEN 'repairing' THEN 'repair_workflow_timed_out'
          WHEN 'no_changes' THEN 'no_changes_recurrence_window_expired'
          ELSE 'incident_state_expired'
        END,
        approval_token_hash = NULL,
        approval_expires_at = NULL,
        repair_context_token_hash = NULL,
        repair_context_expires_at = NULL
    WHERE fingerprint = p_fingerprint
      AND (
        (
          status = 'awaiting_approval'
          AND (
            approval_expires_at <= now()
            OR (approval_expires_at IS NULL AND updated_at <= now() - interval '15 minutes')
          )
        )
        OR (
          status = 'approved'
          AND github_run_id IS NULL
          AND (
            repair_context_expires_at <= now()
            OR (repair_context_expires_at IS NULL AND updated_at <= now() - interval '15 minutes')
          )
        )
        OR (
          status = 'analyzing'
          AND updated_at <= now() - interval '30 minutes'
        )
        OR (
          status = 'repairing'
          AND github_pr_number IS NULL
          AND updated_at <= now() - interval '6 hours'
        )
        OR (
          status = 'no_changes'
          AND last_seen_at <= now() - interval '24 hours'
        )
      )
    RETURNING id, failure_reason
  )
  INSERT INTO public.ops_incident_events (incident_id, event_type, actor, payload)
  SELECT
    id,
    'stale_incident_expired',
    'ops-incident-control',
    jsonb_build_object('reason', failure_reason)
  FROM stale;

  -- A no_changes result stays deduplicated while the same failure keeps
  -- recurring. After 24 hours without an occurrence it is expired above, so a
  -- genuinely new episode can be analysed and approved again.
  SELECT *
  INTO v_existing
  FROM public.ops_incidents
  WHERE fingerprint = p_fingerprint
    AND status IN (
      'detected',
      'analyzing',
      'awaiting_approval',
      'approved',
      'repairing',
      'pr_open',
      'no_changes'
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.ops_incidents
    SET source_event_id = COALESCE(NULLIF(p_source_event_id, ''), source_event_id),
        severity = CASE
          WHEN CASE p_severity
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            ELSE 1
          END > CASE severity
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            ELSE 1
          END
          THEN p_severity
          ELSE severity
        END,
        title = left(trim(p_title), 240),
        summary = left(COALESCE(p_summary, ''), 4000),
        technical_details = COALESCE(p_technical_details, '{}'::jsonb),
        sanitized_context = COALESCE(p_sanitized_context, '{}'::jsonb),
        occurrence_count = occurrence_count + 1,
        last_seen_at = now()
    WHERE id = v_existing.id
    RETURNING id, status INTO v_incident_id, v_status;

    INSERT INTO public.ops_incident_events (incident_id, event_type, actor, payload)
    VALUES (
      v_incident_id,
      'occurrence_deduplicated',
      'ops-incident-control',
      jsonb_build_object('source', p_source, 'source_event_id', p_source_event_id)
    );

    RETURN QUERY SELECT v_incident_id, false, v_status;
    RETURN;
  END IF;

  INSERT INTO public.ops_incidents (
    fingerprint,
    source,
    source_event_id,
    severity,
    status,
    title,
    summary,
    technical_details,
    sanitized_context
  )
  VALUES (
    trim(p_fingerprint),
    p_source,
    NULLIF(p_source_event_id, ''),
    p_severity,
    'detected',
    left(trim(p_title), 240),
    left(COALESCE(p_summary, ''), 4000),
    COALESCE(p_technical_details, '{}'::jsonb),
    COALESCE(p_sanitized_context, '{}'::jsonb)
  )
  RETURNING id, status INTO v_incident_id, v_status;

  INSERT INTO public.ops_incident_events (incident_id, event_type, actor, payload)
  VALUES (
    v_incident_id,
    'incident_detected',
    'ops-incident-control',
    jsonb_build_object('source', p_source, 'source_event_id', p_source_event_id)
  );

  RETURN QUERY SELECT v_incident_id, true, v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_register_incident(
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ops_register_incident(
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) TO service_role;
