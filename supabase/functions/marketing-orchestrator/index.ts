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
import {
  asRecord,
  clampInteger,
  parseMarketingAction,
  requiredString,
  safeMarketingError,
} from "../_shared/marketing.ts";

type AdminClient = ReturnType<typeof createAdminClient>;
type ClaimedItem = {
  id: string;
  channel: string;
  attempt_count: number;
  max_attempts: number;
  lease_token: string;
};
type ClaimedDelivery = {
  id: string;
  channel: string;
  lease_token: string;
  attempt_count: number;
  max_attempts: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")?.trim() || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM")?.trim() || "Tok <noreply@thetok.ch>";
const RESEND_TIMEOUT_MS = 20_000;

/**
 * Channels whose adapter exists but which cannot publish until an
 * administrator provisions the provider credentials and, for the social
 * networks, until the platform has approved the publishing application.
 *
 * They are listed rather than lumped into a default branch so the recorded
 * error names the missing piece instead of a generic "not deployed", and so
 * adding a real adapter is a deliberate removal from this list.
 */
const DORMANT_CHANNELS = new Map<string, string>([
  ["instagram", "instagram_credentials_missing"],
  ["facebook", "facebook_credentials_missing"],
  ["linkedin", "linkedin_credentials_missing"],
  ["tiktok", "tiktok_credentials_missing"],
  ["youtube", "youtube_credentials_missing"],
  ["telegram", "telegram_credentials_missing"],
  ["google_business", "google_business_credentials_missing"],
  ["website", "website_credentials_missing"],
  ["push", "push_credentials_missing"],
]);

/** The address a recipient can always reach to stop receiving campaigns. */
function unsubscribeMailbox(from: string) {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim();
}

type PreparedEmail = {
  status: string;
  reason?: string;
  recipient?: string;
  subject?: string;
  html?: string;
  text?: string;
};

