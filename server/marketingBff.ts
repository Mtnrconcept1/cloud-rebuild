import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Server-only boundary for marketing.thetok.ch.
 *
 * This module intentionally has no dependency on the browser Supabase client:
 * Supabase access and refresh tokens only exist in this process and in the
 * encrypted, short-lived database challenge store. The browser receives opaque
 * random handles only.
 */

export const MARKETING_HOST = "marketing.thetok.ch";
export const MARKETING_ORIGIN = `https://${MARKETING_HOST}`;
export const MARKETING_CSRF_HEADER = "x-tok-marketing-csrf";

export const MARKETING_SESSION_COOKIE = "__Host-tok_marketing_sid";
export const MARKETING_CSRF_COOKIE = "__Host-tok_marketing_csrf";
export const MARKETING_PENDING_COOKIE = "__Host-tok_marketing_pending";

const MAX_PENDING_SECONDS = 10 * 60;
const MAX_SESSION_SECONDS = 4 * 60 * 60;
const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
/**
 * Supabase renders the TOTP QR code as an SVG carrying one `<rect>` per module,
 * so the payload grows with the length of the `otpauth://` URI rather than
 * staying near any small constant. A verified production enrollment for a
 * sixteen-character issuer and an eighteen-character address encodes at QR
 * version 8 (57x57), which is 1298 dark modules and roughly 96 kB of markup.
 * The former 64 kB ceiling rejected exactly that, so this budget is sized from
 * the observed payload with room to spare rather than guessed.
 */
const MAX_QR_SVG_CHARS = 256 * 1024;
const MAX_ENROLL_RESPONSE_BYTES = 512 * 1024;
const AUTH_TIMEOUT_MS = 8_000;
const DATABASE_TIMEOUT_MS = 8_000;
const ORCHESTRATOR_TIMEOUT_MS = 20_000;
/**
 * The agent runs a reasoning pass and then up to six image generations, so it
 * needs a budget an order of magnitude above a database round trip.
 */
const AGENT_TIMEOUT_MS = 120_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MARKETING_OPERATION_NAMES = [
  "admin_approve_marketing_campaign",
  "admin_approve_marketing_item",
  "admin_cancel_marketing_item",
  "admin_complete_manual_marketing_delivery",
  "admin_complete_manual_marketing_item",
  "admin_create_marketing_campaign_bundle",
  "admin_estimate_marketing_audience",
  "admin_get_marketing_overview",
  "admin_list_marketing_automations",
  "admin_list_marketing_calendar",
  "admin_list_marketing_campaigns",
  "admin_list_marketing_contacts",
  "admin_list_marketing_deliveries",
  "admin_list_marketing_integrations",
  "admin_reveal_manual_delivery_target",
  "admin_retry_marketing_delivery",
  "admin_set_marketing_global_pause",
  "admin_suppress_marketing_contact",
  "admin_sync_marketing_client_consents",
  "admin_sync_marketing_prospect_catalog",
  "admin_upsert_marketing_automation",
  "admin_upsert_marketing_calendar_item",
  "admin_upsert_marketing_campaign",
  "admin_upsert_marketing_contact",
] as const;

export type MarketingOperation = (typeof MARKETING_OPERATION_NAMES)[number];

const MARKETING_OPERATION_ALLOWLIST = new Set<string>(MARKETING_OPERATION_NAMES);

type HeaderValue = string | string[] | undefined;

export interface MarketingApiRequest {
  method?: string;
  headers: Record<string, HeaderValue>;
  body?: unknown;
  socket?: { remoteAddress?: string | null };
}

export interface MarketingApiResponse {
  statusCode: number;
  setHeader(name: string, value: string | readonly string[]): void;
  end(body?: string): void;
}

type JsonObject = Record<string, unknown>;

interface BffConfig {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
}

interface ActiveMarketingSession {
  userId: string;
  email: string;
  expiresAt: string;
  sessionHash: string;
  csrfHash: string;
}

interface PendingAuthChallenge {
  userId: string;
  accessToken: string;
  refreshToken: string;
  factorId: string;
  challengeId: string;
  expiresAt: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
}

interface MfaFactor {
  id: string;
  status: string;
  factorType: string;
  createdAt: string;
}

class PublicBffError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = "PublicBffError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

class DownstreamHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Downstream request failed");
    this.name = "DownstreamHttpError";
    this.status = status;
  }
}

function header(req: MarketingApiRequest, name: string): string {
  const direct = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0]?.trim() ?? "";
  return typeof direct === "string" ? direct.trim() : "";
}

function normalizeHost(value: string): string {
  const first = value.split(",", 1)[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("[")) return first;
  return first.replace(/:\d+$/, "");
}

/** Reject requests which did not arrive as same-origin HTTPS traffic. */
export function validateMarketingRequestContext(
  req: MarketingApiRequest,
  stateChanging: boolean,
): void {
  const host = normalizeHost(header(req, "host"));
  const forwardedHost = normalizeHost(header(req, "x-forwarded-host"));
  const forwardedProto = header(req, "x-forwarded-proto").toLowerCase();
  const origin = header(req, "origin");
  const fetchSite = header(req, "sec-fetch-site").toLowerCase();
  const fetchMode = header(req, "sec-fetch-mode").toLowerCase();
  const fetchDest = header(req, "sec-fetch-dest").toLowerCase();

  if (host !== MARKETING_HOST || (forwardedHost && forwardedHost !== MARKETING_HOST)) {
    throw new PublicBffError(403, "request_rejected", "Requête refusée.");
  }
  if (forwardedProto && forwardedProto !== "https") {
    throw new PublicBffError(403, "request_rejected", "Requête refusée.");
  }

  if (stateChanging) {
    if (origin !== MARKETING_ORIGIN || fetchSite !== "same-origin") {
      throw new PublicBffError(403, "request_rejected", "Requête refusée.");
    }
    if (fetchMode && !["cors", "same-origin"].includes(fetchMode)) {
      throw new PublicBffError(403, "request_rejected", "Requête refusée.");
    }
    if (fetchDest && fetchDest !== "empty") {
      throw new PublicBffError(403, "request_rejected", "Requête refusée.");
    }
    return;
  }

  if (origin && origin !== MARKETING_ORIGIN) {
    throw new PublicBffError(403, "request_rejected", "Requête refusée.");
  }
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw new PublicBffError(403, "request_rejected", "Requête refusée.");
  }
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function isOpaqueToken(value: string): boolean {
  return OPAQUE_TOKEN_PATTERN.test(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader || cookieHeader.length > 8_192) return {};
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) && value.length <= 256) {
      result[name] = value;
    }
  }
  return result;
}

function cookie(name: string, value: string, maxAge: number, httpOnly: boolean): string {
  const attributes = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    "Secure",
    "SameSite=Strict",
  ];
  if (httpOnly) attributes.push("HttpOnly");
  return attributes.join("; ");
}

