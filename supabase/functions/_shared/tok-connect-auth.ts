import { buildRequestMetadata, createAdminClient, type EdgeSupabaseClient, HttpError } from "./auth.ts";
import {
  assertTokConnectScopes,
  base64UrlDecodeText,
  buildTokConnectWebhookHeaders,
  getTokConnectBearerToken,
  hashTokConnectSecret,
} from "./tok-connect.ts";

export type TokConnectTokenContext = {
  adminClient: EdgeSupabaseClient;
  tokenId: string;
  partnerId: string;
  clientUuid: string;
  scopes: string[];
  environment: "sandbox" | "production";
  clientQuotaPerMinute: number;
  partnerQuotaPerMinute: number;
  authMode: "legacy_partner_token" | "supabase_oauth";
  userId: string | null;
  oauthClientId: string | null;
};

type TokenRow = {
  id: string;
  partner_id: string;
  client_id: string;
  scopes: string[] | null;
  environment: "sandbox" | "production";
  expires_at: string;
  revoked_at: string | null;
};

type ClientRow = {
  id: string;
  partner_id: string;
  status: string;
  allowed_scopes: string[] | null;
  environment: "sandbox" | "production";
  metadata: Record<string, unknown> | null;
};

type PartnerRow = {
  id: string;
  status: string;
  environment: "sandbox" | "production";
  metadata: Record<string, unknown> | null;
};

type RestaurantGrantRow = {
  id: string;
  allowed_scopes: string[] | null;
  allow_mcp: boolean;
  max_daily_reservations: number;
  max_party_size: number;
};

const ALL_TOK_CONNECT_SCOPES = [
  "restaurants:read",
  "availability:read",
  "reservations:create",
  "reservations:cancel",
  "credits:read",
  "campaigns:preview",
  "analytics:read",
  "autopilot:plan",
];

