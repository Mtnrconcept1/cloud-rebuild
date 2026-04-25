import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Calculator,
  ChefHat,
  Crown,
  Gift,
  Layers,
  Leaf,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Repeat,
  Route,
  Search,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Sun,
  Timer,
  TrendingUp,
  User,
  Users,
} from "lucide-react";

import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { LOGO_URL } from "@/lib/constants";
import { useActiveFeatures } from "@/lib/featureFlags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const supabase = getSupabase();

const FEATURES = [
  { icon: Shield, label: "Creneaux garantis", desc: "Livraison ponctuelle ou remboursee", to: "/creneaux-garantis", feature: "creneaux-garantis", color: "text-blue-500", bg: "bg-blue-500/10", hoverBg: "group-hover:bg-blue-500/20" },
  { icon: Gift, label: "Offres", desc: "Fenetre flexible, prix reduit", to: "/flex-prix-bas", feature: "flex-prix-bas", color: "text-emerald-500", bg: "bg-emerald-500/10", hoverBg: "group-hover:bg-emerald-500/20" },
  { icon: Users, label: "Match groupes", desc: "Commandez ensemble, payez moins", to: "/match-groupes", feature: "match-groupes", color: "text-violet-500", bg: "bg-violet-500/10", hoverBg: "group-hover:bg-violet-500/20" },
  { icon: Route, label: "Multi-stop", desc: "Un trajet, plusieurs adresses", to: "/multi-stop", feature: "multi-stop", color: "text-orange-500", bg: "bg-orange-500/10", hoverBg: "group-hover:bg-orange-500/20" },
  { icon: Layers, label: "Multi-restos", desc: "Plats de differents restos", to: "/multi-restaurant", feature: "multi-restaurant", color: "text-pink-500", bg: "bg-pink-500/10", hoverBg: "group-hover:bg-pink-500/20" },
  { icon: ChefHat, label: "La Table du Chef", desc: "Plats off-menu exclusifs", to: "/chefs-table", feature: "chefs-table", color: "text-amber-500", bg: "bg-amber-500/10", hoverBg: "group-hover:bg-amber-500/20" },
  { icon: Timer, label: "Zero attente", desc: "Precommande synchronisee", to: "/zero-attente", feature: "zero-attente", color: "text-indigo-500", bg: "bg-indigo-500/10", hoverBg: "group-hover:bg-indigo-500/20" },
  { icon: ShieldCheck, label: "Garantie qualite", desc: "Chaud garanti ou rembourse", to: "/garantie-qualite", feature: "garantie-qualite", color: "text-teal-500", bg: "bg-teal-500/10", hoverBg: "group-hover:bg-teal-500/20" },
  { icon: Calculator, label: "Budget auto", desc: "Menus optimises par objectifs", to: "/budget-auto", feature: "budget-auto", color: "text-cyan-500", bg: "bg-cyan-500/10", hoverBg: "group-hover:bg-cyan-500/20" },
  { icon: Repeat, label: "Abonnement", desc: "Repas recurrents planifies", to: "/abonnement", feature: "abonnement", color: "text-purple-500", bg: "bg-purple-500/10", hoverBg: "group-hover:bg-purple-500/20" },
];

