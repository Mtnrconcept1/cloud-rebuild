import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Megaphone,
  MoonStar,
  Rocket,
  ShoppingCart,
  SunMedium,
  TrendingUp,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type RestaurantDashboardHomeOrder = {
  id: string;
  createdAt: string | null;
  totalAmount: number;
  status: string;
};

export type RestaurantDashboardHomeReservation = {
  id: string;
  date: string;
  time: string;
  partySize: number;
  status: string;
  servicePeriodLabel: string;
};

type DashboardTone = "violet" | "orange" | "emerald" | "amber" | "sky";

const DASHBOARD_TONES: Record<DashboardTone, {
  card: string;
  icon: string;
  glow: string;
}> = {
  violet: {
    card: "tok-tone-violet",
    icon: "tok-kpi-icon",
    glow: "tok-tone-overlay",
  },
  orange: {
    card: "tok-tone-orange",
    icon: "tok-kpi-icon",
    glow: "tok-tone-overlay",
  },
  emerald: {
    card: "tok-tone-emerald",
    icon: "tok-kpi-icon",
    glow: "tok-tone-overlay",
  },
  amber: {
    card: "tok-tone-amber",
    icon: "tok-kpi-icon",
    glow: "tok-tone-overlay",
  },
  sky: {
    card: "tok-tone-sky",
    icon: "tok-kpi-icon",
    glow: "tok-tone-overlay",
  },
};

function formatRestaurantDashboardChf(value: number) {
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 2,
  }).format(Math.max(0, value));
}

function formatOrderDate(value: string | null) {
  if (!value) return "Aujourd'hui";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Aujourd'hui" : date.toLocaleDateString("fr-FR");
}

function DashboardStatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone: DashboardTone;
}) {
  const toneClasses = DASHBOARD_TONES[tone];

  return (
    <div className={cn(
      "tok-dashboard-kpi relative overflow-hidden rounded-3xl p-5 transition-transform hover:-translate-y-0.5",
      toneClasses.card,
    )}>
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 dark:opacity-100", toneClasses.glow)} />
      <div className="relative z-10 flex items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-5">
          <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl sm:h-20 sm:w-20", toneClasses.icon)}>
            <Icon className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground dark:text-slate-100">{label}</p>
            <p className="tok-kpi-value mt-2 break-words text-4xl font-bold tracking-tight">{value}</p>
          </div>
        </div>
        <div className={cn("hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:flex", toneClasses.icon)}>
          <ArrowRight className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function ActualitesBoostBanner({ enabled }: { enabled: boolean }) {
  return (
    <section
      aria-label="Mettre votre restaurant en avant"
      className="relative isolate overflow-hidden rounded-[1.35rem] bg-[#ff4b00] bg-[image:url('/fondbanniere.png')] bg-cover bg-center shadow-xl shadow-orange-500/20 max-sm:h-[33rem] max-sm:rounded-[1.15rem] max-sm:bg-[image:url('/fondbanniere2.png')]"
    >
      <div className="relative z-10 grid min-h-[22rem] grid-cols-[minmax(0,1.1fr)_minmax(15rem,0.86fr)] gap-4 px-5 pb-5 pt-4 sm:min-h-[20rem] sm:px-6 sm:py-6 md:grid-cols-[minmax(18rem,1.1fr)_minmax(16rem,0.82fr)] md:items-center lg:min-h-[21rem] max-sm:block max-sm:h-full max-sm:min-h-0 max-sm:p-0">
        <div className="relative min-h-[19rem] sm:min-h-[20rem] max-sm:absolute max-sm:inset-0 max-sm:min-h-0">
          <img
            src="/chef3.png"
            alt="Ton resto mis en avant à partir de CHF 1.-"
            loading="lazy"
            className="absolute left-[-2.8rem] top-0 ml-[9px] mt-[-35px] h-[28rem] w-[34rem] max-w-none object-contain object-top pl-[39px] drop-shadow-2xl [mask-image:radial-gradient(ellipse_at_45%_42%,black_64%,transparent_88%)] sm:left-[-3.4rem] sm:top-[-0.25rem] sm:h-[29rem] sm:w-[36rem] md:left-[-3.75rem] md:h-[30rem] md:w-[36rem] lg:left-[-3.25rem] lg:h-[31rem] lg:w-[37rem] max-sm:left-[-4.55rem] max-sm:top-[-1.05rem] max-sm:ml-0 max-sm:mt-0 max-sm:h-auto max-sm:w-[29.5rem] max-sm:object-contain max-sm:pl-0"
          />
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-4 text-white md:pl-4 lg:pl-6 max-sm:absolute max-sm:inset-x-4 max-sm:bottom-4 max-sm:z-20 max-sm:gap-3">
          <div className="space-y-3 max-sm:mb-2 max-sm:ml-[12.5rem] max-sm:grid max-sm:grid-cols-1 max-sm:gap-2 max-sm:space-y-0">
            {[
              { icon: TrendingUp, title: "Plus de visibilité", body: "Soyez vu par des milliers de gourmands" },
              { icon: BellRing, title: "Plus de clients", body: "Attirez de nouveaux clients chaque jour" },
              { icon: Rocket, title: "Résultats rapides", body: "Des résultats dès les premières heures" },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-orange-600 shadow-lg shadow-orange-900/15 max-sm:h-8 max-sm:w-8">
                  <Icon className="h-5 w-5 max-sm:h-4 max-sm:w-4" aria-hidden="true" />
                </span>
                <span>
                  <strong className="block text-lg font-black leading-tight max-sm:text-[12px]">{title}</strong>
                  <span className="block text-sm font-medium leading-snug text-white/90 max-sm:text-[11px]">{body}</span>
                </span>
              </div>
            ))}
          </div>

          {enabled ? (
            <Button
              asChild
              className="mt-1 h-12 rounded-2xl bg-white px-5 text-base font-black text-orange-600 shadow-xl shadow-orange-900/20 transition hover:bg-orange-50 hover:text-orange-700 max-sm:h-11 max-sm:w-full max-sm:text-sm"
            >
              <Link to="/dashboard/actualites">Mettre mon restaurant en avant</Link>
            </Button>
          ) : (
            <Button
              type="button"
              disabled
              className="mt-1 h-12 rounded-2xl bg-white px-5 text-base font-black text-orange-600 opacity-100 shadow-xl shadow-orange-900/20 disabled:pointer-events-none disabled:opacity-100 max-sm:h-11 max-sm:w-full max-sm:text-sm"
            >
              Mise en avant simulée
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function RestaurantDashboardHomeView({
  restaurantName,
  totalUpcomingOrders,
  totalUpcomingReservations,
  todayRevenue,
  monthlyRevenue,
  activeCampaignsCount,
  todayServiceCounts,
  upcomingOrders,
  upcomingReservations,
  leadingContent,
  marketingEnabled = true,
  demoSnapshot = false,
}: {
  restaurantName: string;
  totalUpcomingOrders: number;
  totalUpcomingReservations: number;
  todayRevenue: number;
  monthlyRevenue: number;
  activeCampaignsCount: number;
  todayServiceCounts: { lunch: number; dinner: number };
  upcomingOrders: readonly RestaurantDashboardHomeOrder[];
  upcomingReservations: readonly RestaurantDashboardHomeReservation[];
  leadingContent?: ReactNode;
  marketingEnabled?: boolean;
  demoSnapshot?: boolean;
}) {
  return (
    <DashboardLayout>
      <div
        className="space-y-6"
        data-commercial-demo-source={demoSnapshot ? "isolated-snapshot" : undefined}
      >
        <DashboardPageHero
          badge="Dashboard restaurateur"
          title={<>Bonjour, <span className="text-[#ff6a1a]">{restaurantName}</span></>}
          description="Vue courte de l'activite du restaurant: commandes, réservations, service du jour et revenu du mois restent visibles sans chercher dans les onglets."
          icon={LayoutDashboard}
          tone="orange"
          visualLabel="Accueil"
          stats={[
            { label: "Commandes à venir", value: totalUpcomingOrders, icon: ShoppingCart },
            { label: "Réservations à venir", value: totalUpcomingReservations, icon: CalendarDays },
            { label: "CA du jour", value: formatRestaurantDashboardChf(todayRevenue), icon: TrendingUp },
          ]}
        />

        {leadingContent}

        <ActualitesBoostBanner enabled={marketingEnabled} />

        <div className="space-y-4">
          <DashboardStatCard label="Commandes à venir" value={String(totalUpcomingOrders)} icon={ShoppingCart} tone="violet" />
          <DashboardStatCard label="Réservations à venir" value={String(totalUpcomingReservations)} icon={CalendarDays} tone="orange" />
          <DashboardStatCard label="Chiffre d'affaires du jour" value={formatRestaurantDashboardChf(todayRevenue)} icon={TrendingUp} tone="emerald" />
          <DashboardStatCard label="Campagnes pub actives" value={String(activeCampaignsCount)} icon={Megaphone} tone="amber" />
          <DashboardStatCard label="Midi aujourd'hui" value={String(todayServiceCounts.lunch)} icon={SunMedium} tone="sky" />
          <DashboardStatCard label="Soir aujourd'hui" value={String(todayServiceCounts.dinner)} icon={MoonStar} tone="violet" />
          <DashboardStatCard label="Revenus du mois" value={formatRestaurantDashboardChf(monthlyRevenue)} icon={TrendingUp} tone="emerald" />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="tok-dashboard-section min-w-0 rounded-3xl border border-border/70">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex min-w-0 items-center gap-3 text-xl font-bold">
                <span className="tok-kpi-icon tok-tone-sky flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                  <FileText className="h-6 w-6" />
                </span>
                <span className="break-words">Commandes à venir</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingOrders.map((order) => (
                <div key={order.id} className="grid min-w-0 grid-cols-1 gap-2 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm dark:border-[#5f7aad]/22 dark:bg-[#07142b]/72 dark:text-slate-100 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <span className="min-w-0 break-words">{formatOrderDate(order.createdAt)}</span>
                  <span className="font-bold">{order.totalAmount.toFixed(2)} CHF</span>
                  <OrderStatusBadge status={order.status} />
                </div>
              ))}
              {upcomingOrders.length === 0 ? <p className="text-sm text-muted-foreground">Aucune commande à venir</p> : null}
            </CardContent>
          </Card>

          <Card className="tok-dashboard-section min-w-0 rounded-3xl border border-border/70">
            <CardHeader>
              <CardTitle className="flex min-w-0 items-center gap-3 text-xl font-bold">
                <span className="tok-kpi-icon tok-tone-orange flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                  <CalendarDays className="h-6 w-6" />
                </span>
                <span className="break-words">Réservations à venir</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingReservations.map((reservation) => (
                <div key={reservation.id} className="grid min-w-0 grid-cols-1 gap-2 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm dark:border-[#5f7aad]/22 dark:bg-[#07142b]/72 dark:text-slate-100 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="break-words">{new Date(reservation.date).toLocaleDateString("fr-FR")} a {reservation.time}</span>
                    <Badge variant="outline" className="text-[10px]">{reservation.servicePeriodLabel}</Badge>
                  </div>
                  <span>{reservation.partySize} pers.</span>
                  <OrderStatusBadge status={reservation.status} />
                </div>
              ))}
              {upcomingReservations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune réservation</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
