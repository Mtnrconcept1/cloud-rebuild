import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Receipt,
  ShoppingCart,
  Star,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";

import PerformanceAlerts from "@/components/dashboard/performance/PerformanceAlerts";
import PerformanceHeroStats from "@/components/dashboard/performance/PerformanceHeroStats";
import PerformanceServiceSplit from "@/components/dashboard/performance/PerformanceServiceSplit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  PerformanceActivityItem,
  PerformanceAlert,
  PerformanceServiceSummary,
  PerformanceTodaySnapshot,
} from "@/lib/dashboardPerformance";

function formatChf(value: number, digits = 2) {
  return `${value.toFixed(digits)} CHF`;
}

function translateStatus(status: string) {
  switch (status) {
    case "confirmed":
      return "Confirmée";
    case "pending":
      return "En attente";
    case "cancelled":
      return "Annulee";
    case "refused":
      return "Refusee";
    case "paid":
      return "Payee";
    default:
      return status || "Inconnu";
  }
}

function ActivityList({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: PerformanceActivityItem[];
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!items.length ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.subtitle}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{translateStatus(item.statusLabel)}</p>
                {item.amount > 0 ? <p className="text-xs text-muted-foreground">{formatChf(item.amount)}</p> : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function PerformanceTodayTab({
  snapshot,
  alerts,
  services,
  currentServiceLabel,
  recentOrders,
  recentReservations,
}: {
  snapshot: PerformanceTodaySnapshot;
  alerts: PerformanceAlert[];
  services: PerformanceServiceSummary;
  currentServiceLabel: string;
  recentOrders: PerformanceActivityItem[];
  recentReservations: PerformanceActivityItem[];
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-gradient-to-br from-background via-background to-muted/30 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Pilotage du jour</p>
            <h2 className="font-display text-2xl font-bold">Ce qu'il faut surveiller maintenant</h2>
            <p className="text-sm text-muted-foreground">
              Vue d'exploitation pour suivre le rythme du jour, le service en cours et les signaux faibles.
            </p>
          </div>
          <div className="rounded-2xl border bg-background/90 px-4 py-3 shadow-sm">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Service en cours</p>
            <p className="mt-1 text-lg font-semibold">{currentServiceLabel}</p>
          </div>
        </div>
      </div>

      <PerformanceHeroStats
        items={[
          {
            key: "today-revenue",
            label: "CA du jour",
            value: formatChf(snapshot.totalRevenue, 0),
            helper: `${snapshot.validOrdersCount} commandes valides`,
            icon: Receipt,
            accentClassName: "text-primary",
          },
          {
            key: "today-orders",
            label: "Commandes",
            value: String(snapshot.totalOrders),
            helper: `${snapshot.invalidOrdersCount} annulée(s) ou refusee(s)`,
            icon: ShoppingCart,
          },
          {
            key: "today-avg-ticket",
            label: "Ticket moyen",
            value: snapshot.avgTicket > 0 ? formatChf(snapshot.avgTicket, 1) : "-",
            helper: "Sur les commandes valides du jour",
            icon: TrendingUp,
          },
          {
            key: "today-reservations",
            label: "Reservations",
            value: String(snapshot.totalReservations),
            helper: "Reservations actives aujourd'hui",
            icon: CalendarDays,
          },
          {
            key: "today-cancel-rate",
            label: "Annulations",
            value: `${snapshot.cancelRate.toFixed(1)}%`,
            helper: "Taux sur les commandes du jour",
            icon: XCircle,
          },
          {
            key: "today-rating",
            label: "Satisfaction",
            value: snapshot.avgSatisfaction > 0 ? `${snapshot.avgSatisfaction.toFixed(1)}/5` : "-",
            helper: snapshot.reviewsCount > 0 ? `${snapshot.reviewsCount} avis aujourd'hui` : "Aucun avis aujourd'hui",
            icon: Star,
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <PerformanceAlerts alerts={alerts} />
        <PerformanceServiceSplit
          title="Services du jour"
          description="Comparaison rapide du midi et du soir pour voir ou se concentre l'activite."
          services={services}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ActivityList
          title="Dernieres commandes utiles"
          emptyLabel="Aucune commande utile sur là journée."
          items={recentOrders}
        />
        <ActivityList
          title="Dernieres réservations utiles"
          emptyLabel="Aucune réservation utile sur là journée."
          items={recentReservations}
        />
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Raccourcis utiles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[
            { href: "/dashboard/commandes", label: "Voir les commandes" },
            { href: "/dashboard/reservations", label: "Voir les réservations" },
            { href: "/dashboard/factures", label: "Voir la compta" },
            { href: "/dashboard/campagnes", label: "Voir les campagnes" },
          ].map((link) => (
            <Button key={link.href} asChild variant="outline">
              <Link to={link.href}>
                {link.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ))}
          <Button asChild variant="secondary">
            <Link to="/dashboard/performances">
              Revenir au cockpit
              <Target className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
