import { formatNotificationCount } from "@/lib/notificationRouting";
import { cn } from "@/lib/utils";

type DayNotificationBadgeProps = {
  count: number;
  label: string;
  className?: string;
};

export default function DayNotificationBadge({ count, label, className }: DayNotificationBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      aria-label={`${count} ${label} non lue${count > 1 ? "s" : ""} sur cette journée`}
      title={`${count} ${label} non lue${count > 1 ? "s" : ""}`}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-background",
        className,
      )}
    >
      {formatNotificationCount(count)}
    </span>
  );
}
