import { authenticateRequest, jsonResponse, writeAuditLog } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("close-due-match-groups");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, {
      allowServiceRole: true,
      allowSchedulerSecret: true,
    });

    const { data, error } = await actor.adminClient.rpc("close_due_match_groups");
    if (error) throw error;

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "close-due-match-groups",
      action: "close_due_groups",
      status: "success",
      targetEntityType: "order_groups",
      metadata: { closed_count: Number(data || 0) },
    });

    return jsonResponse({ ok: true, closed_count: Number(data || 0) }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur fermeture groupes";
    log.error("close_due_groups_failed", { message });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "close-due-match-groups",
        action: "close_due_groups",
        status: "failure",
        targetEntityType: "order_groups",
        errorMessage: message,
      });
    }

    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
