import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  MapPin,
  Package,
  RefreshCcw,
  ShoppingCart,
  XCircle,
} from "lucide-react";

import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import OperationProgressDialog from "@/components/ui/operation-progress-dialog";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import OrderPaymentBreakdown from "@/components/orders/OrderPaymentBreakdown";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import TokAiSupportChat from "@/components/support/TokAiSupportChat";
import SortControls from "@/components/list/SortControls";
import OperationViewToggle, { type OperationViewMode } from "@/components/operations/OperationViewToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { buildCustomerOrderGroups, type CustomerOrderGroup } from "@/lib/customerOrders";
import type { CommercialDemoSnapshot } from "@/lib/commercialDemoJourney";
import { sortByColumn, type SortColumn, type SortDirection } from "@/lib/listSorting";
import { cancelOrderByCustomer } from "@/lib/orderMutations";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { parseStripeReturnSearch } from "@/lib/stripeReturn";
import { useToast } from "@/hooks/use-toast";

const supabase = getSupabase();

function getDisplayStatus(order: any) {
  const dispatchStatus = String(order.dispatch_job?.status || "");
  const trackingStatus = String(order.delivery_tracking?.status || "");

  if (dispatchStatus === "arriving_dropoff" || trackingStatus === "in_transit") return "delivering";
  if (dispatchStatus === "picked_up" || trackingStatus === "picked_up") return "picked_up";
  return normalizeOrderStatus(order.status);
}

