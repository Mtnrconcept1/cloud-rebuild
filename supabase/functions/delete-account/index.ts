import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("delete-account");
  let actor;
  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    // GDPR cascade: anonymize PII in metadata, delete storage, then delete auth.users row.
    // This RPC handles everything atomically — including the auth.users deletion.
    const { error: rpcError } = await actor.adminClient.rpc("delete_user_gdpr_cascade", {
      p_user_id: actor.userId,
    });

    if (rpcError) {
      log.error("gdpr_cascade_failed", { message: rpcError.message });
      // Fall back to plain auth deletion so the user isn't stuck.
      const { error } = await actor.adminClient.auth.admin.deleteUser(actor.userId);
      if (error) throw new HttpError(500, error.message);
    }

    log.info("user_deleted");

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: "delete-account",
      status: "success",
      action: "delete_user",
      actor,
      request: req,
      targetEntityType: "user",
      targetEntityId: actor.userId,
    });

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal error";

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: "delete-account",
        status: "failure",
        action: "delete_user",
        actor,
        request: req,
        errorMessage: message,
      }).catch(() => {});
    }

    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
