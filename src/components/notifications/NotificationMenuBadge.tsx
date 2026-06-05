import { useMemo } from "react";

import type { TokNotification } from "@/hooks/useNotificationCenter";
import { useAuth } from "@/lib/auth-context";
import { formatNotificationCount, getNotificationBadgeCountForRoute, type NotificationRole } from "@/lib/notificationRouting";
import { cn } from "@/lib/utils";

type NotificationMenuBadgeProps = {
  route: string;
  unreadNotifications: TokNotification[];
  role?: NotificationRole;
  className?: string;
};

export function NotificationMenuBadge({ route, unreadNotifications, role: providedRole, className }: NotificationMenuBadgeProps) {
  const { role: activeRole } = useAuth();
  const role = providedRole ?? activeRole;
  const count = useMemo(
    () => getNotificationBadgeCountForRoute(unreadNotifications, route, role),
    [role, route, unreadNotifications],
  );

  if (count === 0) return null;

  return (
    <span
      aria-label={`${count} notification${count > 1 ? "s" : ""} non lue${count > 1 ? "s" : ""}`}
      className={cn(
        "ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm",
        className,
      )}
    >
      {formatNotificationCount(count)}
    </span>
  );
}

export default NotificationMenuBadge;
