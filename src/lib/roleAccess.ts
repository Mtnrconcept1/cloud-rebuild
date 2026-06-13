import type { UserRole } from "@/lib/auth-context";

const VALID_ROLES: UserRole[] = ["client", "restaurateur", "admin", "courier"];
const PRIVILEGED_ROLES: UserRole[] = ["admin", "restaurateur", "courier"];
const DEFAULT_ROLE_PRIORITY: UserRole[] = ["admin", "restaurateur", "courier", "client"];
const ROLE_HOME_PATHS: Record<UserRole, string> = {
  client: "/",
  restaurateur: "/dashboard",
  admin: "/admin",
  courier: "/courier",
};

export function getEffectiveRoles(roles: UserRole[]): UserRole[] {
  const uniqueRoles = roles.filter((role, index) =>
    VALID_ROLES.includes(role) && roles.indexOf(role) === index
  );

  return uniqueRoles.length > 0 ? uniqueRoles : ["client"];
}

export function getDefaultActiveRole(roles: UserRole[]): UserRole {
  const effectiveRoles = getEffectiveRoles(roles);
  return DEFAULT_ROLE_PRIORITY.find((role) => effectiveRoles.includes(role)) || "client";
}

export function getRoleHomePath(role: UserRole | null | undefined) {
  return role ? ROLE_HOME_PATHS[role] : "/";
}

export function hasPrivilegedRole(roles: UserRole[]) {
  const effectiveRoles = getEffectiveRoles(roles);
  return effectiveRoles.some((role) => PRIVILEGED_ROLES.includes(role));
}

export function canUseClientRole({
  activeRole,
  roles,
}: {
  activeRole: UserRole | null;
  roles: UserRole[];
}) {
  return activeRole === "client" && !hasPrivilegedRole(roles);
}

export function canSwitchRoles(roles: UserRole[]) {
  const effectiveRoles = getEffectiveRoles(roles);
  return effectiveRoles.includes("admin") && effectiveRoles.length > 1;
}

export function canAccessRole({
  requiredRole,
  activeRole,
  roles,
}: {
  requiredRole?: UserRole;
  activeRole: UserRole | null;
  roles: UserRole[];
}) {
  if (!requiredRole) return true;
  if (requiredRole === "client") {
    return canUseClientRole({ activeRole, roles });
  }
  if (activeRole === requiredRole) return true;

  return canSwitchRoles(roles) && getEffectiveRoles(roles).includes(requiredRole);
}

export function canAccessAnyRole({
  requiredRoles,
  activeRole,
  roles,
}: {
  requiredRoles?: UserRole[];
  activeRole: UserRole | null;
  roles: UserRole[];
}) {
  if (!requiredRoles?.length) return true;
  return requiredRoles.some((requiredRole) =>
    canAccessRole({ requiredRole, activeRole, roles })
  );
}

export function canShowClientSurface({
  activeRole,
  roles = [],
}: {
  activeRole: UserRole | null;
  roles?: UserRole[];
}) {
  return !activeRole || canUseClientRole({ activeRole, roles });
}

export function canShowSocialFeedSurface({
  activeRole,
  roles = [],
}: {
  activeRole: UserRole | null;
  roles?: UserRole[];
}) {
  return !activeRole || canUseClientRole({ activeRole, roles }) || activeRole === "restaurateur";
}
