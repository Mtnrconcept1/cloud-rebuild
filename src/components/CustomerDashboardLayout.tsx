import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { User, ShoppingCart, CalendarDays, Bell, Crown, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BackNavigationButton } from "@/components/navigation/BackNavigationButton";
import RoleSpaceMenuSection from "@/components/navigation/RoleSpaceMenuSection";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import SignOutButton from "@/components/auth/SignOutButton";
import { useActiveFeatures } from "@/lib/featureFlags";

type CustomerNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  feature?: string;
};

const NAV_ITEMS: CustomerNavItem[] = [
  { to: "/profil", label: "Mon profil", icon: User },
  { to: "/commandes", label: "Mes commandes", icon: ShoppingCart, feature: "commandes" },
  { to: "/reservations", label: "Mes réservations", icon: CalendarDays, feature: "reservation" },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/tok-one", label: "Tok One", icon: Crown, feature: "tok-one" },
];

export default function CustomerDashboardLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { role } = useAuth();
  const activeFeatures = useActiveFeatures();
  const { unreadNotifications } = useNotificationCenter(50);
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.feature || activeFeatures.has(item.feature));

  return (
    <div className="min-h-screen bg-muted/30 pt-16">
      <div className="container px-3 sm:px-4 py-6 sm:py-8 flex flex-col md:flex-row gap-6 md:gap-8">
        <aside className="w-full md:w-64 shrink-0">
          <div className="bg-card border rounded-2xl p-4 flex flex-col gap-2 sticky top-24">
            <h2 className="font-display font-semibold px-3 py-2 mb-2 text-lg">Mon Espace</h2>
            <RoleSpaceMenuSection className="mb-2" />
            {visibleNavItems.map((item) => (
              <Link key={item.to} to={item.to} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors", pathname === item.to ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted")}>
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
                <NotificationMenuBadge route={item.to} role={role} unreadNotifications={unreadNotifications} />
              </Link>
            ))}
            <div className="mt-4 pt-4 border-t">
              <SignOutButton className="w-full justify-start rounded-xl px-3 py-2.5 text-sm font-medium" />
            </div>
          </div>
        </aside>
        <main className="flex-1 bg-card border rounded-2xl p-4 sm:p-6 md:p-8 min-h-[500px] overflow-x-hidden">
          <BackNavigationButton fallback="/" className="mb-4" />
          {children}
        </main>
      </div>
    </div>
  );
}
