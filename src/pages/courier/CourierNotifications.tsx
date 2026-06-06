import CourierDashboardLayout from "@/components/CourierDashboardLayout";
import NotificationHistoryList from "@/components/notifications/NotificationHistoryList";

export default function CourierNotifications() {
  return (
    <CourierDashboardLayout>
      <NotificationHistoryList
        title="Notifications"
        description="Historique des missions, changements de statut et alertes liées aux livraisons."
        fallbackTarget="/courier/notifications"
      />
    </CourierDashboardLayout>
  );
}
