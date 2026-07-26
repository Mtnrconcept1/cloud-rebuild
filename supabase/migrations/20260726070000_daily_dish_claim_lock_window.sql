-- The daily-dish generation now allows up to two 100-second AI calls
-- (supplier research with web search, then the structured proposals). The
-- previous 3-minute stale-lock window could let a second visitor steal the
-- lock while a legitimate generation was still running, producing a second
-- paid AI run whose persistence was then silently dropped by the lock_token
-- guard. Widen the recovery window to 5 minutes to cover the new budget.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_restaurant_daily_dish_run(
  p_restaurant_id uuid,
  p_generation_date date,
  p_requested_by uuid,
  p_request_id uuid,
  p_lock_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.restaurant_daily_dish_runs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_restaurant_id IS NULL OR p_generation_date IS NULL OR p_requested_by IS NULL
     OR p_request_id IS NULL OR p_lock_token IS NULL THEN
    RAISE EXCEPTION 'invalid daily dish claim' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'daily-dish:' || p_restaurant_id::text || ':' || p_generation_date::text,
      0
    )
  );

  SELECT * INTO v_run
  FROM public.restaurant_daily_dish_runs run
  WHERE run.restaurant_id = p_restaurant_id
    AND run.generation_date = p_generation_date
  FOR UPDATE;

  IF v_run.id IS NULL THEN
    INSERT INTO public.restaurant_daily_dish_runs (
      restaurant_id, generation_date, requested_by, request_id, lock_token
    ) VALUES (
      p_restaurant_id, p_generation_date, p_requested_by, p_request_id, p_lock_token
    ) RETURNING * INTO v_run;
    RETURN jsonb_build_object('state', 'claimed', 'run_id', v_run.id);
  END IF;

  IF v_run.status = 'completed' THEN
    RETURN jsonb_build_object('state', 'replay', 'run_id', v_run.id);
  END IF;
  IF v_run.status = 'generating' AND v_run.locked_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('state', 'in_progress', 'run_id', v_run.id);
  END IF;

  UPDATE public.restaurant_daily_dish_runs
  SET status = 'generating', requested_by = p_requested_by, request_id = p_request_id,
      lock_token = p_lock_token, locked_at = now(), error_code = NULL,
      completed_at = NULL, research_snapshot = '{}'::jsonb, sources = '[]'::jsonb
  WHERE id = v_run.id
  RETURNING * INTO v_run;

  RETURN jsonb_build_object('state', 'claimed', 'run_id', v_run.id, 'recovered', true);
END
$$;

REVOKE ALL ON FUNCTION public.claim_restaurant_daily_dish_run(uuid, date, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_daily_dish_run(uuid, date, uuid, uuid, uuid)
  TO service_role;

COMMIT;
