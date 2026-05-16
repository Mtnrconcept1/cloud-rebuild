import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import {
  Banknote,
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
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { cancelOrderByCustomer } from "@/lib/orderMutations";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { parseStripeReturnSearch } from "@/lib/stripeReturn";
import { useToast } from "@/hooks/use-toast";

const supabase = getSupabase();

const PAYMENT_LABELS: Record<string, { label: string; icon: typeof CreditCard }> = {
  card: { label: "Carte bancaire", icon: CreditCard },
  twint: { label: "TWINT", icon: CreditCard },
  cash: { label: "Especes", icon: Banknote },
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
              <span className="block text-[10px] leading-4 text-muted-foreground">Reduction fidelite appliquee</span>
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

function getCheckoutSessionId(order: any) {
  const raw = order?.metadata?.stripe_session_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export default function Commandes() {
  const { user } = useAuth();
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
    toast({ title: "Panier rempli", description: "Vos articles ont ete ajoutes au panier." });
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
      toast({ title: "Commande annulee" });
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

  const orders = (ordersData || []).filter((order) => (order.metadata as any)?.feature !== "zero-attente");

  if (stripeReturn.isStripeReturn) {
    return <Navigate to={`/commande/confirmation${location.search}`} replace />;
  }

  return (
    <CustomerDashboardLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Mes commandes</h1>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            Erreur lors du chargement des commandes : {(error as Error).message}
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-6">
            {Object.entries(
              orders.reduce((acc, order) => {
                const groupKey = (order.metadata as any)?.checkout_group_id || order.checkout_id || order.id;
                if (!acc[groupKey]) acc[groupKey] = [];
                acc[groupKey].push(order);
                return acc;
              }, {} as Record<string, any[]>),
            ).map(([groupKey, groupOrders]) => {
              const mainOrder = groupOrders[0];
              const totalAmount = groupOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);

              return (
                <div key={groupKey} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <div className="flex items-center justify-between border-b bg-muted/30 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2"><Package className="h-5 w-5 text-primary" /></div>
                      <div>
                        <p className="text-sm font-bold">{mainOrder.order_number || `#${String(groupKey).slice(0, 8)}`}</p>
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
                      <p className="font-bold text-primary">{totalAmount.toFixed(2)} CHF</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{groupOrders.length} restaurant(s)</p>
                    </div>
                  </div>
                  <div className="space-y-4 p-4">
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
                              Livraison planifiee : {(order.metadata as any).scheduled_delivery_label}
                            </p>
                          ) : null}
                          {displayStatus === "pending_payment" ? (
                            <p className="text-xs text-muted-foreground">
                              Paiement en attente de confirmation. Si vous avez deja paye, utilisez la verification Stripe. Sinon, relancez la commande depuis votre panier.
                            </p>
                          ) : null}
                          {displayStatus === "payment_failed" ? (
                            <p className="text-xs text-muted-foreground">
                              Le paiement a echoue ou la session Stripe a expire. Vous pouvez relancer cette commande.
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {canTrackOrder ? (
                              <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                                <Link to={`/commande/${order.id}`}><MapPin className="mr-1 h-3 w-3" />Suivi temps reel</Link>
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
                                      Cette action est irreversible. Vous serez rembourse sous 5 a 10 jours ouvrables.
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
                                <RefreshCcw className="mr-1 h-3 w-3" />Commander a nouveau
                              </Button>
                            ) : null}
                          </div>
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
            <p className="text-muted-foreground">Aucune commande pour le moment</p>
          </div>
        )}
      </div>
    </CustomerDashboardLayout>
  );
}
