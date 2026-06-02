-- Production operations hotfixes.
-- A trigger-returning function cannot be called by pg_cron directly, so this
-- migration adds a normal callable synchronization wrapper and removes public
-- execute grants from sensitive RPCs.

CREATE OR REPLACE FUNCTION public.run_social_post_promotion_status_sync()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE public.social_post_promotions spp
  SET
    status = CASE
      WHEN ac.payment_status = 'paid' AND ac.status = 'active' THEN 'active'
      WHEN ac.status = 'paused' THEN 'paused'
      WHEN ac.status = 'ended' THEN 'ended'
      ELSE 'pending_payment'
    END,
    updated_at = now()
  FROM public.ad_campaigns ac
  WHERE spp.campaign_id = ac.id
    AND spp.status IS DISTINCT FROM CASE
      WHEN ac.payment_status = 'paid' AND ac.status = 'active' THEN 'active'
      WHEN ac.status = 'paused' THEN 'paused'
      WHEN ac.status = 'ended' THEN 'ended'
      ELSE 'pending_payment'
    END;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'tok-sync-social-post-promotions';

    PERFORM cron.schedule(
      'tok-sync-social-post-promotions',
      '*/5 * * * *',
      'select public.run_social_post_promotion_status_sync();'
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_review_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_noshow_reservations() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_groups() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_social_post_promotion_status_sync() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_review_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_noshow_reservations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_groups() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_social_post_promotion_status_sync() TO service_role;

NOTIFY pgrst, 'reload schema';
