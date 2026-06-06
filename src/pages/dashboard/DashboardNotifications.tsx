import DashboardLayout from "@/components/DashboardLayout";
import NotificationHistoryList from "@/components/notifications/NotificationHistoryList";

export default function DashboardNotifications() {
  return (
    <DashboardLayout>
      <NotificationHistoryList
        title="Notifications"
        description="Historique des commandes, réservations, incidents support et alertes de votre restaurant."
        fallbackTarget="/dashboard/notifications"
      />
    </DashboardLayout>
  );
}
