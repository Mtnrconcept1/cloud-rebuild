import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  Bike,
  BookOpen,
  Boxes,
  Brain,
  BriefcaseBusiness,
  Calculator,
  CalendarRange,
  ClipboardList,
  Crown,
  FileText,
  Layers,
  LayoutDashboard,
  MapPin,
  Menu,
  Megaphone,
  MessageSquareText,
  Network,
  Newspaper,
  PieChart,
  Printer,
  Settings2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Store,
  Clock3,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import AdminTheForkVisibilityControl from "@/components/admin/AdminTheForkVisibilityControl";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import ChefHelpButton from "@/components/help/ChefHelpButton";
import RoleSpaceMenuSection from "@/components/navigation/RoleSpaceMenuSection";
import SignOutButton from "@/components/auth/SignOutButton";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useAuth } from "@/lib/auth-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";
import { OPTIMIZED_TOK_LOGO_SRC } from "@/lib/tokLogo";

type AdminNavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: string;
  pendingSignupBadge?: boolean;
  supportIncidentBadge?: boolean;
};

type AdminNavSection = {
  title: string;
  items: AdminNavItem[];
};

const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    title: "Utilisateurs, Partenaires et équipe",
    items: [
      { to: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, feature: "admin-utilisateurs" },
      { to: "/admin/restaurants", label: "Restaurants", icon: Store, feature: "admin-restaurants" },
      { to: "/admin/utilisateurs?tab=applications", label: "Dossiers d'inscription", icon: FileText, feature: "admin-utilisateurs", pendingSignupBadge: true },
      { to: "/admin/utilisateurs?tab=couriers", label: "Profils livreurs", icon: Bike, feature: "admin-utilisateurs" },
      { to: "/admin/utilisateurs?tab=commercials", label: "Comptes commerciaux", icon: BriefcaseBusiness, feature: "admin-utilisateurs" },
      { to: "/admin/equipe", label: "TOK Équipe", icon: Clock3 },
    ],
  },
  {
    title: "Réservations & services",
    items: [
      { to: "/admin/commandes-reservations", label: "Commandes et réservations", icon: ClipboardList, feature: "admin-operations-center" },
      { to: "/admin/catalog", label: "Catalogue central", icon: Layers, feature: "admin-catalog" },
      { to: "/admin/drops", label: "La Tok d’Or", icon: UtensilsCrossed, feature: "admin-drops" },
      { to: "/admin/tok-printer", label: "TOK Printer", icon: Printer },
    ],
  },
  {
    title: "Clients & marketing",
    items: [
      { to: "/admin/crm", label: "CRM clients", icon: Users, feature: "admin-crm" },
      { to: "/admin/loyalty", label: "Fidélité et abonnement", icon: Crown, feature: "admin-loyalty" },
      { to: "/admin/restaurants/google-business", label: "Boutons Google Business", icon: MapPin, feature: "admin-restaurants" },
      { to: "/admin/notifications", label: "Notifications", icon: Bell, feature: "admin-notifications" },
      { to: "/admin/actualites", label: "Actualités sociales", icon: Newspaper, feature: "admin-actualites" },
      { to: "/admin/avis", label: "Avis", icon: MessageSquareText, feature: "admin-avis" },
    ],
  },
  {
    title: "Finances & abonnements",
    items: [
      { to: "/admin/compta", label: "Comptabilité", icon: Calculator, feature: "admin-compta" },
      { to: "/admin/compta/ia", label: "IA comptable", icon: Brain, feature: "ai_accounting_insights" },
      { to: "/admin/packs", label: "Abonnements restaurateur", icon: Crown, feature: "admin-packs" },
    ],
  },
  {
    title: "Sécurité & assistance",
    items: [
      { to: "/admin/security-center", label: "Centre de sécurité", icon: Shield, feature: "admin-audit" },
      { to: "/admin/security-center?view=guardian", label: "Guardian IA", icon: ShieldAlert, feature: "admin-guardian" },
      { to: "/admin/sinistres", label: "Sinistres et chat", icon: MessageSquareText, feature: "admin-operations-center", supportIncidentBadge: true },
      { to: "/admin/support-resolution", label: "Résolution IA", icon: Brain, feature: "admin-support-resolution" },
    ],
  },
  {
    title: "Plateforme & outils",
    items: [
      { to: "/admin/ai-operations", label: "Opérations IA", icon: Brain, feature: "ai_admin_monitoring" },
      { to: "/admin/tok-connect", label: "TOK Connect", icon: Network, feature: "admin-tok-connect" },
      { to: "/admin/guide", label: "Guide administrateur", icon: BookOpen },
    ],
  },
];

