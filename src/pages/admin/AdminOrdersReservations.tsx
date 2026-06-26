import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  RotateCcw,
  Search,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";

import AdminOperationDetailSheet from "@/components/admin/AdminOperationDetailSheet";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import SortControls from "@/components/list/SortControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { summarizeDispatchHealth, type DispatchHealthRow } from "@/lib/dispatchHealth";
import { summarizeReservationInventoryHealth, type ReservationInventoryRow } from "@/lib/reservationInventoryHealth";
import { sortByColumn, type SortColumn, type SortDirection } from "@/lib/listSorting";
import { cn } from "@/lib/utils";
import {
  fetchAdminRefundQueue,
  markRefundApplied,
  processRefund,
  toAmount,
  type RefundQueueItem,
} from "@/lib/refundMutations";
import {
  getDefaultAdminHistoryFilters,
  getOrderTypePresentation,
  getReservationFeaturePresentation,
  getUniqueCustomerCount,
  getUniqueRestaurantCount,
  normalizeOrderHistoryRow,
  normalizeReservationHistoryRow,
  orderMatchesSearchTerm,
  reservationMatchesSearchTerm,
  type AdminHistoryTab,
  type AdminOrderHistoryItem,
  type AdminReservationHistoryItem,
  type AdminRestaurantOption,
} from "./adminOrdersReservationsShared";

const supabase = getSupabase();

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type AdminDashboardTab = AdminHistoryTab | "refunds";
type AdminHistorySortKey = "date" | "reference" | "customer" | "restaurant" | "amount" | "status";

const ADMIN_HISTORY_PAGE_SIZE = 250;
const ADMIN_RESTAURANT_OPTIONS_LIMIT = 500;
const RESERVATION_INVENTORY_HEALTH_LIMIT = 500;

