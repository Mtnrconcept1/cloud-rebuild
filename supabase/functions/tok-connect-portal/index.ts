import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  authenticateRequest,
  HttpError,
  jsonResponse,
  requireRestaurantAccess,
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

const GRANT_STATUSES = ["pending", "active", "suspended", "revoked"] as const;
const CLIENT_STATUSES = ["active", "suspended", "revoked"] as const;

function normalizeScopes(value: string[] | string | undefined) {
  const rawScopes = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/)
      : [];
  const allowed = new Set(SANDBOX_SCOPES);
  return [...new Set(rawScopes.map((scope) => scope.trim()).filter((scope) => allowed.has(scope)))];
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function normalizeGrantStatus(value: unknown) {
  return GRANT_STATUSES.includes(value as typeof GRANT_STATUSES[number])
    ? value as typeof GRANT_STATUSES[number]
    : "pending";
}

function normalizeClientStatus(value: unknown) {
  return CLIENT_STATUSES.includes(value as typeof CLIENT_STATUSES[number])
    ? value as typeof CLIENT_STATUSES[number]
    : null;
}

function normalizeExpiresAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

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
    | "revoke-partner"
    | "upsert-restaurant-grant"
    | "update-grant-status"
    | "update-client-policy";
  client_uuid?: string;
  partner_id?: string;
  restaurant_id?: string;
  grant_id?: string;
  endpoint_id?: string;
  webhook_url?: string;
  events?: string[];
  allowed_scopes?: string[] | string;
  status?: string;
  allow_mcp?: boolean;
  max_daily_reservations?: number;
  max_party_size?: number;
  token_ttl_seconds?: number;
  tok_connect_quota_per_minute?: number;
  expires_at?: string | null;
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

async function updateGrantStatus(
  actor: PortalActor,
  req: Request,
  requestId: string,
  grantId: string,
  status: "pending" | "active" | "suspended" | "revoked",
) {
  const { data: grant, error: grantError } = await actor.adminClient
    .from("tok_connect_restaurant_grants")
    .select("id, partner_id, restaurant_id, status")
    .eq("id", grantId)
    .maybeSingle<{ id: string; partner_id: string; restaurant_id: string; status: string }>();

  if (grantError) throw new HttpError(500, grantError.message);
  if (!grant) throw new HttpError(404, "tok_connect_grant_not_found");

  await requireRestaurantAccess(actor, grant.restaurant_id);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    updated_at: now,
  };
  if (status === "active") {
    patch.granted_by = actor.userId;
    patch.granted_at = now;
  }
  if (status === "revoked") {
    patch.granted_at = null;
  }

  const { data: updatedGrant, error } = await actor.adminClient
    .from("tok_connect_restaurant_grants")
    .update(patch)
    .eq("id", grant.id)
    .select("id, partner_id, restaurant_id, status, allowed_scopes, allow_mcp, max_daily_reservations, max_party_size, expires_at")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog({
    adminClient: actor.adminClient,
    functionName: "tok-connect-portal",
    action: "update-grant-status",
    status: "success",
    actor,
    request: req,
    targetEntityType: "tok_connect_restaurant_grant",
    targetEntityId: grant.id,
    metadata: { request_id: requestId, partner_id: grant.partner_id, restaurant_id: grant.restaurant_id, next_status: status },
  });

  return { grant: updatedGrant };
}

async function upsertRestaurantGrant(
  actor: PortalActor,
  req: Request,
  requestId: string,
  body: PortalBody,
) {
  if (!actor.isAdmin) throw new HttpError(403, "admin_required");
  if (!body.partner_id) throw new HttpError(400, "partner_id_required");
  if (!body.restaurant_id) throw new HttpError(400, "restaurant_id_required");

  const scopes = normalizeScopes(body.allowed_scopes);
  if (scopes.length === 0) throw new HttpError(400, "allowed_scopes_required");
  const status = normalizeGrantStatus(body.status);
  const now = new Date().toISOString();

  const row = {
    partner_id: body.partner_id,
    restaurant_id: body.restaurant_id,
    allowed_scopes: scopes,
    status,
    allow_mcp: Boolean(body.allow_mcp),
    max_daily_reservations: clampInteger(body.max_daily_reservations, 0, 0, 500),
    max_party_size: clampInteger(body.max_party_size, 8, 1, 50),
    granted_by: status === "active" ? actor.userId : null,
    granted_at: status === "active" ? now : null,
    expires_at: normalizeExpiresAt(body.expires_at),
    updated_at: now,
    metadata: { managed_by: "tok-connect-portal", updated_by: actor.userId, request_id: requestId },
  };

  const { data: grant, error } = await actor.adminClient
    .from("tok_connect_restaurant_grants")
    .upsert(row, { onConflict: "partner_id,restaurant_id" })
    .select("id, partner_id, restaurant_id, status, allowed_scopes, allow_mcp, max_daily_reservations, max_party_size, expires_at")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog({
    adminClient: actor.adminClient,
    functionName: "tok-connect-portal",
    action: "upsert-restaurant-grant",
    status: "success",
    actor,
    request: req,
    targetEntityType: "tok_connect_restaurant_grant",
    targetEntityId: grant.id,
    metadata: {
      request_id: requestId,
      partner_id: body.partner_id,
      restaurant_id: body.restaurant_id,
      scopes,
      max_daily_reservations: row.max_daily_reservations,
      max_party_size: row.max_party_size,
    },
  });

  return { grant };
}

