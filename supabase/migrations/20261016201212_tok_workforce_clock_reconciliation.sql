-- Complete the existing supervisor regularization flow without changing punches.
ALTER TABLE public.tok_workforce_clock_sessions
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reconciliation_reason text;
CREATE UNIQUE INDEX IF NOT EXISTS tok_workforce_clock_entry_once
  ON public.tok_workforce_clock_sessions(entry_id) WHERE entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tok_workforce_reconcile_clock(
  p_session_id uuid, p_entry_id uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_session public.tok_workforce_clock_sessions%ROWTYPE;
  v_entry public.tok_workforce_time_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_session FROM public.tok_workforce_clock_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_session.id IS NULL OR NOT public.tok_workforce_can_schedule(v_session.restaurant_id)
  THEN RAISE EXCEPTION 'Unauthorized time clock session'; END IF;
  IF v_session.clock_out_at IS NULL THEN RAISE EXCEPTION 'An active session cannot be reconciled'; END IF;
  IF v_session.entry_id IS NOT NULL THEN
    IF v_session.entry_id=p_entry_id THEN RETURN jsonb_build_object('entry_id',v_session.entry_id,'replayed',true); END IF;
    RAISE EXCEPTION 'Session already reconciled';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 5 AND 1000
  THEN RAISE EXCEPTION 'A reason between 5 and 1000 characters is required'; END IF;
  SELECT * INTO v_entry FROM public.tok_workforce_time_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR v_entry.restaurant_id<>v_session.restaurant_id
    OR v_entry.employee_id<>v_session.employee_id
    OR v_entry.entry_date<>(v_session.clock_in_at AT TIME ZONE 'Europe/Zurich')::date
  THEN RAISE EXCEPTION 'Entry must belong to the same employee, restaurant and date'; END IF;
  IF EXISTS(SELECT 1 FROM public.tok_workforce_clock_sessions WHERE entry_id=p_entry_id)
  THEN RAISE EXCEPTION 'Entry already linked to a time clock session'; END IF;
  -- Keep signed records immutable: link only a manual entry awaiting validation.
  IF EXISTS(SELECT 1 FROM public.tok_workforce_validations WHERE time_entry_id=p_entry_id)
  THEN RAISE EXCEPTION 'Choose an unsigned entry'; END IF;
  UPDATE public.tok_workforce_clock_sessions SET entry_id=p_entry_id,
    reconciled_at=clock_timestamp(),reconciled_by=auth.uid(),reconciliation_reason=btrim(p_reason),updated_at=clock_timestamp()
  WHERE id=p_session_id;
  RETURN jsonb_build_object('entry_id',p_entry_id,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.tok_workforce_reconcile_clock(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tok_workforce_reconcile_clock(uuid,uuid,text) TO authenticated;