function clearCookie(name: string, httpOnly: boolean): string {
  return `${cookie(name, "", 0, httpOnly)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function sessionCookie(value: string, maxAge: number): string {
  return cookie(MARKETING_SESSION_COOKIE, value, maxAge, true);
}

function csrfCookie(value: string, maxAge = MAX_SESSION_SECONDS): string {
  return cookie(MARKETING_CSRF_COOKIE, value, maxAge, false);
}

function pendingCookie(value: string): string {
  return cookie(MARKETING_PENDING_COOKIE, value, MAX_PENDING_SECONDS, true);
}

function clearAuthCookies(): string[] {
  return [
    clearCookie(MARKETING_SESSION_COOKIE, true),
    clearCookie(MARKETING_PENDING_COOKIE, true),
    clearCookie(MARKETING_CSRF_COOKIE, false),
  ];
}

function setSecurityHeaders(res: MarketingApiResponse): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(
  res: MarketingApiResponse,
  status: number,
  value: unknown,
  cookies: readonly string[] = [],
  retryAfter?: number,
): void {
  setSecurityHeaders(res);
  let serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_RESPONSE_BYTES) {
    status = 502;
    serialized = JSON.stringify({ error: { code: "service_unavailable", message: "Service indisponible." } });
  }
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  if (retryAfter !== undefined) res.setHeader("Retry-After", String(retryAfter));
  res.statusCode = status;
  res.end(serialized);
}

function sendError(res: MarketingApiResponse, error: unknown): void {
  if (error instanceof PublicBffError) {
    sendJson(
      res,
      error.status,
      { error: { code: error.code, message: error.message } },
      [],
      error.retryAfter,
    );
    return;
  }
  sendJson(res, 503, { error: { code: "service_unavailable", message: "Service indisponible." } });
}

function methodNotAllowed(res: MarketingApiResponse, allowed: readonly string[]): void {
  res.setHeader("Allow", allowed.join(", "));
  sendJson(res, 405, { error: { code: "method_not_allowed", message: "Méthode refusée." } });
}

/**
 * Configuration failures and upstream outages used to reach the browser as the
 * same opaque 503, which made a missing deployment variable indistinguishable
 * from a Supabase incident. They now carry distinct error codes.
 *
 * The `reason` stays server-side and is deliberately never logged: this module
 * handles raw Supabase access and refresh tokens, and the no-logging rule is
 * enforced by marketing-bff-security.test.ts. It documents, at each call site,
 * which setting is being rejected.
 */
function configurationUnavailable(_reason: string): PublicBffError {
  return new PublicBffError(503, "configuration_unavailable", "Service indisponible.");
}

function readConfig(): BffConfig {
  const supabaseUrl = (
    process.env.SUPABASE_URL
    ?? process.env.VITE_SUPABASE_URL
    ?? ""
  ).trim().replace(/\/+$/, "");
  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY
    ?? process.env.SUPABASE_ANON_KEY
    ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.VITE_SUPABASE_ANON_KEY
    ?? ""
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!supabaseUrl) throw configurationUnavailable("SUPABASE_URL is not set");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw configurationUnavailable("SUPABASE_URL is not a valid URL");
  }
  if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
    throw configurationUnavailable("SUPABASE_URL must be credential-free HTTPS");
  }
  if (!parsedUrl.hostname.endsWith(".supabase.co")) {
    throw configurationUnavailable("SUPABASE_URL host is not a supabase.co project");
  }
  if (publishableKey.length < 20) {
    throw configurationUnavailable("SUPABASE_PUBLISHABLE_KEY is missing or too short");
  }
  if (serviceRoleKey.length < 20) {
    throw configurationUnavailable("SUPABASE_SERVICE_ROLE_KEY is missing or too short");
  }
  if (constantTimeEqual(publishableKey, serviceRoleKey)) {
    throw configurationUnavailable("SUPABASE_SERVICE_ROLE_KEY duplicates the publishable key");
  }
  return { supabaseUrl, publishableKey, serviceRoleKey };
}

function isPlainObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertSafeJson(value: unknown, depth = 0, state = { nodes: 0 }): void {
  state.nodes += 1;
  if (depth > 8 || state.nodes > 2_000) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new PublicBffError(400, "invalid_request", "Requête invalide.");
    return;
  }
  if (typeof value === "string") {
    if (value.length > 32_000) throw new PublicBffError(400, "invalid_request", "Requête invalide.");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 500) throw new PublicBffError(400, "invalid_request", "Requête invalide.");
    for (const item of value) assertSafeJson(item, depth + 1, state);
    return;
  }
  if (!isPlainObject(value)) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const entries = Object.entries(value);
  if (entries.length > 250) throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  for (const [key, item] of entries) {
    if (
      key.length > 128
      || key === "__proto__"
      || key === "prototype"
      || key === "constructor"
    ) {
      throw new PublicBffError(400, "invalid_request", "Requête invalide.");
    }
    assertSafeJson(item, depth + 1, state);
  }
}

function parseJsonBody(req: MarketingApiRequest, maxBytes = MAX_REQUEST_BYTES): JsonObject {
  const contentType = header(req, "content-type").toLowerCase();
  const contentLength = Number(header(req, "content-length") || "0");
  if (!contentType.startsWith("application/json")) {
    throw new PublicBffError(415, "unsupported_media_type", "Format refusé.");
  }
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > maxBytes) {
    throw new PublicBffError(413, "request_too_large", "Requête trop volumineuse.");
  }

  let value = req.body;
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > maxBytes) {
      throw new PublicBffError(413, "request_too_large", "Requête trop volumineuse.");
    }
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      throw new PublicBffError(400, "invalid_request", "Requête invalide.");
    }
  }
  if (!isPlainObject(value)) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const serializedSize = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (serializedSize > maxBytes) {
    throw new PublicBffError(413, "request_too_large", "Requête trop volumineuse.");
  }
  assertSafeJson(value);
  return value;
}

function requireCsrf(req: MarketingApiRequest, cookies: Record<string, string>): string {
  const fromCookie = cookies[MARKETING_CSRF_COOKIE] ?? "";
  const fromHeader = header(req, MARKETING_CSRF_HEADER);
  if (
    !isOpaqueToken(fromCookie)
    || !isOpaqueToken(fromHeader)
    || !constantTimeEqual(fromCookie, fromHeader)
  ) {
    throw new PublicBffError(403, "csrf_rejected", "Requête refusée.");
  }
  return fromCookie;
}

function requestIp(req: MarketingApiRequest): string {
  const candidate = (
    header(req, "x-vercel-forwarded-for")
    || header(req, "x-forwarded-for").split(",", 1)[0]
    || req.socket?.remoteAddress
    || "unknown"
  ).trim();
  return candidate.slice(0, 128);
}

async function boundedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<{ status: number; ok: boolean; value: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: "error" });
    const advertisedLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
      throw new DownstreamHttpError(502);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new DownstreamHttpError(502);
    if (!bytes.byteLength) return { status: response.status, ok: response.ok, value: null };
    let value: unknown;
    try {
      value = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
    } catch {
      throw new DownstreamHttpError(502);
    }
    return { status: response.status, ok: response.ok, value };
  } catch (error) {
    if (error instanceof DownstreamHttpError) throw error;
    throw new DownstreamHttpError(503);
  } finally {
    clearTimeout(timeout);
  }
}

function asRecord(value: unknown): JsonObject {
  return isPlainObject(value) ? value : {};
}

function stringField(record: JsonObject, key: string, maxLength = 32_000): string {
  const value = record[key];
  return typeof value === "string" && value.length <= maxLength ? value : "";
}

async function authRequest(
  config: BffConfig,
  path: string,
  options: {
    method?: string;
    accessToken?: string;
    body?: JsonObject;
    serviceRole?: boolean;
    maxBytes?: number;
  } = {},
): Promise<unknown> {
  const apiKey = options.serviceRole ? config.serviceRoleKey : config.publishableKey;
  const authorization = options.accessToken ?? (options.serviceRole ? config.serviceRoleKey : "");
  const response = await boundedFetch(
    `${config.supabaseUrl}/auth/v1${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        apikey: apiKey,
        ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    },
    AUTH_TIMEOUT_MS,
    options.maxBytes ?? 256 * 1024,
  );
  if (!response.ok) throw new DownstreamHttpError(response.status);
  return response.value;
}

