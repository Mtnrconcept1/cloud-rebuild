-- Allow anonymous users to insert tracking data
-- This is necessary for analytics to work for non-logged in users.

-- 1. Grant INSERT permissions to anon role
GRANT INSERT ON public.search_logs TO anon;
GRANT INSERT ON public.impressions TO anon;
GRANT INSERT ON public.clicks TO anon;
GRANT INSERT ON public.event_store TO anon;

-- 2. Update RLS policies to allow anonymous inserts

-- search_logs
DROP POLICY IF EXISTS "Require auth for search_logs" ON public.search_logs;
CREATE POLICY "Allow anyone to insert search_logs" ON public.search_logs
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own search_logs" ON public.search_logs
    FOR SELECT USING (auth.uid() = user_id);

-- impressions
DROP POLICY IF EXISTS "Require auth for impressions" ON public.impressions;
CREATE POLICY "Allow anyone to insert impressions" ON public.impressions
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own impressions" ON public.impressions
    FOR SELECT USING (auth.uid() = user_id);

-- clicks
DROP POLICY IF EXISTS "Require auth for clicks" ON public.clicks;
CREATE POLICY "Allow anyone to insert clicks" ON public.clicks
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own clicks" ON public.clicks
    FOR SELECT USING (auth.uid() = user_id);

-- event_store
DROP POLICY IF EXISTS "Require auth for event_store" ON public.event_store;
CREATE POLICY "Allow anyone to insert event_store" ON public.event_store
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own event_store" ON public.event_store
    FOR SELECT USING (
        auth.uid() = entity_id OR 
        (payload->>'user_id')::uuid = auth.uid()
    );

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
