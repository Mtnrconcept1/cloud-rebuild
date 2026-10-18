import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { authenticateRequest, HttpError, jsonResponse, writeAuditLog, type EdgeSupabaseClient, type RequestActor } from "../_shared/auth.ts";
import { buildTokConnectEnvelope, buildTokConnectWebhookHeaders, makeTokConnectRequestId } from "../_shared/tok-connect.ts";
import { assertTokConnectFeatureEnabled } from "../_shared/tok-connect-auth.ts";
import { postPublicWebhook, WEBHOOK_TIMEOUT_MS } from "../_shared/tok-connect-webhook-http.ts";

type DeliveryRow = {
  id: string;
  endpoint_id: string | null;
  partner_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  dispatch_lease_token: string;
  dispatch_lease_expires_at: string;
};
type EndpointRow = { id: string; partner_id: string; url: string; signing_secret: string; status: string };
type DeliveryResult = { id: string; status: string; response_status?: number | null; reason?: string };

const CLAIM_BATCH_SIZE = 5;
const DISPATCH_BUDGET_MS = 35_000;
const TOK_CONNECT_DISPATCH_HEADER_NAMES = ["X-TOK-Event", "X-TOK-Delivery", "X-TOK-Timestamp", "X-TOK-Signature"];

function requireDispatcher(actor: RequestActor) {
  if (!actor.isServiceRole || !["service_role", "scheduler_secret"].includes(actor.authMode)) {
    throw new HttpError(403, "webhook_dispatcher_service_required");
  }
}

function parseLimit(value: unknown) {
  const parsed = Number(value ?? 25);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 100) : 25;
}

async function readEndpoints(adminClient: EdgeSupabaseClient, deliveries: DeliveryRow[]) {
  const ids = [...new Set(deliveries.flatMap((row) => row.endpoint_id ? [row.endpoint_id] : []))];
  if (!ids.length) return new Map<string, EndpointRow>();
  const { data, error } = await adminClient.from("tok_connect_webhook_endpoints")
    .select("id, partner_id, url, signing_secret, status").in("id", ids);
  if (error) throw new HttpError(500, "webhook_endpoint_read_failed");
  return new Map<string, EndpointRow>((data || []).map((row: EndpointRow) => [row.id, row]));
}

async function completeDelivery(
  adminClient: EdgeSupabaseClient,
  delivery: DeliveryRow,
  outcome: "delivered" | "retry" | "failed",
  responseStatus: number | null,
  body: string | null,
  errorMessage: string | null,
  signature: string | null,
): Promise<DeliveryResult> {
  const { data, error } = await adminClient.rpc("complete_tok_connect_webhook_delivery", {
    p_delivery_id: delivery.id,
    p_lease_token: delivery.dispatch_lease_token,
    p_outcome: outcome,
    p_response_status: responseStatus,
    p_response_body: body,
    p_error_message: errorMessage,
    p_signature: signature,
  });
  if (error) throw new HttpError(503, "webhook_completion_unacknowledged");
  return { id: delivery.id, status: typeof data === "string" ? data : "lease_lost", response_status: responseStatus };
}

