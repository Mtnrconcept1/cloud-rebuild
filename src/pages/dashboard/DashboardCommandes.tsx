import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import DeliveryMap from "@/components/DeliveryMap";
import SortControls from "@/components/list/SortControls";
import OperationViewToggle, { type OperationViewMode } from "@/components/operations/OperationViewToggle";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import RestaurantCancellationDialog from "@/components/RestaurantCancellationDialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { Bike, MapPin, User, Phone, Package2, ClipboardList, CreditCard, Search, Ban, CheckCircle, Eye, Timer } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { buildDeliveryRouteSteps } from "@/lib/deliveryRoute";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { invokeSupabaseFunction } from "@/lib/session";
import { getOrderStatusLockMessage } from "@/lib/statusLocks";
import { dispatchQueuedNotifications } from "@/lib/notificationDispatch";
import OrderPaymentBreakdown from "@/components/orders/OrderPaymentBreakdown";
import { getOrderPaymentBreakdown } from "@/components/orders/order-payment-breakdown-utils";
import type { CancellationReasonCode } from "@/lib/reservationMutations";
import {
  cancelOrderByRestaurant,
  getRemainingRefundAmount as getRefundRemainingAmount,
  processRefund,
} from "@/lib/refundMutations";
import {
  DASHBOARD_TIME_RANGE_OPTIONS,
  formatDashboardDateHeading,
  getTodayReferenceDate,
  isDateInDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/dashboardTimeRange";
import { groupItemsByDay } from "@/lib/dashboardGrouping";
import { sortByColumn, type SortColumn, type SortDirection } from "@/lib/listSorting";
import {
  DASHBOARD_ORDER_TYPE_ORDER,
  classifyDashboardOrderType,
  getDashboardOrderTypeMeta,
  summarizeDashboardOrdersByType,
} from "@/lib/dashboardOrderTypes";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

type DashboardOrderItem = {
  id: string;
  quantity: number;
  total_price: number;
  unit_price?: number;
  name?: string | null;
};

type DashboardDeliveryTracking = {
  id?: string;
  status?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
};

type DashboardDispatchJob = {
  id?: string;
  status?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  route_geometry?: Record<string, unknown> | null;
};

type DashboardOrder = {
  id: string;
  user_id: string;
  restaurant_id: string;
  checkout_id: string | null;
  order_number: string | null;
  created_at: string;
  status: string;
  payment_status?: string | null;
  restaurant_viewed_at?: string | null;
  restaurant_accepted_at?: string | null;
  acceptance_deadline_at?: string | null;
  restaurant_response_status?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  refund_status?: string | null;
  refunded_amount_chf?: number | string | null;
  total_amount: number | string;
  delivery_fee: number | string | null;
  delivery_address: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  customer: {
    full_name?: string | null;
    phone?: string | null;
  } | null;
  order_items: DashboardOrderItem[];
  delivery_tracking: DashboardDeliveryTracking | null;
  dispatch_job: DashboardDispatchJob | null;
};

type DashboardOrderSortKey = "created_at" | "order_number" | "customer" | "amount" | "status";

const DASHBOARD_ORDER_SORT_COLUMNS: SortColumn<DashboardOrder, DashboardOrderSortKey>[] = [
  { key: "created_at", label: "Date", type: "date", getValue: (order) => order.created_at },
  { key: "order_number", label: "Numero", type: "text", getValue: (order) => order.order_number || order.id },
  { key: "customer", label: "Nom client", type: "text", getValue: (order) => order.customer?.full_name || order.customer?.phone || "" },
  { key: "amount", label: "Montant", type: "number", getValue: (order) => order.total_amount },
  { key: "status", label: "Statut", type: "text", getValue: (order) => order.status },
];

const TAKEAWAY_STATUS_SEQUENCE = ["confirmed", "accepted", "preparing", "ready", "delivered", "cancelled"] as const;
const DELIVERY_STATUS_SEQUENCE = ["confirmed", "accepted", "preparing", "delivering", "delivered", "cancelled"] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  pending_payment: "Paiement en attente",
  payment_failed: "Paiement échoué",
  confirmed: "Confirmée",
  preparing: "En préparation",
  accepted: "Acceptée",
  ready: "Prête à retirer",
  delivering: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

function isDeliveryDashboardOrder(order: DashboardOrder) {
  const metadata = order.metadata || {};
  const explicitType = typeof metadata.type === "string" ? metadata.type.toLowerCase() : "";
  const feature = typeof metadata.feature === "string" ? metadata.feature.toLowerCase() : "";
  const hasPickupTime = typeof metadata.pickup_time === "string" || typeof metadata.arrival_time === "string";

  if (explicitType && explicitType !== "delivery") return false;
  if (!order.delivery_address) return false;
  if (feature === "zero-attente") return false;
  return !hasPickupTime;
}

function getStatusOptions(order: DashboardOrder) {
  const currentStatus = String(normalizeOrderStatus(order.status));
  const baseStatuses: string[] = isDeliveryDashboardOrder(order)
    ? [...DELIVERY_STATUS_SEQUENCE]
    : [...TAKEAWAY_STATUS_SEQUENCE];
  const nonCancellationStatuses = baseStatuses.filter((status) => status !== "cancelled");

  if (currentStatus === "cancelled") {
    return [currentStatus];
  }

  return nonCancellationStatuses.includes(currentStatus)
    ? nonCancellationStatuses
    : [currentStatus, ...nonCancellationStatuses.filter((status) => status !== currentStatus)];
}

function getDispatchFailureMessage(dispatch: unknown) {
  const record = dispatch && typeof dispatch === "object" && !Array.isArray(dispatch)
    ? dispatch as Record<string, any>
    : {};
  let errorMessage = typeof record.error === "string" ? record.error : "Impossible de notifier les livreurs.";
  let diagnostic = record.diagnostic && typeof record.diagnostic === "object"
    ? record.diagnostic as Record<string, any>
    : null;

  if (!diagnostic && errorMessage.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(errorMessage);
      if (typeof parsed?.error === "string") errorMessage = parsed.error;
      if (parsed?.diagnostic && typeof parsed.diagnostic === "object") diagnostic = parsed.diagnostic;
    } catch {
      // Keep the raw server message when it is not JSON.
    }
  }

  const code = String(diagnostic?.code || "");
  if (code === "missing_authorization" || code === "session_expired") {
    return "Le statut est enregistre, mais dispatch-order a refuse l'appel interne. Action admin: verifier le secret service-role synchronise sur les Edge Functions.";
  }
  if (code === "role_failure") {
    return "Le statut est enregistre, mais le dispatch a echoue sur un controle de role. Action admin: verifier les roles et l'acces restaurant.";
  }
  if (code === "missing_secret") {
    return `Le statut est enregistre, mais un secret Edge Function manque: ${diagnostic?.missing_secret || "secret inconnu"}.`;
  }
  if (code === "firebase_config_invalid") {
    return "Le statut est enregistre, mais la configuration Firebase push est invalide. Action admin: verifier FIREBASE_SERVICE_ACCOUNT.";
  }

  return errorMessage;
}

