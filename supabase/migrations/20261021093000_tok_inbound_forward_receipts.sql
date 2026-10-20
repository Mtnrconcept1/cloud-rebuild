-- Operational receipts only: no sender, subject, message body or attachments.
CREATE TABLE IF NOT EXISTS public.tok_inbound_forward_receipts (
  received_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'blocked')),
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT now(),
  lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
  provider_message_id uuid,
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'sent' OR provider_message_id IS NOT NULL)
);
ALTER TABLE public.tok_inbound_forward_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tok_inbound_forward_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tok_inbound_forward_receipts TO service_role;
COMMENT ON TABLE public.tok_inbound_forward_receipts IS
  'Private inbound forwarding deduplication; sent means provider acceptance, not confirmed delivery.';