async function processDelivery(adminClient: EdgeSupabaseClient, delivery: DeliveryRow, endpoint: EndpointRow | undefined) {
  if (!endpoint || endpoint.status !== "active" || endpoint.partner_id !== delivery.partner_id) {
    return completeDelivery(adminClient, delivery, "failed", null, null, "webhook_endpoint_inactive", null);
  }
  const leaseRemaining = Date.parse(delivery.dispatch_lease_expires_at) - Date.now();
  if (!Number.isFinite(leaseRemaining) || leaseRemaining <= WEBHOOK_TIMEOUT_MS) {
    return { id: delivery.id, status: "lease_lost", reason: "webhook_lease_expiring" };
  }
  const payload = JSON.stringify(delivery.payload || {});
  const headers = await buildTokConnectWebhookHeaders({
    eventType: delivery.event_type,
    deliveryId: delivery.id,
    secret: endpoint.signing_secret,
    timestamp: new Date().toISOString(),
    payload,
  });

  let outcome: "delivered" | "retry" | "failed";
  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  try {
    const result = await postPublicWebhook(endpoint.url, headers, payload);
    responseStatus = result.status;
    responseBody = result.body;
    outcome = result.ok ? "delivered" : result.status >= 300 && result.status < 400 ? "failed" : "retry";
    if (!result.ok) errorMessage = "http_" + result.status;
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_request_failed";
    const allowed = ["unsafe_webhook_url", "webhook_payload_too_large", "request_timeout", "webhook_request_failed"];
    errorMessage = allowed.includes(message) ? message : "webhook_request_failed";
    outcome = ["unsafe_webhook_url", "webhook_payload_too_large"].includes(errorMessage) ? "failed" : "retry";
  }
  // Keep database acknowledgement outside the HTTP catch: a successful POST
  // followed by a database error must never be rewritten as an HTTP failure.
  return completeDelivery(adminClient, delivery, outcome, responseStatus, responseBody, errorMessage, headers["X-TOK-Signature"]);
}

async function dispatchWebhooks(actor: RequestActor, limit: number) {
  requireDispatcher(actor);
  await assertTokConnectFeatureEnabled(actor.adminClient, "tok-connect-webhooks");
  const started = Date.now();
  const results: DeliveryResult[] = [];
  while (results.length < limit && Date.now() - started < DISPATCH_BUDGET_MS) {
    const { data, error } = await actor.adminClient.rpc("claim_tok_connect_webhook_deliveries", {
      p_limit: Math.min(CLAIM_BATCH_SIZE, limit - results.length),
    });
    if (error) throw new HttpError(503, "webhook_claim_failed");
    const deliveries = (data || []) as DeliveryRow[];
    if (!deliveries.length) break;
    const endpoints = await readEndpoints(actor.adminClient, deliveries);
    const batch = await Promise.allSettled(deliveries.map((delivery) =>
      processDelivery(actor.adminClient, delivery, delivery.endpoint_id ? endpoints.get(delivery.endpoint_id) : undefined)
    ));
    batch.forEach((result, index) => results.push(result.status === "fulfilled"
      ? result.value
      : { id: deliveries[index].id, status: "unacknowledged", reason: "webhook_completion_unacknowledged" }));
  }
  return {
    processed: results.length,
    delivered: results.filter((row) => row.status === "delivered").length,
    failed: results.filter((row) => row.status === "failed").length,
    retrying: results.filter((row) => row.status === "pending").length,
    unacknowledged: results.filter((row) => ["unacknowledged", "lease_lost"].includes(row.status)).length,
    header_names: TOK_CONNECT_DISPATCH_HEADER_NAMES,
    results,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  const requestId = makeTokConnectRequestId();
  let actor: RequestActor | null = null;
  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    requireDispatcher(actor);
    const body = await req.json().catch(() => ({})) as { limit?: number };
    const result = await dispatchWebhooks(actor, parseLimit(body.limit));
    await writeAuditLog({
      adminClient: actor.adminClient, functionName: "tok-connect-webhook-dispatch", action: "dispatch-webhooks",
      status: result.unacknowledged ? "failure" : "success", actor, request: req,
      metadata: { request_id: requestId, processed: result.processed, delivered: result.delivered, failed: result.failed,
        retrying: result.retrying, unacknowledged: result.unacknowledged },
    });
    return jsonResponse(buildTokConnectEnvelope({ requestId, data: result }), result.unacknowledged ? 503 : 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "tok_connect_webhook_dispatch_error";
    if (actor) await writeAuditLog({
      adminClient: actor.adminClient, functionName: "tok-connect-webhook-dispatch", action: "dispatch-webhooks",
      status: "failure", actor, request: req, errorMessage: message, metadata: { request_id: requestId },
    });
    return jsonResponse(buildTokConnectEnvelope({ requestId, error: { code: message, message } }), status, corsHeaders);
  }
});
