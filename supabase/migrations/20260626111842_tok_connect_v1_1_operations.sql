BEGIN;

ALTER TABLE public.tok_connect_webhook_deliveries
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz;

ALTER TABLE public.tok_connect_webhook_deliveries
  ADD COLUMN IF NOT EXISTS response_body text;

CREATE INDEX IF NOT EXISTS idx_tok_connect_webhook_deliveries_retry
  ON public.tok_connect_webhook_deliveries(status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_tok_connect_access_tokens_client_revoked
  ON public.tok_connect_access_tokens(client_id, revoked_at);

COMMIT;
