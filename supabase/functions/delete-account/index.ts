import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor;
  try {
    actor = await authenticateRequest(req);
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    // Delete the user via admin API
    const { error } = await actor.adminClient.auth.admin.deleteUser(actor.userId);
    if (error) throw new HttpError(500, error.message);

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
