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
    if (matches !== 0) {
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
