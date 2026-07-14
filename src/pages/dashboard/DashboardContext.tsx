import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { DashboardContext, isRestaurantDashboardAccessApproved } from "./useDashboardRestaurant";
import { ALL_GATABLE_FEATURES } from "@/lib/packFeatureGating";

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

  const isDemoMode = selectedRestaurant?.is_demo === true;

  const dashboardAccessLocked = useMemo(() => {
    if (loading || isDemoMode) return false;
    return !isRestaurantDashboardAccessApproved(selectedRestaurant);
  }, [isDemoMode, loading, selectedRestaurant]);

  const dashboardAccessLockReason = dashboardAccessLocked
    ? "Votre dossier restaurateur doit être validé par l'admin TOK avant d'activer les onglets et fonctionnalités."
    : null;

  const disabledFeatures = useMemo(() => {
    if (isDemoMode) return new Set<string>();

    const lockedFeatures = new Set(selectedRestaurant?.disabled_dashboard_features || []);
    const subscriptionEnabledFeatures = selectedRestaurant?.subscription_enabled_dashboard_features || [];

    for (const feature of subscriptionEnabledFeatures) {
      lockedFeatures.delete(feature);
    }

    if (selectedRestaurant?.restaurant_subscription && subscriptionEnabledFeatures.length > 0) {
      const enabledBySubscription = new Set(subscriptionEnabledFeatures);
      for (const feature of ALL_GATABLE_FEATURES) {
        if (!enabledBySubscription.has(feature.key)) {
          lockedFeatures.add(feature.key);
        }
      }
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
  }, [dashboardAccessLocked, isDemoMode, selectedRestaurant]);

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
      isDemoMode,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

