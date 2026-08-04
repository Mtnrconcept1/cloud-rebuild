-- Index the time-only window scan on edge_function_audit_logs.
--
-- Every incident scanner and admin dashboard reads this table with
--   WHERE created_at >= $1 ORDER BY created_at DESC LIMIT $2
-- but no index carried created_at as its leading column: the existing ones are
-- (status, created_at), (function_name, created_at), (actor_user_id, created_at)
-- and a partial one on request_metadata->>'ip'. Postgres therefore fell back to
-- scanning an entire index and sorting the result.
--
-- Measured on production before this migration: 808 ms to return 268 rows for a
-- one-hour window, and the plan below confirmed the fallback.
--   Limit -> Sort (Sort Key: created_at DESC)
--     -> Index Scan using idx_edge_function_audit_logs_status_created_10k
--          Index Cond: (created_at >= ...)
--
-- That query was the single heaviest statement on the instance in
-- pg_stat_statements: 1,447,857 calls for 20.5 hours of cumulative execution
-- time over an 84-day window, roughly twice the next entry. The contention it
-- created is the most likely explanation for the auth timeouts observed on
-- POST /token ("context deadline exceeded", "error finding user: context
-- canceled") during load peaks.
--
-- Read-only supervision data: adding an index changes no row and no policy.
-- Production execution remains owned by GitHub Actions migrations.

CREATE INDEX IF NOT EXISTS idx_edge_function_audit_logs_created_at
  ON public.edge_function_audit_logs (created_at DESC);