async function serviceRestRequest(
  config: BffConfig,
  path: string,
  options: { method?: string; body?: JsonObject } = {},
): Promise<unknown> {
  const response = await boundedFetch(
    `${config.supabaseUrl}/rest/v1${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    },
    DATABASE_TIMEOUT_MS,
  );
  if (!response.ok) throw new DownstreamHttpError(response.status);
  return response.value;
}

async function serviceRpc(
  config: BffConfig,
  name: string,
  args: JsonObject,
): Promise<unknown> {
  return serviceRestRequest(config, `/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    body: args,
  });
}

function normalizeRpcObject(value: unknown): JsonObject {
  if (isPlainObject(value)) return value;
  if (Array.isArray(value) && value.length === 1 && isPlainObject(value[0])) return value[0];
  return {};
}

function normalizeRpcNullableObject(value: unknown): JsonObject | null {
  if (value === null || (Array.isArray(value) && value.length === 0)) return null;
  const normalized = normalizeRpcObject(value);
  return Object.keys(normalized).length ? normalized : null;
}

async function consumeRateLimit(
  config: BffConfig,
  req: MarketingApiRequest,
  bucket: string,
  subject: string,
  includeIp = true,
): Promise<string> {
  const keyHash = rateLimitKey(req, bucket, subject, includeIp);
  const result = normalizeRpcObject(await serviceRpc(
    config,
    "service_consume_marketing_auth_attempt",
    { p_key_hash: keyHash },
  ));
  const allowed = result.allowed === true;
  const retryValue = Number(result.retry_after_seconds);
  const retryAfter = Number.isFinite(retryValue)
    ? Math.max(1, Math.min(3_600, Math.ceil(retryValue)))
    : 60;
  if (!allowed) {
    throw new PublicBffError(429, "rate_limited", "Trop de tentatives.", retryAfter);
  }
  return keyHash;
}

function rateLimitKey(
  req: MarketingApiRequest,
  bucket: string,
  subject: string,
  includeIp = true,
): string {
  const ipPart = includeIp ? requestIp(req) : "all-addresses";
  return sha256Hex(`thetok-marketing-bff:v1:${bucket}:${ipPart}:${subject}`);
}

async function clearRateLimit(config: BffConfig, keyHash: string): Promise<void> {
  await serviceRpc(config, "service_clear_marketing_auth_attempt", { p_key_hash: keyHash });
}

function validateUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new DownstreamHttpError(502);
  return value;
}

function validateStoredToken(value: string): string {
  if (!value || value.length > 16_384 || /[\r\n]/.test(value)) throw new DownstreamHttpError(502);
  return value;
}

function normalizeAuthTokens(value: unknown): AuthTokens {
  const record = asRecord(value);
  const user = asRecord(record.user);
  const accessToken = validateStoredToken(stringField(record, "access_token", 16_384));
  const refreshToken = validateStoredToken(stringField(record, "refresh_token", 16_384));
  const userId = validateUuid(stringField(user, "id", 64));
  const email = stringField(user, "email", 254).trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new DownstreamHttpError(502);
  return { accessToken, refreshToken, userId, email };
}

function normalizeFactors(userValue: unknown): MfaFactor[] {
  const user = asRecord(userValue);
  if (!Array.isArray(user.factors)) return [];
  const factors: MfaFactor[] = [];
  for (const candidate of user.factors.slice(0, 20)) {
    const factor = asRecord(candidate);
    const id = stringField(factor, "id", 64);
    const factorType = (
      stringField(factor, "factor_type", 32)
      || stringField(factor, "type", 32)
    ).toLowerCase();
    const status = stringField(factor, "status", 32).toLowerCase();
    if (!UUID_PATTERN.test(id) || !factorType || !status) continue;
    factors.push({
      id,
      factorType,
      status,
      createdAt: stringField(factor, "created_at", 64),
    });
  }
  return factors.sort((left, right) => (
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
  ));
}

async function getAuthUser(config: BffConfig, accessToken: string): Promise<JsonObject> {
  const value = await authRequest(config, "/user", { accessToken });
  const user = asRecord(value);
  validateUuid(stringField(user, "id", 64));
  return user;
}

async function signInWithPassword(
  config: BffConfig,
  email: string,
  password: string,
): Promise<AuthTokens> {
  const value = await authRequest(config, "/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  return normalizeAuthTokens(value);
}

async function signOutLocal(config: BffConfig, accessToken: string): Promise<void> {
  await authRequest(config, "/logout?scope=local", {
    method: "POST",
    accessToken,
  });
}

async function signOutLocalBestEffort(config: BffConfig, accessToken: string): Promise<void> {
  try {
    await signOutLocal(config, accessToken);
  } catch {
    // Deliberately silent: cleanup must never disclose upstream details.
  }
}

async function ensureServiceAdmin(
  config: BffConfig,
  userId: string,
): Promise<{ userId: string; email: string }> {
  const userValue = await authRequest(
    config,
    `/admin/users/${encodeURIComponent(validateUuid(userId))}`,
    { serviceRole: true },
  );
  const root = asRecord(userValue);
  const user = isPlainObject(root.user) ? root.user : root;
  const verifiedUserId = validateUuid(stringField(user, "id", 64));
  if (verifiedUserId !== userId) throw new DownstreamHttpError(403);
  const email = stringField(user, "email", 254).trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new DownstreamHttpError(403);

  const roles = await serviceRestRequest(
    config,
    `/user_roles?select=user_id&user_id=eq.${encodeURIComponent(userId)}&role=eq.admin&limit=1`,
  );
  if (!Array.isArray(roles) || roles.length !== 1) throw new DownstreamHttpError(403);
  const role = asRecord(roles[0]);
  if (stringField(role, "user_id", 64) !== userId) throw new DownstreamHttpError(403);
  return { userId, email };
}

interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
  otpauthUri: string;
}

async function enrollTotp(
  config: BffConfig,
  accessToken: string,
): Promise<TotpEnrollment> {
  const value = await authRequest(config, "/factors", {
    method: "POST",
    accessToken,
    body: { factor_type: "totp", friendly_name: "TheTOK Marketing" },
    maxBytes: MAX_ENROLL_RESPONSE_BYTES,
  });
  const record = asRecord(value);
  const factorId = validateUuid(stringField(record, "id", 64));
  const totp = asRecord(record.totp);
  const secret = stringField(totp, "secret", 256);
  const rawUri = stringField(totp, "uri", 4_096);
  const otpauthUri = /^otpauth:\/\/totp\//i.test(rawUri) ? rawUri : "";
  const qrCode = normalizeQrCode(stringField(totp, "qr_code", MAX_QR_SVG_CHARS));
  // Only an enrollment the administrator cannot complete by any route is fatal.
  // Either a scannable image or the secret paired with its URI is enough to
  // provision an authenticator.
  if (!qrCode && !(secret && otpauthUri)) throw new DownstreamHttpError(502);
  return { factorId, qrCode, secret, otpauthUri };
}

