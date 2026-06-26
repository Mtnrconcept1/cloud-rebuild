import { buildRequestMetadata, createAdminClient, type EdgeSupabaseClient, HttpError } from "./auth.ts";
import {
  assertTokConnectScopes,
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
  if (!tokenRow || tokenRow.revoked_at) throw new HttpError(401, "tok_connect_token_invalid");
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
  assertTokConnectScopes(scopes, requiredScopes);

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
      partner_id: input.context?.partnerId || null,
      client_id: input.context?.clientUuid || null,
      access_token_id: input.context?.tokenId || null,
      restaurant_id: input.restaurantId || null,
      request_id: input.requestId,
      method: input.request.method,
      route: input.route,
      scopes: input.scopes || [],
      status_code: input.statusCode,
      latency_ms: Math.max(0, Date.now() - input.startedAt),
      idempotency_key: input.idempotencyKey || null,
      error_code: input.errorCode || null,
      request_metadata: buildRequestMetadata(input.request),
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