function getOrderRefundSnapshot(order: DashboardOrder) {
  const paymentStatus = String(order.payment_status || order.metadata?.payment_status || "").trim().toLowerCase();
  const refundStatus = String(order.refund_status || "").trim().toLowerCase();
  const remainingAmount = getRefundRemainingAmount(order.total_amount, order.refunded_amount_chf);

  return {
    remainingAmount,
    eligible: remainingAmount > 0.009
      && refundStatus !== "refunded"
      && (paymentStatus === "paid" || paymentStatus === "captured"),
  };
}

function canCancelOrder(order: DashboardOrder) {
  const status = String(normalizeOrderStatus(order.status));
  return ["confirmed", "accepted", "preparing", "ready", "delivering"].includes(status);
}

function formatAcceptanceDeadline(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  return new Date(timestamp).toLocaleTimeString("fr-CH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardCommandes() {
  const { selectedId, restaurants, loading: restaurantsLoading, error: restaurantsError } = useDashboardRestaurant();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedRouteOrderId, setExpandedRouteOrderId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DashboardOrder | null>(null);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [referenceDate, setReferenceDate] = useState(getTodayReferenceDate());
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<DashboardOrderSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [viewMode, setViewMode] = useState<OperationViewMode>("details");

  useEffect(() => {
    const orderTarget = searchParams.get("order");
    if (orderTarget) setSearchTerm(orderTarget);
  }, [searchParams]);

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId);

  const { data: orders, error: ordersError } = useQuery({
    queryKey: ["dashboard-all-orders", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_restaurant_orders_dashboard" as any, {
        p_restaurant_id: selectedId!,
      });

      if (error) throw error;

      return ((data || []) as any[]).map((order) => ({
        ...order,
        metadata: order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
          ? order.metadata
          : {},
        customer: order.customer && typeof order.customer === "object" && !Array.isArray(order.customer)
          ? order.customer
          : null,
        order_items: Array.isArray(order.order_items) ? order.order_items : [],
        delivery_tracking: order.delivery_tracking && typeof order.delivery_tracking === "object" && !Array.isArray(order.delivery_tracking)
          ? order.delivery_tracking
          : null,
        dispatch_job: order.dispatch_job && typeof order.dispatch_job === "object" && !Array.isArray(order.dispatch_job)
          ? order.dispatch_job
          : null,
      })) as DashboardOrder[];
    },
    enabled: !!selectedId,
  });

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return (orders || []).filter((order) => {
      // Hide orders whose Stripe payment never completed - they are not actionable
      // for the restaurateur and would otherwise display a misleading "pending" badge.
      const status = String(order.status || "").toLowerCase();
      if (status === "pending" || status === "pending_payment" || status === "payment_failed") return false;
      if (!isDateInDashboardTimeRange(order.created_at, timeRange, referenceDate)) return false;
      if (normalizedSearch) {
        const orderNum = (order.order_number || "").toLowerCase();
        const customerName = (order.customer?.full_name || "").toLowerCase();
        const customerPhone = (order.customer?.phone || "").toLowerCase();
        const orderNotes = (order.notes || "").toLowerCase();
        const orderId = order.id.toLowerCase();
        if (
          !orderNum.includes(normalizedSearch) &&
          !customerName.includes(normalizedSearch) &&
          !customerPhone.includes(normalizedSearch) &&
          !orderNotes.includes(normalizedSearch) &&
          !orderId.startsWith(normalizedSearch)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [orders, referenceDate, timeRange, searchTerm]);

  const filteredOrdersRevenue = useMemo(() => (
    filteredOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
  ), [filteredOrders]);

  const sortedOrders = useMemo(() => (
    sortByColumn(filteredOrders, DASHBOARD_ORDER_SORT_COLUMNS, { key: sortKey, direction: sortDirection })
  ), [filteredOrders, sortDirection, sortKey]);

  const groupedOrders = useMemo(() => {
    const groups = groupItemsByDay(sortedOrders, (order) => order.created_at.slice(0, 10));
    if (sortKey === "created_at" && sortDirection === "desc") groups.reverse();

    return groups.map((group) => ({
      ...group,
      dateLabel: formatDashboardDateHeading(group.dateKey),
      revenue: group.items.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
      orderTypeSummary: summarizeDashboardOrdersByType(group.items, (order) => order.total_amount),
    }));
  }, [sortDirection, sortKey, sortedOrders]);

  const cancelMutation = useMutation({
    mutationFn: async ({
      id,
      reasonCode,
      details,
      refundNow,
      refundEligible,
    }: {
      id: string;
      reasonCode: CancellationReasonCode;
      details: string | null;
      refundNow: boolean;
      refundEligible: boolean;
    }) => {
      const result = await cancelOrderByRestaurant(id, reasonCode, details);
      if (!result.ok) {
        throw new Error(result.errorMessage || "Annulation impossible.");
      }

      const refundResult = refundNow && refundEligible
        ? await processRefund({
          targetType: "order",
          targetId: id,
          reason: details || reasonCode,
        })
        : null;

      try {
        await dispatchQueuedNotifications("dashboard-order-cancel");
      } catch (dispatchError) {
        console.error("Order cancellation notification dispatch failed:", dispatchError);
      }

      return {
        id,
        refundAttempted: refundNow && refundEligible,
        refundEligible,
        refundResult,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-all-orders", selectedId] });
      setCancelTarget(null);

      if (data.refundAttempted && data.refundResult?.ok) {
        toast({
          title: "Commande annulée",
          description: `Remboursement lance pour ${Number(data.refundResult.refundAmountChf || 0).toFixed(2)} CHF.`,
        });
        return;
      }

      if (data.refundAttempted && !data.refundResult?.ok) {
        toast({
          title: "Commande annulée, remboursement en attente",
          description: data.refundResult?.errorMessage || "Le remboursement reste disponible dans la file admin.",
          variant: "destructive",
        });
        return;
      }

      if (data.refundEligible) {
        toast({
          title: "Commande annulée",
          description: "La demande de remboursement reste disponible dans la file admin.",
        });
        return;
      }

      toast({
        title: "Commande annulée",
        description: "La raison a été enregistrée.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Annulation impossible", description: error.message, variant: "destructive" });
    },
  });

  const updateStatus = async (orderId: string, status: string) => {
    const normalizedStatus = normalizeOrderStatus(status);
    const { data, error } = await invokeSupabaseFunction("restaurant-order-status", {
      body: {
        order_id: orderId,
        status: normalizedStatus,
      },
    });

    if (error) {
      const is401 = (error as Error & { status?: number }).status === 401
        || error.message?.includes("401")
        || error.message?.includes("Unauthorized");
      toast({
        title: is401 ? "Session expirée" : "Erreur",
        description: is401 ? "Votre session a expiré, veuillez vous reconnecter." : error.message,
        variant: "destructive",
      });
      if (is401) {
        window.location.href = "/auth";
      }
      return;
    }

    if (data?.error) {
      const errMsg = String(data.error);
      const is401 = errMsg.includes("Unauthorized");
      toast({
        title: is401 ? "Session expirée" : "Erreur",
        description: is401 ? "Votre session a expiré, veuillez vous reconnecter." : errMsg,
        variant: "destructive",
      });
      if (is401) {
        window.location.href = "/auth";
      }
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard-all-orders", selectedId] });

    const dispatchState = typeof data?.dispatch?.state === "string" ? data.dispatch.state : null;
    if (dispatchState === "failed") {
      const dispatchError = getDispatchFailureMessage(data?.dispatch);
      toast({
        title: "Statut mis à jour (alerté livreur échouée)",
        description: dispatchError,
        variant: "destructive",
      });
      return;
    }

    const description = dispatchState === "queued"
      ? "Le statut est passe en préparation et les livreurs ont été alertes."
      : dispatchState === "scheduled"
        ? "Le statut est passé en préparation. La recherche de livreur démarrera au bon créneau."
        : `La commande est maintenant "${STATUS_LABELS[String(normalizedStatus)] || normalizedStatus}".`;

    toast({ title: "Statut mis à jour", description });
  };

  const markOrderSeen = async (orderId: string) => {
    const { error } = await supabase.rpc("mark_order_seen_by_restaurant" as any, {
      p_order_id: orderId,
    });

    if (error) {
      toast({ title: "Marquage impossible", description: error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard-all-orders", selectedId] });
  };

  const handleStatusSelection = (order: DashboardOrder, status: string) => {
    const normalizedStatus = normalizeOrderStatus(status);
    if (normalizedStatus === "cancelled") {
      setCancelTarget(order);
      return;
    }

    void updateStatus(order.id, normalizedStatus);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Operations restaurant"
          title="Commandes"
          description="Pilotez les commandes par jour, source et statut avec les informations client, paiement et livraison au même endroit."
          icon={ClipboardList}
          tone="violet"
          visualLabel="Flux commandes"
          stats={[
            { label: "Restaurant", value: selectedRestaurant?.name || "Aucun", icon: ClipboardList },
            { label: "Commandes visibles", value: filteredOrders.length, icon: Package2 },
            { label: "Jours ouverts", value: groupedOrders.length, icon: Search },
          ]}
        />

        {restaurantsLoading ? <p className="text-muted-foreground">Chargement des restaurants...</p> : null}
        {restaurantsError ? <p className="text-destructive">Erreur lors du chargement des restaurants : {restaurantsError}</p> : null}
        {!restaurantsLoading && !restaurantsError && restaurants.length === 0 ? (
          <p className="text-muted-foreground">Aucun restaurant lié à votre compte.</p>
        ) : null}
        {!restaurantsLoading && !restaurantsError && restaurants.length > 0 && !selectedRestaurant ? (
          <p className="text-muted-foreground">Sélectionnez un restaurant depuis la barre latérale pour afficher les commandes.</p>
        ) : null}
        {ordersError ? (
          <p className="text-destructive">Erreur lors du chargement des commandes : {(ordersError as Error).message}</p>
        ) : null}

        {!restaurantsLoading && !restaurantsError && selectedRestaurant && !ordersError ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-3 shadow-sm md:grid-cols-2 md:p-4 xl:grid-cols-7">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Rechercher</p>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="N° commande, client..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Période</p>
                <Select value={timeRange} onValueChange={(value) => setTimeRange(value as DashboardTimeRange)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    {DASHBOARD_TIME_RANGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Date de référence</p>
                <Input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
              </div>
              <SortControls
                columns={DASHBOARD_ORDER_SORT_COLUMNS}
                sortKey={sortKey}
                direction={sortDirection}
                onSortKeyChange={setSortKey}
                onDirectionChange={setSortDirection}
                className="xl:col-span-2"
              />
              <div className="rounded-xl border bg-muted/20 p-2.5 sm:p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Commandes visibles</p>
                <p className="text-xl font-bold sm:text-2xl">{filteredOrders.length}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-2.5 sm:p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Chiffre visible</p>
                <p className="text-xl font-bold text-primary sm:text-2xl">{filteredOrdersRevenue.toFixed(2)} CHF</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Vue des commandes</p>
                <p className="text-xs text-muted-foreground">Galerie pour scanner, liste pour traiter, détails pour piloter par jour.</p>
              </div>
              <OperationViewToggle value={viewMode} onChange={setViewMode} ariaLabel="Mode de vue des commandes restaurant" />
            </div>

            {viewMode !== "details" && filteredOrders.length > 0 ? (
              <div className={viewMode === "gallery" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
                {sortedOrders.map((order) => {
                  const orderType = classifyDashboardOrderType(order);
                  const orderTypeMeta = getDashboardOrderTypeMeta(orderType);
                  const customer = order.customer;
                  const items = order.order_items ?? [];
                  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                  const restaurantViewedAt = typeof order.restaurant_viewed_at === "string" ? order.restaurant_viewed_at : null;
                  const isAwaitingRestaurantAcceptance = normalizeOrderStatus(order.status) === "confirmed";
                  const orderStatusLockMessage = getOrderStatusLockMessage(order);
                  const isOrderStatusLocked = Boolean(orderStatusLockMessage);

                  return (
                    <article
                      key={order.id}
                      className={`min-w-0 rounded-2xl border bg-card p-4 shadow-sm ring-1 ring-transparent transition hover:border-primary/30 ${orderTypeMeta.cardClassName}`}
                    >
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-words text-base font-bold">{order.order_number || `#${order.id.slice(0, 8)}`}</span>
                            <OrderStatusBadge status={normalizeOrderStatus(order.status)} />
                            {orderTypeMeta.badgeLabel ? (
                              <Badge variant="outline" className={orderTypeMeta.badgeClassName}>{orderTypeMeta.badgeLabel}</Badge>
                            ) : (
                              <Badge variant="outline">À la carte</Badge>
                            )}
                            <Badge variant="outline" className={restaurantViewedAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                              <Eye className="mr-1 h-3 w-3" />
                              {restaurantViewedAt ? "Vue" : "À voir"}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium">{customer?.full_name || "Client anonyme"}</p>
                          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                            <div className="rounded-lg border bg-background/70 p-2">
                              <p className="text-muted-foreground">Montant</p>
                              <p className="font-bold text-primary">{Number(order.total_amount).toFixed(2)} CHF</p>
                            </div>
                            <div className="rounded-lg border bg-background/70 p-2">
                              <p className="text-muted-foreground">Articles</p>
                              <p className="font-semibold">{itemCount || items.length}</p>
                            </div>
                            <div className="rounded-lg border bg-background/70 p-2">
                              <p className="text-muted-foreground">Date</p>
                              <p className="font-semibold">{new Date(order.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</p>
                            </div>
                          </div>
                          {viewMode === "gallery" ? (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {items.slice(0, 3).map((item) => `${item.quantity}x ${item.name || "Article"}`).join(" · ") || "Détail article indisponible"}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                          {!restaurantViewedAt ? (
                            <Button size="sm" variant="outline" onClick={() => void markOrderSeen(order.id)} disabled={cancelMutation.isPending}>
                              <Eye className="mr-1 h-4 w-4" />
                              Vue
                            </Button>
                          ) : null}
                          {isAwaitingRestaurantAcceptance ? (
                            <Button size="sm" onClick={() => handleStatusSelection(order, "accepted")} disabled={isOrderStatusLocked || cancelMutation.isPending}>
                              <CheckCircle className="mr-1 h-4 w-4" />
                              Accepter
                            </Button>
                          ) : null}
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setCancelTarget(order)} disabled={!canCancelOrder(order) || cancelMutation.isPending}>
                            <Ban className="mr-1 h-4 w-4" />
                            Annuler
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}

            {viewMode === "details" && groupedOrders.length > 0 ? (
              <Accordion
                type="single"
                collapsible
                value={openDayKey ?? ""}
                onValueChange={(value) => setOpenDayKey(value || null)}
                className="space-y-4"
              >
                {groupedOrders.map((dayGroup) => (
                  <AccordionItem key={dayGroup.dateKey} value={dayGroup.dateKey} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                    <AccordionTrigger className="px-4 py-4 text-left hover:no-underline sm:px-5">
                      <div className="flex flex-1 flex-wrap items-center justify-between gap-3 pr-4">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold capitalize">{dayGroup.dateLabel}</p>
                          <p className="text-xs text-muted-foreground">
                            {dayGroup.items.length} commande(s) - {dayGroup.revenue.toFixed(2)} CHF
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {DASHBOARD_ORDER_TYPE_ORDER.map((orderType) => {
                            const summary = dayGroup.orderTypeSummary[orderType];
                            if (summary.count === 0) return null;
                            const meta = getDashboardOrderTypeMeta(orderType);
                            return (
                              <Badge key={orderType} variant="outline" className={meta.badgeClassName || "bg-muted/40"}>
                                {meta.label}: {summary.count}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 px-3 pb-4 sm:px-5 sm:pb-5">
                      <div className="space-y-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">Repartition du jour</p>
                          <p className="text-xs text-muted-foreground">
                            Les commandes anti-gaspi et ventes flash restent dans le flux chronologique, avec leur source visible separement.
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          {DASHBOARD_ORDER_TYPE_ORDER.map((orderType) => {
                            const summary = dayGroup.orderTypeSummary[orderType];
                            const meta = getDashboardOrderTypeMeta(orderType);

                            return (
                              <div key={orderType} className={`rounded-xl border p-3 ${meta.summaryCardClassName}`}>
                                <p className="text-sm font-semibold">{meta.label}</p>
                                <p className="mt-2 text-2xl font-bold">{summary.count}</p>
                                <p className={`text-xs ${meta.summaryTextClassName}`}>{summary.revenue.toFixed(2)} CHF</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {dayGroup.items.map((order) => {
                        const tracking = order.delivery_tracking ?? null;
                        const customer = order.customer;
                        const items = order.order_items ?? [];
                        const customerPhone = customer?.phone ?? "";
                        const customerAddress = order.delivery_address ?? "Adresse non renseignee";
                        const paymentMeta = (order.metadata || {}) as Record<string, any>;
                        const paymentBreakdown = getOrderPaymentBreakdown(order);
                        const orderStatusLockMessage = getOrderStatusLockMessage(order);
                        const refundSnapshot = getOrderRefundSnapshot(order);
                        const isOrderStatusLocked = Boolean(orderStatusLockMessage);
                        const deliveryFlowStatus = String(order.dispatch_job?.status || tracking?.status || "");
                        const scheduledLabel = typeof paymentMeta.scheduled_delivery_label === "string" ? paymentMeta.scheduled_delivery_label : "";
                        const statusOptions = getStatusOptions(order);
                        const deliveryLat = paymentMeta.delivery_lat != null && Number.isFinite(Number(paymentMeta.delivery_lat))
                          ? Number(paymentMeta.delivery_lat)
                          : null;
                        const deliveryLng = paymentMeta.delivery_lng != null && Number.isFinite(Number(paymentMeta.delivery_lng))
                          ? Number(paymentMeta.delivery_lng)
                          : null;
                        const routeSteps = buildDeliveryRouteSteps({
                          routeGeometry: order.dispatch_job?.route_geometry,
                          deliveryAddress: order.delivery_address,
                          deliveryLat,
                          deliveryLng,
                        });
                        const routeMapStops = routeSteps
                          .filter((step) => step.latitude !== null && step.longitude !== null)
                          .map((step) => ({
                            ...step,
                            latitude: step.latitude as number,
                            longitude: step.longitude as number,
                          }));
                        const canPreviewRoute = isDeliveryDashboardOrder(order) && routeMapStops.length >= 2;
                        const isRouteExpanded = expandedRouteOrderId === order.id;
                        const orderType = classifyDashboardOrderType(order);
                        const orderTypeMeta = getDashboardOrderTypeMeta(orderType);
                        const restaurantViewedAt = typeof order.restaurant_viewed_at === "string" ? order.restaurant_viewed_at : null;
                        const restaurantAcceptedAt = typeof order.restaurant_accepted_at === "string" ? order.restaurant_accepted_at : null;
                        const acceptanceDeadlineAt = typeof order.acceptance_deadline_at === "string" ? order.acceptance_deadline_at : null;
                        const acceptanceDeadlineLabel = formatAcceptanceDeadline(acceptanceDeadlineAt);
                        const acceptanceDeadlineExceeded = Boolean(
                          acceptanceDeadlineAt && !restaurantAcceptedAt && Date.parse(acceptanceDeadlineAt) < Date.now(),
                        );
                        const isAwaitingRestaurantAcceptance = normalizeOrderStatus(order.status) === "confirmed";

                        return (
                          <div
                            key={order.id}
                            className={`min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5 ${orderTypeMeta.cardClassName}`}
                          >
                            <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                              <div className="min-w-0 space-y-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="min-w-0 break-words text-lg font-bold">{order.order_number || `#${order.id.slice(0, 8)}`}</span>
                                  <OrderStatusBadge status={normalizeOrderStatus(order.status)} />
                                  {orderTypeMeta.badgeLabel ? (
                                    <Badge variant="outline" className={orderTypeMeta.badgeClassName}>
                                      {orderTypeMeta.badgeLabel}
                                    </Badge>
                                  ) : null}
                                  <Badge
                                    variant="outline"
                                    className={restaurantViewedAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}
                                  >
                                    <Eye className="mr-1 h-3 w-3" />
                                    {restaurantViewedAt ? "Vue" : "A voir"}
                                  </Badge>
                                  {acceptanceDeadlineLabel ? (
                                    <Badge
                                      variant="outline"
                                      className={acceptanceDeadlineExceeded ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-700"}
                                    >
                                      <Timer className="mr-1 h-3 w-3" />
                                      {acceptanceDeadlineExceeded ? "Delai depasse" : `Avant ${acceptanceDeadlineLabel}`}
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(order.created_at).toLocaleDateString("fr-FR", {
                                    day: "numeric",
                                    month: "long",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                              </div>
                              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(11rem,1fr)_auto_auto_minmax(10rem,auto)_auto] lg:items-start xl:min-w-[34rem]">
                                <div className="min-w-0 rounded-xl bg-muted/25 p-3 text-left sm:col-span-2 lg:col-span-1 lg:text-right">
                                  <p className="text-lg font-bold text-primary">{Number(order.total_amount).toFixed(2)} CHF</p>
                                  {paymentBreakdown.tokOneTotalSaved > 0 ? (
                                    <p className="mt-1 text-[11px] font-medium text-violet-600">
                                      -{paymentBreakdown.tokOneTotalSaved.toFixed(2)} CHF Tok One
                                    </p>
                                  ) : null}
                                  <div className="flex flex-col items-start lg:items-end">
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paiement reçu</p>
                                    {paymentMeta.payment_method ? (
                                      <div className="mt-1 flex items-center gap-1.5">
                                        <CreditCard className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-[10px] font-medium uppercase">{paymentMeta.payment_method}</span>
                                        {paymentMeta.card_last4 ? (
                                          <span className="rounded bg-secondary px-1 font-mono text-[10px]">
                                            **** {paymentMeta.card_last4}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                {!restaurantViewedAt ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-10 w-full justify-center lg:w-auto"
                                    onClick={() => void markOrderSeen(order.id)}
                                    disabled={cancelMutation.isPending}
                                  >
                                    <Eye className="mr-1 h-4 w-4" />
                                    Vue
                                  </Button>
                                ) : null}
                                {isAwaitingRestaurantAcceptance ? (
                                  <Button
                                    size="sm"
                                    className="h-10 w-full justify-center lg:w-auto"
                                    onClick={() => handleStatusSelection(order, "accepted")}
                                    disabled={isOrderStatusLocked || cancelMutation.isPending}
                                  >
                                    <CheckCircle className="mr-1 h-4 w-4" />
                                    Accepter
                                  </Button>
                                ) : null}
                                <div className="min-w-0 space-y-1 sm:col-span-2 lg:col-span-1">
                                  <Select
                                    value={normalizeOrderStatus(order.status)}
                                    onValueChange={(value) => handleStatusSelection(order, value)}
                                    disabled={isOrderStatusLocked || cancelMutation.isPending}
                                  >
                                    <SelectTrigger className="h-10 w-full min-w-0 shadow-sm lg:w-40">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {statusOptions.map((status) => (
                                        <SelectItem key={status} value={status}>
                                          {STATUS_LABELS[status] || status}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {orderStatusLockMessage ? (
                                    <p className="text-left text-[11px] text-muted-foreground lg:max-w-40 lg:text-right">
                                      {orderStatusLockMessage}
                                    </p>
                                  ) : null}
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-10 w-full justify-center text-destructive lg:w-auto"
                                  onClick={() => setCancelTarget(order)}
                                  disabled={!canCancelOrder(order) || cancelMutation.isPending}
                                >
                                  <Ban className="mr-1 h-4 w-4" />
                                  Annuler
                                </Button>
                              </div>
                            </div>

                            <Separator className="bg-muted/50" />

                            <div className="grid gap-6 md:grid-cols-2">
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                                  <User className="h-4 w-4" />
                                  Client
                                </div>
                                <div className="space-y-2 rounded-xl bg-muted/30 p-3">
                                  <p className="text-sm font-medium">{customer?.full_name || "Client anonyme"}</p>
                                  <div className="flex flex-col gap-1.5">
                                    <a href={customerPhone ? `tel:${customerPhone}` : undefined} className="flex items-center gap-2 text-xs text-primary hover:underline">
                                      <Phone className="h-3 w-3" />
                                      {customerPhone || "Non renseigne"}
                                    </a>
                                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                      {customerAddress}
                                    </div>
                                    {scheduledLabel ? <div className="text-xs text-muted-foreground">Livraison planifiée : {scheduledLabel}</div> : null}
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                                  <Package2 className="h-4 w-4" />
                                  Détail de la commande
                                </div>
                                <div className="space-y-2 rounded-xl bg-muted/30 p-3">
                                  {items.map((item) => (
                                    <div key={item.id} className="flex min-w-0 flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                                          {item.quantity}
                                        </span>
                                        <span className="min-w-0 break-words font-medium">{item.name || "Article"}</span>
                                      </div>
                                      <span className="shrink-0 text-muted-foreground sm:text-right">{Number(item.total_price).toFixed(2)} CHF</span>
                                    </div>
                                  ))}
                                  {order.notes ? (
                                    <div className="mt-2 flex items-start gap-2 rounded border-t border-muted/50 bg-amber-50/50 p-2 pt-2 text-xs text-amber-600">
                                      <ClipboardList className="mt-0.5 h-3 w-3 shrink-0" />
                                      <span>
                                        <strong>Note :</strong> {order.notes}
                                      </span>
                                    </div>
                                  ) : null}
                                  <OrderPaymentBreakdown order={order} className="mt-3" isRestaurantDashboard={true} />
                                </div>
                              </div>
                            </div>

                            {deliveryFlowStatus ? (
                              <div className="flex w-fit items-center gap-2 rounded-full bg-secondary/30 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                                <Bike className="h-3 w-3" />
                                LIVRAISON : {deliveryFlowStatus.toUpperCase()}
                              </div>
                            ) : null}

                            {refundSnapshot.eligible ? (
                              <p className="text-xs text-destructive">
                                Remboursement possible: {refundSnapshot.remainingAmount.toFixed(2)} CHF
                              </p>
                            ) : null}

                            {canPreviewRoute ? (
                              <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-sm font-semibold">Parcours de livraison</p>
                                    <p className="text-xs text-muted-foreground">
                                      {routeSteps.length} étape(s) du retrait à la remise client.
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-primary hover:underline"
                                    onClick={() => setExpandedRouteOrderId(isRouteExpanded ? null : order.id)}
                                  >
                                    {isRouteExpanded ? "Masquer" : "Voir le parcours"}
                                  </button>
                                </div>

                                {isRouteExpanded ? (
                                  <div className="space-y-3">
                                    <DeliveryMap
                                      routeStops={routeMapStops}
                                      currentLat={tracking?.current_lat ? Number(tracking.current_lat) : undefined}
                                      currentLng={tracking?.current_lng ? Number(tracking.current_lng) : undefined}
                                      className="h-64"
                                    />
                                    <div className="grid gap-2">
                                      {routeSteps.map((step) => (
                                        <div key={step.id} className="flex gap-3 rounded-xl border bg-card p-3">
                                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                            {step.stepIndex}
                                          </div>
                                          <div>
                                            <p className="text-sm font-semibold">{step.label}</p>
                                            {step.restaurantName ? <p className="text-xs text-muted-foreground">{step.restaurantName}</p> : null}
                                            <p className="text-xs text-muted-foreground">{step.address || "-"}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : null}
            {filteredOrders.length === 0 ? <p className="py-8 text-center text-muted-foreground">Aucune commande pour la période sélectionnée.</p> : null}
          </div>
        ) : null}
      </div>
      <RestaurantCancellationDialog
        open={Boolean(cancelTarget)}
        targetLabel={
          cancelTarget
            ? `${cancelTarget.order_number || `#${cancelTarget.id.slice(0, 8)}`} - ${cancelTarget.total_amount} CHF`
            : undefined
        }
        submitting={cancelMutation.isPending}
        refundEligible={cancelTarget ? getOrderRefundSnapshot(cancelTarget).eligible : false}
        refundAmountChf={cancelTarget ? getOrderRefundSnapshot(cancelTarget).remainingAmount : 0}
        refundHint={cancelTarget && getOrderRefundSnapshot(cancelTarget).eligible
          ? "Decochez pour laisser le remboursement en file admin."
          : null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
          }
        }}
        onConfirm={({ reasonCode, details, refundNow }) => {
          if (!cancelTarget) return;
          const refundSnapshot = getOrderRefundSnapshot(cancelTarget);
          cancelMutation.mutate({
            id: cancelTarget.id,
            reasonCode,
            details,
            refundNow,
            refundEligible: refundSnapshot.eligible,
          });
        }}
      />
    </DashboardLayout>
  );
}
