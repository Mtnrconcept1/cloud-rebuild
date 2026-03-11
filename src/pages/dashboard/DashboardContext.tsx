import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useOwnerRestaurants, type OwnedRestaurant } from "./useOwnerRestaurants";

interface DashboardContextValue {
  restaurants: OwnedRestaurant[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  loading: boolean;
  error: string | null;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

const STORAGE_KEY = "miamz-dashboard-restaurant";

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { restaurants, loading, error } = useOwnerRestaurants();
  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  // Auto-select first restaurant if none selected or selected no longer exists
  useEffect(() => {
    if (restaurants.length === 0) return;
    if (!selectedId || !restaurants.find((r) => r.id === selectedId)) {
      const id = restaurants[0].id;
      setSelectedIdState(id);
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, [restaurants, selectedId]);

  const setSelectedId = (id: string) => {
    setSelectedIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <DashboardContext.Provider value={{ restaurants, selectedId, setSelectedId, loading, error }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardRestaurant() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardRestaurant must be inside DashboardProvider");
  return ctx;
}
