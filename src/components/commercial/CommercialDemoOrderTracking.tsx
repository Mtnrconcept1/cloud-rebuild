import { CheckCircle2, ChevronRight, Clock3, MapPin, PackageCheck, Store, Truck } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import TokAiSupportChat from "@/components/support/TokAiSupportChat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ORDER_STEPS = [
  { key: "restaurant_received", label: "Commande reçue", icon: Store },
  { key: "restaurant_accepted", label: "Acceptée", icon: CheckCircle2 },
  { key: "preparing", label: "En préparation", icon: Clock3 },
  { key: "ready_for_pickup", label: "Prête", icon: PackageCheck },
  { key: "picked_up", label: "Récupérée", icon: Truck },
  { key: "delivering", label: "En livraison", icon: MapPin },
  { key: "delivered", label: "Livrée", icon: CheckCircle2 },
] as const;

const STATUS_ORDER = [
  "awaiting_payment",
  "restaurant_received",
  "restaurant_accepted",
  "preparing",
  "ready_for_pickup",
  "picked_up",
  "delivering",
  "delivered",
] as const;

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "En attente du paiement Stripe Test",
  restaurant_received: "Payée · reçue par le restaurant",
  restaurant_accepted: "Acceptée par le restaurant",
  preparing: "En préparation",
  ready_for_pickup: "Prête à être récupérée",
  picked_up: "Récupérée par le livreur",
  delivering: "En cours de livraison",
  delivered: "Livrée",
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format(cents / 100);
}

export default function CommercialDemoOrderTracking() {
  const { id } = useParams<{ id: string }>();
  const frame = useCommercialDemoFrame();
  const snapshot = frame?.snapshot;
  const order = snapshot?.order;

  if (!frame || frame.surface !== "client" || !snapshot || !order || (id && id !== order.id)) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <Card className="rounded-[2rem]">
          <CardContent className="p-8 text-center">
            <PackageCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="mt-4 text-2xl font-black">Commande Démo introuvable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Cette vue n’affiche que la commande appartenant à la session commerciale isolée en cours.
            </p>
            <Button asChild className="mt-5 rounded-xl"><Link to="/commandes">Voir mes commandes</Link></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const currentIndex = STATUS_ORDER.indexOf(order.status as (typeof STATUS_ORDER)[number]);
  const paymentPaid = order.payment_status === "test_paid";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8" data-testid="commercial-demo-order-tracking">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-violet-300 text-violet-700 dark:text-violet-200">Stripe Test</Badge>
            <Badge variant="outline" className="rounded-full">Session Démo isolée</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-black sm:text-3xl">Suivi de la commande {order.order_number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{snapshot.demo_restaurant.name} · {STATUS_LABELS[order.status] || order.status}</p>
        </div>
        <Button asChild variant="outline" className="rounded-xl"><Link to="/commandes">Toutes mes commandes</Link></Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Card className="rounded-[2rem]">
          <CardHeader>
            <CardTitle>Progression en temps réel</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1" aria-label="Progression de la commande">
              {ORDER_STEPS.map((step) => {
                const stepIndex = STATUS_ORDER.indexOf(step.key);
                const done = currentIndex >= stepIndex;
                const active = currentIndex === stepIndex;
                const Icon = step.icon;
                return (
                  <li key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                        done ? "border-emerald-500 bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
                        active && "ring-4 ring-emerald-500/15",
                      )}>
                        <Icon className="h-4 w-4" />
                      </span>
                      {step.key !== "delivered" ? <span className={cn("h-8 w-px", done ? "bg-emerald-400" : "bg-border")} /> : null}
                    </div>
                    <div className="pt-2">
                      <p className={cn("text-sm font-semibold", !done && "text-muted-foreground")}>{step.label}</p>
                      {active ? <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Étape actuelle</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="rounded-[2rem]">
            <CardHeader><CardTitle className="text-lg">Récapitulatif</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {order.items.map((item, index) => (
                <div key={`${item.menu_item_id || item.name}:${index}`} className="flex items-start justify-between gap-3">
                  <span>{item.quantity}× {item.name}</span>
                  <span className="font-semibold">{formatMoney(item.quantity * item.unit_amount_cents)}</span>
                </div>
              ))}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between text-base font-black"><span>Total</span><span>{formatMoney(order.total_amount_cents)}</span></div>
                <p className="mt-2 text-xs text-muted-foreground">Paiement : {paymentPaid ? "confirmé par Stripe Test" : "en attente de Stripe Test"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem]">
            <CardContent className="space-y-3 p-5 text-sm">
              <div className="flex items-start gap-3"><Store className="mt-0.5 h-4 w-4 text-orange-600" /><div><p className="font-semibold">{snapshot.demo_restaurant.name}</p><p className="text-muted-foreground">{snapshot.demo_restaurant.address || snapshot.demo_restaurant.city || "Restaurant Démo TOK"}</p></div></div>
              <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 text-orange-600" /><div><p className="font-semibold">Livraison</p><p className="text-muted-foreground">{order.delivery_address}</p></div></div>
              {snapshot.mission?.courier_name ? <div className="flex items-start gap-3"><Truck className="mt-0.5 h-4 w-4 text-orange-600" /><div><p className="font-semibold">Livreur</p><p className="text-muted-foreground">{snapshot.mission.courier_name}</p></div></div> : null}
              <Button asChild variant="ghost" className="w-full justify-between rounded-xl"><Link to={`/restaurant/${snapshot.demo_restaurant.id}`}>Retour au restaurant <ChevronRight className="h-4 w-4" /></Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-5">
        <TokAiSupportChat
          orderId={order.id}
          restaurantId={snapshot.demo_restaurant.id}
          context={{ page: "suivi-commande", status: order.status, surface: "client" }}
          compact
        />
      </div>
    </main>
  );
}