/** Shapes the enrollment for the browser, omitting whatever Supabase withheld. */
function enrollmentPayload(enrollment: TotpEnrollment): JsonObject {
  return {
    status: "mfa_enrollment_required",
    ...(enrollment.qrCode ? { qrCode: enrollment.qrCode } : {}),
    ...(enrollment.secret ? { secret: enrollment.secret } : {}),
    ...(enrollment.otpauthUri ? { otpauthUri: enrollment.otpauthUri } : {}),
  };
}

/**
 * Returns an empty string rather than throwing when the image is unusable. The
 * QR code is a convenience for scanning; the enrollment secret travels in
 * `totp.secret` and `totp.uri`, so a missing or oversized image must never
 * abort an authentication that has already succeeded.
 */
function normalizeQrCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed.length > MAX_QR_SVG_CHARS ? "" : trimmed;
  }

  let svg = trimmed;
  if (/^data:image\/svg\+xml(?:;[^,]*)?,/i.test(trimmed)) {
    const separator = trimmed.indexOf(",");
    const payload = trimmed.slice(separator + 1);
    try {
      svg = decodeURIComponent(payload);
    } catch {
      // Supabase can return an SVG data URL containing literal percent
      // characters. The payload is already valid SVG and must not abort
      // the MFA enrollment before the challenge is created.
      svg = payload;
    }
  }
  if (!svg.slice(0, 512).includes("<svg") || svg.length > MAX_QR_SVG_CHARS) return "";
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

async function unenrollFactor(
  config: BffConfig,
  accessToken: string,
  factorId: string,
): Promise<void> {
  await authRequest(config, `/factors/${encodeURIComponent(validateUuid(factorId))}`, {
    method: "DELETE",
    accessToken,
  });
}

async function createMfaChallenge(
  config: BffConfig,
  accessToken: string,
  factorId: string,
): Promise<string> {
  const value = await authRequest(
    config,
    `/factors/${encodeURIComponent(validateUuid(factorId))}/challenge`,
    { method: "POST", accessToken, body: {} },
  );
  return validateUuid(stringField(asRecord(value), "id", 64));
}

async function verifyMfaChallenge(
  config: BffConfig,
  accessToken: string,
  factorId: string,
  challengeId: string,
  code: string,
): Promise<AuthTokens> {
  const value = await authRequest(
    config,
    `/factors/${encodeURIComponent(validateUuid(factorId))}/verify`,
    {
      method: "POST",
      accessToken,
      body: { challenge_id: validateUuid(challengeId), code },
    },
  );
  return normalizeAuthTokens(value);
}

function decodeJwtClaims(accessToken: string): JsonObject {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part || part.length > 16_384)) {
    throw new DownstreamHttpError(502);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
  } catch {
    throw new DownstreamHttpError(502);
  }
  if (!isPlainObject(value)) throw new DownstreamHttpError(502);
  return value;
}

function assertFreshAal2(
  config: BffConfig,
  accessToken: string,
  expectedUserId: string,
): void {
  const claims = decodeJwtClaims(accessToken);
  const now = Math.floor(Date.now() / 1_000);
  const issuedAt = Number(claims.iat);
  const expiresAt = Number(claims.exp);
  const issuer = typeof claims.iss === "string" ? claims.iss.replace(/\/+$/, "") : "";
  if (
    claims.aal !== "aal2"
    || claims.sub !== expectedUserId
    || issuer !== `${config.supabaseUrl}/auth/v1`
    || !Number.isFinite(issuedAt)
    || !Number.isFinite(expiresAt)
    || issuedAt < now - 5 * 60
    || issuedAt > now + 60
    || expiresAt <= now
  ) {
    throw new DownstreamHttpError(403);
  }
  if (Array.isArray(claims.amr)) {
    const hasTotp = claims.amr.some((entry) => stringField(asRecord(entry), "method", 32) === "totp");
    if (!hasTotp) throw new DownstreamHttpError(403);
  }
}

async function storePendingChallenge(
  config: BffConfig,
  pendingHash: string,
  tokens: AuthTokens | PendingAuthChallenge,
  factorId: string,
  challengeId: string,
): Promise<void> {
  const result = normalizeRpcObject(await serviceRpc(
    config,
    "service_store_marketing_auth_challenge",
    {
      p_pending_sid_hash: pendingHash,
      p_user_id: tokens.userId,
      p_access_token: tokens.accessToken,
      p_refresh_token: tokens.refreshToken,
      p_factor_id: validateUuid(factorId),
      p_challenge_id: validateUuid(challengeId),
    },
  ));
  if (result.stored === false) throw new DownstreamHttpError(503);
}

async function getPendingChallenge(
  config: BffConfig,
  rawPending: string,
): Promise<PendingAuthChallenge | null> {
  if (!isOpaqueToken(rawPending)) return null;
  const result = normalizeRpcNullableObject(await serviceRpc(
    config,
    "service_get_marketing_auth_challenge",
    { p_pending_sid_hash: sha256Hex(rawPending) },
  ));
  if (!result) return null;
  const expiresAt = stringField(result, "expires_at", 64);
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + MAX_PENDING_SECONDS * 1_000 + 60_000) {
    return null;
  }
  return {
    userId: validateUuid(stringField(result, "user_id", 64)),
    accessToken: validateStoredToken(stringField(result, "access_token", 16_384)),
    refreshToken: validateStoredToken(stringField(result, "refresh_token", 16_384)),
    factorId: validateUuid(stringField(result, "factor_id", 64)),
    challengeId: validateUuid(stringField(result, "challenge_id", 64)),
    expiresAt,
  };
}

function normalizeSession(value: unknown, sessionHash: string, csrfHash: string): ActiveMarketingSession | null {
  const result = normalizeRpcNullableObject(value);
  if (!result) return null;
  const userId = stringField(result, "user_id", 64);
  const email = stringField(result, "email", 254).trim().toLowerCase();
  const expiresAt = stringField(result, "expires_at", 64);
  const expires = Date.parse(expiresAt);
  if (
    !UUID_PATTERN.test(userId)
    || !EMAIL_PATTERN.test(email)
    || !Number.isFinite(expires)
    || expires <= Date.now()
    || expires > Date.now() + MAX_SESSION_SECONDS * 1_000 + 60_000
  ) {
    return null;
  }
  return { userId, email, expiresAt, sessionHash, csrfHash };
}

