import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { notifyAdmins } from "../_shared/notifications.ts";
import { parseRestaurantDemoInput, RESTAURANT_DEMO_CONSENT_VERSION, RESTAURANT_DEMO_SUBJECT } from "../_shared/restaurant-demo.ts";

type SupportSource = "public_contact" | "restaurant_dashboard";

const FUNCTION_NAME = "contact-support";
const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL")?.trim() || "contact@thetok.ch";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function sanitizeText(raw: unknown, max = 5000) {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] || char);
}

function requireInput(condition: unknown, message: string) {
  if (!condition) throw new HttpError(400, message);
}

async function getOptionalActor(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    return await authenticateRequest(req, { allowServiceRole: false });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return null;
    throw error;
  }
}

async function verifyTurnstileIfConfigured(token: string, req: Request) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")?.trim() ||
    Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET_KEY")?.trim() ||
    "";

  if (!secret) {
    return { skipped: true };
  }

  requireInput(token, "captcha_required");

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });

  if (!response.ok) throw new HttpError(502, "captcha_verification_failed");

  const payload = await response.json().catch(() => ({}));
  if (payload?.success !== true) throw new HttpError(400, "captcha_invalid");

  return { skipped: false };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  const adminClient = createAdminClient();
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let targetEntityId: string | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");

    actor = await getOptionalActor(req);
    const payload = await req.json().catch(() => ({}));
    const source = sanitizeText(payload.source, 40) as SupportSource;
    const name = sanitizeText(payload.name, 120);
    const email = sanitizeText(payload.email, 180).toLowerCase();
    const subject = sanitizeText(payload.subject, 180);
    const message = sanitizeText(payload.message, 5000);
    const restaurantId = maybeUuid(payload.restaurantId);
    const restaurantName = sanitizeText(payload.restaurantName, 160);
    const captchaToken = sanitizeText(payload.captchaToken, 1200);
    let demoLead: ReturnType<typeof parseRestaurantDemoInput> | null = null;
    if (payload.restaurantLead !== undefined) {
      requireInput(source === "public_contact" && subject === RESTAURANT_DEMO_SUBJECT, "invalid_restaurant_demo_source");
      try {
        demoLead = parseRestaurantDemoInput(payload.restaurantLead);
      } catch {
        throw new HttpError(400, "invalid_restaurant_demo_details");
      }
    }

    requireInput(source === "public_contact" || source === "restaurant_dashboard", "invalid_source");
    requireInput(subject.length >= 3, "subject_required");
    requireInput(message.length >= 10, "message_required");

    const limiter = createRateLimiter(adminClient, FUNCTION_NAME);
    const actorKey = actor?.userId ? `user:${actor.userId}` : `ip:${req.headers.get("x-forwarded-for") || "unknown"}`;
    await limiter.consume(actorKey, { maxRequests: source === "public_contact" ? 5 : 20, windowSeconds: 600 });
    await limiter.consume("global", { maxRequests: 120, windowSeconds: 60 });

    if (source === "public_contact") {
      requireInput(name.length >= 2, "name_required");
      requireInput(EMAIL_PATTERN.test(email), "email_invalid");
      await verifyTurnstileIfConfigured(captchaToken, req);
    }

    if (source === "restaurant_dashboard") {
      if (!actor?.userId) throw new HttpError(401, "Unauthorized");
      if (!restaurantId) throw new HttpError(400, "restaurant_required");
      await requireRestaurantAccess(actor, restaurantId);
    }

    let incidentId: string | null = null;
    let restaurantLeadId: string | null = null;
    let restaurantLeadCreated = false;

    if (source === "restaurant_dashboard" && actor?.userId && restaurantId) {
      const { data: incident, error: incidentError } = await adminClient
        .from("support_incidents")
        .insert({
          user_id: actor.userId,
          restaurant_id: restaurantId,
          opened_by: actor.userId,
          category: "restaurant_issue",
          priority: "normal",
          status: "waiting_admin",
          subject,
          description: message,
          metadata: {
            source,
            restaurant_name: restaurantName || null,
          },
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (incidentError) throw new HttpError(500, incidentError.message);
      incidentId = typeof incident?.id === "string" ? incident.id : null;
      targetEntityId = incidentId;

      if (incidentId) {
        const { error: messageError } = await adminClient.from("support_incident_messages").insert({
          incident_id: incidentId,
          author_id: actor.userId,
          author_role: "restaurateur",
          body: message,
          visibility: "public",
          metadata: { source },
        });

        if (messageError) throw new HttpError(500, messageError.message);
      }
    }

    if (demoLead) {
      // The anonymous lead form has passed the same CAPTCHA and rate-limiting as support.
      // Hash the email for a second, independent per-recipient anti-abuse cap.
      const digest = new Uint8Array(await crypto.subtle.digest(
        "SHA-256", new TextEncoder().encode(email),
      ));
      const fingerprint = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      await limiter.consume(`restaurant-demo:${fingerprint}`, { maxRequests: 2, windowSeconds: 86400 });

      const { data: created, error: leadError } = await adminClient.from("restaurant_leads")
        .insert({
          id: demoLead.requestId,
          restaurant_name: name,
          city: demoLead.city,
          email,
          phone: demoLead.phone,
          table_count: demoLead.tableCount,
          primary_need: demoLead.primaryNeed || null,
          source: "restaurateurs_geneve",
          status: "new",
          notes: message.slice(0, 1200),
          metadata: {
            form: "restaurant_demo",
            page: "/restaurateurs/geneve",
            consent_version: RESTAURANT_DEMO_CONSENT_VERSION,
            marketing_opt_in_requested: demoLead.marketingConsent,
            marketing_opt_in_requested_at: demoLead.marketingConsent ? new Date().toISOString() : null,
            marketing_status: "unverified",
            // A client-declared source may help research but is never verified campaign revenue.
            acquisition_touch: demoLead.acquisitionTouch ? {
              status: "self_reported_unverified",
              utm: demoLead.acquisitionTouch.utm,
              referrer_host: demoLead.acquisitionTouch.referrerHost,
              touched_at: demoLead.acquisitionTouch.touchedAt,
            } : null,
          },
        }).select("id").maybeSingle();
      if (leadError && leadError.code !== "23505") {
        throw new HttpError(500, "restaurant_demo_crm_unavailable");
      }
      restaurantLeadId = typeof created?.id === "string" ? created.id : demoLead.requestId;
      restaurantLeadCreated = !leadError;
      targetEntityId = restaurantLeadId;
    }

    const senderLabel = source === "public_contact"
      ? `${name} <${email}>`
      : `${actor?.userId || "utilisateur"}${restaurantName ? ` / ${restaurantName}` : ""}`;
    const textBody = [
      `Source: ${source}`,
      `De: ${senderLabel}`,
      restaurantId ? `Restaurant: ${restaurantName || restaurantId}` : null,
      incidentId ? `Incident support: ${incidentId}` : null,
      "",
      message,
    ].filter((part) => part !== null).join("\n");

    const htmlBody = [
      `<p><strong>Source:</strong> ${escapeHtml(source)}</p>`,
      `<p><strong>De:</strong> ${escapeHtml(senderLabel)}</p>`,
      restaurantId ? `<p><strong>Restaurant:</strong> ${escapeHtml(restaurantName || restaurantId)}</p>` : "",
      incidentId ? `<p><strong>Incident support:</strong> ${escapeHtml(incidentId)}</p>` : "",
      `<hr/><p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`,
    ].filter(Boolean).join("");

    const { error: emailError } = await adminClient.from("email_queue").insert({
      to_email: SUPPORT_EMAIL,
      subject: `[Support TOK] ${subject}`,
      body_text: textBody,
      body_html: htmlBody,
      status: "queued",
      metadata: {
        source,
        restaurant_id: restaurantId,
        restaurant_name: restaurantName || null,
        support_incident_id: incidentId,
        sender_email: source === "public_contact" ? email : null,
        sender_name: source === "public_contact" ? name : null,
      },
    });

    if (emailError) throw new HttpError(500, emailError.message);

    // Only one transactional acknowledgement for a genuinely new request ID.
    // This is NOT a marketing subscription or an advertising message.
    if (restaurantLeadCreated && restaurantLeadId) {
      const { error: ackError } = await adminClient.from("email_queue").insert({
        to_email: email,
        subject: "TOK — demande de démonstration reçue",
        body_text: `Bonjour,\n\nVotre demande de démonstration TOK pour ${name} a bien été reçue. L’équipe TOK reviendra vers vous pour organiser la suite.\n\nCe message confirme uniquement votre demande ; il ne vous inscrit pas à une liste publicitaire.\n\nL’équipe TOK`,
        body_html: `<p>Bonjour,</p><p>Votre demande de démonstration TOK pour <strong>${escapeHtml(name)}</strong> a bien été reçue. L’équipe TOK reviendra vers vous pour organiser la suite.</p><p>Ce message confirme uniquement votre demande ; il ne vous inscrit pas à une liste publicitaire.</p><p>L’équipe TOK</p>`,
        status: "queued",
        metadata: { source: "restaurant_demo_ack", restaurant_lead_id: restaurantLeadId },
      });
      if (ackError) log.warn("restaurant_demo_ack_unavailable");
    }

    await notifyAdmins({
      adminClient,
      title: incidentId ? "Nouveau sinistre support" : "Nouveau message support",
      body: `${source === "public_contact" ? (name || email) : (restaurantName || "Restaurant")} - ${subject}`.slice(0, 240),
      type: incidentId ? "support_incident" : "support_contact",
      category: "system",
      data: {
        url: incidentId ? `/admin/sinistres?incident=${incidentId}` : "/admin/notifications",
        support_incident_id: incidentId,
        restaurant_id: restaurantId,
        restaurant_name: restaurantName || null,
        source,
        subject,
      },
      requestedChannels: { in_app: true, push: true, email: false },
    }).catch((notificationError) => {
      log.warn("support_admin_notification_failed", {
        message: notificationError instanceof Error ? notificationError.message : "unknown",
      });
    });

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: FUNCTION_NAME,
      action: "queue_support_contact",
      status: "success",
      targetEntityType: incidentId ? "support_incidents" : restaurantLeadId ? "restaurant_leads" : "email_queue",
      targetEntityId,
      metadata: {
        rid: log.rid,
        source,
        restaurant_id: restaurantId,
        support_incident_id: incidentId,
      },
    });

    return jsonResponse({ ok: true, supportIncidentId: incidentId, restaurantLeadId }, 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "internal_error";
    log.error("request_failed", { status, message });

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: FUNCTION_NAME,
      action: "queue_support_contact",
      status: "failure",
      targetEntityType: "support",
      targetEntityId,
      errorMessage: message,
      metadata: { rid: log.rid },
    });

    return jsonResponse({ error: message, rid: log.rid }, status, corsHeaders);
  }
});
