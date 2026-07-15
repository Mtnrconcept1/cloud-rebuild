import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EdgeSupabaseClient = ReturnType<typeof createClient<any>>;

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export type RequestActor = {
  adminClient: EdgeSupabaseClient;
  userClient: EdgeSupabaseClient | null;
  userId: string | null;
  roles: string[];
  isAdmin: boolean;
  isServiceRole: boolean;
  authMode: "user_jwt" | "service_role" | "scheduler_secret";
};

/**
 * Constant-time string comparison. Prevents timing oracles when comparing
 * shared secrets (scheduler secret, service role token).
 */
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

type AuditActorContext = {
  userId?: string | null;
  roles?: string[];
  isServiceRole?: boolean;
  authMode?: "user_jwt" | "service_role" | "scheduler_secret";
};

type AuditLogInput = {
  adminClient: EdgeSupabaseClient;
  functionName: string;
  status: "success" | "failure";
  action?: string;
  actor?: RequestActor | AuditActorContext | null;
  request?: Request | null;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export function getEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (value) return value;

  if (name === "STRIPE_SECRET_KEY") {
    return Deno.env.get("STRIPE_PERSONNAL_SECRET_KEY")?.trim() ||
      Deno.env.get("STRIPE_PERSONAL_SECRET_KEY")?.trim() ||
      Deno.env.get("STRIPE_SECRET_KEY_LIVE")?.trim() ||
      "";
  }

  if (name === "STRIPE_SECRET_KEY_LIVE") {
    return Deno.env.get("STRIPE_PERSONNAL_SECRET_KEY")?.trim() ||
      Deno.env.get("STRIPE_PERSONAL_SECRET_KEY")?.trim() ||
      "";
  }

  return "";
}

export function createAdminClient() {
  return createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  ) as EdgeSupabaseClient;
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

