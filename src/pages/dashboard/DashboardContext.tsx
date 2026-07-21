import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useOwnerRestaurants, type OwnedRestaurant } from "./useOwnerRestaurants";
import { DashboardContext, isRestaurantDashboardAccessApproved } from "./useDashboardRestaurant";
import { ALL_GATABLE_FEATURES } from "@/lib/packFeatureGating";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { resolveCommercialDemoRestaurantSelection } from "@/lib/commercialDemoRestaurantScope";

const STORAGE_KEY = "miamz-dashboard-restaurant";

export function DashboardProvider({ children }: { children: ReactNode }) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const ownerRestaurants = useOwnerRestaurants({ enabled: !commercialDemoFrame });
  const frameDemoRestaurantId = commercialDemoFrame?.snapshot.session.demo_restaurant_id || null;
  const frameRestaurants = useMemo<OwnedRestaurant[]>(() => {
    if (!commercialDemoFrame || !frameDemoRestaurantId) return [];

    return [{
      id: frameDemoRestaurantId,
      name: "Restaurant Démo TOK",
      disabled_dashboard_features: [],
      subscription_enabled_dashboard_features: [],
      is_active: true,
      is_demo: true,
      status: "active",
    }];
  }, [commercialDemoFrame, frameDemoRestaurantId]);
  const restaurants = commercialDemoFrame ? frameRestaurants : ownerRestaurants.restaurants;
  const loading = commercialDemoFrame ? false : ownerRestaurants.loading;
  const error = commercialDemoFrame ? null : ownerRestaurants.error;
  const [storedSelectedId, setStoredSelectedId] = useState<string | null>(() => {
    if (commercialDemoFrame) return null;
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const selectedId = commercialDemoFrame
    ? resolveCommercialDemoRestaurantSelection(restaurants, frameDemoRestaurantId)
    : storedSelectedId;

  // Auto-select first owned restaurant, or clear stale selection
  useEffect(() => {
    if (loading) return;

    // The frame snapshot is the only selector authority. Do not read, write or
    // recover a different restaurant from the shared browser storage.
    if (commercialDemoFrame) return;

    if (restaurants.length === 0) {
      setStoredSelectedId(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Storage may be unavailable in some embedded contexts.
      }
      return;
    }

    if (!selectedId || !restaurants.find((r) => r.id === selectedId)) {
      const id = restaurants[0].id;
      setStoredSelectedId(id);
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, [commercialDemoFrame, loading, restaurants, selectedId]);

  const setSelectedId = (id: string) => {
    if (commercialDemoFrame) {
      // Ignore attempts to switch the embedded dashboard to a real or unrelated
      // restaurant, including calls from an overlooked legacy selector.
      return;
    }
    setStoredSelectedId(id);
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
    ? "Votre fiche reste privée pendant la validation humaine. Vous pouvez la compléter et enregistrer votre carte, mais elle n'est pas visible par les clients."
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