function readJwtPayload(token: string): Record<string, unknown> {
  try {
    const segment = token.split(".")[1];
    if (!segment) return {};
    const parsed = JSON.parse(base64UrlDecodeText(segment));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function authenticateSupabaseOAuthToken(
  adminClient: EdgeSupabaseClient,
  rawToken: string,
  requiredScopes: string[],
): Promise<TokConnectTokenContext> {
  const { data, error } = await adminClient.auth.getUser(rawToken);
  if (error || !data.user) throw new HttpError(401, "tok_connect_token_invalid");

  const claims = readJwtPayload(rawToken);
  const oauthClientId = typeof claims.client_id === "string" ? claims.client_id : null;
  if (!oauthClientId) throw new HttpError(401, "tok_connect_oauth_client_id_required");

  // Supabase OAuth exposes the authenticated user. TOK business permissions
  // remain server-side and are enforced in assertTokConnectRestaurantGrant.
  const scopes = [...ALL_TOK_CONNECT_SCOPES];
  try {
    assertTokConnectScopes(scopes, requiredScopes);
  } catch {
    throw new HttpError(403, `tok_connect_scope_required:${requiredScopes.join(",")}`);
  }

  return {
    adminClient,
    tokenId: data.user.id,
    partnerId: data.user.id,
    clientUuid: oauthClientId,
    scopes,
    environment: "production",
    clientQuotaPerMinute: 240,
    partnerQuotaPerMinute: 600,
    authMode: "supabase_oauth",
    userId: data.user.id,
    oauthClientId,
  };
}

function asMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getTokConnectQuotaPerMinute(
  metadata: unknown,
  key: "tok_connect_quota_per_minute" | "tok_connect_partner_quota_per_minute",
  fallback: number,
) {
  const raw = asMetadataRecord(metadata)[key];
  const quota = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(quota)) return fallback;
  return Math.max(1, Math.min(Math.floor(quota), 10_000));
}

export async function assertTokConnectFeatureEnabled(
  adminClient: EdgeSupabaseClient,
  flagName: string,
) {
  const { data, error } = await adminClient
    .from("feature_flags")
    .select("is_active")
    .eq("name", flagName)
    .maybeSingle<{ is_active: boolean | null }>();

  if (error) throw new HttpError(500, error.message);
  if (!data?.is_active) throw new HttpError(403, `tok_connect_feature_disabled:${flagName}`);
}

async function assertTokConnectRestaurantMcpEnabled(
  context: TokConnectTokenContext,
  restaurantId: string,
) {
  const { data: restaurant, error } = await context.adminClient
    .from("restaurants")
    .select("id, tok_connect_mcp_enabled")
    .eq("id", restaurantId)
    .maybeSingle<{ id: string; tok_connect_mcp_enabled: boolean | null }>();

  if (error) throw new HttpError(500, error.message);
  if (!restaurant) throw new HttpError(404, "tok_connect_restaurant_not_found");
  if (restaurant.tok_connect_mcp_enabled === false) {
    throw new HttpError(403, "tok_connect_restaurant_mcp_disabled");
  }
}

export async function assertTokConnectRestaurantGrant(
  context: TokConnectTokenContext,
  restaurantId: string,
  requiredScope: string,
  options: {
    requireMcp?: boolean;
    partySize?: number | null;
    enforceDailyReservationLimit?: boolean;
  } = {},
) {
  if (!restaurantId) throw new HttpError(400, "restaurant_id_required");
  if (context.environment === "sandbox") return null;

  // This flag is the global kill switch for a restaurant. It is deliberately
  // checked before both Supabase OAuth and legacy partner grants so the Admin
  // button has one unambiguous meaning: revoked means inaccessible everywhere.
  await assertTokConnectRestaurantMcpEnabled(context, restaurantId);

  if (context.authMode === "supabase_oauth") {
    if (!context.userId) throw new HttpError(401, "tok_connect_user_required");

    const customerScopes = new Set([
      "restaurants:read",
      "availability:read",
      "reservations:create",
      "reservations:cancel",
    ]);
    if (customerScopes.has(requiredScope)) return { auth_mode: "supabase_oauth", access: "customer" };

    const [{ data: restaurant, error: restaurantError }, { data: staffEntries, error: staffError }, { data: roles, error: roleError }] = await Promise.all([
      context.adminClient.from("restaurants").select("id").eq("id", restaurantId).eq("owner_id", context.userId).maybeSingle(),
      context.adminClient.from("restaurant_staff").select("id, role").eq("restaurant_id", restaurantId).eq("user_id", context.userId),
      context.adminClient.from("user_roles").select("role").eq("user_id", context.userId),
    ]);

    if (restaurantError) throw new HttpError(500, restaurantError.message);
    if (staffError) throw new HttpError(500, staffError.message);
    if (roleError) throw new HttpError(500, roleError.message);
    const isAdmin = (roles || []).some((entry) => entry.role === "admin");
    const staffRolesByScope: Record<string, Set<string>> = {
      "credits:read": new Set(["owner", "manager", "finance"]),
      "campaigns:preview": new Set(["owner", "manager", "marketing"]),
      "analytics:read": new Set(["owner", "manager", "finance", "marketing", "analyst"]),
      "autopilot:plan": new Set(["owner", "manager"]),
    };
    const allowedStaffRoles = staffRolesByScope[requiredScope] || new Set(["owner", "manager"]);
    const staff = (staffEntries || []).find((entry) =>
      typeof entry.role === "string" && allowedStaffRoles.has(entry.role.toLowerCase())
    );
    const hasStaffAccess = Boolean(staff);
    if (!restaurant && !hasStaffAccess && !isAdmin) {
      throw new HttpError(403, "tok_connect_restaurant_access_required");
    }
    return { auth_mode: "supabase_oauth", access: isAdmin ? "admin" : restaurant ? "owner" : staff?.role || "staff" };
  }

  const { data: grantEnabled, error: grantEnabledError } = await context.adminClient.rpc(
    "tok_connect_restaurant_grant_enabled",
    {
      p_partner_id: context.partnerId,
      p_restaurant_id: restaurantId,
      p_scope: requiredScope,
    },
  );

  if (grantEnabledError) throw new HttpError(500, grantEnabledError.message);
  if (!grantEnabled) throw new HttpError(403, "tok_connect_restaurant_grant_required");

  const { data: grant, error: grantError } = await context.adminClient
    .from("tok_connect_restaurant_grants")
    .select("id, allowed_scopes, allow_mcp, max_daily_reservations, max_party_size")
    .eq("partner_id", context.partnerId)
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .contains("allowed_scopes", [requiredScope])
    .maybeSingle<RestaurantGrantRow>();

  if (grantError) throw new HttpError(500, grantError.message);
  if (!grant) throw new HttpError(403, "tok_connect_restaurant_grant_required");
  if (options.requireMcp && !grant.allow_mcp) throw new HttpError(403, "tok_connect_mcp_grant_required");

  const partySize = Number(options.partySize || 0);
  if (partySize > 0 && grant.max_party_size > 0 && partySize > grant.max_party_size) {
    throw new HttpError(403, "tok_connect_party_size_limit_exceeded");
  }

  if (options.enforceDailyReservationLimit && grant.max_daily_reservations > 0) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count, error: countError } = await context.adminClient
      .from("tok_connect_api_requests")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", context.partnerId)
      .eq("restaurant_id", restaurantId)
      .eq("route", "POST /v1/reservations")
      .gte("created_at", dayStart.toISOString())
      .is("error_code", null);

    if (countError) throw new HttpError(500, countError.message);
    if ((count || 0) >= grant.max_daily_reservations) {
      throw new HttpError(429, "tok_connect_daily_reservation_limit_exceeded");
    }
  }

  return grant;
}

