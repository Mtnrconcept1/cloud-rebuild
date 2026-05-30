import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import DeliveryMap from "@/components/DeliveryMap";
import DeliveryProofCard from "@/components/orders/DeliveryProofCard";
import OrderPaymentBreakdown, { getOrderPaymentBreakdown } from "@/components/orders/OrderPaymentBreakdown";
import { Progress } from "@/components/ui/progress";
import { Package, ChefHat, Bike, MapPin, CheckCircle2, Phone, Timer, ShoppingBag, Gift, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useState } from "react";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { useRealtimeDeliveryTracking, useRealtimeDispatchJob } from "@/hooks/useRealtimeOrder";
import { buildDeliveryRouteSteps } from "@/lib/deliveryRoute";

const supabase = getSupabase();

const STEPS = [
  { key: "preparing", label: "En préparation", icon: ChefHat, description: "Le restaurant prépare votre commande", countdownLabel: "Prêt dans" },
  { key: "picked_up", label: "Prise en charge", icon: Package, description: "Le livreur récupère votre commande", countdownLabel: "Départ dans" },
  { key: "in_transit", label: "En route", icon: Bike, description: "Le livreur est en chemin vers vous", countdownLabel: "Arrivée dans" },
  { key: "delivered", label: "Livrée", icon: CheckCircle2, description: "Votre commande a été livrée !", countdownLabel: "" },
];

// Simulated route: Lausanne area (Swiss context)
const RESTAURANT = { lat: 46.5197, lng: 6.6323 };
const DELIVERY = { lat: 46.5285, lng: 6.6270 };

function generateRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }, points: number) {
  const route = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    // Add slight curve for realism
    const jitterLat = Math.sin(t * Math.PI) * 0.002 * (Math.random() - 0.5);
    const jitterLng = Math.cos(t * Math.PI * 2) * 0.001 * (Math.random() - 0.5);
    route.push({
      lat: from.lat + (to.lat - from.lat) * t + jitterLat,
      lng: from.lng + (to.lng - from.lng) * t + jitterLng,
    });
  }
  return route;
}

const COUNTDOWN_DURATION = 20; // seconds per phase

