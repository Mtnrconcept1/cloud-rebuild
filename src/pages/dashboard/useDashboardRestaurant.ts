import { createContext, useContext } from "react";
import type { OwnedRestaurant } from "./useOwnerRestaurants";

export interface DashboardContextValue {
  restaurants: OwnedRestaurant[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  loading: boolean;
  error: string | null;
  disabledFeatures: Set<string>;
}

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboardRestaurant() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardRestaurant must be inside DashboardProvider");
  return ctx;
}
