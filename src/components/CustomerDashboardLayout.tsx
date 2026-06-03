import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { User, ShoppingCart, CalendarDays, LogOut, LayoutDashboard, Settings, Bell, Crown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { to: "/profil", label: "Mon profil", icon: User },
  { to: "/commandes", label: "Mes commandes", icon: ShoppingCart },
  { to: "/reservations", label: "Mes réservations", icon: CalendarDays },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/tok-one", label: "Tok One", icon: Crown },
];

export default function CustomerDashboardLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { signOut, roles } = useAuth();

  return (
    <div className="min-h-screen bg-muted/30 pt-16">
      <div className="container px-3 sm:px-4 py-6 sm:py-8 flex flex-col md:flex-row gap-6 md:gap-8">
        <aside className="w-full md:w-64 shrink-0">
          <div className="bg-card border rounded-2xl p-4 flex flex-col gap-2 sticky top-24">
            <h2 className="font-display font-semibold px-3 py-2 mb-2 text-lg">Mon Espace</h2>
            {NAV_ITEMS.map((item) => (
              <Link key={item.to} to={item.to} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors", pathname === item.to ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted")}>
                <item.icon className="h-4 w-4" />{item.label}
              </Link>
            ))}
            {roles.includes("restaurateur") && (
              <div className="mt-2 pt-2 border-t">
                <Link to="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-primary hover:bg-primary/10 transition-colors"><LayoutDashboard className="h-4 w-4" />Espace Restaurateur</Link>
              </div>
            )}
            {roles.includes("admin") && (
              <div className="mt-2 pt-2 border-t">
                <Link to="/admin" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-primary hover:bg-primary/10 transition-colors"><Settings className="h-4 w-4" />Administration</Link>
              </div>
            )}
            <div className="mt-4 pt-4 border-t">
              <button onClick={() => signOut()} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"><LogOut className="h-4 w-4" />Déconnexion</button>
            </div>
          </div>
        </aside>
        <main className="flex-1 bg-card border rounded-2xl p-4 sm:p-6 md:p-8 min-h-[500px] overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
