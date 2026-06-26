import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  authenticateRequest,
  HttpError,
  jsonResponse,
  writeAuditLog,
  type EdgeSupabaseClient,
  type RequestActor,
} from "../_shared/auth.ts";
import {
  buildTokConnectEnvelope,
  buildTokConnectWebhookHeaders,
  getTokConnectRetryDelaySeconds,
  makeTokConnectRequestId,
} from "../_shared/tok-connect.ts";
import { assertTokConnectFeatureEnabled } from "../_shared/tok-connect-auth.ts";

type DispatchBody = {
  limit?: number;
};

type DeliveryRow = {
  id: string;
  endpoint_id: string | null;
  partner_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  next_retry_at: string | null;
};

type EndpointRow = {
  id: string;
  url: string;
  signing_secret: string;
  status: string;
};

const MAX_WEBHOOK_ATTEMPTS = 5;
const WEBHOOK_TIMEOUT_MS = 10_000;
const TOK_CONNECT_DISPATCH_HEADER_NAMES = [
  "X-TOK-Event",
  "X-TOK-Delivery",
  "X-TOK-Timestamp",
  "X-TOK-Signature",
];

function parseLimit(value: unknown) {
  const parsed = Number(value || 25);
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(Math.floor(parsed), 100);
}

async function readPendingDeliveries(adminClient: EdgeSupabaseClient, limit: number) {
  const now = new Date().toISOString();
  const { data, error } = await adminClient
    .from("tok_connect_webhook_deliveries")
    .select("id, endpoint_id, partner_id, event_type, payload, attempts, next_retry_at")
    .eq("status", "pending")
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new HttpError(500, error.message);
  return (data || []) as DeliveryRow[];
}

async function readEndpoints(adminClient: EdgeSupabaseClient, deliveries: DeliveryRow[]) {
  const endpointIds = [...new Set(deliveries.map((delivery) => delivery.endpoint_id).filter(Boolean))] as string[];
  if (endpointIds.length === 0) return new Map<string, EndpointRow>();

  const { data, error } = await adminClient
    .from("tok_connect_webhook_endpoints")
    .select("id, url, signing_secret, status")
    .in("id", endpointIds);

  if (error) throw new HttpError(500, error.message);
  return new Map((data || []).map((endpoint: EndpointRow) => [endpoint.id, endpoint]));
}

async function postWebhook(endpoint: EndpointRow, headers: Record<string, string>, payload: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: payload,
      signal: controller.signal,
    });
    const responseBody = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      body: responseBody.slice(0, 2000),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function markDelivery(
  adminClient: EdgeSupabaseClient,
  deliveryId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await adminClient
    .from("tok_connect_webhook_deliveries")
    .update(patch)
    .eq("id", deliveryId);

  if (error) throw new HttpError(500, error.message);
}

async function processDelivery(
  adminClient: EdgeSupabaseClient,
  delivery: DeliveryRow,
  endpoint: EndpointRow | undefined,
) {
  const attempts = Number(delivery.attempts || 0);
  const nextAttempts = attempts + 1;
  const attemptedAt = new Date().toISOString();

  if (!endpoint || endpoint.status !== "active") {
    await markDelivery(adminClient, delivery.id, {
      status: "failed",
      attempts: nextAttempts,
      last_attempted_at: attemptedAt,
      error_message: "tok_connect_webhook_endpoint_inactive",
    });
    return { id: delivery.id, status: "failed", reason: "endpoint_inactive" };
  }

  const payloadText = JSON.stringify(delivery.payload || {});
  const timestamp = new Date().toISOString();
  const headers = await buildTokConnectWebhookHeaders({
    eventType: delivery.event_type,
    deliveryId: delivery.id,
    secret: endpoint.signing_secret,
    timestamp,
    payload: payloadText,
  });

  try {
    const result = await postWebhook(endpoint, headers, payloadText);
    if (result.ok) {
      await markDelivery(adminClient, delivery.id, {
        status: "delivered",
        attempts: nextAttempts,
        delivered_at: new Date().toISOString(),
        last_attempted_at: attemptedAt,
        response_status: result.status,
        response_body: result.body,
        error_message: null,
        signature: headers["X-TOK-Signature"],
      });
      return { id: delivery.id, status: "delivered", response_status: result.status };
    }

    const shouldRetry = nextAttempts < MAX_WEBHOOK_ATTEMPTS;
    await markDelivery(adminClient, delivery.id, {
      status: shouldRetry ? "pending" : "failed",
      attempts: nextAttempts,
      next_retry_at: shouldRetry
        ? new Date(Date.now() + getTokConnectRetryDelaySeconds(Math.max(0, nextAttempts - 1)) * 1000).toISOString()
        : null,
      last_attempted_at: attemptedAt,
      response_status: result.status,
      response_body: result.body,
      error_message: `http_${result.status}`,
      signature: headers["X-TOK-Signature"],
    });

    return { id: delivery.id, status: shouldRetry ? "pending" : "failed", response_status: result.status };
  } catch (error) {
    const shouldRetry = nextAttempts < MAX_WEBHOOK_ATTEMPTS;
    const errorMessage = error instanceof Error ? error.message : "tok_connect_webhook_dispatch_error";
    await markDelivery(adminClient, delivery.id, {
      status: shouldRetry ? "pending" : "failed",
      attempts: nextAttempts,
      next_retry_at: shouldRetry
        ? new Date(Date.now() + getTokConnectRetryDelaySeconds(Math.max(0, nextAttempts - 1)) * 1000).toISOString()
        : null,
      last_attempted_at: attemptedAt,
      error_message: errorMessage,
      signature: headers["X-TOK-Signature"],
    });

    return { id: delivery.id, status: shouldRetry ? "pending" : "failed", reason: errorMessage };
  }
}

async function dispatchWebhooks(actor: RequestActor, limit: number) {
  await assertTokConnectFeatureEnabled(actor.adminClient, "tok-connect-webhooks");

  const deliveries = await readPendingDeliveries(actor.adminClient, limit);
  const endpoints = await readEndpoints(actor.adminClient, deliveries);
  const results = [];

  for (const delivery of deliveries) {
    const endpoint = delivery.endpoint_id ? endpoints.get(delivery.endpoint_id) : undefined;
    results.push(await processDelivery(actor.adminClient, delivery, endpoint));
  }

  return {
    processed: results.length,
    delivered: results.filter((result) => result.status === "delivered").length,
    failed: results.filter((result) => result.status === "failed").length,
    retrying: results.filter((result) => result.status === "pending").length,
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
    const body = await req.json().catch(() => ({})) as DispatchBody;
    const result = await dispatchWebhooks(actor, parseLimit(body.limit));

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: "tok-connect-webhook-dispatch",
      action: "dispatch-webhooks",
      status: "success",
      actor,
      request: req,
      metadata: {
        request_id: requestId,
        processed: result.processed,
        delivered: result.delivered,
        failed: result.failed,
        retrying: result.retrying,
      },
    });

    return jsonResponse(buildTokConnectEnvelope({ requestId, data: result }), 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "tok_connect_webhook_dispatch_error";

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: "tok-connect-webhook-dispatch",
        action: "dispatch-webhooks",
        status: "failure",
        actor,
        request: req,
        errorMessage: message,
        metadata: { request_id: requestId },
      });
    }

    return jsonResponse(
      buildTokConnectEnvelope({
        requestId,
        error: { code: message, message },
      }),
      status,
      corsHeaders,
    );
  }
});
