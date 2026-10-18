import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  buildRequestMetadata,
  createAdminClient,
  HttpError,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  assertTokConnectScopes,
  createTokConnectAccessToken,
  hashTokConnectSecret,
  makeTokConnectRequestId,
  verifyTokConnectSecret,
} from "../_shared/tok-connect.ts";
import { assertTokConnectFeatureEnabled } from "../_shared/tok-connect-auth.ts";

type OAuthBody = {
  grant_type?: string;
  client_id?: string;
  client_secret?: string;
  scope?: string;
};

type ClientRow = {
  id: string;
  partner_id: string;
  client_id: string;
  client_secret_hash: string;
  status: string;
  environment: "sandbox" | "production";
  allowed_scopes: string[] | null;
  token_ttl_seconds: number;
};

type OAuthTokenPayload = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
};

type OAuthErrorPayload = {
  error: string;
  error_description: string;
};

function decodeOAuthBasicComponent(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    return value;
  }
}

function oauthHeaders(corsHeaders: Record<string, string>) {
  return {
    ...corsHeaders,
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
  };
}

function oauthTokenResponse(payload: OAuthTokenPayload, corsHeaders: Record<string, string>) {
  return jsonResponse(payload, 200, oauthHeaders(corsHeaders));
}

function getOAuthErrorCode(message: string, status: number) {
  if (message === "invalid_client" || status === 401) return "invalid_client";
  if (message === "unsupported_grant_type") return "unsupported_grant_type";
  if (message.includes("scope")) return "invalid_scope";
  if (
    message === "invalid_authorization_code" ||
    message === "authorization_code_expired" ||
    message === "redirect_uri_mismatch"
  ) {
    return "invalid_grant";
  }
  if (status === 403) return "unauthorized_client";
  if (status === 400) return "invalid_request";
  return "server_error";
}

function oauthErrorResponse(message: string, status: number, corsHeaders: Record<string, string>) {
  const payload: OAuthErrorPayload = {
    error: getOAuthErrorCode(message, status),
    error_description: message,
  };
  return jsonResponse(payload, status, oauthHeaders(corsHeaders));
}

function readBasicClientCredentials(req: Request): Pick<OAuthBody, "client_id" | "client_secret"> {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("basic ")) return {};
  try {
    // ChatGPT manual OAuth uses client_secret_basic and may form-encode each component before Base64.
    const decoded = atob(authorization.slice("basic ".length).trim());
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return {};
    return {
      client_id: decodeOAuthBasicComponent(decoded.slice(0, separatorIndex)),
      client_secret: decodeOAuthBasicComponent(decoded.slice(separatorIndex + 1)),
    };
  } catch {
    return {};
  }
}

async function readOAuthBody(req: Request): Promise<OAuthBody> {
  const basicCredentials = readBasicClientCredentials(req);
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await req.text());
    return {
      ...basicCredentials,
      grant_type: form.get("grant_type") || undefined,
      client_id: form.get("client_id") || basicCredentials.client_id,
      client_secret: form.get("client_secret") || basicCredentials.client_secret,
      scope: form.get("scope") || undefined,
    };
  }

  const body = await req.json().catch(() => ({}));
  return { ...body, ...basicCredentials };
}

async function getActiveClient(adminClient: ReturnType<typeof createAdminClient>, clientId: string) {
  const { data: client, error: clientError } = await adminClient
    .from("tok_connect_clients")
    .select("id, partner_id, client_id, client_secret_hash, status, environment, allowed_scopes, token_ttl_seconds")
    .eq("client_id", clientId)
    .maybeSingle<ClientRow>();

  if (clientError) throw new HttpError(500, clientError.message);
  if (!client || client.status !== "active") throw new HttpError(401, "invalid_client");
  return client;
}

async function assertPartnerActive(adminClient: ReturnType<typeof createAdminClient>, partnerId: string) {
  const { data: partner, error: partnerError } = await adminClient
    .from("tok_connect_partners")
    .select("id, status")
    .eq("id", partnerId)
    .maybeSingle<{ id: string; status: string }>();

  if (partnerError) throw new HttpError(500, partnerError.message);
  if (!partner || partner.status !== "active") throw new HttpError(403, "partner_inactive");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  if (req.method === "GET") return oauthErrorResponse("interactive_oauth_moved_to_tok_broker", 410, corsHeaders);
  if (req.method !== "POST") return oauthErrorResponse("method_not_allowed", 405, corsHeaders);

  const requestId = makeTokConnectRequestId();
  const adminClient = createAdminClient();

  try {
    await assertTokConnectFeatureEnabled(adminClient, "tok-connect");
    await assertTokConnectFeatureEnabled(adminClient, "tok-connect-api");

    const body = await readOAuthBody(req);
    if (body.grant_type !== "client_credentials") {
      throw new HttpError(400, "unsupported_grant_type");
    }

    if (!body.client_id || !body.client_secret) {
      throw new HttpError(400, "client_credentials_required");
    }

    const limiter = createRateLimiter(adminClient, "tok-connect-oauth");
    await limiter.consume(`client:${body.client_id}`, { maxRequests: 30, windowSeconds: 60 });

    const client = await getActiveClient(adminClient, body.client_id);

    const secretMatches = await verifyTokConnectSecret(body.client_secret, client.client_secret_hash);
    if (!secretMatches) throw new HttpError(401, "invalid_client");

    await assertPartnerActive(adminClient, client.partner_id);

    const allowedScopes = client.allowed_scopes || [];
    const requestedScopes = (body.scope || "")
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean);
    const issuedScopes = requestedScopes.length > 0 ? requestedScopes : allowedScopes;
    assertTokConnectScopes(allowedScopes, issuedScopes);

    const accessToken = createTokConnectAccessToken();
    const tokenHash = await hashTokConnectSecret(accessToken);
    const expiresIn = Math.max(60, Math.min(client.token_ttl_seconds || 900, 3600));
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { error: insertError } = await adminClient.from("tok_connect_access_tokens").insert({
      partner_id: client.partner_id,
      client_id: client.id,
      token_hash: tokenHash,
      scopes: issuedScopes,
      environment: client.environment,
      expires_at: expiresAt,
      revoked_at: null,
      request_metadata: buildRequestMetadata(req),
    });

    if (insertError) throw new HttpError(500, insertError.message);

    await writeAuditLog({
      adminClient,
      functionName: "tok-connect-oauth",
      action: "issue_client_credentials_token",
      status: "success",
      request: req,
      targetEntityType: "tok_connect_client",
      targetEntityId: client.id,
      metadata: { request_id: requestId, scopes: issuedScopes },
    });

    return oauthTokenResponse({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: issuedScopes.join(" "),
    }, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "tok_connect_oauth_error";

    await writeAuditLog({
      adminClient,
      functionName: "tok-connect-oauth",
      action: "issue_client_credentials_token",
      status: "failure",
      request: req,
      errorMessage: message,
      metadata: { request_id: requestId },
    });

    return oauthErrorResponse(message, status, corsHeaders);
  }
});
