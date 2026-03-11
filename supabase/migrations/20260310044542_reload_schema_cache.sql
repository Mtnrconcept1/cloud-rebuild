-- This migration forces PostgREST to reload its schema cache
-- so that newly created tables (cuisines, collections, etc.) become visible via the REST API.

NOTIFY pgrst, 'reload schema';
