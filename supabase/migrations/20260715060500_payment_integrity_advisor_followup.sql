-- Follow-up from the isolated Supabase preview advisor.
-- Covers the only new unindexed foreign key reported for the payment-integrity
-- tables.  The partial predicate keeps the index compact for nullable actors.
CREATE INDEX IF NOT EXISTS idx_commercial_statements_created_by_fk
  ON public.commercial_statements (created_by)
  WHERE created_by IS NOT NULL;
