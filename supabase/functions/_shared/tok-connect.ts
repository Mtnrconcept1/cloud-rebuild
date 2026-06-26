export type TokConnectScope =
  | "restaurants:read"
  | "availability:read"
  | "reservations:create"
  | "reservations:cancel"
  | "credits:read"
  | "campaigns:preview"
  | "analytics:read";

export type TokConnectEnvelope<TData = unknown> = {
  ok: boolean;
  data: TData | null;
  error: { code: string; message: string } | null;
  request_id: string;
  next_cursor: string | null;
};

export type TokConnectCursor = {
  createdAt: string;
  id: string;
};

export type TokConnectMcpTool = {
  name: string;
  title: string;
  description: string;
  requiredScopes: TokConnectScope[];
  inputSchema: Record<string, unknown>;
};

export type TokConnectIdempotencyRecord<TResponse = Record<string, unknown>> = {
  request_hash?: string | null;
  response_body?: TResponse | null;
  status_code?: number | null;
};

export type TokConnectIdempotencyDecision<TResponse = Record<string, unknown>> =
  | { status: "new" }
  | { status: "replay"; responseBody: TResponse; statusCode: number }
  | { status: "conflict" }
  | { status: "in_progress" };

export type TokConnectMcpContentResult = {
  content: Array<{ type: "text"; text: string }>;
};

export const TOK_CONNECT_REQUIRED_FEATURE_FLAGS = [
  "tok-connect",
  "tok-connect-api",
  "tok-connect-mcp",
  "tok-connect-webhooks",
  "tok-connect-autopilot",
] as const;

export const TOK_CONNECT_WEBHOOK_EVENTS = [
  "reservation.created",
  "reservation.cancelled",
  "webhook.test",
  "campaign.previewed",
] as const;

export const SAFE_TOK_CONNECT_MCP_TOOLS: TokConnectMcpTool[] = [
  {
    name: "search_restaurants",
    title: "Search restaurants",
    description: "Find active TOK restaurants by city, cuisine, text query and service intent.",
    requiredScopes: ["restaurants:read"],
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        city: { type: "string" },
        cuisine: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "get_real_time_availability",
    title: "Get real time availability",
    description: "Read reservation slots for a restaurant without mutating production data.",
    requiredScopes: ["availability:read"],
    inputSchema: {
      type: "object",
      required: ["restaurant_id", "date"],
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        date: { type: "string", format: "date" },
        party_size: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
  },
  {
    name: "prepare_reservation",
    title: "Prepare reservation",
    description: "Build a confirmation-ready reservation preview; creation still requires explicit user confirmation.",
    requiredScopes: ["reservations:create"],
    inputSchema: {
      type: "object",
      required: ["restaurant_id", "date", "time", "party_size"],
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        date: { type: "string", format: "date" },
        time: { type: "string" },
        party_size: { type: "integer", minimum: 1, maximum: 20 },
        customer_note: { type: "string" },
      },
    },
  },
  {
    name: "get_restaurant_performance",
    title: "Get restaurant performance",
    description: "Read restaurant performance signals for recommendations and human-approved actions.",
    requiredScopes: ["analytics:read"],
    inputSchema: {
      type: "object",
      required: ["restaurant_id"],
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        period: { type: "string", enum: ["7d", "30d", "90d"] },
      },
    },
  },
  {
    name: "estimate_campaign_credit_cost",
    title: "Estimate campaign credit cost",
    description: "Estimate TOK credit usage before a campaign preview or manual launch.",
    requiredScopes: ["credits:read", "campaigns:preview"],
    inputSchema: {
      type: "object",
      required: ["restaurant_id"],
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        audience_size: { type: "integer", minimum: 1 },
        channels: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "generate_campaign_preview",
    title: "Generate campaign preview",
    description: "Generate a campaign suggestion that must be validated by a human before publication.",
    requiredScopes: ["campaigns:preview"],
    inputSchema: {
      type: "object",
      required: ["restaurant_id", "objective"],
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        objective: { type: "string" },
        budget_chf: { type: "number", minimum: 0 },
      },
    },
  },
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function normalizeBase64Url(value: string) {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function denormalizeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return padded.padEnd(Math.ceil(padded.length / 4) * 4, "=");
}

