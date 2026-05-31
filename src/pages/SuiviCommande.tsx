import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  ChefHat,
  Clock3,
  Gift,
  MapPin,
  Package,
  Phone,
  Route,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";

import DeliveryMap from "@/components/DeliveryMap";
import OrderPaymentBreakdown from "@/components/orders/OrderPaymentBreakdown";
import { getOrderPaymentBreakdown } from "@/components/orders/order-payment-breakdown-utils";
import DeliveryProofCard from "@/components/orders/DeliveryProofCard";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { buildDeliveryRouteSteps } from "@/lib/deliveryRoute";
import { useRealtimeDeliveryTracking, useRealtimeDispatchJob, useRealtimeOrder } from "@/hooks/useRealtimeOrder";

const supabase = getSupabase();

const FALLBACK_RESTAURANT = { lat: 46.5197, lng: 6.6323 };
const FALLBACK_DELIVERY = { lat: 46.5285, lng: 6.6270 };
const SIMULATION_PHASE_SECONDS = 20;

const TRACKING_STEPS = [
  {
    key: "accepted",
    label: "Commande reçue",
    shortLabel: "Reçue",
    icon: Store,
    description: "Le restaurant a validé la réception de votre commande.",
  },
  {
    key: "preparing",
    label: "Préparation",
    shortLabel: "Préparation",
    icon: ChefHat,
    description: "Le restaurant prépare votre commande.",
  },
  {
    key: "ready",
    label: "Prête au retrait",
    shortLabel: "Prête",
    icon: Package,
    description: "La commande est prête et attend le livreur.",
  },
  {
    key: "picked_up",
    label: "Prise en charge",
    shortLabel: "Retirée",
    icon: Bike,
    description: "Le livreur a récupéré la commande.",
  },
  {
    key: "in_transit",
    label: "En route",
    shortLabel: "En route",
    icon: Truck,
    description: "Le livreur se dirige vers votre adresse.",
  },
  {
    key: "delivered",
    label: "Livrée",
    shortLabel: "Livrée",
    icon: CheckCircle2,
    description: "Votre commande a été livrée.",
  },
];

function generateRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }, points: number) {
  const route = [];
  for (let i = 0; i <= points; i += 1) {
    const t = i / points;
    route.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    });
  }
  return route;
}

