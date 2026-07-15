import { Link } from "react-router-dom";
import {
  Bell,
  Bike,
  CheckCircle2,
  Clock3,
  Coins,
  PackageCheck,
  ShoppingBag,
  Store,
  UserRound,
  Wifi,
} from "lucide-react";

import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import type { CommercialDemoActorSurface } from "@/lib/commercialDemoFrame";

const SURFACE_COPY: Record<CommercialDemoActorSurface, {
  eyebrow: string;
  title: string;
  description: string;
  primaryPath: string;
  primaryLabel: string;
  notificationsPath: string;
}> = {
  client: {
    eyebrow: "Espace client",
    title: "Bonjour Sophie",
    description: "Suivez votre commande et les actions du restaurant et du livreur en direct.",
    primaryPath: "/commandes",
    primaryLabel: "Voir ma commande",
    notificationsPath: "/notifications",
  },
  restaurant: {
    eyebrow: "Restaurant Démo TOK",
    title: "Vue d’ensemble",
    description: "Pilotez la commande reçue dans cette session de démonstration isolée.",
    primaryPath: "/dashboard/commandes",
    primaryLabel: "Gérer la commande",
    notificationsPath: "/dashboard/notifications",
  },
  courier: {
    eyebrow: "Espace livreur",
    title: "Bonjour Alex",
    description: "Consultez la mission générée par le restaurant et son évolution en direct.",
    primaryPath: "/courier/jobs",
    primaryLabel: "Voir mes missions",
    notificationsPath: "/courier/notifications",
  },
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Paiement test attendu",
  restaurant_received: "Reçue par le restaurant",
  restaurant_accepted: "Acceptée",
  preparing: "En préparation",
  ready_for_pickup: "Prête au retrait",
  picked_up: "Récupérée",
  delivering: "En livraison",
  delivered: "Livrée",
};

function formatChf(cents: number) {
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format((Number(cents) || 0) / 100);
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("fr-CH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function CommercialDemoActorOverview({ surface }: { surface: CommercialDemoActorSurface }) {
  const frame = useCommercialDemoFrame();
  const { unreadCount } = useNotificationCenter(50);
  if (!frame || frame.surface !== surface) return null;

  const copy = SURFACE_COPY[surface];
  const { order, mission, events } = frame.snapshot;
  const paid = order?.payment_status === "test_paid";
  const delivered = order?.status === "delivered";
  const status = surface === "courier"
    ? (mission?.status || "En attente")
    : (order ? ORDER_STATUS_LABELS[order.status] || order.status : "Aucune commande");
  const SurfaceIcon = surface === "client" ? UserRound : surface === "restaurant" ? Store : Bike;

  const metrics = surface === "client"
    ? [
        { label: "Commande active", value: order && !delivered ? "1" : "0", icon: ShoppingBag },
        { label: "Total test", value: order ? formatChf(order.total_amount_cents) : "0.00 CHF", icon: Coins },
        { label: "Notifications", value: String(unreadCount), icon: Bell },
      ]
    : surface === "restaurant"
      ? [
          { label: "Commande reçue", value: order && paid ? "1" : "0", icon: ShoppingBag },
          { label: "Recette test", value: paid && order ? formatChf(order.total_amount_cents) : "0.00 CHF", icon: Coins },
          { label: "Notifications", value: String(unreadCount), icon: Bell },
        ]
      : [
          { label: "Mission active", value: mission && !delivered ? "1" : "0", icon: Bike },
          { label: "Gain simulé", value: delivered ? "8.50 CHF" : "0.00 CHF", icon: Coins },
          { label: "Notifications", value: String(unreadCount), icon: Bell },
        ];

  return (
    <div className="space-y-6" data-testid={`commercial-demo-overview-${surface}`}>
      <header className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-background to-violet-500/10 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <SurfaceIcon className="h-4 w-4" />
              {copy.eyebrow}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{copy.title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{copy.description}</p>
          </div>
          <Badge variant="outline" className="w-fit shrink-0 border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-100">
            <Wifi className="mr-1.5 h-3.5 w-3.5" />
            Synchronisé en temps réel
          </Badge>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="min-h-11">
            <Link to={copy.primaryPath}>{copy.primaryLabel}</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 bg-background/70">
            <Link to={copy.notificationsPath}><Bell className="mr-2 h-4 w-4" />Notifications</Link>
          </Button>
          {surface === "courier" ? (
            <Button asChild variant="outline" className="min-h-11 bg-background/70">
              <Link to="/courier/earnings">Mes gains</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Résumé de la session">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</CardDescription>
              <CardTitle className="break-words text-2xl">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Card>
          <CardHeader>
            <CardTitle>État actuel</CardTitle>
            <CardDescription>Mis à jour par les actions réalisées dans les trois fenêtres.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 rounded-2xl border p-4">
              {delivered ? <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
              <div className="min-w-0">
                <p className="font-semibold">{status}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{order?.order_number || "La session attend sa première commande."}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activité en direct</CardTitle>
            <CardDescription>Les derniers événements communs aux dashboards.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length > 0 ? events.slice(-4).reverse().map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{event.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatEventTime(event.created_at)}</p>
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                L’activité apparaîtra dès la création de la commande.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
