import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotificationCenter, type TokNotification } from "@/hooks/useNotificationCenter";
import { useAuth } from "@/lib/auth-context";
import { formatNotificationCount, getNotificationTarget } from "@/lib/notificationRouting";
import { cn } from "@/lib/utils";

type NotificationBellProps = {
  className?: string;
  buttonClassName?: string;
  contentClassName?: string;
  align?: "start" | "center" | "end";
};

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationBell({
  className,
  buttonClassName,
  contentClassName,
  align = "end",
}: NotificationBellProps) {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const {
    inAppEnabled,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllRead,
  } = useNotificationCenter(50, { realtime: true });

  if (!user) return null;

  const notificationCenterTarget = role === "admin"
    ? "/admin/notifications"
    : role === "restaurateur"
      ? "/dashboard/support"
      : role === "courier"
        ? "/courier/jobs"
        : "/notifications";

  const openNotification = (notification: TokNotification) => {
    const target = getNotificationTarget(notification, role, "/notifications");
    void markNotificationRead(notification.id);
    navigate(target);
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ""}`}
          className={cn("relative rounded-full bg-background/85 shadow-sm backdrop-blur hover:bg-background", className, buttonClassName)}
        >
          <Bell className="h-5 w-5" />
          <span className="sr-only">Notifications</span>
          {unreadCount > 0 ? (
            <Badge className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] text-white hover:bg-red-600">
              {formatNotificationCount(unreadCount)}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn("w-[min(360px,calc(100vw-2rem))] p-0", contentClassName)}>
        <div className="flex items-start justify-between gap-3 border-b px-3 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} alerte${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}` : "Aucune alerte non lue"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            disabled={!inAppEnabled || unreadCount === 0}
            onClick={() => void markAllRead()}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Tout lu
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {!inAppEnabled ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              Le canal in-app est désactivé dans vos préférences.
            </div>
          ) : notifications.length > 0 ? (
            notifications.slice(0, 8).map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                onSelect={(event) => {
                  event.preventDefault();
                  openNotification(notification);
                }}
                className={cn(
                  "cursor-pointer items-start rounded-none border-l-2 px-3 py-2",
                  notification.read_at ? "border-l-transparent" : "border-l-red-500 bg-red-50/60 dark:bg-red-950/15",
                )}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="break-words text-sm font-semibold leading-5">{notification.title}</span>
                    {!notification.read_at ? (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Nouveau</span>
                    ) : null}
                  </div>
                  <p className="break-words text-xs leading-5 text-muted-foreground">{notification.body}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(notification.created_at)}</p>
                </div>
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-3 py-4 text-xs text-muted-foreground">Aucune notification.</div>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            navigate(notificationCenterTarget);
          }}
          className="cursor-pointer px-3 py-2 text-sm"
        >
          Ouvrir le centre de notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationBell;
