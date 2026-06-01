import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import {
  buildCheckoutCompletionFromDashboardOrders,
  type CheckoutCompletionResult,
  getOrderStripeSessionId,
  isOrderCheckoutFinalized,
  readPendingOrderCheckoutSessionId,
  writePendingOrderCheckoutSessionId,
} from "@/lib/orderConfirmation";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { invokeSupabaseFunction } from "@/lib/session";
import { buildAuthRedirectTarget, parseStripeReturnSearch } from "@/lib/stripeReturn";
import { useToast } from "@/hooks/use-toast";

const supabase = getSupabase();
const CHECKOUT_RECOVERY_ATTEMPTS = 8;
const CHECKOUT_RECOVERY_DELAY_MS = 1_250;

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
  const { user, session, loading: authLoading } = useAuth();
  const { clearCart } = useCart();
  const queryClient = useQueryClient();
  const stripeReturn = parseStripeReturnSearch(location.search);
  const processedSessionRef = useRef<string | null>(null);
  const reconnectPromptRef = useRef<string | null>(null);
  const [pendingCheckoutSessionId, setPendingCheckoutSessionId] = useState<string | null>(
    () => readPendingOrderCheckoutSessionId(),
  );
  const [state, setState] = useState<"processing" | "success" | "cancelled" | "error">(
    stripeReturn.status === "cancelled"
      ? "cancelled"
      : (stripeReturn.status === "success" || pendingCheckoutSessionId)
        ? "processing"
        : "error",
  );
  const [completion, setCompletion] = useState<CheckoutCompletionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const syncPendingCheckoutSessionId = useCallback((sessionId: string | null) => {
    writePendingOrderCheckoutSessionId(sessionId);
    setPendingCheckoutSessionId(sessionId);

    if (!sessionId) {
      processedSessionRef.current = null;
      reconnectPromptRef.current = null;
    }
  }, []);

  const finalizeSuccess = useCallback((result: CheckoutCompletionResult, sessionId: string) => {
    clearCart();
    localStorage.removeItem("stripe_pending_order_id");
    syncPendingCheckoutSessionId(null);
    setCompletion(result);
    setState("success");
    setErrorMessage(null);
    processedSessionRef.current = sessionId;

    queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    queryClient.invalidateQueries({ queryKey: ["profile-loyalty"] });
    queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["donated-meals-total"] });
    queryClient.invalidateQueries({ queryKey: ["donated-points-total"] });

    toast({
      title: "Paiement confirmé",
      description: result.orders.length > 1
        ? "Vos commandes sont confirmées."
        : "Votre commande est confirmée.",
    });
  }, [clearCart, queryClient, syncPendingCheckoutSessionId, toast]);

  const fetchOrdersByCheckoutSessionId = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase.rpc("get_customer_orders_dashboard" as any);
    if (error) {
      throw error;
    }

    return ((data || []) as any[])
      .map(normalizeDashboardOrder)
      .filter((order) => getOrderStripeSessionId(order) === sessionId);
  }, []);

  const recoverCompletedCheckout = useCallback(async (sessionId: string) => {
    for (let attempt = 0; attempt < CHECKOUT_RECOVERY_ATTEMPTS; attempt += 1) {
      const matchedOrders = await fetchOrdersByCheckoutSessionId(sessionId);

      if (matchedOrders.length > 0 && matchedOrders.every(isOrderCheckoutFinalized)) {
        return buildCheckoutCompletionFromDashboardOrders(matchedOrders);
      }

      if (attempt < CHECKOUT_RECOVERY_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, CHECKOUT_RECOVERY_DELAY_MS));
      }
    }

    return null;
  }, [fetchOrdersByCheckoutSessionId]);

  useEffect(() => {
    if (stripeReturn.status === "success" && stripeReturn.sessionId) {
      syncPendingCheckoutSessionId(stripeReturn.sessionId);
      setState("processing");
      setErrorMessage(null);

      if (location.search) {
        window.history.replaceState({}, "", location.pathname);
      }

      return;
    }

    if (stripeReturn.status === "cancelled") {
      syncPendingCheckoutSessionId(null);
      setState("cancelled");
      setErrorMessage(null);

      if (location.search) {
        window.history.replaceState({}, "", location.pathname);
      }

      return;
    }
  }, [location.pathname, location.search, stripeReturn.sessionId, stripeReturn.status, syncPendingCheckoutSessionId]);

  useEffect(() => {
    if (!pendingCheckoutSessionId || authLoading) {
      return;
    }

    const processingKey = `${user?.id || "guest"}:${pendingCheckoutSessionId}`;

    if (!user || !session?.access_token) {
      if (reconnectPromptRef.current !== processingKey) {
        reconnectPromptRef.current = processingKey;
        setErrorMessage("Reconnectez-vous pour finaliser et afficher le récapitulatif de votre commande.");
        setState("error");
      }
      return;
    }

    if (processedSessionRef.current === pendingCheckoutSessionId) {
      return;
    }

    processedSessionRef.current = pendingCheckoutSessionId;
    setState("processing");
    setErrorMessage(null);

    void (async () => {
      try {
        const { data, error } = await invokeSupabaseFunction<CheckoutCompletionResult>("complete-order-checkout", {
          body: { session_id: pendingCheckoutSessionId },
        });

        if (error) throw error;

        const completedOrders = Array.isArray(data?.orders) ? data.orders : [];
        if (completedOrders.length === 0) {
          throw new Error("Paiement valide, mais aucune commande n'a été retrouvee.");
        }

        finalizeSuccess(data ?? {
          orders: completedOrders,
          primaryOrderId: completedOrders[0]?.id ?? null,
          checkoutGroupId: null,
          orderReference: completedOrders[0]?.order_number ?? null,
          newlyFinalized: true,
        }, pendingCheckoutSessionId);
      } catch (error) {
        try {
          const recoveredCompletion = await recoverCompletedCheckout(pendingCheckoutSessionId);

          if (recoveredCompletion) {
            finalizeSuccess(recoveredCompletion, pendingCheckoutSessionId);
            return;
          }
        } catch {
          // Keep the original function error below.
        }

        processedSessionRef.current = null;
        const errorStatus =
          error && typeof error === "object" && "status" in error && typeof error.status === "number"
            ? error.status
            : null;
        const fallbackMessage =
          errorStatus === 401 || errorStatus === 403
            ? "Le paiement est valide, mais votre session doit être revalidee pour afficher le récapitulatif."
            : error instanceof Error
              ? error.message
              : "Impossible de finaliser le paiement.";

        setErrorMessage(fallbackMessage);
        setState("error");
      }
    })();
  }, [
    authLoading,
    finalizeSuccess,
    pendingCheckoutSessionId,
    recoverCompletedCheckout,
    session?.access_token,
    user,
  ]);

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
  const hasCheckoutContext = stripeReturn.isStripeReturn || Boolean(pendingCheckoutSessionId) || Boolean(completion);
  const reconnectHref = buildAuthRedirectTarget(location.pathname, location.search);

  if (!hasCheckoutContext) {
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
              Nous finalisons votre commande Stripe et preparons le récapitulatif.
            </p>
          </div>
        ) : null}

        {state === "cancelled" ? (
          <div className="space-y-4 rounded-3xl border bg-card p-8 shadow-sm">
            <div className="space-y-2 text-center">
              <CreditCard className="mx-auto h-10 w-10 text-muted-foreground" />
              <h1 className="font-display text-3xl font-bold">Paiement annulé</h1>
              <p className="text-sm text-muted-foreground">
                Votre panier a été conservé. Vous pouvez reprendre le paiement ou modifier votre commande.
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
              <h1 className="font-display text-3xl font-bold">Confirmation en échec</h1>
              <p className="text-sm text-destructive">
                {errorMessage || "Le paiement semble valide, mais la finalisation n'a pas abouti."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {!user ? (
                <Button asChild>
                  <Link to={reconnectHref}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Se reconnecter pour finaliser
                  </Link>
                </Button>
              ) : null}
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
                <h1 className="font-display text-3xl font-bold">Paiement confirmé</h1>
                <p className="text-sm text-muted-foreground">
                  {restaurantCount > 1
                    ? "Votre paiement a confirme plusieurs commandes. Retrouvez le détail ci-dessous."
                    : "Votre commande est bien enregistrée. Retrouvez le détail ci-dessous."}
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
                      {restaurantCount > 1 ? "Suivre la première commande" : "Suivre la commande"}
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
                <p className="mt-3 text-sm text-muted-foreground">Chargement du récapitulatif detaille...</p>
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
                          Livraison planifiée : {String(metadata.scheduled_delivery_label)}
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
