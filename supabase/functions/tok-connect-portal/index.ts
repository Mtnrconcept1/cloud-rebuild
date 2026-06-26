import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  authenticateRequest,
  HttpError,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  buildTokConnectWebhookHeaders,
  buildTokConnectEnvelope,
  createTokConnectClientCredential,
  hashTokConnectSecret,
  isSafeTokConnectWebhookUrl,
  makeTokConnectRequestId,
} from "../_shared/tok-connect.ts";
import { assertTokConnectFeatureEnabled as assertTokConnectPortalFeatureEnabled } from "../_shared/tok-connect-auth.ts";

const SANDBOX_SCOPES = [
  "restaurants:read",
  "availability:read",
  "reservations:create",
  "reservations:cancel",
  "credits:read",
  "campaigns:preview",
  "analytics:read",
];

type PortalBody = {
  action?:
    | "overview"
    | "create-sandbox-client"
    | "rotate-client-secret"
    | "revoke-client"
    | "create-webhook-endpoint"
    | "send-webhook-test"
    | "approve-partner"
    | "suspend-partner"
    | "revoke-partner";
  client_uuid?: string;
  partner_id?: string;
  endpoint_id?: string;
  webhook_url?: string;
  events?: string[];
};

type PortalActor = Awaited<ReturnType<typeof authenticateRequest>>;
type PortalAdminClient = PortalActor["adminClient"];

