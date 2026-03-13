import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
        from: Deno.env.get("EMAIL_FROM") || "Miamz <noreply@miamz.ch>",
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

  console.log(`[Email] (No RESEND_API_KEY) To: ${payload.to}, Subject: ${payload.subject}`);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowSchedulerSecret: true });
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

    let notificationQuery = supabaseAdmin
      .from("notification_deliveries")
      .select("id, target, notifications!inner(*)")
      .eq("channel", "email")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(10);

    if (userIdFilter) {
      notificationQuery = notificationQuery.eq("notifications.user_id", userIdFilter);
    }

    const { data: notificationEmails, error: notificationEmailError } = await notificationQuery;

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
      }
    }

    for (const delivery of notificationEmails || []) {
      const notification = (delivery as any).notifications;
      const target = delivery.target || notification?.target || null;

      if (!notification || !target) {
        await supabaseAdmin
          .from("notification_deliveries")
          .update({ status: "failed", last_error: "Notification or target email missing" })
          .eq("id", delivery.id);
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

        await supabaseAdmin
          .from("notification_deliveries")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", delivery.id);

        notificationProcessed++;
      } catch (deliveryError: unknown) {
        const errMsg = deliveryError instanceof Error ? deliveryError.message : "Unknown error";
        await supabaseAdmin
          .from("notification_deliveries")
          .update({ status: "failed", last_error: errMsg })
          .eq("id", delivery.id);
      }
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "send-email",
      action: "process_email_queue",
      status: "success",
      targetEntityType: "email_queue",
      metadata: {
        queued_processed: queuedProcessed,
        notification_processed: notificationProcessed,
        processed: queuedProcessed + notificationProcessed,
        user_id: userIdFilter,
      },
    });

    return jsonResponse(
      {
        processed: queuedProcessed + notificationProcessed,
        queued_processed: queuedProcessed,
        notification_processed: notificationProcessed,
      },
      200,
      corsHeaders,
    );
  } catch (error: unknown) {
    console.error("send-email error:", error);
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