export default function SuiviCommande() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  // Simulation state
  const [simPhase, setSimPhase] = useState(0); // 0=preparing, 1=picked_up, 2=in_transit, 3=delivered
  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION);
  const [simDriverPos, setSimDriverPos] = useState(RESTAURANT);
  const [routeIndex, setRouteIndex] = useState(0);
  const [simStarted, setSimStarted] = useState(false);

  const { data: order } = useQuery({
    queryKey: ["order-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, restaurants(name, address, city, latitude, longitude)")
        .eq("id", id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const { data: siblingOrders } = useQuery({
    queryKey: ["sibling-orders", id, (order?.metadata as any)?.checkout_group_id || order?.checkout_id],
    queryFn: async () => {
      const checkoutGroupId = (order?.metadata as any)?.checkout_group_id;
      let query = supabase
        .from("orders")
        .select("*, restaurants(name, address, city, latitude, longitude)");

      if (checkoutGroupId) {
        query = query.filter("metadata->>checkout_group_id", "eq", checkoutGroupId);
      } else {
        query = query.eq("checkout_id", order!.checkout_id);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: !!order && (!!(order?.metadata as any)?.checkout_group_id || !!order?.checkout_id),
  });

  const orderIds = useMemo(() => {
    if (!order) return [];
    if (siblingOrders && siblingOrders.length > 0) return siblingOrders.map(o => o.id);
    return [order.id];
  }, [order, siblingOrders]);

  const { data: orderItems } = useQuery({
    queryKey: ["order-items", orderIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("*, menu_items(name)")
        .in("order_id", orderIds);
      return data || [];
    },
    enabled: orderIds.length > 0,
  });

  const { data: deliveryTrackingRow } = useQuery({
    queryKey: ["delivery-tracking", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_tracking")
        .select("*")
        .eq("order_id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: dispatchJobRow } = useQuery({
    queryKey: ["dispatch-job", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("dispatch_jobs")
        .select("*")
        .eq("order_id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { tracking: deliveryTrackingUpdate } = useRealtimeDeliveryTracking(id);
  const { dispatchJob: dispatchJobUpdate } = useRealtimeDispatchJob(id);

  const orders = useMemo(() => siblingOrders && siblingOrders.length > 0 ? siblingOrders : (order ? [order] : []), [siblingOrders, order]);
  const liveTracking = deliveryTrackingUpdate || deliveryTrackingRow;
  const liveDispatchJob = dispatchJobUpdate || dispatchJobRow;
  const hasLiveCourierFlow = Boolean(liveTracking || liveDispatchJob);
  const routeSteps = useMemo(() => buildDeliveryRouteSteps({
    routeGeometry: liveDispatchJob?.route_geometry,
    orders,
  }), [liveDispatchJob?.route_geometry, orders]);

  const routeOrigin = routeSteps.find((step) => step.type === "pickup" && step.latitude !== null && step.longitude !== null);
  const routeDestination = [...routeSteps]
    .reverse()
    .find((step) => step.type === "dropoff" && step.latitude !== null && step.longitude !== null);
  const routePoints = useMemo(() => generateRoute(
    routeOrigin && routeOrigin.latitude !== null && routeOrigin.longitude !== null
      ? { lat: routeOrigin.latitude, lng: routeOrigin.longitude }
      : RESTAURANT,
    routeDestination && routeDestination.latitude !== null && routeDestination.longitude !== null
      ? { lat: routeDestination.latitude, lng: routeDestination.longitude }
      : DELIVERY,
    40,
  ), [routeDestination, routeOrigin]);

  useEffect(() => {
    if (routePoints.length > 0 && !hasLiveCourierFlow) {
      setSimDriverPos(routePoints[Math.min(routeIndex, routePoints.length - 1)] || routePoints[0]);
    }
  }, [hasLiveCourierFlow, routeIndex, routePoints]);

  // Auto-start simulation when order loads and align with persisted order status
  useEffect(() => {
    if (!order || simStarted || hasLiveCourierFlow) return;

    const normalizedOrderStatus = normalizeOrderStatus((order as any).status);
    const phaseByOrderStatus: Record<string, number> = {
      pending: 0,
      preparing: 0,
      delivering: 2,
      delivered: 3,
      cancelled: 0,
    };

    setSimPhase(phaseByOrderStatus[normalizedOrderStatus] ?? 0);
    setSimStarted(true);
  }, [hasLiveCourierFlow, order, simStarted]);

  // Countdown timer for phases 0 (preparing) and 1 (picked_up)
  useEffect(() => {
    if (!simStarted || simPhase >= 3 || hasLiveCourierFlow) return;

    if (simPhase <= 1) {
      // Countdown phases
      if (countdown <= 0) {
        setSimPhase((p) => p + 1);
        setCountdown(COUNTDOWN_DURATION);
        return;
      }
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }

    if (simPhase === 2) {
      // Moving phase - advance driver along route
      if (routeIndex >= routePoints.length - 1) {
        setSimPhase(3);
        setSimDriverPos(routePoints[routePoints.length - 1] || DELIVERY);
        return;
      }
      const speed = (COUNTDOWN_DURATION * 1000) / routePoints.length; // spread over ~20s
        const timer = setTimeout(() => {
          const nextIdx = routeIndex + 1;
          setRouteIndex(nextIdx);
          setSimDriverPos(routePoints[nextIdx]);
      }, speed);
      return () => clearTimeout(timer);
    }
  }, [hasLiveCourierFlow, simStarted, simPhase, countdown, routeIndex, routePoints]);

  const livePhase = (() => {
    const dispatchStatus = String(liveDispatchJob?.status || "");
    const trackingStatus = String(liveTracking?.status || "");

    if (dispatchStatus === "delivered" || trackingStatus === "delivered" || normalizeOrderStatus(order?.status) === "delivered") {
      return 3;
    }
    if (dispatchStatus === "arriving_dropoff" || trackingStatus === "in_transit" || normalizeOrderStatus(order?.status) === "delivering") {
      return 2;
    }
    if (dispatchStatus === "picked_up" || trackingStatus === "picked_up" || normalizeOrderStatus(order?.status) === "picked_up") {
      return 1;
    }
    return 0;
  })();

  const currentPhase = hasLiveCourierFlow ? livePhase : simPhase;
  const currentStep = STEPS[currentPhase] || STEPS[3];
  const progress = ((currentPhase + 1) / STEPS.length) * 100;
  const currentDriverPos = hasLiveCourierFlow && liveTracking?.current_lat && liveTracking?.current_lng
    ? { lat: Number(liveTracking.current_lat), lng: Number(liveTracking.current_lng) }
    : simDriverPos;
  const driverName = liveTracking?.driver_name || "Mohamed B.";
  const driverPhone = liveTracking?.driver_phone || "0612345678";

  // Countdown display
  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const isDelivery = order.delivery_address && (order.metadata as any)?.feature !== "zero-attente" && !(order.metadata as any)?.pickup_time;

  const pickupTime = (order.metadata as any)?.pickup_time || (order.metadata as any)?.arrival_time;
  const modeLabel = (order.metadata as any)?.feature === "zero-attente" ? "Zero attente" : pickupTime ? "A emporter" : "Sur place";
  const totalAmount = orders.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0);
  const restaurantLabel = orders.length > 1 ? `${orders.length} restaurants` : (order.restaurants as any)?.name || "Restaurant";
  const ordersWithPricing = orders.filter((entry: any) => {
    const breakdown = getOrderPaymentBreakdown(entry);
    return breakdown.total > 0 || breakdown.subtotal > 0 || breakdown.tokOneTotalSaved > 0;
  });

  if (!isDelivery) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container py-12 max-w-2xl space-y-6">
          <div className="rounded-2xl border bg-card p-6 space-y-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="bg-accent/10 w-12 h-12 rounded-2xl flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-accent" />
              </div>
              <div className="space-y-1">
                <h1 className="font-display text-2xl font-bold">Confirmation de commande</h1>
                <p className="text-muted-foreground text-sm">
                  Votre commande est confirmee. Le suivi en temps reel s'applique uniquement aux livraisons.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Mode</p>
                <p className="text-sm font-semibold">{modeLabel}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Restaurant</p>
                <p className="text-sm font-semibold">{restaurantLabel}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total</p>
                <p className="text-sm font-semibold">{totalAmount.toFixed(2)} CHF</p>
              </div>
              {pickupTime && (
                <div className="rounded-xl border p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Heure</p>
                  <p className="text-sm font-semibold">{pickupTime}</p>
                </div>
              )}
            </div>

            {ordersWithPricing.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Detail du paiement</p>
                {ordersWithPricing.map((entry: any) => (
                  <div key={entry.id} className="rounded-xl border p-4">
                    {ordersWithPricing.length > 1 ? (
                      <p className="mb-3 text-sm font-semibold">{entry.restaurants?.name || "Restaurant"}</p>
                    ) : null}
                    <OrderPaymentBreakdown order={entry} showDivider={false} alwaysShowTotal />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild className="flex-1">
                <Link to="/commandes">Voir mes commandes</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link to="/recherche">Commander autre chose</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const hasRouteOverview = routeSteps.some((step) => step.type === "pickup")
    && routeSteps.some((step) => step.type === "dropoff");
  const showMap = hasLiveCourierFlow
    ? Boolean(currentDriverPos?.lat && currentDriverPos?.lng && (currentPhase >= 2 || hasRouteOverview))
    : (currentPhase >= 2 || hasRouteOverview);
  const showDriver = hasLiveCourierFlow ? Boolean(driverName) : currentPhase >= 1;
  const isDelivered = currentPhase >= 3;
  const orderMeta = (order.metadata || {}) as any;
  const scheduledDeliveryLabel = typeof orderMeta.scheduled_delivery_label === "string" ? orderMeta.scheduled_delivery_label : "";
  const deliveryProofCode = String(orderMeta.delivery_proof_code || "");
  const deliveryProofVerifiedAt = orderMeta.delivery_proof_verified_at || null;
  const showDeliveryProof = isDelivery && !!deliveryProofCode && !isDelivered;

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl space-y-6">
        {/* Title and Time */}
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold">{currentPhase >= 3 ? "Livrée" : "En route..."}</h1>
          <p className="text-sm text-muted-foreground">
            {currentPhase >= 3 ? "Arrivée à" : "Arrivée prévue"} {
              scheduledDeliveryLabel || (pickupTime ? pickupTime : "Bientôt")
            }
          </p>
        </div>

        {/* Timeline Status */}
        <div className="flex items-center gap-3 pt-2">
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse" />
          <p className="text-sm font-semibold">{currentPhase >= 3 ? "Votre commande a été livrée" : "Votre commande est en route"}</p>
        </div>

        {/* Central Graphic */}
        <div className="py-12 relative flex justify-center items-center">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/5" />
          <div className="relative">
            {currentPhase >= 3 ? (
              <CheckCircle2 className="w-32 h-32 text-green-500 drop-shadow-md" />
            ) : (
              <div className="relative">
                {/* Paper bag */}
                <div className="w-32 h-40 bg-[#f3cba5] rounded-t-sm rounded-b-md shadow-sm relative flex flex-col items-center justify-center border-t-4 border-[#e6b78c]">
                  <div className="w-12 h-12 bg-green-500 rounded-full" />
                </div>
                {/* Green dots floating */}
                <div className="absolute top-1/4 -left-8 w-3 h-3 bg-green-500 rounded-full animate-bounce shadow-sm" />
                <div className="absolute top-0 right-4 w-2 h-2 bg-green-500 rounded-full opacity-50" />
                {/* Shadow */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-24 h-4 bg-black/10 rounded-[100%] blur-[2px]" />
              </div>
            )}
          </div>
        </div>

        {/* Help box */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative w-12 h-12 shrink-0">
            <div className="w-full h-full bg-orange-100 rounded-full flex items-center justify-center overflow-hidden border">
              {orders.length > 1 ? <ShoppingBag className="h-6 w-6 text-orange-600" /> : <ChefHat className="h-6 w-6 text-orange-600" />}
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-background rounded-full flex items-center justify-center">
              <div className="w-4 h-4 bg-foreground rounded-full flex items-center justify-center">
                <span className="text-[8px] text-background">📞</span>
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-1">
            <p className="font-semibold">Besoin d'aide?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Le personnel du commerce livrera votre commande; le suivi de la commande ne sera donc pas aussi détaillé. Vous pouvez appeler le commerce pour en savoir plus sur votre livraison.
            </p>
          </div>
          <Button variant="secondary" className="w-full md:w-auto font-medium rounded-xl">
            <Phone className="h-4 w-4 mr-2" /> Appeler le commerce
          </Button>
        </div>

        {/* Delivery Details */}
        <div className="space-y-4 pt-6">
          <h2 className="text-lg font-bold">Détails de livraison</h2>
          <div className="space-y-4">
            <div className="flex gap-4">
              <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Adresse</p>
                <p className="text-sm text-muted-foreground">{order.delivery_address}</p>
              </div>
            </div>
            
            {orderMeta.delivery_apartment && (
              <div className="flex gap-4">
                <MapPin className="h-5 w-5 text-muted-foreground shrink-0 opacity-0" />
                <div>
                  <p className="text-sm font-semibold">Appartement/bureau/étage</p>
                  <p className="text-sm text-muted-foreground">{orderMeta.delivery_apartment}</p>
                </div>
              </div>
            )}
            
            {orderMeta.delivery_note && (
              <div className="flex gap-4">
                <MapPin className="h-5 w-5 text-muted-foreground shrink-0 opacity-0" />
                <div>
                  <p className="text-sm font-semibold">Notes</p>
                  <p className="text-sm text-muted-foreground">{orderMeta.delivery_note}</p>
                </div>
              </div>
            )}
            
            <div className="flex gap-4">
              <Package className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Option de livraison</p>
                <p className="text-sm text-muted-foreground">{orderMeta.flex_option === "express" ? "Express" : orderMeta.flex_option === "flex" ? "Flex" : "Standard"}</p>
              </div>
            </div>
          </div>
        </div>

        <hr className="border-border my-6" />

        {/* Order Summary */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Récapitulatif de la commande</h2>
          {orders.map((o: any) => {
            const items = orderItems?.filter((i: any) => i.order_id === o.id) || [];
            return (
              <div key={o.id} className="space-y-3">
                {orders.length > 1 && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    Restaurant : 🍔 <span className="uppercase font-semibold text-foreground">{o.restaurants?.name}</span>
                  </p>
                )}
                
                <div className="space-y-3">
                  {items.map((item: any) => (
                    <div key={item.id} className="flex gap-3 text-sm">
                      <div className="bg-secondary/50 text-secondary-foreground w-6 h-6 rounded flex items-center justify-center font-medium shrink-0">
                        {item.quantity}
                      </div>
                      <p className="flex-1">{item.menu_items?.name || "Article"}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          
          <div className="flex justify-between items-center pt-4 border-t font-bold mt-4">
            <span>Total</span>
            <span>{totalAmount.toFixed(2)} CHF</span>
          </div>
          
          <div className="flex items-center gap-3 pt-2">
            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center shrink-0">
              {/* Twint Logo Placeholder */}
              <span className="font-bold text-xs tracking-tighter italic">TWINT</span>
            </div>
            <span className="text-sm font-medium">{orderMeta.payment_method === "twint" ? "Twint" : "Carte Bancaire"}</span>
          </div>
        </div>

        {/* Referral */}
        <div className="mt-8 mb-12 bg-accent/5 rounded-2xl p-4 flex items-center gap-4 border border-accent/20">
          <div className="w-16 h-16 shrink-0 flex items-center justify-center text-3xl">
            🎁
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium">Obtenez 10 CHF de rabais lorsque vos amis essaient Tok.</p>
            <Button variant="secondary" size="sm" className="rounded-full bg-background" asChild>
              <Link to="/profil">
                Invitez vos amis <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>

      </div>
    </main>
  );
}