async function getMemberPartners(adminClient: PortalAdminClient, userId: string) {
  const { data, error } = await adminClient
    .from("tok_connect_partner_members")
    .select("partner_id, role, tok_connect_partners(id, name, status, environment, billing_tier, created_at)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) throw new HttpError(500, error.message);
  return data || [];
}

async function ensureSandboxPartner(actor: PortalActor) {
  const memberships = await getMemberPartners(actor.adminClient, actor.userId || "");
  const existing = memberships.find((membership) => {
    const partner = Array.isArray(membership.tok_connect_partners)
      ? membership.tok_connect_partners[0]
      : membership.tok_connect_partners;
    return partner?.environment === "sandbox";
  });

  if (existing?.partner_id) return existing.partner_id as string;

  const { data: partner, error: partnerError } = await actor.adminClient
    .from("tok_connect_partners")
    .insert({
      name: "TOK Connect Sandbox",
      partner_type: "developer",
      status: "active",
      environment: "sandbox",
      billing_tier: "free_developer",
      created_by: actor.userId,
      metadata: { source: "developer_portal" },
    })
    .select("id")
    .single<{ id: string }>();

  if (partnerError) throw new HttpError(500, partnerError.message);

  const { error: memberError } = await actor.adminClient.from("tok_connect_partner_members").insert({
    partner_id: partner.id,
    user_id: actor.userId,
    role: "owner",
    status: "active",
  });

  if (memberError) throw new HttpError(500, memberError.message);
  return partner.id;
}

async function assertCanManageClient(
  actor: PortalActor,
  clientUuid: string,
) {
  const { data: client, error } = await actor.adminClient
    .from("tok_connect_clients")
    .select("id, partner_id")
    .eq("id", clientUuid)
    .maybeSingle<{ id: string; partner_id: string }>();

  if (error) throw new HttpError(500, error.message);
  if (!client) throw new HttpError(404, "tok_connect_client_not_found");

  const { data: member, error: memberError } = await actor.adminClient
    .from("tok_connect_partner_members")
    .select("id")
    .eq("partner_id", client.partner_id)
    .eq("user_id", actor.userId)
    .eq("status", "active")
    .maybeSingle();

  if (memberError) throw new HttpError(500, memberError.message);
  if (!member && !actor.isAdmin) throw new HttpError(403, "tok_connect_partner_member_required");

  return client;
}

async function assertCanManagePartner(actor: PortalActor, partnerId: string) {
  if (actor.isAdmin) return;

  const { data: member, error } = await actor.adminClient
    .from("tok_connect_partner_members")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("user_id", actor.userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!member) throw new HttpError(403, "tok_connect_partner_member_required");
}

async function resolveWebhookEndpoint(
  actor: PortalActor,
  endpointId: string | undefined,
) {
  const selectColumns = "id, partner_id, signing_secret, events, status";

  if (endpointId) {
    const { data: endpoint, error } = await actor.adminClient
      .from("tok_connect_webhook_endpoints")
      .select(selectColumns)
      .eq("id", endpointId)
      .maybeSingle<{
        id: string;
        partner_id: string;
        signing_secret: string;
        events: string[] | null;
        status: string;
      }>();

    if (error) throw new HttpError(500, error.message);
    if (!endpoint) throw new HttpError(404, "tok_connect_webhook_endpoint_not_found");
    await assertCanManagePartner(actor, endpoint.partner_id);
    return endpoint;
  }

  const memberships = await getMemberPartners(actor.adminClient, actor.userId || "");
  const partnerIds = memberships.map((membership) => membership.partner_id).filter(Boolean);
  if (partnerIds.length === 0 && !actor.isAdmin) {
    throw new HttpError(404, "tok_connect_webhook_endpoint_not_found");
  }

  let query = actor.adminClient
    .from("tok_connect_webhook_endpoints")
    .select(selectColumns)
    .eq("status", "active")
    .contains("events", ["webhook.test"]);

  if (!actor.isAdmin) query = query.in("partner_id", partnerIds);

  const { data, error } = await query.limit(1);
  if (error) throw new HttpError(500, error.message);
  const endpoint = (data || [])[0] as {
    id: string;
    partner_id: string;
    signing_secret: string;
    events: string[] | null;
    status: string;
  } | undefined;
  if (!endpoint) throw new HttpError(404, "tok_connect_webhook_endpoint_not_found");
  return endpoint;
}

async function revokeClient(actor: PortalActor, req: Request, requestId: string, clientUuid: string) {
  const client = await assertCanManageClient(actor, clientUuid);
  const revokedAt = new Date().toISOString();

  const { error: clientError } = await actor.adminClient
    .from("tok_connect_clients")
    .update({ status: "revoked" })
    .eq("id", client.id);

  if (clientError) throw new HttpError(500, clientError.message);

  const { error: tokenError } = await actor.adminClient
    .from("tok_connect_access_tokens")
    .update({ revoked_at: revokedAt })
    .eq("client_id", client.id)
    .is("revoked_at", null);

  if (tokenError) throw new HttpError(500, tokenError.message);

  await writeAuditLog({
    adminClient: actor.adminClient,
    functionName: "tok-connect-portal",
    action: "revoke-client",
    status: "success",
    actor,
    request: req,
    targetEntityType: "tok_connect_client",
    targetEntityId: client.id,
    metadata: { request_id: requestId, partner_id: client.partner_id, revoked_at: revokedAt },
  });

  return { client_uuid: client.id, revoked_at: revokedAt };
}

async function sendWebhookTest(actor: PortalActor, req: Request, requestId: string, endpointId: string | undefined) {
  await assertTokConnectPortalFeatureEnabled(actor.adminClient, "tok-connect-webhooks");
  const endpoint = await resolveWebhookEndpoint(actor, endpointId);
  if (endpoint.status !== "active") throw new HttpError(409, "tok_connect_webhook_endpoint_inactive");

  const payload = {
    event: "webhook.test",
    endpoint_id: endpoint.id,
    request_id: requestId,
    sent_at: new Date().toISOString(),
  };
  const payloadText = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const headers = await buildTokConnectWebhookHeaders({
    eventType: "webhook.test",
    deliveryId: requestId,
    secret: endpoint.signing_secret,
    timestamp,
    payload: payloadText,
  });

  const { data: delivery, error } = await actor.adminClient
    .from("tok_connect_webhook_deliveries")
    .insert({
      endpoint_id: endpoint.id,
      partner_id: endpoint.partner_id,
      event_type: "webhook.test",
      payload,
      status: "pending",
      signature: headers["X-TOK-Signature"],
      next_retry_at: new Date().toISOString(),
    })
    .select("id, event_type, status")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog({
    adminClient: actor.adminClient,
    functionName: "tok-connect-portal",
    action: "send-webhook-test",
    status: "success",
    actor,
    request: req,
    targetEntityType: "tok_connect_webhook_delivery",
    targetEntityId: delivery.id,
    metadata: { request_id: requestId, endpoint_id: endpoint.id, signature_header: headers["X-TOK-Signature"] },
  });

  return { delivery, signature_headers: Object.keys(headers) };
}

async function updatePartnerStatus(
  actor: PortalActor,
  req: Request,
  requestId: string,
  partnerId: string,
  status: "active" | "suspended" | "revoked",
  action: "approve-partner" | "suspend-partner" | "revoke-partner",
) {
  if (!actor.isAdmin) throw new HttpError(403, "admin_required");

  const patch: Record<string, unknown> = { status };
  if (status === "active") {
    patch.approved_by = actor.userId;
    patch.approved_at = new Date().toISOString();
  }

  const { data: partner, error } = await actor.adminClient
    .from("tok_connect_partners")
    .update(patch)
    .eq("id", partnerId)
    .select("id, status, approved_at")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog({
    adminClient: actor.adminClient,
    functionName: "tok-connect-portal",
    action,
    status: "success",
    actor,
    request: req,
    targetEntityType: "tok_connect_partner",
    targetEntityId: partnerId,
    metadata: { request_id: requestId, next_status: status },
  });

  return { partner };
}

function isLocalTokConnectDevelopmentRuntime() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  return supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
}

