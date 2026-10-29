import { Navigate, useLocation } from "react-router-dom";

import { DashboardProvider } from "@/pages/dashboard/DashboardContext";
import {
  canAccessRestaurantDashboardRoute,
  useDashboardRestaurant,
} from "@/pages/dashboard/useDashboardRestaurant";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLoadingScreen from "@/components/ui/app-loading-screen";

function DashboardAccessGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const {
    loading,
    dashboardAccessLocked,
    onboardingConfigurationUnlocked,
    disabledFeatures,
  } = useDashboardRestaurant();

  if (loading) {
    return <AppLoadingScreen fullScreen title="Ouverture de votre restaurant" description="TOK vérifie les paramètres de votre établissement…" />;
  }

  if (
    !canAccessRestaurantDashboardRoute({
      pathname: location.pathname,
      dashboardAccessLocked,
      onboardingConfigurationUnlocked,
      disabledFeatures,
    })
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function DashboardRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute requiredRole="restaurateur">
      <DashboardProvider>
        <DashboardAccessGate>{children}</DashboardAccessGate>
      </DashboardProvider>
    </ProtectedRoute>
  );
}
