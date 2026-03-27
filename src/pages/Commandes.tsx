import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Banknote,
  Clock,
  CreditCard,
  Gift,
  MapPin,
  Package,
  Percent,
  ShoppingCart,
  Sparkles,
  Truck,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { useToast } from "@/hooks/use-toast";
import {
  CUSTOMER_ORDERS_VIEWS,
  type CustomerOrdersView,
  buildCustomerOrdersHref,
  formatCustomerOrderPickupSchedule,
  getCustomerOrdersViewForOrder,
  getCustomerOrdersViewMeta,
  matchesCustomerOrdersView,
  normalizeCustomerOrdersView,
} from "@/lib/customerOrders";

const PAYMENT_LABELS: Record<string, { label: string; icon: typeof CreditCard }> = {
  card: { label: "Carte bancaire", icon: CreditCard },
  twint: { label: "TWINT", icon: CreditCard },
  cash: { label: "Especes", icon: Banknote },
};

const VIEW_FILTERS: Array<{ value: CustomerOrdersView; label: string }> = [
  { value: CUSTOMER_ORDERS_VIEWS.all, label: "Toutes" },
  { value: CUSTOMER_ORDERS_VIEWS.antiWaste, label: "Anti-gaspi" },
  { value: CUSTOMER_ORDERS_VIEWS.flash, label: "Flash" },
];

