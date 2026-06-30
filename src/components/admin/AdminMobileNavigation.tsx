import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  Bike,
  Brain,
  Calculator,
  ClipboardList,
  Crown,
  FileText,
  Layers,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageSquareText,
  Newspaper,
  Settings2,
  Shield,
  ShieldAlert,
  Store,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import ChefHelpButton from "@/components/help/ChefHelpButton";
import RoleSpaceSwitcher from "@/components/navigation/RoleSpaceSwitcher";
import SignOutButton from "@/components/auth/SignOutButton";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useAuth } from "@/lib/auth-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";

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
    title: "Pilotage",
    items: [
      { to: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard },
      { to: "/admin/commandes-reservations", label: "Commandes et reservations", icon: ClipboardList, feature: "admin-operations-center" },
      { to: "/admin/sinistres", label: "Sinistres et chat", icon: ShieldAlert, feature: "admin-operations-center", supportIncidentBadge: true },
      { to: "/admin/restaurants", label: "Restaurants", icon: Store, feature: "admin-restaurants" },
      { to: "/admin/restaurants/google-business", label: "Boutons Google", icon: MapPin, feature: "admin-restaurants" },
      { to: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, feature: "admin-utilisateurs" },
      { to: "/admin/utilisateurs?tab=applications", label: "Dossiers d'inscription", icon: FileText, feature: "admin-utilisateurs", pendingSignupBadge: true },
      { to: "/admin/utilisateurs?tab=couriers", label: "Profils livreurs", icon: Bike, feature: "admin-utilisateurs" },
    ],
  },
  {
    title: "Comptabilite",
    items: [
      { to: "/admin/compta", label: "Vue comptable", icon: Calculator, feature: "admin-compta" },
      { to: "/admin/compta/entrees", label: "Entrees", icon: Calculator, feature: "admin-compta" },
      { to: "/admin/compta/sorties", label: "Sorties", icon: Calculator, feature: "admin-compta" },
      { to: "/admin/compta/ia", label: "IA comptable", icon: Brain, feature: "ai_accounting_insights" },
    ],
  },
  {
    title: "Croissance",
    items: [
      { to: "/admin/avis", label: "Avis", icon: MessageSquareText, feature: "admin-avis" },
      { to: "/admin/catalog", label: "Catalogue central", icon: Layers, feature: "admin-catalog" },
      { to: "/admin/loyalty", label: "Fidelite et abonnement", icon: Crown, feature: "admin-loyalty" },
      { to: "/admin/drops", label: "La Table du Chef", icon: UtensilsCrossed, feature: "admin-drops" },
      { to: "/admin/notifications", label: "Notifications", icon: Bell, feature: "admin-notifications" },
      { to: "/admin/actualites", label: "Actualites sociales", icon: Newspaper, feature: "admin-actualites" },
      { to: "/admin/crm", label: "CRM clients", icon: Users, feature: "admin-crm" },
    ],
  },
  {
    title: "Gouvernance",
    items: [
      { to: "/admin/audit", label: "Audit et securite", icon: Shield, feature: "admin-audit" },
      { to: "/admin/platform", label: "Configuration plateforme", icon: Settings2, feature: "admin-platform-config" },
      { to: "/admin/ai-operations", label: "Operations IA", icon: Brain, feature: "ai_admin_monitoring" },
      { to: "/admin/packs", label: "Abonnements restaurateur", icon: Crown, feature: "admin-packs" },
    ],
  },
];

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
        <div key={section.title}>
          <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400">
            {section.title}
          </p>
          {section.items.map((item) => {
            const isActive = item.to === activeTo;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all",
                  isActive
                    ? "bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-[#ff6a1a]/14 dark:text-[#ffd8c3] dark:shadow-[0_0_28px_rgba(255,106,26,0.22)]"
                    : "hover:bg-muted dark:text-slate-200 dark:hover:bg-[#102044]/72",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
                {item.pendingSignupBadge && pendingSignupApplicationsCount > 0 ? (
                  <span
                    className="ml-auto inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white"
                    aria-label={`${pendingSignupApplicationsCount} dossier restaurateur en attente`}
                  >
                    {pendingSignupApplicationsCount}
                  </span>
                ) : null}
                {item.supportIncidentBadge && openSupportIncidentCount > 0 ? (
                  <span
                    className="ml-auto inline-flex min-h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white shadow-[0_0_18px_rgba(220,38,38,0.55)]"
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
  const { unreadNotifications } = useNotificationCenter(50);
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
          .eq("requested_role", "restaurateur")
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
        .sort((left, right) => splitAdminTarget(right.to).pathname.length - splitAdminTarget(left.to).pathname.length)[0],
    [pathname, search, sections],
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-end px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:hidden">
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "pointer-events-auto h-16 rounded-[1.45rem] border border-orange-300/55 bg-zinc-950 px-2.5 pr-5 text-white shadow-[0_16px_34px_rgba(255,106,26,0.34),0_8px_24px_rgba(15,23,42,0.32)] ring-1 ring-white/15 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-zinc-900 hover:shadow-[0_20px_42px_rgba(255,106,26,0.42),0_10px_28px_rgba(15,23,42,0.36)] dark:border-orange-300/50 dark:bg-[#181818] dark:shadow-[0_20px_48px_rgba(0,0,0,0.58),0_0_34px_rgba(255,106,26,0.34)]",
              mobileMenuOpen && "border-orange-200 bg-primary text-primary-foreground hover:bg-primary",
            )}
            aria-label="Ouvrir le menu admin"
            data-testid="admin-mobile-menu-trigger"
          >
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-[1rem] bg-gradient-to-br from-[#ff5a14] to-[#ff9f1c] text-white shadow-[0_0_24px_rgba(255,106,26,0.58)] transition-colors",
                mobileMenuOpen && "bg-white/15 text-current shadow-none",
              )}
            >
              <Menu className="h-5 w-5" />
            </span>
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-300",
                  mobileMenuOpen && "text-primary-foreground/75",
                )}
              >
                Admin
              </span>
              <span className="max-w-[10rem] truncate text-sm font-semibold">
                {activeNavItem?.label ?? "Ouvrir le menu"}
              </span>
            </span>
          </Button>
        </SheetTrigger>
        <SheetContent className="flex h-full flex-col overflow-hidden p-0 dark:border-[#5f7aad]/30 dark:bg-[#010716]">
          <SheetHeader className="border-b px-6 pb-4 pr-14 pt-6">
            <SheetTitle>Administration</SheetTitle>
            <SheetDescription>
              Navigation rapide vers les onglets du back-office TOK.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overscroll-y-contain px-6 pb-6 pt-4">
            <div className="mb-4">
              <RoleSpaceSwitcher className="w-full justify-between" align="start" onNavigate={() => setMobileMenuOpen(false)} />
            </div>
            <div className="mb-4">
              <ChefHelpButton surface="admin" onOpen={() => setMobileMenuOpen(false)} />
            </div>
            <nav className="flex flex-col gap-1 pb-4">
              <AdminNavItems
                activeTo={activeNavItem?.to}
                sections={sections}
                unreadNotifications={unreadNotifications}
                role={role}
                pendingSignupApplicationsCount={pendingSignupApplicationsCount}
                openSupportIncidentCount={openSupportIncidentCount}
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
  );
}
