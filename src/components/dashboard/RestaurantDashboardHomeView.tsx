import type { ComponentType, ReactNode } from "react";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Megaphone,
  Menu,
  MoonStar,
  Plus,
  Rocket,
  ShoppingCart,
  Store,
  SunMedium,
  TrendingUp,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import NotificationBell from "@/components/notifications/NotificationBell";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";
import {
  isRestaurantOnboardingConfigurationRoute,
  useDashboardRestaurant,
} from "@/pages/dashboard/useDashboardRestaurant";

import "./RestaurantDashboardHomeView.css";

const EMPTY_MENU_ITEMS: RestaurantDashboardMobileMenuItem[] = [];
const EMPTY_TODAY_RESERVATIONS: RestaurantDashboardMobileReservation[] = [];

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

export type RestaurantDashboardMobileMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  image_url: string | null;
  category: string | null;
};

export type RestaurantDashboardMobileReservation = {
  id: string;
  date: string;
  time: string;
  party_size: number;
  status: string;
};

type DashboardTone = "violet" | "orange" | "emerald" | "amber" | "sky";

type MobileBottomNavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  feature?: string;
};

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

const MOBILE_BOTTOM_NAV_ITEMS: MobileBottomNavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, feature: "dashboard-overview" },
  { to: "/dashboard/menu", label: "Menu", icon: BookOpen, feature: "dashboard-menu" },
  { to: "/dashboard/commandes", label: "Commandes", icon: ShoppingCart, feature: "dashboard-commandes" },
  { to: "/dashboard/campagnes", label: "Marketing", icon: Megaphone, feature: "dashboard-campagnes" },
  { to: "/dashboard/mon-compte-facturation", label: "Compte", icon: UserRound, feature: "dashboard-billing" },
];

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

function normalizeSearchText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isDailyMenuItem(item: RestaurantDashboardMobileMenuItem) {
  const category = normalizeSearchText(item.category);
  return category.includes("jour")
    || category.includes("midi")
    || category.includes("daily")
    || category.includes("formule");
}

function formatTime(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  return `${match[1].padStart(2, "0")}h${match[2]}`;
}

function getNextReservationTime(rows: readonly RestaurantDashboardMobileReservation[]) {
  const now = new Date();
  const nowMinutes = (now.getHours() * 60) + now.getMinutes();
  const parsed = rows
    .map((row) => {
      const match = row.time.match(/^(\d{1,2}):(\d{2})/);
      if (!match) return null;
      return {
        minutes: (Number(match[1]) * 60) + Number(match[2]),
        label: formatTime(row.time),
      };
    })
    .filter((value): value is { minutes: number; label: string } => Boolean(value?.label))
    .sort((a, b) => a.minutes - b.minutes);

  return parsed.find((entry) => entry.minutes >= nowMinutes)?.label || null;
}

