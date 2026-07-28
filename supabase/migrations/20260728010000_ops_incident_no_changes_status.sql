-- Codex reporting "no safe change to make" is a legitimate outcome, not a failure.
-- Folding it into 'failed' made every green workflow run raise a Telegram alert, and
-- because deduplication only merges onto open incidents, each 5-minute scan then
-- created a brand new incident and re-dispatched Codex for the same fingerprint.
--
-- Non-destructive: the status CHECK is widened (no existing value is removed) and the
-- registration function keeps its signature and behaviour apart from the dedup scope.

ALTER TABLE public.ops_incidents
  DROP CONSTRAINT IF EXISTS ops_incidents_status_check;

ALTER TABLE public.ops_incidents
  ADD CONSTRAINT ops_incidents_status_check CHECK (
    status IN (
      'detected',
      'analyzing',
      'awaiting_approval',
      'approved',
      'repairing',
      'pr_open',
      'resolved',
      'rejected',
      'failed',
      'no_changes',
      'ignored'
    )
  );

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

  -- Serialise identical fingerprints so concurrent collectors cannot create duplicates.
  PERFORM pg_advisory_xact_lock(hashtext(p_fingerprint)::bigint);

  -- 'no_changes' stays in scope: a recurrence must raise the occurrence count on the
  -- incident Codex already reviewed instead of opening a new one and asking again.
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
