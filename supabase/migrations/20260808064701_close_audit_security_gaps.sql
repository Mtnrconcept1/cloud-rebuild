-- Close live diagnostic objects that were created outside the repository and
-- pause Google Actions Center until its service account is configured.

DO $$
BEGIN
  IF to_regprocedure('public.get_open_incidents(timestamp with time zone,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_open_incidents(timestamp with time zone, integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_open_incidents(timestamp with time zone, integer) TO service_role';
  END IF;

  IF to_regprocedure('public.get_open_incidents_summary(timestamp with time zone,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_open_incidents_summary(timestamp with time zone, integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_open_incidents_summary(timestamp with time zone, integer) TO service_role';
  END IF;

  IF to_regprocedure('public.admin_reveal_manual_delivery_target(uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_reveal_manual_delivery_target(uuid, text) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_reveal_manual_delivery_target(uuid, text) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.sync_net_http_response_cache(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.sync_net_http_response_cache(integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sync_net_http_response_cache(integer) TO service_role';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.payment_attempt_lease_lost_dashboard') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.payment_attempt_lease_lost_dashboard SET (security_invoker=true)';
    EXECUTE 'REVOKE ALL ON public.payment_attempt_lease_lost_dashboard FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON public.payment_attempt_lease_lost_dashboard TO service_role';
  END IF;
END;
$$;

DO $$
DECLARE
  v_google_job_id bigint;
BEGIN
  SELECT jobid
  INTO v_google_job_id
  FROM cron.job
  WHERE jobname = 'tok-google-actions-center-sync'
  LIMIT 1;

  IF v_google_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_google_job_id, active := false);
  END IF;
END;
$$;

-- An expired lease superseded by a newer pending snapshot must not be made
-- pending again because the partial unique index intentionally permits only
-- one pending availability row per restaurant and day.
UPDATE public.google_actions_center_outbox AS stuck
SET status = 'abandoned',
    last_error = 'superseded_while_google_sync_paused',
    claim_token = NULL,
    lease_expires_at = NULL
WHERE stuck.status = 'processing'
  AND stuck.lease_expires_at <= now()
  AND EXISTS (
    SELECT 1
    FROM public.google_actions_center_outbox AS pending
    WHERE pending.status = 'pending'
      AND pending.id <> stuck.id
      AND pending.kind = stuck.kind
      AND pending.restaurant_id IS NOT DISTINCT FROM stuck.restaurant_id
      AND pending.reservation_id IS NOT DISTINCT FROM stuck.reservation_id
      AND pending.availability_date IS NOT DISTINCT FROM stuck.availability_date
  );

-- Old availability snapshots cannot be delivered meaningfully after their
-- date. Keep them as auditable abandoned rows instead of replaying stale data.
UPDATE public.google_actions_center_outbox
SET status = 'abandoned',
    last_error = 'expired_while_google_sync_unconfigured',
    claim_token = NULL,
    lease_expires_at = NULL
WHERE status = 'processing'
  AND lease_expires_at <= now()
  AND kind = 'availability'
  AND availability_date < current_date;

-- Future work remains recoverable. Reset the historical runaway attempt
-- counter, but leave the cron paused until credentials have been validated.
UPDATE public.google_actions_center_outbox
SET status = 'pending',
    attempts = 0,
    next_attempt_at = now(),
    last_error = 'google_sync_paused_missing_configuration',
    claim_token = NULL,
    lease_expires_at = NULL
WHERE status = 'processing'
  AND lease_expires_at <= now();

NOTIFY pgrst, 'reload schema';
