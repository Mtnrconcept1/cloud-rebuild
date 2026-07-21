import { Navigate, useLocation } from "react-router-dom";

import { DashboardProvider } from "@/pages/dashboard/DashboardContext";
import { useDashboardRestaurant } from "@/pages/dashboard/useDashboardRestaurant";
import ProtectedRoute from "@/components/ProtectedRoute";

function DashboardAccessGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { loading, dashboardAccessLocked } = useDashboardRestaurant();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const pendingWorkspaceRouteAllowed = location.pathname === "/dashboard"
    || location.pathname === "/dashboard/restaurant";

  if (dashboardAccessLocked && !pendingWorkspaceRouteAllowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function DashboardRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRole="restaurateur">
      <DashboardProvider>
        <DashboardAccessGate>{children}</DashboardAccessGate>
      </DashboardProvider>
    </ProtectedRoute>
  );
}