const ADMIN_SECTION_ICONS = [Users, CalendarRange, Megaphone, PieChart, ShieldCheck, Boxes] as const;

function splitAdminTarget(to: string) {
  const [pathname, search] = to.split("?");
  return {
    pathname,
    search: search ? `?${search}` : "",
  };
}

function isAdminNavItemActive(pathname: string, search: string, itemTo: string) {
  const target = splitAdminTarget(itemTo);

  if (target.search) {
    return pathname === target.pathname && search === target.search;
  }

  if (target.pathname === "/admin") {
    return pathname === target.pathname;
  }

  return pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
}

async function fetchOpenSupportIncidentCount() {
  const client = getSupabase();
  const [incidentsResult, ticketsResult] = await Promise.all([
    (client as any)
      .from("support_incidents")
      .select("id", { count: "exact", head: true })
      .not("status", "in", '("closed","resolved")'),
    (client as any)
      .from("ai_support_tickets")
      .select("id", { count: "exact", head: true })
      .is("support_incident_id", null)
      .not("status", "in", '("closed","resolved")'),
  ]);

  if (incidentsResult.error) throw incidentsResult.error;
  if (ticketsResult.error) throw ticketsResult.error;

  return (incidentsResult.count || 0) + (ticketsResult.count || 0);
}

