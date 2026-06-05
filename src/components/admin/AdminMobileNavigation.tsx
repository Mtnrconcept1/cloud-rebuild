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
  Menu,
  MessageSquareText,
  Newspaper,
  Rocket,
  Settings2,
  Shield,
  ShieldAlert,
  Store,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import ChefHelpButton from "@/components/help/ChefHelpButton";
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
      { to: "/admin/sinistres", label: "Sinistres chat", icon: ShieldAlert, feature: "admin-operations-center" },
      { to: "/admin/restaurants", label: "Restaurants", icon: Store, feature: "admin-restaurants" },
      { to: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, feature: "admin-utilisateurs" },
      { to: "/admin/utilisateurs?tab=applications", label: "Dossiers d'inscription", icon: FileText, feature: "admin-utilisateurs" },
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
    ],
  },
  {
    title: "Gouvernance",
    items: [
      { to: "/admin/audit", label: "Audit et securite", icon: Shield, feature: "admin-audit" },
      { to: "/admin/platform", label: "Configuration plateforme", icon: Settings2, feature: "admin-platform-config" },
      { to: "/admin/ai-operations", label: "Operations IA", icon: Brain, feature: "ai_admin_monitoring" },
      { to: "/admin/packs", label: "Packs de lancement", icon: Rocket, feature: "admin-packs" },
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

function AdminNavItems({
  activeTo,
  sections,
  unreadNotifications,
  role,
}: {
  activeTo?: string;
  sections: AdminNavSection[];
  unreadNotifications: ReturnType<typeof useNotificationCenter>["unreadNotifications"];
  role: ReturnType<typeof useAuth>["role"];
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
              "pointer-events-auto h-14 rounded-full border border-border/70 bg-background/95 px-2 pr-4 text-foreground shadow-[0_14px_32px_rgba(15,23,42,0.14)] backdrop-blur-md transition-all hover:bg-background dark:border-[#5f7aad]/35 dark:bg-[#07142b]/95 dark:text-white dark:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_30px_rgba(255,106,26,0.18)]",
              mobileMenuOpen && "border-primary/25 bg-primary text-primary-foreground hover:bg-primary",
            )}
            aria-label="Ouvrir le menu admin"
            data-testid="admin-mobile-menu-trigger"
          >
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors dark:bg-gradient-to-br dark:from-[#ff6a1a] dark:to-[#ff9f1c] dark:shadow-[0_0_24px_rgba(255,106,26,0.46)]",
                mobileMenuOpen && "bg-white/15 text-current shadow-none",
              )}
            >
              <Menu className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
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
              <ChefHelpButton surface="admin" onOpen={() => setMobileMenuOpen(false)} />
            </div>
            <nav className="flex flex-col gap-1 pb-4">
              <AdminNavItems
                activeTo={activeNavItem?.to}
                sections={sections}
                unreadNotifications={unreadNotifications}
                role={role}
              />
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
