import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  BarChart3,
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
  ReceiptText,
  Scale,
  Share2,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
  Zap,
  Leaf,
  Percent,
  SlidersHorizontal,
  Map,
  ChevronDown,
  Store,
  Package,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardRestaurant } from "@/pages/dashboard/DashboardContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useActiveFeatures } from "@/lib/featureFlags";
import { useRealtimeNotifications, type RealtimeNotification } from "@/hooks/useRealtimeNotifications";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: string;
  roles?: string[];
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Reussite et performances",
    items: [
      { to: "/dashboard", label: "Vue d'ensemble", icon: LayoutDashboard, feature: "dashboard-overview" },
      { to: "/dashboard/advisor", label: "Assistant IA", icon: Bot, feature: "dashboard-advisor" },
      { to: "/dashboard/commandes", label: "Commandes", icon: ShoppingCart, feature: "dashboard-commandes" },
      { to: "/dashboard/reservations", label: "Reservations", icon: CalendarDays, feature: "dashboard-reservations" },
      { to: "/dashboard/recommandations", label: "Recommandations", icon: Sparkles, feature: "dashboard-recommandations" },
      { to: "/dashboard/performances", label: "Performances", icon: BarChart3, feature: "dashboard-performances" },
      { to: "/dashboard/comparaison", label: "Comparaison", icon: Scale, feature: "dashboard-comparaison" },
      { to: "/dashboard/avis", label: "Avis clients", icon: MessageSquareText, feature: "dashboard-avis" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { to: "/dashboard/campagne-overview", label: "Campagnes", icon: Megaphone, feature: "dashboard-campagne-overview" },
      { to: "/dashboard/reseaux-sociaux", label: "Reseaux sociaux", icon: Share2, feature: "dashboard-reseaux-sociaux" },
      { to: "/dashboard/campagnes", label: "Campagnes avancees", icon: Megaphone, feature: "dashboard-campagnes" },
    ],
  },
  {
    title: "Paiements",
    items: [
      { to: "/dashboard/factures", label: "Factures", icon: ReceiptText, feature: "dashboard-factures" },
    ],
  },
  {
    title: "Mon offre",
    items: [
      { to: "/dashboard/pack", label: "Pack de lancement", icon: Package, feature: "dashboard-pack" },
    ],
  },
  {
    title: "Page du restaurant",
    items: [
      { to: "/dashboard/restaurant", label: "Mon restaurant", icon: UtensilsCrossed, feature: "dashboard-restaurant" },
      { to: "/dashboard/menu", label: "Menu", icon: BookOpen, feature: "dashboard-menu" },
      { to: "/dashboard/photos", label: "Photos", icon: Camera, feature: "dashboard-photos" },
      { to: "/dashboard/offres", label: "Anti-gaspi", icon: Leaf, feature: "dashboard-offres" },
      { to: "/dashboard/ventes-flash", label: "Ventes flash", icon: Zap, feature: "dashboard-ventes-flash" },
      { to: "/dashboard/formules", label: "Formules", icon: Percent, feature: "dashboard-formules" },
      { to: "/dashboard/service", label: "Pilotage de service", icon: SlidersHorizontal, feature: "dashboard-service" },
      { to: "/dashboard/plan-salle", label: "Plan de salle", icon: Map, feature: "dashboard-plan-salle" },
    ],
  },
  {
    title: "Support",
    items: [
      { to: "/dashboard/support", label: "Aide et support", icon: CircleHelp, feature: "dashboard-support" },
    ],
  },
];

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
    <div ref={ref} className="relative mb-2">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center rounded-xl border bg-sidebar-accent/50 text-sm font-semibold",
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
        <div className="absolute z-50 mt-1 w-full rounded-xl border bg-white shadow-lg">
          {restaurants.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setSelectedId(r.id);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left hover:bg-muted"
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
}: {
  pathname: string;
  sections: NavSection[];
  collapsed?: boolean;
  disabledFeatures?: Set<string>;
}) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.title}>
          {!collapsed && <p className="px-3 text-xs text-muted-foreground">{section.title}</p>}
          {section.items.map((item) => {
            const isLocked = !!(item.feature && disabledFeatures?.has(item.feature));

            if (isLocked) {
              return (
                <div
                  key={item.to}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg opacity-40 cursor-not-allowed select-none"
                  title="Non inclus dans votre pack"
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
                  "flex items-center gap-3 px-3 py-2 rounded-lg",
                  pathname.startsWith(item.to)
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                )}
              >
                <item.icon className="h-4 w-4" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { selectedId, disabledFeatures } = useDashboardRestaurant();
  const activeFeatures = useActiveFeatures();

  const sidebarRef = useRef<HTMLDivElement>(null);

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

  // ✅ memo nav
  const sections = useMemo(() => {
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(
        (i) => !i.feature || activeFeatures.has(i.feature)
      ),
    }));
  }, [activeFeatures]);

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
    [selectedId]
  );

  useRealtimeNotifications({
    enabled: !!selectedId,
    onInsert: handleNotification,
  });

  return (
    <div className="flex min-h-screen">
      {/* SIDEBAR */}
      <aside
        ref={sidebarRef}
        className={cn(
          "hidden md:flex flex-col border-r bg-sidebar transition-all",
          collapsed ? "w-[80px]" : "w-72"
        )}
      >
        <div className="flex items-center justify-between p-3">
          {!collapsed && <h2 className="font-semibold">Dashboard</h2>}
          <Button size="icon" variant="ghost" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>

        <RestaurantSelector collapsed={collapsed} />

        <nav className="flex flex-col gap-1">
          <NavItems pathname={pathname} sections={sections} collapsed={collapsed} disabledFeatures={disabledFeatures} />
        </nav>
      </aside>

      {/* MOBILE */}
      <div className="md:hidden p-3 border-b flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Dashboard</SheetTitle>
            </SheetHeader>
            <RestaurantSelector />
            <NavItems pathname={pathname} sections={sections} disabledFeatures={disabledFeatures} />
          </SheetContent>
        </Sheet>
      </div>

      {/* MAIN */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}