import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/lib/auth-context";
import { canAccessAnyRole, getRoleHomePath } from "@/lib/roleAccess";
import { buildAuthRedirectTarget } from "@/lib/stripeReturn";
import { Navigate, useLocation } from "react-router-dom";
import { isCommercialDemoWorkspaceActive } from "@/integrations/supabase/demoClient";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requiredRoles?: UserRole[];
}

export default function ProtectedRoute({ children, requiredRole, requiredRoles }: ProtectedRouteProps) {
  const { user, loading, rolesResolved, role, roles } = useAuth();
  const location = useLocation();

  // Attendre aussi la lecture des roles : entre la session connue et l'effet
  // qui les charge, il existe un rendu ou loading est deja faux et la liste
  // encore vide. Decider la se soldait par une redirection vers l'accueil
  // public, visible comme un clignotement en changeant d'espace.
  if (loading || (user && !rolesResolved)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    const authPath = isCommercialDemoWorkspaceActive() ? "/auth/demo" : "/auth";
    return (
      <Navigate
        to={buildAuthRedirectTarget(location.pathname, location.search, authPath)}
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
