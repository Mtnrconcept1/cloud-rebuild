import DashboardLayout from "@/components/DashboardLayout";
import NotificationHistoryList from "@/components/notifications/NotificationHistoryList";

export default function DashboardNotifications() {
  return (
    <DashboardLayout mainClassName="tok-restaurant-page tok-page-notifications">
      <NotificationHistoryList
        className="tok-restaurant-notifications"
        title="Notifications"
        description="Historique des commandes, réservations, incidents support et alertes de votre restaurant."
        fallbackTarget="/dashboard/notifications"
      />
    </DashboardLayout>
  );
}
