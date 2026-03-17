import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import {
  User, LogOut, Search, ShoppingBag, Leaf, ShoppingCart, Menu, Bell,
  Shield, TrendingUp, Users, Route, Layers, ChefHat, Timer,
  ShieldCheck, Calculator, Repeat, Sparkles, MessageCircle, Gift,
  Moon, Sun,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LOGO_URL } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { useEffect, useState } from "react";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FEATURES = [
  { icon: Shield, label: "Créneaux garantis", desc: "Livraison ponctuelle ou remboursé", to: "/creneaux-garantis", color: "text-blue-500", bg: "bg-blue-500/10", hoverBg: "group-hover:bg-blue-500/20" },
  { icon: Gift, label: "Offres", desc: "Fenêtre flexible, prix réduit", to: "/flex-prix-bas", color: "text-emerald-500", bg: "bg-emerald-500/10", hoverBg: "group-hover:bg-emerald-500/20" },
  { icon: Users, label: "Match groupes", desc: "Commandez ensemble, payez moins", to: "/match-groupes", color: "text-violet-500", bg: "bg-violet-500/10", hoverBg: "group-hover:bg-violet-500/20" },
  { icon: Route, label: "Multi-stop", desc: "Un trajet, plusieurs adresses", to: "/multi-stop", color: "text-orange-500", bg: "bg-orange-500/10", hoverBg: "group-hover:bg-orange-500/20" },
  { icon: Layers, label: "Multi-restos", desc: "Plats de différents restos", to: "/multi-restaurant", color: "text-pink-500", bg: "bg-pink-500/10", hoverBg: "group-hover:bg-pink-500/20" },
  { icon: ChefHat, label: "Chef's Table", desc: "Plats off-menu exclusifs", to: "/chefs-table", color: "text-amber-500", bg: "bg-amber-500/10", hoverBg: "group-hover:bg-amber-500/20" },
  { icon: Timer, label: "Zéro attente", desc: "Précommande synchronisée", to: "/zero-attente", color: "text-indigo-500", bg: "bg-indigo-500/10", hoverBg: "group-hover:bg-indigo-500/20" },
  { icon: ShieldCheck, label: "Garantie qualité", desc: "Chaud garanti ou remboursé", to: "/garantie-qualite", color: "text-teal-500", bg: "bg-teal-500/10", hoverBg: "group-hover:bg-teal-500/20" },
  { icon: Calculator, label: "Budget auto", desc: "Menus optimisés par objectifs", to: "/budget-auto", color: "text-cyan-500", bg: "bg-cyan-500/10", hoverBg: "group-hover:bg-cyan-500/20" },
  { icon: Repeat, label: "Abonnement", desc: "Repas récurrents planifiés", to: "/abonnement", color: "text-purple-500", bg: "bg-purple-500/10", hoverBg: "group-hover:bg-purple-500/20" },
];

