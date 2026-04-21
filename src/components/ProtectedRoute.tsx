import { useAuth } from "@/lib/auth";
import { buildAuthRedirectTarget } from "@/lib/stripeReturn";
import { Navigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "client" | "restaurateur" | "admin" | "courier";
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
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

  // Allow if: active role matches, OR user has the required role, OR user is admin
  if (requiredRole && role !== requiredRole && !roles.includes(requiredRole) && role !== "admin" && !roles.includes("admin")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
