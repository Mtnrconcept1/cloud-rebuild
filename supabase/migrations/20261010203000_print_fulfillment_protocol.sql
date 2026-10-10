BEGIN;

-- Deploy before the corresponding print-orchestrator. Additive, no remote effects.
-- A durable per-order marker permits at most one automatic create request.
-- A timeout or a crash after this marker requires lookup/manual reconciliation,
-- never a blind retry. Cloudprinter reference uniqueness is not an exactly-once SLA.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.print_orders'::regclass AND attname = 'submission_started_at' AND NOT attisdropped) THEN
    ALTER TABLE public.print_orders ADD COLUMN submission_started_at timestamptz;
    -- Older attempts may already have reached the provider. Backfill once;
    -- reapplying this migration must not mark new unsent orders as submitted.
    UPDATE public.print_orders o SET submission_started_at = o.created_at
    WHERE EXISTS (SELECT 1 FROM public.print_fulfillment_jobs j
      WHERE j.print_order_id = o.id AND j.job_type = 'submit_order' AND j.attempt_count > 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_print_fulfillment_jobs(
  p_limit integer DEFAULT 10,
  p_worker_id text DEFAULT 'print-orchestrator',
  p_lease_seconds integer DEFAULT 180
)
RETURNS TABLE (
  id uuid,
  print_order_id uuid,
  operation_key text,
  job_type text,
  attempt_count integer,
  max_attempts integer,
  lease_token uuid,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 OR p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_print_fulfillment_claim';
  END IF;

  -- Expired final attempts must become actionable failures, not orphaned leases.
  -- Never send another provider request just to discover the previous outcome.
  WITH exhausted AS (
    SELECT j.id FROM public.print_fulfillment_jobs j
    WHERE j.attempt_count >= j.max_attempts
      AND (j.status IN ('pending', 'retrying')
        OR (j.status = 'processing' AND j.lease_expires_at <= clock_timestamp()))
    ORDER BY j.next_attempt_at, j.id FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  UPDATE public.print_fulfillment_jobs j
  SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
      last_error_code = 'print_attempts_exhausted_reconcile_required',
      last_error = 'Retry budget exhausted; reconcile the existing provider reference before any manual recovery',
      result = j.result || jsonb_build_object('reconciliation_required', true),
      completed_at = clock_timestamp(), updated_at = clock_timestamp()
  FROM exhausted WHERE j.id = exhausted.id;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.print_fulfillment_jobs j
    WHERE j.attempt_count < j.max_attempts
      AND j.next_attempt_at <= now()
      AND (
        j.status IN ('pending', 'retrying')
        OR (j.status = 'processing' AND j.lease_expires_at < now())
      )
    ORDER BY j.next_attempt_at, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.print_fulfillment_jobs j
  SET status = 'processing',
      attempt_count = j.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now(),
      result = j.result || jsonb_build_object('worker_id', left(COALESCE(p_worker_id, 'print-orchestrator'), 120))
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.id, j.print_order_id, j.operation_key, j.job_type,
            j.attempt_count, j.max_attempts, j.lease_token, j.lease_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_print_fulfillment_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_status text,
  p_error_code text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_result jsonb DEFAULT '{}'::jsonb,
  p_next_attempt_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.print_fulfillment_jobs%ROWTYPE;
  v_order public.print_orders%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('retrying', 'completed', 'failed', 'canceled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_print_fulfillment_status';
  END IF;

  SELECT * INTO v_job
  FROM public.print_fulfillment_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'print_fulfillment_job_not_found';
  END IF;
  IF v_job.status <> 'processing' OR v_job.lease_token IS DISTINCT FROM p_lease_token
    OR v_job.lease_token IS NULL OR v_job.lease_expires_at IS NULL
    OR v_job.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'print_fulfillment_lease_lost';
  END IF;

  SELECT * INTO v_order FROM public.print_orders WHERE id = v_job.print_order_id FOR UPDATE;
  IF v_job.job_type = 'submit_order' THEN
    IF v_order.status IN ('cancellation_requested', 'canceled', 'refund_pending', 'refunded') THEN
      p_status := 'canceled';
      p_result := COALESCE(p_result, '{}'::jsonb) || jsonb_build_object('order_state', v_order.status,
        'reconciliation_required', v_order.submission_started_at IS NOT NULL);
    ELSIF p_status = 'completed' AND v_order.status NOT IN
      ('submitted', 'validated', 'producing', 'produced', 'packed', 'shipped', 'delivered', 'production_error', 'delivery_failed') THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'print_submission_transition_rejected';
    END IF;
  END IF;

  IF p_status = 'retrying' AND v_job.attempt_count >= v_job.max_attempts THEN
    p_status := 'failed';
    p_error_code := 'print_attempts_exhausted_reconcile_required';
    p_result := COALESCE(p_result, '{}'::jsonb) || jsonb_build_object('reconciliation_required', true);
  END IF;

  IF p_status = 'failed' AND v_order.submission_started_at IS NOT NULL THEN
    p_result := COALESCE(p_result, '{}'::jsonb) || jsonb_build_object('reconciliation_required', true);
  END IF;

  UPDATE public.print_fulfillment_jobs
  SET status = p_status,
      lease_token = NULL,
      lease_expires_at = NULL,
      next_attempt_at = CASE
        WHEN p_status = 'retrying' THEN COALESCE(p_next_attempt_at, now() + interval '5 minutes')
        ELSE next_attempt_at
      END,
      last_error_code = CASE WHEN p_status IN ('completed', 'canceled') THEN NULL ELSE left(COALESCE(p_error_code, ''), 120) END,
      last_error = CASE WHEN p_status IN ('completed', 'canceled') THEN NULL ELSE left(COALESCE(p_error, ''), 1000) END,
      result = COALESCE(result, '{}'::jsonb) || COALESCE(p_result, '{}'::jsonb),
      completed_at = CASE WHEN p_status IN ('completed', 'failed', 'canceled') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'attempt_count', v_job.attempt_count,
    'next_attempt_at', v_job.next_attempt_at
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.prepare_print_fulfillment_submission(p_job_id uuid, p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.print_fulfillment_jobs%ROWTYPE;
  v_order public.print_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.print_fulfillment_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.lease_token IS DISTINCT FROM p_lease_token
    OR v_job.lease_token IS NULL OR v_job.lease_expires_at IS NULL
    OR v_job.lease_expires_at <= clock_timestamp() OR v_job.job_type <> 'submit_order' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'print_fulfillment_lease_lost';
  END IF;
  SELECT * INTO v_order FROM public.print_orders WHERE id = v_job.print_order_id FOR UPDATE;
  IF v_order.status IN ('cancellation_requested', 'canceled', 'refund_pending', 'refunded') THEN
    RETURN jsonb_build_object('action', 'stop', 'status', 'canceled');
  END IF;
  IF v_order.status IN ('submitted', 'validated', 'producing', 'produced', 'packed', 'shipped', 'delivered', 'production_error', 'delivery_failed') THEN
    RETURN jsonb_build_object('action', 'stop', 'status', 'completed');
  END IF;
  IF v_order.payment_status <> 'paid' OR v_order.status NOT IN ('paid', 'submission_pending') THEN
    RETURN jsonb_build_object('action', 'stop', 'status', 'failed');
  END IF;
  IF v_order.submission_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('action', 'reconcile_only');
  END IF;
  -- Recheck the kill switch after slow quote/storage calls.
  IF NOT EXISTS (SELECT 1 FROM public.print_settings WHERE id = 'global' AND enabled AND new_orders_enabled) THEN
    RETURN jsonb_build_object('action', 'paused');
  END IF;
  UPDATE public.print_orders SET submission_started_at = clock_timestamp(),
    provider_reference = COALESCE(provider_reference, 'TOKP_' || upper(replace(id::text, '-', ''))),
    updated_at = clock_timestamp() WHERE id = v_order.id;
  UPDATE public.print_fulfillment_jobs SET lease_expires_at = clock_timestamp() + interval '180 seconds'
    WHERE id = v_job.id;
  RETURN jsonb_build_object('action', 'create');
END;
$$;

-- Provider acceptance and local job completion commit together. Lock order is
-- always job then order. A cancellation or webhook that won the order lock is
-- preserved, including when advance_print_order_state returns advanced=false.
CREATE OR REPLACE FUNCTION public.finish_print_fulfillment_submission(
  p_job_id uuid, p_lease_token uuid, p_provider_state text,
  p_tracking_code text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.print_fulfillment_jobs%ROWTYPE;
  v_order public.print_orders%ROWTYPE;
  v_transition jsonb;
  v_status text;
BEGIN
  SELECT * INTO v_job FROM public.print_fulfillment_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.lease_token IS DISTINCT FROM p_lease_token
    OR v_job.lease_token IS NULL OR v_job.lease_expires_at IS NULL
    OR v_job.lease_expires_at <= clock_timestamp() OR v_job.job_type <> 'submit_order' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'print_fulfillment_lease_lost';
  END IF;
  SELECT * INTO v_order FROM public.print_orders WHERE id = v_job.print_order_id FOR UPDATE;
  v_transition := public.advance_print_order_state(v_order.id, 'submitted', p_provider_state,
    p_tracking_code, NULL, NULL, NULL, 'Provider submission observed', COALESCE(p_metadata, '{}'::jsonb));
  SELECT * INTO v_order FROM public.print_orders WHERE id = v_job.print_order_id;
  IF v_order.status IN ('cancellation_requested', 'canceled', 'refund_pending', 'refunded') THEN
    v_status := 'canceled';
  ELSIF v_order.status IN ('submitted', 'validated', 'producing', 'produced', 'packed', 'shipped', 'delivered', 'production_error', 'delivery_failed') THEN
    v_status := 'completed';
  ELSE
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'print_submission_transition_rejected';
  END IF;
  RETURN public.complete_print_fulfillment_job(p_job_id, p_lease_token, v_status, NULL, NULL,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('order_state', v_order.status,
      'transition_advanced', v_transition->'advanced', 'provider_submission_observed', true,
      'reconciliation_required', v_status = 'canceled'), NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_print_fulfillment_submission(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_print_fulfillment_submission(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_print_fulfillment_jobs(integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_print_fulfillment_job(uuid, uuid, text, text, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_print_fulfillment_submission(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_print_fulfillment_submission(uuid, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_print_fulfillment_jobs(integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_print_fulfillment_job(uuid, uuid, text, text, text, jsonb, timestamptz) TO service_role;

COMMIT;
