-- Prevent browser/API direct reads from exposing TOK Connect webhook signing
-- secrets. Edge Functions keep service_role access for signing deliveries.

BEGIN;

REVOKE SELECT ON public.tok_connect_webhook_endpoints FROM authenticated;

GRANT SELECT (
  id,
  partner_id,
  url,
  events,
  status,
  created_by,
  last_rotated_at,
  metadata,
  created_at,
  updated_at
) ON public.tok_connect_webhook_endpoints TO authenticated;

GRANT ALL ON public.tok_connect_webhook_endpoints TO service_role;

COMMIT;