async function activeSession(
  config: BffConfig,
  req: MarketingApiRequest,
  requireHeader: boolean,
): Promise<ActiveMarketingSession> {
  const cookies = parseCookies(header(req, "cookie"));
  const rawSession = cookies[MARKETING_SESSION_COOKIE] ?? "";
  const rawCsrf = requireHeader
    ? requireCsrf(req, cookies)
    : (cookies[MARKETING_CSRF_COOKIE] ?? "");
  if (!isOpaqueToken(rawSession) || !isOpaqueToken(rawCsrf)) {
    throw new PublicBffError(401, "authentication_required", "Authentification requise.");
  }
  const sessionHash = sha256Hex(rawSession);
  const csrfHash = sha256Hex(rawCsrf);
  const result = await serviceRpc(config, "service_get_marketing_web_session", {
    p_sid_hash: sessionHash,
    p_csrf_hash: csrfHash,
    p_touch: true,
  });
  const session = normalizeSession(result, sessionHash, csrfHash);
  if (!session) throw new PublicBffError(401, "authentication_required", "Authentification requise.");
  return session;
}

async function revokeSession(config: BffConfig, rawSession: string): Promise<void> {
  if (!isOpaqueToken(rawSession)) return;
  await serviceRpc(config, "service_revoke_marketing_web_session", {
    p_sid_hash: sha256Hex(rawSession),
  });
}

async function revokeSessionBestEffort(config: BffConfig, rawSession: string): Promise<void> {
  try {
    await revokeSession(config, rawSession);
  } catch {
    // Deliberately silent: the browser handles are still cleared by the caller.
  }
}

async function login(req: MarketingApiRequest, res: MarketingApiResponse): Promise<void> {
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  validateMarketingRequestContext(req, true);
  const config = readConfig();
  const cookies = parseCookies(header(req, "cookie"));
  requireCsrf(req, cookies);
  const body = parseJsonBody(req, 16 * 1024);
  const email = stringField(body, "email", 254).trim().toLowerCase();
  const password = stringField(body, "password", 1_024);
  if (
    !EMAIL_PATTERN.test(email)
    || password.length < 8
    || password.length > 1_024
    || Object.keys(body).some((key) => !["email", "password"].includes(key))
  ) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }

  const ipRateKey = await consumeRateLimit(config, req, "password-ip", "all-accounts");
  // Scoped to the calling address on purpose. Keyed on the account alone, this
  // bucket let any unauthenticated third party who knew an administrator's
  // address hold that account locked out from anywhere, indefinitely, with six
  // requests every fifteen minutes. Per-address brute-force resistance is
  // unchanged: "password-ip" already caps every address at five attempts.
  const accountRateKey = await consumeRateLimit(config, req, "password-account", sha256Hex(email));
  let tokens: AuthTokens | undefined;
  let authUser: JsonObject;
  try {
    tokens = await signInWithPassword(config, email, password);
    await ensureServiceAdmin(config, tokens.userId);
    authUser = await getAuthUser(config, tokens.accessToken);
    if (stringField(authUser, "id", 64) !== tokens.userId) throw new DownstreamHttpError(403);
  } catch {
    if (tokens) await signOutLocalBestEffort(config, tokens.accessToken);
    throw new PublicBffError(401, "authentication_failed", "Authentification impossible.");
  }
  if (!tokens) throw new PublicBffError(401, "authentication_failed", "Authentification impossible.");

  // The password step succeeded, so release its quota now instead of waiting
  // for the TOTP step. An administrator who mistypes or abandons the MFA
  // challenge must not be locked out of a credential they entered correctly;
  // the "mfa-verify" buckets remain the guard for the second factor.
  await clearRateLimit(config, ipRateKey).catch(() => undefined);
  await clearRateLimit(config, accountRateKey).catch(() => undefined);

  const factors = normalizeFactors(authUser);
  const verifiedFactor = factors.find((factor) => (
    factor.factorType === "totp" && factor.status === "verified"
  ));
  let enrolledFactorId = "";
  // Keyed on whether a factor was just enrolled, never on whether the QR image
  // survived. An enrollment answered with "mfa_required" would ask for a code
  // from an authenticator the administrator was never given the means to set up.
  let enrolled: JsonObject | null = null;
  let factorId = verifiedFactor?.id ?? "";
  let challengeId = "";
  try {
    if (!factorId) {
      // AAL1 must never be allowed to add a new TOTP factor when the account
      // already has another verified MFA factor. Such accounts must manage
      // their factors from a previously established AAL2 session.
      if (factors.some((factor) => factor.status === "verified")) {
        throw new PublicBffError(401, "authentication_failed", "Authentification impossible.");
      }
      for (const staleFactor of factors.filter((factor) => (
        factor.factorType === "totp" && factor.status !== "verified"
      ))) {
        await unenrollFactor(config, tokens.accessToken, staleFactor.id);
      }
      const enrollment = await enrollTotp(config, tokens.accessToken);
      factorId = enrollment.factorId;
      enrolledFactorId = enrollment.factorId;
      enrolled = enrollmentPayload(enrollment);
    }
    challengeId = await createMfaChallenge(config, tokens.accessToken, factorId);
    const rawPending = opaqueToken();
    await storePendingChallenge(
      config,
      sha256Hex(rawPending),
      tokens,
      factorId,
      challengeId,
    );
    const oldSession = cookies[MARKETING_SESSION_COOKIE] ?? "";
    if (isOpaqueToken(oldSession)) await revokeSession(config, oldSession);
    sendJson(
      res,
      200,
      enrolled ?? { status: "mfa_required" },
      [
        pendingCookie(rawPending),
        clearCookie(MARKETING_SESSION_COOKIE, true),
      ],
    );
  } catch (error) {
    if (enrolledFactorId) {
      try {
        await unenrollFactor(config, tokens.accessToken, enrolledFactorId);
      } catch {
        // Best-effort cleanup of an incomplete enrollment.
      }
    }
    await signOutLocalBestEffort(config, tokens.accessToken);
    if (error instanceof PublicBffError) throw error;
    throw new PublicBffError(
      503,
      "mfa_setup_unavailable",
      "Configuration 2FA temporairement indisponible.",
    );
  }
}

