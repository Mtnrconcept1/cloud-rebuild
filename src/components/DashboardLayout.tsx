import DashboardMenuHeader from "@/components/dashboard/DashboardMenuHeader";
import "@/components/dashboard/WorkspaceDesign.css";
import "@/components/dashboard/RestaurantWorkspacePages.css";
import { useJourneyFocus } from "@/hooks/useJourneyFocus";
import WorkspaceNavigationSection from "@/components/dashboard/WorkspaceNavigationSection";
import WorkspaceToolbar, { WorkspaceAccountLink, WorkspaceToolSearch } from "@/components/dashboard/WorkspaceToolbar";
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
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canAccessRestaurantDashboardRoute,
  isRestaurantOnboardingConfigurationRoute,
  useDashboardRestaurant,
} from "@/pages/dashboard/useDashboardRestaurant";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useActiveFeatures } from "@/lib/featureFlags";
import { useAuth } from "@/lib/auth-context";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useRealtimeNotifications, type RealtimeNotification } from "@/hooks/useRealtimeNotifications";
import { BackNavigationButton } from "@/components/navigation/BackNavigationButton";
import ChefHelpButton from "@/components/help/ChefHelpButton";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import RoleSpaceMenuSection from "@/components/navigation/RoleSpaceMenuSection";
import ThemeToggleButton from "@/components/theme/ThemeToggleButton";
import SignOutButton from "@/components/auth/SignOutButton";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { useWorkforceSettings } from "@/hooks/useTokWorkforce";

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
  "rounded-[10px] bg-gradient-to-r from-[#ff5a00] via-[#ff7a1a] to-[#ffb000] font-bold text-white shadow-sm hover:from-[#ff6814] hover:via-[#ff8424] hover:to-[#ffba18] hover:text-white dark:text-white shadow-sm";

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Pilotage",
    items: [
      { to: "/dashboard", label: "Vue d'ensemble", icon: LayoutDashboard, feature: "dashboard-overview" },
      { to: "/dashboard/advisor", label: "Assistant IA", icon: Bot, feature: "dashboard-advisor" },
      { to: "/dashboard/commandes", label: "Commandes et retraits", icon: ShoppingCart, feature: "dashboard-commandes" },
      { to: "/dashboard/reservations", label: "Réservations", icon: CalendarDays, feature: "dashboard-reservations" },
      { to: "/dashboard/performances", label: "Performances", icon: BarChart3, feature: "dashboard-performances" },
      { to: "/dashboard/comparaison", label: "Comparaison", icon: Scale, feature: "dashboard-comparaison" },
      { to: "/dashboard/avis", label: "Avis clients", icon: MessageSquareText, feature: "dashboard-avis" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { to: "/dashboard/campagnes", label: "Campagnes", icon: Megaphone, feature: "dashboard-campagnes" },
      { to: "/dashboard/campaign-studio", label: "Campaign Studio IA", icon: Bot, feature: "dashboard-campaign-studio" },
      { to: "/dashboard/crm", label: "CRM clients", icon: Users, feature: "dashboard-crm" },
      { to: "/dashboard/promotions", label: "Promotions", icon: Megaphone, feature: "dashboard-promotions" },
      { to: "/dashboard/reseaux-sociaux", label: "Réseaux sociaux", icon: Share2, feature: "dashboard-reseaux-sociaux" },
      { to: "/dashboard/photos", label: "Studio Marketing", icon: Camera, feature: "dashboard-photos", emphasis: "marketing-studio" },
      { to: "/dashboard/actualites", label: "Actualités", icon: Newspaper, feature: "dashboard-actualites" },
    ],
  },
  {
    title: "Finances",
    items: [
      { to: "/dashboard/mon-compte-facturation", label: "Mon compte / Facturation", icon: CreditCard, feature: "dashboard-billing" },
      { to: "/dashboard/factures", label: "Comptabilité & factures", icon: ReceiptText, feature: "dashboard-factures" },
    ],
  },
  {
    title: "Mon offre",
    items: [
      { to: "/dashboard/tok-connect", label: "Tok Connect", icon: Plug, feature: "dashboard-tok-connect" },
    ],
  },
  {
    title: "Mon restaurant",
    items: [
      { to: "/dashboard/restaurant", label: "Mon restaurant", icon: UtensilsCrossed, feature: "dashboard-restaurant" },
      { to: "/dashboard/menu", label: "Menu", icon: BookOpen, feature: "dashboard-menu" },
      { to: "/dashboard/offres", label: "Anti-gaspi", icon: Leaf, feature: "dashboard-offres" },
      { to: "/dashboard/ventes-flash", label: "Ventes flash", icon: Zap, feature: "dashboard-ventes-flash" },
      { to: "/dashboard/formules", label: "Formules", icon: Percent, feature: "dashboard-formules" },
      { to: "/dashboard/service", label: "Pilotage de service", icon: SlidersHorizontal, feature: "dashboard-service" },
      { to: "/dashboard/plan-salle", label: "Plan de salle", icon: Map, feature: "dashboard-plan-salle" },
      { to: "/dashboard/equipe", label: "TOK Équipe", icon: Clock3 },
    ],
  },
  {
    title: "Assistance",
    items: [
      { to: "/dashboard/notifications", label: "Notifications", icon: Bell },
      { to: "/dashboard/support", label: "Aide et support", icon: CircleHelp, feature: "dashboard-support" },
      { to: "/dashboard/guide", label: "Guide d’utilisation", icon: BookOpen },
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
    <div ref={ref} className="tok-workspace-restaurant-selector relative mb-3 px-2">
      <button
        aria-label={selected?.name ? `Choisir un restaurant : ${selected.name}` : "Choisir un restaurant"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center rounded-2xl border bg-sidebar-accent/50 text-sm font-semibold transition-colors dark:border-border dark:bg-card/78 dark:text-slate-100 shadow-sm dark:hover:bg-[#0c1b38]",
          collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
        )}
      >
        <Store className="h-4 w-4 text-primary" />
        {!collapsed && (
          <>
            <span className="tok-menu-establishment ml-2 min-w-0 flex-1 text-left"><span>Établissement</span><strong>{selected?.name || "Choisir un restaurant"}</strong></span>
            <ChevronDown className={cn("h-4 w-4", open && "rotate-180")} />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-2 right-2 z-50 mt-2 rounded-2xl border bg-white shadow-lg dark:border-border dark:bg-card shadow-sm">
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
  onboardingConfigurationUnlocked = false,
}: {
  pathname: string;
  sections: NavSection[];
  collapsed?: boolean;
  disabledFeatures?: Set<string>;
  unreadNotifications: ReturnType<typeof useNotificationCenter>["unreadNotifications"];
  role: ReturnType<typeof useAuth>["role"];
  dashboardAccessLocked?: boolean;
  onboardingConfigurationUnlocked?: boolean;
}) {
  return (
    <>
      {sections.map((section) => (
        <WorkspaceNavigationSection
          key={section.title}
          title={section.title === "Mon offre" ? "Tok Connect" : section.title}
          icon={section.items[0].icon}
          active={section.items.some((item) => isDashboardNavItemActive(pathname, item.to))}
          collapsed={collapsed}
        >
          {section.items.map((item) => {
            const isMarketingStudio = item.emphasis === "marketing-studio";
            const isActive = isDashboardNavItemActive(pathname, item.to);
            const availableDuringOnboarding = canAccessRestaurantDashboardRoute({
              pathname: item.to,
              dashboardAccessLocked,
              onboardingConfigurationUnlocked,
              disabledFeatures,
            });
            const isLocked = dashboardAccessLocked && item.to !== "/dashboard" && !availableDuringOnboarding
              ? true
              : !availableDuringOnboarding && !!(item.feature && disabledFeatures?.has(item.feature));
            const lockTitle = dashboardAccessLocked
              ? onboardingConfigurationUnlocked
                ? "Disponible après la validation du dossier par l'admin TOK"
                : "Enregistrez d'abord votre carte bancaire"
              : "Non inclus dans votre pack ou abonnement";

            if (isLocked) {
              return (
                <div
                  key={item.to}
                  className="tok-workspace-nav-link flex items-center gap-3 min-h-11 rounded-xl px-3 py-2 opacity-40 cursor-not-allowed select-none"
                  aria-disabled="true"
                  aria-label={collapsed ? `${item.label} — ${lockTitle}` : undefined}
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
                aria-current={isActive ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "tok-workspace-nav-link flex items-center gap-3 min-h-11 rounded-xl px-3 py-2 text-sm font-semibold transition-all",
                  isMarketingStudio
                    ? MARKETING_STUDIO_NAV_CLASS
                    : isActive
                      ? "bg-primary/10 text-primary shadow-sm dark:bg-[#ff6a1a]/14 dark:text-[#ffd8c3] shadow-sm"
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
        </WorkspaceNavigationSection>
      ))}
    </>
  );
}

type DashboardLayoutProps = {
  children: React.ReactNode;
  contentWidth?: "default" | "full";
  mainClassName?: string;
  constrainToViewport?: boolean;
};

export default function DashboardLayout({
  children,
  contentWidth = "default",
  mainClassName,
  constrainToViewport = false,
}: DashboardLayoutProps) {
  const { pathname, hash } = useLocation();
  const pageRef = useRef<HTMLElement>(null);
  useJourneyFocus(pageRef, hash ? null : pathname);
  const queryClient = useQueryClient();
  const logoSrc = useTokLogoSrc();
  const { restaurants, selectedId, disabledFeatures, dashboardAccessLocked, dashboardAccessLockReason, onboardingConfigurationUnlocked, isDemoMode } = useDashboardRestaurant();
  const commercialDemoFrame = useCommercialDemoFrame();
  const workforceSettings = useWorkforceSettings(isDemoMode ? null : selectedId);
  const globalActiveFeatures = useActiveFeatures({ enabled: !commercialDemoFrame });
  const { role } = useAuth();
  const activeFeatures = useMemo(
    () => commercialDemoFrame
      ? new Set(commercialDemoFrame.snapshot.active_features)
      : globalActiveFeatures,
    [commercialDemoFrame, globalActiveFeatures],
  );
  const { unreadNotifications } = useNotificationCenter(50, { realtime: true });

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
        if (item.to === "/dashboard/equipe" && workforceSettings.data?.enabled !== true) return false;
        return !item.feature || activeFeatures.has(item.feature);
      }),
    })).filter((section) => section.items.length > 0);
  }, [activeFeatures, commercialDemoFrame, workforceSettings.data?.enabled]);

  const activeNavItem = useMemo(
    () =>
      sections
        .flatMap((section) => section.items)
        .filter((item) => isDashboardNavItemActive(pathname, item.to))
        .sort((a, b) => b.to.length - a.to.length)[0],
    [pathname, sections]
  );
  const selectedRestaurantName = restaurants.find((restaurant) => restaurant.id === selectedId)?.name ?? "Mon restaurant";
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
    <div className="tok-workspace-shell tok-hospitality-workspace tok-dashboard-shell flex min-h-screen min-h-[100dvh] min-w-0 flex-col text-foreground md:flex-row">
      {/* SIDEBAR */}
      <aside
        ref={sidebarRef}
        data-collapsed={collapsed}
        className={cn(
          "tok-dashboard-menu tok-workspace-sidebar tok-dashboard-sidebar hidden overflow-y-auto overscroll-contain border-r bg-sidebar transition-all md:sticky md:top-0 md:flex md:h-[100dvh] md:shrink-0 md:self-start md:flex-col",
          collapsed ? "w-[80px]" : "w-72"
        )}
      >
        <div className="tok-workspace-brand">
          <Link to="/dashboard" aria-label="TOK — Tableau de bord" className="tok-workspace-logo-link">
            <img src={logoSrc} alt="TOK" width={178} height={116} className="tok-workspace-logo" />
            {!collapsed && <span>Espace restaurateur</span>}
          </Link>
          <Button size="icon" variant="ghost" aria-label={collapsed ? "Développer la navigation" : "Réduire la navigation"} className="tok-workspace-collapse rounded-xl dark:hover:bg-white/10" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <RestaurantSelector collapsed={collapsed} />

        {!collapsed && !commercialDemoFrame ? (
          <details className="tok-workspace-role-switch">
            <summary>Changer d’espace <ChevronDown className="h-3.5 w-3.5" /></summary>
            <RoleSpaceMenuSection />
          </details>
        ) : null}

        <nav aria-label="Navigation de l’espace restaurateur" className="flex flex-col gap-1 px-2 pb-3">
          <NavItems
            pathname={pathname}
            sections={sections}
            collapsed={collapsed}
            disabledFeatures={disabledFeatures}
            unreadNotifications={unreadNotifications}
            role={role}
            dashboardAccessLocked={dashboardAccessLocked}
            onboardingConfigurationUnlocked={onboardingConfigurationUnlocked}
          />
        </nav>

        {!commercialDemoFrame ? (
          <div className="tok-workspace-sidebar-footer mt-auto border-t px-3 py-3 dark:border-[#5f7aad]/28">
            <ChefHelpButton surface="restaurant" menuCard collapsed={collapsed} />
            <SignOutButton
              iconOnly={collapsed}
              className={cn(
                collapsed
                  ? "mx-auto border-destructive/20 bg-transparent shadow-none"
                  : "w-full justify-start rounded-xl px-3",
              )}
            />
          </div>
        ) : null}
      </aside>

      <div className="fixed right-[calc(env(safe-area-inset-right,0px)+0.75rem)] top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[40] flex items-center gap-2 md:hidden">
        <ThemeToggleButton className="h-11 w-11 rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm backdrop-blur-md hover:bg-background dark:border-border dark:bg-card/95 dark:text-white shadow-sm" />
        <NotificationBell />
        {!commercialDemoFrame ? <SignOutButton iconOnly className="hidden min-[420px]:inline-flex" /> : null}
      </div>

      {/* MOBILE */}
      <div className="pointer-events-none fixed left-[calc(env(safe-area-inset-left,0px)+0.75rem)] top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[40] md:hidden">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "tok-mobile-menu-trigger pointer-events-auto h-14 max-w-[11rem] rounded-[1.15rem] border border-border bg-card p-1.5 pr-3 text-foreground shadow-[0_10px_30px_rgb(54_36_22/0.10)] ring-1 ring-white/30 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-muted dark:border-border dark:bg-card",
                mobileMenuOpen && "border-orange-200 bg-primary text-primary-foreground hover:bg-primary"
              )}
              aria-label="Ouvrir le menu du dashboard"
              data-testid="restaurant-mobile-menu-trigger"
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.9rem] bg-primary text-primary-foreground shadow-sm transition-colors",
                  mobileMenuOpen && "bg-white/15 text-current shadow-none"
                )}
              >
                <Menu className="h-5 w-5" />
              </span>
              <span className="tok-mobile-menu-trigger__copy min-w-0 flex-col items-start leading-tight">
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.28em] text-primary",
                    mobileMenuOpen && "text-primary-foreground/75"
                  )}
                >
                  Menu
                </span>
                <span className="max-w-[6.25rem] truncate text-sm font-semibold">
                  {activeNavItem?.label ?? "Ouvrir le menu"}
                </span>
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            data-testid="restaurant-mobile-menu-panel"
            className="tok-dashboard-menu tok-mobile-dashboard-menu flex h-[100dvh] w-[min(23rem,calc(100vw-0.75rem))] flex-col overflow-hidden border-r p-0 dark:border-border dark:bg-card"
          >
            <DashboardMenuHeader space="Espace restaurateur" description={`Navigation du restaurant ${selectedRestaurantName}.`} />
            <div data-sheet-scroll-area className="tok-mobile-menu-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-4 pt-4">
              <RestaurantSelector />
              <nav aria-label="Navigation mobile de l’espace restaurateur" className="tok-mobile-navigation flex flex-col gap-1 pb-4">
                <NavItems
                  pathname={pathname}
                  sections={sections}
                  disabledFeatures={disabledFeatures}
                  unreadNotifications={unreadNotifications}
                  role={role}
                  dashboardAccessLocked={dashboardAccessLocked}
                  onboardingConfigurationUnlocked={onboardingConfigurationUnlocked}
                />
              </nav>
              {!commercialDemoFrame ? (
                <div className="tok-mobile-menu-space-switch border-t pt-3">
                  <RoleSpaceMenuSection onNavigate={() => setMobileMenuOpen(false)} />
                </div>
              ) : null}
              {!commercialDemoFrame ? (
                <div className="tok-mobile-menu-footer border-t px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
                  <ChefHelpButton surface="restaurant" menuCard onOpen={() => setMobileMenuOpen(false)} />
                  <SignOutButton
                    onSignedOut={() => setMobileMenuOpen(false)}
                    className="w-full justify-start rounded-xl px-3"
                  />
                </div>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* MAIN */}
      <div className="tok-workspace-body min-w-0 flex-1" data-constrained={constrainToViewport}>
        <WorkspaceToolbar
          className="hidden md:flex"
          search={<WorkspaceToolSearch tools={sections.flatMap((section) => section.items
            .filter((item) => canAccessRestaurantDashboardRoute({ pathname: item.to, dashboardAccessLocked, onboardingConfigurationUnlocked, disabledFeatures }))
            .map((item) => ({ ...item, group: section.title })))} />}
        >
          <ThemeToggleButton className="h-10 w-10 rounded-full" />
          <NotificationBell buttonClassName="h-10 w-10 shadow-none" />
          {!commercialDemoFrame ? <WorkspaceAccountLink to="/dashboard/mon-compte-facturation" /> : null}
        </WorkspaceToolbar>
      <main
        ref={pageRef}
        tabIndex={-1}
        aria-label={activeNavItem?.label || "Espace restaurateur"}
        className={cn(
          "tok-workspace-content relative min-w-0 flex-1 overflow-x-clip p-4 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] sm:p-5 sm:pb-[calc(env(safe-area-inset-bottom,0px)+2.5rem)] md:p-6 md:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]",
          constrainToViewport && "flex h-[100dvh] min-h-0 flex-col overflow-y-hidden",
          mainClassName,
          "pt-[calc(env(safe-area-inset-top,0px)+5rem)] sm:pt-[calc(env(safe-area-inset-top,0px)+5rem)] md:pt-4",
        )}
      >
        <div
          className={cn(
            "relative z-10 w-full",
            constrainToViewport && "flex min-h-0 flex-1 flex-col",
            contentWidth === "full" ? "max-w-none" : "mx-auto max-w-7xl",
          )}
        >
          <BackNavigationButton
            fallback={backFallback}
            className={cn("tok-workspace-back mb-4", constrainToViewport && "shrink-0")}
          />
          {isDemoMode ? (
            <div className="mb-6 rounded-3xl border border-sky-200 bg-sky-50/95 p-5 text-sky-950 shadow-sm dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-50" role="status" data-testid="commercial-demo-banner">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-100">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <div className="space-y-1">
                  <p className="font-semibold">Mode démonstration — restaurant simulé</p>
                  <p className="text-sm text-sky-800 dark:text-sky-100/80">
                    Les outils IA utilisent réellement OpenAI, sans débit de crédits TOK pour les commerciaux. Les paiements, publications et envois externes restent simulés et bloqués côté serveur.
                  </p>
                  <p className="text-xs text-sky-700 dark:text-sky-100/70">
                    Ce restaurant est isolé du catalogue public et ne contient aucune donnée réelle de restaurateur ou de client.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {dashboardAccessLocked ? (
            <div className="tok-dashboard-access-notice mb-6 rounded-3xl border border-amber-200 bg-amber-50/90 p-5 text-amber-950 shadow-sm dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
              <div className="tok-dashboard-access-notice__layout flex flex-col gap-3 sm:flex-row sm:items-start">
                <span className="tok-dashboard-access-notice__icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-100">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">Dossier restaurateur en cours de validation</p>
                  <p className="text-xs text-amber-800 sm:hidden dark:text-amber-100/80">Votre fiche reste privée pendant la validation humaine.</p>
                  <div className="hidden space-y-1 sm:block">
                    <p className="text-sm text-amber-800 dark:text-amber-100/80">
                      {dashboardAccessLockReason}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-100/70">
                      {onboardingConfigurationUnlocked
                        ? "Les onglets de configuration du restaurant sont ouverts. Les outils liés à l'abonnement seront disponibles après l'approbation de l'admin TOK."
                        : "Enregistrez d'abord votre carte bancaire depuis la vue d'ensemble pour débloquer Menu, Mon restaurant et les autres onglets de configuration."}
                    </p>
                  </div>
                  <details className="pt-1 sm:hidden">
                    <summary className="tok-dashboard-access-notice__summary">Voir les détails</summary>
                    <div className="mt-2 space-y-1 border-t border-amber-200/80 pt-2 dark:border-amber-300/20">
                      <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-100/80">{dashboardAccessLockReason}</p>
                      <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-100/70">
                        {onboardingConfigurationUnlocked
                          ? "Les onglets de configuration du restaurant sont ouverts. Les outils liés à l'abonnement seront disponibles après l'approbation de l'admin TOK."
                          : "Enregistrez d'abord votre carte bancaire depuis la vue d'ensemble pour débloquer Menu, Mon restaurant et les autres onglets de configuration."}
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          ) : null}
          {dashboardAccessLocked
            && pathname !== "/dashboard"
            && !(onboardingConfigurationUnlocked && isRestaurantOnboardingConfigurationRoute(pathname)) ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50/90 p-8 text-center text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
                <Lock className="mx-auto mb-3 h-8 w-8" />
                <p className="font-semibold">
                  {onboardingConfigurationUnlocked
                    ? "Cet outil sera disponible après la validation de votre restaurant."
                    : "Enregistrez votre carte bancaire pour commencer la configuration de votre restaurant."}
                </p>
              </div>
            ) : children}
        </div>
      </main>
      </div>
    </div>
  );
}
