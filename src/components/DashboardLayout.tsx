import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  Camera,
  CircleHelp,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Megaphone,
  Newspaper,
  ReceiptText,
  Scale,
  Share2,
  ShoppingCart,
  UtensilsCrossed,
  Zap,
  Leaf,
  Percent,
  SlidersHorizontal,
  Map,
  ChevronDown,
  CreditCard,
  Store,
  Lock,
  ShieldCheck,
  Users,
  Package,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardRestaurant } from "@/pages/dashboard/useDashboardRestaurant";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useActiveFeatures } from "@/lib/featureFlags";
import { useAuth } from "@/lib/auth-context";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useRealtimeNotifications, type RealtimeNotification } from "@/hooks/useRealtimeNotifications";
import { BackNavigationButton } from "@/components/navigation/BackNavigationButton";
import ChefHelpButton from "@/components/help/ChefHelpButton";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import RoleSpaceMenuSection from "@/components/navigation/RoleSpaceMenuSection";
import ThemeToggleButton from "@/components/theme/ThemeToggleButton";
import SignOutButton from "@/components/auth/SignOutButton";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: string;
  roles?: string[];
  emphasis?: "marketing-studio";
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const MARKETING_STUDIO_NAV_CLASS =
  "rounded-[10px] bg-gradient-to-r from-[#ff5a00] via-[#ff7a1a] to-[#ffb000] font-bold text-white shadow-[0_12px_28px_rgba(255,106,26,0.28)] hover:from-[#ff6814] hover:via-[#ff8424] hover:to-[#ffba18] hover:text-white dark:text-white dark:shadow-[0_0_30px_rgba(255,122,26,0.35)]";

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Reussite et performances",
    items: [
      { to: "/dashboard", label: "Vue d'ensemble", icon: LayoutDashboard, feature: "dashboard-overview" },
      { to: "/dashboard/advisor", label: "Assistant IA", icon: Bot, feature: "dashboard-advisor" },
      { to: "/dashboard/commandes", label: "Commandes", icon: ShoppingCart, feature: "dashboard-commandes" },
      { to: "/dashboard/reservations", label: "Reservations", icon: CalendarDays, feature: "dashboard-reservations" },
      { to: "/dashboard/performances", label: "Performances", icon: BarChart3, feature: "dashboard-performances" },
      { to: "/dashboard/comparaison", label: "Comparaison", icon: Scale, feature: "dashboard-comparaison" },
      { to: "/dashboard/avis", label: "Avis clients", icon: MessageSquareText, feature: "dashboard-avis" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { to: "/dashboard/campagnes", label: "Campagnes", icon: Megaphone, feature: "dashboard-campagnes" },
      { to: "/dashboard/crm", label: "CRM clients", icon: Users, feature: "dashboard-crm" },
      { to: "/dashboard/promotions", label: "Promotions", icon: Megaphone, feature: "dashboard-promotions" },
      { to: "/dashboard/reseaux-sociaux", label: "Reseaux sociaux", icon: Share2, feature: "dashboard-reseaux-sociaux" },
      { to: "/dashboard/photos", label: "Studio Marketing", icon: Camera, feature: "dashboard-photos", emphasis: "marketing-studio" },
      { to: "/dashboard/actualites", label: "Actualités", icon: Newspaper, feature: "dashboard-actualites" },
    ],
  },
  {
    title: "Paiements",
    items: [
      { to: "/dashboard/mon-compte-facturation", label: "Mon compte/Facturation", icon: CreditCard, feature: "dashboard-billing" },
      { to: "/dashboard/factures", label: "Comptabilité & factures", icon: ReceiptText, feature: "dashboard-factures" },
    ],
  },
  {
    title: "Mon offre",
    items: [
      { to: "/dashboard/pack", label: "Mon pack", icon: Package, feature: "dashboard-pack" },
      { to: "/dashboard/tok-connect", label: "Tok Connect", icon: Plug, feature: "dashboard-tok-connect" },
    ],
  },
  {
    title: "Page du restaurant",
    items: [
      { to: "/dashboard/restaurant", label: "Mon restaurant", icon: UtensilsCrossed, feature: "dashboard-restaurant" },
      { to: "/dashboard/menu", label: "Menu", icon: BookOpen, feature: "dashboard-menu" },
      { to: "/dashboard/offres", label: "Anti-gaspi", icon: Leaf, feature: "dashboard-offres" },
      { to: "/dashboard/ventes-flash", label: "Ventes flash", icon: Zap, feature: "dashboard-ventes-flash" },
      { to: "/dashboard/formules", label: "Formules", icon: Percent, feature: "dashboard-formules" },
      { to: "/dashboard/service", label: "Pilotage de service", icon: SlidersHorizontal, feature: "dashboard-service" },
      { to: "/dashboard/plan-salle", label: "Plan de salle", icon: Map, feature: "dashboard-plan-salle" },
      { to: "/dashboard/plan-salle-v2", label: "Plan de salle 2", icon: Map, feature: "dashboard-plan-salle" },
    ],
  },
  {
    title: "Support",
    items: [
      { to: "/dashboard/notifications", label: "Notifications", icon: Bell },
      { to: "/dashboard/support", label: "Aide et support", icon: CircleHelp, feature: "dashboard-support" },
    ],
  },
];

