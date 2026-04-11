import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import DeliveryMap from "@/components/DeliveryMap";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { Bike, MapPin, User, Phone, Package2, ClipboardList, CreditCard } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { buildDeliveryRouteSteps } from "@/lib/deliveryRoute";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import OrderPaymentBreakdown, { getOrderPaymentBreakdown } from "@/components/orders/OrderPaymentBreakdown";
import {
  DASHBOARD_TIME_RANGE_OPTIONS,
  getTodayReferenceDate,
  isDateInDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/dashboardTimeRange";
import { useDashboardRestaurant } from "./DashboardContext";

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

const DEFAULT_STATUS_SEQUENCE = ["confirmed", "preparing", "delivering", "delivered", "cancelled"] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  pending_payment: "Paiement en attente",
  confirmed: "Confirmee",
  preparing: "En preparation",
  delivering: "En livraison",
  delivered: "Livree",
  cancelled: "Annulee",
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
  const currentStatus = normalizeOrderStatus(order.status);
  const baseStatuses = isDeliveryDashboardOrder(order)
    ? ["confirmed", "preparing", "cancelled"]
    : [...DEFAULT_STATUS_SEQUENCE];

  return baseStatuses.includes(currentStatus as string)
    ? baseStatuses
    : [String(currentStatus), ...baseStatuses.filter((status) => status !== currentStatus)];
}

export default function DashboardCommandes() {
  const { selectedId, restaurants, loading: restaurantsLoading, error: restaurantsError } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedRouteOrderId, setExpandedRouteOrderId] = useState<string | null>(null);
  const [referenceDate, setReferenceDate] = useState(getTodayReferenceDate());
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("all");

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

  const filteredOrders = useMemo(() => (
    (orders || []).filter((order) => (
      isDateInDashboardTimeRange(order.created_at, timeRange, referenceDate)
    ))
  ), [orders, referenceDate, timeRange]);

  const filteredOrdersRevenue = useMemo(() => (
    filteredOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
  ), [filteredOrders]);

  const updateStatus = async (orderId: string, status: string) => {
    const normalizedStatus = normalizeOrderStatus(status);
    const { data, error } = await supabase.functions.invoke("restaurant-order-status", {
      body: {
        order_id: orderId,
        status: normalizedStatus,
      },
    });

    if (error) {
      const is401 = error.message?.includes("401") || error.message?.includes("Unauthorized");
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
      const dispatchError = typeof data?.dispatch?.error === "string" ? data.dispatch.error : "Impossible de notifier les livreurs.";
      toast({
        title: "Statut mis a jour (alerte livreur echouee)",
        description: dispatchError,
        variant: "destructive",
      });
      return;
    }

    const description = dispatchState === "queued"
      ? "Le statut est passe en preparation et les livreurs ont ete alertes."
      : dispatchState === "scheduled"
        ? "Le statut est passe en preparation. La recherche de livreur demarrera au bon creneau."
        : `La commande est maintenant "${STATUS_LABELS[String(normalizedStatus)] || normalizedStatus}".`;

    toast({ title: "Statut mis a jour", description });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Commandes</h1>

        {restaurantsLoading ? <p className="text-muted-foreground">Chargement des restaurants...</p> : null}
        {restaurantsError ? <p className="text-destructive">Erreur lors du chargement des restaurants : {restaurantsError}</p> : null}
        {!restaurantsLoading && !restaurantsError && restaurants.length === 0 ? (
          <p className="text-muted-foreground">Aucun restaurant lie a votre compte.</p>
        ) : null}
        {!restaurantsLoading && !restaurantsError && restaurants.length > 0 && !selectedRestaurant ? (
          <p className="text-muted-foreground">Selectionnez un restaurant depuis la barre laterale pour afficher les commandes.</p>
        ) : null}
        {selectedRestaurant ? (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Restaurant actif</p>
            <p className="text-sm font-semibold">{selectedRestaurant.name}</p>
          </div>
        ) : null}
        {ordersError ? (
          <p className="text-destructive">Erreur lors du chargement des commandes : {(ordersError as Error).message}</p>
        ) : null}

        {!restaurantsLoading && !restaurantsError && selectedRestaurant && !ordersError ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Periode</p>
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
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Date de reference</p>
                <Input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
              </div>
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Commandes visibles</p>
                <p className="text-2xl font-bold">{filteredOrders.length}</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Chiffre visible</p>
                <p className="text-2xl font-bold text-primary">{filteredOrdersRevenue.toFixed(2)} CHF</p>
              </div>
            </div>

            {filteredOrders.map((order) => {
              const tracking = order.delivery_tracking ?? null;
              const customer = order.customer;
              const items = order.order_items ?? [];
              const customerPhone = customer?.phone ?? "";
              const customerAddress = order.delivery_address ?? "Adresse non renseignee";
              const paymentMeta = (order.metadata || {}) as Record<string, any>;
              const paymentBreakdown = getOrderPaymentBreakdown(order);
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

              const isCancelled = normalizeOrderStatus(order.status) === "cancelled";

              return (
                <div 
                  key={order.id} 
                  className={cn(
                    "space-y-4 rounded-2xl border bg-card p-5 shadow-sm",
                    isCancelled && "opacity-60 grayscale-[0.3] pointer-events-none select-none"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">{order.order_number || `#${order.id.slice(0, 8)}`}</span>
                        <OrderStatusBadge status={normalizeOrderStatus(order.status)} />
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
                    <div className="flex items-center gap-3">
                      <div className="mr-4 text-right">
                        <p className="text-lg font-bold text-primary">{Number(order.total_amount).toFixed(2)} CHF</p>
                        {paymentBreakdown.tokOneTotalSaved > 0 ? (
                          <p className="mt-1 text-[11px] font-medium text-violet-600">
                            -{paymentBreakdown.tokOneTotalSaved.toFixed(2)} CHF Tok One
                          </p>
                        ) : null}
                        <div className="flex flex-col items-end">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paiement recu</p>
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
                      <Select 
                        value={normalizeOrderStatus(order.status)} 
                        onValueChange={(value) => updateStatus(order.id, value)}
                        disabled={isCancelled}
                      >
                        <SelectTrigger className="h-10 w-40 shadow-sm">
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
                          {scheduledLabel ? <div className="text-xs text-muted-foreground">Livraison planifiee : {scheduledLabel}</div> : null}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <Package2 className="h-4 w-4" />
                        Detail de la commande
                      </div>
                      <div className="space-y-2 rounded-xl bg-muted/30 p-3">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                                {item.quantity}
                              </span>
                              <span className="font-medium">{item.name || "Article"}</span>
                            </div>
                            <span className="text-muted-foreground">{Number(item.total_price).toFixed(2)} CHF</span>
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
                        <OrderPaymentBreakdown order={order} className="mt-3" />
                      </div>
                    </div>
                  </div>

                  {deliveryFlowStatus ? (
                    <div className="flex w-fit items-center gap-2 rounded-full bg-secondary/30 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                      <Bike className="h-3 w-3" />
                      LIVRAISON : {deliveryFlowStatus.toUpperCase()}
                    </div>
                  ) : null}

                  {canPreviewRoute ? (
                    <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">Parcours de livraison</p>
                          <p className="text-xs text-muted-foreground">
                            {routeSteps.length} etape(s) du retrait a la remise client.
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
            {filteredOrders.length === 0 ? <p className="py-8 text-center text-muted-foreground">Aucune commande pour la periode selectionnee.</p> : null}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