function assertWebhookUrl(url: string) {
  if (!isSafeTokConnectWebhookUrl(url, { allowLocalHttp: isLocalTokConnectDevelopmentRuntime() })) {
    throw new HttpError(400, "webhook_https_url_required");
  }
}

async function overview(actor: PortalActor) {
  const memberships = await getMemberPartners(actor.adminClient, actor.userId || "");
  const partnerIds = memberships.map((membership) => membership.partner_id).filter(Boolean);

  const [clients, logs, endpoints, deliveries] = await Promise.all([
    partnerIds.length === 0
      ? Promise.resolve({ data: [] })
      : actor.adminClient.from("tok_connect_clients").select("id, partner_id, client_id, name, environment, allowed_scopes, status, created_at, last_rotated_at").in("partner_id", partnerIds).limit(20),
    partnerIds.length === 0
      ? Promise.resolve({ data: [] })
      : actor.adminClient.from("tok_connect_api_requests").select("request_id, partner_id, method, route, status_code, latency_ms, created_at, error_code").in("partner_id", partnerIds).order("created_at", { ascending: false }).limit(50),
    partnerIds.length === 0
      ? Promise.resolve({ data: [] })
      : actor.adminClient.from("tok_connect_webhook_endpoints").select("id, partner_id, url, events, status, created_at").in("partner_id", partnerIds).limit(20),
    partnerIds.length === 0
      ? Promise.resolve({ data: [] })
      : actor.adminClient.from("tok_connect_webhook_deliveries").select("id, partner_id, event_type, status, attempts, response_status, created_at").in("partner_id", partnerIds).order("created_at", { ascending: false }).limit(50),
  ]);

  return {
    memberships,
    clients: clients.data || [],
    api_requests: logs.data || [],
    webhook_endpoints: endpoints.data || [],
    webhook_deliveries: deliveries.data || [],
    quotas: {
      sandbox_requests_per_minute: 240,
      production_requests_per_minute: "sur validation admin",
    },
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const requestId = makeTokConnectRequestId();
  let actor: PortalActor | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    actor = await authenticateRequest(req, { allowServiceRole: false });
    const limiter = createRateLimiter(actor.adminClient, "tok-connect-portal");
    await limiter.consume(`user:${actor.userId}`, { maxRequests: 60, windowSeconds: 60 });
    await assertTokConnectPortalFeatureEnabled(actor.adminClient, "tok-connect");

    const body = await req.json().catch(() => ({ action: "overview" })) as PortalBody;
    const action = body.action || "overview";

    if (action === "overview") {
      return jsonResponse(buildTokConnectEnvelope({ requestId, data: await overview(actor) }), 200, corsHeaders);
    }

    if (action === "create-sandbox-client") {
      const partnerId = await ensureSandboxPartner(actor);
      const clientId = createTokConnectClientCredential("tokc_client");
      const clientSecret = createTokConnectClientCredential("tokc_secret");
      const { data: client, error } = await actor.adminClient
        .from("tok_connect_clients")
        .insert({
          partner_id: partnerId,
          client_id: clientId,
          client_secret_hash: await hashTokConnectSecret(clientSecret),
          name: "Sandbox developer client",
          environment: "sandbox",
          allowed_scopes: SANDBOX_SCOPES,
          status: "active",
          created_by: actor.userId,
          last_rotated_at: new Date().toISOString(),
        })
        .select("id, client_id, allowed_scopes, environment")
        .single();

      if (error) throw new HttpError(500, error.message);

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: "tok-connect-portal",
        action: "create-sandbox-client",
        status: "success",
        actor,
        request: req,
        targetEntityType: "tok_connect_client",
        targetEntityId: client.id,
        metadata: { request_id: requestId, partner_id: partnerId },
      });

      return jsonResponse(buildTokConnectEnvelope({
        requestId,
        data: {
          client,
          client_secret: clientSecret,
          warning: "Ce secret est affiché une seule fois.",
        },
      }), 201, corsHeaders);
    }

    if (action === "rotate-client-secret") {
      if (!body.client_uuid) throw new HttpError(400, "client_uuid_required");
      const client = await assertCanManageClient(actor, body.client_uuid);
      const clientSecret = createTokConnectClientCredential("tokc_secret");
      const { error } = await actor.adminClient
        .from("tok_connect_clients")
        .update({
          client_secret_hash: await hashTokConnectSecret(clientSecret),
          last_rotated_at: new Date().toISOString(),
        })
        .eq("id", client.id);

      if (error) throw new HttpError(500, error.message);

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: "tok-connect-portal",
        action: "rotate-client-secret",
        status: "success",
        actor,
        request: req,
        targetEntityType: "tok_connect_client",
        targetEntityId: client.id,
        metadata: { request_id: requestId },
      });

      return jsonResponse(buildTokConnectEnvelope({
        requestId,
        data: { client_uuid: client.id, client_secret: clientSecret },
      }), 200, corsHeaders);
    }

    if (action === "revoke-client") {
      if (!body.client_uuid) throw new HttpError(400, "client_uuid_required");
      return jsonResponse(buildTokConnectEnvelope({
        requestId,
        data: await revokeClient(actor, req, requestId, body.client_uuid),
      }), 200, corsHeaders);
    }

    if (action === "create-webhook-endpoint") {
      await assertTokConnectPortalFeatureEnabled(actor.adminClient, "tok-connect-webhooks");
      if (!body.webhook_url) throw new HttpError(400, "webhook_url_required");
      assertWebhookUrl(body.webhook_url);
      const partnerId = await ensureSandboxPartner(actor);
      const signingSecret = createTokConnectClientCredential("tokc_whsec");
      const events = (body.events || ["webhook.test"]).filter((event) =>
        ["reservation.created", "reservation.cancelled", "webhook.test", "campaign.previewed"].includes(event)
      );

      const { data: endpoint, error } = await actor.adminClient
        .from("tok_connect_webhook_endpoints")
        .insert({
          partner_id: partnerId,
          url: body.webhook_url,
          events,
          signing_secret: signingSecret,
          status: "active",
          created_by: actor.userId,
          last_rotated_at: new Date().toISOString(),
        })
        .select("id, url, events, status")
        .single();

      if (error) throw new HttpError(500, error.message);

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: "tok-connect-portal",
        action: "create-webhook-endpoint",
        status: "success",
        actor,
        request: req,
        targetEntityType: "tok_connect_webhook_endpoint",
        targetEntityId: endpoint.id,
        metadata: { request_id: requestId, partner_id: partnerId, events },
      });

      return jsonResponse(buildTokConnectEnvelope({
        requestId,
        data: {
          endpoint,
          signing_secret: signingSecret,
          signature_headers: [
            "X-TOK-Event",
            "X-TOK-Delivery",
            "X-TOK-Timestamp",
            "X-TOK-Signature",
          ],
        },
      }), 201, corsHeaders);
    }

    if (action === "send-webhook-test") {
      return jsonResponse(buildTokConnectEnvelope({
        requestId,
        data: await sendWebhookTest(actor, req, requestId, body.endpoint_id),
      }), 202, corsHeaders);
    }

    if (action === "approve-partner" || action === "suspend-partner" || action === "revoke-partner") {
      if (!body.partner_id) throw new HttpError(400, "partner_id_required");
      const nextStatus = action === "approve-partner"
        ? "active"
        : action === "suspend-partner"
          ? "suspended"
          : "revoked";
      return jsonResponse(buildTokConnectEnvelope({
        requestId,
        data: await updatePartnerStatus(actor, req, requestId, body.partner_id, nextStatus, action),
      }), 200, corsHeaders);
    }

    throw new HttpError(400, "tok_connect_portal_action_unknown");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "tok_connect_portal_error";

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: "tok-connect-portal",
        action: "portal_error",
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
