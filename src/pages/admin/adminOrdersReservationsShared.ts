import type { Database, Json } from "@/integrations/supabase/types";
import {
  classifyDashboardOrderType,
  getDashboardOrderTypeMeta,
  type DashboardOrderType,
} from "@/lib/dashboardOrderTypes";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type AdminHistoryTab = "orders" | "reservations";

export type AdminRestaurantOption = {
  id: string;
  name: string;
};

export type AdminCustomerSummary = {
  userId: string;
  fullName: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  displayName: string;
};

export type AdminRestaurantSummary = {
  id: string;
  name: string;
};

export type AdminOrderItemModifier = {
  name: string;
  quantity: number;
  unitPrice: number;
};

export type AdminOrderItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers: AdminOrderItemModifier[];
};

export type AdminOrderHistoryItem = {
  kind: "order";
  id: string;
  orderNumber: string | null;
  createdAt: string;
  status: string;
  paymentStatus: string | null;
  totalAmount: number;
  deliveryAddress: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  restaurant: AdminRestaurantSummary;
  customer: AdminCustomerSummary;
  items: AdminOrderItem[];
  orderType: DashboardOrderType;
};

export type AdminReservationPreorderItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type AdminReservationHistoryItem = {
  kind: "reservation";
  id: string;
  reference: string;
  createdAt: string;
  reservationDate: string;
  displayTime: string;
  reservationTime: string | null;
  status: string;
  feature: string | null;
  totalAmount: number;
  partySize: number;
  notes: string | null;
  specialRequests: string | null;
  orderReference: string | null;
  paymentMethod: string | null;
  billingFeeChf: number;
  metadata: Record<string, unknown> | null;
  preorderItems: AdminReservationPreorderItem[];
  restaurant: AdminRestaurantSummary;
  customer: AdminCustomerSummary;
};

type RawProfileLike = {
  user_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
};

