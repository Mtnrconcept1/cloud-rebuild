import type { UserRole } from "@/lib/auth-context";
import { getRoleHomePath } from "@/lib/roleAccess";

const INTERNAL_NAVIGATION_ORIGIN = "https://www.thetok.ch";

const PRIVILEGED_ROUTE_ROOTS: Record<Exclude<UserRole, "client">, string> = {
  admin: "/admin",
  restaurateur: "/dashboard",
  courier: "/courier",
  commercial: "/commercial",
};

function getPathname(target: string) {
  try {
    return new URL(target, INTERNAL_NAVIGATION_ORIGIN).pathname;
  } catch {
    return "/";
  }
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

function isUnderRouteRoot(pathname: string, routeRoot: string) {
  return pathname === routeRoot || pathname.startsWith(`${routeRoot}/`);
}

function getPrivilegedRouteOwner(pathname: string) {
  for (const [role, routeRoot] of Object.entries(PRIVILEGED_ROUTE_ROOTS)) {
    if (isUnderRouteRoot(pathname, routeRoot)) {
      return role as Exclude<UserRole, "client">;
    }
  }

  return null;
}

export function getPostAuthTargetForRole(
  selectedRole: UserRole,
  postAuthRedirectTarget: string | null,
) {
  if (!postAuthRedirectTarget) {
    return getRoleHomePath(selectedRole);
  }

  if (isOAuthConsentTarget(postAuthRedirectTarget)) {
    return postAuthRedirectTarget;
  }

  const pathname = getPathname(postAuthRedirectTarget);
  const privilegedRouteOwner = getPrivilegedRouteOwner(pathname);

  if (!privilegedRouteOwner) {
    return selectedRole === "client" ? postAuthRedirectTarget : getRoleHomePath(selectedRole);
  }

  return privilegedRouteOwner === selectedRole
    ? postAuthRedirectTarget
    : getRoleHomePath(selectedRole);
}

