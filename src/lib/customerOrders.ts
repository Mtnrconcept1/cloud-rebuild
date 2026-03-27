import {
  isAntiWasteDashboardOrder,
  isFlashSaleDashboardOrder,
} from "@/lib/dashboardInbox";

export const CUSTOMER_ORDERS_VIEWS = {
  all: "all",
  antiWaste: "anti-gaspi",
  flash: "flash",
} as const;

export type CustomerOrdersView =
  typeof CUSTOMER_ORDERS_VIEWS[keyof typeof CUSTOMER_ORDERS_VIEWS];

type OrderLike = {
  id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function normalizeCustomerOrdersView(value: string | null | undefined): CustomerOrdersView {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === CUSTOMER_ORDERS_VIEWS.antiWaste) return CUSTOMER_ORDERS_VIEWS.antiWaste;
  if (normalized === CUSTOMER_ORDERS_VIEWS.flash) return CUSTOMER_ORDERS_VIEWS.flash;
  return CUSTOMER_ORDERS_VIEWS.all;
}

export function getCustomerOrdersViewForOrder(order: OrderLike): CustomerOrdersView {
  if (isAntiWasteDashboardOrder(order)) return CUSTOMER_ORDERS_VIEWS.antiWaste;
  if (isFlashSaleDashboardOrder(order)) return CUSTOMER_ORDERS_VIEWS.flash;
  return CUSTOMER_ORDERS_VIEWS.all;
}

export function matchesCustomerOrdersView(order: OrderLike, view: CustomerOrdersView) {
  if (view === CUSTOMER_ORDERS_VIEWS.all) return true;
  return getCustomerOrdersViewForOrder(order) === view;
}

export function getCustomerOrdersViewMeta(view: CustomerOrdersView) {
  switch (view) {
    case CUSTOMER_ORDERS_VIEWS.antiWaste:
      return {
        title: "Mes commandes anti-gaspi",
        description: "Retrouvez vos derniers retraits anti-gaspi avec le detail complet de chaque commande.",
        emptyLabel: "Aucune commande anti-gaspi pour le moment.",
      };
    case CUSTOMER_ORDERS_VIEWS.flash:
      return {
        title: "Mes commandes flash",
        description: "Retrouvez vos derniers achats flash avec le detail complet de chaque commande.",
        emptyLabel: "Aucune commande flash pour le moment.",
      };
    default:
      return {
        title: "Mes commandes",
        description: "Consultez l'historique detaille de vos dernieres commandes client.",
        emptyLabel: "Aucune commande pour le moment.",
      };
  }
}

export function buildCustomerOrdersHref(options?: {
  view?: CustomerOrdersView | null;
  focusOrderId?: string | null;
}) {
  const params = new URLSearchParams();
  const view = options?.view && options.view !== CUSTOMER_ORDERS_VIEWS.all ? options.view : null;
  const focusOrderId = options?.focusOrderId ? String(options.focusOrderId) : null;

  if (view) params.set("view", view);
  if (focusOrderId) params.set("focusOrderId", focusOrderId);

  const query = params.toString();
  return query ? `/commandes?${query}` : "/commandes";
}

export function formatCustomerOrderPickupSchedule(metadata: Record<string, unknown> | null | undefined) {
  const safeMetadata = metadata || {};
  const pickupDate = typeof safeMetadata.available_date === "string"
    ? safeMetadata.available_date
    : typeof safeMetadata.sale_date === "string"
      ? safeMetadata.sale_date
      : typeof safeMetadata.pickup_date === "string"
        ? safeMetadata.pickup_date
        : "";
  const pickupStart = typeof safeMetadata.pickup_start === "string"
    ? safeMetadata.pickup_start
    : typeof safeMetadata.sale_start === "string"
      ? safeMetadata.sale_start
      : typeof safeMetadata.pickup_time === "string"
        ? safeMetadata.pickup_time
        : "";
  const pickupEnd = typeof safeMetadata.pickup_end === "string"
    ? safeMetadata.pickup_end
    : typeof safeMetadata.sale_end === "string"
      ? safeMetadata.sale_end
      : typeof safeMetadata.pickup_time_end === "string"
        ? safeMetadata.pickup_time_end
        : "";

  const parts: string[] = [];
  if (pickupDate) {
    const parsed = new Date(`${pickupDate}T12:00:00`);
    parts.push(
      Number.isNaN(parsed.getTime())
        ? pickupDate
        : parsed.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
    );
  }
  if (pickupStart || pickupEnd) {
    parts.push(pickupEnd ? `${pickupStart || "--:--"} - ${pickupEnd}` : pickupStart);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
