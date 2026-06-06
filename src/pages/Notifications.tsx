import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import NotificationHistoryList from "@/components/notifications/NotificationHistoryList";

export default function Notifications() {
  return (
    <CustomerDashboardLayout>
      <NotificationHistoryList
        title="Notifications"
        description="Historique de vos commandes, réservations, offres et messages TOK."
        fallbackTarget="/notifications"
      />
    </CustomerDashboardLayout>
  );
}
