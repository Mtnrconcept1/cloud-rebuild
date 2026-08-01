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
    if (item.channel === "in_app" || ["manual_call", "manual_email", "manual_visit"].includes(item.channel)) {
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
    await invokeRpc(client, "complete_marketing_delivery", {
      p_delivery_id: delivery.id,
      p_lease_token: delivery.lease_token,
      p_status: "blocked_configuration",
      p_provider_message_id: null,
      p_error_code: "adapter_not_deployed",
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
