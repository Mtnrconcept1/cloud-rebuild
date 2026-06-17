import DashboardLayout from "@/components/DashboardLayout";
import CrmAccessGuard from "@/components/crm/CrmAccessGuard";
import CustomerCrmDashboard from "@/components/crm/CustomerCrmDashboard";
import { isEliteRestaurantSubscription } from "@/lib/packFeatureGating";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

export default function DashboardCrm() {
  const {
    restaurants,
    selectedId,
    loading,
    error,
  } = useDashboardRestaurant();

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const subscription = selectedRestaurant?.restaurant_subscription;
  const hasEliteAccess = isEliteRestaurantSubscription(subscription
    ? {
      plan: subscription.plan,
      slug: subscription.plan_record?.slug || subscription.plan,
      status: subscription.status,
      current_period_end: subscription.current_period_end,
      features: subscription.plan_record?.features || [],
    }
    : null);

  return (
    <DashboardLayout contentWidth="full">
      <CrmAccessGuard
        surface="restaurant"
        requiresElite
        hasEliteAccess={hasEliteAccess}
        eliteLoading={loading}
        restaurantName={selectedRestaurant?.name}
      >
        <CustomerCrmDashboard
          surface="restaurant"
          restaurantId={selectedId}
          restaurantName={selectedRestaurant?.name}
          restaurantLoading={loading}
          restaurantError={error}
        />
      </CrmAccessGuard>
    </DashboardLayout>
  );
}