export default function Navbar() {
  const { user, role, roles, switchRole, signOut } = useAuth();
  const { itemCount } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const activeFeatures = useActiveFeatures();
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["navbar-notifications", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: notificationPrefs } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_preferences" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const inAppEnabled = (notificationPrefs as any)?.channels?.in_app ?? true;
  const allowedCategories = (notificationPrefs as any)?.categories ?? {
    transactional: true,
    product: true,
    marketing: false,
    system: true,
  };
  const visibleNotifications = (notifications || []).filter((n: any) =>
    allowedCategories?.[n.category] !== false
  );
  const unreadCount = inAppEnabled ? visibleNotifications.filter((n: any) => !n.read_at).length : 0;

  const markAllReadFromBell = async () => {
    if (!user || !inAppEnabled || unreadCount === 0) return;

    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications" as any)
      .update({ read_at: readAt })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) return;

    queryClient.setQueryData(["navbar-notifications", user.id], (current: any[] | undefined) =>
      (current || []).map((notification) => ({
        ...notification,
        read_at: notification.read_at ?? readAt,
      }))
    );
    queryClient.setQueryData(["notifications", user.id], (current: any[] | undefined) =>
      (current || []).map((notification) => ({
        ...notification,
        read_at: notification.read_at ?? readAt,
      }))
    );
    queryClient.invalidateQueries({ queryKey: ["navbar-notifications", user.id] });
    queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  const handleNotificationsOpenChange = (open: boolean) => {
    setNotificationsOpen(open);
    if (open) void markAllReadFromBell();
  };

  const isRecentNotification = (createdAt?: string) => {
    if (!createdAt) return false;
    const createdAtMs = new Date(createdAt).getTime();
    if (Number.isNaN(createdAtMs)) return false;
    return Date.now() - createdAtMs <= 1000 * 60 * 60 * 24;
  };

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`navbar-notifications:${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["navbar-notifications", user.id] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const visibleFeatures = FEATURES.filter((f) => {
    const featureId = f.to.replace("/", "");
    return activeFeatures.has(featureId);
  });

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 shadow-sm dark:border-white/10 dark:bg-slate-950/78 dark:shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-top">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={LOGO_URL} alt="Deliveroom" className="h-10 w-auto object-contain" />
        </Link>

        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
                Restaurants
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link to="/anti-gaspi" className="text-sm font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1 px-3 py-2">
                <Leaf className="h-4 w-4" />
                Anti-gaspi
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link to="/ventes-flash" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
                Ventes flash
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger className="text-sm font-medium bg-transparent">
                <Sparkles className="h-4 w-4 mr-1 text-primary" />
                Exclusivités
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="w-[min(680px,calc(100vw-3rem))] p-4 md:p-6">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h3 className="font-display text-lg font-semibold">Fonctionnalités exclusives</h3>
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-none">10 innovations</Badge>
                  </div>
                  {FEATURES.length > 0 && visibleFeatures.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1">
                      {visibleFeatures.map((f) => (
                        <Link
                          key={f.to}
                          to={f.to}
                          className="group flex items-center gap-3 rounded-xl p-3 transition-all duration-200 hover:bg-accent/50"
                        >
                          <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${f.bg} ${f.hoverBg} flex items-center justify-center transition-colors duration-200`}>
                            <f.icon className={`h-5 w-5 ${f.color}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight group-hover:text-foreground transition-colors">{f.label}</p>
                            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{f.desc}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucune fonctionnalité active pour le moment.</p>
                  )}
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              document.documentElement.classList.toggle("dark");
              localStorage.setItem("theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Mode sombre</span>
          </Button>

          <Button variant="ghost" size="icon" asChild>
            <Link to="/recherche">
              <Search className="h-5 w-5" />
            </Link>
          </Button>

          <Button variant="ghost" size="icon" asChild className="relative">
            <Link to="/panier">
              <ShoppingCart className="h-5 w-5" />
              {itemCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                  {itemCount}
                </Badge>
              )}
            </Link>
          </Button>

          {user && (
            <DropdownMenu open={notificationsOpen} onOpenChange={handleNotificationsOpenChange}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && !notificationsOpen && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                      {unreadCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(320px,calc(100vw-2rem))]">
                <div className="px-3 py-2 border-b">
                  <p className="text-sm font-semibold">Notifications</p>
                  <p className="text-[11px] text-muted-foreground">Dernières alertes</p>
                </div>
                <div className="max-h-72 overflow-auto">
                  {!inAppEnabled ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">
                      Activez le canal In-app pour voir vos alertes.
                    </div>
                  ) : visibleNotifications && visibleNotifications.length > 0 ? (
                    visibleNotifications.map((n: any) => {
                      const isRecent = isRecentNotification(n.created_at);
                      return (
                        <DropdownMenuItem
                          key={n.id}
                          asChild
                          className={`cursor-pointer items-start rounded-none border-l-2 p-0 ${
                            isRecent ? "border-l-primary bg-primary/5" : "border-l-transparent"
                          }`}
                        >
                          <Link to={n.data?.url || "/notifications"} className="flex w-full flex-col gap-1 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{n.title}</span>
                              {isRecent && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Recente</span>}
                              {!n.read_at && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Nouveau</span>}
                            </div>
                            <span className="text-[11px] text-muted-foreground">{n.body}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })
                  ) : (
                    <div className="px-3 py-3 text-xs text-muted-foreground">Aucune notification.</div>
                  )}
                </div>
                <DropdownMenuItem asChild>
                  <Link to="/notifications">Voir toutes les notifications</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {roles.length > 1 && (
                  <div className="px-2 py-2 border-b mb-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Espace actif</p>
                    <div className="flex gap-1 flex-wrap">
                      {roles.map((r) => (
                        <button
                          key={r}
                          onClick={() => switchRole(r)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                            role === r
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {{ client: "Client", restaurateur: "Restaurateur", admin: "Admin", courier: "Livreur" }[r]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <DropdownMenuItem asChild>
                  <Link to="/profil">Mon profil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/commandes">Mes commandes</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/reservations">Mes réservations</Link>
                </DropdownMenuItem>
                {(role === "restaurateur" || role === "admin" || roles.includes("restaurateur")) && (
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" className="font-bold text-primary">Dashboard Restaurant</Link>
                  </DropdownMenuItem>
                )}
                {(role === "admin" || roles.includes("admin")) && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="font-bold text-primary">Administration</Link>
                  </DropdownMenuItem>
                )}
                {(role === "courier" || roles.includes("courier")) && (
                  <DropdownMenuItem asChild>
                    <Link to="/courier" className="font-bold text-primary">Espace Livreur</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={signOut} className="text-destructive font-medium border-t mt-2 pt-2">
                  <LogOut className="h-4 w-4 mr-2" />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="hidden lg:flex text-muted-foreground hover:text-primary">
                <Link to="/auth?type=restaurateur">Vous êtes restaurateur ?</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth">Connexion</Link>
              </Button>
            </div>
          )}

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(320px,85vw)] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-3 mt-6">
                <Link to="/" className="text-sm font-medium hover:text-primary">Restaurants</Link>
                <Link to="/anti-gaspi" className="text-sm font-medium text-accent">Anti-gaspi</Link>
                <Link to="/ventes-flash" className="text-sm font-medium hover:text-primary">Ventes Flash</Link>
                <Link to="/recherche" className="text-sm font-medium hover:text-primary">Recherche</Link>

                <div className="border-t pt-4 mt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Exclusivités</span>
                  </div>
                  {visibleFeatures.length > 0 ? (
                    <div className="grid grid-cols-1 gap-1">
                      {visibleFeatures.map((f) => (
                        <Link
                          key={f.to}
                          to={f.to}
                          className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-accent/50"
                        >
                          <div className={`flex-shrink-0 w-8 h-8 rounded-md ${f.bg} flex items-center justify-center`}>
                            <f.icon className={`h-4 w-4 ${f.color}`} />
                          </div>
                          <div>
                            <p className="text-sm font-medium leading-tight">{f.label}</p>
                            <p className="text-[11px] text-muted-foreground leading-tight">{f.desc}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">Aucune fonctionnalité active.</p>
                  )}
                </div>

                {user && (
                  <div className="border-t pt-4 mt-2 space-y-4">
                    {roles.length > 1 && (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Espace actif</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {roles.map((r) => (
                            <button
                              key={r}
                              onClick={() => { switchRole(r); setMenuOpen(false); }}
                              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                                role === r
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                            >
                              {{ client: "Client", restaurateur: "Restaurateur", admin: "Admin", courier: "Livreur" }[r]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <Link to="/profil" className="text-sm font-medium hover:text-primary flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Mon profil
                    </Link>
                    <Link to="/commandes" className="text-sm font-medium hover:text-primary flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4" />
                      Mes commandes
                    </Link>
                    {(roles.includes("restaurateur") || roles.includes("admin")) && (
                      <Link to="/dashboard" className="text-sm font-bold text-primary flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Dashboard Restaurant
                      </Link>
                    )}
                    {roles.includes("admin") && (
                      <Link to="/admin" className="text-sm font-bold text-primary flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Administration
                      </Link>
                    )}
                  </div>
                )}
                <div className="border-t pt-4 mt-2 space-y-4">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      (window as any).openChat?.();
                    }}
                    className="text-sm font-medium text-orange-500 hover:text-orange-600 flex items-center gap-2 text-left"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Assistance
                  </button>
                  <Link to="/a-propos" className="text-sm font-medium text-muted-foreground hover:text-foreground">À propos</Link>
                  <Link to="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground">Contact</Link>
                  <Link to="/cgu" className="text-sm font-medium text-muted-foreground hover:text-foreground">CGU</Link>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
