export const DASHBOARD_INBOX_PATHS = {
  orders: "/dashboard/commandes",
  antiWasteOrders: "/dashboard/commandes-anti-gaspi",
  flashSaleOrders: "/dashboard/commandes-ventes-flash",
  reservations: "/dashboard/reservations",
} as const;

export type DashboardInboxPath =
  typeof DASHBOARD_INBOX_PATHS[keyof typeof DASHBOARD_INBOX_PATHS];

export type DashboardOrdersView = "standard" | "anti_waste" | "flash_sale";

type OrderLike = {
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CreatedAtLike = {
  created_at?: string | null;
};

const STORAGE_PREFIX = "miamz-dashboard-inbox-seen-v1";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBooleanFlag(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeFeature(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function getOrderMetadata(order: OrderLike) {
  return isRecord(order.metadata) ? order.metadata : {};
}

export function isAntiWasteDashboardOrder(order: OrderLike) {
  const metadata = getOrderMetadata(order);
  const feature = normalizeFeature(metadata.feature);

  return (
    toBooleanFlag(metadata.has_anti_gaspi) ||
    toBooleanFlag(metadata.is_anti_waste) ||
    feature === "anti-gaspi" ||
    feature === "anti_gaspi"
  );
}

export function isFlashSaleDashboardOrder(order: OrderLike) {
  const metadata = getOrderMetadata(order);
  const feature = normalizeFeature(metadata.feature);

  return (
    toBooleanFlag(metadata.has_flash_sale) ||
    toBooleanFlag(metadata.is_flash_sale) ||
    feature === "vente-flash" ||
    feature === "vente_flash" ||
    feature === "flash-sale" ||
    feature === "flash_sale"
  );
}

export function isStandardDashboardOrder(order: OrderLike) {
  return !isAntiWasteDashboardOrder(order) && !isFlashSaleDashboardOrder(order);
}

export function getDashboardOrdersViewFromPath(pathname: string): DashboardOrdersView {
  if (pathname === DASHBOARD_INBOX_PATHS.antiWasteOrders) return "anti_waste";
  if (pathname === DASHBOARD_INBOX_PATHS.flashSaleOrders) return "flash_sale";
  return "standard";
}

export function getDashboardOrdersViewMeta(view: DashboardOrdersView) {
  switch (view) {
    case "anti_waste":
      return {
        title: "Commandes anti-gaspi",
        emptyLabel: "Aucune commande anti-gaspi pour le moment.",
        orderBadge: "Anti-gaspi",
      };
    case "flash_sale":
      return {
        title: "Commandes vente flash",
        emptyLabel: "Aucune commande issue des ventes flash pour le moment.",
        orderBadge: "Vente flash",
      };
    default:
      return {
        title: "Commandes",
        emptyLabel: "Aucune commande classique pour le moment.",
        orderBadge: null,
      };
  }
}

function getStorageKey(restaurantId: string, path: DashboardInboxPath) {
  return `${STORAGE_PREFIX}:${restaurantId}:${path}`;
}

function toTimestamp(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getLatestCreatedAt<T extends CreatedAtLike>(entries: T[]) {
  return entries.reduce((latest, entry) => {
    const currentTime = toTimestamp(entry.created_at);
    return currentTime > toTimestamp(latest) ? entry.created_at || latest : latest;
  }, "");
}

export function readDashboardSeenAt(restaurantId: string, path: DashboardInboxPath) {
  if (typeof window === "undefined") return 0;

  try {
    const raw = window.localStorage.getItem(getStorageKey(restaurantId, path));
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function writeDashboardSeenAt(
  restaurantId: string,
  path: DashboardInboxPath,
  latestCreatedAt?: string | null,
) {
  if (typeof window === "undefined") return;

  const nextSeenAt = toTimestamp(latestCreatedAt) || Date.now();
  const currentSeenAt = readDashboardSeenAt(restaurantId, path);

  try {
    window.localStorage.setItem(
      getStorageKey(restaurantId, path),
      String(Math.max(currentSeenAt, nextSeenAt)),
    );
  } catch {
    // Ignore localStorage failures.
  }
}

export function countUnreadEntries<T extends CreatedAtLike>(entries: T[], seenAt: number) {
  return entries.reduce((count, entry) => (
    toTimestamp(entry.created_at) > seenAt ? count + 1 : count
  ), 0);
}