function isDashboardNavItemActive(pathname: string, itemTo: string) {
  if (itemTo === "/dashboard") return pathname === itemTo;
  return pathname === itemTo || pathname.startsWith(`${itemTo}/`);
}

function RestaurantSelector({ collapsed = false }: { collapsed?: boolean }) {
  const { restaurants, selectedId, setSelectedId } = useDashboardRestaurant();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ✅ close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [open]);

  const selected = restaurants.find((r) => r.id === selectedId);

  return (
    <div ref={ref} className="relative mb-3 px-2">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center rounded-2xl border bg-sidebar-accent/50 text-sm font-semibold transition-colors dark:border-[#5f7aad]/28 dark:bg-[#07142b]/78 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_22px_rgba(30,74,160,0.12)] dark:hover:bg-[#0c1b38]",
          collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
        )}
      >
        <Store className="h-4 w-4 text-primary" />
        {!collapsed && (
          <>
            <span className="ml-2 flex-1 text-left truncate">{selected?.name}</span>
            <ChevronDown className={cn("h-4 w-4", open && "rotate-180")} />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-2 right-2 z-50 mt-2 rounded-2xl border bg-white shadow-lg dark:border-[#5f7aad]/28 dark:bg-[#07142b] dark:shadow-[0_24px_60px_rgba(0,0,0,0.55),0_0_28px_rgba(30,74,160,0.14)]">
          {restaurants.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setSelectedId(r.id);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left hover:bg-muted dark:text-slate-100 dark:hover:bg-white/10"
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NavItems({
  pathname,
  sections,
  collapsed = false,
  disabledFeatures,
  unreadNotifications,
  role,
  dashboardAccessLocked = false,
}: {
  pathname: string;
  sections: NavSection[];
  collapsed?: boolean;
  disabledFeatures?: Set<string>;
  unreadNotifications: ReturnType<typeof useNotificationCenter>["unreadNotifications"];
  role: ReturnType<typeof useAuth>["role"];
  dashboardAccessLocked?: boolean;
}) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.title}>
          {!collapsed && <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400">{section.title}</p>}
          {section.items.map((item) => {
            const isMarketingStudio = item.emphasis === "marketing-studio";
            const isActive = isDashboardNavItemActive(pathname, item.to);
            const isLocked = dashboardAccessLocked && item.to !== "/dashboard"
              ? true
              : !!(item.feature && disabledFeatures?.has(item.feature));
            const lockTitle = dashboardAccessLocked
              ? "Dossier restaurateur en attente de validation admin"
              : "Non inclus dans votre pack ou abonnement";

            if (isLocked) {
              return (
                <div
                  key={item.to}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 opacity-40 cursor-not-allowed select-none"
                  title={lockTitle}
                >
                  <item.icon className="h-4 w-4" />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      <Lock className="h-3 w-3" />
                    </>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all",
                  isMarketingStudio
                    ? MARKETING_STUDIO_NAV_CLASS
                    : isActive
                      ? "bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-[#ff6a1a]/14 dark:text-[#ffd8c3] dark:shadow-[0_0_28px_rgba(255,106,26,0.22)]"
                      : "hover:bg-muted dark:text-slate-200 dark:hover:bg-[#102044]/72"
                )}
              >
                <item.icon className={cn("h-4 w-4", isMarketingStudio && "text-white")} />
                {!collapsed && (
                  <span className={cn(isMarketingStudio && "tracking-tight")}>{item.label}</span>
                )}
                <NotificationMenuBadge
                  route={item.to}
                  role={role}
                  unreadNotifications={unreadNotifications}
                  className={collapsed ? "ml-0 h-2 min-w-2 p-0 text-[0px]" : undefined}
                />
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

type DashboardLayoutProps = {
  children: React.ReactNode;
  contentWidth?: "default" | "full";
  mainClassName?: string;
};

export default function DashboardLayout({
  children,
  contentWidth = "default",
  mainClassName,
}: DashboardLayoutProps) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { selectedId, disabledFeatures, dashboardAccessLocked, dashboardAccessLockReason, isDemoMode } = useDashboardRestaurant();
  const globalActiveFeatures = useActiveFeatures();
  const { role } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const activeFeatures = useMemo(
    () => commercialDemoFrame
      ? new Set(commercialDemoFrame.snapshot.active_features)
      : globalActiveFeatures,
    [commercialDemoFrame, globalActiveFeatures],
  );
  const { unreadNotifications } = useNotificationCenter(50);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ✅ safe localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("sidebar") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem("sidebar", collapsed ? "1" : "0");
  }, [collapsed]);

  // ✅ scroll reset
  useEffect(() => {
    sidebarRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // ✅ memo nav
  const sections = useMemo(() => {
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (commercialDemoFrame && commercialDemoFrame.surface !== "restaurant") return false;
        return !item.feature || activeFeatures.has(item.feature);
      }),
    })).filter((section) => section.items.length > 0);
  }, [activeFeatures, commercialDemoFrame]);

  const activeNavItem = useMemo(
    () =>
      sections
        .flatMap((section) => section.items)
        .filter((item) => isDashboardNavItemActive(pathname, item.to))
        .sort((a, b) => b.to.length - a.to.length)[0],
    [pathname, sections]
  );
  const backFallback = pathname === "/dashboard" ? "/" : "/dashboard";

  // ✅ realtime notifications
  const handleNotification = useCallback(
    (n: RealtimeNotification) => {
      const data = n.data as any;

      if (data?.restaurant_id && data.restaurant_id !== selectedId) {
        console.debug("ignored notif", data.restaurant_id);
        return;
      }

      toast(n.title, { description: n.body });

      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    [queryClient, selectedId]
  );

  useRealtimeNotifications({
    enabled: !!selectedId && !isDemoMode && !commercialDemoFrame,
    onInsert: handleNotification,
  });

  return (
    <div className="tok-dashboard-shell flex min-h-screen flex-col text-foreground md:flex-row">
      {/* SIDEBAR */}
      <aside
        ref={sidebarRef}
        className={cn(
          "tok-dashboard-sidebar hidden overflow-y-auto border-r bg-sidebar transition-all md:flex md:flex-col",
          collapsed ? "w-[80px]" : "w-72"
        )}
      >
        <div className="flex items-center justify-between p-3">
          {!collapsed && (
            <h2 className="font-display text-xl font-bold text-foreground dark:text-white">
              Dashboard
            </h2>
          )}
          <Button size="icon" variant="ghost" className="rounded-xl dark:hover:bg-white/10" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>

        <RestaurantSelector collapsed={collapsed} />

        {!collapsed && !commercialDemoFrame ? (
          <div className="px-2 pb-2">
            <RoleSpaceMenuSection />
          </div>
        ) : null}

        {!commercialDemoFrame ? (
          <div className="px-2 pb-2">
            <ChefHelpButton surface="restaurant" collapsed={collapsed} />
          </div>
        ) : null}

        <nav className="flex flex-col gap-1 px-2 pb-3">
          <NavItems
            pathname={pathname}
            sections={sections}
            collapsed={collapsed}
            disabledFeatures={disabledFeatures}
            unreadNotifications={unreadNotifications}
            role={role}
            dashboardAccessLocked={dashboardAccessLocked}
          />
        </nav>

        <div className="mt-auto border-t px-3 py-3 dark:border-[#5f7aad]/28">
          <SignOutButton
            iconOnly={collapsed}
            className={cn(
              collapsed
                ? "mx-auto border-destructive/20 bg-transparent shadow-none"
                : "w-full justify-start rounded-xl px-3",
            )}
          />
        </div>
      </aside>

      <div className="fixed right-[calc(env(safe-area-inset-right,0px)+0.75rem)] top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[40] flex items-center gap-2">
        <ThemeToggleButton className="h-11 w-11 rounded-full border border-border/70 bg-background/95 text-foreground shadow-[0_14px_34px_rgba(15,23,42,0.16)] backdrop-blur-md hover:bg-background dark:border-[#5f7aad]/35 dark:bg-[#07142b]/95 dark:text-white dark:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_30px_rgba(255,106,26,0.16)]" />
        <NotificationBell />
        <SignOutButton iconOnly />
      </div>

      {/* MOBILE */}
      <div className="pointer-events-none fixed left-[calc(env(safe-area-inset-left,0px)+0.75rem)] top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[40] md:hidden">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "pointer-events-auto h-16 max-w-[10.75rem] rounded-[1.45rem] border border-orange-300/55 bg-zinc-950 px-2.5 pr-4 text-white shadow-[0_16px_34px_rgba(255,106,26,0.34),0_8px_24px_rgba(15,23,42,0.32)] ring-1 ring-white/15 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-zinc-900 hover:shadow-[0_20px_42px_rgba(255,106,26,0.42),0_10px_28px_rgba(15,23,42,0.36)] dark:border-orange-300/50 dark:bg-[#181818] dark:shadow-[0_20px_48px_rgba(0,0,0,0.58),0_0_34px_rgba(255,106,26,0.34)]",
                mobileMenuOpen && "border-orange-200 bg-primary text-primary-foreground hover:bg-primary"
              )}
              aria-label="Ouvrir le menu du dashboard"
              data-testid="restaurant-mobile-menu-trigger"
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] bg-gradient-to-br from-[#ff5a14] to-[#ff9f1c] text-white shadow-[0_0_24px_rgba(255,106,26,0.58)] transition-colors",
                  mobileMenuOpen && "bg-white/15 text-current shadow-none"
                )}
              >
                <Menu className="h-5 w-5" />
              </span>
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-300",
                    mobileMenuOpen && "text-primary-foreground/75"
                  )}
                >
                  Resto
                </span>
                <span className="max-w-[6.25rem] truncate text-sm font-semibold">
                  {activeNavItem?.label ?? "Ouvrir le menu"}
                </span>
              </span>
              <span className="sr-only">{activeNavItem?.label ?? "Ouvrir le menu"}</span>
            </Button>
          </SheetTrigger>
          <SheetContent className="flex h-full flex-col overflow-hidden p-0 dark:border-[#5f7aad]/30 dark:bg-[#010716]">
            <SheetHeader className="border-b px-6 pb-4 pt-6 pr-14">
              <SheetTitle>Dashboard</SheetTitle>
            </SheetHeader>
            <div data-sheet-scroll-area className="flex-1 overflow-y-auto overscroll-y-contain px-6 pb-6 pt-4">
              <RestaurantSelector />
              {!commercialDemoFrame ? (
                <>
                  <div className="mb-4">
                    <RoleSpaceMenuSection onNavigate={() => setMobileMenuOpen(false)} />
                  </div>
                  <div className="mb-4">
                    <ChefHelpButton surface="restaurant" onOpen={() => setMobileMenuOpen(false)} />
                  </div>
                </>
              ) : null}
              <nav className="flex flex-col gap-1 pb-4">
                <NavItems
                  pathname={pathname}
                  sections={sections}
                  disabledFeatures={disabledFeatures}
                  unreadNotifications={unreadNotifications}
                  role={role}
                  dashboardAccessLocked={dashboardAccessLocked}
                />
                <div className="mt-3 border-t pt-3">
                  <SignOutButton
                    onSignedOut={() => setMobileMenuOpen(false)}
                    className="w-full justify-start rounded-xl px-3"
                  />
                </div>
              </nav>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* MAIN */}
      <main className={cn("relative flex-1 overflow-hidden p-4 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] pt-20 sm:p-5 sm:pb-[calc(env(safe-area-inset-bottom,0px)+2.5rem)] sm:pt-20 md:p-6", mainClassName)}>
        <div className="pointer-events-none absolute inset-0 hidden dark:block">
          <div className="absolute -left-36 top-10 h-96 w-96 rounded-full bg-[#ff6a1a]/12 blur-3xl" />
          <div className="absolute right-0 top-1/4 h-[28rem] w-[28rem] rounded-full bg-[#1e4aa0]/18 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[#8b55ff]/10 blur-3xl" />
        </div>
        <div
          className={cn(
            "relative z-10 w-full",
            contentWidth === "full" ? "max-w-none" : "mx-auto max-w-7xl",
          )}
        >
          <BackNavigationButton fallback={backFallback} className="mb-4" />
          {isDemoMode ? (
            <div className="mb-6 rounded-3xl border border-sky-200 bg-sky-50/95 p-5 text-sky-950 shadow-sm dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-50" role="status" data-testid="commercial-demo-banner">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-100">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <div className="space-y-1">
                  <p className="font-semibold">Mode démonstration — données simulées</p>
                  <p className="text-sm text-sky-800 dark:text-sky-100/80">
                    Tous les outils du dashboard sont visibles. Les paiements, appels IA payants, publications et envois externes sont bloqués côté serveur.
                  </p>
                  <p className="text-xs text-sky-700 dark:text-sky-100/70">
                    Ce restaurant est isolé du catalogue public et ne contient aucune donnée réelle de restaurateur ou de client.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {dashboardAccessLocked ? (
            <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50/90 p-5 text-amber-950 shadow-sm dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-100">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <div className="space-y-1">
                  <p className="font-semibold">Dossier restaurateur en cours de validation</p>
                  <p className="text-sm text-amber-800 dark:text-amber-100/80">
                    {dashboardAccessLockReason}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-100/70">
                    Les onglets du dashboard restent volontairement grisés jusqu'à l'approbation du dossier par l'admin TOK.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
