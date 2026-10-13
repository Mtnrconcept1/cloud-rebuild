import {
  authenticateRequest,
  createAdminClient,
  type RequestActor,
} from "./auth.ts";

// Compare all characters without stopping at the first difference. Key lengths
// are not secret; cap the untrusted input before doing bounded comparison work.
function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function configuredSecretKeys(): string[] {
  try {
    const parsed: unknown = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.values(parsed).filter((value): value is string => (
      typeof value === "string" && value.startsWith("sb_secret_")
      && value.length > "sb_secret_".length && value.length <= 4_096
    ));
  } catch {
    // A malformed new-key configuration never grants access. Existing legacy
    // and explicitly enabled scheduler authentication may still be available.
    return [];
  }
}

/**
 * A new or rotated secret key can be usable by the Data API before this Edge
 * isolate sees its refreshed SUPABASE_SECRET_KEYS snapshot. In that case,
 * prove service_role privileges against the existing, service-role-only RPC.
 * Its nonexistent session hash returns JSON null and never touches user data.
 */
async function verifyLiveProjectSecretKey(provided: string): Promise<boolean> {
  let projectUrl: URL;
  try {
    projectUrl = new URL(Deno.env.get("SUPABASE_URL") || "");
  } catch {
    return false;
  }
  const hostParts = projectUrl.hostname.split(".");
  if (projectUrl.protocol !== "https:" || projectUrl.username || projectUrl.password
    || projectUrl.port || projectUrl.pathname !== "/" || projectUrl.search || projectUrl.hash
    || hostParts.length !== 3 || hostParts[1] !== "supabase" || hostParts[2] !== "co"
    || !/^[a-z0-9-]+$/.test(hostParts[0])) return false;

  try {
    const response = await fetch(projectUrl.origin + "/rest/v1/rpc/service_get_marketing_web_session", {
      method: "POST",
      headers: {
        apikey: provided,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_sid_hash: "0".repeat(64), p_csrf_hash: null, p_touch: false }),
      signal: AbortSignal.timeout(5_000),
      redirect: "error",
    });
    const contentType = (response.headers.get("content-type") || "").trim().toLowerCase();
    if (response.status !== 200 || (contentType !== "application/json"
      && !contentType.startsWith("application/json;"))) return false;
    return (await response.json()) === null;
  } catch {
    // Unknown, revoked or mismatched credentials always fail closed.
    return false;
  }
}

/** Authenticate server calls using a configured new API key or existing auth.
 * Callers must still reject user_jwt and validate delegated admin identity.
 * A key prefix or an unverified JWT claim is never evidence of privilege.
 */
export async function authenticateMarketingRequest(
  req: Request,
  options: { allowSchedulerSecret?: boolean } = {},
): Promise<RequestActor> {
  const provided = req.headers.get("apikey") || "";
  if (provided.startsWith("sb_secret_") && provided.length <= 4_096) {
    let matches = 0;
    for (const configured of configuredSecretKeys()) {
      matches |= Number(constantTimeEqual(provided, configured));
    }
    if (matches !== 0 || (provided.length >= 25 && await verifyLiveProjectSecretKey(provided))) {
      return {
        adminClient: createAdminClient(),
        userClient: null,
        userId: null,
        roles: ["service_role"],
        isAdmin: true,
        isServiceRole: true,
        authMode: "service_role",
      };
    }
  }
  return authenticateRequest(req, {
    allowServiceRole: true,
    allowSchedulerSecret: options.allowSchedulerSecret === true,
  });
}