export function buildRequestMetadata(req: Request | null | undefined) {
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

export async function writeAuditLog(input: AuditLogInput) {
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

    let schedulerSecretValid = Boolean(
      configuredSecret &&
      providedSecret &&
      safeEqual(providedSecret, configuredSecret)
    );

    // pg_cron stores its secret in Postgres Vault. This fallback keeps the
    // scheduler operational even when the Edge runtime secret and Vault are
    // provisioned independently. The verifier RPC is service-role only and
    // compares digests server-side, so the Vault value never leaves Postgres.
    if (!schedulerSecretValid && providedSecret) {
      try {
        const { data, error } = await adminClient.rpc("verify_internal_cron_secret", {
          p_secret: providedSecret,
        });
        schedulerSecretValid = !error && data === true;
      } catch {
        schedulerSecretValid = false;
      }
    }

    if (schedulerSecretValid) {
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

  if (
    options.allowServiceRole === true &&
    serviceRoleKey &&
    safeEqual(token, serviceRoleKey)
  ) {
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
  ) as EdgeSupabaseClient;

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

/**
 * Enforce role membership. Service-role / scheduler actors bypass the check
 * because they are already trusted system identities that could only be
 * produced by an explicit `allowServiceRole`/`allowSchedulerSecret` opt-in.
 * User-JWT actors must match at least one of the allowed roles.
 */
export function requireRole(
  actor: RequestActor,
  allowedRoles: string[],
  customMessage?: string,
) {
  if (actor.isServiceRole) return;

  const normalizedAllowedRoles = allowedRoles
    .map((role) => normalizeRole(role))
    .filter(Boolean);

  const normalizedActorRoles = actor.roles
    .map((role) => normalizeRole(role))
    .filter(Boolean);

  const hasRole = normalizedAllowedRoles.some((role) =>
    normalizedActorRoles.includes(role)
  );

  if (!hasRole) {
    throw new HttpError(
      403,
      customMessage ||
        `Forbidden: required roles [${normalizedAllowedRoles.join(", ")}], actual roles [${normalizedActorRoles.join(", ") || "none"}]`,
    );
  }
}

/**
 * Strict role check that ALWAYS requires a user JWT, even for service-role
 * callers. Use in functions where impersonation must be auditable and where
 * no automated / cron path is allowed.
 */
export function requireUserRole(
  actor: RequestActor,
  allowedRoles: string[],
  customMessage?: string,
) {
  if (!actor.userId) {
    throw new HttpError(403, "Forbidden: user identity required");
  }

  const normalizedAllowedRoles = allowedRoles
    .map((role) => normalizeRole(role))
    .filter(Boolean);

  const normalizedActorRoles = actor.roles
    .map((role) => normalizeRole(role))
    .filter(Boolean);

  const hasRole = normalizedAllowedRoles.some((role) =>
    normalizedActorRoles.includes(role)
  );

  if (!hasRole) {
    throw new HttpError(
      403,
      customMessage ||
        `Forbidden: required roles [${normalizedAllowedRoles.join(", ")}], actual roles [${normalizedActorRoles.join(", ") || "none"}]`,
    );
  }
}

/**
 * Prevent a managed commercial-demo identity from entering any production
 * transaction flow. Roles are loaded from `user_roles` by authenticateRequest
 * with the service-role client; the active account mapping is checked as a
 * second authoritative signal so a stale/missing role cannot bypass the
 * isolation boundary.
 *
 * Admin and explicit service-role actors remain available for support and
 * operational tasks. Every other actor fails closed when the mapping cannot
 * be verified.
 */
export async function assertProductionFlowAllowed(
  actor: RequestActor,
  operation = "production transaction",
) {
  if (actor.isServiceRole || actor.isAdmin) return;
  if (!actor.userId) {
    throw new HttpError(401, "Unauthorized");
  }

  const hasCommercialRole = actor.roles
    .map((role) => normalizeRole(role))
    .includes("commercial");

  const { data: demoAccount, error: demoAccountError } = await actor.adminClient
    .from("commercial_demo_accounts")
    .select("user_id,is_active")
    .eq("user_id", actor.userId)
    .eq("is_active", true)
    .maybeSingle();

  if (demoAccountError) {
    // A known commercial role is blocked even if the mapping lookup fails.
    // Other callers also fail closed: a sensitive production operation must
    // never continue while its isolation status is unknown.
    if (hasCommercialRole) {
      throw new HttpError(
        403,
        `COMMERCIAL_DEMO_PRODUCTION_FLOW_BLOCKED: ${operation} indisponible pour un compte commercial.`,
      );
    }
    throw new HttpError(
      503,
      "COMMERCIAL_DEMO_ACCOUNT_CHECK_UNAVAILABLE: vérification du cloisonnement impossible.",
    );
  }

  if (hasCommercialRole || demoAccount) {
    throw new HttpError(
      403,
      `COMMERCIAL_DEMO_PRODUCTION_FLOW_BLOCKED: ${operation} indisponible pour un compte commercial.`,
    );
  }
}

export async function requireRestaurantAccess(
  actor: RequestActor,
  restaurantId: string,
  options: { allowDemo?: boolean } = {},
) {
  const { data: restaurant, error } = await actor.adminClient
    .from("restaurants")
    .select("id, owner_id, name, city, cuisine_type, stripe_account_id, is_demo")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message);
  }

  if (!restaurant) {
    throw new HttpError(404, "Restaurant introuvable");
  }

  if (
    !actor.isServiceRole &&
    !actor.isAdmin &&
    restaurant.owner_id !== actor.userId
  ) {
    throw new HttpError(403, "Forbidden");
  }

  // Check ownership before returning a demo-specific response so callers
  // cannot probe arbitrary restaurant UUIDs to discover their demo status.
  if (restaurant.is_demo && options.allowDemo !== true) {
    throw new HttpError(
      409,
      "DEMO_SIDE_EFFECT_BLOCKED: cette action externe est désactivée dans le restaurant de démonstration.",
    );
  }

  return restaurant;
}