function PaymentBreakdown({ order }: { order: any }) {
  const meta = (order.metadata || {}) as any;
  const subtotal = Number(meta.pre_discount_subtotal || 0);
  const formulaDiscount = Number(meta.formula_discount_amount || 0);
  const flexDiscount = Number(meta.flex_discount || meta.flex_discount_amount || 0);
  const pointsDiscount = Number(meta.points_discount || meta.points_discount_amount || 0);
  const deliveryFee = Number(order.delivery_fee || 0);
  const qualityFee = Number(meta.quality_fee_amount || 0);
  const total = Number(order.total_amount);
  const paymentMethod = meta.payment_method || "card";
  const formulaName = meta.formula_applied;
  const flexOption = meta.flex_option;
  const hasBreakdown = subtotal > 0;

  if (!hasBreakdown) return null;

  const pm = PAYMENT_LABELS[paymentMethod] || PAYMENT_LABELS.card;
  const PmIcon = pm.icon;

  return (
    <div className="mt-3 space-y-1.5 border-t border-dashed pt-3 text-xs">
      <div className="flex justify-between text-muted-foreground">
        <span>Sous-total</span>
        <span>{subtotal.toFixed(2)} CHF</span>
      </div>
      {formulaDiscount > 0 ? (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1"><Percent className="h-3 w-3" />{formulaName || "Formule"}</span>
          <span>-{formulaDiscount.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {flexDiscount > 0 ? (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" />Remise Flex</span>
          <span>-{flexDiscount.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {pointsDiscount > 0 ? (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1"><Gift className="h-3 w-3" />Points fidelite</span>
          <span>-{pointsDiscount.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {deliveryFee > 0 ? (
        <div className="flex justify-between text-muted-foreground">
          <span className="flex items-center gap-1"><Truck className="h-3 w-3" />Livraison{flexOption ? ` (${flexOption})` : ""}</span>
          <span>+{deliveryFee.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {qualityFee > 0 ? (
        <div className="flex justify-between text-muted-foreground">
          <span>Garantie qualite</span>
          <span>+{qualityFee.toFixed(2)} CHF</span>
        </div>
      ) : null}
      <div className="flex justify-between pt-1 font-bold text-foreground">
        <span>Total</span>
        <span>{total.toFixed(2)} CHF</span>
      </div>
      <div className="flex items-center gap-1.5 pt-1 text-muted-foreground">
        <PmIcon className="h-3 w-3" />
        <span>Paye par {pm.label}</span>
      </div>
    </div>
  );
}

function getDisplayStatus(order: any) {
  const dispatchStatus = String(order.dispatch_job?.status || "");
  const trackingStatus = String(order.delivery_tracking?.status || "");

  if (dispatchStatus === "arriving_dropoff" || trackingStatus === "in_transit") return "delivering";
  if (dispatchStatus === "picked_up" || trackingStatus === "picked_up") return "picked_up";
  return normalizeOrderStatus(order.status);
}

function getOrderGroupKey(order: any) {
  return String((order.metadata as any)?.checkout_group_id || order.checkout_id || order.id);
}

function getGroupDomId(groupKey: string) {
  return `customer-order-group-${groupKey.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

export default function Commandes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const sessionId = params.get("session_id");

    if (status === "success" && sessionId) {
      const pendingOrderId = localStorage.getItem("stripe_pending_order_id");
      localStorage.removeItem("stripe_pending_order_id");
      window.history.replaceState({}, "", window.location.pathname);

      if (pendingOrderId) {
        toast({ title: "Paiement confirme", description: "Votre commande a bien ete payee." });
        navigate(`/commande/${pendingOrderId}`, { replace: true });
        return;
      }
    } else if (status === "cancelled") {
      toast({ title: "Paiement annule", description: "Vous pouvez reessayer depuis votre panier.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [navigate, toast]);

  const { data: ordersData, isLoading, error } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_orders_dashboard" as any);
      if (error) throw error;

      return ((data || []) as any[]).map((order) => ({
        ...order,
        metadata: order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
          ? order.metadata
          : {},
        restaurant: order.restaurant && typeof order.restaurant === "object" && !Array.isArray(order.restaurant)
          ? order.restaurant
          : null,
        order_items: Array.isArray(order.order_items) ? order.order_items : [],
        delivery_tracking: order.delivery_tracking && typeof order.delivery_tracking === "object" && !Array.isArray(order.delivery_tracking)
          ? order.delivery_tracking
          : null,
        dispatch_job: order.dispatch_job && typeof order.dispatch_job === "object" && !Array.isArray(order.dispatch_job)
          ? order.dispatch_job
          : null,
      }));
    },
  });

  const orders = (ordersData || []).filter((order) => (order.metadata as any)?.feature !== "zero-attente");
  const hasExplicitView = searchParams.get("view") !== null;
  const requestedView = normalizeCustomerOrdersView(searchParams.get("view"));
  const focusOrderId = searchParams.get("focusOrderId");
  const focusOrder = useMemo(
    () => orders.find((order) => String(order.id) === String(focusOrderId || "")) || null,
    [focusOrderId, orders],
  );
  const activeView = hasExplicitView
    ? requestedView
    : focusOrder
      ? getCustomerOrdersViewForOrder(focusOrder)
      : CUSTOMER_ORDERS_VIEWS.all;
  const viewMeta = getCustomerOrdersViewMeta(activeView);

  const groupedOrders = useMemo(() => {
    const grouped = new Map<string, any[]>();

    for (const order of orders) {
      const groupKey = getOrderGroupKey(order);
      const current = grouped.get(groupKey) || [];
      current.push(order);
      grouped.set(groupKey, current);
    }

    return Array.from(grouped.entries())
      .map(([groupKey, groupOrders]) => ({
        groupKey,
        orders: [...groupOrders].sort(
          (left, right) => Date.parse(String(right.created_at || "")) - Date.parse(String(left.created_at || "")),
        ),
      }))
      .sort(
        (left, right) =>
          Date.parse(String(right.orders[0]?.created_at || "")) - Date.parse(String(left.orders[0]?.created_at || "")),
      );
  }, [orders]);

  const viewCounts = useMemo(() => ({
    [CUSTOMER_ORDERS_VIEWS.all]: groupedOrders.length,
    [CUSTOMER_ORDERS_VIEWS.antiWaste]: groupedOrders.filter((group) =>
      group.orders.some((order) => matchesCustomerOrdersView(order, CUSTOMER_ORDERS_VIEWS.antiWaste)),
    ).length,
    [CUSTOMER_ORDERS_VIEWS.flash]: groupedOrders.filter((group) =>
      group.orders.some((order) => matchesCustomerOrdersView(order, CUSTOMER_ORDERS_VIEWS.flash)),
    ).length,
  }), [groupedOrders]);

  const filteredGroups = useMemo(() => (
    groupedOrders
      .map((group) => {
        const visibleOrders = group.orders.filter((order) => matchesCustomerOrdersView(order, activeView));
        if (visibleOrders.length === 0) return null;

        return {
          groupKey: group.groupKey,
          orders: visibleOrders,
          totalAmount: visibleOrders.reduce((sum, order) => sum + Number(order.total_amount), 0),
        };
      })
      .filter((group): group is { groupKey: string; orders: any[]; totalAmount: number } => !!group)
  ), [activeView, groupedOrders]);

  const highlightedGroupKey = useMemo(() => {
    if (!focusOrderId) return null;
    return filteredGroups.find((group) => group.orders.some((order) => String(order.id) === String(focusOrderId)))?.groupKey || null;
  }, [filteredGroups, focusOrderId]);

  useEffect(() => {
    if (!highlightedGroupKey) return;
    const target = document.getElementById(getGroupDomId(highlightedGroupKey));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlightedGroupKey]);

  const setView = (nextView: CustomerOrdersView) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextView === CUSTOMER_ORDERS_VIEWS.all) {
      nextParams.delete("view");
    } else {
      nextParams.set("view", nextView);
    }
    setSearchParams(nextParams);
  };

  return (
    <CustomerDashboardLayout>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="space-y-1">
            <h1 className="font-display text-3xl font-bold">{viewMeta.title}</h1>
            <p className="text-sm text-muted-foreground">{viewMeta.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {VIEW_FILTERS.map((filter) => {
              const isActive = filter.value === activeView;
              const count = viewCounts[filter.value] || 0;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setView(filter.value)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  <span>{filter.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${isActive ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {highlightedGroupKey ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
              Votre derniere commande correspondante est mise en avant ci-dessous.
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            Erreur lors du chargement des commandes : {(error as Error).message}
          </div>
        ) : filteredGroups.length > 0 ? (
          <div className="space-y-6">
            {filteredGroups.map((group) => {
              const mainOrder = group.orders[0];
              const isHighlighted = highlightedGroupKey === group.groupKey;

              return (
                <div
                  key={group.groupKey}
                  id={getGroupDomId(group.groupKey)}
                  className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${
                    isHighlighted ? "border-primary ring-2 ring-primary/20" : ""
                  }`}
                >
                  <div className={`flex items-center justify-between border-b p-4 ${isHighlighted ? "bg-primary/5" : "bg-muted/30"}`}>
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2"><Package className="h-5 w-5 text-primary" /></div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold">{mainOrder.order_number || `#${String(group.groupKey).slice(0, 8)}`}</p>
                          {isHighlighted ? <Badge className="bg-primary text-primary-foreground">Derniere commande</Badge> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(mainOrder.created_at).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{group.totalAmount.toFixed(2)} CHF</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{group.orders.length} commande(s)</p>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    {group.orders.map((order) => {
                      const displayStatus = getDisplayStatus(order);
                      const orderView = getCustomerOrdersViewForOrder(order);
                      const pickupScheduleLabel = formatCustomerOrderPickupSchedule(order.metadata);
                      const scheduledDeliveryLabel = typeof (order.metadata as any)?.scheduled_delivery_label === "string"
                        ? (order.metadata as any).scheduled_delivery_label
                        : "";
                      const featureBadge = orderView === CUSTOMER_ORDERS_VIEWS.antiWaste
                        ? { label: "Anti-gaspi", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" }
                        : orderView === CUSTOMER_ORDERS_VIEWS.flash
                          ? { label: "Flash", className: "bg-amber-500/10 text-amber-700 border-amber-500/20" }
                          : null;
                      const isTrackableDelivery = Boolean(
                        order.delivery_address &&
                        (order.metadata as any)?.feature !== "zero-attente" &&
                        !(order.metadata as any)?.pickup_time,
                      );

                      return (
                        <div key={order.id} className="space-y-3 rounded-2xl border p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold">{order.restaurant?.name || "Restaurant"}</h3>
                                {featureBadge ? (
                                  <Badge variant="outline" className={featureBadge.className}>
                                    {featureBadge.label}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {order.restaurant?.city || "Commande client"}
                              </p>
                            </div>
                            <OrderStatusBadge status={displayStatus} />
                          </div>

                          <div className="space-y-2 border-l-2 border-primary/10 pl-4">
                            {(order.order_items as any[]).map((item) => (
                              <div key={item.id} className="flex justify-between gap-4 text-xs">
                                <span>{item.quantity}x {item.name || "Article"}</span>
                                <span className="shrink-0 text-muted-foreground">{Number(item.total_price).toFixed(2)} CHF</span>
                              </div>
                            ))}
                          </div>

                          <PaymentBreakdown order={order} />

                          <div className="space-y-1.5 text-xs text-muted-foreground">
                            {pickupScheduleLabel ? (
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                <span>Retrait prevu : {pickupScheduleLabel}</span>
                              </div>
                            ) : null}
                            {scheduledDeliveryLabel ? (
                              <div className="flex items-center gap-1.5">
                                <Truck className="h-3.5 w-3.5" />
                                <span>Livraison planifiee : {scheduledDeliveryLabel}</span>
                              </div>
                            ) : null}
                            {order.delivery_address && !pickupScheduleLabel ? (
                              <div className="flex items-start gap-1.5">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{order.delivery_address}</span>
                              </div>
                            ) : null}
                            {order.notes ? <div>Note : {order.notes}</div> : null}
                          </div>

                          {displayStatus !== "delivered" && displayStatus !== "cancelled" && isTrackableDelivery ? (
                            <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                              <Link to={`/commande/${order.id}`}><MapPin className="mr-1 h-3 w-3" />Suivi temps reel</Link>
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2 py-12 text-center">
            <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{viewMeta.emptyLabel}</p>
            {activeView !== CUSTOMER_ORDERS_VIEWS.all ? (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to={buildCustomerOrdersHref()}>Voir tout l'historique</Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </CustomerDashboardLayout>
  );
}
