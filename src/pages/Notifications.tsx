import "@/components/dashboard/CustomerWorkspacePages.css";
import { Link } from "react-router-dom";
import { Bell, Settings } from "lucide-react";
import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import NotificationHistoryList from "@/components/notifications/NotificationHistoryList";
import { Button } from "@/components/ui/button";

export default function Notifications() {
  return (
    <CustomerDashboardLayout>
      <div className="tok-customer-page tok-customer-notifications-layout">
        <NotificationHistoryList
          className="tok-customer-notifications"
          title="Mes notifications"
          description="Historique de vos commandes, réservations, offres et messages TOK."
          fallbackTarget="/notifications"
        />
        <aside className="tok-customer-note-card tok-customer-notifications-aside">
          <Bell aria-hidden="true" />
          <h2>Restez informé</h2>
          <p>Choisissez vos canaux de notification et les nouvelles que vous souhaitez recevoir pour vos expériences gourmandes.</p>
          <Button asChild variant="outline" className="mt-5 w-full gap-2">
            <Link to="/profil?tab=notifications"><Settings className="h-4 w-4" />Gérer mes préférences</Link>
          </Button>
        </aside>
      </div>
    </CustomerDashboardLayout>
  );
}
