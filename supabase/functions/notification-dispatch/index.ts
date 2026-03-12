import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { triggerNotificationDispatch } from "../_shared/notifications.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowSchedulerSecret: true });

    const payload = await req.json().catch(() => ({}));
    const push = payload?.push !== false;
    const email = payload?.email !== false;
    const source = typeof payload?.source === "string" && payload.source.trim().length > 0
      ? payload.source.trim()
      : "notification-dispatch";

    await triggerNotificationDispatch({ source, push, email });

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "notification-dispatch",
      action: "flush_notification_queue",
      status: "success",
      targetEntityType: "notification_deliveries",
      metadata: {
        push,
        email,
        source,
      },
    });

    return jsonResponse({ ok: true, push, email, source }, 200, corsHeaders);
  } catch (error) {
    console.error("notification-dispatch error:", error);
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "notification-dispatch",
      action: "flush_notification_queue",
      status: "failure",
      targetEntityType: "notification_deliveries",
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
