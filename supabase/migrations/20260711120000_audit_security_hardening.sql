-- Security hardening following the 2026-07-11 production audit.
-- Some SECURITY DEFINER worker functions were recreated after their original grants
-- had been restricted, which restored PostgreSQL's default PUBLIC EXECUTE grant.

REVOKE ALL ON FUNCTION public.enqueue_image_analysis_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_image_analysis_jobs(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_image_analysis_job_by_image_id(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_image_analysis_job(uuid, uuid, text, text, text, text, text, text[], text[], text[], text[], text[], text[], text[], text, boolean, boolean, boolean, boolean, numeric, jsonb, extensions.vector) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_image_analysis_job(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_image_analysis_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_image_analysis_jobs(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_image_analysis_job_by_image_id(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_image_analysis_job(uuid, uuid, text, text, text, text, text, text[], text[], text[], text[], text[], text[], text[], text, boolean, boolean, boolean, boolean, numeric, jsonb, extensions.vector) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_image_analysis_job(uuid, uuid, text) TO service_role;

-- Pin the search path of Stripe helper functions flagged by the database advisor.
ALTER FUNCTION stripe.set_updated_at() SET search_path = stripe, pg_catalog;
ALTER FUNCTION stripe.set_updated_at_metadata() SET search_path = stripe, pg_catalog;
ALTER FUNCTION stripe.check_rate_limit(text, integer, integer) SET search_path = stripe, pg_catalog;

NOTIFY pgrst, 'reload schema';
