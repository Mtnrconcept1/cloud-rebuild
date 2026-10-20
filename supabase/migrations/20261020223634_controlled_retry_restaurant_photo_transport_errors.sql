CREATE OR REPLACE FUNCTION public.preserve_terminal_restaurant_image_truth_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Settlement replaces model evidence; retain the batch audit and lifetime cap.
  IF OLD.evidence ->> 'technical_retry_batch' = 'tok_openai_400_20261021' THEN
    NEW.evidence := COALESCE(NEW.evidence, '{}'::jsonb) || jsonb_build_object(
      'technical_retry_batch', OLD.evidence -> 'technical_retry_batch',
      'technical_retry_previous_reason', OLD.evidence -> 'technical_retry_previous_reason',
      'technical_retry_queued_at', OLD.evidence -> 'technical_retry_queued_at');
  END IF;
  -- Only the internal bounded repair RPC may reopen this technical failure.
  -- Ordinary conflict-upserts retain the immutable terminal decision below.
  IF OLD.status = 'rejected' AND OLD.decision_reason = 'openai_http_400'
    AND NEW.status = 'queued'
    AND (auth.role() = 'service_role' OR current_setting('role', true) = 'service_role')
    AND current_setting('app.tok_photo_retry_batch', true) = 'tok_openai_400_20261021'
    AND NEW.evidence ->> 'technical_retry_batch' = 'tok_openai_400_20261021'
    AND NOT (OLD.evidence ? 'technical_retry_batch')
    AND NEW.id = OLD.id AND NEW.restaurant_id = OLD.restaurant_id
    AND NEW.candidate_url IS NOT DISTINCT FROM OLD.candidate_url
    AND NEW.source_url IS NOT DISTINCT FROM OLD.source_url
    AND NEW.image_sha256 IS NOT DISTINCT FROM OLD.image_sha256
    AND NEW.decision_reason IS NOT DISTINCT FROM OLD.decision_reason
  THEN
    RETURN NEW;
  END IF;

  -- Candidate discovery uses conflict-safe upserts. A later crawl must never
  -- silently turn a final decision back into an automatic queue item.
  IF OLD.status IN ('verified', 'rejected', 'manual_review')
    AND NEW.status IN ('queued', 'retry')
  THEN
    NEW.status := OLD.status;
    NEW.attempts := OLD.attempts;
    NEW.next_attempt_at := OLD.next_attempt_at;
    NEW.lease_token := NULL;
    NEW.lease_expires_at := NULL;
    NEW.image_sha256 := OLD.image_sha256;
    NEW.mime_type := OLD.mime_type;
    NEW.size_bytes := OLD.size_bytes;
    NEW.image_kind := OLD.image_kind;
    NEW.confidence := OLD.confidence;
    NEW.decision_reason := OLD.decision_reason;
    NEW.reviewed_by_model := OLD.reviewed_by_model;
    NEW.evidence := OLD.evidence;
    NEW.reviewed_at := OLD.reviewed_at;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.preserve_terminal_restaurant_image_truth_review()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.service_retry_restaurant_photo_transport_errors()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_remaining integer;
  v_count integer;
  v_prior_flag text := current_setting('app.tok_photo_retry_batch', true);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND current_setting('role', true) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  -- Serialize the one batch so concurrent repair calls cannot exceed 35 total.
  PERFORM pg_advisory_xact_lock(20261021, 400);
  SELECT GREATEST(0, 35 - count(*)::integer) INTO v_remaining
  FROM public.restaurant_image_truth_reviews
  WHERE evidence ->> 'technical_retry_batch' = 'tok_openai_400_20261021';
  PERFORM set_config('app.tok_photo_retry_batch', 'tok_openai_400_20261021', true);
  WITH candidates AS (
    SELECT review.id
    FROM public.restaurant_image_truth_reviews AS review
    JOIN public.restaurants AS restaurant ON restaurant.id = review.restaurant_id
    WHERE review.status = 'rejected' AND review.decision_reason = 'openai_http_400'
      AND NOT (review.evidence ? 'technical_retry_batch')
      AND review.candidate_url ~* '^https?://[^[:space:]]+$'
      AND review.source_url ~* '^https?://[^[:space:]]+$'
      AND COALESCE(restaurant.is_active, false)
      AND COALESCE(restaurant.is_directory_listing, false)
      AND COALESCE(restaurant.directory_public_name_verified, false)
      AND NULLIF(btrim(restaurant.image_url), '') IS NULL
    ORDER BY review.created_at, review.id
    FOR UPDATE OF review SKIP LOCKED
    LIMIT v_remaining
  )
  UPDATE public.restaurant_image_truth_reviews AS review
  SET status = 'queued', next_attempt_at = now(), lease_token = NULL,
      lease_expires_at = NULL, updated_at = now(),
      evidence = review.evidence || jsonb_build_object(
        'technical_retry_batch', 'tok_openai_400_20261021',
        'technical_retry_previous_reason', review.decision_reason,
        'technical_retry_queued_at', now())
  FROM candidates WHERE review.id = candidates.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.tok_photo_retry_batch', COALESCE(v_prior_flag, ''), true);
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.service_retry_restaurant_photo_transport_errors()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_retry_restaurant_photo_transport_errors()
  TO service_role;

NOTIFY pgrst, 'reload schema';
