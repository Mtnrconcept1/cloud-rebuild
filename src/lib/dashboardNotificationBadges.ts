import type { TokNotification } from "@/hooks/useNotificationCenter";

type DashboardNotificationKind = "order" | "reservation";

type CountUnreadOperationNotificationsByDateInput<T> = {
  notifications: readonly TokNotification[];
  items: readonly T[];
  kind: DashboardNotificationKind;
  getItemId: (item: T) => string;
  getDateKey: (item: T) => string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const candidate = asString(value);
    if (candidate) return candidate;
  }

  return null;
}

function getNotificationOperationId(notification: TokNotification, kind: DashboardNotificationKind) {
  const data = asRecord(notification.data);

  if (kind === "order") {
    const directOrderId = firstString(data.order_id, data.orderId);
    if (directOrderId) return directOrderId;
  }

  if (kind === "reservation") {
    const directReservationId = firstString(data.reservation_id, data.reservationId);
    if (directReservationId) return directReservationId;
  }

  const entityType = firstString(data.entity_type, data.target_entity_type, data.resource_type);
  if (!entityType || !entityType.toLowerCase().includes(kind)) return null;

  return firstString(data.entity_id, data.target_entity_id, data.resource_id);
}

export function countUnreadOperationNotificationsByDate<T>({
  notifications,
  items,
  kind,
  getItemId,
  getDateKey,
}: CountUnreadOperationNotificationsByDateInput<T>) {
  const dateByItemId = new Map(items.map((item) => [getItemId(item), getDateKey(item)]));
  const operationIdsByDate = new Map<string, Set<string>>();

  notifications.forEach((notification) => {
    if (notification.read_at) return;

    const operationId = getNotificationOperationId(notification, kind);
    if (!operationId) return;

    const dateKey = dateByItemId.get(operationId);
    if (!dateKey) return;

    const operationIds = operationIdsByDate.get(dateKey) || new Set<string>();
    operationIds.add(operationId);
    operationIdsByDate.set(dateKey, operationIds);
  });

  return new Map(Array.from(operationIdsByDate.entries()).map(([dateKey, operationIds]) => [dateKey, operationIds.size]));
}
