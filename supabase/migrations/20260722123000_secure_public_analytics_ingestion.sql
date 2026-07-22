-- Public analytics must pass through the rate-limited track-analytics Edge Function.
-- Direct PostgREST inserts bypass payload validation, deduplication and abuse controls.

REVOKE INSERT ON public.search_logs FROM anon, authenticated;
REVOKE INSERT ON public.impressions FROM anon, authenticated;
REVOKE INSERT ON public.clicks FROM anon, authenticated;
REVOKE INSERT ON public.event_store FROM anon, authenticated;

DROP POLICY IF EXISTS "Allow anyone to insert search_logs" ON public.search_logs;
DROP POLICY IF EXISTS "Allow anyone to insert impressions" ON public.impressions;
DROP POLICY IF EXISTS "Allow anyone to insert clicks" ON public.clicks;
DROP POLICY IF EXISTS "Allow anyone to insert event_store" ON public.event_store;

NOTIFY pgrst, 'reload schema';
