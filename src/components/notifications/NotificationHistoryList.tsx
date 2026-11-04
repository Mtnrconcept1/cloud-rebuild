import PageHeading from "@/components/editorial/PageHeading";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck, ExternalLink, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNotificationCenter, type TokNotification } from "@/hooks/useNotificationCenter";
import { useAuth } from "@/lib/auth-context";
import {
  getNotificationCenterPathForRole,
  getNotificationTarget,
} from "@/lib/notificationRouting";
import { cn } from "@/lib/utils";

type NotificationHistoryListProps = {
  title?: string;
  description?: string;
  emptyLabel?: string;
  fallbackTarget?: string;
  routeRole?: "commercial";
  limit?: number;
  className?: string;
  /** « section » : la liste est un bloc d'une page qui a déjà son en-tête. */
  headingLevel?: "page" | "section";
};

function formatNotificationDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationHistoryList({
  title = "Notifications",
  description = "Historique de vos alertes et mises à jour.",
  emptyLabel = "Aucune notification pour le moment.",
  fallbackTarget,
  routeRole,
  limit = 100,
  className,
  headingLevel = "page",
}: NotificationHistoryListProps) {
  const navigate = useNavigate();
  const [visibleLimit, setVisibleLimit] = useState(() => Math.min(limit, 20));
  const { user, role } = useAuth();
  const {
    inAppEnabled,
    notifications,
    unreadCount,
    isLoading,
    error,
    markNotificationRead,
    markAllRead,
  } = useNotificationCenter(limit, { realtime: true });
  const navigationRole = routeRole ?? role;
  const notificationCenterTarget = fallbackTarget || getNotificationCenterPathForRole(navigationRole);
  const visibleNotifications = notifications.slice(0, visibleLimit);

  const openNotification = (notification: TokNotification) => {
    const target = getNotificationTarget(notification, navigationRole, notificationCenterTarget);
    void markNotificationRead(notification.id);
    navigate(target);
  };

  if (!user) {
    return (
      <section className={cn("rounded-2xl border border-dashed p-8 text-center text-muted-foreground", className)}>
        Connectez-vous pour voir vos notifications.
      </section>
    );
  }

  const unreadBadge = unreadCount > 0 && <Badge>{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</Badge>;
  const inAppNotice = !inAppEnabled && (
    <p className="mt-2 text-xs">Le canal in-app est désactivé dans vos préférences. L’historique reste consultable.</p>
  );
  const markAllButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full shrink-0 gap-2 rounded-2xl sm:w-auto"
      onClick={() => void markAllRead()}
      disabled={unreadCount === 0}
    >
      <CheckCheck className="h-4 w-4" />
      Tout marquer comme lu
    </Button>
  );

  return (
    <section className={cn("space-y-5", className)}>
      {headingLevel === "section" ? (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
              {unreadBadge}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
            {inAppNotice}
          </div>
          {markAllButton}
        </header>
      ) : (
        <PageHeading title={title} mascot="megaphone" description={<>
          <p>{description}</p>
          {inAppNotice}
        </>} eyebrow={unreadBadge} actions={markAllButton} />
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="h-24 rounded-3xl border bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive">
          Impossible de charger l'historique des notifications.
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">
          <Inbox className="mx-auto mb-3 h-8 w-8 opacity-60" />
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleNotifications.map((notification) => (
            <article
              key={notification.id}
              className={cn(
                "flex w-full items-start justify-between gap-2 rounded-3xl border p-3 shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/5 sm:gap-4 sm:p-4",
                notification.read_at ? "bg-card" : "border-primary/30 bg-primary/[0.06]",
              )}
            >
              <button
                type="button"
                onClick={() => openNotification(notification)}
                className="min-w-0 flex-1 rounded-xl p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-words text-sm font-semibold leading-5">{notification.title}</span>
                  {!notification.read_at ? <Badge className="text-[10px]">Nouveau</Badge> : null}
                </span>
                <span className="mt-1 block break-words text-sm leading-5 text-muted-foreground">{notification.body}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{formatNotificationDate(notification.created_at)}</span>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                {!notification.read_at ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void markNotificationRead(notification.id)}
                  >
                    Marquer lu
                  </Button>
                ) : null}
                <ExternalLink className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
            </article>
          ))}
          {visibleNotifications.length < notifications.length ? (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-2xl"
              onClick={() => setVisibleLimit((current) => Math.min(current + 20, notifications.length))}
            >
              Charger plus de notifications
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
