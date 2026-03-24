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
    const canProcessGlobally = actor.isAdmin || actor.isServiceRole || actor.authMode === "scheduler_secret";
    const scopedUserId = canProcessGlobally ? null : actor.userId;

    if (!canProcessGlobally && !scopedUserId) {
      throw new HttpError(401, "Unauthorized");
    }

    if (!canProcessGlobally && payload?.user_id) {
      throw new HttpError(403, "Forbidden");
    }

    const dispatchResult = await triggerNotificationDispatch({
      source,
      push,
      email,
      userId: scopedUserId || undefined,
    });

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
        scoped_user_id: scopedUserId,
        attempted_channels: dispatchResult.attemptedChannels,
        failed_channels: dispatchResult.failedChannels,
      },
    });

    return jsonResponse({
      ok: dispatchResult.failedChannels.length === 0,
      push,
      email,
      source,
      scoped_user_id: scopedUserId,
      attempted_channels: dispatchResult.attemptedChannels,
      channel_errors: dispatchResult.failedChannels,
    }, 200, corsHeaders);
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
