import type { UserRole } from "@/lib/auth-context";

export const SUPER_ADMIN_EMAIL = "rbarman@hotmail.ch";

const SUPER_ADMIN_ROLES: UserRole[] = ["client", "admin", "restaurateur", "courier"];
const ROLE_HOME_PATHS: Record<UserRole, string> = {
  client: "/",
  restaurateur: "/dashboard",
  admin: "/admin",
  courier: "/courier",
};

export function isSuperAdminEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function getEffectiveRoles(roles: UserRole[], userEmail: string | null | undefined): UserRole[] {
  return isSuperAdminEmail(userEmail) ? SUPER_ADMIN_ROLES : roles;
}

export function getDefaultActiveRole(roles: UserRole[], userEmail: string | null | undefined): UserRole {
  const effectiveRoles = getEffectiveRoles(roles, userEmail);
  const priority: UserRole[] = isSuperAdminEmail(userEmail)
    ? ["admin", "restaurateur", "courier", "client"]
    : ["restaurateur", "courier", "admin", "client"];

  return priority.find((role) => effectiveRoles.includes(role)) || "client";
}

export function getRoleHomePath(role: UserRole | null | undefined) {
  return role ? ROLE_HOME_PATHS[role] : "/";
}

export function canSwitchRoles(roles: UserRole[], userEmail: string | null | undefined) {
  return isSuperAdminEmail(userEmail) && getEffectiveRoles(roles, userEmail).length > 1;
}

export function canAccessRole({
  requiredRole,
  activeRole,
  roles,
  userEmail,
}: {
  requiredRole?: UserRole;
  activeRole: UserRole | null;
  roles: UserRole[];
  userEmail: string | null | undefined;
}) {
  if (!requiredRole) return true;
  if (activeRole === requiredRole) return true;

  return isSuperAdminEmail(userEmail) && getEffectiveRoles(roles, userEmail).includes(requiredRole);
}

export function canAccessAnyRole({
  requiredRoles,
  activeRole,
  roles,
  userEmail,
}: {
  requiredRoles?: UserRole[];
  activeRole: UserRole | null;
  roles: UserRole[];
  userEmail: string | null | undefined;
}) {
  if (!requiredRoles?.length) return true;
  return requiredRoles.some((requiredRole) =>
    canAccessRole({ requiredRole, activeRole, roles, userEmail })
  );
}

export function canShowClientSurface({
  userEmail,
  activeRole,
}: {
  userEmail: string | null | undefined;
  activeRole: UserRole | null;
}) {
  return !userEmail || activeRole === "client" || isSuperAdminEmail(userEmail);
}

export function canShowSocialFeedSurface({
  userEmail,
  activeRole,
}: {
  userEmail: string | null | undefined;
  activeRole: UserRole | null;
}) {
  return !userEmail || activeRole === "client" || activeRole === "restaurateur" || isSuperAdminEmail(userEmail);
}
