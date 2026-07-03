import type { UserRole } from "@/lib/auth-context";
import { getRoleHomePath } from "@/lib/roleAccess";

const PRIVILEGED_ROUTE_ROOTS: Record<Exclude<UserRole, "client">, string> = {
  admin: "/admin",
  restaurateur: "/dashboard",
  courier: "/courier",
  commercial: "/commercial",
};

function getPathname(target: string) {
  try {
    return new URL(target, "https://www.thetok.ch").pathname;
  } catch {
    return "/";
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

  const pathname = getPathname(postAuthRedirectTarget);
  const privilegedRouteOwner = getPrivilegedRouteOwner(pathname);

  if (!privilegedRouteOwner) {
    return selectedRole === "client" ? postAuthRedirectTarget : getRoleHomePath(selectedRole);
  }

  return privilegedRouteOwner === selectedRole
    ? postAuthRedirectTarget
    : getRoleHomePath(selectedRole);
}
