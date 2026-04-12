import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import { useOwnerRestaurants, type OwnedRestaurant } from "./useOwnerRestaurants";

interface DashboardContextValue {
  restaurants: OwnedRestaurant[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  loading: boolean;
  error: string | null;
  disabledFeatures: Set<string>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

const STORAGE_KEY = "miamz-dashboard-restaurant";

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { restaurants, loading, error } = useOwnerRestaurants();
  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Auto-select first owned restaurant, or clear stale selection
  useEffect(() => {
    if (loading) return;

    if (restaurants.length === 0) {
      setSelectedIdState(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Storage may be unavailable in some embedded contexts.
      }
      return;
    }

    if (!selectedId || !restaurants.find((r) => r.id === selectedId)) {
      const id = restaurants[0].id;
      setSelectedIdState(id);
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, [loading, restaurants, selectedId]);

  const setSelectedId = (id: string) => {
    setSelectedIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const disabledFeatures = useMemo(() => {
    const selected = restaurants.find((r) => r.id === selectedId);
    return new Set<string>(selected?.disabled_dashboard_features || []);
  }, [restaurants, selectedId]);

  return (
    <DashboardContext.Provider value={{ restaurants, selectedId, setSelectedId, loading, error, disabledFeatures }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardRestaurant() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardRestaurant must be inside DashboardProvider");
  return ctx;
}
