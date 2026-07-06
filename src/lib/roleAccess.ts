import type { UserRole } from "@/lib/auth-context";

const VALID_ROLES: UserRole[] = ["client", "restaurateur", "admin", "courier", "commercial"];
const PRIVILEGED_ROLES: UserRole[] = ["admin", "restaurateur", "courier", "commercial"];
const DEFAULT_ROLE_PRIORITY: UserRole[] = ["admin", "commercial", "restaurateur", "courier", "client"];
const ROLE_FEATURE_REQUIREMENTS: Partial<Record<UserRole, string[]>> = {
  courier: ["espace-livreur"],
  commercial: ["commercial-prospection"],
};
const ROLE_HOME_PATHS: Record<UserRole, string> = {
  client: "/",
  restaurateur: "/dashboard",
  admin: "/admin",
  courier: "/courier",
  commercial: "/commercial",
};

export function getEffectiveRoles(roles: UserRole[] = []): UserRole[] {
  const uniqueRoles = roles.filter((role, index) =>
    VALID_ROLES.includes(role) && roles.indexOf(role) === index
  );

  return uniqueRoles.length > 0 ? uniqueRoles : ["client"];
}

export function getDefaultActiveRole(roles: UserRole[]): UserRole {
  const effectiveRoles = getEffectiveRoles(roles);
  return DEFAULT_ROLE_PRIORITY.find((role) => effectiveRoles.includes(role)) || "client";
}

export function isRoleFeatureEnabled(role: UserRole, activeFeatures: ReadonlySet<string>) {
  const requirements = ROLE_FEATURE_REQUIREMENTS[role] || [];
  return requirements.every((featureName) => activeFeatures.has(featureName));
}

export function getFeatureVisibleRoles(roles: UserRole[] = [], activeFeatures: ReadonlySet<string>): UserRole[] {
  return getEffectiveRoles(roles).filter((role) => isRoleFeatureEnabled(role, activeFeatures));
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
  return activeRole === "client" && getEffectiveRoles(roles).includes("client");
}

export function canSwitchRoles(roles: UserRole[]) {
  const effectiveRoles = getEffectiveRoles(roles);
  return effectiveRoles.length > 1 && (
    effectiveRoles.includes("admin") || effectiveRoles.includes("commercial")
  );
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
