import {
  HttpError,
  createAdminClient,
  getEnv,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  asRecord,
  requiredString,
  safeMarketingError,
  verifyMarketingWebhookSignature,
} from "../_shared/marketing.ts";

Deno.serve(async (req) => {
  const log = makeLogger("marketing-provider-webhook");
  const adminClient = createAdminClient();
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const rawBody = await req.text();
    if (rawBody.length > 256_000) throw new HttpError(413, "Payload too large");
    const timestamp = req.headers.get("x-marketing-timestamp") || "";
    const signature = req.headers.get("x-marketing-signature") || "";
    const secret = getEnv("MARKETING_WEBHOOK_SECRET");
    if (!secret) throw new HttpError(503, "Webhook non configuré");
    const valid = await verifyMarketingWebhookSignature({ rawBody, timestamp, signature, secret });
    if (!valid) throw new HttpError(401, "Signature invalide");

    let decoded: unknown;
    try {
      decoded = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, "JSON invalide");
    }
    const payload = asRecord(decoded);
    const provider = requiredString(payload.provider, "provider").toLowerCase().slice(0, 64);
    const providerEventId = requiredString(
      payload.provider_event_id ?? payload.event_id ?? payload.id,
      "provider_event_id",
    ).slice(0, 200);
    const providerMessageId = requiredString(
      payload.provider_message_id ?? payload.message_id,
      "provider_message_id",
    ).slice(0, 200);
    const eventType = requiredString(payload.event_type ?? payload.type, "event_type").toLowerCase().slice(0, 80);
    const occurredAt = typeof payload.occurred_at === "string" ? payload.occurred_at : new Date().toISOString();

    const { data, error } = await adminClient.rpc("record_marketing_provider_event", {
      p_provider: provider,
      p_provider_event_id: providerEventId,
      p_provider_message_id: providerMessageId,
      p_event_type: eventType,
      p_occurred_at: occurredAt,
      // Keep only operational, non-PII provider facts.
      p_metadata: {
        webhook_version: typeof payload.webhook_version === "string" ? payload.webhook_version.slice(0, 40) : null,
        reason_code: typeof payload.reason_code === "string" ? payload.reason_code.slice(0, 120) : null,
      },
    });
    if (error) throw error;

    await writeAuditLog({
      adminClient,
      actor: { userId: null, roles: ["provider_webhook"], isServiceRole: true, authMode: "service_role" },
      request: req,
      functionName: "marketing-provider-webhook",
      action: "record_provider_event",
      status: "success",
      targetEntityType: "marketing_deliveries",
      metadata: { provider, event_type: eventType, accepted: asRecord(data).accepted === true },
    });
    return jsonResponse({ ok: true, result: data }, 200);
  } catch (error) {
    const message = safeMarketingError(error);
    log.error("provider webhook failed", { message });
    await writeAuditLog({
      adminClient,
      actor: { userId: null, roles: ["provider_webhook"], isServiceRole: true, authMode: "service_role" },
      request: req,
      functionName: "marketing-provider-webhook",
      action: "record_provider_event",
      status: "failure",
      targetEntityType: "marketing_deliveries",
      errorMessage: message,
    });
    if (error instanceof HttpError) return jsonResponse({ error: message }, error.status);
    return jsonResponse({ error: "Erreur interne du webhook" }, 500);
  }
});
