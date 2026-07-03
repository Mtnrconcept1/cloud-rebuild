import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/lib/auth-context";
import { canAccessAnyRole, getRoleHomePath } from "@/lib/roleAccess";
import { buildAuthRedirectTarget } from "@/lib/stripeReturn";
import { Navigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requiredRoles?: UserRole[];
}

export default function ProtectedRoute({ children, requiredRole, requiredRoles }: ProtectedRouteProps) {
  const { user, loading, role, roles } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={buildAuthRedirectTarget(location.pathname, location.search)}
        replace
      />
    );
  }

  const allowedRoles = requiredRoles || (requiredRole ? [requiredRole] : undefined);
  if (!canAccessAnyRole({ requiredRoles: allowedRoles, activeRole: role, roles })) {
    return <Navigate to={getRoleHomePath(role)} replace />;
  }

  return <>{children}</>;
}
