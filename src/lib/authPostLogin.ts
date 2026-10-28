import type { UserRole } from "@/lib/auth-context";
import { TOK_WORKSPACE_CHOOSER_PATH } from "@/lib/authDomains";
import { getRoleHomePath } from "@/lib/roleAccess";
import { getWorkforceContinuationTarget } from "@/lib/workforceContinuation";

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
 * Après connexion, un client arrive sur l'accueil public TOK et les rôles
 * professionnels choisissent leur espace. Les parcours OAuth, les invitations
 * collaborateurs et l'écran de lancement conservent leur priorité.
 * La démo interne garde son accueil propre à chaque rôle.
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

  const workforceTarget = getWorkforceContinuationTarget(postAuthRedirectTarget);
  if (workforceTarget) return workforceTarget;

  // The CRM recovery flow must return admins to the exact protected page.
  // Do not honor arbitrary admin or cross-origin redirect targets.
  if (selectedRole === "admin" && postAuthRedirectTarget === "/admin/crm") {
    return "/admin/crm";
  }

  if (selectedRole === "client") {
    return context.launchEnabled ? "/coming-soon" : "/";
  }

  return TOK_WORKSPACE_CHOOSER_PATH;
}
