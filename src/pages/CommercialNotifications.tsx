import CommercialWorkspaceChrome from "@/components/commercial/CommercialWorkspaceChrome";
import NotificationHistoryList from "@/components/notifications/NotificationHistoryList";

export default function CommercialNotifications() {
  return (
    <>
      <CommercialWorkspaceChrome activeLabel="Notifications" />
      <main className="min-h-screen bg-background px-4 pb-12 pt-[calc(env(safe-area-inset-top,0px)+5.75rem)] text-foreground sm:px-6">
        <div className="mx-auto max-w-5xl">
          <NotificationHistoryList
            title="Notifications commerciales"
            description="Rappels de prospection, messages et informations de votre activité TOK."
            fallbackTarget="/commercial/notifications"
            routeRole="commercial"
          />
        </div>
      </main>
    </>
  );
}
