-- Count only non-failed video jobs towards the rolling 24-hour restaurant quota.
-- Preserve idempotency, every privilege and all charging/refund logic unchanged.
DO $tok_video_quota$
DECLARE
  definition text;
  previous text := 'WHERE restaurant_id = p_restaurant_id AND created_at > now() - interval ''24 hours'') >= 3';
  corrected text := 'WHERE restaurant_id = p_restaurant_id AND created_at > now() - interval ''24 hours'' AND status <> ''failed'') >= 3';
BEGIN
  SELECT pg_get_functiondef(
    'public.reserve_restaurant_video_generation(uuid,uuid,uuid,text,integer,text,text,boolean,uuid,integer)'::regprocedure
  ) INTO definition;
  IF definition IS NULL OR strpos(definition, previous) = 0 THEN
    RAISE EXCEPTION 'tok_video_quota_definition_drift';
  END IF;
  EXECUTE replace(definition, previous, corrected);
END
$tok_video_quota$;
