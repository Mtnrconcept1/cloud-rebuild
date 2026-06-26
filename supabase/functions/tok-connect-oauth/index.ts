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

async function readOAuthBody(req: Request): Promise<OAuthBody> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await req.text());
    return {
      grant_type: form.get("grant_type") || undefined,
      client_id: form.get("client_id") || undefined,
      client_secret: form.get("client_secret") || undefined,
      scope: form.get("scope") || undefined,
    };
  }

  return await req.json().catch(() => ({}));
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const requestId = makeTokConnectRequestId();
  const adminClient = createAdminClient();

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
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

    const { data: client, error: clientError } = await adminClient
      .from("tok_connect_clients")
      .select("id, partner_id, client_id, client_secret_hash, status, environment, allowed_scopes, token_ttl_seconds")
      .eq("client_id", body.client_id)
      .maybeSingle<ClientRow>();

    if (clientError) throw new HttpError(500, clientError.message);
    if (!client || client.status !== "active") throw new HttpError(401, "invalid_client");

    const secretMatches = await verifyTokConnectSecret(body.client_secret, client.client_secret_hash);
    if (!secretMatches) throw new HttpError(401, "invalid_client");

    const { data: partner, error: partnerError } = await adminClient
      .from("tok_connect_partners")
      .select("id, status")
      .eq("id", client.partner_id)
      .maybeSingle<{ id: string; status: string }>();

    if (partnerError) throw new HttpError(500, partnerError.message);
    if (!partner || partner.status !== "active") throw new HttpError(403, "partner_inactive");

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
