import { type MouseEvent, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  Calculator,
  CalendarDays,
  ChefHat,
  Crown,
  Gift,
  Layers,
  Leaf,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Newspaper,
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

import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { LOGO_URL } from "@/lib/constants";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { canShowClientSurface, canShowSocialFeedSurface, getRoleHomePath } from "@/lib/roleAccess";
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function preserveNavbarActionScrollPosition(event: MouseEvent<HTMLElement>) {
  if (event.detail === 0) return;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const restoreScroll = () => {
    if (Math.abs(window.scrollX - scrollX) > 1 || Math.abs(window.scrollY - scrollY) > 1) {
      window.scrollTo(scrollX, scrollY);
    }
  };

  window.setTimeout(restoreScroll, 0);
  window.requestAnimationFrame(() => {
    restoreScroll();
    window.requestAnimationFrame(restoreScroll);
  });
}

const FEATURES = [
  { icon: Shield, label: "Créneaux garantis", desc: "Livraison ponctuelle ou remboursée", to: "/creneaux-garantis", feature: "creneaux-garantis", color: "text-blue-500", bg: "bg-blue-500/10", hoverBg: "group-hover:bg-blue-500/20" },
  { icon: Gift, label: "Offres", desc: "Fenêtre flexible, prix réduit", to: "/flex-prix-bas", feature: "flex-prix-bas", color: "text-emerald-500", bg: "bg-emerald-500/10", hoverBg: "group-hover:bg-emerald-500/20" },
  { icon: Users, label: "Match groupes", desc: "Commandez ensemble, payez moins", to: "/match-groupes", feature: "match-groupes", color: "text-violet-500", bg: "bg-violet-500/10", hoverBg: "group-hover:bg-violet-500/20" },
  { icon: Route, label: "Multi-stop", desc: "Un trajet, plusieurs adresses", to: "/multi-stop", feature: "multi-stop", color: "text-orange-500", bg: "bg-orange-500/10", hoverBg: "group-hover:bg-orange-500/20" },
  { icon: Layers, label: "Multi-restos", desc: "Plats de différents restos", to: "/multi-restaurant", feature: "multi-restaurant", color: "text-pink-500", bg: "bg-pink-500/10", hoverBg: "group-hover:bg-pink-500/20" },
  { icon: ChefHat, label: "La Table du Chef", desc: "Plats off-menu exclusifs", to: "/chefs-table", feature: "chefs-table", color: "text-amber-500", bg: "bg-amber-500/10", hoverBg: "group-hover:bg-amber-500/20" },
  { icon: Timer, label: "Zéro attente", desc: "Précommande synchronisée", to: "/zero-attente", feature: "zero-attente", color: "text-indigo-500", bg: "bg-indigo-500/10", hoverBg: "group-hover:bg-indigo-500/20" },
  { icon: ShieldCheck, label: "Garantie qualité", desc: "Chaud garanti ou remboursé", to: "/garantie-qualite", feature: "garantie-qualite", color: "text-teal-500", bg: "bg-teal-500/10", hoverBg: "group-hover:bg-teal-500/20" },
  { icon: Calculator, label: "Budget auto", desc: "Menus optimisés par objectifs", to: "/budget-auto", feature: "budget-auto", color: "text-cyan-500", bg: "bg-cyan-500/10", hoverBg: "group-hover:bg-cyan-500/20" },
  { icon: Repeat, label: "Abonnement", desc: "Repas récurrents planifiés", to: "/abonnement", feature: "abonnement", color: "text-purple-500", bg: "bg-purple-500/10", hoverBg: "group-hover:bg-purple-500/20" },
];

export default function Navbar() {
  const { user, role, roles, canSwitchRole, switchRole, signOut } = useAuth();
  const location = useLocation();
  const { itemCount } = useCart();
  const activeFeatures = useActiveFeatures();
  const { unreadNotifications } = useNotificationCenter(50);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const antiWasteEnabled = activeFeatures.has("anti-gaspi");
  const flashSalesEnabled = activeFeatures.has("ventes-flash");
  const actualitesEnabled = activeFeatures.has("actualites-sociales");
  const courierEnabled = activeFeatures.has("espace-livreur");
  const reservationEnabled = activeFeatures.has("reservation");
  const dashboardEnabled = activeFeatures.has("dashboard-restaurateur");
  const tokOneEnabled = activeFeatures.has("tok-one");
  const visibleFeatures = FEATURES.filter((feature) => activeFeatures.has(feature.feature));
  const discoveryFeatures = visibleFeatures.slice(0, 3);
  const showClientSurface = canShowClientSurface({ activeRole: role });
  const showSocialFeedSurface = canShowSocialFeedSurface({ activeRole: role });
  const homeTarget = showClientSurface ? "/" : getRoleHomePath(role);
  const showCartShortcut = showClientSurface && (user || itemCount > 0);
  const showRestaurantDashboardLink = dashboardEnabled && roles.includes("restaurateur");
  const showAdminDashboardLink = roles.includes("admin");
  const showCourierDashboardLink = courierEnabled && roles.includes("courier");
  const isMobileHomeHeader = showClientSurface && location.pathname === "/";

  const handleAccountMenuOpenChange = (open: boolean) => {
    setAccountMenuOpen(open);
  };

  const handleThemeToggle = () => {
    document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
  };

  return (
    <>
      {/* ─── Top utility bar ─── */}
      {showClientSurface ? (
        <div className="hidden w-full border-b border-border/60 bg-muted/40 dark:border-white/10 dark:bg-slate-950/75 md:block">
          <div className="container flex h-9 items-center justify-end gap-4 text-xs text-muted-foreground">
            <Link to="/auth?type=restaurateur" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Store className="h-3.5 w-3.5" />
              Pour les restaurateurs
            </Link>
            <span className="text-border">|</span>
            <Link to="/aide" className="transition-colors hover:text-foreground">Aide</Link>
          </div>
        </div>
      ) : null}

      {/* ─── Main header ─── */}
      <header className={`fixed top-0 z-[70] w-full border-b shadow-sm safe-top md:sticky md:z-50 ${isMobileHomeHeader ? "border-slate-200 bg-white backdrop-blur-none dark:border-slate-200 dark:bg-white" : "border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 dark:border-white/20 dark:bg-slate-950/80 dark:shadow-[0_14px_44px_rgba(0,0,0,0.48),0_0_34px_rgba(249,115,22,0.10)]"}`}>
        <div className={`mx-auto flex w-full max-w-[1400px] items-center justify-between gap-2 px-3 min-[380px]:px-4 md:h-20 md:px-8 ${isMobileHomeHeader ? "h-[66px] bg-white dark:bg-white" : "h-16"}`}>
          <Link to={homeTarget} className="flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-2">
            <img src={LOGO_URL} alt="Tok" className={`${isMobileHomeHeader ? "h-[50px]" : "h-11 min-[380px]:h-12"} w-auto object-contain dark:drop-shadow-[0_0_20px_rgba(249,115,22,0.28)] md:h-16`} />
          </Link>

          {showClientSurface ? (
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
                {actualitesEnabled ? (
                  <NavigationMenuItem>
                    <Link to="/actualites" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                      <Newspaper className="h-4 w-4" />
                      Actualités
                    </Link>
                  </NavigationMenuItem>
                ) : null}
                {tokOneEnabled ? (
                  <NavigationMenuItem>
                    <Link to="/tok-one" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-violet-600 transition-colors hover:text-violet-500">
                      <Crown className="h-4 w-4" />
                      Tok One
                    </Link>
                  </NavigationMenuItem>
                ) : null}
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
                          <h3 className="font-display text-lg font-semibold">Parcours à découvrir</h3>
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
          ) : null}

          <div className="flex min-w-0 items-center gap-0.5 min-[380px]:gap-1">
            {!showClientSurface && showSocialFeedSurface && actualitesEnabled ? (
              <Button variant="ghost" size="sm" asChild className="hidden gap-2 rounded-full md:inline-flex">
                <Link to="/actualites">
                  <Newspaper className="h-4 w-4" />
                  Actualités
                </Link>
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              aria-label="Mode sombre"
              onMouseDown={preserveNavbarActionScrollPosition}
              onClick={handleThemeToggle}
              className={`${isMobileHomeHeader ? "hidden md:inline-flex" : ""} text-muted-foreground hover:text-foreground`}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Mode sombre</span>
            </Button>

            {showCartShortcut ? (
              <Button variant="ghost" size="icon" asChild aria-label="Panier" onMouseDown={preserveNavbarActionScrollPosition} className={`${isMobileHomeHeader ? "hidden md:inline-flex" : ""} relative`}>
                <Link to="/panier">
                  <ShoppingCart className="h-5 w-5" />
                  <span className="sr-only">Panier</span>
                  {itemCount > 0 ? (
                    <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center p-0 text-[10px]">
                      {itemCount}
                    </Badge>
                  ) : null}
                </Link>
              </Button>
            ) : null}

            <NotificationBell className={isMobileHomeHeader ? "text-slate-950 hover:bg-transparent" : undefined} />

            {user ? (
              <DropdownMenu modal={false} open={accountMenuOpen} onOpenChange={handleAccountMenuOpenChange}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size={isMobileHomeHeader ? "sm" : "icon"}
                    aria-label="Compte"
                    onMouseDown={preserveNavbarActionScrollPosition}
                    className={
                      isMobileHomeHeader
                        ? "order-3 h-[48px] rounded-full bg-primary px-5 text-[0.88rem] font-bold text-white shadow-[0_10px_22px_rgba(255,107,28,0.24)] hover:bg-primary/90"
                        : "rounded-full"
                    }
                  >
                    <User className="h-5 w-5" />
                    <span className={isMobileHomeHeader ? "ml-2 inline" : "sr-only"}>COMPTE</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 data-[state=closed]:hidden">
                  {canSwitchRole ? (
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
                  {showClientSurface ? (
                    <DropdownMenuItem asChild>
                      <Link to="/profil">Mon profil</Link>
                    </DropdownMenuItem>
                  ) : null}
                  {showClientSurface && activeFeatures.has("commandes") ? (
                    <DropdownMenuItem asChild>
                      <Link to="/commandes" className="flex w-full items-center gap-2">
                        <span>Mes commandes</span>
                        <NotificationMenuBadge route="/commandes" role={role} unreadNotifications={unreadNotifications} />
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {showClientSurface && reservationEnabled ? (
                    <DropdownMenuItem asChild>
                      <Link to="/reservations" className="flex w-full items-center gap-2">
                        <span>Mes réservations</span>
                        <NotificationMenuBadge route="/reservations" role={role} unreadNotifications={unreadNotifications} />
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {showClientSurface ? (
                    <DropdownMenuItem asChild>
                      <Link to="/notifications" className="flex w-full items-center gap-2">
                        <span>Notifications</span>
                        <NotificationMenuBadge route="/notifications" role={role} unreadNotifications={unreadNotifications} />
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {showSocialFeedSurface && actualitesEnabled ? (
                    <DropdownMenuItem asChild>
                      <Link to="/actualites">Actualités</Link>
                    </DropdownMenuItem>
                  ) : null}
                  {role === "courier" && !showClientSurface ? (
                    <DropdownMenuItem asChild>
                      <Link to="/courier/profile">Mon profil</Link>
                    </DropdownMenuItem>
                  ) : null}
                  {showRestaurantDashboardLink ? (
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="font-bold text-primary">Dashboard restaurant</Link>
                    </DropdownMenuItem>
                  ) : null}
                  {showAdminDashboardLink ? (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="font-bold text-primary">Administration</Link>
                    </DropdownMenuItem>
                  ) : null}
                  {showCourierDashboardLink ? (
                    <DropdownMenuItem asChild>
                      <Link to="/courier" className="font-bold text-primary">Espace livreur</Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={signOut} className="mt-2 border-t pt-2 font-medium text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Déconnexion
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" className={`${isMobileHomeHeader ? "order-3 h-[48px] rounded-full px-5 text-[0.88rem] shadow-[0_10px_22px_rgba(255,107,28,0.24)]" : "min-h-[44px] px-3 min-[380px]:px-5"} rounded-full bg-primary font-bold text-white shadow-md hover:bg-primary/90`}>
                <Link to="/auth" className="flex items-center gap-2">
                  <User className={`${isMobileHomeHeader ? "h-5 w-5" : "h-4 w-4"}`} />
                  <span className={isMobileHomeHeader ? "inline" : "hidden min-[380px]:inline"}>CONNEXION</span>
                </Link>
              </Button>
            )}

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className={`${isMobileHomeHeader ? "order-2 text-slate-950 hover:bg-transparent" : ""} md:hidden`}>
                  <Menu className={`${isMobileHomeHeader ? "h-8 w-8" : "h-5 w-5"}`} />
                  <span className="sr-only">Ouvrir le menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(320px,85vw)] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                  <SheetDescription className="sr-only">
                    Navigation principale et accès aux espaces Tok.
                  </SheetDescription>
                </SheetHeader>

                <nav className="mt-6 flex flex-col gap-3">
                  <Link to={homeTarget} className="text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                    Accueil
                  </Link>
                  {showClientSurface ? (
                    <Link to="/recherche" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                      <Search className="h-4 w-4" />
                      Explorer les restaurants
                    </Link>
                  ) : null}
                  {showClientSurface && antiWasteEnabled ? (
                    <Link to="/anti-gaspi" className="text-sm font-medium text-accent" onClick={() => setMenuOpen(false)}>
                      Anti-gaspi
                    </Link>
                  ) : null}
                  {showClientSurface && flashSalesEnabled ? (
                    <Link to="/ventes-flash" className="text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                      Ventes flash
                    </Link>
                  ) : null}
                  {showSocialFeedSurface && actualitesEnabled ? (
                    <Link to="/actualites" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                      <Newspaper className="h-4 w-4" />
                      Actualités
                    </Link>
                  ) : null}
                  {showClientSurface && tokOneEnabled ? (
                    <Link to="/tok-one" className="flex items-center gap-1 text-sm font-medium text-violet-600" onClick={() => setMenuOpen(false)}>
                      <Crown className="h-4 w-4" />
                      Tok One
                    </Link>
                  ) : null}

                  {!user && itemCount > 0 ? (
                    <Link to="/panier" className="flex items-center gap-2 text-sm font-medium text-primary" onClick={() => setMenuOpen(false)}>
                      <ShoppingCart className="h-4 w-4" />
                      Voir mon panier ({itemCount})
                    </Link>
                  ) : null}

                  {showClientSurface ? (
                    <div className="mt-2 border-t pt-4">
                      <Link to="/auth?type=restaurateur" className="flex items-center gap-2 text-sm font-medium text-primary" onClick={() => setMenuOpen(false)}>
                        <Store className="h-4 w-4" />
                        Pour les restaurateurs
                      </Link>
                    </div>
                  ) : null}

                  {showClientSurface && visibleFeatures.length > 0 ? (
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
                      {canSwitchRole ? (
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

                      {showClientSurface ? (
                        <Link to="/profil" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                          <User className="h-4 w-4" />
                          Mon profil
                        </Link>
                      ) : null}
                      {role === "courier" && !showClientSurface ? (
                        <Link to="/courier/profile" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                          <User className="h-4 w-4" />
                          Mon profil
                        </Link>
                      ) : null}
                      {showClientSurface && activeFeatures.has("commandes") ? (
                        <Link to="/commandes" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                          <ShoppingBag className="h-4 w-4" />
                          <span>Mes commandes</span>
                          <NotificationMenuBadge route="/commandes" role={role} unreadNotifications={unreadNotifications} />
                        </Link>
                      ) : null}
                      {showClientSurface && reservationEnabled ? (
                        <Link to="/reservations" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                          <CalendarDays className="h-4 w-4" />
                          <span>Mes réservations</span>
                          <NotificationMenuBadge route="/reservations" role={role} unreadNotifications={unreadNotifications} />
                        </Link>
                      ) : null}
                      {showClientSurface ? (
                        <Link to="/notifications" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                          <Bell className="h-4 w-4" />
                          <span>Notifications</span>
                          <NotificationMenuBadge route="/notifications" role={role} unreadNotifications={unreadNotifications} />
                        </Link>
                      ) : null}
                      {showRestaurantDashboardLink ? (
                        <Link to="/dashboard" className="flex items-center gap-2 text-sm font-bold text-primary" onClick={() => setMenuOpen(false)}>
                          <TrendingUp className="h-4 w-4" />
                          Dashboard restaurant
                        </Link>
                      ) : null}
                      {showAdminDashboardLink ? (
                        <Link to="/admin" className="flex items-center gap-2 text-sm font-bold text-primary" onClick={() => setMenuOpen(false)}>
                          <Shield className="h-4 w-4" />
                          Administration
                        </Link>
                      ) : null}
                      {showCourierDashboardLink ? (
                        <Link to="/courier" className="flex items-center gap-2 text-sm font-bold text-primary" onClick={() => setMenuOpen(false)}>
                          <ShoppingBag className="h-4 w-4" />
                          Espace livreur
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
                      À propos
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
      <div className="h-16 md:hidden" aria-hidden="true" />
    </>
  );
}