export async function authenticateTokConnectToken(
  req: Request,
  requiredScopes: string[] = [],
): Promise<TokConnectTokenContext> {
  const adminClient = createAdminClient();
  const rawToken = getTokConnectBearerToken(req);
  if (!rawToken) throw new HttpError(401, "tok_connect_token_required");

  const tokenHash = await hashTokConnectSecret(rawToken);
  const { data: tokenRow, error: tokenError } = await adminClient
    .from("tok_connect_access_tokens")
    .select("id, partner_id, client_id, scopes, environment, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<TokenRow>();

  if (tokenError) throw new HttpError(500, tokenError.message);
  if (!tokenRow) {
    if (rawToken.split(".").length === 3) {
      return await authenticateSupabaseOAuthToken(adminClient, rawToken, requiredScopes);
    }
    throw new HttpError(401, "tok_connect_token_invalid");
  }
  if (tokenRow.revoked_at) throw new HttpError(401, "tok_connect_token_invalid");
  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, "tok_connect_token_expired");
  }

  const { data: clientRow, error: clientError } = await adminClient
    .from("tok_connect_clients")
    .select("id, partner_id, status, allowed_scopes, environment, metadata")
    .eq("id", tokenRow.client_id)
    .maybeSingle<ClientRow>();

  if (clientError) throw new HttpError(500, clientError.message);
  if (!clientRow || clientRow.status !== "active") throw new HttpError(401, "tok_connect_client_inactive");
  if (
    clientRow.id !== tokenRow.client_id ||
    clientRow.partner_id !== tokenRow.partner_id ||
    clientRow.environment !== tokenRow.environment
  ) {
    throw new HttpError(401, "tok_connect_token_client_mismatch");
  }

  const { data: partnerRow, error: partnerError } = await adminClient
    .from("tok_connect_partners")
    .select("id, status, environment, metadata")
    .eq("id", tokenRow.partner_id)
    .maybeSingle<PartnerRow>();

  if (partnerError) throw new HttpError(500, partnerError.message);
  if (!partnerRow || partnerRow.status !== "active") throw new HttpError(403, "tok_connect_partner_inactive");

  const scopes = tokenRow.scopes || [];
  try {
    assertTokConnectScopes(clientRow.allowed_scopes || [], scopes);
  } catch {
    throw new HttpError(401, "tok_connect_token_scope_revoked");
  }
  try {
    assertTokConnectScopes(scopes, requiredScopes);
  } catch {
    throw new HttpError(403, `tok_connect_scope_required:${requiredScopes.join(",")}`);
  }

  await adminClient
    .from("tok_connect_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  return {
    adminClient,
    tokenId: tokenRow.id,
    partnerId: tokenRow.partner_id,
    clientUuid: tokenRow.client_id,
    scopes,
    environment: tokenRow.environment,
    clientQuotaPerMinute: getTokConnectQuotaPerMinute(
      clientRow.metadata,
      "tok_connect_quota_per_minute",
      240,
    ),
    partnerQuotaPerMinute: getTokConnectQuotaPerMinute(
      partnerRow.metadata,
      "tok_connect_partner_quota_per_minute",
      600,
    ),
    authMode: "legacy_partner_token",
    userId: null,
    oauthClientId: null,
  };
}