function readUserMetadataString(metadata: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getUserPresentation(
  user: ReturnType<typeof useAuth>["user"],
  restaurantName: string,
) {
  const metadata = (user?.user_metadata || {}) as Record<string, unknown>;
  const fullName = readUserMetadataString(metadata, [
    "full_name",
    "name",
    "display_name",
    "first_name",
  ]);
  const emailName = user?.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "";
  const fallbackName = restaurantName.split(/\s+/).filter(Boolean)[0] || "Chef";
  const nameSource = fullName || emailName || fallbackName;
  const firstName = nameSource.split(/\s+/).filter(Boolean)[0] || "Chef";
  const avatarUrl = readUserMetadataString(metadata, ["avatar_url", "picture", "photo_url"]);

  return { firstName, avatarUrl };
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T";
}

function formatSignedPercent(value: number) {
  const rounded = Math.round(Math.max(-99, Math.min(999, value)));
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function buildPerformanceBars(deltaPercent: number) {
  const normalized = Math.max(-40, Math.min(80, deltaPercent));
  const end = Math.max(34, Math.min(94, 58 + normalized * 0.45));
  return [
    Math.max(24, end - 34),
    Math.max(32, end - 22),
    Math.max(38, end - 12),
    end,
  ];
}

function DashboardStatCard({
  label,
  value,
  icon: Icon,
  tone,
  to,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone: DashboardTone;
  to: string | null;
}) {
  const toneClasses = DASHBOARD_TONES[tone];
  const className = cn(
    "tok-dashboard-kpi relative overflow-hidden rounded-3xl p-5 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    toneClasses.card,
  );
  const content = (
    <>
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
    </>
  );

  if (!to) return <div aria-disabled="true" className={cn(className, "cursor-not-allowed opacity-65")}>{content}</div>;

  return <Link to={to} className={className} aria-label={`Ouvrir ${label}`}>{content}</Link>;
}

function MobileOverviewCard({ to, children }: { to: string | null; children: ReactNode }) {
  const className = "min-h-[8.15rem] rounded-[1.05rem] border border-[#e8ddce] bg-white p-3 shadow-[0_5px_15px_rgba(54,40,23,0.05)] transition hover:border-orange-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-white/10 dark:bg-[#0b1729]";
  return to ? <Link to={to} className={className}>{children}</Link> : <article aria-disabled="true" className={cn(className, "opacity-65")}>{children}</article>;
}

function OverviewListRow({ to, children }: { to: string | null; children: ReactNode }) {
  const className = "grid min-w-0 grid-cols-1 gap-2 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:border-[#5f7aad]/22 dark:bg-[#07142b]/72 dark:text-slate-100 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center";
  return to ? <Link to={to} className={className}>{children}</Link> : <div aria-disabled="true" className={cn(className, "opacity-65")}>{children}</div>;
}
function MobileRestaurantHeader({
  restaurantName,
  restaurantImageUrl,
}: {
  restaurantName: string;
  restaurantImageUrl: string | null;
}) {
  const openNavigation = () => {
    document
      .querySelector<HTMLButtonElement>('[data-testid="restaurant-mobile-menu-trigger"]')
      ?.click();
  };

  return (
    <header className="fixed inset-x-0 top-0 z-[60] border-b border-stone-200/90 bg-white/95 pt-[env(safe-area-inset-top,0px)] shadow-[0_8px_24px_rgba(30,22,14,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-[#07101f]/95 md:hidden">
      <div className="relative mx-auto flex h-16 max-w-xl items-center justify-between px-3">
        <button
          type="button"
          onClick={openNavigation}
          aria-label="Ouvrir le menu du dashboard"
          className="flex h-11 w-11 items-center justify-center rounded-full text-stone-900 transition hover:bg-stone-100 active:scale-95 dark:text-white dark:hover:bg-white/10"
        >
          <Menu className="h-6 w-6" />
        </button>

        <Link
          to="/dashboard/restaurant"
          className="absolute left-1/2 flex max-w-[62%] -translate-x-1/2 items-center gap-2 rounded-full px-2 py-1 text-stone-950 transition hover:bg-stone-100 dark:text-white dark:hover:bg-white/10"
          aria-label={`Ouvrir la fiche de ${restaurantName}`}
        >
          {restaurantImageUrl ? (
            <img
              src={restaurantImageUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full border border-stone-200 object-cover shadow-sm dark:border-white/15"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200">
              <Store className="h-5 w-5" />
            </span>
          )}
          <span className="truncate text-sm font-black uppercase tracking-[0.04em]">
            {restaurantName}
          </span>
        </Link>

        <NotificationBell
          buttonClassName="h-11 w-11 bg-transparent text-stone-900 shadow-none hover:bg-stone-100 dark:text-white dark:hover:bg-white/10"
          contentClassName="mt-2"
        />
      </div>
    </header>
  );
}

function MobileBottomNavigation({
  pathname,
  activeFeatures,
  disabledFeatures,
  dashboardAccessLocked,
  onboardingConfigurationUnlocked,
}: {
  pathname: string;
  activeFeatures: Set<string>;
  disabledFeatures: Set<string>;
  dashboardAccessLocked: boolean;
  onboardingConfigurationUnlocked: boolean;
}) {
  return (
    <nav
      aria-label="Navigation rapide du dashboard restaurateur"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-stone-200/90 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-10px_28px_rgba(30,22,14,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-[#07101f]/95 md:hidden"
    >
      <div className="mx-auto grid h-[4.45rem] max-w-xl grid-cols-5 px-1">
        {MOBILE_BOTTOM_NAV_ITEMS.map((item) => {
          const isActive = item.to === "/dashboard"
            ? pathname === item.to
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
          const availableDuringOnboarding = onboardingConfigurationUnlocked
            && isRestaurantOnboardingConfigurationRoute(item.to);
          const isLocked = item.to !== "/dashboard" && (
            (dashboardAccessLocked && !availableDuringOnboarding)
            || (!availableDuringOnboarding && Boolean(
              item.feature
              && (!activeFeatures.has(item.feature) || disabledFeatures.has(item.feature)),
            ))
          );
          const content = (
            <>
              <item.icon className="h-[1.35rem] w-[1.35rem]" />
              <span className="max-w-full truncate text-[10px] font-semibold leading-none">{item.label}</span>
            </>
          );

          if (isLocked) {
            return (
              <span
                key={item.to}
                aria-disabled="true"
                className="flex min-w-0 flex-col items-center justify-center gap-1.5 px-1 text-stone-300 dark:text-slate-600"
              >
                {content}
              </span>
            );
          }

          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-center gap-1.5 px-1 transition",
                isActive
                  ? "text-[#b35a24] dark:text-orange-300"
                  : "text-stone-900 hover:text-orange-600 dark:text-slate-200 dark:hover:text-orange-300",
              )}
            >
              {isActive ? <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[#b35a24] dark:bg-orange-300" /> : null}
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileOverviewHeading({
  restaurantName,
  firstName,
  avatarUrl,
}: {
  restaurantName: string;
  firstName: string;
  avatarUrl: string | null;
}) {
  return (
    <section className="md:hidden" aria-labelledby="mobile-restaurant-dashboard-title">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 id="mobile-restaurant-dashboard-title" className="truncate text-[1.72rem] font-black leading-tight tracking-[-0.035em] text-stone-950 dark:text-white">
            Bonjour, {firstName} !
          </h1>
          <p className="mt-0.5 truncate text-[0.98rem] text-stone-700 dark:text-slate-300">
            Bienvenue sur l&apos;app {restaurantName}.
          </p>
        </div>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`Portrait de ${firstName}`}
            className="h-14 w-14 shrink-0 rounded-full border-2 border-white object-cover shadow-[0_7px_20px_rgba(42,31,22,0.18)] dark:border-white/15"
          />
        ) : (
          <span
            aria-label={`Profil de ${firstName}`}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-stone-200 to-orange-100 text-base font-black text-stone-700 shadow-[0_7px_20px_rgba(42,31,22,0.18)] dark:border-white/15 dark:from-slate-700 dark:to-orange-900 dark:text-white"
          >
            {getInitials(firstName)}
          </span>
        )}
      </div>
      <h2 className="mt-4 text-[1.38rem] font-black tracking-[-0.025em] text-stone-950 dark:text-white">
        Votre Dashboard
      </h2>
    </section>
  );
}

function MobileOverviewCards({
  todayReservationsCount,
  nextReservationTime,
  totalUpcomingOrders,
  readyOrdersCount,
  performanceDeltaPercent,
  reservationTarget,
  ordersTarget,
  performanceTarget,
}: {
  todayReservationsCount: number;
  nextReservationTime: string | null;
  totalUpcomingOrders: number;
  readyOrdersCount: number;
  performanceDeltaPercent: number;
  reservationTarget: string | null;
  ordersTarget: string | null;
  performanceTarget: string | null;
}) {
  const performanceBars = buildPerformanceBars(performanceDeltaPercent);
  const readinessPercent = totalUpcomingOrders > 0
    ? Math.min(100, Math.round((readyOrdersCount / totalUpcomingOrders) * 100))
    : 100;
  const readinessBars = [42, 58, 46, 70, 60, 82, 72, 94];

  return (
    <section className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:hidden" aria-label="Résumé de l'activité du restaurant">
      <MobileOverviewCard to={reservationTarget}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[0.98rem] font-black leading-[1.08] text-stone-950 dark:text-white">
            Réservations<br />aujourd&apos;hui
          </h3>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f7e6d7] text-[#b35a24] dark:bg-orange-500/15 dark:text-orange-300">
            <CalendarDays className="h-5 w-5" />
          </span>
        </div>
        <p className="mt-2 text-sm font-semibold text-stone-950 dark:text-slate-100">
          {todayReservationsCount} réservation{todayReservationsCount > 1 ? "s" : ""}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-stone-700 dark:text-slate-400">
          {nextReservationTime ? `Prochain client à ${nextReservationTime}` : "Aucune arrivée à venir"}
        </p>
      </MobileOverviewCard>

      <MobileOverviewCard to={ordersTarget}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[0.98rem] font-black leading-[1.08] text-stone-950 dark:text-white">
            Commandes<br />en cours
          </h3>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f7e6d7] text-[#b35a24] dark:bg-orange-500/15 dark:text-orange-300">
            <ShoppingCart className="h-5 w-5" />
          </span>
        </div>
        <p className="mt-2 text-sm font-semibold text-stone-950 dark:text-slate-100">
          {totalUpcomingOrders} commande{totalUpcomingOrders > 1 ? "s" : ""}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-stone-700 dark:text-slate-400">
          {readyOrdersCount > 0
            ? `${readyOrdersCount} prête${readyOrdersCount > 1 ? "s" : ""} à être remise${readyOrdersCount > 1 ? "s" : ""}`
            : "Aucune commande prête"}
        </p>
      </MobileOverviewCard>

      <MobileOverviewCard to={performanceTarget}>
        <h3 className="text-[0.98rem] font-black text-stone-950 dark:text-white">Performances</h3>
        <p className={cn(
          "mt-1 text-sm font-semibold",
          performanceDeltaPercent >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300",
        )}>
          {formatSignedPercent(performanceDeltaPercent)}
        </p>
        <p className="text-[11px] text-stone-600 dark:text-slate-400">vs moyenne du mois</p>
        <div className="mt-2 flex h-10 items-end justify-center gap-1.5" aria-hidden="true">
          {performanceBars.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className={cn(
                "w-3 rounded-t-[0.2rem]",
                index === performanceBars.length - 1
                  ? "bg-[#db632d]"
                  : "bg-[#efcfb4] dark:bg-orange-300/35",
              )}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </MobileOverviewCard>

      <MobileOverviewCard to={ordersTarget}>
        <h3 className="text-[0.98rem] font-black text-stone-950 dark:text-white">Service</h3>
        <div className="mt-2 flex h-10 items-end gap-1" aria-hidden="true">
          {readinessBars.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className={cn(
                "flex-1 rounded-t-[0.2rem]",
                index === readinessBars.length - 1
                  ? "bg-[#db632d]"
                  : "bg-[#efcfb4] dark:bg-orange-300/35",
              )}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-700">
          <span
            className="block h-full rounded-full bg-emerald-600 transition-[width]"
            style={{ width: `${readinessPercent}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] leading-tight text-stone-700 dark:text-slate-300">
          {totalUpcomingOrders > 0
            ? `${readinessPercent}% des commandes prêtes`
            : "Aucune commande en attente"}
        </p>
      </MobileOverviewCard>
    </section>
  );
}

function MobileDailyMenu({
  items,
  fallbackImageUrl,
}: {
  items: readonly RestaurantDashboardMobileMenuItem[];
  fallbackImageUrl: string | null;
}) {
  return (
    <section className="md:hidden" aria-labelledby="mobile-daily-menu-title">
      <div className="mb-2 flex items-end justify-between gap-3">
        <h2 id="mobile-daily-menu-title" className="text-[1.38rem] font-black tracking-[-0.025em] text-stone-950 dark:text-white">
          Menu du Jour
        </h2>
        <Link to="/dashboard/menu" className="text-xs font-bold text-[#b35a24] hover:underline dark:text-orange-300">
          Voir le menu
        </Link>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => {
            const imageUrl = item.image_url || fallbackImageUrl;
            return (
              <article
                key={item.id}
                className="min-w-0 overflow-hidden rounded-[1.05rem] border border-[#e8ddce] bg-white shadow-[0_5px_16px_rgba(54,40,23,0.07)] dark:border-white/10 dark:bg-[#0b1729]"
              >
                <div className="relative h-[6.45rem] overflow-hidden bg-stone-100 dark:bg-slate-800">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={item.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-stone-400 dark:text-slate-500">
                      <UtensilsCrossed className="h-8 w-8" />
                    </span>
                  )}
                </div>
                <div className="relative min-h-[7.2rem] p-2.5 pb-11">
                  <h3 className="truncate text-[0.96rem] font-black leading-tight text-stone-950 dark:text-white">
                    {item.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-stone-600 dark:text-slate-400">
                    {item.description || "Description à compléter dans votre menu."}
                  </p>
                  <p className="absolute bottom-2.5 left-2.5 text-[0.98rem] font-black text-stone-950 dark:text-white">
                    {formatRestaurantDashboardChf(Number(item.price || 0))}
                  </p>
                  <Button
                    asChild
                    size="icon"
                    className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-[#df632b] text-white shadow-md hover:bg-[#c9521f]"
                  >
                    <Link to="/dashboard/menu" aria-label={`Modifier ${item.name}`}>
                      <Plus className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Link
          to="/dashboard/menu"
          className="flex min-h-[8.5rem] items-center gap-4 rounded-[1.05rem] border border-dashed border-[#d7b898] bg-white p-4 text-stone-900 shadow-sm transition hover:border-orange-400 hover:bg-orange-50/40 dark:border-orange-300/25 dark:bg-[#0b1729] dark:text-white dark:hover:bg-orange-500/10"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
            <UtensilsCrossed className="h-6 w-6" />
          </span>
          <span>
            <strong className="block text-sm">Ajoutez vos plats du jour</strong>
            <span className="mt-1 block text-xs text-stone-600 dark:text-slate-400">
              Ils apparaîtront ici automatiquement.
            </span>
          </span>
        </Link>
      )}
    </section>
  );
}

function ActualitesBoostBanner({ enabled }: { enabled: boolean }) {
  return (
    <>
      <section
        aria-label="Mettre votre restaurant en avant"
        className="overflow-hidden rounded-[1.05rem] border border-orange-100 bg-[#fff1e7] shadow-[0_6px_18px_rgba(194,78,24,0.12)] dark:border-orange-300/15 dark:bg-orange-950/30 md:hidden"
      >
        <div className="grid min-h-[8.7rem] grid-cols-[44%_56%]">
          <div className="relative overflow-hidden bg-[#ed5b1d] bg-[image:url('/fondbanniere2.png')] bg-cover bg-center">
            <img
              src="/chef3.png"
              alt="Ton resto mis en avant à partir de CHF 1.-"
              loading="lazy"
              className="absolute -left-[4.2rem] -top-5 h-[12.5rem] w-[16rem] max-w-none object-contain drop-shadow-xl"
            />
          </div>
          <div className="flex min-w-0 flex-col justify-center p-3">
            <h3 className="text-[1.02rem] font-black leading-[1.02] tracking-[-0.025em] text-stone-950 dark:text-white">
              Faites décoller<br />votre restaurant !
            </h3>
            <p className="mt-1 text-[11px] leading-snug text-stone-700 dark:text-orange-100/80">
              Campagnes de visibilité à partir de CHF 1.-/jour.
            </p>
            {enabled ? (
              <Button asChild className="mt-2 h-8 w-full rounded-full bg-[#d65d29] px-2 text-[11px] font-black text-white shadow-sm hover:bg-[#bd4d1d]">
                <Link to="/dashboard/campagnes">Démarrer la campagne</Link>
              </Button>
            ) : (
              <Button
                type="button"
                disabled
                className="mt-2 h-8 w-full rounded-full bg-[#d65d29] px-2 text-[11px] font-black text-white opacity-100 disabled:opacity-100"
              >
                Campagne simulée
              </Button>
            )}
          </div>
        </div>
      </section>

      <section
        aria-label="Mettre votre restaurant en avant"
        className="relative isolate hidden overflow-hidden rounded-[1.35rem] bg-[#ff4b00] bg-[image:url('/fondbanniere.png')] bg-cover bg-center shadow-xl shadow-orange-500/20 md:block"
      >
        <div className="relative z-10 grid min-h-[20rem] grid-cols-[minmax(0,1.1fr)_minmax(15rem,0.86fr)] items-center gap-4 px-6 py-6 md:grid-cols-[minmax(18rem,1.1fr)_minmax(16rem,0.82fr)] lg:min-h-[21rem]">
          <div className="relative min-h-[20rem]">
            <img
              src="/chef3.png"
              alt="Ton resto mis en avant à partir de CHF 1.-"
              loading="lazy"
              className="absolute left-[-3.4rem] top-[-0.25rem] h-[29rem] w-[36rem] max-w-none object-contain object-top drop-shadow-2xl [mask-image:radial-gradient(ellipse_at_45%_42%,black_64%,transparent_88%)] md:left-[-3.75rem] md:h-[30rem] lg:left-[-3.25rem] lg:h-[31rem] lg:w-[37rem]"
            />
          </div>

          <div className="flex min-w-0 flex-col justify-center gap-4 text-white md:pl-4 lg:pl-6">
            <div className="space-y-3">
              {[
                { icon: TrendingUp, title: "Plus de visibilité", body: "Soyez vu par des milliers de gourmands" },
                { icon: BellRing, title: "Plus de clients", body: "Attirez de nouveaux clients chaque jour" },
                { icon: Rocket, title: "Résultats rapides", body: "Des résultats dès les premières heures" },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-orange-600 shadow-lg shadow-orange-900/15">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <strong className="block text-lg font-black leading-tight">{title}</strong>
                    <span className="block text-sm font-medium leading-snug text-white/90">{body}</span>
                  </span>
                </div>
              ))}
            </div>

            {enabled ? (
              <Button
                asChild
                className="mt-1 h-12 rounded-2xl bg-white px-5 text-base font-black text-orange-600 shadow-xl shadow-orange-900/20 transition hover:bg-orange-50 hover:text-orange-700"
              >
                <Link to="/dashboard/actualites">Mettre mon restaurant en avant</Link>
              </Button>
            ) : (
              <Button
                type="button"
                disabled
                className="mt-1 h-12 rounded-2xl bg-white px-5 text-base font-black text-orange-600 opacity-100 shadow-xl shadow-orange-900/20 disabled:pointer-events-none disabled:opacity-100"
              >
                Mise en avant simulée
              </Button>
            )}
          </div>
        </div>
      </section>
    </>
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
  restaurantImageUrl = null,
  mobileMenuItems = EMPTY_MENU_ITEMS,
  mobileTodayReservations = EMPTY_TODAY_RESERVATIONS,
  mobileReadyOrdersCount,
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
  restaurantImageUrl?: string | null;
  mobileMenuItems?: readonly RestaurantDashboardMobileMenuItem[];
  mobileTodayReservations?: readonly RestaurantDashboardMobileReservation[];
  mobileReadyOrdersCount?: number;
  leadingContent?: ReactNode;
  marketingEnabled?: boolean;
  demoSnapshot?: boolean;
}) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const {
    disabledFeatures,
    dashboardAccessLocked,
    onboardingConfigurationUnlocked,
  } = useDashboardRestaurant();
  const commercialDemoFrame = useCommercialDemoFrame();
  const globalActiveFeatures = useActiveFeatures({ enabled: !commercialDemoFrame });
  const activeFeatures = useMemo(
    () => commercialDemoFrame
      ? new Set(commercialDemoFrame.snapshot.active_features)
      : globalActiveFeatures,
    [commercialDemoFrame, globalActiveFeatures],
  );

  const resolveDashboardTarget = (feature: string, to: string) => {
    const availableDuringOnboarding = onboardingConfigurationUnlocked
      && isRestaurantOnboardingConfigurationRoute(to);
    const isLocked = (dashboardAccessLocked && !availableDuringOnboarding)
      || (!availableDuringOnboarding && (!activeFeatures.has(feature) || disabledFeatures.has(feature)));
    return isLocked ? null : to;
  };
  const ordersTarget = resolveDashboardTarget("dashboard-commandes", "/dashboard/commandes");
  const reservationsTarget = resolveDashboardTarget("dashboard-reservations", "/dashboard/reservations");
  const performancesTarget = resolveDashboardTarget("dashboard-performances", "/dashboard/performances");
  const campaignsTarget = resolveDashboardTarget("dashboard-campagnes", "/dashboard/campagnes");
  const dailyMenuItems = useMemo(
    () => [...mobileMenuItems]
      .sort((left, right) => Number(isDailyMenuItem(right)) - Number(isDailyMenuItem(left)))
      .slice(0, 2),
    [mobileMenuItems],
  );
  const todayReservationsCount = mobileTodayReservations.length;
  const nextReservationTime = getNextReservationTime(mobileTodayReservations);
  const readyOrdersCount = mobileReadyOrdersCount ?? upcomingOrders.filter((order) => order.status === "ready").length;
  const daysElapsedThisMonth = Math.max(1, new Date().getDate());
  const averageDailyRevenue = monthlyRevenue / daysElapsedThisMonth;
  const performanceDeltaPercent = averageDailyRevenue > 0
    ? ((todayRevenue - averageDailyRevenue) / averageDailyRevenue) * 100
    : todayRevenue > 0 ? 100 : 0;
  const userPresentation = getUserPresentation(user, restaurantName);
  const resolvedRestaurantImageUrl = restaurantImageUrl || dailyMenuItems.find((item) => item.image_url)?.image_url || null;

  return (
    <DashboardLayout>
      <MobileRestaurantHeader
        restaurantName={restaurantName}
        restaurantImageUrl={resolvedRestaurantImageUrl}
      />
      <MobileBottomNavigation
        pathname={pathname}
        activeFeatures={activeFeatures}
        disabledFeatures={disabledFeatures}
        dashboardAccessLocked={dashboardAccessLocked}
        onboardingConfigurationUnlocked={onboardingConfigurationUnlocked}
      />

      <div
        className="flex flex-col gap-6"
        data-commercial-demo-source={demoSnapshot ? "isolated-snapshot" : undefined}
        data-mobile-restaurant-overview
      >
        <div className="order-1 hidden md:block">
          <DashboardPageHero
            badge="Dashboard restaurateur"
            title={<>Bonjour, <span className="text-[#ff6a1a]">{restaurantName}</span></>}
            description="Vue courte de l'activité du restaurant : commandes, réservations, service du jour et revenu du mois restent visibles sans chercher dans les onglets."
            icon={LayoutDashboard}
            tone="orange"
            visualLabel="Accueil"
            stats={[
              { label: "Commandes à venir", value: totalUpcomingOrders, icon: ShoppingCart },
              { label: "Réservations à venir", value: totalUpcomingReservations, icon: CalendarDays },
              { label: "CA du jour", value: formatRestaurantDashboardChf(todayRevenue), icon: TrendingUp },
            ]}
          />
        </div>

        <div className="order-1 md:hidden">
          <MobileOverviewHeading
            restaurantName={restaurantName}
            firstName={userPresentation.firstName}
            avatarUrl={userPresentation.avatarUrl}
          />
        </div>

        <div className="order-2 md:hidden">
          <MobileOverviewCards
            todayReservationsCount={todayReservationsCount}
            nextReservationTime={nextReservationTime}
            totalUpcomingOrders={totalUpcomingOrders}
            readyOrdersCount={readyOrdersCount}
            performanceDeltaPercent={performanceDeltaPercent}
            reservationTarget={reservationsTarget}
            ordersTarget={ordersTarget}
            performanceTarget={performancesTarget}
          />
        </div>

        <div className="order-3 md:hidden">
          <MobileDailyMenu
            items={dailyMenuItems}
            fallbackImageUrl={resolvedRestaurantImageUrl}
          />
        </div>

        <div className="order-4 md:order-3">
          <ActualitesBoostBanner enabled={marketingEnabled} />
        </div>

        {leadingContent ? (
          <div className="order-5 md:order-2">
            {leadingContent}
          </div>
        ) : null}

        <div className="order-6 hidden space-y-4 md:order-4 md:block">
          <DashboardStatCard label="Commandes à venir" value={String(totalUpcomingOrders)} icon={ShoppingCart} tone="violet" to={ordersTarget} />
          <DashboardStatCard label="Réservations à venir" value={String(totalUpcomingReservations)} icon={CalendarDays} tone="orange" to={reservationsTarget} />
          <DashboardStatCard label="Chiffre d'affaires du jour" value={formatRestaurantDashboardChf(todayRevenue)} icon={TrendingUp} tone="emerald" to={performancesTarget} />
          <DashboardStatCard label="Campagnes pub actives" value={String(activeCampaignsCount)} icon={Megaphone} tone="amber" to={campaignsTarget} />
          <DashboardStatCard label="Midi aujourd'hui" value={String(todayServiceCounts.lunch)} icon={SunMedium} tone="sky" to={reservationsTarget} />
          <DashboardStatCard label="Soir aujourd'hui" value={String(todayServiceCounts.dinner)} icon={MoonStar} tone="violet" to={reservationsTarget} />
          <DashboardStatCard label="Revenus du mois" value={formatRestaurantDashboardChf(monthlyRevenue)} icon={TrendingUp} tone="emerald" to={performancesTarget} />
        </div>

        <div className="order-7 hidden grid-cols-1 gap-6 md:order-5 md:grid md:grid-cols-2">
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
                <OverviewListRow
                  key={order.id}
                  to={ordersTarget ? `${ordersTarget}?order=${encodeURIComponent(order.id)}` : null}
                >
                  <span className="min-w-0 break-words">{formatOrderDate(order.createdAt)}</span>
                  <span className="font-bold">{order.totalAmount.toFixed(2)} CHF</span>
                  <OrderStatusBadge status={order.status} />
                </OverviewListRow>
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
                <OverviewListRow
                  key={reservation.id}
                  to={reservationsTarget ? `${reservationsTarget}?reservation=${encodeURIComponent(reservation.id)}` : null}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="break-words">{new Date(reservation.date).toLocaleDateString("fr-FR")} à {reservation.time}</span>
                    <Badge variant="outline" className="text-[10px]">{reservation.servicePeriodLabel}</Badge>
                  </div>
                  <span>{reservation.partySize} pers.</span>
                  <OrderStatusBadge status={reservation.status} />
                </OverviewListRow>
              ))}
              {upcomingReservations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune réservation</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
