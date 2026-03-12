import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  Camera,
  CircleHelp,
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
  ChevronDown,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCallback, useState } from "react";
import { useDashboardRestaurant } from "@/pages/dashboard/DashboardContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useRealtimeNotifications, type RealtimeNotification } from "@/hooks/useRealtimeNotifications";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Reussite et performances",
    items: [
      { to: "/dashboard", label: "Vue d'ensemble", icon: LayoutDashboard },
      { to: "/dashboard/advisor", label: "Assistant IA", icon: Bot },
      { to: "/dashboard/commandes", label: "Commandes", icon: ShoppingCart },
      { to: "/dashboard/reservations", label: "Reservations", icon: CalendarDays },
      { to: "/dashboard/recommandations", label: "Recommandations", icon: Sparkles },
      { to: "/dashboard/performances", label: "Performances", icon: BarChart3 },
      { to: "/dashboard/comparaison", label: "Comparaison", icon: Scale },
      { to: "/dashboard/avis", label: "Avis clients", icon: MessageSquareText },
    ],
  },
  {
    title: "Marketing",
    items: [
      { to: "/dashboard/campagne-overview", label: "Campagnes", icon: Megaphone },
      { to: "/dashboard/reseaux-sociaux", label: "Reseaux sociaux", icon: Share2 },
      { to: "/dashboard/campagnes", label: "Campagnes avancees", icon: Megaphone },
    ],
  },
  {
    title: "Paiements",
    items: [
      { to: "/dashboard/factures", label: "Factures", icon: ReceiptText },
    ],
  },
  {
    title: "Page du restaurant",
    items: [
      { to: "/dashboard/restaurant", label: "Mon restaurant", icon: UtensilsCrossed },
      { to: "/dashboard/menu", label: "Menu", icon: BookOpen },
      { to: "/dashboard/photos", label: "Photos", icon: Camera },
      { to: "/dashboard/offres", label: "Anti-gaspi", icon: Leaf },
      { to: "/dashboard/ventes-flash", label: "Ventes flash", icon: Zap },
      { to: "/dashboard/formules", label: "Formules", icon: Percent },
      { to: "/dashboard/service", label: "Pilotage de service", icon: SlidersHorizontal },
    ],
  },
  {
    title: "Support",
    items: [{ to: "/dashboard/support", label: "Aide et support", icon: CircleHelp }],
  },
];

const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

function RestaurantSelector() {
  const { restaurants, selectedId, setSelectedId } = useDashboardRestaurant();
  const [open, setOpen] = useState(false);

  if (restaurants.length <= 1) {
    const name = restaurants[0]?.name || "Mon restaurant";
    return (
      <div className="px-3 py-2 mb-2 flex items-center gap-2 text-sm font-semibold text-sidebar-foreground">
        <Store className="h-4 w-4 text-primary" />
        <span className="truncate">{name}</span>
      </div>
    );
  }

  const selected = restaurants.find((restaurant) => restaurant.id === selectedId);

  return (
    <div className="px-2 mb-2 relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-sidebar-accent/50 hover:bg-sidebar-accent transition-colors text-sm font-semibold"
      >
        <Store className="h-4 w-4 text-primary shrink-0" />
        <span className="truncate flex-1 text-left">{selected?.name || "Choisir..."}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute z-50 left-2 right-2 mt-1 rounded-xl border bg-card shadow-lg py-1 max-h-60 overflow-y-auto">
          {restaurants.map((restaurant) => (
            <button
              key={restaurant.id}
              onClick={() => {
                setSelectedId(restaurant.id);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-sidebar-accent/50 transition-colors",
                restaurant.id === selectedId && "bg-primary/10 text-primary font-semibold"
              )}
            >
              {restaurant.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavItems({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="space-y-1">
          <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
          {section.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname === item.to ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { selectedId } = useDashboardRestaurant();

  const handleRealtimeNotification = useCallback((notification: RealtimeNotification) => {
    const data = notification.data && typeof notification.data === "object" && !Array.isArray(notification.data)
      ? notification.data
      : {};

    const restaurantId = typeof data.restaurant_id === "string" ? data.restaurant_id : null;
    if (restaurantId && selectedId && restaurantId !== selectedId) {
      return;
    }

    const itemsSummary = typeof data.items_summary === "string" ? data.items_summary : "";
    const deliveryAddress = typeof data.delivery_address === "string" ? data.delivery_address : "";
    const scheduledLabel = typeof data.scheduled_delivery_label === "string" ? data.scheduled_delivery_label : "";
    const detailParts = [itemsSummary, deliveryAddress, scheduledLabel].filter(Boolean);

    toast(notification.title, {
      description: detailParts.join(" • ") || notification.body,
      action: typeof data.url === "string"
        ? {
            label: "Voir",
            onClick: () => {
              window.location.href = data.url as string;
            },
          }
        : undefined,
    });

    queryClient.invalidateQueries({ queryKey: ["dashboard-all-orders", selectedId] });
  }, [queryClient, selectedId]);

  useRealtimeNotifications({
    enabled: Boolean(selectedId),
    onInsert: handleRealtimeNotification,
  });

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="md:hidden flex items-center gap-3 border-b px-4 py-3 bg-sidebar">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-4 overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="font-display text-lg font-semibold px-3 py-2">Dashboard</SheetTitle>
            </SheetHeader>
            <RestaurantSelector />
            <nav className="flex flex-col gap-1 mt-2">
              <NavItems pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
        <h2 className="font-display text-base font-semibold">{NAV_ITEMS.find((item) => item.to === pathname)?.label ?? "Dashboard"}</h2>
      </div>
      <aside className="hidden md:flex w-72 border-r bg-sidebar flex-col p-4 overflow-y-auto">
        <h2 className="font-display text-lg font-semibold px-3 py-2 mb-1">Dashboard</h2>
        <RestaurantSelector />
        <nav className="flex flex-col gap-1">
          <NavItems pathname={pathname} />
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
