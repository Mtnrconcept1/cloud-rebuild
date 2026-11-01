-- Disposable PostgreSQL fixture only. NEVER run against production.
-- Load marketing_growth_autopilot_fixture, marketing_growth_autopilot,
-- marketing_growth_noon_refresh and the KPI epoch migration in that order.
BEGIN;
UPDATE public.marketing_acquisition_touches SET touched_at = timestamptz '2026-10-31 22:00:00+00';
UPDATE public.restaurant_contracts SET signed_at = timestamptz '2026-10-31 22:00:00+00'
  WHERE accepted_contract IS TRUE;
SET ROLE service_role;
SET request.jwt.claims = '{"role":"service_role"}';
SELECT public.service_run_marketing_growth_autopilot(50);
RESET ROLE;
RESET request.jwt.claims;
DO $verify$
DECLARE
  v_noon timestamptz := (((now() AT TIME ZONE 'Europe/Zurich')::date::timestamp
    + interval '12 hours') AT TIME ZONE 'Europe/Zurich');
  v_metrics jsonb;
BEGIN
  IF now() < v_noon THEN
    IF EXISTS(SELECT 1 FROM public.marketing_growth_snapshots WHERE local_date=(now() AT TIME ZONE 'Europe/Zurich')::date)
    THEN RAISE EXCEPTION 'Premature snapshot'; END IF;
  ELSE
    SELECT metrics INTO v_metrics FROM public.marketing_growth_snapshots
    WHERE local_date=(now() AT TIME ZONE 'Europe/Zurich')::date;
    IF v_metrics IS NULL OR v_metrics->>'kpi_start_local_date'<>'2026-11-01'
      OR (v_metrics->>'acquisition_touches')::integer<>0
      OR (v_metrics->>'restaurant_contracts_signed')::integer<>0
    THEN RAISE EXCEPTION 'Pre-epoch data leaked into TOK KPI'; END IF;
  END IF;
END;
$verify$;
ROLLBACK;
