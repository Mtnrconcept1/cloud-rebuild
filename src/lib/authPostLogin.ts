import type { UserRole } from "@/lib/auth-context";
import { TOK_WORKSPACE_CHOOSER_PATH } from "@/lib/authDomains";
import { getRoleHomePath } from "@/lib/roleAccess";

const INTERNAL_NAVIGATION_ORIGIN = "https://www.thetok.ch";

/** Supabase may send its authorization path directly to /auth. */
export function getOAuthConsentTargetFromSearch(searchParams: URLSearchParams) {
  const values = searchParams.getAll("authorization_id");
  if (values.length !== 1 || !/^[A-Za-z0-9_-]{1,200}$/.test(values[0])) return null;
  return `/oauth/consent?${new URLSearchParams({ authorization_id: values[0] })}`;
}

function isOAuthConsentTarget(target: string) {
  try {
    const url = new URL(target, INTERNAL_NAVIGATION_ORIGIN);
    return url.origin === INTERNAL_NAVIGATION_ORIGIN
      && url.pathname === "/oauth/consent"
      && Boolean(url.searchParams.get("authorization_id")?.trim());
  } catch {
    return false;
  }
}

/**
 * Every production login finishes on the canonical workspace chooser. The
 * selected dashboard may then move to its dedicated subdomain while reusing
 * the shared TOK session. OAuth consent is the only continuation that must
 * resume immediately. The internal demo login keeps its isolated role home.
 */
export function getPostAuthTargetForRole(
  selectedRole: UserRole,
  postAuthRedirectTarget: string | null,
  context: { isDemoAuthMode?: boolean; launchEnabled?: boolean } = {},
) {
  if (context.isDemoAuthMode) {
    return getRoleHomePath(selectedRole);
  }

  if (postAuthRedirectTarget && isOAuthConsentTarget(postAuthRedirectTarget)) {
    return postAuthRedirectTarget;
  }

  if (context.launchEnabled && selectedRole === "client") {
    return "/coming-soon";
  }

  return TOK_WORKSPACE_CHOOSER_PATH;
}
