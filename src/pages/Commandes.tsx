import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Crown,
  Gift,
  MapPin,
  Package,
  Percent,
  RefreshCcw,
  ShoppingCart,
  Sparkles,
  Truck,
  XCircle,
} from "lucide-react";

import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
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
import { sortByColumn, type SortColumn, type SortDirection } from "@/lib/listSorting";
import { cancelOrderByCustomer } from "@/lib/orderMutations";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { parseStripeReturnSearch } from "@/lib/stripeReturn";
import { useToast } from "@/hooks/use-toast";

const supabase = getSupabase();

const PAYMENT_LABELS: Record<string, { label: string; icon: typeof CreditCard }> = {
  card: { label: "Carte bancaire", icon: CreditCard },
  twint: { label: "TWINT", icon: CreditCard },
  cash: { label: "Espèces", icon: Banknote },
};

function PaymentBreakdown({ order }: { order: any }) {
  const meta = (order.metadata || {}) as any;
  const subtotalFromItems = Array.isArray(order.order_items)
    ? order.order_items.reduce((sum: number, item: any) => sum + Number(item.total_price || 0), 0)
    : 0;
  const formulaDiscount = Number(meta.formula_discount_amount || 0);
  const promotionDiscount = Number(meta.promotion_discount_amount || 0);
  const tokOneDiscount = Number(meta.tok_one_discount_amount || 0);
  const tokOneDiscountPercent = Number(meta.tok_one_discount_percent || 0);
  const flexDiscount = Number(meta.flex_discount || meta.flex_discount_amount || 0);
  const pointsDiscount = Number(meta.points_discount || meta.points_discount_amount || 0);
  const deliveryFee = Number(order.delivery_fee || 0);
  const qualityFee = Number(meta.quality_fee_amount || 0);
  const total = Number(order.total_amount);
  const subtotal = Number(
    meta.pre_discount_subtotal
      || subtotalFromItems
      || Math.max(0, total - deliveryFee - qualityFee + formulaDiscount + promotionDiscount + tokOneDiscount + flexDiscount + pointsDiscount),
  );
  const tokOneMember = !!meta.tok_one_member;
  const tokOneDeliverySaved = Number(meta.tok_one_delivery_saved || 0);
  const paymentMethod = meta.payment_method || "card";
  const formulaName = meta.formula_applied;
  const promotionName = meta.promotion_applied;
  const flexOption = meta.flex_option;
  const hasBreakdown = subtotal > 0
    || formulaDiscount > 0
    || promotionDiscount > 0
    || tokOneDiscount > 0
    || tokOneDeliverySaved > 0
    || flexDiscount > 0
    || pointsDiscount > 0
    || deliveryFee > 0
    || qualityFee > 0;

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
      {promotionDiscount > 0 ? (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1"><Percent className="h-3 w-3" />{promotionName || "Promotion"}</span>
          <span>-{promotionDiscount.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {tokOneDiscount > 0 ? (
        <div className="flex justify-between text-violet-600">
          <span className="flex items-center gap-1"><Crown className="h-3 w-3" />Tok One{tokOneDiscountPercent > 0 ? ` (-${tokOneDiscountPercent.toFixed(0)}%)` : ""}</span>
          <span>-{tokOneDiscount.toFixed(2)} CHF</span>
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
          <span className="flex items-start gap-1">
            <Gift className="h-3 w-3" />
            <span>
              <span className="block">Miamz pris en charge par Tok</span>
              <span className="block text-[10px] leading-4 text-muted-foreground">Réduction fidélité appliquée</span>
            </span>
          </span>
          <span>-{pointsDiscount.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {tokOneMember && tokOneDeliverySaved > 0 ? (
        <div className="flex justify-between text-violet-600">
          <span className="flex items-center gap-1"><Crown className="h-3 w-3" />Livraison offerte (Tok One)</span>
          <span>-{tokOneDeliverySaved.toFixed(2)} CHF</span>
        </div>
      ) : deliveryFee > 0 ? (
        <div className="flex justify-between text-muted-foreground">
          <span className="flex items-center gap-1"><Truck className="h-3 w-3" />Livraison{flexOption ? ` (${flexOption})` : ""}</span>
          <span>+{deliveryFee.toFixed(2)} CHF</span>
        </div>
      ) : null}
      {qualityFee > 0 ? (
        <div className="flex justify-between text-muted-foreground">
          <span>Garantie qualité</span>
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

export default function Commandes() {
  const { user } = useAuth();
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
    clearCart();
    const items = (order.order_items as any[]) || [];
    for (const item of items) {
      const unitPrice = Number(item.total_price) / Math.max(item.quantity, 1);
      for (let i = 0; i < item.quantity; i += 1) {
        addItem({
          menuItemId: item.menu_item_id,
          name: item.name || "Article",
          price: unitPrice,
          restaurantId: order.restaurant_id,
          restaurantName: order.restaurant?.name || "Restaurant",
        });
      }
    }
    toast({ title: "Panier rempli", description: "Vos articles ont été ajoutes au panier." });
    navigate("/panier");
  };

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
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

  const { data: ordersData, isLoading, error } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
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
    return <Navigate to={`/commande/confirmation${location.search}`} replace />;
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
              onSortKeyChange={setSortKey}
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
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            Erreur lors du chargement des commandes : {(error as Error).message}
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
                    className="flex w-full items-center justify-between gap-4 bg-muted/30 p-4 text-left transition-colors hover:bg-muted/50"
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
                        <div key={order.id} className="space-y-3">
                          <div className="flex items-center justify-between">
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
                          <PaymentBreakdown order={order} />
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
                            {canTrackOrder ? (
                              <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                                <Link to={`/commande/${order.id}`}><MapPin className="mr-1 h-3 w-3" />Suivi temps réel</Link>
                              </Button>
                            ) : null}
                            {displayStatus === "pending_payment" && checkoutSessionId ? (
                              <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                                <Link to={`/commande/confirmation?session_id=${encodeURIComponent(checkoutSessionId)}&status=success`}>
                                  <CreditCard className="mr-1 h-3 w-3" />
                                  Verifier le paiement
                                </Link>
                              </Button>
                            ) : null}
                            {displayStatus === "confirmed" ? (
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
                                      Cette action est irréversible. Vous serez remboursé sous 5 à 10 jours ouvrables.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Non, garder</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => cancelMutation.mutate(order.id)}
                                    >
                                      Oui, annuler
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
          <div className="space-y-2 py-12 text-center">
            <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Aucune commande pour le moment</p>
          </div>
        )}
        <TokAiSupportChat context={{ page: "commandes" }} compact />
      </div>
    </CustomerDashboardLayout>
  );
}
