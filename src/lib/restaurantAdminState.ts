export type RestaurantOperationalStatus =
  | "active"
  | "pending"
  | "paused"
  | "suspended"
  | "archived";

export const RESTAURANT_OPERATIONAL_STATUS_OPTIONS: Array<{
  value: RestaurantOperationalStatus;
  label: string;
}> = [
  { value: "active", label: "En ligne" },
  { value: "pending", label: "En attente" },
  { value: "paused", label: "En pause" },
  { value: "suspended", label: "Suspendu" },
  { value: "archived", label: "Archivé" },
];

export function normalizeRestaurantOperationalStatus(value: unknown): RestaurantOperationalStatus {
  const normalized = String(value || "").trim().toLowerCase();
  return RESTAURANT_OPERATIONAL_STATUS_OPTIONS.some((option) => option.value === normalized)
    ? normalized as RestaurantOperationalStatus
    : "pending";
}

export function getRestaurantOperationalStatePatch(value: unknown) {
  const status = normalizeRestaurantOperationalStatus(value);
  return {
    status,
    is_active: status === "active",
  } as const;
}

export function getRestaurantOperationalStatusLabel(value: unknown) {
  const status = normalizeRestaurantOperationalStatus(value);
  return RESTAURANT_OPERATIONAL_STATUS_OPTIONS.find((option) => option.value === status)?.label
    ?? "En attente";
}

export function isRestaurantOperationallyActive(input: {
  status?: string | null;
  is_active?: boolean | null;
}) {
  return input.is_active === true
    && normalizeRestaurantOperationalStatus(input.status) === "active";
}