function bytesToBinary(bytes: Uint8Array) {
  let value = "";
  for (let index = 0; index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

function binaryToBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

export function base64UrlEncodeBytes(bytes: Uint8Array) {
  return normalizeBase64Url(btoa(bytesToBinary(bytes)));
}

export function base64UrlEncodeText(value: string) {
  return base64UrlEncodeBytes(encoder.encode(value));
}

export function base64UrlDecodeText(value: string) {
  return decoder.decode(binaryToBytes(atob(denormalizeBase64Url(value))));
}

export function buildTokConnectEnvelope<TData>(input: {
  requestId: string;
  data?: TData;
  error?: { code: string; message: string } | null;
  nextCursor?: string | null;
}): TokConnectEnvelope<TData> {
  const error = input.error || null;
  return {
    ok: !error,
    data: error ? null : input.data ?? null,
    error,
    request_id: input.requestId,
    next_cursor: input.nextCursor ?? null,
  };
}

export function createTokConnectCursor(cursor: TokConnectCursor): string;
export function createTokConnectCursor(createdAt: string, id: string): string;
export function createTokConnectCursor(cursorOrCreatedAt: TokConnectCursor | string, id?: string) {
  const cursor = typeof cursorOrCreatedAt === "string"
    ? { createdAt: cursorOrCreatedAt, id: id || "" }
    : cursorOrCreatedAt;
  return base64UrlEncodeText(JSON.stringify(cursor));
}

export function parseTokConnectCursor(value: string | null | undefined): TokConnectCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(base64UrlDecodeText(value));
    if (
      typeof parsed?.createdAt === "string" &&
      typeof parsed?.id === "string" &&
      parsed.createdAt.trim() &&
      parsed.id.trim()
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    return null;
  }

  return null;
}

export function parseTokConnectLimit(
  value: string | null | undefined,
  defaultLimit = 25,
  maxLimit = 100,
) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

export function isValidTokConnectIdempotencyKey(value: string | null | undefined) {
  if (!value) return false;
  if (value.length < 8 || value.length > 120) return false;
  return /^[A-Za-z0-9:_-]+$/.test(value);
}

export function getTokConnectIdempotencyDecision<TResponse = Record<string, unknown>>(
  existing: TokConnectIdempotencyRecord<TResponse> | null | undefined,
  requestHash: string,
): TokConnectIdempotencyDecision<TResponse> {
  if (!existing) return { status: "new" };
  if (existing.request_hash && existing.request_hash !== requestHash) {
    return { status: "conflict" };
  }
  if (existing.response_body) {
    return {
      status: "replay",
      responseBody: existing.response_body,
      statusCode: existing.status_code || 200,
    };
  }
  return { status: "in_progress" };
}

function normalizeTokConnectHostname(hostname: string) {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

export function isTokConnectPrivateWebhookHostname(hostname: string) {
  const normalized = normalizeTokConnectHostname(hostname);
  if (!normalized) return true;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")) {
    return true;
  }

  const ipv4 = normalized.split(".");
  if (ipv4.length === 4 && ipv4.every((part) => /^\d+$/.test(part))) {
    const [a, b] = ipv4.map((part) => Number(part));
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }

  return false;
}

export function isSafeTokConnectWebhookUrl(
  value: string,
  options: { allowLocalHttp?: boolean } = {},
) {
  try {
    const parsed = new URL(value);
    const hostname = normalizeTokConnectHostname(parsed.hostname);
    const isPrivateHost = isTokConnectPrivateWebhookHostname(hostname);

    if (parsed.protocol === "https:") return !isPrivateHost;
    if (parsed.protocol === "http:" && options.allowLocalHttp) {
      return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    }
    return false;
  } catch {
    return false;
  }
}

function mcpJsonContent(value: Record<string, unknown>): TokConnectMcpContentResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

export function getTokConnectSandboxMcpToolResult(
  name: string,
  args: Record<string, unknown>,
): TokConnectMcpContentResult | null {
  const restaurantId = typeof args.restaurant_id === "string"
    ? args.restaurant_id
    : "00000000-0000-4000-8000-000000000101";

  switch (name) {
    case "search_restaurants":
      return mcpJsonContent({
        restaurants: [
          {
            id: "00000000-0000-4000-8000-000000000101",
            name: "TOK Sandbox Brasserie",
            city: args.city || "Geneve",
            cuisine_type: args.cuisine || "Bistronomie",
            rating: 4.8,
            supports_reservation: true,
          },
          {
            id: "00000000-0000-4000-8000-000000000102",
            name: "TOK Sandbox Trattoria",
            city: "Carouge",
            cuisine_type: "Italien",
            rating: 4.7,
            supports_reservation: true,
          },
        ],
      });

    case "get_real_time_availability":
      return mcpJsonContent({
        restaurant_id: restaurantId,
        date: args.date || new Date().toISOString().slice(0, 10),
        slots: [
          { slot_time: "12:00", service: "lunch", remaining_tables: 4, available: true },
          { slot_time: "19:30", service: "dinner", remaining_tables: 2, available: true },
        ],
      });

    case "prepare_reservation":
      return mcpJsonContent({
        reservation_preview: {
          restaurant_id: restaurantId,
          date: args.date,
          time: args.time,
          party_size: args.party_size,
          requires_confirmation: true,
          environment: "sandbox",
        },
      });

    case "get_restaurant_performance":
      return mcpJsonContent({
        restaurant_id: restaurantId,
        period: args.period || "30d",
        performance: {
          reservations: 42,
          conversion_rate: 0.18,
          average_rating: 4.8,
          revenue_signal: "sandbox_fixture",
        },
      });

    case "estimate_campaign_credit_cost":
      return mcpJsonContent({
        estimate: {
          restaurant_id: restaurantId,
          credits: Math.max(1, Math.ceil(Number(args.audience_size || 100) / 100)),
          currency: "TOK_CREDIT",
          environment: "sandbox",
        },
      });

    case "generate_campaign_preview":
      return mcpJsonContent({
        campaign_preview: {
          restaurant_id: restaurantId,
          objective: args.objective,
          budget_chf: Number(args.budget_chf || 0),
          requires_human_approval: true,
          status: "preview",
          environment: "sandbox",
        },
      });

    default:
      return null;
  }
}

export function assertTokConnectScopes(grantedScopes: string[], requiredScopes: string[]) {
  const granted = new Set(grantedScopes);
  const missing = requiredScopes.filter((scope) => !granted.has(scope));
  if (missing.length > 0) {
    throw new Error(`Missing TOK Connect scope: ${missing.join(", ")}`);
  }
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64UrlEncodeBytes(new Uint8Array(digest));
}

export async function hashTokConnectSecret(value: string) {
  return `tokc_sha256:${await sha256Base64Url(value)}`;
}

export async function verifyTokConnectSecret(value: string, storedHash: string | null | undefined) {
  if (!storedHash?.startsWith("tokc_sha256:")) return false;
  const nextHash = await hashTokConnectSecret(value);
  return timingSafeEqual(nextHash, storedHash);
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export async function signTokConnectWebhook(input: {
  secret: string;
  timestamp: string;
  payload: string;
}) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${input.timestamp}.${input.payload}`),
  );
  return `v1=${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

export async function buildTokConnectWebhookHeaders(input: {
  eventType: string;
  deliveryId: string;
  secret: string;
  timestamp: string;
  payload: string;
}) {
  return {
    "Content-Type": "application/json",
    "X-TOK-Event": input.eventType,
    "X-TOK-Delivery": input.deliveryId,
    "X-TOK-Timestamp": input.timestamp,
    "X-TOK-Signature": await signTokConnectWebhook({
      secret: input.secret,
      timestamp: input.timestamp,
      payload: input.payload,
    }),
  };
}

export function getTokConnectRetryDelaySeconds(attempts: number) {
  const safeAttempts = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
  return Math.min(3600, 60 * (2 ** safeAttempts));
}

export function makeTokConnectRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return `tok_req_${crypto.randomUUID()}`;
  }
  return `tok_req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function getTokConnectBearerToken(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

export function toTokConnectJsonResponse<TData>(
  payload: TokConnectEnvelope<TData>,
  status: number,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

export function createTokConnectAccessToken(prefix = "tokc_at") {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  return `${prefix}_${base64UrlEncodeBytes(random)}`;
}

export function createTokConnectClientCredential(prefix: "tokc_client" | "tokc_secret" | "tokc_whsec") {
  const random = new Uint8Array(24);
  crypto.getRandomValues(random);
  return `${prefix}_${base64UrlEncodeBytes(random)}`;
}
