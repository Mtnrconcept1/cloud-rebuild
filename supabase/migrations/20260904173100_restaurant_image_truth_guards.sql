-- Additional race and idempotence guards for the restaurant image truth queue.

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_image_truth_verified_sha256
  ON public.restaurant_image_truth_reviews (image_sha256)
  WHERE status = 'verified'
    AND image_sha256 IS NOT NULL;

CREATE OR REPLACE FUNCTION public.preserve_terminal_restaurant_image_truth_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
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

DROP TRIGGER IF EXISTS trg_preserve_terminal_restaurant_image_truth_review
  ON public.restaurant_image_truth_reviews;
CREATE TRIGGER trg_preserve_terminal_restaurant_image_truth_review
BEFORE UPDATE ON public.restaurant_image_truth_reviews
FOR EACH ROW
EXECUTE FUNCTION public.preserve_terminal_restaurant_image_truth_review();

REVOKE ALL ON FUNCTION public.preserve_terminal_restaurant_image_truth_review()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