function formatAmount(value: number) {
  return `${value.toFixed(2)} CHF`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReservationDate(dateValue: string, timeValue: string) {
  const date = new Date(`${dateValue}T${timeValue || "00:00:00"}`);
  if (Number.isNaN(date.getTime())) {
    return `${dateValue} ${timeValue}`.trim();
  }

  return date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadgeClass(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLowerCase();

  if (["paid", "delivered", "completed", "confirmed"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (["cancelled", "canceled", "failed", "no_show", "refunded"].includes(normalized)) {
    return "bg-red-100 text-red-800";
  }

  if (["pending", "awaiting_payment", "processing"].includes(normalized)) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-slate-100 text-slate-700";
}

type HistoryStatusTone = "paid" | "pending" | "cancelled" | "problem";

type HistoryStatusPresentation = {
  label: string;
  mobileRowClassName: string;
  desktopRowClassName: string;
  badgeClassName: string;
  stripeClassName: string;
};

const HISTORY_STATUS_STYLES: Record<HistoryStatusTone, HistoryStatusPresentation> = {
  paid: {
    label: "Payée",
    mobileRowClassName: "border-emerald-200 bg-emerald-50/90 hover:bg-emerald-50",
    desktopRowClassName: "bg-emerald-50/35 hover:bg-emerald-50/70",
    badgeClassName: "border-emerald-200 bg-emerald-100 text-emerald-800",
    stripeClassName: "bg-emerald-500",
  },
  pending: {
    label: "En attente",
    mobileRowClassName: "border-amber-200 bg-amber-50/90 hover:bg-amber-50",
    desktopRowClassName: "bg-amber-50/35 hover:bg-amber-50/70",
    badgeClassName: "border-amber-200 bg-amber-100 text-amber-800",
    stripeClassName: "bg-amber-500",
  },
  cancelled: {
    label: "Annulée",
    mobileRowClassName: "border-red-200 bg-red-50/90 hover:bg-red-50",
    desktopRowClassName: "bg-red-50/35 hover:bg-red-50/70",
    badgeClassName: "border-red-200 bg-red-100 text-red-800",
    stripeClassName: "bg-red-500",
  },
  problem: {
    label: "À vérifier",
    mobileRowClassName: "border-orange-200 bg-orange-50/90 hover:bg-orange-50",
    desktopRowClassName: "bg-orange-50/35 hover:bg-orange-50/70",
    badgeClassName: "border-orange-200 bg-orange-100 text-orange-800",
    stripeClassName: "bg-orange-500",
  },
};

const PAID_STATUSES = new Set([
  "accepted",
  "applied",
  "complete",
  "completed",
  "confirmed",
  "delivered",
  "paid",
  "refunded",
  "succeeded",
  "success",
]);

const PENDING_STATUSES = new Set([
  "authorized",
  "created",
  "in_progress",
  "pending",
  "pending_payment",
  "processing",
  "requires_capture",
  "scheduled",
  "searching",
  "awaiting_payment",
]);

const CANCELLED_STATUSES = new Set([
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_restaurant",
  "canceled",
  "no_show",
  "rejected",
  "void",
  "voided",
]);

const PROBLEM_STATUSES = new Set([
  "blocked",
  "chargeback",
  "disputed",
  "error",
  "expired",
  "failed",
  "orphan",
  "past_due",
  "payment_failed",
  "refund_failed",
  "requires_action",
  "requires_payment_method",
  "unpaid",
  "unknown",
]);

function normalizeStatusValue(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function getHistoryStatusPresentation(
  status: string | null | undefined,
  paymentStatus?: string | null,
) {
  const statuses = [
    normalizeStatusValue(paymentStatus),
    normalizeStatusValue(status),
  ].filter(Boolean);

  if (statuses.some((candidate) => PROBLEM_STATUSES.has(candidate))) {
    return HISTORY_STATUS_STYLES.problem;
  }

  if (statuses.some((candidate) => CANCELLED_STATUSES.has(candidate))) {
    return HISTORY_STATUS_STYLES.cancelled;
  }

  if (statuses.some((candidate) => PENDING_STATUSES.has(candidate))) {
    return HISTORY_STATUS_STYLES.pending;
  }

  if (statuses.some((candidate) => PAID_STATUSES.has(candidate))) {
    return HISTORY_STATUS_STYLES.paid;
  }

  return HISTORY_STATUS_STYLES.problem;
}

function getOrderReference(order: Pick<AdminOrderHistoryItem, "id" | "orderNumber">) {
  return order.orderNumber || `CMD-${order.id.slice(0, 8)}`;
}

function getRefundReference(refund: RefundQueueItem) {
  return refund.reference || refund.target_id.slice(0, 8);
}

const ADMIN_ORDER_SORT_COLUMNS: SortColumn<AdminOrderHistoryItem, AdminHistorySortKey>[] = [
  { key: "date", label: "Date", type: "date", getValue: (order) => order.createdAt },
  { key: "reference", label: "Numero", type: "text", getValue: getOrderReference },
  { key: "customer", label: "Nom client", type: "text", getValue: (order) => order.customer.displayName },
  { key: "restaurant", label: "Restaurant", type: "text", getValue: (order) => order.restaurant.name },
  { key: "amount", label: "Montant", type: "number", getValue: (order) => order.totalAmount },
  { key: "status", label: "Statut", type: "text", getValue: (order) => order.status || order.paymentStatus || "" },
];

const ADMIN_RESERVATION_SORT_COLUMNS: SortColumn<AdminReservationHistoryItem, AdminHistorySortKey>[] = [
  { key: "date", label: "Date", type: "date", getValue: (reservation) => `${reservation.reservationDate}T${reservation.displayTime || "00:00"}` },
  { key: "reference", label: "Numero", type: "text", getValue: (reservation) => reservation.reference || reservation.id },
  { key: "customer", label: "Nom client", type: "text", getValue: (reservation) => reservation.customer.displayName },
  { key: "restaurant", label: "Restaurant", type: "text", getValue: (reservation) => reservation.restaurant.name },
  { key: "amount", label: "Montant", type: "number", getValue: (reservation) => reservation.totalAmount },
  { key: "status", label: "Statut", type: "text", getValue: (reservation) => reservation.status },
];

const ADMIN_REFUND_SORT_COLUMNS: SortColumn<RefundQueueItem, AdminHistorySortKey>[] = [
  { key: "date", label: "Date", type: "date", getValue: (refund) => String(refund.cancelled_at || refund.created_at || "") },
  { key: "reference", label: "Numero", type: "text", getValue: getRefundReference },
  { key: "customer", label: "Nom client", type: "text", getValue: (refund) => refund.customer_name || refund.customer_phone || "" },
  { key: "restaurant", label: "Restaurant", type: "text", getValue: (refund) => refund.restaurant_name || "" },
  { key: "amount", label: "Montant", type: "number", getValue: (refund) => toAmount(refund.remaining_amount_chf) },
  { key: "status", label: "Statut", type: "text", getValue: (refund) => refund.refund_status || refund.payment_status || "" },
];

const ADMIN_HISTORY_SORT_OPTIONS = ADMIN_ORDER_SORT_COLUMNS.map(({ key, label }) => ({ key, label }));

function getRefundMiamzPriorityLabel(refund: RefundQueueItem) {
  const score = Number(refund.miamz_priority_score || 0);
  if (!Number.isFinite(score) || score <= 0) return null;

  const priority = String(refund.miamz_priority || "").toLowerCase();
  if (priority === "urgent") return "Urgence Miamz";
  return "Priorite Miamz";
}

function EmptyMobileHistory({ children }: { children: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground md:hidden">
      {children}
    </div>
  );
}

function MobileHistoryRow({
  reference,
  date,
  customer,
  status,
  onClick,
}: {
  reference: string;
  date: string;
  customer: string;
  status: HistoryStatusPresentation;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative w-full overflow-hidden rounded-xl border px-4 py-3 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        status.mobileRowClassName,
      )}
      onClick={onClick}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", status.stripeClassName)} aria-hidden="true" />
      <div className="flex min-w-0 items-start justify-between gap-3 pl-2">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-semibold leading-snug text-foreground">{reference}</p>
          <p className="break-words text-xs text-muted-foreground">{date}</p>
          <p className="break-words text-sm leading-snug text-foreground">{customer}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge className={cn("border text-[11px] leading-none", status.badgeClassName)}>
            {status.label}
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
    </button>
  );
}

function toStartOfDayIso(dateValue: string) {
  return `${dateValue}T00:00:00`;
}

function toEndOfDayIso(dateValue: string) {
  return `${dateValue}T23:59:59.999`;
}

function MetricsCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof CalendarDays;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

async function fetchRestaurantOptions() {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name")
    .order("name")
    .limit(ADMIN_RESTAURANT_OPTIONS_LIMIT);

  if (error) throw error;

  return (data || []) as AdminRestaurantOption[];
}

async function fetchOrderHistory(
  restaurantId: string,
  startDate: string,
  endDate: string,
) {
  let query = (supabase as any)
    .from("orders")
    .select(`
      id,
      order_number,
      created_at,
      status,
      payment_status,
      total_amount,
      delivery_address,
      notes,
      metadata,
      restaurant_id,
      user_id,
      restaurants (
        id,
        name
      ),
      customer:profiles!orders_user_id_fkey_profiles (
        user_id,
        full_name,
        phone,
        city,
        address
      ),
      order_items (
        id,
        quantity,
        unit_price,
        total_price,
        metadata,
        menu_items (
          name
        ),
        anti_waste_offers (
          title
        ),
        order_item_modifiers (
          name,
          quantity,
          unit_price
        )
      )
    `)
    .order("created_at", { ascending: false })
    .range(0, ADMIN_HISTORY_PAGE_SIZE - 1);

  if (restaurantId !== "all") {
    query = query.eq("restaurant_id", restaurantId);
  }

  if (startDate) {
    query = query.gte("created_at", toStartOfDayIso(startDate));
  }

  if (endDate) {
    query = query.lte("created_at", toEndOfDayIso(endDate));
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as Record<string, unknown>[]).map(normalizeOrderHistoryRow);
}

async function fetchReservationHistory(
  restaurantId: string,
  startDate: string,
  endDate: string,
) {
  let query = (supabase as any)
    .from("reservations")
    .select(`
      id,
      created_at,
      date,
      time,
      reservation_time,
      status,
      feature,
      total_amount,
      party_size,
      notes,
      special_requests,
      order_reference,
      payment_method,
      billing_fee_chf,
      progressive_offer_id,
      progressive_offer_discount_percent,
      progressive_offer_discount_status,
      metadata,
      preorder_items,
      restaurant_id,
      user_id,
      restaurants (
        id,
        name
      )
    `)
    .order("date", { ascending: false })
    .order("time", { ascending: false })
    .range(0, ADMIN_HISTORY_PAGE_SIZE - 1);

  if (restaurantId !== "all") {
    query = query.eq("restaurant_id", restaurantId);
  }

  if (startDate) {
    query = query.gte("date", startDate);
  }

  if (endDate) {
    query = query.lte("date", endDate);
  }

  const { data, error } = await query;
  if (error) throw error;

  const reservationRows = (data || []) as Record<string, unknown>[];
  const userIds = Array.from(new Set(
    reservationRows
      .map((row) => String(row.user_id || "").trim())
      .filter(Boolean),
  ));

  let profileMap = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone, city, address, id, avatar_url, created_at, current_tier, loyalty_points, updated_at")
      .in("user_id", userIds);

    if (profilesError) throw profilesError;

    profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
  }

  return reservationRows.map((row) => normalizeReservationHistoryRow(row, profileMap));
}

async function fetchDispatchHealthRows() {
  const { data, error } = await (supabase as any)
    .from("dispatch_jobs")
    .select("id, status, created_at, courier_id")
    .not("status", "in", "(delivered,cancelled,canceled,completed)")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) throw error;
  return (data || []) as DispatchHealthRow[];
}

async function fetchReservationInventoryRows() {
  const { data, error } = await (supabase as any)
    .from("reservation_slots")
    .select(`
      reservation_id,
      table_id,
      reservations (
        id,
        restaurant_id,
        date,
        time,
        reservation_time,
        status
      )
    `)
    .limit(RESERVATION_INVENTORY_HEALTH_LIMIT);

  if (error) throw error;

  return ((data || []) as any[])
    .map((row): ReservationInventoryRow | null => {
      const reservation = Array.isArray(row.reservations) ? row.reservations[0] : row.reservations;
      if (!reservation?.id) return null;

      return {
        id: String(reservation.id),
        restaurant_id: reservation.restaurant_id ? String(reservation.restaurant_id) : null,
        date: reservation.date ? String(reservation.date) : null,
        time: reservation.time || reservation.reservation_time ? String(reservation.time || reservation.reservation_time) : null,
        table_id: row.table_id ? String(row.table_id) : null,
        status: reservation.status ? String(reservation.status) : null,
      };
    })
    .filter((row): row is ReservationInventoryRow => Boolean(row));
}

export default function AdminOrdersReservations() {
  const defaultFilters = useMemo(() => getDefaultAdminHistoryFilters(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminDashboardTab>("orders");
  const [search, setSearch] = useState("");
  const [restaurantFilter, setRestaurantFilter] = useState("all");
  const [startDate, setStartDate] = useState(defaultFilters.startDate);
  const [endDate, setEndDate] = useState(defaultFilters.endDate);
  const [sortKey, setSortKey] = useState<AdminHistorySortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedOperation, setSelectedOperation] = useState<
    | { kind: "order"; item: AdminOrderHistoryItem }
    | { kind: "reservation"; item: AdminReservationHistoryItem }
    | null
  >(null);
  const [selectedRefund, setSelectedRefund] = useState<RefundQueueItem | null>(null);

  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "orders" || tab === "reservations" || tab === "refunds") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const {
    data: restaurants = [],
    isLoading: isRestaurantsLoading,
    error: restaurantsError,
  } = useQuery({
    queryKey: ["admin-orders-reservations-restaurants"],
    queryFn: fetchRestaurantOptions,
  });

  const {
    data: orders = [],
    isLoading: isOrdersLoading,
    error: ordersError,
  } = useQuery({
    queryKey: ["admin-orders-history", restaurantFilter, startDate, endDate],
    queryFn: () => fetchOrderHistory(restaurantFilter, startDate, endDate),
  });

  const {
    data: reservations = [],
    isLoading: isReservationsLoading,
    error: reservationsError,
  } = useQuery({
    queryKey: ["admin-reservations-history", restaurantFilter, startDate, endDate],
    queryFn: () => fetchReservationHistory(restaurantFilter, startDate, endDate),
  });

  const {
    data: refundQueue = [],
    isLoading: isRefundQueueLoading,
    error: refundQueueError,
  } = useQuery({
    queryKey: ["admin-refund-queue"],
    queryFn: fetchAdminRefundQueue,
  });
  const { data: dispatchHealthRows = [] } = useQuery({
    queryKey: ["admin-dispatch-health-rows"],
    queryFn: fetchDispatchHealthRows,
  });
  const { data: reservationInventoryRows = [] } = useQuery({
    queryKey: ["admin-reservation-inventory-health-rows"],
    queryFn: fetchReservationInventoryRows,
  });

  useEffect(() => {
    setSelectedOperation(null);
    setSelectedRefund(null);
  }, [activeTab, restaurantFilter, startDate, endDate]);

  useEffect(() => {
    const operationId = searchParams.get("operation");
    if (!operationId) return;

    if (activeTab === "orders") {
      const order = orders.find((item) => item.id === operationId || item.orderNumber === operationId);
      if (order) setSelectedOperation({ kind: "order", item: order });
      return;
    }

    if (activeTab === "reservations") {
      const reservation = reservations.find((item) => item.id === operationId || item.reference === operationId);
      if (reservation) setSelectedOperation({ kind: "reservation", item: reservation });
    }
  }, [activeTab, orders, reservations, searchParams]);

  const clearOperationSearchParam = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("operation");
      return next;
    });
  };

  const filteredOrders = useMemo(() => (
    sortByColumn(
      orders.filter((order) => orderMatchesSearchTerm(order, deferredSearch)),
      ADMIN_ORDER_SORT_COLUMNS,
      { key: sortKey, direction: sortDirection },
    )
  ), [orders, deferredSearch, sortDirection, sortKey]);

  const filteredReservations = useMemo(() => (
    sortByColumn(
      reservations.filter((reservation) => reservationMatchesSearchTerm(reservation, deferredSearch)),
      ADMIN_RESERVATION_SORT_COLUMNS,
      { key: sortKey, direction: sortDirection },
    )
  ), [reservations, deferredSearch, sortDirection, sortKey]);

  const filteredRefunds = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    const matchedRefunds = refundQueue.filter((refund) => {
      if (restaurantFilter !== "all" && refund.restaurant_id !== restaurantFilter) {
        return false;
      }

      const effectiveDate = String(refund.cancelled_at || refund.created_at || "");
      if (startDate && effectiveDate && effectiveDate < toStartOfDayIso(startDate)) {
        return false;
      }
      if (endDate && effectiveDate && effectiveDate > toEndOfDayIso(endDate)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        refund.reference,
        refund.item_label,
        refund.restaurant_name,
        refund.customer_name,
        refund.customer_phone,
        refund.feature,
        refund.target_id,
        refund.payment_method,
        refund.miamz_priority,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return haystack.includes(normalizedSearch);
    });

    return sortByColumn(matchedRefunds, ADMIN_REFUND_SORT_COLUMNS, {
      key: sortKey,
      direction: sortDirection,
    });
  }, [deferredSearch, endDate, refundQueue, restaurantFilter, sortDirection, sortKey, startDate]);

  const currentMetrics = useMemo(() => {
    if (activeTab === "orders") {
      return {
        count: filteredOrders.length,
        totalAmount: filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0),
        customers: getUniqueCustomerCount(filteredOrders),
        restaurants: getUniqueRestaurantCount(filteredOrders),
      };
    }

    if (activeTab === "refunds") {
      return {
        count: filteredRefunds.length,
        totalAmount: filteredRefunds.reduce((sum, refund) => sum + toAmount(refund.remaining_amount_chf), 0),
        customers: new Set(filteredRefunds.map((refund) => refund.customer_user_id).filter(Boolean)).size,
        restaurants: new Set(filteredRefunds.map((refund) => refund.restaurant_id).filter(Boolean)).size,
      };
    }

    return {
      count: filteredReservations.length,
      totalAmount: filteredReservations.reduce((sum, reservation) => sum + reservation.totalAmount, 0),
      customers: getUniqueCustomerCount(filteredReservations),
      restaurants: getUniqueRestaurantCount(filteredReservations),
      covers: filteredReservations.reduce((sum, reservation) => sum + reservation.partySize, 0),
    };
  }, [activeTab, filteredOrders, filteredRefunds, filteredReservations]);
  const dispatchHealth = useMemo(
    () => summarizeDispatchHealth(dispatchHealthRows),
    [dispatchHealthRows],
  );
  const reservationInventoryHealth = useMemo(
    () => summarizeReservationInventoryHealth(reservationInventoryRows),
    [reservationInventoryRows],
  );
  const hasOperationalRisk = !dispatchHealth.healthy || !reservationInventoryHealth.healthy;

  const activeError = activeTab === "orders"
    ? ordersError
    : activeTab === "reservations"
      ? reservationsError
      : refundQueueError;
  const activeLoading = isRestaurantsLoading || (
    activeTab === "orders"
      ? isOrdersLoading
      : activeTab === "reservations"
        ? isReservationsLoading
        : isRefundQueueLoading
  );

  const refundStripeMutation = useMutation({
    mutationFn: async (refund: RefundQueueItem) => {
      const result = await processRefund({
        targetType: refund.target_type,
        targetId: refund.target_id,
        reason: refund.refund_reason || undefined,
        amountChf: toAmount(refund.remaining_amount_chf),
      });

      if (!result.ok) {
        throw new Error(result.errorMessage || "Remboursement impossible.");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-refund-queue"] });
      setSelectedRefund(null);
      toast({ title: "Remboursement lance", description: "Le remboursement Stripe a été enregistré." });
    },
    onError: (error: Error) => {
      toast({ title: "Remboursement impossible", description: error.message, variant: "destructive" });
    },
  });

  const refundMarkMutation = useMutation({
    mutationFn: async (refund: RefundQueueItem) => {
      const result = await markRefundApplied({
        targetType: refund.target_type,
        targetId: refund.target_id,
        amountChf: toAmount(refund.remaining_amount_chf),
        reason: refund.refund_reason || undefined,
      });

      if (!result.ok) {
        throw new Error(result.errorMessage || "Mise à jour impossible.");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-refund-queue"] });
      setSelectedRefund(null);
      toast({ title: "Remboursement marque", description: "La ligne a été marquée comme remboursée." });
    },
    onError: (error: Error) => {
      toast({ title: "Mise à jour impossible", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="container space-y-6 py-8">
      <DashboardPageHero
        badge="Operations admin"
        title="Commandes et Reservations"
        description="Historique admin des opérations clients, avec recherche par client, restaurant, référence et détails complets par opération."
        icon={ShoppingCart}
        tone="violet"
        visualLabel="Operations"
        stats={[
          { label: "Commandes", value: orders.length, icon: ShoppingCart },
          { label: "Reservations", value: reservations.length, icon: CalendarDays },
          { label: "Remboursements", value: refundQueue.length, icon: RotateCcw },
        ]}
      />

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_220px_180px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un client, un restaurant, une référence, une note ou un article"
                className="pl-9"
              />
            </div>

            <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Restaurant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les restaurants</SelectItem>
                {restaurants.map((restaurant) => (
                  <SelectItem key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />

            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => {
                setSearch("");
                setRestaurantFilter("all");
                setStartDate(defaultFilters.startDate);
                setEndDate(defaultFilters.endDate);
                setSortKey("date");
                setSortDirection("desc");
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Réinitialiser
            </Button>

            <SortControls
              columns={ADMIN_HISTORY_SORT_OPTIONS}
              sortKey={sortKey}
              direction={sortDirection}
              onSortKeyChange={setSortKey}
              onDirectionChange={setSortDirection}
              className="lg:col-span-5"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">Période par défaut: 30 derniers jours</Badge>
            <span>Efface les dates pour elargir la recherche.</span>
            {restaurantsError ? <span className="text-destructive">Impossible de charger les restaurants.</span> : null}
          </div>
        </CardContent>
      </Card>

      {hasOperationalRisk ? (
        <Card className="border-amber-200 bg-amber-50 text-amber-950">
          <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="space-y-1">
                <p className="font-semibold">Cockpit operations a surveiller</p>
                <p className="text-sm text-amber-900">
                  {dispatchHealth.searchingOverTenMinutes} dispatch sans coursier depuis plus de 10 min, {dispatchHealth.activeWithoutCourier} dispatch actif sans coursier, {reservationInventoryHealth.overbookedTables} conflit de table.
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="w-fit bg-white text-amber-900">
              {dispatchHealth.affectedIds.length + reservationInventoryHealth.conflicts.length} dossier(s)
            </Badge>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricsCard
          title="Resultats"
          value={String(currentMetrics.count)}
          description={activeTab === "orders"
            ? "Commandes visibles"
            : activeTab === "reservations"
              ? "Reservations visibles"
              : "Remboursements a traiter"}
          icon={activeTab === "orders" ? ShoppingCart : CalendarDays}
        />
        <MetricsCard
          title={activeTab === "orders"
            ? "Volume commandes"
            : activeTab === "reservations"
              ? "Montant réservations"
              : "Montant a rembourser"}
          value={formatAmount(currentMetrics.totalAmount)}
          description={activeTab === "orders"
            ? "Total du filtre courant"
            : activeTab === "reservations"
              ? "Montant total du filtre courant"
              : "Reste a rembourser sur le filtre courant"}
          icon={ShoppingCart}
        />
        <MetricsCard
          title="Clients"
          value={String(currentMetrics.customers)}
          description="Clients uniques sur le filtre courant"
          icon={Users}
        />
        <MetricsCard
          title={activeTab === "orders"
            ? "Restaurants"
            : activeTab === "reservations"
              ? "Restaurants / Couverts"
              : "Restaurants"}
          value={activeTab === "orders"
            ? String(currentMetrics.restaurants)
            : activeTab === "reservations"
              ? `${currentMetrics.restaurants} / ${currentMetrics.covers || 0}`
              : String(currentMetrics.restaurants)}
          description={activeTab === "orders"
            ? "Restaurants concernes"
            : activeTab === "reservations"
              ? "Restaurants et couverts visibles"
              : "Restaurants avec remboursement en attente"}
          icon={Store}
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AdminDashboardTab)}
        className="space-y-6"
      >
        <TabsList className="grid h-auto w-full max-w-xl grid-cols-3">
          <TabsTrigger value="orders" className="whitespace-normal px-2 text-xs leading-tight sm:text-sm">Commandes ({filteredOrders.length})</TabsTrigger>
          <TabsTrigger value="reservations" className="whitespace-normal px-2 text-xs leading-tight sm:text-sm">Reservations ({filteredReservations.length})</TabsTrigger>
          <TabsTrigger value="refunds" className="whitespace-normal px-2 text-xs leading-tight sm:text-sm">Remboursements ({filteredRefunds.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-6">
          <Card>
            <CardHeader className="gap-1">
              <CardTitle>Historique des commandes</CardTitle>
              <p className="text-sm text-muted-foreground md:hidden">
                Touchez une ligne pour ouvrir tous les détails de la commande.
              </p>
            </CardHeader>
            <CardContent className="py-0">
              {activeLoading ? (
                <div className="space-y-3 py-6">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              ) : activeError ? (
                <div className="py-10 text-center text-destructive">
                  Impossible de charger l&apos;historique des commandes.
                </div>
              ) : (
                <>
                  <div className="space-y-2 py-4 md:hidden">
                    {filteredOrders.map((order) => {
                      const status = getHistoryStatusPresentation(order.status, order.paymentStatus);
                      return (
                        <MobileHistoryRow
                          key={order.id}
                          reference={getOrderReference(order)}
                          date={formatDateTime(order.createdAt)}
                          customer={order.customer.displayName}
                          status={status}
                          onClick={() => setSelectedOperation({ kind: "order", item: order })}
                        />
                      );
                    })}

                    {filteredOrders.length === 0 ? (
                      <EmptyMobileHistory>
                        Aucune commande ne correspond au filtre courant.
                      </EmptyMobileHistory>
                    ) : null}
                  </div>

                  <div className="hidden md:block">
                    <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Commande</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Restaurant</TableHead>
                      <TableHead>Détails</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => {
                      const orderType = getOrderTypePresentation(order.orderType);
                      const status = getHistoryStatusPresentation(order.status, order.paymentStatus);
                      return (
                        <TableRow
                          key={order.id}
                          className={cn("cursor-pointer", status.desktopRowClassName)}
                          onClick={() => setSelectedOperation({ kind: "order", item: order })}
                        >
                          <TableCell data-label="Date" className="text-sm text-muted-foreground md:whitespace-nowrap">
                            {formatDateTime(order.createdAt)}
                          </TableCell>
                          <TableCell data-label="Commande">
                            <div className="space-y-1">
                              <p className="font-medium">{getOrderReference(order)}</p>
                              <p className="text-xs text-muted-foreground">{order.id}</p>
                            </div>
                          </TableCell>
                          <TableCell data-label="Client">
                            <div className="space-y-1">
                              <p className="font-medium">{order.customer.displayName}</p>
                              {order.customer.phone ? (
                                <p className="text-xs text-muted-foreground">{order.customer.phone}</p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell data-label="Restaurant" className="text-sm">{order.restaurant.name}</TableCell>
                          <TableCell data-label="Détails">
                            <div className="space-y-1">
                              <Badge className={orderType.className}>{orderType.label}</Badge>
                              <p className="text-xs text-muted-foreground">
                                {order.items.length} article{order.items.length > 1 ? "s" : ""}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell data-label="Statut">
                            <div className="flex flex-wrap gap-2">
                              <Badge className={getStatusBadgeClass(order.status)}>{order.status}</Badge>
                              {order.paymentStatus ? (
                                <Badge variant="secondary" className={getStatusBadgeClass(order.paymentStatus)}>
                                  {order.paymentStatus}
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell data-label="Montant" className="font-semibold md:text-right">{formatAmount(order.totalAmount)}</TableCell>
                          <TableCell data-label="Action" className="md:text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedOperation({ kind: "order", item: order });
                              }}
                            >
                              Voir
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          Aucune commande ne correspond au filtre courant.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reservations" className="space-y-6">
          <Card>
            <CardHeader className="gap-1">
              <CardTitle>Historique des réservations</CardTitle>
              <p className="text-sm text-muted-foreground md:hidden">
                Touchez une ligne pour ouvrir tous les détails de la réservation.
              </p>
            </CardHeader>
            <CardContent className="py-0">
              {activeLoading ? (
                <div className="space-y-3 py-6">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              ) : activeError ? (
                <div className="py-10 text-center text-destructive">
                  Impossible de charger l&apos;historique des réservations.
                </div>
              ) : (
                <>
                  <div className="space-y-2 py-4 md:hidden">
                    {filteredReservations.map((reservation) => {
                      const status = getHistoryStatusPresentation(reservation.status);
                      return (
                        <MobileHistoryRow
                          key={reservation.id}
                          reference={reservation.reference}
                          date={formatReservationDate(reservation.reservationDate, reservation.displayTime)}
                          customer={reservation.customer.displayName}
                          status={status}
                          onClick={() => setSelectedOperation({ kind: "reservation", item: reservation })}
                        />
                      );
                    })}

                    {filteredReservations.length === 0 ? (
                      <EmptyMobileHistory>
                        Aucune réservation ne correspond au filtre courant.
                      </EmptyMobileHistory>
                    ) : null}
                  </div>

                  <div className="hidden md:block">
                    <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reservation</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Restaurant</TableHead>
                      <TableHead>Détails</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReservations.map((reservation) => {
                      const feature = getReservationFeaturePresentation(reservation.feature);
                      const status = getHistoryStatusPresentation(reservation.status);
                      return (
                        <TableRow
                          key={reservation.id}
                          className={cn("cursor-pointer", status.desktopRowClassName)}
                          onClick={() => setSelectedOperation({ kind: "reservation", item: reservation })}
                        >
                          <TableCell data-label="Date" className="text-sm text-muted-foreground md:whitespace-nowrap">
                            {formatReservationDate(reservation.reservationDate, reservation.displayTime)}
                          </TableCell>
                          <TableCell data-label="Réservation">
                            <div className="space-y-1">
                              <p className="font-medium">{reservation.reference}</p>
                              <p className="text-xs text-muted-foreground">{reservation.id}</p>
                            </div>
                          </TableCell>
                          <TableCell data-label="Client">
                            <div className="space-y-1">
                              <p className="font-medium">{reservation.customer.displayName}</p>
                              {reservation.customer.phone ? (
                                <p className="text-xs text-muted-foreground">{reservation.customer.phone}</p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell data-label="Restaurant" className="text-sm">{reservation.restaurant.name}</TableCell>
                          <TableCell data-label="Détails">
                            <div className="space-y-1">
                              {feature ? <Badge className={feature.className}>{feature.label}</Badge> : null}
                              {reservation.progressiveOfferDiscountPercent > 0 ? (
                                <Badge className="border-orange-200 bg-orange-100 text-orange-800">
                                  Offre progressive -{reservation.progressiveOfferDiscountPercent}%
                                  {reservation.progressiveOfferDiscountStatus === "finalized" ? " finale" : " en cours"}
                                </Badge>
                              ) : null}
                              <p className="text-xs text-muted-foreground">
                                {reservation.partySize} pers. · {reservation.preorderItems.length} précommande{reservation.preorderItems.length > 1 ? "s" : ""}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell data-label="Statut">
                            <Badge className={getStatusBadgeClass(reservation.status)}>{reservation.status}</Badge>
                          </TableCell>
                          <TableCell data-label="Montant" className="font-semibold md:text-right">{formatAmount(reservation.totalAmount)}</TableCell>
                          <TableCell data-label="Action" className="md:text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedOperation({ kind: "reservation", item: reservation });
                              }}
                            >
                              Voir
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {filteredReservations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          Aucune réservation ne correspond au filtre courant.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refunds" className="space-y-6">
          <Card>
            <CardHeader className="gap-1">
              <CardTitle>File des remboursements</CardTitle>
              <p className="text-sm text-muted-foreground md:hidden">
                Touchez une ligne pour ouvrir le traitement du remboursement.
              </p>
            </CardHeader>
            <CardContent className="py-0">
              {activeLoading ? (
                <div className="space-y-3 py-6">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              ) : activeError ? (
                <div className="py-10 text-center text-destructive">
                  Impossible de charger la file des remboursements.
                </div>
              ) : (
                <>
                  <div className="space-y-2 py-4 md:hidden">
                    {filteredRefunds.map((refund) => {
                      const status = getHistoryStatusPresentation(refund.refund_status || "pending", refund.payment_status);
                      return (
                        <MobileHistoryRow
                          key={`${refund.target_type}-${refund.target_id}`}
                          reference={getRefundReference(refund)}
                          date={formatDateTime(String(refund.cancelled_at || refund.created_at))}
                          customer={refund.customer_name || "Client inconnu"}
                          status={status}
                          onClick={() => setSelectedRefund(refund)}
                        />
                      );
                    })}

                    {filteredRefunds.length === 0 ? (
                      <EmptyMobileHistory>
                        Aucun remboursement en attente pour le filtre courant.
                      </EmptyMobileHistory>
                    ) : null}
                  </div>

                  <div className="hidden md:block">
                    <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Restaurant</TableHead>
                      <TableHead>Détails</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRefunds.map((refund) => {
                      const status = getHistoryStatusPresentation(refund.refund_status || "pending", refund.payment_status);
                      const miamzPriorityLabel = getRefundMiamzPriorityLabel(refund);
                      return (
                      <TableRow
                        key={`${refund.target_type}-${refund.target_id}`}
                        className={cn("cursor-pointer", status.desktopRowClassName)}
                        onClick={() => setSelectedRefund(refund)}
                      >
                        <TableCell data-label="Date" className="text-sm text-muted-foreground md:whitespace-nowrap">
                          {formatDateTime(String(refund.cancelled_at || refund.created_at))}
                        </TableCell>
                        <TableCell data-label="Référence">
                          <div className="space-y-1">
                            <p className="font-medium">{getRefundReference(refund)}</p>
                            <p className="text-xs text-muted-foreground">{refund.target_id}</p>
                          </div>
                        </TableCell>
                        <TableCell data-label="Client">
                          <div className="space-y-1">
                            <p className="font-medium">{refund.customer_name || "Client inconnu"}</p>
                            {refund.customer_phone ? (
                              <p className="text-xs text-muted-foreground">{refund.customer_phone}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell data-label="Restaurant" className="text-sm">{refund.restaurant_name || "-"}</TableCell>
                        <TableCell data-label="Détails">
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline">{refund.target_type === "order" ? "Commande" : "Reservation"}</Badge>
                              {miamzPriorityLabel ? (
                                <Badge className="border border-pink-200 bg-pink-50 text-pink-800">
                                  {miamzPriorityLabel}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {refund.feature || "Sans libelle"} · annule par {refund.cancelled_by || "inconnu"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell data-label="Statut">
                          <Badge className={getStatusBadgeClass(refund.refund_status)}>{refund.refund_status || "pending"}</Badge>
                        </TableCell>
                        <TableCell data-label="Montant" className="font-semibold md:text-right">
                          {formatAmount(toAmount(refund.remaining_amount_chf))}
                        </TableCell>
                        <TableCell data-label="Action" className="md:text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedRefund(refund);
                            }}
                          >
                            Voir
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}

                    {filteredRefunds.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          Aucun remboursement en attente pour le filtre courant.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AdminOperationDetailSheet
        operation={selectedOperation}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOperation(null);
            clearOperationSearchParam();
          }
        }}
      />

      <Dialog open={Boolean(selectedRefund)} onOpenChange={(open) => { if (!open) setSelectedRefund(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Traiter le remboursement</DialogTitle>
            <DialogDescription>
              {selectedRefund
                ? `${selectedRefund.reference || selectedRefund.target_id} · ${selectedRefund.restaurant_name || "Restaurant"}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedRefund ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Client</p>
                    <p className="font-medium">{selectedRefund.customer_name || "Client inconnu"}</p>
                    {selectedRefund.customer_phone ? (
                      <p className="text-xs text-muted-foreground">{selectedRefund.customer_phone}</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Montant a rembourser</p>
                    <p className="text-lg font-bold text-destructive">
                      {formatAmount(toAmount(selectedRefund.remaining_amount_chf))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mode de paiement: {selectedRefund.payment_method || "carte"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <p><strong>Type:</strong> {selectedRefund.target_type === "order" ? "Commande" : "Reservation"}</p>
                <p><strong>Feature:</strong> {selectedRefund.feature || "-"}</p>
                <p><strong>Annule par:</strong> {selectedRefund.cancelled_by || "-"}</p>
                <p><strong>Statut refund:</strong> {selectedRefund.refund_status || "pending"}</p>
                {getRefundMiamzPriorityLabel(selectedRefund) ? (
                  <p><strong>Priorite:</strong> {getRefundMiamzPriorityLabel(selectedRefund)}</p>
                ) : null}
                {selectedRefund.refund_reason ? (
                  <p><strong>Motif:</strong> {selectedRefund.refund_reason}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRefund(null)}>
              Fermer
            </Button>
            <Button
              variant="outline"
              disabled={!selectedRefund || refundMarkMutation.isPending || refundStripeMutation.isPending}
              onClick={() => {
                if (!selectedRefund) return;
                refundMarkMutation.mutate(selectedRefund);
              }}
            >
              {refundMarkMutation.isPending ? "Mise à jour..." : "Marquer remboursé"}
            </Button>
            <Button
              disabled={!selectedRefund || refundStripeMutation.isPending || refundMarkMutation.isPending}
              onClick={() => {
                if (!selectedRefund) return;
                refundStripeMutation.mutate(selectedRefund);
              }}
            >
              {refundStripeMutation.isPending ? "Remboursement..." : "Rembourser via Stripe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
