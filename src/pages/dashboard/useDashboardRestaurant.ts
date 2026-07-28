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

export const RESTAURANT_ONBOARDING_ROUTE_CATALOG = [
  { path: "/dashboard/restaurant", feature: "dashboard-restaurant" },
  { path: "/dashboard/menu", feature: "dashboard-menu" },
  { path: "/dashboard/photos", feature: "dashboard-photos" },
  { path: "/dashboard/offres", feature: "dashboard-offres" },
  { path: "/dashboard/ventes-flash", feature: "dashboard-ventes-flash" },
  { path: "/dashboard/formules", feature: "dashboard-formules" },
  { path: "/dashboard/service", feature: "dashboard-service" },
  { path: "/dashboard/plan-salle", feature: "dashboard-plan-salle" },
  { path: "/dashboard/plan-salle-v2", feature: "dashboard-plan-salle" },
] as const;

export const RESTAURANT_ONBOARDING_CONFIGURATION_ROUTES =
  RESTAURANT_ONBOARDING_ROUTE_CATALOG.map(({ path }) => path);

export function isRestaurantOnboardingConfigurationRoute(pathname: string) {
  return RESTAURANT_ONBOARDING_ROUTE_CATALOG.some(
    ({ path }) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function canAccessRestaurantDashboardRoute(input: {
  pathname: string;
  dashboardAccessLocked: boolean;
  onboardingConfigurationUnlocked: boolean;
  disabledFeatures?: ReadonlySet<string>;
}) {
  if (!input.dashboardAccessLocked || input.pathname === "/dashboard")
    return true;
  const route = RESTAURANT_ONBOARDING_ROUTE_CATALOG.find(
    ({ path }) =>
      input.pathname === path || input.pathname.startsWith(`${path}/`),
  );
  return Boolean(
    input.onboardingConfigurationUnlocked &&
    route &&
    !input.disabledFeatures?.has(route.feature),
  );
}

export function isRestaurantDashboardAccessApproved(
  restaurant: OwnedRestaurant | null | undefined,
) {
  const status = String(restaurant?.status || "").toLowerCase();
  return Boolean(restaurant?.is_active && status === "active");
}

export const DashboardContext = createContext<DashboardContextValue | null>(
  null,
);

export function useDashboardRestaurant() {
  const ctx = useContext(DashboardContext);
  if (!ctx)
    throw new Error("useDashboardRestaurant must be inside DashboardProvider");
  return ctx;
}
