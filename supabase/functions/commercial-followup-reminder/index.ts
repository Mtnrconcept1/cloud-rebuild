import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";

type FollowupRow = {
  source_objectid: number;
  assigned_to: string | null;
  assigned_to_name: string | null;
  next_follow_up_at: string | null;
  status: string;
};

type UserProfileRow = {
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
};

type ReminderPayload = {
  sourceObjectId?: number;
  prospectName?: string;
  prospectAddress?: string;
};

type SmsSendResult = {
  provider: string;
  status: "sent" | "queued" | "skipped" | "failed";
  attempted: boolean;
  error?: string | null;
};

const FUNCTION_NAME = "commercial-followup-reminder";
const APP_URL = getEnv("PUBLIC_APP_URL") || getEnv("APP_BASE_URL") || "https://www.thetok.ch";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: string | null | undefined) {
  return normalizeString(value).replace(/[^\d+]/g, "");
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fr-CH", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Zurich",
  }).format(date);
}

function profileDisplayName(profile: UserProfileRow | null, fallback: string | null | undefined) {
  const firstName = normalizeString(profile?.first_name);
  const lastName = normalizeString(profile?.last_name);
  const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
  return composed || normalizeString(fallback) || "Commercial TOK";
}

async function sendSmsWithWebhook(input: {
  to: string;
  message: string;
  prospectName: string;
  followUpAt: string;
  sourceObjectId: number;
}): Promise<SmsSendResult | null> {
  const webhookUrl = getEnv("SMS_WEBHOOK_URL");
  if (!webhookUrl) return null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const webhookToken = getEnv("SMS_WEBHOOK_TOKEN");
  if (webhookToken) {
    headers.Authorization = `Bearer ${webhookToken}`;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      to: input.to,
      message: input.message,
      source: FUNCTION_NAME,
      prospect_name: input.prospectName,
      source_objectid: input.sourceObjectId,
      follow_up_at: input.followUpAt,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      provider: "sms_webhook",
      status: "failed",
      attempted: true,
      error: `SMS webhook failed: ${response.status} ${body}`,
    };
  }

  return {
    provider: "sms_webhook",
    status: "sent",
    attempted: true,
    error: null,
  };
}

async function sendSmsWithTwilio(input: { to: string; message: string }): Promise<SmsSendResult | null> {
  const accountSid = getEnv("TWILIO_ACCOUNT_SID");
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const from = getEnv("TWILIO_FROM_NUMBER");
  if (!accountSid || !authToken || !from) return null;

  const formData = new URLSearchParams();
  formData.set("To", input.to);
  formData.set("From", from);
  formData.set("Body", input.message);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      provider: "twilio",
      status: "failed",
      attempted: true,
      error: `Twilio failed: ${response.status} ${body}`,
    };
  }

  return {
    provider: "twilio",
    status: "sent",
    attempted: true,
    error: null,
  };
}

