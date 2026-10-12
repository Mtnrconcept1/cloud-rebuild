import type { UserRole } from "@/lib/auth-context";
import { TOK_WORKSPACE_CHOOSER_PATH } from "@/lib/authDomains";
import { getRoleHomePath } from "@/lib/roleAccess";

const INTERNAL_NAVIGATION_ORIGIN = "https://www.thetok.ch";

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
 * During launch, authenticated customers see the welcome animation, while
 * staff reach the canonical workspace chooser and their dedicated areas.
 * OAuth consent is the only continuation that must resume immediately.
 * Internal demo login retains its isolated role home.
 */
export function getPostAuthTargetForRole(
  selectedRole: UserRole,
  postAuthRedirectTarget: string | null,
  context: { isDemoAuthMode?: boolean; launchEnabled?: boolean } = {},
) {
  if (context.isDemoAuthMode) {
    return getRoleHomePath(selectedRole);
  }

  if (context.launchEnabled && selectedRole === "client") {
    return "/coming-soon";
  }

  if (postAuthRedirectTarget && isOAuthConsentTarget(postAuthRedirectTarget)) {
    return postAuthRedirectTarget;
  }

  return TOK_WORKSPACE_CHOOSER_PATH;
}
