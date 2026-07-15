import { Link, useLocation } from "react-router-dom";
import {
  BadgePercent,
  Bell,
  CalendarDays,
  ChefHat,
  Clock3,
  Crown,
  Gift,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  MapPinned,
  Newspaper,
  PiggyBank,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Trophy,
  User,
  UsersRound,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";

import SignOutButton from "@/components/auth/SignOutButton";
import { BackNavigationButton } from "@/components/navigation/BackNavigationButton";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import RoleSpaceMenuSection from "@/components/navigation/RoleSpaceMenuSection";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { useAuth } from "@/lib/auth-context";
import { isCommercialDemoClientPathAllowed } from "@/lib/commercialDemoClientRoutes";
import { useActiveFeatures } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";

type CustomerNavItem = {
  to: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  feature?: string;
  featuresAny?: string[];
  demoOnly?: boolean;
  tab?: string;
};

type CustomerNavSection = {
  label: string;
  items: CustomerNavItem[];
};

const NAV_SECTIONS: CustomerNavSection[] = [
  {
    label: "Vue d’ensemble",
    items: [
      { to: "/mon-espace", label: "Accueil", shortLabel: "Accueil", icon: LayoutDashboard },
    ],
  },
  {
    label: "Mon activité",
    items: [
      {
        to: "/recherche",
        label: "Restaurant démo",
        shortLabel: "Restaurant",
        icon: Store,
        featuresAny: ["reservation", "commandes"],
        demoOnly: true,
      },
      { to: "/reservations", label: "Mes réservations", shortLabel: "Réservations", icon: CalendarDays, feature: "reservation" },
      { to: "/commandes", label: "Mes commandes", shortLabel: "Commandes", icon: ShoppingCart, feature: "commandes" },
      { to: "/panier", label: "Mon panier", shortLabel: "Panier", icon: ShoppingCart, feature: "commandes" },
      { to: "/mes-avis", label: "Mes avis", shortLabel: "Avis", icon: Star },
    ],
  },
  {
    label: "Découvrir",
    items: [
      { to: "/anti-gaspi", label: "Anti-gaspi", shortLabel: "Anti-gaspi", icon: Heart, feature: "anti-gaspi" },
      { to: "/ventes-flash", label: "Ventes flash", shortLabel: "Flash", icon: Sparkles, feature: "ventes-flash" },
      { to: "/actualites", label: "Actualités", shortLabel: "Actualités", icon: Newspaper, feature: "actualites-sociales" },
      { to: "/chefs-table", label: "Table du Chef", shortLabel: "Chef", icon: ChefHat, feature: "chefs-table" },
    ],
  },
  {
    label: "Services",
    items: [
      { to: "/zero-attente", label: "Zéro attente", shortLabel: "Zéro attente", icon: Zap, feature: "zero-attente" },
      { to: "/creneaux-garantis", label: "Créneaux garantis", shortLabel: "Créneaux", icon: Clock3, feature: "creneaux-garantis" },
      { to: "/flex-prix-bas", label: "Flex prix bas", shortLabel: "Prix bas", icon: BadgePercent, feature: "flex-prix-bas" },
      { to: "/match-groupes", label: "Match groupes", shortLabel: "Groupes", icon: UsersRound, feature: "match-groupes" },
      { to: "/multi-stop", label: "Livraison multi-stop", shortLabel: "Multi-stop", icon: MapPinned, feature: "multi-stop" },
      { to: "/multi-restaurant", label: "Multi-restaurant", shortLabel: "Multi-resto", icon: UtensilsCrossed, feature: "multi-restaurant" },
      { to: "/garantie-qualite", label: "Garantie qualité", shortLabel: "Garantie", icon: ShieldCheck, feature: "garantie-qualite" },
      { to: "/budget-auto", label: "Budget auto", shortLabel: "Budget", icon: PiggyBank, feature: "budget-auto" },
    ],
  },
  {
    label: "Mes avantages",
    items: [
      { to: "/profil?tab=favoris", label: "Mes favoris", shortLabel: "Favoris", icon: Heart, tab: "favoris" },
      { to: "/profil?tab=fidelite", label: "Mes Miamz", shortLabel: "Miamz", icon: Trophy, tab: "fidelite" },
      { to: "/profil?tab=abonnement", label: "Mon abonnement", shortLabel: "Tok One", icon: Crown, tab: "abonnement", feature: "tok-one" },
      { to: "/tok-one", label: "TOK One", shortLabel: "TOK One", icon: Crown, feature: "tok-one" },
      { to: "/abonnement", label: "Abonnement repas", shortLabel: "Abonnement", icon: CalendarDays, feature: "abonnement" },
      { to: "/points-cadeau", label: "Points cadeau", shortLabel: "Cadeaux", icon: Gift, feature: "points-cadeau" },
      { to: "/tok-pulse", label: "TOK Pulse", shortLabel: "Pulse", icon: Zap, feature: "tok-pulse" },
      { to: "/miamz-solidaires", label: "Miamz solidaires", shortLabel: "Solidaires", icon: Trophy },
    ],
  },
  {
    label: "Compte et aide",
    items: [
      { to: "/notifications", label: "Notifications", shortLabel: "Notifs", icon: Bell },
      { to: "/profil?tab=infos", label: "Mon profil", shortLabel: "Profil", icon: User, tab: "infos" },
      { to: "/contact", label: "Aide et support", shortLabel: "Aide", icon: LifeBuoy },
    ],
  },
];

function isNavItemActive(pathname: string, search: string, item: CustomerNavItem) {
  const target = new URL(item.to, "https://thetok.ch");
  if (pathname !== target.pathname) return false;

  const currentTab = new URLSearchParams(search).get("tab");
  if (item.tab) return (currentTab || "infos") === item.tab;
  return true;
}

export default function CustomerDashboardLayout({ children }: { children: React.ReactNode }) {
  const { pathname, search } = useLocation();
  const { role } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const globalActiveFeatures = useActiveFeatures({ enabled: !commercialDemoFrame });
  const activeFeatures = commercialDemoFrame
    ? new Set(commercialDemoFrame.snapshot.active_features)
    : globalActiveFeatures;
  const { unreadNotifications } = useNotificationCenter(50);
  const visibleSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const hasActiveFeature = (!item.feature || activeFeatures.has(item.feature))
          && (!item.featuresAny || item.featuresAny.some((feature) => activeFeatures.has(feature)));
        if (commercialDemoFrame) {
          const target = new URL(item.to, "https://thetok.ch");
          return commercialDemoFrame.surface === "client"
            && isCommercialDemoClientPathAllowed(target.pathname)
            && hasActiveFeature;
        }
        return !item.demoOnly && hasActiveFeature;
      }),
    }))
    .filter((section) => section.items.length > 0);
  const visibleItems = visibleSections.flatMap((section) => section.items);
  const isHome = pathname === "/mon-espace";

  const renderItem = (item: CustomerNavItem, compact = false) => {
    const active = isNavItemActive(pathname, search, item);
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? "page" : undefined}
        className={cn(
          compact
            ? "flex min-h-16 min-w-[78px] snap-start flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[11px] font-semibold"
            : "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
          "relative shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-foreground hover:bg-muted",
        )}
      >
        <item.icon className={compact ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" />
        <span className={compact ? "max-w-[70px] truncate" : "truncate"}>{compact ? item.shortLabel || item.label : item.label}</span>
        <NotificationMenuBadge route={item.to} role={role} unreadNotifications={unreadNotifications} />
      </Link>
    );
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-muted/30 pt-16">
      <div className="container px-3 py-4 sm:px-4 sm:py-6 md:flex md:gap-7 md:py-8">
        <nav aria-label="Navigation de l’espace client" className="mb-4 md:hidden">
          <div className="flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleItems.map((item) => renderItem(item, true))}
          </div>
        </nav>

        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-24 rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="px-3 py-2 font-display text-lg font-semibold">Mon espace</h2>
            {!commercialDemoFrame ? <RoleSpaceMenuSection className="mb-3" /> : null}
            <nav aria-label="Navigation de l’espace client" className="space-y-4">
              {visibleSections.map((section) => (
                <div key={section.label} className="space-y-1">
                  <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{section.label}</p>
                  {section.items.map((item) => renderItem(item))}
                </div>
              ))}
            </nav>
            {!commercialDemoFrame ? (
              <div className="mt-4 border-t pt-4">
                <SignOutButton className="w-full justify-start rounded-xl px-3 py-2.5 text-sm font-medium" />
              </div>
            ) : null}
          </div>
        </aside>

        <main className="min-h-[500px] min-w-0 flex-1 overflow-x-hidden rounded-2xl border bg-card p-4 shadow-sm sm:p-6 md:p-8">
          {!isHome ? <BackNavigationButton fallback="/mon-espace" className="mb-4" /> : null}
          {children}
          {!commercialDemoFrame ? (
            <div className="mt-8 border-t pt-4 md:hidden">
              <SignOutButton className="min-h-11 w-full justify-center rounded-xl text-sm font-medium" />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
