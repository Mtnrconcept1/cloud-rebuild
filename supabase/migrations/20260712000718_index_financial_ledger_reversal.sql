CREATE INDEX IF NOT EXISTS idx_financial_ledger_reversal_of
  ON public.financial_ledger (reversal_of)
  WHERE reversal_of IS NOT NULL;
