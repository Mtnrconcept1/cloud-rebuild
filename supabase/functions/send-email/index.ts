import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

async function sendEmailMessage(
  resendApiKey: string | null,
  payload: {
    to: string;
    subject: string;
    text?: string | null;
    html?: string | null;
  },
) {
  if (resendApiKey) {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") || "Tok <noreply@thetok.ch>",
        to: payload.to,
        subject: payload.subject,
        html: payload.html || undefined,
        text: payload.text || undefined,
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      throw new Error(`Resend API error: ${resendResponse.status} - ${errorBody}`);
    }

    return;
  }

  throw new Error("RESEND_API_KEY not configured");
}

function buildNotificationEmailBody(notification: any) {
  const data = notification?.data && typeof notification.data === "object" && !Array.isArray(notification.data)
    ? notification.data
    : {};
  const rawUrl = typeof data.url === "string" ? data.url : null;
  const appBaseUrl = Deno.env.get("APP_BASE_URL") || Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("SITE_URL") || "";
  const fullUrl = rawUrl
    ? (/^https?:\/\//.test(rawUrl) ? rawUrl : `${appBaseUrl}${rawUrl}`)
    : null;

  const textParts = [notification.body];
  if (fullUrl) {
    textParts.push(`Voir le detail : ${fullUrl}`);
  }

  const htmlParts = [`<p>${notification.body}</p>`];
  if (fullUrl) {
    htmlParts.push(`<p><a href="${fullUrl}">Voir le detail</a></p>`);
  }

  return {
    text: textParts.filter(Boolean).join("\n\n"),
    html: htmlParts.join(""),
  };
}

async function settleNotificationDelivery(
  supabaseAdmin: any,
  input: {
    id: string;
    leaseToken: string;
    success: boolean;
    terminal?: boolean;
    terminalStatus?: "failed" | "skipped";
    lastError?: string | null;
  },
) {
  const { error } = await supabaseAdmin.rpc("settle_notification_delivery", {
    p_delivery_id: input.id,
    p_lease_token: input.leaseToken,
    p_success: input.success,
    p_terminal: input.terminal ?? false,
    p_terminal_status: input.terminalStatus ?? "failed",
    p_last_error: input.lastError ?? null,
    p_provider: "resend",
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("send-email");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, {
      allowSchedulerSecret: true,
      allowServiceRole: true,
    });
    requireRole(actor, ["admin"]);
    const body = await req.json().catch(() => ({}));
    const userIdFilter = typeof body?.user_id === "string" && body.user_id.trim().length > 0
      ? body.user_id.trim()
      : null;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const { data: emails, error } = userIdFilter
      ? { data: [], error: null }
      : await supabaseAdmin
        .from("email_queue")
        .select("*")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(10);

    const { data: notificationEmails, error: notificationEmailError } = await supabaseAdmin.rpc(
      "claim_notification_deliveries",
      {
        p_channel: "email",
        p_limit: 10,
        p_user_id: userIdFilter,
        p_lease_seconds: 120,
      },
    );

    if (error) throw error;
    if (notificationEmailError) throw notificationEmailError;

    if ((!emails || emails.length === 0) && (!notificationEmails || notificationEmails.length === 0)) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "send-email",
        action: "process_email_queue",
        status: "success",
        targetEntityType: "email_queue",
        metadata: {
          queued_processed: 0,
          notification_processed: 0,
          processed: 0,
          user_id: userIdFilter,
        },
      });
      return jsonResponse({ processed: 0 }, 200, corsHeaders);
    }

    let queuedProcessed = 0;
    let notificationProcessed = 0;
    let queuedFailed = 0;
    let notificationFailed = 0;
    let lastDeliveryError: string | null = null;

    for (const email of emails) {
      try {
        await sendEmailMessage(resendApiKey, {
          to: email.to_email,
          subject: email.subject,
          html: email.body_html || undefined,
          text: email.body_text || email.body || undefined,
        });

        await supabaseAdmin
          .from("email_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", email.id);

        queuedProcessed++;
      } catch (emailError: unknown) {
        const errMsg = emailError instanceof Error ? emailError.message : "Unknown error";
        await supabaseAdmin
          .from("email_queue")
          .update({ status: "failed", error: errMsg })
          .eq("id", email.id);
        queuedFailed++;
        lastDeliveryError = errMsg;
      }
    }

    for (const delivery of notificationEmails || []) {
      const notification = {
        title: delivery.notification_title,
        body: delivery.notification_body,
        data: delivery.notification_data,
      };
      const target = delivery.target || null;

      if (!notification.title || !target) {
        await settleNotificationDelivery(supabaseAdmin, {
          id: delivery.id,
          leaseToken: delivery.lease_token,
          success: false,
          terminal: true,
          terminalStatus: "skipped",
          lastError: "Notification or target email missing",
        });
        continue;
      }

      try {
        const body = buildNotificationEmailBody(notification);
        await sendEmailMessage(resendApiKey, {
          to: target,
          subject: notification.title,
          text: body.text,
          html: body.html,
        });

        await settleNotificationDelivery(supabaseAdmin, {
          id: delivery.id,
          leaseToken: delivery.lease_token,
          success: true,
        });

        notificationProcessed++;
      } catch (deliveryError: unknown) {
        const errMsg = deliveryError instanceof Error ? deliveryError.message : "Unknown error";
        try {
          await settleNotificationDelivery(supabaseAdmin, {
            id: delivery.id,
            leaseToken: delivery.lease_token,
            success: false,
            terminal: false,
            lastError: errMsg,
          });
        } catch (settleError) {
          log.error("Unable to settle notification email delivery", {
            message: settleError instanceof Error ? settleError.message : "unknown",
          });
        }
        notificationFailed++;
        lastDeliveryError = errMsg;
      }
    }

    const failed = queuedFailed + notificationFailed;

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "send-email",
      action: "process_email_queue",
      status: failed > 0 ? "failure" : "success",
      targetEntityType: "email_queue",
      errorMessage: failed > 0 ? lastDeliveryError || `${failed} email(s) en échec` : null,
      metadata: {
        queued_processed: queuedProcessed,
        notification_processed: notificationProcessed,
        queued_failed: queuedFailed,
        notification_failed: notificationFailed,
        processed: queuedProcessed + notificationProcessed + failed,
        sent: queuedProcessed + notificationProcessed,
        failed,
        user_id: userIdFilter,
      },
    });

    return jsonResponse(
      {
        processed: queuedProcessed + notificationProcessed + failed,
        sent: queuedProcessed + notificationProcessed,
        failed,
        queued_processed: queuedProcessed,
        notification_processed: notificationProcessed,
        queued_failed: queuedFailed,
        notification_failed: notificationFailed,
      },
      200,
      corsHeaders,
    );
  } catch (error: unknown) {
    log.error("send-email error", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "send-email",
      action: "process_email_queue",
      status: "failure",
      targetEntityType: "email_queue",
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    const msg = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: msg }, 500, corsHeaders);
  }
});
