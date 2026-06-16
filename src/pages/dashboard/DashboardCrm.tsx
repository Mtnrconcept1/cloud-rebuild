import DashboardLayout from "@/components/DashboardLayout";
import CustomerCrmDashboard from "@/components/crm/CustomerCrmDashboard";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

export default function DashboardCrm() {
  const {
    restaurants,
    selectedId,
    loading,
    error,
  } = useDashboardRestaurant();

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;

  return (
    <DashboardLayout contentWidth="full">
      <CustomerCrmDashboard
        surface="restaurant"
        restaurantId={selectedId}
        restaurantName={selectedRestaurant?.name}
        restaurantLoading={loading}
        restaurantError={error}
      />
    </DashboardLayout>
  );
}