async function enrollMfa(req: MarketingApiRequest, res: MarketingApiResponse): Promise<void> {
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  validateMarketingRequestContext(req, true);
  const config = readConfig();
  const cookies = parseCookies(header(req, "cookie"));
  requireCsrf(req, cookies);
  const body = parseJsonBody(req, 4 * 1024);
  if (Object.keys(body).length !== 0) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const rawPending = cookies[MARKETING_PENDING_COOKIE] ?? "";
  const pending = await getPendingChallenge(config, rawPending);
  const rateKey = await consumeRateLimit(
    config,
    req,
    "mfa-enroll",
    pending?.userId ?? "invalid-pending",
  );
  if (!pending) {
    sendJson(
      res,
      401,
      { error: { code: "authentication_required", message: "Authentification requise." } },
      [clearCookie(MARKETING_PENDING_COOKIE, true)],
    );
    return;
  }

  let replacementFactorId = "";
  try {
    await ensureServiceAdmin(config, pending.userId);
    const authUser = await getAuthUser(config, pending.accessToken);
    if (stringField(authUser, "id", 64) !== pending.userId) throw new DownstreamHttpError(403);
    const factors = normalizeFactors(authUser);
    const verifiedFactors = factors.filter((factor) => factor.status === "verified");
    if (verifiedFactors.some((factor) => factor.factorType === "totp")) {
      throw new PublicBffError(409, "enrollment_not_required", "Enrôlement non requis.");
    }
    if (verifiedFactors.length > 0) {
      await signOutLocalBestEffort(config, pending.accessToken);
      sendJson(
        res,
        403,
        { error: { code: "enrollment_forbidden", message: "Enrôlement refusé." } },
        [clearCookie(MARKETING_PENDING_COOKIE, true)],
      );
      return;
    }
    const previous = factors.find((factor) => factor.id === pending.factorId);
    if (previous && previous.status !== "verified") {
      await unenrollFactor(config, pending.accessToken, previous.id);
    }
    const enrollment = await enrollTotp(config, pending.accessToken);
    replacementFactorId = enrollment.factorId;
    const challengeId = await createMfaChallenge(config, pending.accessToken, enrollment.factorId);
    await storePendingChallenge(
      config,
      sha256Hex(rawPending),
      pending,
      enrollment.factorId,
      challengeId,
    );
    await clearRateLimit(config, rateKey).catch(() => undefined);
    sendJson(
      res,
      200,
      enrollmentPayload(enrollment),
      [pendingCookie(rawPending)],
    );
  } catch (error) {
    if (replacementFactorId) {
      try {
        await unenrollFactor(config, pending.accessToken, replacementFactorId);
      } catch {
        // Best-effort cleanup of an incomplete replacement enrollment.
      }
    }
    if (error instanceof PublicBffError) throw error;
    if (error instanceof DownstreamHttpError && error.status >= 400 && error.status < 500) {
      throw new PublicBffError(401, "authentication_failed", "Authentification impossible.");
    }
    throw error;
  }
}

async function refreshChallengeBestEffort(
  config: BffConfig,
  rawPending: string,
  pending: PendingAuthChallenge,
): Promise<void> {
  try {
    const challengeId = await createMfaChallenge(config, pending.accessToken, pending.factorId);
    await storePendingChallenge(
      config,
      sha256Hex(rawPending),
      pending,
      pending.factorId,
      challengeId,
    );
  } catch {
    // The next login will safely create a new pending challenge.
  }
}

async function verifyMfa(req: MarketingApiRequest, res: MarketingApiResponse): Promise<void> {
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  validateMarketingRequestContext(req, true);
  const config = readConfig();
  const cookies = parseCookies(header(req, "cookie"));
  requireCsrf(req, cookies);
  const body = parseJsonBody(req, 4 * 1024);
  const code = stringField(body, "code", 12).trim();
  if (!/^\d{6}$/.test(code) || Object.keys(body).some((key) => key !== "code")) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const rawPending = cookies[MARKETING_PENDING_COOKIE] ?? "";
  const pending = await getPendingChallenge(config, rawPending);
  const userIpRateKey = await consumeRateLimit(
    config,
    req,
    "mfa-verify",
    pending?.userId ?? "invalid-pending",
  );
  const userGlobalRateKey = await consumeRateLimit(
    config,
    req,
    "mfa-verify",
    pending?.userId ?? "invalid-pending",
    false,
  );
  if (!pending) {
    sendJson(
      res,
      401,
      { error: { code: "authentication_required", message: "Authentification requise." } },
      [clearCookie(MARKETING_PENDING_COOKIE, true)],
    );
    return;
  }

  let verified: AuthTokens;
  try {
    verified = await verifyMfaChallenge(
      config,
      pending.accessToken,
      pending.factorId,
      pending.challengeId,
      code,
    );
  } catch (error) {
    if (error instanceof DownstreamHttpError && error.status >= 400 && error.status < 500) {
      await refreshChallengeBestEffort(config, rawPending, pending);
      throw new PublicBffError(401, "mfa_failed", "Vérification impossible.");
    }
    throw error;
  }

  let rawSession = "";
  try {
    if (verified.userId !== pending.userId) {
      throw new PublicBffError(401, "mfa_failed", "Vérification impossible.");
    }
    assertFreshAal2(config, verified.accessToken, pending.userId);
    const verifiedUser = await getAuthUser(config, verified.accessToken);
    if (stringField(verifiedUser, "id", 64) !== pending.userId) {
      throw new PublicBffError(401, "mfa_failed", "Vérification impossible.");
    }
    const admin = await ensureServiceAdmin(config, pending.userId);

    rawSession = opaqueToken();
    const rawCsrf = opaqueToken();
    const sessionHash = sha256Hex(rawSession);
    const csrfHash = sha256Hex(rawCsrf);
    const finalized = await serviceRpc(config, "service_finalize_marketing_web_session", {
      p_pending_sid_hash: sha256Hex(rawPending),
      p_sid_hash: sessionHash,
      p_csrf_hash: csrfHash,
      p_expires_at: new Date(Date.now() + MAX_SESSION_SECONDS * 1_000).toISOString(),
    });
    const session = normalizeSession(finalized, sessionHash, csrfHash);
    if (!session || session.userId !== pending.userId || session.email !== admin.email) {
      throw new DownstreamHttpError(503);
    }

    try {
      await signOutLocal(config, verified.accessToken);
    } catch {
      throw new PublicBffError(503, "service_unavailable", "Service indisponible.");
    }
    // The password buckets were already released by the login step, so only
    // the two MFA buckets remain to be cleared here.
    await clearRateLimit(config, userIpRateKey).catch(() => undefined);
    await clearRateLimit(config, userGlobalRateKey).catch(() => undefined);
    const remainingSeconds = Math.max(
      1,
      Math.min(MAX_SESSION_SECONDS, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1_000)),
    );
    sendJson(
      res,
      200,
      {
        status: "authenticated",
        session: {
          authenticated: true,
          admin: true,
          aal: "aal2",
          email: session.email,
          expiresAt: session.expiresAt,
        },
      },
      [
        sessionCookie(rawSession, remainingSeconds),
        csrfCookie(rawCsrf, remainingSeconds),
        clearCookie(MARKETING_PENDING_COOKIE, true),
      ],
    );
  } catch (error) {
    if (rawSession) await revokeSessionBestEffort(config, rawSession);
    await signOutLocalBestEffort(config, verified.accessToken);
    throw error;
  }
}

async function getSession(req: MarketingApiRequest, res: MarketingApiResponse): Promise<void> {
  validateMarketingRequestContext(req, false);
  const cookies = parseCookies(header(req, "cookie"));
  const rawSession = cookies[MARKETING_SESSION_COOKIE] ?? "";
  const rawCsrf = cookies[MARKETING_CSRF_COOKIE] ?? "";
  if (!isOpaqueToken(rawSession) || !isOpaqueToken(rawCsrf)) {
    if (isOpaqueToken(rawSession)) {
      try {
        await revokeSessionBestEffort(readConfig(), rawSession);
      } catch {
        // Clearing both browser proofs still fails closed if configuration is unavailable.
      }
    }
    const nextCsrf = opaqueToken();
    const cookieHeaders = [csrfCookie(nextCsrf)];
    if (rawSession) cookieHeaders.push(clearCookie(MARKETING_SESSION_COOKIE, true));
    sendJson(res, 401, { authenticated: false }, cookieHeaders);
    return;
  }

  const config = readConfig();
  let session: ActiveMarketingSession;
  try {
    session = await activeSession(config, req, false);
    const admin = await ensureServiceAdmin(config, session.userId);
    if (admin.email !== session.email) throw new DownstreamHttpError(403);
  } catch (error) {
    if (error instanceof PublicBffError && error.status !== 401) throw error;
    if (error instanceof DownstreamHttpError && error.status >= 500) throw error;
    await revokeSessionBestEffort(config, rawSession);
    sendJson(
      res,
      401,
      { authenticated: false },
      [clearCookie(MARKETING_SESSION_COOKIE, true), csrfCookie(opaqueToken())],
    );
    return;
  }
  sendJson(res, 200, {
    authenticated: true,
    admin: true,
    aal: "aal2",
    email: session.email,
    expiresAt: session.expiresAt,
  });
}

