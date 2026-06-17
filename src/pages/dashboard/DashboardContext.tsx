import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { DashboardContext, isRestaurantDashboardAccessApproved } from "./useDashboardRestaurant";

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

  const selectedRestaurant = useMemo(
    () => restaurants.find((r) => r.id === selectedId) || null,
    [restaurants, selectedId],
  );

  const dashboardAccessLocked = useMemo(() => {
    if (loading) return false;
    return !isRestaurantDashboardAccessApproved(selectedRestaurant);
  }, [loading, selectedRestaurant]);

  const dashboardAccessLockReason = dashboardAccessLocked
    ? "Votre dossier restaurateur doit être validé par l'admin TOK avant d'activer les onglets et fonctionnalités."
    : null;

  const disabledFeatures = useMemo(() => {
    const lockedFeatures = new Set(selectedRestaurant?.disabled_dashboard_features || []);

    for (const feature of selectedRestaurant?.subscription_enabled_dashboard_features || []) {
      lockedFeatures.delete(feature);
    }

    if (dashboardAccessLocked) {
      for (const feature of [
        "dashboard-advisor",
        "dashboard-commandes",
        "dashboard-reservations",
        "dashboard-performances",
        "dashboard-comparaison",
        "dashboard-avis",
        "dashboard-crm",
        "dashboard-campagnes",
        "dashboard-promotions",
        "dashboard-reseaux-sociaux",
        "dashboard-actualites",
        "dashboard-factures",
        "dashboard-pack",
        "dashboard-restaurant",
        "dashboard-menu",
        "dashboard-photos",
        "dashboard-offres",
        "dashboard-ventes-flash",
        "dashboard-formules",
        "dashboard-service",
        "dashboard-plan-salle",
        "dashboard-support",
        "dashboard-notifications",
      ]) {
        lockedFeatures.add(feature);
      }
    }

    return lockedFeatures;
  }, [dashboardAccessLocked, selectedRestaurant]);

  return (
    <DashboardContext.Provider value={{
      restaurants,
      selectedId,
      setSelectedId,
      loading,
      error,
      disabledFeatures,
      dashboardAccessLocked,
      dashboardAccessLockReason,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}
