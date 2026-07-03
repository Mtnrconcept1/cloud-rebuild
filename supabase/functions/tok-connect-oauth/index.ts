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
  buildTokConnectEnvelope,
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
  code?: string;
  redirect_uri?: string;
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

function base64UrlEncode(input: string) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return atob(padded);
}

function decodeOAuthBasicComponent(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    return value;
  }
}

async function signCodePayload(payload: string) {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret) throw new HttpError(500, "oauth_signing_secret_missing");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

async function createAuthorizationCode(data: {
  clientId: string;
  redirectUri: string;
  scope: string;
}) {
  const payload = base64UrlEncode(JSON.stringify({
    client_id: data.clientId,
    redirect_uri: data.redirectUri,
    scope: data.scope,
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: crypto.randomUUID(),
  }));
  const signature = await signCodePayload(payload);
  return `${payload}.${signature}`;
}

async function verifyAuthorizationCode(code: string) {
  const [payload, signature] = code.split(".");
  if (!payload || !signature) throw new HttpError(400, "invalid_authorization_code");
  const expectedSignature = await signCodePayload(payload);
  if (signature !== expectedSignature) throw new HttpError(400, "invalid_authorization_code");

  const parsed = JSON.parse(base64UrlDecode(payload)) as {
    client_id?: string;
    redirect_uri?: string;
    scope?: string;
    exp?: number;
  };
  if (!parsed.client_id || !parsed.redirect_uri || !parsed.exp) {
    throw new HttpError(400, "invalid_authorization_code");
  }
  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    throw new HttpError(400, "authorization_code_expired");
  }
  return parsed;
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
      code: form.get("code") || undefined,
      redirect_uri: form.get("redirect_uri") || undefined,
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

async function handleAuthorizationRequest(req: Request, adminClient: ReturnType<typeof createAdminClient>) {
  const url = new URL(req.url);
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const state = url.searchParams.get("state") || "";
  const scope = url.searchParams.get("scope") || "";

  if (responseType !== "code") throw new HttpError(400, "response_type_code_required");
  if (!clientId || !redirectUri) throw new HttpError(400, "client_id_and_redirect_uri_required");

  const redirectUrl = new URL(redirectUri);
  if (redirectUrl.protocol !== "https:" || redirectUrl.hostname !== "chatgpt.com") {
    throw new HttpError(400, "redirect_uri_not_allowed");
  }

  const client = await getActiveClient(adminClient, clientId);
  await assertPartnerActive(adminClient, client.partner_id);

  const allowedScopes = client.allowed_scopes || [];
  const requestedScopes = scope
    .split(/\s+/)
    .map((nextScope) => nextScope.trim())
    .filter(Boolean);
  const issuedScopes = requestedScopes.length > 0 ? requestedScopes : allowedScopes;
  assertTokConnectScopes(allowedScopes, issuedScopes);

  const code = await createAuthorizationCode({
    clientId,
    redirectUri,
    scope: issuedScopes.join(" "),
  });

  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);
  return Response.redirect(redirectUrl.toString(), 302);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const requestId = makeTokConnectRequestId();
  const adminClient = createAdminClient();

  try {
    await assertTokConnectFeatureEnabled(adminClient, "tok-connect");
    await assertTokConnectFeatureEnabled(adminClient, "tok-connect-api");

    if (req.method === "GET") {
      return await handleAuthorizationRequest(req, adminClient);
    }
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");

    const body = await readOAuthBody(req);
    if (body.grant_type !== "client_credentials" && body.grant_type !== "authorization_code") {
      throw new HttpError(400, "unsupported_grant_type");
    }

    if (body.grant_type === "authorization_code") {
      if (!body.code || !body.redirect_uri) throw new HttpError(400, "authorization_code_required");
      const codePayload = await verifyAuthorizationCode(body.code);
      if (codePayload.redirect_uri !== body.redirect_uri) throw new HttpError(400, "redirect_uri_mismatch");
      body.client_id = body.client_id || codePayload.client_id;
      body.scope = codePayload.scope || body.scope;
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

    return jsonResponse(
      buildTokConnectEnvelope({
        requestId,
        data: {
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: expiresIn,
          scope: issuedScopes.join(" "),
        },
      }),
      200,
      corsHeaders,
    );
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