function AdminNavItems({
  activeTo,
  sections,
  unreadNotifications,
  role,
  pendingSignupApplicationsCount,
  openSupportIncidentCount,
}: {
  activeTo?: string;
  sections: AdminNavSection[];
  unreadNotifications: ReturnType<typeof useNotificationCenter>["unreadNotifications"];
  role: ReturnType<typeof useAuth>["role"];
  pendingSignupApplicationsCount: number;
  openSupportIncidentCount: number;
}) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.title} className="tok-menu-section">
          <p className="tok-menu-section-title">
            {section.title}
          </p>
          {section.items.map((item) => {
            const isActive = item.to === activeTo;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "tok-workspace-nav-link flex items-center gap-3 min-h-11 rounded-xl px-3 py-2 text-sm font-semibold transition-all",
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm dark:bg-[#ff6a1a]/14 dark:text-[#ffd8c3] shadow-sm"
                    : "hover:bg-muted dark:text-slate-200 dark:hover:bg-[#102044]/72",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
                {item.pendingSignupBadge && pendingSignupApplicationsCount > 0 ? (
                  <span
                    className="ml-auto inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white"
                    aria-label={`${pendingSignupApplicationsCount} dossier d'inscription en attente`}
                  >
                    {pendingSignupApplicationsCount}
                  </span>
                ) : null}
                {item.supportIncidentBadge && openSupportIncidentCount > 0 ? (
                  <span
                    className="ml-auto inline-flex min-h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm"
                    aria-label={`${openSupportIncidentCount} sinistre chat ouvert`}
                  >
                    {openSupportIncidentCount}
                  </span>
                ) : null}
                <NotificationMenuBadge route={item.to} role={role} unreadNotifications={unreadNotifications} />
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export default function AdminMobileNavigation() {
  const { pathname, search } = useLocation();
  const activeFeatures = useActiveFeatures();
  const { role } = useAuth();
  const { unreadNotifications } = useNotificationCenter(50, { realtime: true });
  const [pendingSignupApplicationsCount, setPendingSignupApplicationsCount] = useState(0);
  const [openSupportIncidentCount, setOpenSupportIncidentCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!activeFeatures.has("admin-utilisateurs")) {
      setPendingSignupApplicationsCount(0);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { count, error } = await getSupabase()
          .from("signup_applications")
          .select("id", { count: "exact", head: true })
          .in("requested_role", ["restaurateur", "courier", "commercial"])
          .eq("status", "pending_review");
        if (!cancelled && !error) {
          setPendingSignupApplicationsCount(count || 0);
        }
      } catch {
        if (!cancelled) {
          setPendingSignupApplicationsCount(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeFeatures]);

  useEffect(() => {
    if (!activeFeatures.has("admin-operations-center")) {
      setOpenSupportIncidentCount(0);
      return;
    }

    let cancelled = false;
    const refreshOpenSupportIncidents = () => {
      fetchOpenSupportIncidentCount()
        .then((count) => {
          if (!cancelled) setOpenSupportIncidentCount(count);
        })
        .catch(() => {
          if (!cancelled) setOpenSupportIncidentCount(0);
        });
    };

    refreshOpenSupportIncidents();

    const channel = getSupabase()
      .channel("admin-support-nav-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_incidents" }, refreshOpenSupportIncidents)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_incident_messages" }, refreshOpenSupportIncidents)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_support_tickets" }, refreshOpenSupportIncidents)
      .subscribe();

    return () => {
      cancelled = true;
      void getSupabase().removeChannel(channel);
    };
  }, [activeFeatures]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, search]);

  const sections = useMemo(
    () =>
      ADMIN_NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.feature || activeFeatures.has(item.feature)),
      })).filter((section) => section.items.length > 0),
    [activeFeatures],
  );

  const activeNavItem = useMemo(
    () =>
      sections
        .flatMap((section) => section.items)
        .filter((item) => isAdminNavItemActive(pathname, search, item.to))
        .sort((left, right) => {
          const leftTarget = splitAdminTarget(left.to);
          const rightTarget = splitAdminTarget(right.to);
          return rightTarget.pathname.length - leftTarget.pathname.length || rightTarget.search.length - leftTarget.search.length;
        })[0],
    [pathname, search, sections],
  );

  const settingsTarget = activeFeatures.has("admin-platform-config") ? "/admin/platform" : "/parametres/securite";

  return (
    <>
      {pathname === "/admin/restaurants" ? (
        <div className="pointer-events-auto fixed bottom-24 right-3 z-[70] md:bottom-4">
          <AdminTheForkVisibilityControl />
        </div>
      ) : null}

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <aside className="fixed inset-y-0 left-0 z-[70] hidden w-20 flex-col items-center border-r border-border/70 bg-card/95 shadow-sm backdrop-blur-xl md:flex">
          <Link to="/admin" aria-label="Accueil administration" className="flex h-[5.5rem] w-full items-center justify-center overflow-hidden border-b bg-gradient-to-br from-[#ff7a1a] to-primary">
            <img src={OPTIMIZED_TOK_LOGO_SRC} alt="TOK" className="h-16 w-16 scale-110 object-contain" />
          </Link>
          <nav className="flex flex-1 flex-col items-center gap-2 py-4" aria-label="Catégories admin">
            <Link
              to="/admin"
              title="Accueil"
              aria-current={pathname === "/admin" ? "page" : undefined}
              className={cn("flex h-11 w-11 items-center justify-center rounded-xl transition", pathname === "/admin" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-primary/10 hover:text-primary")}
            >
              <LayoutDashboard className="h-5 w-5" />
            </Link>
            {sections.map((section, index) => {
              const SectionIcon = ADMIN_SECTION_ICONS[index] ?? Menu;
              const firstItem = section.items[0];
              const sectionActive = section.items.some((item) => isAdminNavItemActive(pathname, search, item.to));
              return firstItem ? (
                <Link
                  key={section.title}
                  to={firstItem.to}
                  title={section.title}
                  aria-label={section.title}
                  className={cn("flex h-11 w-11 items-center justify-center rounded-xl transition", sectionActive ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-primary")}
                >
                  <SectionIcon className="h-5 w-5" />
                </Link>
              ) : null;
            })}
          </nav>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mb-4 h-11 w-11 rounded-xl border" aria-label="Ouvrir le menu admin">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
        </aside>

        <nav className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] z-[70] grid h-[4.25rem] grid-cols-4 rounded-[1.35rem] border border-border/70 bg-card/95 px-2 shadow-[0_16px_42px_rgba(26,20,15,0.18)] backdrop-blur-xl md:hidden" aria-label="Navigation admin mobile">
          <Link to="/admin" aria-current={pathname === "/admin" ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold", pathname === "/admin" ? "text-primary" : "text-muted-foreground")}>
            <LayoutDashboard className="h-5 w-5" /><span>Accueil</span>
          </Link>
          <SheetTrigger asChild>
            <button type="button" aria-label="Ouvrir les outils admin" className={cn("flex flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold", mobileMenuOpen ? "text-primary" : "text-muted-foreground")}>
              <Menu className="h-5 w-5" /><span>Outils</span>
            </button>
          </SheetTrigger>
          <Link to="/admin/notifications" className={cn("relative flex flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold", pathname === "/admin/notifications" ? "text-primary" : "text-muted-foreground")}>
            <span className="relative"><Bell className="h-5 w-5" />{unreadNotifications.length > 0 ? <span className="absolute -right-2 -top-2 h-2.5 w-2.5 rounded-full border-2 border-card bg-red-500" /> : null}</span><span>Alertes</span>
          </Link>
          <Link to={settingsTarget} className={cn("flex flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold", pathname === settingsTarget ? "text-primary" : "text-muted-foreground")}>
            <Settings2 className="h-5 w-5" /><span>Réglages</span>
          </Link>
        </nav>

        <SheetContent side="left" className="tok-dashboard-menu tok-mobile-dashboard-menu p-0">
          <header className="border-b bg-gradient-to-br from-orange-50 to-card px-6 pb-5 pt-6 dark:from-orange-950/20">
            <div className="flex items-center gap-3 pr-12">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#ff7a1a] to-primary shadow-md">
                <img src={OPTIMIZED_TOK_LOGO_SRC} alt="TOK" className="h-full w-full scale-110 object-contain" />
              </span>
              <span><span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Back-office TOK</span><span className="font-display text-xl font-bold">Administration</span></span>
            </div>
          </header>
          <div data-sheet-scroll-area className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-4">
            <div className="mb-4">
              <RoleSpaceMenuSection onNavigate={() => setMobileMenuOpen(false)} />
            </div>
            <Link to="/admin" className="tok-workspace-nav-link mb-3 flex min-h-11 items-center gap-3 rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
              <LayoutDashboard className="h-4 w-4" /> Vue d'ensemble
            </Link>
            <nav className="flex flex-col gap-1 pb-4">
              <AdminNavItems
                activeTo={activeNavItem?.to}
                sections={sections}
                unreadNotifications={unreadNotifications}
                role={role}
                pendingSignupApplicationsCount={pendingSignupApplicationsCount}
                openSupportIncidentCount={openSupportIncidentCount}
              />
              <div className="tok-menu-footer mt-3 border-t pt-3">
                <ChefHelpButton surface="admin" menuCard onOpen={() => setMobileMenuOpen(false)} />
                <SignOutButton onSignedOut={() => setMobileMenuOpen(false)} className="w-full justify-start rounded-xl px-3" />
              </div>
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
