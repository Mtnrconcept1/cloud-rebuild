-- Keep photo AI credit spending aligned with the real estimated OpenAI cost.
-- Historical rows may have stored 1 credit while estimated_cost_chf already
-- showed a higher cost. The billing RPC reads metadata.credit_units, so the
-- log itself must carry the billable credit count.

CREATE OR REPLACE FUNCTION public.normalize_photo_ai_usage_credit_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current_units integer := 1;
  v_estimated_units integer := 1;
  v_requested_output_units integer := 1;
  v_metadata jsonb := COALESCE(NEW.metadata, '{}'::jsonb);
BEGIN
  IF NEW.status = 'success'
    AND (
      v_metadata->>'credit_kind' = 'photo_retouch'
      OR NEW.function_name = 'ai-image-enhance'
    )
  THEN
    IF (v_metadata->>'credit_units') ~ '^[0-9]+$' THEN
      v_current_units := GREATEST((v_metadata->>'credit_units')::integer, 1);
    END IF;
    IF (v_metadata->>'requested_output_credit_units') ~ '^[0-9]+$' THEN
      v_requested_output_units := GREATEST((v_metadata->>'requested_output_credit_units')::integer, 1);
    END IF;

    v_estimated_units := GREATEST(
      CEIL(GREATEST(COALESCE(NEW.estimated_cost_chf, 0), 0) / 0.015)::integer,
      v_requested_output_units,
      1
    );

    IF v_estimated_units > v_current_units THEN
      v_metadata := jsonb_set(
        v_metadata,
        '{previous_credit_units}',
        to_jsonb(v_current_units),
        true
      );
      v_metadata := jsonb_set(
        v_metadata,
        '{credit_units}',
        to_jsonb(v_estimated_units),
        true
      );
      v_metadata := jsonb_set(
        v_metadata,
        '{billing_credit_source}',
        to_jsonb('estimated_total_cost'::text),
        true
      );
    END IF;

    v_metadata := jsonb_set(
      v_metadata,
      '{photo_credit_chf}',
      to_jsonb(0.015::numeric),
      true
    );
    NEW.metadata := v_metadata;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_photo_ai_usage_credit_units ON public.ai_usage_logs;
CREATE TRIGGER normalize_photo_ai_usage_credit_units
BEFORE INSERT OR UPDATE OF estimated_cost_chf, metadata, status, function_name
ON public.ai_usage_logs
FOR EACH ROW
EXECUTE FUNCTION public.normalize_photo_ai_usage_credit_units();

UPDATE public.ai_usage_logs
SET metadata = metadata
WHERE status = 'success'
  AND (
    metadata->>'credit_kind' = 'photo_retouch'
    OR function_name = 'ai-image-enhance'
  )
  AND GREATEST(
    CEIL(GREATEST(COALESCE(estimated_cost_chf, 0), 0) / 0.015)::integer,
    COALESCE(
      CASE
        WHEN (metadata->>'requested_output_credit_units') ~ '^[0-9]+$'
        THEN (metadata->>'requested_output_credit_units')::integer
      END,
      1
    ),
    1
  ) > GREATEST(
    COALESCE(
      CASE
        WHEN (metadata->>'credit_units') ~ '^[0-9]+$'
        THEN (metadata->>'credit_units')::integer
      END,
      1
    ),
    1
  );

REVOKE ALL ON FUNCTION public.normalize_photo_ai_usage_credit_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_photo_ai_usage_credit_units() TO service_role;