async function logout(req: MarketingApiRequest, res: MarketingApiResponse): Promise<void> {
  validateMarketingRequestContext(req, true);
  const config = readConfig();
  const cookies = parseCookies(header(req, "cookie"));
  requireCsrf(req, cookies);
  const body = parseJsonBody(req, 4 * 1024);
  if (Object.keys(body).length !== 0) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const rawSession = cookies[MARKETING_SESSION_COOKIE] ?? "";
  if (isOpaqueToken(rawSession)) await revokeSession(config, rawSession);
  sendJson(res, 200, { authenticated: false }, clearAuthCookies());
}

async function executeMarketingRpc(req: MarketingApiRequest, res: MarketingApiResponse): Promise<void> {
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  validateMarketingRequestContext(req, true);
  const config = readConfig();
  const body = parseJsonBody(req);
  const operation = stringField(body, "operation", 96);
  if (!MARKETING_OPERATION_ALLOWLIST.has(operation)) {
    throw new PublicBffError(400, "operation_rejected", "Opération refusée.");
  }
  const args = body.args === undefined ? {} : body.args;
  if (!isPlainObject(args) || Object.keys(body).some((key) => !["operation", "args"].includes(key))) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const session = await activeSession(config, req, true);
  await ensureServiceAdmin(config, session.userId);
  try {
    const result = await serviceRpc(config, "service_execute_marketing_admin_operation", {
      p_sid_hash: session.sessionHash,
      p_csrf_hash: session.csrfHash,
      p_operation: operation,
      p_args: args,
    });
    sendJson(res, 200, result);
  } catch (error) {
    if (error instanceof DownstreamHttpError && error.status >= 400 && error.status < 500) {
      throw new PublicBffError(400, "operation_rejected", "Opération refusée.");
    }
    throw error;
  }
}

async function runMarketingOrchestrator(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  validateMarketingRequestContext(req, true);
  const config = readConfig();
  const body = parseJsonBody(req, 16 * 1024);
  const action = stringField(body, "action", 32);
  if (action !== "run_due" && action !== "run_item") {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const allowedKeys = action === "run_item" ? ["action", "itemId", "limit"] : ["action", "limit"];
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const rawLimit = body.limit === undefined ? 25 : body.limit;
  if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const itemId = action === "run_item" ? stringField(body, "itemId", 64) : "";
  if (action === "run_item" && !UUID_PATTERN.test(itemId)) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const session = await activeSession(config, req, true);
  await ensureServiceAdmin(config, session.userId);
  const payload: JsonObject = { action, limit: rawLimit };
  if (itemId) payload.itemId = itemId;
  const response = await boundedFetch(
    `${config.supabaseUrl}/functions/v1/marketing-orchestrator`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        // The Edge function accepts this identity only on an already
        // authenticated service-role request and revalidates the admin role.
        // This preserves the human actor in the immutable audit trail while
        // keeping the Supabase service credential entirely server-side.
        "x-marketing-actor-user-id": session.userId,
      },
      body: JSON.stringify(payload),
    },
    ORCHESTRATOR_TIMEOUT_MS,
  );
  if (!response.ok) {
    if (response.status === 409) {
      throw new PublicBffError(409, "operation_unavailable", "Opération indisponible.");
    }
    if (response.status >= 400 && response.status < 500) {
      throw new PublicBffError(400, "operation_rejected", "Opération refusée.");
    }
    throw new DownstreamHttpError(response.status);
  }
  sendJson(res, 200, response.value);
}

/**
 * One action for what was three: approve the campaign, approve each of its
 * items, then ask the orchestrator to start.
 *
 * Every step goes through an operation that was already allowlisted, carrying
 * the same live session and CSRF proof, so nothing here weakens the approval
 * rule — it batches a human decision instead of replacing it. The operator is
 * still the one approving; they simply stop clicking once per item.
 *
 * Dispatch is best-effort on purpose: the approvals are what matter and they
 * are durable. If the orchestrator call fails, the campaign is approved and the
 * next scheduled run picks it up, which is a far better failure than approvals
 * that half-applied.
 */
async function launchMarketingCampaign(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  validateMarketingRequestContext(req, true);
  const config = readConfig();
  const body = parseJsonBody(req, 64 * 1024);
  if (Object.keys(body).some((key) => !["campaignId", "itemIds"].includes(key))) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const campaignId = stringField(body, "campaignId", 64);
  if (!UUID_PATTERN.test(campaignId)) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const rawItems = body.itemIds;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 64) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const itemIds = [...new Set(rawItems.map((entry) => (typeof entry === "string" ? entry.trim() : "")))];
  if (itemIds.some((id) => !UUID_PATTERN.test(id))) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }

  const session = await activeSession(config, req, true);
  await ensureServiceAdmin(config, session.userId);

  const runOperation = (operation: string, args: JsonObject) =>
    serviceRpc(config, "service_execute_marketing_admin_operation", {
      p_sid_hash: session.sessionHash,
      p_csrf_hash: session.csrfHash,
      p_operation: operation,
      p_args: args,
    });

  try {
    await runOperation("admin_approve_marketing_campaign", {
      p_campaign_id: campaignId,
      p_reason: "Lancement depuis le centre marketing",
    });
  } catch (error) {
    if (error instanceof DownstreamHttpError && error.status >= 400 && error.status < 500) {
      throw new PublicBffError(400, "operation_rejected", "Opération refusée.");
    }
    throw error;
  }

  const approved: string[] = [];
  const rejected: string[] = [];
  for (const itemId of itemIds) {
    try {
      await runOperation("admin_approve_marketing_item", { p_item_id: itemId });
      approved.push(itemId);
    } catch {
      // An item the database refuses — already sent, cancelled, or edited since
      // — must not abort the ones that are still valid.
      rejected.push(itemId);
    }
  }

  let dispatched = false;
  if (approved.length > 0) {
    const response = await boundedFetch(
      `${config.supabaseUrl}/functions/v1/marketing-orchestrator`,
      {
        method: "POST",
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-marketing-actor-user-id": session.userId,
        },
        body: JSON.stringify({ action: "run_due", limit: 100 }),
      },
      ORCHESTRATOR_TIMEOUT_MS,
    ).catch(() => null);
    dispatched = Boolean(response?.ok);
  }

  sendJson(res, 200, {
    ok: true,
    campaignId,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    dispatched,
  });
}

const MARKETING_CHANNEL_VALUES = new Set([
  "tok_news",
  "in_app",
  "email",
  "push",
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
  "telegram",
  "google_business",
  "website",
  "manual_call",
  "manual_email",
  "manual_visit",
]);

