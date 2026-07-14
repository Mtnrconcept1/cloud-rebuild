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
  dashboardAccessLockReason: string | null;
  isDemoMode: boolean;
}

export function isRestaurantDashboardAccessApproved(restaurant: OwnedRestaurant | null | undefined) {
  const status = String(restaurant?.status || "").toLowerCase();
  return Boolean(
    restaurant?.is_active
    && !["pending", "pending_review", "needs_changes", "rejected"].includes(status),
  );
}

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboardRestaurant() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardRestaurant must be inside DashboardProvider");
  return ctx;
}