function asMetadata(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getPhaseFromState(order: any, tracking: any, dispatchJob: any) {
  const status = normalizeOrderStatus(order?.status);
  const trackingStatus = String(tracking?.status || "");
  const dispatchStatus = String(dispatchJob?.status || "");

  if (
    status === "delivered" ||
    trackingStatus === "delivered" ||
    dispatchStatus === "delivered" ||
    dispatchJob?.delivered_at
  ) return 5;

  if (
    status === "delivering" ||
    status === "in_transit" ||
    trackingStatus === "in_transit" ||
    trackingStatus === "arriving_dropoff" ||
    dispatchStatus === "in_transit" ||
    dispatchStatus === "arriving_dropoff"
  ) return 4;

  if (
    status === "picked_up" ||
    trackingStatus === "picked_up" ||
    dispatchStatus === "picked_up" ||
    dispatchJob?.picked_up_at
  ) return 3;

  if (
    status === "ready" ||
    status === "ready_for_pickup" ||
    trackingStatus === "ready_for_pickup" ||
    dispatchStatus === "assigned" ||
    dispatchStatus === "accepted" ||
    dispatchStatus === "arriving_pickup"
  ) return 2;

  if (status === "preparing" || trackingStatus === "preparing") return 1;

  return 0;
}

function formatEta(value: string | null | undefined) {
  if (!value) return "Bientôt";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export default function SuiviCommande() {
  const { id } = useParams<{ id: string }>();
  useAuth();

  const [simulationPhase, setSimulationPhase] = useState(0);
  const [simulationCountdown, setSimulationCountdown] = useState(SIMULATION_PHASE_SECONDS);
  const [simulationRouteIndex, setSimulationRouteIndex] = useState(0);
  const [simulationStarted, setSimulationStarted] = useState(false);

  const { orderStatus: realtimeOrderStatus, lastUpdate: realtimeOrderUpdate } = useRealtimeOrder(id);
  const { tracking: deliveryTrackingUpdate } = useRealtimeDeliveryTracking(id);
  const { dispatchJob: dispatchJobUpdate } = useRealtimeDispatchJob(id);

  const { data: order } = useQuery({
    queryKey: ["order-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, restaurants(id, name, address, city, latitude, longitude, phone)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const liveOrder = useMemo(() => {
    if (!order) return null;
    return {
      ...order,
      status: realtimeOrderStatus || order.status,
      updated_at: realtimeOrderUpdate?.updated_at || order.updated_at,
      estimated_delivery_at: realtimeOrderUpdate?.estimated_delivery_at || order.estimated_delivery_at,
      actual_delivered_at: realtimeOrderUpdate?.actual_delivered_at || order.actual_delivered_at,
    };
  }, [order, realtimeOrderStatus, realtimeOrderUpdate]);

  const { data: siblingOrders } = useQuery({
    queryKey: ["sibling-orders", id, asMetadata(liveOrder?.metadata).checkout_group_id || liveOrder?.checkout_id],
    queryFn: async () => {
      const checkoutGroupId = asMetadata(liveOrder?.metadata).checkout_group_id;
      let query = supabase
        .from("orders")
        .select("*, restaurants(id, name, address, city, latitude, longitude, phone)");

      if (checkoutGroupId) {
        query = query.filter("metadata->>checkout_group_id", "eq", checkoutGroupId);
      } else {
        query = query.eq("checkout_id", liveOrder!.checkout_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!liveOrder && (!!asMetadata(liveOrder?.metadata).checkout_group_id || !!liveOrder?.checkout_id),
  });

  const orders = useMemo(() => {
    const rows = siblingOrders && siblingOrders.length > 0 ? siblingOrders : liveOrder ? [liveOrder] : [];
    return rows.map((row: any) => row.id === liveOrder?.id ? { ...row, ...liveOrder } : row);
  }, [liveOrder, siblingOrders]);

  const orderIds = useMemo(() => orders.map((entry: any) => entry.id).filter(Boolean), [orders]);

  const { data: orderItems } = useQuery({
    queryKey: ["order-items", orderIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*, menu_items(name)")
        .in("order_id", orderIds);
      if (error) throw error;
      return data || [];
    },
    enabled: orderIds.length > 0,
  });

  const { data: deliveryTrackingRow } = useQuery({
    queryKey: ["delivery-tracking", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_tracking")
        .select("*")
        .eq("order_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: dispatchJobRow } = useQuery({
    queryKey: ["dispatch-job", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatch_jobs")
        .select("*")
        .eq("order_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const liveTracking = deliveryTrackingUpdate || deliveryTrackingRow;
  const liveDispatchJob = dispatchJobUpdate || dispatchJobRow;
  const hasLiveCourierFlow = Boolean(liveTracking || liveDispatchJob);

  const routeSteps = useMemo(() => buildDeliveryRouteSteps({
    routeGeometry: liveDispatchJob?.route_geometry,
    orders,
    deliveryAddress: liveOrder?.delivery_address,
    deliveryLat: toNumber(asMetadata(liveOrder?.metadata).delivery_lat),
    deliveryLng: toNumber(asMetadata(liveOrder?.metadata).delivery_lng),
  }), [liveDispatchJob?.route_geometry, liveOrder?.delivery_address, liveOrder?.metadata, orders]);

  const routeOrigin = routeSteps.find((step) => step.type === "pickup" && step.latitude !== null && step.longitude !== null);
  const routeDestination = [...routeSteps].reverse().find((step) => step.type === "dropoff" && step.latitude !== null && step.longitude !== null);

  const simulationRoute = useMemo(() => generateRoute(
    routeOrigin && routeOrigin.latitude !== null && routeOrigin.longitude !== null
      ? { lat: routeOrigin.latitude, lng: routeOrigin.longitude }
      : FALLBACK_RESTAURANT,
    routeDestination && routeDestination.latitude !== null && routeDestination.longitude !== null
      ? { lat: routeDestination.latitude, lng: routeDestination.longitude }
      : FALLBACK_DELIVERY,
    60,
  ), [routeDestination, routeOrigin]);

  useEffect(() => {
    if (!liveOrder || simulationStarted || hasLiveCourierFlow) return;
    setSimulationPhase(getPhaseFromState(liveOrder, null, null));
    setSimulationStarted(true);
  }, [hasLiveCourierFlow, liveOrder, simulationStarted]);

  useEffect(() => {
    if (!simulationStarted || hasLiveCourierFlow || simulationPhase >= 5) return;

    if (simulationPhase < 4) {
      if (simulationCountdown <= 0) {
        setSimulationPhase((phase) => Math.min(phase + 1, 5));
        setSimulationCountdown(SIMULATION_PHASE_SECONDS);
        return;
      }
      const timer = window.setTimeout(() => setSimulationCountdown((seconds) => seconds - 1), 1000);
      return () => window.clearTimeout(timer);
    }

    if (simulationPhase === 4) {
      if (simulationRouteIndex >= simulationRoute.length - 1) {
        setSimulationPhase(5);
        return;
      }
      const timer = window.setTimeout(() => setSimulationRouteIndex((index) => index + 1), 450);
      return () => window.clearTimeout(timer);
    }
  }, [hasLiveCourierFlow, simulationCountdown, simulationPhase, simulationRoute.length, simulationRouteIndex, simulationStarted]);

  if (!liveOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const orderMeta = asMetadata(liveOrder.metadata);
  const isDelivery = Boolean(liveOrder.delivery_address) && orderMeta.feature !== "zero-attente" && !orderMeta.pickup_time;
  const pickupTime = orderMeta.pickup_time || orderMeta.arrival_time;
  const modeLabel = orderMeta.feature === "zero-attente" ? "Zero attente" : pickupTime ? "A emporter" : "Sur place";
  const totalAmount = orders.reduce((sum: number, entry: any) => sum + Number(entry.total_amount || 0), 0);
  const restaurantLabel = orders.length > 1 ? `${orders.length} restaurants` : liveOrder.restaurants?.name || "Restaurant";
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
                  Votre commande est confirmée. Le suivi en temps réel s'applique uniquement aux livraisons.
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
              {pickupTime ? (
                <div className="rounded-xl border p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Heure</p>
                  <p className="text-sm font-semibold">{pickupTime}</p>
                </div>
              ) : null}
            </div>

            {ordersWithPricing.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Détail du paiement</p>
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

  const phase = hasLiveCourierFlow ? getPhaseFromState(liveOrder, liveTracking, liveDispatchJob) : simulationPhase;
  const currentStep = TRACKING_STEPS[phase] || TRACKING_STEPS[0];
  const progress = Math.round(((phase + 1) / TRACKING_STEPS.length) * 100);
  const isDelivered = phase >= 5;
  const scheduledDeliveryLabel = typeof orderMeta.scheduled_delivery_label === "string" ? orderMeta.scheduled_delivery_label : "";
  const etaLabel = liveTracking?.estimated_arrival
    ? formatEta(liveTracking.estimated_arrival)
    : liveOrder.estimated_delivery_at
      ? formatEta(liveOrder.estimated_delivery_at)
      : scheduledDeliveryLabel || (phase < 4 && !hasLiveCourierFlow ? formatCountdown(simulationCountdown) : "Bientôt");
  const currentDriverPos = hasLiveCourierFlow && liveTracking?.current_lat && liveTracking?.current_lng
    ? { lat: Number(liveTracking.current_lat), lng: Number(liveTracking.current_lng) }
    : simulationRoute[Math.min(simulationRouteIndex, simulationRoute.length - 1)] || FALLBACK_RESTAURANT;
  const hasRouteOverview = routeSteps.some((step) => step.type === "pickup") && routeSteps.some((step) => step.type === "dropoff");
  const showDriver = hasLiveCourierFlow ? Boolean(liveTracking?.driver_name || liveTracking?.driver_phone || liveDispatchJob?.courier_id) : phase >= 3;
  const driverName = liveTracking?.driver_name || (liveDispatchJob?.courier_id ? "Coursier assigné" : "Coursier TOK");
  const driverPhone = liveTracking?.driver_phone || "";
  const deliveryProofCode = String(orderMeta.delivery_proof_code || "");
  const deliveryProofVerifiedAt = orderMeta.delivery_proof_verified_at || null;
  const showDeliveryProof = !!deliveryProofCode && !isDelivered;
  const restaurantPhone = liveOrder.restaurants?.phone || "";

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 max-w-3xl space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Route className="h-3.5 w-3.5" /> Suivi en temps réel
            </Badge>
            <OrderStatusBadge status={String(liveOrder.status || "pending")} />
          </div>
          <h1 className="font-display text-3xl font-bold">{isDelivered ? "Commande livrée" : currentStep.label}</h1>
          <p className="text-sm text-muted-foreground">
            {isDelivered ? "Livrée" : phase >= 4 ? "Arrivée prévue" : "Prochaine étape"} : {etaLabel}
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{currentStep.description}</p>
              <p className="text-xs text-muted-foreground">Le suivi change automatiquement lorsque le restaurant ou le livreur met à jour la commande.</p>
            </div>
            <div className="text-right text-sm font-bold text-primary">{progress}%</div>
          </div>
          <Progress value={progress} />
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
            {TRACKING_STEPS.map((step, index) => {
              const Icon = step.icon;
              const done = index <= phase;
              const active = index === phase;
              return (
                <div key={step.key} className={`rounded-xl border p-3 text-center ${active ? "border-primary bg-primary/5" : done ? "bg-emerald-50 border-emerald-100" : "bg-muted/30"}`}>
                  <div className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full ${done ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-[11px] font-semibold leading-tight">{step.shortLabel}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <DeliveryMap
            routeStops={routeSteps.filter((step) => step.latitude !== null && step.longitude !== null).map((step) => ({
              id: step.id,
              type: step.type,
              label: step.label,
              address: step.address || step.restaurantName || undefined,
              latitude: Number(step.latitude),
              longitude: Number(step.longitude),
            }))}
            currentLat={currentDriverPos.lat}
            currentLng={currentDriverPos.lng}
            status={currentStep.key}
            className="h-72 md:h-96"
          />
          {!hasRouteOverview ? (
            <div className="border-t p-3 text-xs text-muted-foreground">
              Carte affichée avec les coordonnées disponibles. Ajoutez les coordonnées du restaurant et de livraison pour un tracé complet.
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative w-12 h-12 shrink-0">
            <div className="w-full h-full bg-orange-100 rounded-full flex items-center justify-center overflow-hidden border">
              {showDriver ? <Bike className="h-6 w-6 text-orange-600" /> : <ChefHat className="h-6 w-6 text-orange-600" />}
            </div>
          </div>
          <div className="flex-1 space-y-1">
            <p className="font-semibold">{showDriver ? driverName : "Restaurant en charge"}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {showDriver
                ? "Le livreur met à jour la prise en charge, la position et la livraison depuis son espace coursier."
                : "Le restaurant doit confirmer la préparation puis indiquer quand la commande est prête pour le livreur."}
            </p>
          </div>
          {driverPhone ? (
            <Button variant="secondary" className="w-full md:w-auto font-medium rounded-xl" asChild>
              <a href={`tel:${driverPhone}`}><Phone className="h-4 w-4 mr-2" /> Appeler le livreur</a>
            </Button>
          ) : restaurantPhone ? (
            <Button variant="secondary" className="w-full md:w-auto font-medium rounded-xl" asChild>
              <a href={`tel:${restaurantPhone}`}><Phone className="h-4 w-4 mr-2" /> Appeler le commerce</a>
            </Button>
          ) : null}
        </div>

        {showDeliveryProof ? <DeliveryProofCard code={deliveryProofCode} verifiedAt={deliveryProofVerifiedAt} /> : null}

        <div className="space-y-4 pt-2">
          <h2 className="text-lg font-bold">Détails de livraison</h2>
          <div className="space-y-4">
            <div className="flex gap-4">
              <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Adresse</p>
                <p className="text-sm text-muted-foreground">{liveOrder.delivery_address}</p>
              </div>
            </div>
            {orderMeta.delivery_apartment ? (
              <div className="flex gap-4">
                <MapPin className="h-5 w-5 text-muted-foreground shrink-0 opacity-0" />
                <div>
                  <p className="text-sm font-semibold">Appartement/bureau/étage</p>
                  <p className="text-sm text-muted-foreground">{orderMeta.delivery_apartment}</p>
                </div>
              </div>
            ) : null}
            {orderMeta.delivery_note ? (
              <div className="flex gap-4">
                <MapPin className="h-5 w-5 text-muted-foreground shrink-0 opacity-0" />
                <div>
                  <p className="text-sm font-semibold">Notes</p>
                  <p className="text-sm text-muted-foreground">{orderMeta.delivery_note}</p>
                </div>
              </div>
            ) : null}
            <div className="flex gap-4">
              <Package className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Option de livraison</p>
                <p className="text-sm text-muted-foreground">{orderMeta.flex_option === "express" ? "Express" : orderMeta.flex_option === "flex" ? "Flex" : "Standard"}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <Clock3 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Créneau</p>
                <p className="text-sm text-muted-foreground">{scheduledDeliveryLabel || etaLabel}</p>
              </div>
            </div>
          </div>
        </div>

        <hr className="border-border my-6" />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Récapitulatif de la commande</h2>
            <span className="text-sm font-semibold text-muted-foreground">{restaurantLabel} · {totalAmount.toFixed(2)} CHF</span>
          </div>
          {orders.map((entry: any) => {
            const items = orderItems?.filter((item: any) => item.order_id === entry.id) || [];
            return (
              <div key={entry.id} className="space-y-3 rounded-2xl border p-4">
                {orders.length > 1 ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    Restaurant : <span className="font-semibold text-foreground">{entry.restaurants?.name}</span>
                  </p>
                ) : null}
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
                {ordersWithPricing.some((priced: any) => priced.id === entry.id) ? (
                  <OrderPaymentBreakdown order={entry} showDivider alwaysShowTotal />
                ) : null}
              </div>
            );
          })}

          <div className="flex justify-between items-center pt-4 border-t font-bold mt-4">
            <span>Total</span>
            <span>{totalAmount.toFixed(2)} CHF</span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center shrink-0">
              <span className="font-bold text-xs tracking-tighter italic">TWINT</span>
            </div>
            <span className="text-sm font-medium">{orderMeta.payment_method === "twint" ? "Twint" : "Carte Bancaire"}</span>
          </div>
        </div>

        <div className="mt-8 mb-12 bg-accent/5 rounded-2xl p-4 flex items-center gap-4 border border-accent/20">
          <div className="w-16 h-16 shrink-0 flex items-center justify-center text-3xl">
            <Gift className="h-8 w-8 text-accent" />
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
