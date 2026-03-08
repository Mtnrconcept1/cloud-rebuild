import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import DeliveryMap from "@/components/DeliveryMap";
import { Progress } from "@/components/ui/progress";
import { Package, ChefHat, Bike, MapPin, CheckCircle2, Phone, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState, useRef, useCallback } from "react";
import { normalizeOrderStatus } from "@/lib/orderStatus";

const STEPS = [
  { key: "preparing", label: "En préparation", icon: ChefHat, description: "Le restaurant prépare votre commande", countdownLabel: "Prêt dans" },
  { key: "picked_up", label: "Prise en charge", icon: Package, description: "Le livreur récupère votre commande", countdownLabel: "Départ dans" },
  { key: "in_transit", label: "En route", icon: Bike, description: "Le livreur est en chemin vers vous", countdownLabel: "Arrivée dans" },
  { key: "delivered", label: "Livrée", icon: CheckCircle2, description: "Votre commande a été livrée !", countdownLabel: "" },
];

// Simulated route: ~20 waypoints from restaurant to delivery
const RESTAURANT = { lat: 48.8566, lng: 2.3522 };
const DELIVERY = { lat: 48.8706, lng: 2.3477 };

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
  const [driverPos, setDriverPos] = useState(RESTAURANT);
  const [routePoints] = useState(() => generateRoute(RESTAURANT, DELIVERY, 40));
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
    queryKey: ["sibling-orders", order?.checkout_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, restaurants(name, address, city, latitude, longitude)")
        .eq("checkout_id", order!.checkout_id);
      return data || [];
    },
    enabled: !!order?.checkout_id,
  });

  const orders = siblingOrders && siblingOrders.length > 0 ? siblingOrders : (order ? [order] : []);

  // Auto-start simulation when order loads and align with persisted order status
  useEffect(() => {
    if (!order || simStarted) return;

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
  }, [order, simStarted]);

  // Countdown timer for phases 0 (preparing) and 1 (picked_up)
  useEffect(() => {
    if (!simStarted || simPhase >= 3) return;

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
        setDriverPos(DELIVERY);
        return;
      }
      const speed = (COUNTDOWN_DURATION * 1000) / routePoints.length; // spread over ~20s
      const timer = setTimeout(() => {
        const nextIdx = routeIndex + 1;
        setRouteIndex(nextIdx);
        setDriverPos(routePoints[nextIdx]);
      }, speed);
      return () => clearTimeout(timer);
    }
  }, [simStarted, simPhase, countdown, routeIndex, routePoints]);

  const currentStep = STEPS[simPhase] || STEPS[3];
  const progress = ((simPhase + 1) / STEPS.length) * 100;

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

  const showMap = simPhase >= 2;
  const showDriver = simPhase >= 1;
  const isDelivered = simPhase >= 3;

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold">Suivi de commande</h1>
            <OrderStatusBadge status={currentStep.key} />
          </div>
          <p className="text-sm text-muted-foreground">
            {orders.length > 1
              ? `${orders.length} restaurants · ${orders.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0).toFixed(2)} CHF`
              : `${(order?.restaurants as any)?.name} · ${Number(order?.total_amount).toFixed(2)} CHF`
            }
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Progression</span>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-3 bg-secondary/50 overflow-hidden rounded-full shadow-inner" />
        </div>

        {/* Countdown */}
        {simPhase < 2 && simStarted && (
          <div className="glass-morphism rounded-3xl p-10 text-center space-y-4 shadow-xl border-primary/10 animate-float relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />

            <p className="text-sm font-bold text-primary uppercase tracking-widest mb-1">{currentStep.countdownLabel}</p>
            <div className="flex items-center justify-center gap-4">
              <div className="relative">
                <Timer className="h-10 w-10 text-primary animate-pulse" />
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-150 animate-pulse" />
              </div>
              <span className="font-display text-6xl font-black text-primary tracking-tighter tabular-nums drop-shadow-sm">
                {formatCountdown(countdown)}
              </span>
            </div>
            <p className="text-lg font-medium text-foreground mt-2">{currentStep.description}</p>
            <div className="flex justify-center gap-1.5 mt-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`h-1.5 w-1.5 rounded-full ${i === simPhase ? 'bg-primary animate-bounce' : 'bg-primary/20'}`} style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* Transit progress */}
        {simPhase === 2 && (
          <div className="glass-morphism rounded-3xl p-8 text-center space-y-6 shadow-xl border-primary/10 animate-fade-in relative">
            <div className="flex items-center justify-between px-2">
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">Origine</span>
                <span className="text-sm font-bold">Restaurant</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-primary uppercase opacity-60">Destination</span>
                <span className="text-sm font-bold">Chez vous</span>
              </div>
            </div>

            <div className="relative pt-6 pb-2">
              <div className="absolute top-0 left-0 w-full h-1 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary/20 animate-shimmer" style={{ width: '100%' }} />
              </div>
              <Progress value={(routeIndex / (routePoints.length - 1)) * 100} className="h-2 flex-1 bg-transparent absolute top-0 left-0 w-full" />

              <div
                className="absolute top-[-10px] transition-all duration-500 ease-linear transform -translate-x-1/2"
                style={{ left: `${(routeIndex / (routePoints.length - 1)) * 100}%` }}
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/30 blur-md rounded-full scale-125 animate-pulse" />
                  <div className="bg-primary text-white p-2 rounded-full shadow-lg relative z-10">
                    <Bike className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>

            <p className="text-base font-bold text-foreground">
              Le livreur est à <span className="text-primary italic">{Math.round((routeIndex / (routePoints.length - 1)) * 100)}%</span> de sa destination
            </p>
          </div>
        )}

        {/* Delivered celebration */}
        {isDelivered && (
          <div className="text-center p-6 rounded-xl bg-accent/10 border border-accent/20 animate-scale-in">
            <CheckCircle2 className="h-12 w-12 text-accent mx-auto mb-2" />
            <p className="font-display text-xl font-bold text-accent">Commande livrée !</p>
            <p className="text-sm text-muted-foreground">Bon appétit ! 🎉</p>
          </div>
        )}

        {/* Steps and Restaurant Details */}
        <div className="space-y-4">
          {orders.length > 1 && simPhase === 0 && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Statut par restaurant</p>
              {orders.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between p-3 rounded-xl bg-card border shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                      <ChefHat className="h-4 w-4 text-orange-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{o.restaurants?.name}</p>
                      <p className="text-[10px] text-muted-foreground">{o.restaurants?.city}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-600 border-orange-200">
                    Préparation...
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1">
            {STEPS.map((step, i) => {
              const isActive = i === simPhase;
              const isDone = i < simPhase;
              const StepIcon = step.icon;
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-500 ${isActive ? "bg-primary/10 border border-primary/20" : isDone ? "bg-accent/5" : "opacity-30"
                    }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors duration-500 ${isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                    <StepIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium transition-colors duration-300 ${isActive ? "text-primary" : ""}`}>{step.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {isActive && orders.length > 1 && i === 1
                        ? "Le livreur récupère vos différentes commandes"
                        : step.description}
                    </p>
                  </div>
                  {isDone && <CheckCircle2 className="h-4 w-4 text-accent ml-auto" />}
                  {isActive && simPhase < 2 && (
                    <span className="text-xs font-mono text-primary font-bold tabular-nums">{formatCountdown(countdown)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Driver info */}
        {showDriver && (
          <div className="flex items-center gap-3 p-4 border rounded-xl bg-card animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg">🛵</div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Mohamed B.</p>
              <p className="text-xs text-muted-foreground">Votre livreur</p>
            </div>
            <a href="tel:0612345678" className="flex items-center gap-1 text-primary text-sm">
              <Phone className="h-4 w-4" />
              Appeler
            </a>
          </div>
        )}

        {/* Map */}
        {showMap && (
          <div className="space-y-2 animate-fade-in">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Position du livreur en temps réel
            </h2>
            <DeliveryMap
              restaurants={orders.map((o: any) => ({
                name: o.restaurants?.name || "Restaurant",
                latitude: o.restaurants?.latitude || RESTAURANT.lat,
                longitude: o.restaurants?.longitude || RESTAURANT.lng
              }))}
              deliveryLat={DELIVERY.lat}
              deliveryLng={DELIVERY.lng}
              currentLat={driverPos.lat}
              currentLng={driverPos.lng}
              status={currentStep.key}
            />
          </div>
        )}

        {/* Delivery address */}
        <div className="p-4 border rounded-xl bg-card space-y-1">
          <p className="text-xs text-muted-foreground">Adresse de livraison</p>
          <p className="text-sm font-medium">{order.delivery_address}</p>
        </div>
      </div>
    </main>
  );
}