type RawRestaurantLike = {
  id?: string | null;
  name?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function toAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeSearchValue(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildCustomerSummary(raw: RawProfileLike | null | undefined, userId: string) {
  const fullName = readString(raw?.full_name);
  const phone = readString(raw?.phone);
  const city = readString(raw?.city);
  const address = readString(raw?.address);

  return {
    userId,
    fullName,
    phone,
    city,
    address,
    displayName: fullName || phone || `Client ${userId.slice(0, 8)}`,
  } satisfies AdminCustomerSummary;
}

function buildRestaurantSummary(raw: RawRestaurantLike | null | undefined, fallbackId: string) {
  return {
    id: readString(raw?.id) || fallbackId,
    name: readString(raw?.name) || "Restaurant inconnu",
  } satisfies AdminRestaurantSummary;
}

function readJsonArray(value: Json | unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeOrderItem(raw: Record<string, unknown>): AdminOrderItem {
  const metadata = asRecord(raw.metadata);
  const menuItem = firstRelation(asRecord(raw.menu_items) as RawRestaurantLike | RawRestaurantLike[] | null);
  const antiWasteOffer = firstRelation(asRecord(raw.anti_waste_offers) as { title?: string | null } | { title?: string | null }[] | null);
  const modifiers = asArray<Record<string, unknown>>(raw.order_item_modifiers).map((modifier) => ({
    name: readString(modifier.name) || "Option",
    quantity: Math.max(1, toAmount(modifier.quantity) || 1),
    unitPrice: toAmount(modifier.unit_price),
  }));

  return {
    id: readString(raw.id) || crypto.randomUUID(),
    name: readString(
      metadata?.name,
      metadata?.title,
      metadata?.dish,
      metadata?.item_name,
      menuItem?.name,
      antiWasteOffer?.title,
    ) || "Article",
    quantity: Math.max(1, toAmount(raw.quantity) || 1),
    unitPrice: toAmount(raw.unit_price),
    totalPrice: toAmount(raw.total_price),
    modifiers,
  };
}

function normalizeReservationPreorderItem(raw: Record<string, unknown>): AdminReservationPreorderItem {
  const quantity = Math.max(1, toAmount(raw.quantity) || 1);
  const unitPrice = toAmount(raw.unit_price ?? raw.price);
  const totalPrice = toAmount(raw.total_price) || unitPrice * quantity;

  return {
    name: readString(raw.name, raw.dish, raw.title) || "Article",
    quantity,
    unitPrice,
    totalPrice,
  };
}

export function getReservationFeaturePresentation(feature: string | null | undefined) {
  const normalized = String(feature || "").trim().toLowerCase();

  switch (normalized) {
    case "zero-attente":
      return { label: "Zero attente", className: "border-cyan-200 bg-cyan-100 text-cyan-800" };
    case "chefs_table":
      return { label: "La Table du Chef", className: "border-violet-200 bg-violet-100 text-violet-800" };
    case "promo-formule":
      return { label: "Formule promo", className: "border-emerald-200 bg-emerald-100 text-emerald-800" };
    case "promo-offre":
      return { label: "Offre promo", className: "border-emerald-200 bg-emerald-100 text-emerald-800" };
    default:
      return null;
  }
}

export function getOrderTypePresentation(orderType: DashboardOrderType) {
  const meta = getDashboardOrderTypeMeta(orderType);
  return {
    label: meta.badgeLabel || meta.label,
    className: meta.badgeClassName || "border-border bg-muted text-foreground",
  };
}

export function getDefaultAdminHistoryFilters(now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 29);

  const toDateInputValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  };
}

export function normalizeOrderHistoryRow(raw: Record<string, unknown>) {
  const restaurant = firstRelation(asRecord(raw.restaurants) as RawRestaurantLike | RawRestaurantLike[] | null);
  const customer = firstRelation(asRecord(raw.customer) as RawProfileLike | RawProfileLike[] | null);
  const metadata = asRecord(raw.metadata);
  const userId = readString(raw.user_id) || "unknown";

  return {
    kind: "order",
    id: readString(raw.id) || "",
    orderNumber: readString(raw.order_number),
    createdAt: readString(raw.created_at) || "",
    status: readString(raw.status) || "pending",
    paymentStatus: readString(raw.payment_status),
    totalAmount: toAmount(raw.total_amount),
    deliveryAddress: readString(raw.delivery_address),
    notes: readString(raw.notes),
    metadata,
    restaurant: buildRestaurantSummary(restaurant, readString(raw.restaurant_id) || ""),
    customer: buildCustomerSummary(customer, userId),
    items: asArray<Record<string, unknown>>(raw.order_items).map(normalizeOrderItem),
    orderType: classifyDashboardOrderType({ metadata }),
  } satisfies AdminOrderHistoryItem;
}

export function normalizeReservationHistoryRow(
  raw: Record<string, unknown>,
  profileMap: ReadonlyMap<string, ProfileRow>,
) {
  const restaurant = firstRelation(asRecord(raw.restaurants) as RawRestaurantLike | RawRestaurantLike[] | null);
  const metadata = asRecord(raw.metadata);
  const userId = readString(raw.user_id) || "unknown";
  const profile = profileMap.get(userId);
  const preorderFromColumn = readJsonArray(raw.preorder_items);
  const preorderFromMetadata = metadata ? readJsonArray(metadata.preorder_items ?? metadata.drops) : [];
  const preorderItemsSource = preorderFromColumn.length > 0 ? preorderFromColumn : preorderFromMetadata;

  return {
    kind: "reservation",
    id: readString(raw.id) || "",
    reference: readString(raw.order_reference) || `RES-${String(raw.id || "").slice(0, 8)}`,
    createdAt: readString(raw.created_at) || "",
    reservationDate: readString(raw.date) || "",
    displayTime: readString(
      metadata?.arrival_time,
      metadata?.arrivalTime,
      raw.reservation_time,
      raw.time,
    ) || "00:00",
    reservationTime: readString(raw.reservation_time),
    status: readString(raw.status) || "pending",
    feature: readString(raw.feature),
    totalAmount: toAmount(raw.total_amount),
    partySize: Math.max(1, toAmount(raw.party_size) || 1),
    notes: readString(raw.notes),
    specialRequests: readString(raw.special_requests),
    orderReference: readString(raw.order_reference),
    paymentMethod: readString(raw.payment_method),
    billingFeeChf: toAmount(raw.billing_fee_chf),
    metadata,
    preorderItems: preorderItemsSource
      .filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
      .map((item) => normalizeReservationPreorderItem(item)),
    restaurant: buildRestaurantSummary(restaurant, readString(raw.restaurant_id) || ""),
    customer: buildCustomerSummary(profile || null, userId),
  } satisfies AdminReservationHistoryItem;
}

export function orderMatchesSearchTerm(order: AdminOrderHistoryItem, searchTerm: string) {
  const normalizedSearch = normalizeSearchValue(searchTerm);
  if (!normalizedSearch) return true;

  const haystack = normalizeSearchValue([
    order.id,
    order.orderNumber,
    order.customer.displayName,
    order.customer.fullName,
    order.customer.phone,
    order.customer.address,
    order.customer.city,
    order.restaurant.name,
    order.deliveryAddress,
    order.notes,
    order.status,
    order.paymentStatus,
    ...order.items.map((item) => item.name),
    ...order.items.flatMap((item) => item.modifiers.map((modifier) => modifier.name)),
  ].join(" "));

  return haystack.includes(normalizedSearch);
}

export function reservationMatchesSearchTerm(reservation: AdminReservationHistoryItem, searchTerm: string) {
  const normalizedSearch = normalizeSearchValue(searchTerm);
  if (!normalizedSearch) return true;

  const haystack = normalizeSearchValue([
    reservation.id,
    reservation.reference,
    reservation.orderReference,
    reservation.customer.displayName,
    reservation.customer.fullName,
    reservation.customer.phone,
    reservation.customer.address,
    reservation.customer.city,
    reservation.restaurant.name,
    reservation.notes,
    reservation.specialRequests,
    reservation.status,
    reservation.feature,
    ...reservation.preorderItems.map((item) => item.name),
  ].join(" "));

  return haystack.includes(normalizedSearch);
}

export function getUniqueCustomerCount(items: ReadonlyArray<{ customer: AdminCustomerSummary }>) {
  return new Set(items.map((item) => item.customer.userId)).size;
}

export function getUniqueRestaurantCount(items: ReadonlyArray<{ restaurant: AdminRestaurantSummary }>) {
  return new Set(items.map((item) => item.restaurant.id)).size;
}
