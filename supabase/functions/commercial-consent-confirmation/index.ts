import { createAdminClient } from "../_shared/auth.ts";
import { buildCorsHeaders, isRequestOriginAllowed } from "../_shared/cors.ts";
import { createConfirmationHandler } from "../_shared/commercial-consent-confirmation.ts";

// Public mailbox capability, not an authenticated account. Never log request body or tokens.
Deno.serve(createConfirmationHandler({
  rpc: (name, args) => createAdminClient().rpc(name, args),
  originAllowed: isRequestOriginAllowed,
  cors: buildCorsHeaders,
}));
