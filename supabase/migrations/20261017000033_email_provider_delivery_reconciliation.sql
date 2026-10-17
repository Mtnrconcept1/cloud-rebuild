-- Provider observation is separate from queue acknowledgement. A GET failure
-- or sending-only API key never converts an accepted message into a failure.
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS provider_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS provider_checked_at timestamptz;
ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS provider_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS provider_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS email_queue_provider_reconciliation_idx
  ON public.email_queue(provider_checked_at ASC NULLS FIRST, sent_at)
  WHERE status = 'sent' AND provider_message_id IS NOT NULL
    AND provider_status NOT IN ('delivered', 'bounced', 'complained', 'failed');
CREATE INDEX IF NOT EXISTS notification_email_provider_reconciliation_idx
  ON public.notification_deliveries(provider_checked_at ASC NULLS FIRST, sent_at)
  WHERE channel = 'email' AND status = 'sent' AND provider_message_id IS NOT NULL
    AND provider_status NOT IN ('delivered', 'bounced', 'complained', 'failed');

COMMENT ON COLUMN public.email_queue.provider_status IS
  'Observed Resend last_event from authenticated GET /emails/:id; delivered means recipient server accepted, not human read. unknown is no verified observation.';
COMMENT ON COLUMN public.notification_deliveries.provider_status IS
  'Observed Resend last_event; independent of queue status sent. Never inferred from API send acceptance or a failed status poll.';
COMMENT ON COLUMN public.email_queue.provider_checked_at IS
  'Last bounded provider poll attempt, including unsupported sending-only API keys. No delivery claim is inferred from this timestamp.';
COMMENT ON COLUMN public.notification_deliveries.provider_checked_at IS
  'Last bounded provider poll attempt; delivery evidence is in provider_status only.';
