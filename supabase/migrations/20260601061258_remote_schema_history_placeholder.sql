-- This no-op migration restores the local migration marker for a version
-- already present in the production Supabase migration history.
--
-- Supabase `db push --linked` fails when a remote migration version is not
-- present in the local migrations directory, even if no new SQL needs to run.
-- Keep this file so local migration history stays aligned with production.

select 1;
