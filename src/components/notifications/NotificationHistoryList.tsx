import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, ExternalLink, Inbox } from "lucide-react";

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
  limit?: number;
  className?: string;
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
  limit = 100,
  className,
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
  const notificationCenterTarget = fallbackTarget || getNotificationCenterPathForRole(role);
  const visibleNotifications = notifications.slice(0, visibleLimit);

  const openNotification = (notification: TokNotification) => {
    const target = getNotificationTarget(notification, role, notificationCenterTarget);
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

  return (
    <section className={cn("space-y-5", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold leading-tight">{title}</h1>
              {unreadCount > 0 ? (
                <Badge className="bg-red-600 text-white hover:bg-red-600">{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            {!inAppEnabled ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Le canal in-app est désactivé dans vos préférences, mais l'historique reste consultable.
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2 sm:w-auto"
          onClick={() => void markAllRead()}
          disabled={unreadCount === 0}
        >
          <CheckCheck className="h-4 w-4" />
          Tout marquer comme lu
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="h-24 rounded-2xl border bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive">
          Impossible de charger l'historique des notifications.
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
          <Inbox className="mx-auto mb-3 h-8 w-8 opacity-60" />
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleNotifications.map((notification) => (
            <article
              key={notification.id}
              className={cn(
                "flex w-full items-start justify-between gap-2 rounded-2xl border p-2 transition-colors hover:border-primary/35 hover:bg-primary/5 sm:gap-4 sm:p-3",
                notification.read_at ? "bg-card" : "border-primary/25 bg-primary/5",
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
              className="w-full"
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