async function sendViaResend(prepared: PreparedEmail, deliveryId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        // Resend deduplicates on this key, so a retry after a timeout cannot
        // deliver the same campaign twice to the same recipient.
        "Idempotency-Key": deliveryId,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [prepared.recipient],
        subject: prepared.subject,
        html: prepared.html,
        text: prepared.text,
        headers: {
          "List-Unsubscribe": `<mailto:${unsubscribeMailbox(EMAIL_FROM)}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 4xx is a rejected message and will be rejected again; 5xx and 429 are
      // worth another attempt.
      const retryable = response.status >= 500 || response.status === 429;
      return { ok: false as const, retryable, code: `resend_http_${response.status}` };
    }

    const body = await response.json().catch(() => ({}));
    const messageId = typeof body?.id === "string" ? body.id : null;
    return { ok: true as const, messageId };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return { ok: false as const, retryable: true, code: aborted ? "resend_timeout" : "resend_unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Email is a two-phase send: Postgres re-runs every consent, targeting, quiet
 * hours and cap gate and hands back the recipient only for the delivery whose
 * lease we hold, then the provider call happens outside the transaction. The
 * row sits in 'processing' in between, so a crash never reads as a send.
 */
async function processEmailDelivery(client: AdminClient, delivery: ClaimedDelivery) {
  if (!RESEND_API_KEY) {
    await invokeRpc(client, "complete_marketing_delivery", {
      p_delivery_id: delivery.id,
      p_lease_token: delivery.lease_token,
      p_status: "blocked_configuration",
      p_provider_message_id: null,
      p_error_code: "resend_key_missing",
      p_error: "RESEND_API_KEY is not configured",
      p_metadata: { channel: "email" },
    });
    return { id: delivery.id, status: "blocked_configuration" };
  }

  const prepared = asRecord(
    await invokeRpc(client, "service_prepare_marketing_email_delivery", {
      p_delivery_id: delivery.id,
      p_lease_token: delivery.lease_token,
    }),
  ) as PreparedEmail;

  // Anything other than 'ready' means a gate closed and Postgres already
  // recorded the outcome on the row.
  if (prepared.status !== "ready") {
    return { id: delivery.id, status: prepared.status, reason: prepared.reason };
  }

  const sent = await sendViaResend(prepared, delivery.id);
  if (sent.ok) {
    await invokeRpc(client, "service_record_marketing_email_sent", {
      p_delivery_id: delivery.id,
      p_lease_token: delivery.lease_token,
      p_provider_message_id: sent.messageId,
    });
    return { id: delivery.id, status: "sent" };
  }

  const retryable = sent.retryable && delivery.attempt_count < delivery.max_attempts;
  await invokeRpc(client, "complete_marketing_delivery", {
    p_delivery_id: delivery.id,
    p_lease_token: delivery.lease_token,
    p_status: retryable ? "retrying" : "failed",
    p_provider_message_id: null,
    p_error_code: sent.code,
    p_error: "Resend rejected or could not receive the message",
    p_metadata: { channel: "email" },
  });
  return { id: delivery.id, status: retryable ? "retrying" : "failed" };
}

async function attachDelegatedAdminIdentity(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  req: Request,
) {
  if (actor.authMode !== "service_role") return actor;

  const delegatedUserId = req.headers.get("x-marketing-actor-user-id")?.trim() || "";
  if (!delegatedUserId) return actor;
  if (!UUID_PATTERN.test(delegatedUserId)) {
    throw new HttpError(403, "Invalid delegated marketing actor");
  }

  // A delegated identity never grants service access: the request is already
  // authenticated with the service role. This lookup only proves that the
  // human identity recorded in the audit trail is still an administrator.
  const { data, error } = await actor.adminClient
    .from("user_roles")
    .select("user_id")
    .eq("user_id", delegatedUserId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(503, "Delegated administrator check unavailable");
  if (!data) throw new HttpError(403, "Delegated administrator required");

  return {
    ...actor,
    userId: delegatedUserId,
    roles: [...new Set([...actor.roles, "admin"])],
    isAdmin: true,
  };
}

async function invokeRpc<T>(client: AdminClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as T;
}

async function completeItem(
  client: AdminClient,
  item: ClaimedItem,
  status: string,
  result: Record<string, unknown>,
  error?: string,
) {
  await invokeRpc(client, "complete_marketing_item", {
    p_item_id: item.id,
    p_lease_token: item.lease_token,
    p_status: status,
    p_result: result,
    p_error: error || null,
  });
}

async function materializeAll(client: AdminClient, itemId: string) {
  let created = 0;
  let total = 0;
  let batchComplete = false;
  for (let batch = 0; batch < 10; batch += 1) {
    const value = asRecord(await invokeRpc(client, "service_materialize_marketing_deliveries", {
      p_item_id: itemId,
      p_limit: 5000,
    }));
    const batchCreated = Number(value.created || 0);
    created += Number.isFinite(batchCreated) ? batchCreated : 0;
    total = Number(value.total || total || 0);
    batchComplete = value.batch_complete === true || batchCreated < 5000;
    if (batchComplete) break;
  }
  return { created, total, batchComplete };
}

async function processItem(client: AdminClient, item: ClaimedItem) {
  try {
    // Email joins the channels that fan an approved item out into per-contact
    // deliveries, now that a real adapter can process them.
    if (item.channel === "in_app" || ["email", "manual_call", "manual_email"].includes(item.channel)) {
      const materialized = await materializeAll(client, item.id);
      const nextStatus = !materialized.batchComplete
        ? "retrying"
        : materialized.total > 0
        ? "running"
        : "completed";
      await completeItem(
        client,
        item,
        nextStatus,
        {
          ...materialized,
          awaiting_materialization: !materialized.batchComplete,
          awaiting_delivery_processing: materialized.batchComplete && materialized.total > 0,
        },
      );
      return { id: item.id, status: nextStatus, ...materialized };
    }

    // External adapters stay fail-closed even if an integration row is marked
    // connected before the provider-specific code has been deployed.
    await completeItem(
      client,
      item,
      "blocked_configuration",
      { adapter_available: false, channel: item.channel },
      "Provider adapter is not deployed",
    );
    return { id: item.id, status: "blocked_configuration", created: 0, total: 0 };
  } catch (error) {
    const message = safeMarketingError(error);
    const retryable = item.attempt_count < item.max_attempts;
    try {
      await completeItem(client, item, retryable ? "retrying" : "failed", {}, message);
    } catch {
      // A lost lease is already safe: another worker owns the item.
    }
    return { id: item.id, status: retryable ? "retrying" : "failed", error: message };
  }
}

async function processDelivery(client: AdminClient, delivery: ClaimedDelivery) {
  try {
    if (delivery.channel === "in_app") {
      await invokeRpc(client, "service_send_marketing_in_app_delivery", {
        p_delivery_id: delivery.id,
        p_lease_token: delivery.lease_token,
      });
      return { id: delivery.id, status: "sent" };
    }
    if (delivery.channel === "email") {
      return await processEmailDelivery(client, delivery);
    }
    await invokeRpc(client, "complete_marketing_delivery", {
      p_delivery_id: delivery.id,
      p_lease_token: delivery.lease_token,
      p_status: "blocked_configuration",
      p_provider_message_id: null,
      p_error_code: DORMANT_CHANNELS.get(delivery.channel) || "adapter_not_deployed",
      p_error: "Provider adapter is not deployed",
      p_metadata: { channel: delivery.channel },
    });
    return { id: delivery.id, status: "blocked_configuration" };
  } catch (error) {
    const message = safeMarketingError(error);
    const retryable = delivery.attempt_count < delivery.max_attempts;
    try {
      await invokeRpc(client, "complete_marketing_delivery", {
        p_delivery_id: delivery.id,
        p_lease_token: delivery.lease_token,
        p_status: retryable ? "retrying" : "failed",
        p_provider_message_id: null,
        p_error_code: "orchestrator_error",
        p_error: message,
        p_metadata: {},
      });
    } catch {
      // A lost lease is already safe: another worker owns the delivery.
    }
    return { id: delivery.id, status: retryable ? "retrying" : "failed", error: message };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const origin = req.headers.get("origin");
  if (origin === "https://marketing.thetok.ch") {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Access-Control-Allow-Credentials"] = "true";
  }
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  const log = makeLogger("marketing-orchestrator");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req, { allowSchedulerSecret: true, allowServiceRole: true });
    // Browser/admin bearer tokens are deliberately insufficient here. Interactive
    // requests must first cross the marketing BFF, which validates the isolated
    // opaque session, MFA and CSRF before invoking this function as service_role.
    if (actor.authMode === "user_jwt") {
      throw new HttpError(403, "Marketing service session required");
    }
    actor = await attachDelegatedAdminIdentity(actor, req);
    requireRole(actor, ["admin"]);
    const payload = asRecord(await req.json().catch(() => ({})));
    const action = parseMarketingAction(payload.action);
    const limit = clampInteger(payload.limit, 25, 1, 100);
    const client = actor.adminClient;

    const items = action === "run_item"
      ? await invokeRpc<ClaimedItem[]>(client, "claim_marketing_item", {
        p_item_id: requiredString(payload.itemId, "itemId"),
        p_worker_id: `edge:${log.rid}`,
        p_lease_seconds: 180,
      })
      : await invokeRpc<ClaimedItem[]>(client, "claim_due_marketing_items", {
        p_limit: limit,
        p_worker_id: `edge:${log.rid}`,
        p_lease_seconds: 180,
      });

    if (action === "run_item" && (!Array.isArray(items) || items.length === 0)) {
      throw new HttpError(409, "Élément indisponible, non approuvé, bloqué ou déjà réclamé");
    }
    const itemResults = [];
    for (const item of Array.isArray(items) ? items : []) itemResults.push(await processItem(client, item));

    const deliveries = await invokeRpc<ClaimedDelivery[]>(client, "claim_marketing_deliveries", {
      p_limit: Math.min(500, limit * 20),
      p_worker_id: `edge:${log.rid}`,
      p_lease_seconds: 180,
    });
    const deliveryResults = [];
    for (const delivery of Array.isArray(deliveries) ? deliveries : []) {
      deliveryResults.push(await processDelivery(client, delivery));
    }

    await writeAuditLog({
      adminClient: client,
      actor,
      request: req,
      functionName: "marketing-orchestrator",
      action,
      status: "success",
      targetEntityType: "marketing_calendar_items",
      metadata: {
        claimed_items: itemResults.length,
        claimed_deliveries: deliveryResults.length,
        item_failures: itemResults.filter((row) => "error" in row).length,
        delivery_failures: deliveryResults.filter((row) => "error" in row).length,
      },
    });
    return jsonResponse({ ok: true, action, items: itemResults, deliveries: deliveryResults }, 200, corsHeaders);
  } catch (error) {
    const message = safeMarketingError(error);
    log.error("orchestrator failed", { message });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "marketing-orchestrator",
      action: "run",
      status: "failure",
      targetEntityType: "marketing_calendar_items",
      errorMessage: message,
    });
    if (error instanceof HttpError) return jsonResponse({ error: message }, error.status, corsHeaders);
    return jsonResponse({ error: "Erreur interne de l’orchestrateur" }, 500, corsHeaders);
  }
});
