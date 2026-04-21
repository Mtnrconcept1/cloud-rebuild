import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;
type DeliveryMetadata = Record<string, unknown> | null | undefined;
type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const TOKEN_PATTERN = /(sk-[a-zA-Z0-9_-]{20,}|sbp_[a-zA-Z0-9]{20,}|whsec_[a-zA-Z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/g;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://tok.ch",
  "https://www.tok.ch",
  "https://app.tok.ch",
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
];
const LOCALHOST_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
  "x-internal-cron-secret",
  "x-cron-secret",
  "stripe-signature",
].join(", ");

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

type RequestActor = {
  adminClient: ReturnType<typeof createClient>;
  userClient: ReturnType<typeof createClient> | null;
  userId: string | null;
  roles: string[];
  isAdmin: boolean;
  isServiceRole: boolean;
  authMode: "user_jwt" | "service_role" | "scheduler_secret";
};

function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

function normalizeRole(role: unknown): string {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

function maskEmail(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.includes("@")) return null;
  const [local, domain] = raw.split("@", 2);
  if (!local || !domain) return null;
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function maskPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.length < 6) return "***";
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

function sanitize<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(TOKEN_PATTERN, "[REDACTED]") as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      if (
        lowered.includes("password") ||
        lowered.includes("secret") ||
        lowered.includes("token") ||
        lowered.includes("apikey") ||
        lowered === "authorization" ||
        lowered === "cookie"
      ) {
        out[key] = "[REDACTED]";
      } else if (lowered === "email") {
        out[key] = maskEmail(v) ?? "[REDACTED]";
      } else if (lowered === "phone" || lowered === "phone_number") {
        out[key] = maskPhone(v) ?? "[REDACTED]";
      } else {
        out[key] = sanitize(v);
      }
    }
    return out as unknown as T;
  }
  return value;
}

