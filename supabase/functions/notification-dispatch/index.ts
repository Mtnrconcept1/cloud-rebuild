import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { triggerNotificationDispatch } from "../_shared/notifications.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("notification-dispatch");

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
    const dispatchDueCampaigns = canProcessGlobally && payload?.dispatch_due_campaigns !== false;
    const dueCampaignLimit = typeof payload?.due_campaign_limit === "number"
      ? Math.max(1, Math.min(100, Math.trunc(payload.due_campaign_limit)))
      : 25;
    let dueCampaigns: unknown[] = [];

    if (!canProcessGlobally && !scopedUserId) {
      throw new HttpError(401, "Unauthorized");
    }

    if (!canProcessGlobally && payload?.user_id) {
      throw new HttpError(403, "Forbidden");
    }

    if (dispatchDueCampaigns) {
      const { data: dueCampaignData, error: dueCampaignError } = await actor.adminClient.rpc(
        "dispatch_due_notification_campaigns",
        { p_limit: dueCampaignLimit },
      );

      if (dueCampaignError) {
        throw dueCampaignError;
      }

      dueCampaigns = Array.isArray(dueCampaignData) ? dueCampaignData : [];
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
        due_campaigns: dueCampaigns.length,
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
      due_campaigns: dueCampaigns,
      attempted_channels: dispatchResult.attemptedChannels,
      channel_errors: dispatchResult.failedChannels,
    }, 200, corsHeaders);
  } catch (error) {
    log.error("notification-dispatch error", { message: error instanceof Error ? error.message : "unknown" });
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