export default function Navbar() {
  const { user, role, roles, switchRole, signOut } = useAuth();
  const { itemCount } = useCart();
  const activeFeatures = useActiveFeatures();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const antiWasteEnabled = activeFeatures.has("anti-gaspi");
  const flashSalesEnabled = activeFeatures.has("ventes-flash");
  const courierEnabled = activeFeatures.has("espace-livreur");
  const reservationEnabled = activeFeatures.has("reservation");
  const dashboardEnabled = activeFeatures.has("dashboard-restaurateur");
  const visibleFeatures = FEATURES.filter((feature) => activeFeatures.has(feature.feature));
  const discoveryFeatures = visibleFeatures.slice(0, 3);
  const showCartShortcut = user || itemCount > 0;

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
  const visibleNotifications = (notifications || []).filter((notification: any) => allowedCategories?.[notification.category] !== false);
  const unreadCount = inAppEnabled ? visibleNotifications.filter((notification: any) => !notification.read_at).length : 0;

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
      })),
    );
    queryClient.setQueryData(["notifications", user.id], (current: any[] | undefined) =>
      (current || []).map((notification) => ({
        ...notification,
        read_at: notification.read_at ?? readAt,
      })),
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["navbar-notifications", user.id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user]);

  const handleThemeToggle = () => {
    document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
  };

  return (
    <>
      {/* ─── Top utility bar ─── */}
      <div className="hidden w-full border-b border-border/60 bg-muted/40 md:block">
        <div className="container flex h-9 items-center justify-end gap-4 text-xs text-muted-foreground">
          <Link to="/auth?type=restaurateur" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
            <Store className="h-3.5 w-3.5" />
            Pour les restaurateurs
          </Link>
          <span className="text-border">|</span>
          <Link to="/aide" className="transition-colors hover:text-foreground">Aide</Link>
        </div>
      </div>

      {/* ─── Main header ─── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-top dark:border-white/10 dark:bg-slate-950/78 dark:shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
        <div className="container flex h-16 items-center justify-between md:h-20">
          <Link to="/" className="flex items-center gap-2">
            <img src={LOGO_URL} alt="Tok" className="h-12 w-auto object-contain md:h-16" />
          </Link>

          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              <NavigationMenuItem>
                <Link to="/recherche" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                  <Search className="h-4 w-4" />
                  Explorer
                </Link>
              </NavigationMenuItem>
              {antiWasteEnabled ? (
                <NavigationMenuItem>
                  <Link to="/anti-gaspi" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-accent transition-colors hover:text-accent/80">
                    <Leaf className="h-4 w-4" />
                    Anti-gaspi
                  </Link>
                </NavigationMenuItem>
              ) : null}
              {flashSalesEnabled ? (
                <NavigationMenuItem>
                  <Link to="/ventes-flash" className="px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                    Ventes flash
                  </Link>
                </NavigationMenuItem>
              ) : null}
              <NavigationMenuItem>
                <Link to="/tok-one" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-violet-600 transition-colors hover:text-violet-500">
                  <Crown className="h-4 w-4" />
                  Tok One
                </Link>
              </NavigationMenuItem>
              {discoveryFeatures.length > 0 ? (
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent text-sm font-medium">
                    <Sparkles className="mr-1 h-4 w-4 text-primary" />
                    Plus
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-[min(680px,calc(100vw-3rem))] p-4 md:p-6">
                      <div className="mb-4 flex items-center gap-2 border-b pb-3">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <h3 className="font-display text-lg font-semibold">Parcours a decouvrir</h3>
                        <Badge variant="secondary" className="border-none bg-primary/10 text-[10px] text-primary">
                          {visibleFeatures.length} active{visibleFeatures.length > 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {visibleFeatures.map((feature) => (
                          <Link
                            key={feature.to}
                            to={feature.to}
                            className="group flex items-center gap-3 rounded-xl p-3 transition-all duration-200 hover:bg-accent/50"
                          >
                            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${feature.bg} ${feature.hoverBg} transition-colors duration-200`}>
                              <feature.icon className={`h-5 w-5 ${feature.color}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-tight transition-colors group-hover:text-foreground">{feature.label}</p>
                              <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{feature.desc}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              ) : null}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleThemeToggle} className="text-muted-foreground hover:text-foreground">
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Mode sombre</span>
            </Button>

            {showCartShortcut ? (
              <Button variant="ghost" size="icon" asChild className="relative">
                <Link to="/panier">
                  <ShoppingCart className="h-5 w-5" />
                  {itemCount > 0 ? (
                    <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center p-0 text-[10px]">
                      {itemCount}
                    </Badge>
                  ) : null}
                </Link>
              </Button>
            ) : null}

            {user ? (
              <DropdownMenu open={notificationsOpen} onOpenChange={handleNotificationsOpenChange}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && !notificationsOpen ? (
                      <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center p-0 text-[10px]">
                        {unreadCount}
                      </Badge>
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[min(320px,calc(100vw-2rem))]">
                  <div className="border-b px-3 py-2">
                    <p className="text-sm font-semibold">Notifications</p>
                    <p className="text-[11px] text-muted-foreground">Dernieres alertes</p>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {!inAppEnabled ? (
                      <div className="px-3 py-3 text-xs text-muted-foreground">Activez le canal in-app pour voir vos alertes.</div>
                    ) : visibleNotifications.length > 0 ? (
                      visibleNotifications.map((notification: any) => {
                        const isRecent = isRecentNotification(notification.created_at);
                        return (
                          <DropdownMenuItem
                            key={notification.id}
                            asChild
                            className={`cursor-pointer items-start rounded-none border-l-2 p-0 ${isRecent ? "border-l-primary bg-primary/5" : "border-l-transparent"
                              }`}
                          >
                            <Link to={notification.data?.url || "/notifications"} className="flex w-full flex-col gap-1 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{notification.title}</span>
                                {isRecent ? <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Recente</span> : null}
                                {!notification.read_at ? <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Nouveau</span> : null}
                              </div>
                              <span className="text-[11px] text-muted-foreground">{notification.body}</span>
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
            ) : null}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {roles.length > 1 ? (
                    <div className="mb-1 border-b px-2 py-2">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Espace actif</p>
                      <div className="flex flex-wrap gap-1">
                        {roles.map((candidateRole) => (
                          <button
                            key={candidateRole}
                            onClick={() => switchRole(candidateRole)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${role === candidateRole
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                          >
                            {{ client: "Client", restaurateur: "Restaurateur", admin: "Admin", courier: "Livreur" }[candidateRole]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <DropdownMenuItem asChild>
                    <Link to="/profil">Mon profil</Link>
                  </DropdownMenuItem>
                  {activeFeatures.has("commandes") ? (
                    <DropdownMenuItem asChild>
                      <Link to="/commandes">Mes commandes</Link>
                    </DropdownMenuItem>
                  ) : null}
                  {reservationEnabled ? (
                    <DropdownMenuItem asChild>
                      <Link to="/reservations">Mes reservations</Link>
                    </DropdownMenuItem>
                  ) : null}
                  {dashboardEnabled && (role === "restaurateur" || role === "admin" || roles.includes("restaurateur")) ? (
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="font-bold text-primary">Dashboard Restaurant</Link>
                    </DropdownMenuItem>
                  ) : null}
                  {(role === "admin" || roles.includes("admin")) ? (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="font-bold text-primary">Administration</Link>
                    </DropdownMenuItem>
                  ) : null}
                  {courierEnabled && (role === "courier" || roles.includes("courier")) ? (
                    <DropdownMenuItem asChild>
                      <Link to="/courier" className="font-bold text-primary">Espace Livreur</Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={signOut} className="mt-2 border-t pt-2 font-medium text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Deconnexion
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" className="rounded-full bg-primary px-5 font-bold text-white shadow-md hover:bg-primary/90">
                <Link to="/auth" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  CONNEXION
                </Link>
              </Button>
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

                <nav className="mt-6 flex flex-col gap-3">
                  <Link to="/" className="text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                    Accueil
                  </Link>
                  <Link to="/recherche" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                    <Search className="h-4 w-4" />
                    Explorer les restaurants
                  </Link>
                  {antiWasteEnabled ? (
                    <Link to="/anti-gaspi" className="text-sm font-medium text-accent" onClick={() => setMenuOpen(false)}>
                      Anti-gaspi
                    </Link>
                  ) : null}
                  {flashSalesEnabled ? (
                    <Link to="/ventes-flash" className="text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                      Ventes Flash
                    </Link>
                  ) : null}
                  <Link to="/tok-one" className="flex items-center gap-1 text-sm font-medium text-violet-600" onClick={() => setMenuOpen(false)}>
                    <Crown className="h-4 w-4" />
                    Tok One
                  </Link>

                  {!user && itemCount > 0 ? (
                    <Link to="/panier" className="flex items-center gap-2 text-sm font-medium text-primary" onClick={() => setMenuOpen(false)}>
                      <ShoppingCart className="h-4 w-4" />
                      Voir mon panier ({itemCount})
                    </Link>
                  ) : null}

                  <div className="mt-2 border-t pt-4">
                    <Link to="/auth?type=restaurateur" className="flex items-center gap-2 text-sm font-medium text-primary" onClick={() => setMenuOpen(false)}>
                      <Store className="h-4 w-4" />
                      Pour les restaurateurs
                    </Link>
                  </div>

                  {visibleFeatures.length > 0 ? (
                    <div className="mt-2 border-t pt-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">Plus</span>
                      </div>
                      <div className="grid grid-cols-1 gap-1">
                        {visibleFeatures.map((feature) => (
                          <Link
                            key={feature.to}
                            to={feature.to}
                            onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-accent/50"
                          >
                            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${feature.bg}`}>
                              <feature.icon className={`h-4 w-4 ${feature.color}`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium leading-tight">{feature.label}</p>
                              <p className="text-[11px] leading-tight text-muted-foreground">{feature.desc}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {user ? (
                    <div className="mt-2 space-y-4 border-t pt-4">
                      {roles.length > 1 ? (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Espace actif</p>
                          <div className="flex flex-wrap gap-1.5">
                            {roles.map((candidateRole) => (
                              <button
                                key={candidateRole}
                                onClick={() => {
                                  switchRole(candidateRole);
                                  setMenuOpen(false);
                                }}
                                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${role === candidateRole
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                  }`}
                              >
                                {{ client: "Client", restaurateur: "Restaurateur", admin: "Admin", courier: "Livreur" }[candidateRole]}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <Link to="/profil" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                        <User className="h-4 w-4" />
                        Mon profil
                      </Link>
                      {activeFeatures.has("commandes") ? (
                        <Link to="/commandes" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                          <ShoppingBag className="h-4 w-4" />
                          Mes commandes
                        </Link>
                      ) : null}
                      {dashboardEnabled && (roles.includes("restaurateur") || roles.includes("admin")) ? (
                        <Link to="/dashboard" className="flex items-center gap-2 text-sm font-bold text-primary" onClick={() => setMenuOpen(false)}>
                          <TrendingUp className="h-4 w-4" />
                          Dashboard Restaurant
                        </Link>
                      ) : null}
                      {roles.includes("admin") ? (
                        <Link to="/admin" className="flex items-center gap-2 text-sm font-bold text-primary" onClick={() => setMenuOpen(false)}>
                          <Shield className="h-4 w-4" />
                          Administration
                        </Link>
                      ) : null}
                      {courierEnabled && roles.includes("courier") ? (
                        <Link to="/courier" className="flex items-center gap-2 text-sm font-bold text-primary" onClick={() => setMenuOpen(false)}>
                          <ShoppingBag className="h-4 w-4" />
                          Espace Livreur
                        </Link>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-2 space-y-4 border-t pt-4">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        (window as any).openChat?.();
                      }}
                      className="flex items-center gap-2 text-left text-sm font-medium text-orange-500 hover:text-orange-600"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Assistance
                    </button>
                    <Link to="/a-propos" className="text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
                      A propos
                    </Link>
                    <Link to="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
                      Contact
                    </Link>
                    <Link to="/cgu" className="text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
                      CGU
                    </Link>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}