async function sendSms(input: {
  to: string;
  message: string;
  prospectName: string;
  followUpAt: string;
  sourceObjectId: number;
}): Promise<SmsSendResult> {
  if (!input.to) {
    return {
      provider: "missing_phone",
      status: "skipped",
      attempted: false,
      error: "Commercial phone number missing",
    };
  }

  const webhookResult = await sendSmsWithWebhook(input);
  if (webhookResult) return webhookResult;

  const twilioResult = await sendSmsWithTwilio(input);
  if (twilioResult) return twilioResult;

  return {
    provider: "sms_provider_not_configured",
    status: "queued",
    attempted: false,
    error: "SMS provider not configured",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Method not allowed");
    }

    actor = await authenticateRequest(req);
    requireUserRole(actor, ["admin", "commercial"]);

    const payload = await req.json().catch(() => ({})) as ReminderPayload;
    const sourceObjectId = Number(payload.sourceObjectId);
    if (!Number.isInteger(sourceObjectId) || sourceObjectId <= 0) {
      throw new HttpError(400, "sourceObjectId invalide");
    }

    const { data: followup, error: followupError } = await actor.adminClient
      .from("commercial_prospect_followups")
      .select("source_objectid, assigned_to, assigned_to_name, next_follow_up_at, status")
      .eq("source_objectid", sourceObjectId)
      .maybeSingle<FollowupRow>();

    if (followupError) throw followupError;
    if (!followup?.next_follow_up_at) {
      return jsonResponse({ ok: true, skipped: true, reason: "no_follow_up_date" }, 200, corsHeaders);
    }

    const recipientUserId = followup.assigned_to || actor.userId;
    if (!recipientUserId) {
      throw new HttpError(400, "Aucun commercial assigné à cette relance");
    }

    const prospectName = normalizeString(payload.prospectName) || `Restaurant #${sourceObjectId}`;
    const prospectAddress = normalizeString(payload.prospectAddress);
    const followUpAt = followup.next_follow_up_at;
    const followUpLabel = formatDateLabel(followUpAt);
    const notificationData = {
      source_objectid: sourceObjectId,
      prospect_name: prospectName,
      prospect_address: prospectAddress || null,
      follow_up_at: followUpAt,
      url: "/commercial",
      requested_channels: {
        in_app: true,
        push: true,
        email: false,
      },
    };

    const { data: existingNotification, error: existingNotificationError } = await actor.adminClient
      .from("notifications")
      .select("id")
      .eq("user_id", recipientUserId)
      .eq("type", "commercial_followup_reminder")
      .contains("data", {
        source_objectid: sourceObjectId,
        follow_up_at: followUpAt,
      })
      .maybeSingle<{ id: string }>();

    if (existingNotificationError) throw existingNotificationError;

    if (existingNotification?.id) {
      return jsonResponse({
        ok: true,
        notification_id: existingNotification.id,
        deduped: true,
        sms_status: "skipped_duplicate",
      }, 200, corsHeaders);
    }

    const { data: profile, error: profileError } = await actor.adminClient
      .from("user_profiles")
      .select("first_name, last_name, phone_number")
      .eq("user_id", recipientUserId)
      .maybeSingle<UserProfileRow>();

    if (profileError) throw profileError;

    const commercialDisplayName = profileDisplayName(profile || null, followup.assigned_to_name);
    const title = "Relance commerciale planifiée";
    const body = `Relance ${prospectName} prévue le ${followUpLabel}.`;
    const notificationId = await enqueueNotification({
      adminClient: actor.adminClient,
      userId: recipientUserId,
      title,
      body,
      type: "commercial_followup_reminder",
      category: "transactional",
      data: notificationData,
      requestedChannels: {
        in_app: true,
        push: true,
        email: false,
      },
    });

    const smsMessage = [
      `TOK - Relance ${prospectName}`,
      `Prévue le ${followUpLabel}.`,
      prospectAddress ? `Adresse: ${prospectAddress}.` : "",
      `Ouvrir: ${APP_URL}/commercial`,
    ].filter(Boolean).join(" ");
    const smsTarget = normalizePhone(profile?.phone_number);
    const smsResult = await sendSms({
      to: smsTarget,
      message: smsMessage,
      prospectName,
      followUpAt,
      sourceObjectId,
    });

    if (notificationId && smsResult.status !== "skipped") {
      await actor.adminClient
        .from("notification_deliveries")
        .insert({
          notification_id: notificationId,
          channel: "sms",
          status: smsResult.status === "sent" ? "sent" : smsResult.status === "failed" ? "failed" : "queued",
          target: smsTarget || null,
          provider: smsResult.provider,
          scheduled_at: new Date().toISOString(),
          sent_at: smsResult.status === "sent" ? new Date().toISOString() : null,
          attempts: smsResult.attempted ? 1 : 0,
          last_error: smsResult.error || null,
        });
    }

    const dispatchResult = await triggerNotificationDispatch({
      source: FUNCTION_NAME,
      push: true,
      email: false,
      userId: recipientUserId,
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: FUNCTION_NAME,
      action: "schedule_followup_reminder",
      status: "success",
      targetEntityType: "commercial_prospect_followups",
      targetEntityId: String(sourceObjectId),
      metadata: {
        recipient_user_id: recipientUserId,
        commercial_name: commercialDisplayName,
        follow_up_at: followUpAt,
        notification_id: notificationId,
        sms_status: smsResult.status,
        sms_provider: smsResult.provider,
        push_failed_channels: dispatchResult.failedChannels,
      },
    });

    return jsonResponse({
      ok: true,
      notification_id: notificationId,
      recipient_user_id: recipientUserId,
      commercial_name: commercialDisplayName,
      push_status: dispatchResult.failedChannels.some((channel) => channel.channel === "push") ? "failed" : "sent_or_queued",
      sms_status: smsResult.status,
      sms_provider: smsResult.provider,
      sms_error: smsResult.error || null,
    }, 200, corsHeaders);
  } catch (error) {
    log.error("follow-up reminder error", {
      message: error instanceof Error ? error.message : "unknown",
    });

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: FUNCTION_NAME,
      action: "schedule_followup_reminder",
      status: "failure",
      targetEntityType: "commercial_prospect_followups",
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ ok: false, error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Erreur interne",
    }, 500, corsHeaders);
  }
});
