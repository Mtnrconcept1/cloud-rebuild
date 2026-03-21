import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Camera,
  ChevronDown,
  CircleHelp,
  Menu,
  SlidersHorizontal,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useDashboardRestaurant } from "@/pages/dashboard/DashboardContext";
import { useRealtimeNotifications, type RealtimeNotification } from "@/hooks/useRealtimeNotifications";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard/reservations", label: "Reservations", icon: CalendarDays },
  { to: "/dashboard/restaurant", label: "Mon restaurant", icon: UtensilsCrossed },
  { to: "/dashboard/photos", label: "Photos", icon: Camera },
  { to: "/dashboard/service", label: "Pilotage de service", icon: SlidersHorizontal },
  { to: "/dashboard/support", label: "Aide et support", icon: CircleHelp },
];

function RestaurantSelector() {
  const { restaurants, selectedId, setSelectedId } = useDashboardRestaurant();
  const [open, setOpen] = useState(false);

  if (restaurants.length <= 1) {
    const name = restaurants[0]?.name || "Mon restaurant";
    return (
      <div className="mb-2 flex items-center gap-2 px-3 py-2 text-sm font-semibold text-sidebar-foreground">
        <Store className="h-4 w-4 text-primary" />
        <span className="truncate">{name}</span>
      </div>
    );
  }

  const selected = restaurants.find((restaurant) => restaurant.id === selectedId);

  return (
    <div className="relative mb-2 px-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-xl border bg-sidebar-accent/50 px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-sidebar-accent"
      >
        <Store className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 truncate text-left">{selected?.name || "Choisir..."}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute left-2 right-2 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border bg-card py-1 shadow-lg">
          {restaurants.map((restaurant) => (
            <button
              key={restaurant.id}
              onClick={() => {
                setSelectedId(restaurant.id);
                setOpen(false);
              }}
              className={cn(
                "w-full px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent/50",
                restaurant.id === selectedId && "bg-primary/10 font-semibold text-primary",
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
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname === item.to
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50",
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
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

    toast(notification.title, {
      description: notification.body,
      action: typeof data.url === "string"
        ? {
            label: "Voir",
            onClick: () => {
              window.location.href = data.url as string;
            },
          }
        : undefined,
    });

    queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", selectedId] });
  }, [queryClient, selectedId]);

  useRealtimeNotifications({
    enabled: Boolean(selectedId),
    onInsert: handleRealtimeNotification,
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="flex items-center gap-3 border-b bg-sidebar px-4 py-3 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto p-4">
            <SheetHeader>
              <SheetTitle className="px-3 py-2 font-display text-lg font-semibold">Dashboard</SheetTitle>
            </SheetHeader>
            <RestaurantSelector />
            <nav className="mt-2 flex flex-col gap-1">
              <NavItems pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
        <h2 className="font-display text-base font-semibold">
          {NAV_ITEMS.find((item) => item.to === pathname)?.label ?? "Dashboard"}
        </h2>
      </div>

      <aside className="hidden w-72 flex-col overflow-y-auto border-r bg-sidebar p-4 md:flex">
        <h2 className="mb-1 px-3 py-2 font-display text-lg font-semibold">Dashboard</h2>
        <RestaurantSelector />
        <nav className="flex flex-col gap-1">
          <NavItems pathname={pathname} />
        </nav>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