function agentChannels(body: JsonObject): string[] {
  const raw = body.channels;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const channels = [...new Set(raw.map((entry) => (typeof entry === "string" ? entry.trim() : "")))];
  if (channels.some((channel) => !MARKETING_CHANNEL_VALUES.has(channel))) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  return channels;
}

function agentTimestamp(body: JsonObject, key: string): string {
  const value = body[key];
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  return new Date(parsed).toISOString();
}

async function callMarketingAgent(
  config: BffConfig,
  actorUserId: string,
  payload: JsonObject,
): Promise<JsonObject> {
  const response = await boundedFetch(
    `${config.supabaseUrl}/functions/v1/ai-marketing-agent`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-marketing-actor-user-id": actorUserId,
      },
      body: JSON.stringify(payload),
    },
    AGENT_TIMEOUT_MS,
  );
  if (!response.ok) {
    if (response.status === 429) {
      throw new PublicBffError(429, "ai_rate_limited", "Trop de demandes, réessayez dans un instant.");
    }
    if (response.status >= 400 && response.status < 500) {
      throw new PublicBffError(400, "operation_rejected", "Opération refusée.");
    }
    throw new DownstreamHttpError(response.status);
  }
  return normalizeRpcObject(response.value);
}

/**
 * The AI agent proposes; it never writes.
 *
 * The plan comes back from the Edge function as a campaign bundle and is
 * persisted here through admin_create_marketing_campaign_bundle — the same
 * allowlisted operation an administrator uses by hand, carrying the same live
 * session and CSRF proof. That is what keeps every existing guarantee intact:
 * new calendar items are forced to draft, audience filters are validated, an
 * unconnected channel degrades to blocked_configuration, and nothing reaches a
 * real contact until a human approves it.
 */
async function runMarketingAgent(req: MarketingApiRequest, res: MarketingApiResponse): Promise<void> {
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  validateMarketingRequestContext(req, true);
  const config = readConfig();
  const body = parseJsonBody(req, 16 * 1024);
  const action = stringField(body, "action", 32);
  if (action !== "generate" && action !== "list_runs") {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }

  const session = await activeSession(config, req, true);
  await ensureServiceAdmin(config, session.userId);

  if (action === "list_runs") {
    if (Object.keys(body).some((key) => key !== "action")) {
      throw new PublicBffError(400, "invalid_request", "Requête invalide.");
    }
    sendJson(res, 200, await callMarketingAgent(config, session.userId, { action }));
    return;
  }

  const allowedKeys = ["action", "objective", "audienceHint", "channels", "startsAt", "endsAt", "itemCount"];
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const objective = stringField(body, "objective", 2000);
  if (!objective) throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  const audienceHint = body.audienceHint === undefined ? "" : stringField(body, "audienceHint", 500);
  const channels = agentChannels(body);
  const startsAt = agentTimestamp(body, "startsAt");
  const endsAt = agentTimestamp(body, "endsAt");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }
  const itemCount = body.itemCount === undefined ? 4 : body.itemCount;
  if (typeof itemCount !== "number" || !Number.isInteger(itemCount) || itemCount < 1 || itemCount > 12) {
    throw new PublicBffError(400, "invalid_request", "Requête invalide.");
  }

  const generated = await callMarketingAgent(config, session.userId, {
    action: "generate",
    objective,
    audienceHint,
    channels,
    startsAt,
    endsAt,
    itemCount,
  });

  const runId = typeof generated.runId === "string" ? generated.runId : null;
  const bundle = generated.bundle;
  if (!isPlainObject(bundle)) {
    throw new PublicBffError(502, "ai_invalid_plan", "Le plan produit est inexploitable.");
  }

  try {
    const persisted = normalizeRpcObject(
      await serviceRpc(config, "service_execute_marketing_admin_operation", {
        p_sid_hash: session.sessionHash,
        p_csrf_hash: session.csrfHash,
        p_operation: "admin_create_marketing_campaign_bundle",
        p_args: { p_payload: bundle, p_client_request_id: randomUUID() },
      }),
    );
    const campaign = isPlainObject(persisted.campaign) ? persisted.campaign : {};
    const campaignId = typeof campaign.id === "string" ? campaign.id : null;

    if (runId) {
      await serviceRpc(config, "service_complete_marketing_ai_run", {
        p_run_id: runId,
        p_status: "succeeded",
        p_plan: bundle,
        p_campaign_id: campaignId,
        p_item_count: Number(generated.itemCount) || 0,
        p_asset_count: Number(generated.assetCount) || 0,
        p_model: typeof generated.model === "string" ? generated.model : "",
        p_input_tokens: Number(generated.inputTokens) || 0,
        p_output_tokens: Number(generated.outputTokens) || 0,
        p_estimated_cost_chf: Number(generated.estimatedCostChf) || 0,
        p_error: null,
      });
    }

    sendJson(res, 200, {
      ok: true,
      runId,
      campaign: persisted.campaign ?? null,
      items: persisted.items ?? [],
      summary: generated.summary ?? "",
      assetCount: Number(generated.assetCount) || 0,
      estimatedCostChf: Number(generated.estimatedCostChf) || 0,
    });
  } catch (error) {
    if (runId) {
      // Best effort: a run left marked 'running' is visible as such and must
      // never mask the persistence failure being rethrown.
      try {
        await serviceRpc(config, "service_complete_marketing_ai_run", {
          p_run_id: runId,
          p_status: "failed",
          p_plan: bundle,
          p_campaign_id: null,
          p_item_count: 0,
          p_asset_count: 0,
          p_model: typeof generated.model === "string" ? generated.model : "",
          p_input_tokens: 0,
          p_output_tokens: 0,
          p_estimated_cost_chf: 0,
          p_error: "Campaign bundle persistence failed",
        });
      } catch {
        // Ignored on purpose.
      }
    }
    if (error instanceof DownstreamHttpError && error.status >= 400 && error.status < 500) {
      throw new PublicBffError(400, "operation_rejected", "Opération refusée.");
    }
    throw error;
  }
}

async function runSafely(
  res: MarketingApiResponse,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    sendError(res, error);
  }
}

export async function marketingLoginHandler(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  await runSafely(res, () => login(req, res));
}

export async function marketingMfaEnrollHandler(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  await runSafely(res, () => enrollMfa(req, res));
}

export async function marketingMfaVerifyHandler(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  await runSafely(res, () => verifyMfa(req, res));
}

export async function marketingLogoutHandler(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  await runSafely(res, () => logout(req, res));
}

export async function marketingSessionHandler(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET") {
    await runSafely(res, () => getSession(req, res));
    return;
  }
  if (method === "DELETE") {
    await runSafely(res, () => logout(req, res));
    return;
  }
  methodNotAllowed(res, ["GET", "DELETE"]);
}

export async function marketingRpcHandler(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  await runSafely(res, () => executeMarketingRpc(req, res));
}

export async function marketingOrchestratorHandler(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  await runSafely(res, () => runMarketingOrchestrator(req, res));
}

export async function marketingAgentHandler(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  await runSafely(res, () => runMarketingAgent(req, res));
}

export async function marketingLaunchHandler(
  req: MarketingApiRequest,
  res: MarketingApiResponse,
): Promise<void> {
  await runSafely(res, () => launchMarketingCampaign(req, res));
}