async function updateClientPolicy(
  actor: PortalActor,
  req: Request,
  requestId: string,
  body: PortalBody,
) {
  if (!actor.isAdmin) throw new HttpError(403, "admin_required");
  if (!body.client_uuid) throw new HttpError(400, "client_uuid_required");

  const { data: client, error: clientError } = await actor.adminClient
    .from("tok_connect_clients")
    .select("id, partner_id, metadata")
    .eq("id", body.client_uuid)
    .maybeSingle<{ id: string; partner_id: string; metadata: Record<string, unknown> | null }>();

  if (clientError) throw new HttpError(500, clientError.message);
  if (!client) throw new HttpError(404, "tok_connect_client_not_found");

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const scopes = normalizeScopes(body.allowed_scopes);
  if (scopes.length > 0) patch.allowed_scopes = scopes;
  if (typeof body.token_ttl_seconds !== "undefined") {
    patch.token_ttl_seconds = clampInteger(body.token_ttl_seconds, 900, 60, 3600);
  }
  const status = normalizeClientStatus(body.status);
  if (status) patch.status = status;

  if (typeof body.tok_connect_quota_per_minute !== "undefined") {
    patch.metadata = {
      ...(client.metadata || {}),
      tok_connect_quota_per_minute: clampInteger(body.tok_connect_quota_per_minute, 240, 1, 10_000),
      policy_updated_by: actor.userId,
      policy_updated_at: new Date().toISOString(),
    };
  }

  const { data: updatedClient, error } = await actor.adminClient
    .from("tok_connect_clients")
    .update(patch)
    .eq("id", client.id)
    .select("id, partner_id, client_id, allowed_scopes, status, token_ttl_seconds, metadata")
    .single();

  if (error) throw new HttpError(500, error.message);

  await writeAuditLog({
    adminClient: actor.adminClient,
    functionName: "tok-connect-portal",
    action: "update-client-policy",
    status: "success",
    actor,
    request: req,
    targetEntityType: "tok_connect_client",
    targetEntityId: client.id,
    metadata: {
      request_id: requestId,
      partner_id: client.partner_id,
      scopes_updated: scopes.length > 0,
      token_ttl_seconds: patch.token_ttl_seconds || null,
      tok_connect_quota_per_minute: typeof body.tok_connect_quota_per_minute !== "undefined"
        ? patch.metadata && (patch.metadata as Record<string, unknown>).tok_connect_quota_per_minute
        : null,
    },
  });

  return { client: updatedClient };
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

    if (action === "update-grant-status") {
      if (!body.grant_id) throw new HttpError(400, "grant_id_required");
      if (!GRANT_STATUSES.includes(body.status as typeof GRANT_STATUSES[number])) {
        throw new HttpError(400, "grant_status_invalid");
      }
      return jsonResponse(buildTokConnectEnvelope({
        requestId,
        data: await updateGrantStatus(actor, req, requestId, body.grant_id, body.status as typeof GRANT_STATUSES[number]),
      }), 200, corsHeaders);
    }

    if (action === "upsert-restaurant-grant") {
      return jsonResponse(buildTokConnectEnvelope({
        requestId,
        data: await upsertRestaurantGrant(actor, req, requestId, body),
      }), 200, corsHeaders);
    }

    if (action === "update-client-policy") {
      return jsonResponse(buildTokConnectEnvelope({
        requestId,
        data: await updateClientPolicy(actor, req, requestId, body),
      }), 200, corsHeaders);
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
