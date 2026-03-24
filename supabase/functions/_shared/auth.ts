import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export type RequestActor = {
  adminClient: ReturnType<typeof createClient>;
  userClient: ReturnType<typeof createClient> | null;
  userId: string | null;
  roles: string[];
  isAdmin: boolean;
  isServiceRole: boolean;
  authMode: "user_jwt" | "service_role" | "scheduler_secret";
};

type AuditActorContext = {
  userId?: string | null;
  roles?: string[];
  isServiceRole?: boolean;
  authMode?: "user_jwt" | "service_role" | "scheduler_secret";
};

type AuditLogInput = {
  adminClient: ReturnType<typeof createClient>;
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
    headers: { "Content-Type": "application/json", ...extraHeaders },
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
    const providedSecret = req.headers.get("x-internal-cron-secret") || req.headers.get("x-cron-secret");
    const configuredSecret = Deno.env.get("INTERNAL_CRON_SECRET") || Deno.env.get("CRON_SECRET");

    if (configuredSecret && providedSecret && providedSecret === configuredSecret) {
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

  if (options.allowServiceRole !== false && token === serviceRoleKey) {
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
    { global: { headers: { Authorization: authHeader } } },
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

  const roles = (roleRows || []).map((row: { role: string }) => row.role);
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

export function requireRole(actor: RequestActor, allowedRoles: string[]) {
  if (actor.isServiceRole) return;
  if (!allowedRoles.some((role) => actor.roles.includes(role))) {
    throw new HttpError(403, "Forbidden");
  }
}

export async function requireRestaurantAccess(
  actor: RequestActor,
  restaurantId: string,
) {
  const { data: restaurant, error } = await actor.adminClient
    .from("restaurants")
    .select("id, owner_id, name, city, cuisine_type, stripe_account_id")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message);
  }
  if (!restaurant) {
    throw new HttpError(404, "Restaurant introuvable");
  }

  if (!actor.isServiceRole && !actor.isAdmin && restaurant.owner_id !== actor.userId) {
    throw new HttpError(403, "Forbidden");
  }

  return restaurant;
}
