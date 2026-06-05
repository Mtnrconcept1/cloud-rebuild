import { normalizeInternalNavigationTarget } from "@/lib/navigation";

export type NotificationRole = "client" | "restaurateur" | "admin" | "courier" | string | null | undefined;

export type RoutableNotification = {
  type?: string | null;
  category?: string | null;
  data?: Record<string, unknown> | null;
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

function pathnameOf(target: string) {
  try {
    return new URL(target, window.location.origin).pathname;
  } catch {
    return target.split("?")[0].split("#")[0] || "/";
  }
}

export function getNotificationTarget(notification: RoutableNotification, role: NotificationRole, fallback = "/notifications") {
  const data = asRecord(notification.data);
  const explicitTarget = firstString(data.url, data.deepLink, data.deep_link, data.action_url, data.target_url, data.link);
  if (explicitTarget) return normalizeInternalNavigationTarget(explicitTarget, fallback);

  const supportIncidentId = firstString(data.support_incident_id, data.incident_id, data.ticket_id);
  const aiSupportTicketId = firstString(data.ai_support_ticket_id, data.support_ticket_id);
  if (supportIncidentId || aiSupportTicketId) {
    if (role === "admin") {
      const id = supportIncidentId ? `incident=${encodeURIComponent(supportIncidentId)}` : `ticket=${encodeURIComponent(aiSupportTicketId!)}`;
      return `/admin/sinistres?${id}`;
    }
    if (role === "restaurateur") return "/dashboard/support";
    return fallback;
  }

  const orderId = firstString(data.order_id, data.orderId);
  if (orderId) {
    if (role === "admin") return `/admin/commandes-reservations?tab=orders&operation=${encodeURIComponent(orderId)}`;
    if (role === "restaurateur") return `/dashboard/commandes?order=${encodeURIComponent(orderId)}`;
    if (role === "courier") return `/courier/jobs?order=${encodeURIComponent(orderId)}`;
    return `/commande/${encodeURIComponent(orderId)}`;
  }

  const reservationId = firstString(data.reservation_id, data.reservationId);
  if (reservationId) {
    if (role === "admin") return `/admin/commandes-reservations?tab=reservations&operation=${encodeURIComponent(reservationId)}`;
    if (role === "restaurateur") return `/dashboard/reservations?reservation=${encodeURIComponent(reservationId)}`;
    return `/reservations?reservation=${encodeURIComponent(reservationId)}`;
  }

  const dispatchJobId = firstString(data.dispatch_job_id, data.dispatchJobId, data.job_id, data.mission_id);
  if (dispatchJobId || notification.type === "courier_job" || notification.type === "dispatch") {
    return `/courier/jobs${dispatchJobId ? `?job=${encodeURIComponent(dispatchJobId)}` : ""}`;
  }

  const entityType = firstString(data.entity_type, data.target_entity_type, data.resource_type);
  if (entityType) {
    const normalizedEntityType = entityType.toLowerCase();
    if (normalizedEntityType.includes("order")) return role === "admin" ? "/admin/commandes-reservations?tab=orders" : "/commandes";
    if (normalizedEntityType.includes("reservation")) return role === "admin" ? "/admin/commandes-reservations?tab=reservations" : "/reservations";
    if (normalizedEntityType.includes("support") || normalizedEntityType.includes("incident")) return role === "admin" ? "/admin/sinistres" : "/dashboard/support";
    if (normalizedEntityType.includes("audit") || normalizedEntityType.includes("security")) return "/admin/audit";
    if (normalizedEntityType.includes("campaign") || normalizedEntityType.includes("notification")) return "/admin/notifications";
  }

  if (role === "admin") return "/admin/notifications";
  if (role === "restaurateur") return "/dashboard/support";
  if (role === "courier") return "/courier/jobs";

  return fallback;
}

export function getNotificationBadgeCountForRoute(
  notifications: RoutableNotification[],
  route: string,
  role: NotificationRole,
) {
  const routePathname = pathnameOf(route);

  return notifications.filter((notification) => {
    const target = getNotificationTarget(notification, role, "/notifications");
    const targetPathname = pathnameOf(target);

    if (routePathname === "/admin") return targetPathname === "/admin";
    if (routePathname === "/dashboard") return targetPathname === "/dashboard";
    if (routePathname === "/courier") return targetPathname === "/courier";
    if (routePathname === "/commandes") return targetPathname === "/commandes" || targetPathname.startsWith("/commande/");
    if (routePathname === "/admin/commandes-reservations") return targetPathname === "/admin/commandes-reservations";

    return targetPathname === routePathname || targetPathname.startsWith(`${routePathname}/`);
  }).length;
}

export function formatNotificationCount(count: number) {
  return count > 99 ? "99+" : String(count);
}