export async function recordTokConnectApiRequest(input: {
  context: TokConnectTokenContext | null;
  request: Request;
  requestId: string;
  route: string;
  statusCode: number;
  startedAt: number;
  scopes?: string[];
  restaurantId?: string | null;
  idempotencyKey?: string | null;
  errorCode?: string | null;
}) {
  const adminClient = input.context?.adminClient || createAdminClient();

  try {
    await adminClient.from("tok_connect_api_requests").insert({
      partner_id: input.context?.authMode === "supabase_oauth" ? null : input.context?.partnerId || null,
      client_id: input.context?.authMode === "supabase_oauth" ? null : input.context?.clientUuid || null,
      access_token_id: input.context?.authMode === "supabase_oauth" ? null : input.context?.tokenId || null,
      restaurant_id: input.restaurantId || null,
      request_id: input.requestId,
      method: input.request.method,
      route: input.route,
      scopes: input.scopes || [],
      status_code: input.statusCode,
      latency_ms: Math.max(0, Date.now() - input.startedAt),
      idempotency_key: input.idempotencyKey || null,
      error_code: input.errorCode || null,
      request_metadata: {
        ...buildRequestMetadata(input.request),
        content_type: input.request.headers.get("content-type"),
        accept: input.request.headers.get("accept"),
        mcp_protocol_version: input.request.headers.get("mcp-protocol-version"),
        has_authorization: input.request.headers.has("authorization"),
        ...(input.context?.authMode === "supabase_oauth"
          ? {
            auth_mode: "supabase_oauth",
            oauth_client_id: input.context.oauthClientId,
            oauth_user_id: input.context.userId,
          }
          : {}),
      },
    });
  } catch (error) {
    console.error("[tok-connect] api request log failure", error);
  }
}

export async function enqueueTokConnectWebhookDeliveries(input: {
  context: TokConnectTokenContext;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  if (input.context.authMode === "supabase_oauth") {
    throw new HttpError(403, "tok_connect_partner_token_required");
  }
  const { data: endpoints, error } = await input.context.adminClient
    .from("tok_connect_webhook_endpoints")
    .select("id, signing_secret, events")
    .eq("partner_id", input.context.partnerId)
    .eq("status", "active")
    .contains("events", [input.eventType]);

  if (error) throw new HttpError(500, error.message);
  const payloadText = JSON.stringify(input.payload);
  const timestamp = new Date().toISOString();

  const rows = [];
  for (const endpoint of endpoints || []) {
    const webhookHeaders = await buildTokConnectWebhookHeaders({
      eventType: input.eventType,
      deliveryId: crypto.randomUUID(),
      secret: endpoint.signing_secret,
      timestamp,
      payload: payloadText,
    });
    rows.push({
      endpoint_id: endpoint.id,
      partner_id: input.context.partnerId,
      event_type: input.eventType,
      payload: input.payload,
      signature: webhookHeaders["X-TOK-Signature"],
    });
  }

  if (rows.length > 0) {
    const { error: insertError } = await input.context.adminClient
      .from("tok_connect_webhook_deliveries")
      .insert(rows);
    if (insertError) throw new HttpError(500, insertError.message);
  }

  return rows.length;
}
