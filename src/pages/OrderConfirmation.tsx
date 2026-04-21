import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  CheckCircle2,
  CreditCard,
  History,
  Loader2,
  MapPin,
  Package,
  ShoppingCart,
  Store,
} from "lucide-react";

import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import OrderPaymentBreakdown from "@/components/orders/OrderPaymentBreakdown";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { invokeSupabaseFunction } from "@/lib/session";
import { parseStripeReturnSearch } from "@/lib/stripeReturn";
import { useToast } from "@/hooks/use-toast";

const supabase = getSupabase();

type CheckoutCompletionOrder = {
  id: string;
  order_number: string | null;
  restaurant_id: string;
  total_amount: number;
  status: string;
  payment_status: string;
};

type CheckoutCompletionResult = {
  orders: CheckoutCompletionOrder[];
  primaryOrderId: string | null;
  checkoutGroupId: string | null;
  orderReference: string | null;
  newlyFinalized: boolean;
};

function normalizeDashboardOrder(order: any) {
  return {
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
  };
}

export default function OrderConfirmation() {
  const location = useLocation();
  const { toast } = useToast();
  const { clearCart } = useCart();
  const queryClient = useQueryClient();
  const stripeReturn = parseStripeReturnSearch(location.search);
  const processedSessionRef = useRef<string | null>(null);
  const [state, setState] = useState<"processing" | "success" | "cancelled" | "error">(
    stripeReturn.status === "cancelled" ? "cancelled" : "processing",
  );
  const [completion, setCompletion] = useState<CheckoutCompletionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (stripeReturn.status !== "success" || !stripeReturn.sessionId) {
      return;
    }

    if (processedSessionRef.current === stripeReturn.sessionId) {
      return;
    }

    processedSessionRef.current = stripeReturn.sessionId;
    setState("processing");
    setErrorMessage(null);

    void (async () => {
      try {
        const { data, error } = await invokeSupabaseFunction<CheckoutCompletionResult>("complete-order-checkout", {
          body: { session_id: stripeReturn.sessionId },
        });

        if (error) throw error;

        const completedOrders = Array.isArray(data?.orders) ? data.orders : [];
        if (completedOrders.length === 0) {
          throw new Error("Paiement valide, mais aucune commande n'a ete retrouvee.");
        }

        clearCart();
        localStorage.removeItem("stripe_pending_order_id");
        setCompletion(data ?? null);
        setState("success");

        queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        queryClient.invalidateQueries({ queryKey: ["profile-loyalty"] });
        queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
        queryClient.invalidateQueries({ queryKey: ["donated-meals-total"] });
        queryClient.invalidateQueries({ queryKey: ["donated-points-total"] });

        toast({
          title: "Paiement confirme",
          description: completedOrders.length > 1
            ? "Vos commandes sont confirmees."
            : "Votre commande est confirmee.",
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Impossible de finaliser le paiement.");
        setState("error");
      }
    })();
  }, [clearCart, queryClient, stripeReturn.sessionId, stripeReturn.status, toast]);

  const orderIds = useMemo(
    () => (completion?.orders || []).map((order) => order.id),
    [completion],
  );

  const { data: detailedOrders = [], isLoading: detailsLoading } = useQuery({
    queryKey: ["checkout-confirmation-orders", orderIds],
    enabled: state === "success" && orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_orders_dashboard" as any);
      if (error) throw error;

      const expectedIds = new Set(orderIds);
      return ((data || []) as any[])
        .map(normalizeDashboardOrder)
        .filter((order) => expectedIds.has(order.id));
    },
  });

  const orders = detailedOrders.length > 0 ? detailedOrders : completion?.orders || [];
  const totalAmount = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const restaurantCount = orders.length;
  const primaryOrderId = completion?.primaryOrderId || (orders[0]?.id ?? null);
  const orderReference = completion?.orderReference || (orders[0]?.order_number ?? null);

  if (!stripeReturn.isStripeReturn) {
    return <Navigate to="/commandes" replace />;
  }

  return (
    <CustomerDashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        {state === "processing" ? (
          <div className="rounded-3xl border bg-card p-8 text-center shadow-sm">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-3xl font-bold">Confirmation du paiement</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Nous finalisons votre commande Stripe et preparons le recapitulatif.
            </p>
          </div>
        ) : null}

        {state === "cancelled" ? (
          <div className="space-y-4 rounded-3xl border bg-card p-8 shadow-sm">
            <div className="space-y-2 text-center">
              <CreditCard className="mx-auto h-10 w-10 text-muted-foreground" />
              <h1 className="font-display text-3xl font-bold">Paiement annule</h1>
              <p className="text-sm text-muted-foreground">
                Votre panier a ete conserve. Vous pouvez reprendre le paiement ou modifier votre commande.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/panier"><ShoppingCart className="mr-2 h-4 w-4" />Retour au panier</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/commandes"><History className="mr-2 h-4 w-4" />Mes commandes</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {state === "error" ? (
          <div className="space-y-4 rounded-3xl border border-destructive/20 bg-destructive/5 p-8 shadow-sm">
            <div className="space-y-2 text-center">
              <CreditCard className="mx-auto h-10 w-10 text-destructive" />
              <h1 className="font-display text-3xl font-bold">Confirmation en echec</h1>
              <p className="text-sm text-destructive">
                {errorMessage || "Le paiement semble valide, mais la finalisation n'a pas abouti."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/commandes"><History className="mr-2 h-4 w-4" />Mes commandes</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/panier"><ShoppingCart className="mr-2 h-4 w-4" />Retour au panier</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {state === "success" ? (
          <>
            <div className="space-y-4 rounded-3xl border bg-card p-8 shadow-sm">
              <div className="space-y-2 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                <h1 className="font-display text-3xl font-bold">Paiement confirme</h1>
                <p className="text-sm text-muted-foreground">
                  {restaurantCount > 1
                    ? "Votre paiement a confirme plusieurs commandes. Retrouvez le detail ci-dessous."
                    : "Votre commande est bien enregistree. Retrouvez le detail ci-dessous."}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border bg-muted/30 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Reference</p>
                  <p className="mt-1 font-semibold">{orderReference || "En cours"}</p>
                </div>
                <div className="rounded-2xl border bg-muted/30 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Restaurants</p>
                  <p className="mt-1 font-semibold">{restaurantCount}</p>
                </div>
                <div className="rounded-2xl border bg-muted/30 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total paye</p>
                  <p className="mt-1 font-semibold">{totalAmount.toFixed(2)} CHF</p>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                {primaryOrderId ? (
                  <Button asChild>
                    <Link to={`/commande/${primaryOrderId}`}>
                      <Package className="mr-2 h-4 w-4" />
                      {restaurantCount > 1 ? "Suivre la premiere commande" : "Suivre la commande"}
                    </Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline">
                  <Link to="/commandes"><History className="mr-2 h-4 w-4" />Mes commandes</Link>
                </Button>
              </div>
            </div>

            {detailsLoading ? (
              <div className="rounded-3xl border bg-card p-8 text-center shadow-sm">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                <p className="mt-3 text-sm text-muted-foreground">Chargement du recapitulatif detaille...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order: any) => {
                  const metadata = order.metadata || {};
                  const createdAt = order.created_at
                    ? new Date(order.created_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                    : null;

                  return (
                    <div key={order.id} className="rounded-3xl border bg-card p-6 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                            <Store className="h-3.5 w-3.5" />
                            {order.restaurant?.name || "Restaurant"}
                          </p>
                          <h2 className="font-semibold">{order.order_number || `Commande ${String(order.id).slice(0, 8)}`}</h2>
                          {createdAt ? (
                            <p className="text-sm text-muted-foreground">{createdAt}</p>
                          ) : null}
                        </div>
                        <OrderStatusBadge status={normalizeOrderStatus(order.status)} />
                      </div>

                      {order.delivery_address ? (
                        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{order.delivery_address}</span>
                        </p>
                      ) : null}

                      {metadata.pickup_time ? (
                        <p className="mt-4 text-sm text-muted-foreground">
                          Retrait prevu : {metadata.pickup_date || "aujourd'hui"} a {metadata.pickup_time}
                        </p>
                      ) : null}

                      {metadata.scheduled_delivery_label ? (
                        <p className="mt-4 text-sm text-muted-foreground">
                          Livraison planifiee : {String(metadata.scheduled_delivery_label)}
                        </p>
                      ) : null}

                      <div className="mt-4 space-y-2 border-l-2 border-primary/10 pl-4">
                        {(order.order_items || []).map((item: any) => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <span>{item.quantity}x {item.name || "Article"}</span>
                            <span className="text-muted-foreground">{Number(item.total_price || 0).toFixed(2)} CHF</span>
                          </div>
                        ))}
                      </div>

                      <OrderPaymentBreakdown order={order} className="mt-4" alwaysShowTotal />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    </CustomerDashboardLayout>
  );
}