function emit(level: LogLevel, fn: string, msg: string, ctx?: LogContext) {
  const payload = {
    level,
    fn,
    msg,
    ts: new Date().toISOString(),
    ...(ctx ? sanitize(ctx) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function makeLogger(functionName: string, baseCtx: LogContext = {}) {
  const rid = crypto.randomUUID();
  const base = { rid, ...baseCtx };
  return {
    rid,
    debug: (msg: string, ctx?: LogContext) => emit("debug", functionName, msg, { ...base, ...ctx }),
    info: (msg: string, ctx?: LogContext) => emit("info", functionName, msg, { ...base, ...ctx }),
    warn: (msg: string, ctx?: LogContext) => emit("warn", functionName, msg, { ...base, ...ctx }),
    error: (msg: string, ctx?: LogContext) => emit("error", functionName, msg, { ...base, ...ctx }),
  };
}

export function getEnv(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

export function createAdminClient() {
  return createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export function jsonResponse(
  payload: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function buildRequestMetadata(req: Request | null | undefined) {
  if (!req) return {};

  let pathname = "";
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    pathname = "";
  }

  const forwardedFor = req.headers.get("x-forwarded-for") || "";

  return {
    method: req.method,
    path: pathname,
    user_agent: req.headers.get("user-agent") || null,
    ip: forwardedFor.split(",")[0]?.trim() || null,
  };
}

export async function writeAuditLog(input: {
  adminClient: ReturnType<typeof createClient>;
  functionName: string;
  status: "success" | "failure";
  action?: string;
  actor?: RequestActor | { userId?: string | null; roles?: string[]; isServiceRole?: boolean; authMode?: string | null } | null;
  request?: Request | null;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const actorRoles = input.actor?.roles || [];
  const actorUserId = input.actor?.userId || null;
  const isServiceRole = Boolean(input.actor?.isServiceRole);
  const authMode = input.actor?.authMode || null;

  try {
    await input.adminClient.from("edge_function_audit_logs").insert({
      function_name: input.functionName,
      action: input.action || "invoke",
      actor_user_id: actorUserId,
      actor_roles: actorRoles,
      is_service_role: isServiceRole,
      status: input.status,
      target_entity_type: input.targetEntityType || null,
      target_entity_id: input.targetEntityId || null,
      error_message: input.errorMessage || null,
      request_metadata: {
        ...buildRequestMetadata(input.request),
        auth_mode: authMode,
        ...(input.metadata || {}),
      },
    });
  } catch (error) {
    console.error("[audit] write failure:", error);
  }
}

export async function authenticateRequest(
  req: Request,
  options: { allowServiceRole?: boolean; allowSchedulerSecret?: boolean } = {},
): Promise<RequestActor> {
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient = createAdminClient();

  if (options.allowSchedulerSecret) {
    const providedSecret = req.headers.get("x-internal-cron-secret") ||
      req.headers.get("x-cron-secret") || "";
    const configuredSecret = Deno.env.get("INTERNAL_CRON_SECRET") ||
      Deno.env.get("CRON_SECRET") || "";

    if (configuredSecret && providedSecret && safeEqual(providedSecret, configuredSecret)) {
      return {
        adminClient,
        userClient: null,
        userId: null,
        roles: ["scheduler"],
        isAdmin: false,
        isServiceRole: true,
        authMode: "scheduler_secret",
      };
    }
  }

  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Unauthorized");
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (options.allowServiceRole === true && serviceRoleKey && safeEqual(token, serviceRoleKey)) {
    return {
      adminClient,
      userClient: null,
      userId: null,
      roles: ["service_role"],
      isAdmin: true,
      isServiceRole: true,
      authMode: "service_role",
    };
  }

  const userClient = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_ANON_KEY"),
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData?.user) {
    throw new HttpError(401, "Unauthorized");
  }

  const userId = userData.user.id;

  const { data: roleRows, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (roleError) {
    throw new HttpError(500, roleError.message);
  }

  const roles = [...new Set(
    (roleRows || [])
      .map((row: { role: string }) => normalizeRole(row.role))
      .filter(Boolean),
  )];

  return {
    adminClient,
    userClient,
    userId,
    roles,
    isAdmin: roles.includes("admin"),
    isServiceRole: false,
    authMode: "user_jwt",
  };
}

function normalizeOrigin(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  if (!cleaned) return null;

  try {
    return new URL(cleaned).origin;
  } catch {
    return null;
  }
}

function parseAllowedOrigins(): string[] {
  const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS")?.trim() || "")
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter((entry): entry is string => Boolean(entry));

  const appOrigins = [
    normalizeOrigin(Deno.env.get("APP_BASE_URL")),
    normalizeOrigin(Deno.env.get("PUBLIC_APP_URL")),
    normalizeOrigin(Deno.env.get("SITE_URL")),
  ].filter((entry): entry is string => Boolean(entry));

  return Array.from(new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...configuredOrigins,
    ...appOrigins,
  ]));
}

function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  if (LOCALHOST_REGEX.test(origin)) return true;
  return false;
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = parseAllowedOrigins();

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (isOriginAllowed(origin, allowed)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export function handleCorsPreflight(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders });
}

function normalizeFlexOption(value: unknown): "express" | "standard" | "flex" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "express" || normalized === "flex") return normalized;
  return "standard";
}

function getDeliveryDispatchConfig(metadata: DeliveryMetadata) {
  const flexOption = normalizeFlexOption(metadata?.flex_option);

  return flexOption === "express"
    ? {
        flexOption,
        windowLabel: "30 min",
        minMinutes: 30,
        maxMinutes: 30,
        baseRadiusKm: 3.5,
        radiusStepKm: 1.5,
        courierFanout: 3,
        attemptTimeoutSeconds: 30,
      }
    : flexOption === "flex"
      ? {
          flexOption,
          windowLabel: "1h a 1h30",
          minMinutes: 60,
          maxMinutes: 90,
          baseRadiusKm: 9,
          radiusStepKm: 3,
          courierFanout: 8,
          attemptTimeoutSeconds: 60,
        }
      : {
          flexOption,
          windowLabel: "45 min",
          minMinutes: 45,
          maxMinutes: 45,
          baseRadiusKm: 5.5,
          radiusStepKm: 2,
          courierFanout: 5,
          attemptTimeoutSeconds: 45,
        };
}

function normalizeDeliveryProofCode(value: unknown) {
  const normalized = String(value || "").replace(/\D/g, "");
  return normalized.slice(0, 6);
}

function generateDeliveryProofCode(existingValue: unknown) {
  const existing = normalizeDeliveryProofCode(existingValue);
  if (existing.length === 6) return existing;
  const randomNumber = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(randomNumber).padStart(6, "0");
}

export function isDeliveryOrder(input: {
  deliveryAddress?: string | null;
  metadata?: DeliveryMetadata;
  orderType?: string | null;
}) {
  const metadata = input.metadata || {};
  const explicitType = String(input.orderType || metadata.type || "").trim().toLowerCase();
  const feature = String(metadata.feature || "").trim().toLowerCase();
  const hasPickupTime = Boolean(metadata.pickup_time || metadata.arrival_time);

  if (explicitType && explicitType !== "delivery") return false;
  if (!input.deliveryAddress) return false;
  if (feature === "zero-attente") return false;
  return !hasPickupTime;
}

export function enrichDeliveryMetadata(metadata: DeliveryMetadata) {
  const config = getDeliveryDispatchConfig(metadata);
  const proofCode = generateDeliveryProofCode(metadata?.delivery_proof_code);

  return {
    ...(metadata || {}),
    flex_option: config.flexOption,
    delivery_window_label: config.windowLabel,
    delivery_window_min_minutes: config.minMinutes,
    delivery_window_max_minutes: config.maxMinutes,
    dispatch_base_radius_km: config.baseRadiusKm,
    dispatch_radius_step_km: config.radiusStepKm,
    dispatch_courier_fanout: config.courierFanout,
    dispatch_timeout_seconds: config.attemptTimeoutSeconds,
    delivery_proof_required: true,
    delivery_proof_code: proofCode,
  };
}

export function getEstimatedArrivalTime(metadata: DeliveryMetadata, scheduledAt?: string | null, now = new Date()) {
  if (scheduledAt) return scheduledAt;
  const config = getDeliveryDispatchConfig(metadata);
  return new Date(now.getTime() + config.maxMinutes * 60 * 1000).toISOString();
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
