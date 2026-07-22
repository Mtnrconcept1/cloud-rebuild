import { createContext, useContext } from "react";
import type { OwnedRestaurant } from "./useOwnerRestaurants";

export interface DashboardContextValue {
  restaurants: OwnedRestaurant[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  loading: boolean;
  error: string | null;
  disabledFeatures: Set<string>;
  dashboardAccessLocked: boolean;
  onboardingConfigurationUnlocked: boolean;
  dashboardAccessLockReason: string | null;
  isDemoMode: boolean;
}

export const RESTAURANT_ONBOARDING_CONFIGURATION_ROUTES = [
  "/dashboard/restaurant",
  "/dashboard/menu",
  "/dashboard/photos",
  "/dashboard/offres",
  "/dashboard/ventes-flash",
  "/dashboard/formules",
  "/dashboard/service",
  "/dashboard/plan-salle",
] as const;

export function isRestaurantOnboardingConfigurationRoute(pathname: string) {
  return RESTAURANT_ONBOARDING_CONFIGURATION_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isRestaurantDashboardAccessApproved(restaurant: OwnedRestaurant | null | undefined) {
  const status = String(restaurant?.status || "").toLowerCase();
  return Boolean(restaurant?.is_active && status === "active");
}

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboardRestaurant() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardRestaurant must be inside DashboardProvider");
  return ctx;
}
