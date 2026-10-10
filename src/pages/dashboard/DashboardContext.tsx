import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useOwnerRestaurants, type OwnedRestaurant } from "./useOwnerRestaurants";
import { DashboardContext, isRestaurantDashboardAccessApproved } from "./useDashboardRestaurant";
import { ALL_GATABLE_FEATURES } from "@/lib/packFeatureGating";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { resolveCommercialDemoRestaurantSelection } from "@/lib/commercialDemoRestaurantScope";
import { useSignupApplication } from "@/hooks/useSignupApplication";
import { isSignupRestaurateurOnboardingPaymentReady } from "@/lib/signup";
import { useLaunchGate } from "@/components/launch/LaunchGateProvider";

const STORAGE_KEY = "miamz-dashboard-restaurant";

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { state: launchState } = useLaunchGate();
  const commercialDemoFrame = useCommercialDemoFrame();
  const ownerRestaurants = useOwnerRestaurants({ enabled: !commercialDemoFrame });
  const { data: rawSignupApplication } = useSignupApplication("restaurateur");
  const signupApplication = Array.isArray(rawSignupApplication)
    ? rawSignupApplication[0] || null
    : rawSignupApplication || null;
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
  // Resolve the authorized selection during render, before the route access
  // gate runs. Repairing it only in an effect briefly marks an active owner
  // as locked and redirects deep links back to /dashboard.
  const selectedId = commercialDemoFrame
    ? resolveCommercialDemoRestaurantSelection(restaurants, frameDemoRestaurantId)
    : restaurants.find((restaurant) => restaurant.id === storedSelectedId)?.id
      ?? restaurants[0]?.id
      ?? null;

  // Persist the normalized selection without making storage availability a
  // prerequisite for navigation. Embedded demo selection stays server-scoped.
  useEffect(() => {
    if (loading || commercialDemoFrame) return;
    if (storedSelectedId !== selectedId) setStoredSelectedId(selectedId);
    try {
      if (selectedId) localStorage.setItem(STORAGE_KEY, selectedId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private/embedded browsers may reject storage; in-memory state is enough.
    }
  }, [commercialDemoFrame, loading, selectedId, storedSelectedId]);

  const setSelectedId = (id: string) => {
    if (commercialDemoFrame) return;
    if (!restaurants.some((restaurant) => restaurant.id === id)) return;
    setStoredSelectedId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Keep the selected restaurant usable when persistence is unavailable.
    }
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
    ? "Votre fiche reste privée pendant la validation humaine. Après l'enregistrement de votre carte, vous pouvez compléter les informations nécessaires à sa validation."
    : null;

  // The launch keeps client ordering closed while restaurateurs prepare their
  // own data. Existing ownership policies still determine every mutation.
  const onboardingConfigurationUnlocked = isDemoMode
    || launchState?.enabled === true
    || isSignupRestaurateurOnboardingPaymentReady(signupApplication);

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
      onboardingConfigurationUnlocked,
      dashboardAccessLockReason,
      isDemoMode,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}
