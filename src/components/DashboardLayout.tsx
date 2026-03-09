import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BadgePercent, BarChart3, BookOpen, Bot, CalendarDays, Camera, CircleHelp, LayoutDashboard, Menu, MessageSquareText, Megaphone, ReceiptText, Scale, Share2, ShoppingCart, Sparkles, UtensilsCrossed, Zap, Leaf, Percent, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useState } from "react";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; };
type NavSection = { title: string; items: NavItem[]; };

const NAV_SECTIONS: NavSection[] = [
  { title: "Réussite et performances", items: [
    { to: "/dashboard", label: "Vue d'ensemble", icon: LayoutDashboard },
    { to: "/dashboard/commandes", label: "Commandes", icon: ShoppingCart },
    { to: "/dashboard/reservations", label: "Réservations", icon: CalendarDays },
    { to: "/dashboard/recommandations", label: "Recommandations", icon: Sparkles },
    { to: "/dashboard/performances", label: "Performances", icon: BarChart3 },
    { to: "/dashboard/comparaison", label: "Comparaison", icon: Scale },
    { to: "/dashboard/avis", label: "Avis clients", icon: MessageSquareText },
  ]},
  { title: "Marketing", items: [
    { to: "/dashboard/campagne-overview", label: "Campagnes", icon: Megaphone },
    { to: "/dashboard/promotions", label: "Promotions", icon: BadgePercent },
    { to: "/dashboard/reseaux-sociaux", label: "Réseaux sociaux", icon: Share2 },
    { to: "/dashboard/campagnes", label: "Campagnes avancées", icon: Megaphone },
  ]},
  { title: "Paiements", items: [
    { to: "/dashboard/compta", label: "Comptabilité", icon: BarChart3 },
    { to: "/dashboard/factures", label: "Factures", icon: ReceiptText },
  ]},
  { title: "Page du restaurant", items: [
    { to: "/dashboard/restaurant", label: "Mon restaurant", icon: UtensilsCrossed },
    { to: "/dashboard/menu", label: "Menu", icon: BookOpen },
    { to: "/dashboard/photos", label: "Photos", icon: Camera },
    { to: "/dashboard/offres", label: "Anti-gaspi", icon: Leaf },
    { to: "/dashboard/ventes-flash", label: "Ventes flash", icon: Zap },
    { to: "/dashboard/formules", label: "Formules", icon: Percent },
    { to: "/dashboard/service", label: "Pilotage de service", icon: SlidersHorizontal },
  ]},
  { title: "Support", items: [{ to: "/dashboard/support", label: "Aide et support", icon: CircleHelp }] },
];

const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

function NavItems({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <>
    {NAV_SECTIONS.map((section) => (
      <div key={section.title} className="space-y-1">
        <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
        {section.items.map((item) => (
          <Link key={item.to} to={item.to} onClick={onNavigate} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors", pathname === item.to ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50")}>
            <item.icon className="h-4 w-4" />{item.label}
          </Link>
        ))}
      </div>
    ))}
  </>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="md:hidden flex items-center gap-3 border-b px-4 py-3 bg-sidebar">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button></SheetTrigger>
          <SheetContent side="left" className="w-72 p-4 overflow-y-auto">
            <SheetHeader><SheetTitle className="font-display text-lg font-semibold px-3 py-2">Dashboard</SheetTitle></SheetHeader>
            <nav className="flex flex-col gap-1 mt-2"><NavItems pathname={pathname} onNavigate={() => setOpen(false)} /></nav>
          </SheetContent>
        </Sheet>
        <h2 className="font-display text-base font-semibold">{NAV_ITEMS.find((item) => item.to === pathname)?.label ?? "Dashboard"}</h2>
      </div>
      <aside className="hidden md:flex w-72 border-r bg-sidebar flex-col p-4 overflow-y-auto">
        <h2 className="font-display text-lg font-semibold px-3 py-2 mb-1">Dashboard</h2>
        <nav className="flex flex-col gap-1"><NavItems pathname={pathname} /></nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
