BEGIN;

-- Video failures already release ordinary usage-based credits. Admin gifts also
-- have a physical lot allocation: restore that allocation, never mint a new lot.
CREATE TABLE IF NOT EXISTS private_finance.ai_video_credit_releases (
  usage_id uuid NOT NULL REFERENCES public.ai_usage_logs(id) ON DELETE RESTRICT,
  grant_id uuid NOT NULL REFERENCES private_finance.admin_ai_credit_grants(id) ON DELETE RESTRICT,
  -- Immutable audit snapshot, checked by the helper. No FK: video jobs already
  -- cascade on account deletion; retaining this receipt must not block that.
  job_id uuid NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  original_spent_at timestamptz NOT NULL,
  released_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 200),
  PRIMARY KEY (usage_id, grant_id)
);
CREATE INDEX IF NOT EXISTS ai_video_credit_releases_job_idx
  ON private_finance.ai_video_credit_releases (job_id);
CREATE INDEX IF NOT EXISTS ai_video_credit_releases_grant_idx
  ON private_finance.ai_video_credit_releases (grant_id);
ALTER TABLE private_finance.ai_video_credit_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private_finance.ai_video_credit_releases FROM PUBLIC, anon, authenticated, service_role;

-- Private implementation, called only by the existing service RPC and the
-- narrowly checked repair below. A failed job and its matching failed ledger
-- entry are required before any gift can be released.
CREATE OR REPLACE FUNCTION private_finance.release_restaurant_video_gifts(
  p_job_id uuid, p_reason text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_job public.restaurant_video_generations;
  v_usage public.ai_usage_logs;
  v_spend record;
  v_restaurant_id uuid;
  v_total integer;
BEGIN
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'video_gift_release_reason_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT restaurant_id INTO v_restaurant_id FROM public.restaurant_video_generations WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'video_job_not_found' USING ERRCODE = '02000'; END IF;
  -- Match reserve/brand-replay ordering before acquiring any row lock. The
  -- shared wallet lock also serializes this refund with image and other spends.
  PERFORM pg_advisory_xact_lock(hashtext('tok_video:' || v_restaurant_id::text)::bigint);
  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_restaurant_id::text)::bigint);
  SELECT * INTO v_job FROM public.restaurant_video_generations WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'video_job_not_found' USING ERRCODE = '02000'; END IF;
  IF v_job.status IS DISTINCT FROM 'failed' OR v_job.storage_path IS NOT NULL THEN
    RAISE EXCEPTION 'video_gift_release_not_failed' USING ERRCODE = '23514';
  END IF;
  IF v_job.usage_log_id IS NULL THEN RETURN 0; END IF;
  SELECT * INTO v_usage FROM public.ai_usage_logs WHERE id = v_job.usage_log_id FOR UPDATE;
  IF NOT FOUND OR v_usage.function_name IS DISTINCT FROM 'ai-video-studio'
    OR v_usage.action IS DISTINCT FROM 'generate_video'
    OR v_usage.restaurant_id IS DISTINCT FROM v_job.restaurant_id
    OR v_usage.user_id IS DISTINCT FROM v_job.user_id
    OR v_usage.status IS DISTINCT FROM 'failure'
    OR v_usage.metadata->>'provider' IS DISTINCT FROM 'higgsfield'
    OR v_usage.metadata->>'video_job_id' IS DISTINCT FROM v_job.id::text
    OR v_usage.metadata->>'credit_units' IS DISTINCT FROM v_job.credit_units::text
    OR v_usage.metadata->>'billing_state' IS DISTINCT FROM 'refunded'
  THEN RAISE EXCEPTION 'video_gift_release_ledger_mismatch' USING ERRCODE = '23514'; END IF;

  SELECT coalesce(sum(credits), 0)::integer INTO v_total
    FROM private_finance.admin_ai_credit_spends WHERE usage_id = v_usage.id;
  IF v_total = 0 THEN RETURN 0; END IF;
  IF v_total <> v_job.credit_units
    OR v_usage.metadata->>'admin_ai_gift_used' IS DISTINCT FROM v_total::text
  THEN RAISE EXCEPTION 'video_gift_release_amount_mismatch' USING ERRCODE = '23514'; END IF;

  FOR v_spend IN
    SELECT * FROM private_finance.admin_ai_credit_spends
      WHERE usage_id = v_usage.id ORDER BY grant_id FOR UPDATE
  LOOP
    -- The grant constraint prevents over-restoration. This additionally refuses
    -- any inconsistent allocation to a different restaurant.
    UPDATE private_finance.admin_ai_credit_grants
      SET remaining = remaining + v_spend.credits
      WHERE id = v_spend.grant_id AND restaurant_id = v_job.restaurant_id
        AND remaining + v_spend.credits <= amount;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'video_gift_release_grant_mismatch' USING ERRCODE = '23514';
    END IF;
    INSERT INTO private_finance.ai_video_credit_releases
      (usage_id, grant_id, job_id, credits, original_spent_at, reason)
    VALUES (v_usage.id, v_spend.grant_id, v_job.id, v_spend.credits, v_spend.created_at, p_reason);
  END LOOP;
  -- The release journal's primary key and deletion in this same transaction
  -- make retries harmless; expires_at and granted_at are never changed.
  DELETE FROM private_finance.admin_ai_credit_spends WHERE usage_id = v_usage.id;
  UPDATE public.ai_usage_logs SET metadata = metadata || jsonb_build_object('admin_ai_gift_refunded', v_total)
    WHERE id = v_usage.id;
  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION private_finance.release_restaurant_video_gifts(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Keep the established RPC signature and terminal-job behavior for old clients.
CREATE OR REPLACE FUNCTION public.finish_restaurant_video_generation(
  p_job_id uuid, p_provider_request_id text, p_status text,
  p_storage_path text DEFAULT NULL, p_error_code text DEFAULT NULL
)
RETURNS public.restaurant_video_generations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_job public.restaurant_video_generations;
  v_restaurant_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  SELECT restaurant_id INTO v_restaurant_id FROM public.restaurant_video_generations WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'video_job_not_found' USING ERRCODE = '02000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tok_video:' || v_restaurant_id::text)::bigint);
  PERFORM pg_advisory_xact_lock(hashtext('tok_credit_spend:' || v_restaurant_id::text)::bigint);
  SELECT * INTO v_job FROM public.restaurant_video_generations WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'video_job_not_found' USING ERRCODE = '02000'; END IF;
  IF v_job.status IN ('completed','failed') THEN RETURN v_job; END IF;
  IF p_status IS NULL OR p_status NOT IN ('queued','in_progress','archiving','completed','failed','needs_review') THEN
    RAISE EXCEPTION 'video_status_invalid' USING ERRCODE = '22023';
  END IF;
  IF v_job.provider_request_id IS NOT NULL
    AND (p_provider_request_id IS NULL OR v_job.provider_request_id <> p_provider_request_id)
  THEN RAISE EXCEPTION 'stale_video_provider_response' USING ERRCODE = 'P0001'; END IF;
  IF p_status = 'failed' AND v_job.status = 'needs_review'
    AND nullif(p_provider_request_id, '') IS NULL
  THEN RAISE EXCEPTION 'cannot_refund_unverified_submission' USING ERRCODE = 'P0001'; END IF;
  IF p_status = 'completed' AND (p_storage_path IS NULL OR p_storage_path = '') THEN
    RAISE EXCEPTION 'video_asset_required' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'failed' AND v_job.usage_log_id IS NOT NULL THEN
    UPDATE public.ai_usage_logs
      SET status = 'failure', metadata = metadata || '{"billing_state":"refunded"}'::jsonb
      WHERE id = v_job.usage_log_id AND status = 'success';
  ELSIF p_status = 'completed' AND v_job.usage_log_id IS NOT NULL THEN
    UPDATE public.ai_usage_logs SET metadata = metadata || '{"billing_state":"charged"}'::jsonb
      WHERE id = v_job.usage_log_id AND status = 'success';
  END IF;
  UPDATE public.restaurant_video_generations
    SET status = p_status,
      provider_request_id = coalesce(provider_request_id, nullif(p_provider_request_id,'')),
      storage_path = CASE WHEN p_status = 'completed' THEN p_storage_path ELSE storage_path END,
      error_code = CASE WHEN p_status IN ('failed','needs_review') THEN left(p_error_code,80) ELSE NULL END,
      updated_at = now()
    WHERE id = p_job_id RETURNING * INTO v_job;
  IF p_status = 'failed' THEN
    PERFORM private_finance.release_restaurant_video_gifts(v_job.id, 'confirmed_video_failure');
  END IF;
  RETURN v_job;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_restaurant_video_generation(uuid,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_restaurant_video_generation(uuid,text,text,text,text) TO service_role;

-- Repair only native, already-refunded video failures that still have their
-- original gift spends. No success, uncertain submission, generic AI usage or
-- manually credited balance is eligible. Reapplying finds no remaining spends.
DO $video_gift_repair$
DECLARE v_job record;
BEGIN
  FOR v_job IN
    SELECT j.id, j.restaurant_id
    FROM public.restaurant_video_generations j
    JOIN public.ai_usage_logs u ON u.id = j.usage_log_id
    WHERE j.status = 'failed' AND j.storage_path IS NULL
      AND j.error_code IN ('video_provider_rejected', 'video_provider_invalid_input',
        'video_provider_auth_failed', 'video_provider_access_denied',
        'video_provider_endpoint_missing', 'video_provider_rate_limited', 'video_provider_failed')
      AND u.function_name = 'ai-video-studio' AND u.action = 'generate_video'
      AND u.restaurant_id = j.restaurant_id AND u.user_id = j.user_id
      AND u.status = 'failure' AND u.metadata->>'billing_state' = 'refunded'
      AND u.metadata->>'provider' = 'higgsfield'
      AND u.metadata->>'video_job_id' = j.id::text
      AND u.metadata->>'credit_units' = j.credit_units::text
      AND u.metadata->>'admin_ai_gift_used' = j.credit_units::text
      AND (SELECT coalesce(sum(s.credits), 0) FROM private_finance.admin_ai_credit_spends s
        WHERE s.usage_id = u.id) = j.credit_units
      AND j.credit_units > 0
      AND NOT EXISTS (
        SELECT 1 FROM private_finance.admin_ai_credit_spends s
        JOIN private_finance.admin_ai_credit_grants g ON g.id = s.grant_id
        WHERE s.usage_id = u.id AND (g.restaurant_id <> j.restaurant_id OR g.remaining + s.credits > g.amount)
      )
    ORDER BY j.restaurant_id, j.id
  LOOP
    PERFORM private_finance.release_restaurant_video_gifts(v_job.id, 'repair_preexisting_failed_video_gift');
  END LOOP;
END
$video_gift_repair$;

COMMIT;
