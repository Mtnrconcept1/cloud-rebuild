import type { UserRole } from "@/lib/auth-context";
import { getCommercialNavigationHref } from "@/lib/commercialDomains";
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
  const defaultTarget = selectedRole === "commercial"
    ? getCommercialNavigationHref("/commercial")
    : getRoleHomePath(selectedRole);

  if (!postAuthRedirectTarget) {
    return defaultTarget;
  }

  const pathname = getPathname(postAuthRedirectTarget);
  const privilegedRouteOwner = getPrivilegedRouteOwner(pathname);

  if (privilegedRouteOwner === "commercial" && ["admin", "commercial"].includes(selectedRole)) {
    const targetUrl = new URL(postAuthRedirectTarget, "https://www.thetok.ch");
    return getCommercialNavigationHref(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
  }

  if (!privilegedRouteOwner) {
    return selectedRole === "client" ? postAuthRedirectTarget : defaultTarget;
  }

  return privilegedRouteOwner === selectedRole
    ? postAuthRedirectTarget
    : defaultTarget;
}

