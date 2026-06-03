import type { UserRole } from "@/lib/auth-context";

const VALID_ROLES: UserRole[] = ["client", "restaurateur", "admin", "courier"];
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
}: {
  activeRole: UserRole | null;
}) {
  return !activeRole || activeRole === "client";
}

export function canShowSocialFeedSurface({
  activeRole,
}: {
  activeRole: UserRole | null;
}) {
  return !activeRole || activeRole === "client" || activeRole === "restaurateur";
}