function getCheckoutSessionId(order: any) {
  const raw = order?.metadata?.stripe_session_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

type CustomerOrderSortKey = "created_at" | "order_number" | "restaurant" | "amount" | "status";

const CUSTOMER_ORDER_SORT_COLUMNS: SortColumn<CustomerOrderGroup, CustomerOrderSortKey>[] = [
  { key: "created_at", label: "Date", type: "date", getValue: (group) => group.mainOrder?.created_at },
  { key: "order_number", label: "Numero", type: "text", getValue: (group) => group.mainOrder?.order_number || group.title || group.groupKey },
  { key: "restaurant", label: "Nom du restaurant", type: "text", getValue: (group) => group.restaurantsLabel },
  { key: "amount", label: "Montant", type: "number", getValue: (group) => group.totalAmount },
  { key: "status", label: "Statut", type: "text", getValue: (group) => getDisplayStatus(group.mainOrder) },
];

const COMMERCIAL_DEMO_CLIENT_ORDER_STATUS: Record<string, string> = {
  awaiting_payment: "pending_payment",
  restaurant_received: "confirmed",
  restaurant_accepted: "accepted",
  preparing: "preparing",
  ready_for_pickup: "ready",
  courier_assigned: "accepted",
  courier_arrived_pickup: "ready",
  picked_up: "picked_up",
  delivering: "delivering",
  delivered: "delivered",
};

function buildCommercialDemoClientOrders(snapshot: CommercialDemoSnapshot) {
  const order = snapshot.order;
  if (!order) return [];

  const createdAt = order.created_at
    || order.updated_at
    || snapshot.session.created_at
    || new Date(0).toISOString();
  const status = COMMERCIAL_DEMO_CLIENT_ORDER_STATUS[order.status] || "confirmed";

  return [{
    id: order.id,
    user_id: "commercial-demo-client",
    restaurant_id: snapshot.demo_restaurant.id,
    checkout_id: order.stripe_session_id || null,
    order_number: order.order_number,
    created_at: createdAt,
    status,
    payment_status: order.payment_status === "test_paid" ? "paid" : order.payment_status,
    total_amount: Math.max(0, Number(order.total_amount_cents || 0) / 100),
    delivery_fee: 0,
    delivery_address: order.delivery_address,
    notes: "Commande simulée · paiement Stripe Test",
    metadata: {
      commercial_demo: true,
      commercial_demo_status: order.status,
      stripe_session_id: order.stripe_session_id || null,
      payment_method: "stripe_test",
      type: "delivery",
    },
    restaurant: {
      id: snapshot.demo_restaurant.id,
      name: snapshot.demo_restaurant.name,
    },
    order_items: order.items.map((item, index) => ({
      id: item.menu_item_id || `${order.id}-item-${index + 1}`,
      menu_item_id: item.menu_item_id || null,
      name: item.name,
      quantity: item.quantity,
      unit_price: Number(item.unit_amount_cents || 0) / 100,
      total_price: (Number(item.unit_amount_cents || 0) * Number(item.quantity || 0)) / 100,
    })),
    delivery_tracking: snapshot.mission ? {
      id: snapshot.mission.id,
      status: snapshot.mission.status,
      driver_name: snapshot.mission.courier_name || null,
    } : null,
    dispatch_job: snapshot.mission ? {
      id: snapshot.mission.id,
      status: snapshot.mission.status,
    } : null,
  }];
}

function LiveCommandes() {
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<CustomerOrderSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [viewMode, setViewMode] = useState<OperationViewMode>("details");
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { addItem, clearCart } = useCart();
  const queryClient = useQueryClient();
  const stripeReturn = parseStripeReturnSearch(location.search);

  const handleReorder = (order: any) => {
    const items = ((order.order_items as any[]) || []).map((item) => {
      const quantity = Math.max(1, Math.trunc(Number(item.quantity) || 1));
      const totalPrice = Number(item.total_price);
      const unitPrice = totalPrice / quantity;
      return { ...item, quantity, unitPrice };
    });
    const validItems = items.filter((item) =>
      typeof item.menu_item_id === "string"
      && item.menu_item_id.length > 0
      && Number.isFinite(item.unitPrice)
      && item.unitPrice >= 0
    );

    if (validItems.length === 0 || validItems.length !== items.length) {
      toast({
        title: "Commande non disponible",
        description: "Certains anciens articles ne peuvent plus être ajoutés automatiquement. Votre panier actuel a été conservé.",
        variant: "destructive",
      });
      return;
    }

    clearCart();
    for (const item of validItems) {
      for (let i = 0; i < item.quantity; i += 1) {
        addItem({
          menuItemId: item.menu_item_id,
          name: item.name || "Article",
          price: item.unitPrice,
          restaurantId: order.restaurant_id,
          restaurantName: order.restaurant?.name || "Restaurant",
        });
      }
    }
    toast({ title: "Panier rempli", description: "Vos articles ont été ajoutés au panier." });
    navigate("/panier");
  };

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      if (isCommercialDemoClient) {
        throw new Error("L’annulation d’une commande de démonstration est désactivée.");
      }
      const result = await cancelOrderByCustomer(orderId);
      if (!result.ok) {
        throw new Error(result.errorMessage || "Annulation impossible.");
      }
    },
    onSuccess: () => {
      toast({ title: "Commande annulée" });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: Boolean(user && !isCommercialDemoClient),
    queryFn: async () => {
      const { data, error: rpcError } = await supabase.rpc("get_customer_orders_dashboard" as any);
      if (rpcError) throw rpcError;

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

  const demoOrders = useMemo(
    () => isCommercialDemoClient && commercialDemoFrame
      ? buildCommercialDemoClientOrders(commercialDemoFrame.snapshot)
      : [],
    [commercialDemoFrame, isCommercialDemoClient],
  );
  const ordersData = isCommercialDemoClient ? demoOrders : ordersQuery.data;
  const isLoading = isCommercialDemoClient ? false : ordersQuery.isLoading;
  const error = isCommercialDemoClient ? null : ordersQuery.error;

  const orders = useMemo(() => (
    (ordersData || []).filter((order) => (order.metadata as any)?.feature !== "zero-attente")
  ), [ordersData]);
  const orderGroups = useMemo(() => (
    sortByColumn(buildCustomerOrderGroups(orders), CUSTOMER_ORDER_SORT_COLUMNS, {
      key: sortKey,
      direction: sortDirection,
    })
  ), [orders, sortDirection, sortKey]);
  const hasExpandedGroups = expandedGroups.size > 0;

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  if (stripeReturn.isStripeReturn) {
    return isCommercialDemoClient
      ? <Navigate to="/commandes" replace />
      : <Navigate to={`/commande/confirmation${location.search}`} replace />;
  }

  return (
    <CustomerDashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <h1 className="font-display text-3xl font-bold">Mes commandes</h1>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
            <SortControls
              columns={CUSTOMER_ORDER_SORT_COLUMNS}
              sortKey={sortKey}
              direction={sortDirection}
              onSortKeyChange={(key) => setSortKey(key as CustomerOrderSortKey)}
              onDirectionChange={setSortDirection}
              className="w-full sm:w-[440px]"
            />
            {hasExpandedGroups ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpandedGroups(new Set())}
                className="self-start sm:self-end"
              >
                <ChevronDown className="mr-2 h-4 w-4" />
                Tout replier
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Présentation des commandes</p>
            <p className="text-xs text-muted-foreground">Galerie pour parcourir, liste pour comparer, détails pour ouvrir une commande.</p>
          </div>
          <OperationViewToggle value={viewMode} onChange={setViewMode} ariaLabel="Mode de vue des commandes client" />
        </div>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="font-semibold text-destructive">Impossible de charger vos commandes.</p>
            <p className="mt-1 text-sm text-muted-foreground">Vos commandes restent enregistrées. Réessayez dans un instant.</p>
            <Button type="button" variant="outline" className="mt-4 gap-2" onClick={() => void ordersQuery.refetch()}>
              <RefreshCcw className="h-4 w-4" />Réessayer
            </Button>
          </div>
        ) : orderGroups.length > 0 ? (
          viewMode !== "details" ? (
            <div className={viewMode === "gallery" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
              {orderGroups.map((group) => {
                const mainOrder = group.mainOrder;
                const createdDate = new Date(mainOrder.created_at);
                const displayStatus = getDisplayStatus(mainOrder);
                const feature = String((mainOrder.metadata as any)?.feature || "");
                const typeLabel = group.isMealSubscription
                  ? "Formule abonnement"
                  : feature === "promo-progressive"
                    ? "Promo progressive"
                    : feature === "promo-formule"
                      ? "Formule promo"
                      : "À la carte";

                return (
                  <article key={group.groupKey} className="rounded-2xl border bg-card p-4 shadow-sm transition hover:border-primary/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-bold">
                            {group.isMealSubscription ? group.title : (mainOrder.order_number || `#${String(group.groupKey).slice(0, 8)}`)}
                          </p>
                          <OrderStatusBadge status={displayStatus} />
                        </div>
                        <p className="line-clamp-2 text-sm font-medium">{group.restaurantsLabel}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-full border bg-muted/30 px-2 py-1 text-[11px] font-semibold">{typeLabel}</span>
                          <span className="rounded-full border bg-muted/30 px-2 py-1 text-[11px]">
                            {createdDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                          <span className="rounded-full border bg-muted/30 px-2 py-1 text-[11px]">
                            {group.orderCount} commande{group.orderCount > 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-primary">{group.totalAmount.toFixed(2)} CHF</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {group.isMealSubscription ? "global" : `${group.orders.length} restaurant(s)`}
                        </p>
                      </div>
                    </div>
                    {viewMode === "gallery" ? (
                      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                        {group.orders.flatMap((order) => (order.order_items as any[]).slice(0, 2).map((item) => `${item.quantity}x ${item.name || "Article"}`)).slice(0, 4).join(" · ")}
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setExpandedGroups((current) => new Set(current).add(group.groupKey));
                        setViewMode("details");
                      }}
                    >
                      Voir le détail
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : (
          <div className="space-y-6">
            {orderGroups.map((group) => {
              const groupKey = group.groupKey;
              const groupOrders = group.orders;
              const mainOrder = group.mainOrder;
              const totalAmount = group.totalAmount;
              const isExpanded = expandedGroups.has(groupKey);
              const restaurantsLabel = group.restaurantsLabel;
              const createdDate = new Date(mainOrder.created_at);
              const dateLabel = createdDate.toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });
              const timeLabel = createdDate.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

              return (
                <div key={groupKey} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKey)}
                    aria-expanded={isExpanded}
                    className="flex w-full flex-col items-stretch gap-3 bg-muted/30 p-4 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="shrink-0 rounded-lg bg-primary/10 p-2"><Package className="h-5 w-5 text-primary" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold">
                            {group.isMealSubscription ? group.title : (mainOrder.order_number || `#${String(groupKey).slice(0, 8)}`)}
                          </p>
                          <OrderStatusBadge status={getDisplayStatus(mainOrder)} />
                        </div>
                        <p className="truncate text-sm font-medium">{restaurantsLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.isMealSubscription && group.subscriptionDaysLabel
                            ? `${group.subscriptionDaysLabel} - ${group.orderCount} commande${group.orderCount > 1 ? "s" : ""}`
                            : `${dateLabel} - ${timeLabel}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <div>
                        <p className="font-bold text-primary">{totalAmount.toFixed(2)} CHF</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {group.isMealSubscription ? "abonnement global" : `${groupOrders.length} restaurant(s)`}
                        </p>
                      </div>
                      <ChevronIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </button>
                  {isExpanded ? (
                    <div className="space-y-4 border-t p-4">
                    {groupOrders.map((order) => {
                      const displayStatus = getDisplayStatus(order);
                      const checkoutSessionId = getCheckoutSessionId(order);
                      const isTrackableDelivery = Boolean(
                        order.delivery_address
                        && (order.metadata as any)?.feature !== "zero-attente"
                        && !(order.metadata as any)?.pickup_time,
                      );
                      const canTrackOrder = isTrackableDelivery
                        && !["pending", "pending_payment", "payment_failed", "cancelled", "delivered"].includes(String(displayStatus));

                      return (
                        <div key={order.id} className="space-y-3 rounded-2xl border bg-background/80 p-4 shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">{order.restaurant?.name || "Restaurant"}</h3>
                            <OrderStatusBadge status={displayStatus} />
                          </div>
                          <div className="space-y-2 border-l-2 border-primary/10 pl-4">
                            {(order.order_items as any[]).map((item) => (
                              <div key={item.id} className="flex justify-between text-xs">
                                <span>{item.quantity}x {item.name || "Article"}</span>
                                <span className="text-muted-foreground">{Number(item.total_price).toFixed(2)} CHF</span>
                              </div>
                            ))}
                          </div>
                          <OrderPaymentBreakdown order={order} className="mt-3" />
                          {(order.metadata as any)?.scheduled_delivery_label ? (
                            <p className="text-xs text-muted-foreground">
                              Livraison planifiée : {(order.metadata as any).scheduled_delivery_label}
                            </p>
                          ) : null}
                          {displayStatus === "pending_payment" ? (
                            <p className="text-xs text-muted-foreground">
                              Paiement en attente de confirmation. Si vous avez déjà paye, utilisez la vérification Stripe. Sinon, relancez la commande depuis votre panier.
                            </p>
                          ) : null}
                          {displayStatus === "payment_failed" ? (
                            <p className="text-xs text-muted-foreground">
                              Le paiement a échoué ou la session Stripe a expiré. Vous pouvez relancer cette commande.
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {canTrackOrder && !isCommercialDemoClient ? (
                              <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                                <Link to={`/commande/${order.id}`}><MapPin className="mr-1 h-3 w-3" />Suivi temps réel</Link>
                              </Button>
                            ) : null}
                            {canTrackOrder && isCommercialDemoClient ? (
                              <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                                <Link to="/notifications"><MapPin className="mr-1 h-3 w-3" />Voir les mises à jour</Link>
                              </Button>
                            ) : null}
                            {displayStatus === "pending_payment" && checkoutSessionId && !isCommercialDemoClient ? (
                              <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                                <Link to={`/commande/confirmation?session_id=${encodeURIComponent(checkoutSessionId)}&status=success`}>
                                  <CreditCard className="mr-1 h-3 w-3" />
                                  Verifier le paiement
                                </Link>
                              </Button>
                            ) : null}
                            {displayStatus === "confirmed" && !isCommercialDemoClient ? (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive">
                                    <XCircle className="mr-1 h-3 w-3" />Annuler
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Annuler la commande ?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Cette action est irréversible. Si un paiement a été encaissé, le remboursement sera traité selon le moyen de paiement utilisé.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Non, garder</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => cancelMutation.mutate(order.id)}
                                      disabled={cancelMutation.isPending}
                                    >
                                      {cancelMutation.isPending ? "Annulation…" : "Oui, annuler"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ) : null}
                            {(displayStatus === "delivered"
                              || displayStatus === "cancelled"
                              || displayStatus === "payment_failed") ? (
                              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => handleReorder(order)}>
                                <RefreshCcw className="mr-1 h-3 w-3" />Commander à nouveau
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          )
        ) : (
          <div className="space-y-3 py-12 text-center">
            <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Aucune commande pour le moment.</p>
            <Button asChild variant="outline"><Link to="/recherche">Découvrir les restaurants</Link></Button>
          </div>
        )}
        {!isCommercialDemoClient ? <TokAiSupportChat context={{ page: "commandes" }} compact /> : null}
        <OperationProgressDialog
          open={cancelMutation.isPending}
          title="Annulation de la commande"
          description="TOK sécurise l’annulation, met à jour le restaurant et prépare le remboursement lorsqu’un paiement a déjà été encaissé."
          status="Annulation sécurisée"
          steps={["Vérification", "Annulation", "Mise à jour"]}
          estimatedDurationMs={12_000}
        />
      </div>
    </CustomerDashboardLayout>
  );
}


export default function Commandes() {
  return <LiveCommandes />;
}
