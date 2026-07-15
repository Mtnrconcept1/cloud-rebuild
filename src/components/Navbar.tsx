import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  Network,
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
  Timer,
  User,
  Users,
  Zap,
} from "lucide-react";

import ChefHelpButton from "@/components/help/ChefHelpButton";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import RoleSpaceMenuSection from "@/components/navigation/RoleSpaceMenuSection";
import ThemeToggleButton from "@/components/theme/ThemeToggleButton";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { canShowClientSurface, canShowSocialFeedSurface, getRoleHomePath } from "@/lib/roleAccess";
import { getCommercialNavigationHref } from "@/lib/commercialDomains";
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
  const { user, role, roles, signOut } = useAuth();
  const location = useLocation();
  const { itemCount } = useCart();
  const activeFeatures = useActiveFeatures();
  const { unreadNotifications } = useNotificationCenter(50, { realtime: true });
  const logoSrc = useTokLogoSrc();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const headerRef = useRef<HTMLElement | null>(null);

  const antiWasteEnabled = activeFeatures.has("anti-gaspi");
  const flashSalesEnabled = activeFeatures.has("ventes-flash");
  const actualitesEnabled = activeFeatures.has("actualites-sociales");
  const reservationEnabled = activeFeatures.has("reservation");
  const tokOneEnabled = activeFeatures.has("tok-one");
  const tokConnectEnabled = activeFeatures.has("tok-connect");
  const visibleFeatures = FEATURES.filter((feature) => activeFeatures.has(feature.feature));
  const discoveryFeatures = visibleFeatures.slice(0, 3);
  const showClientSurface = canShowClientSurface({ activeRole: role, roles });
  const showSocialFeedSurface = canShowSocialFeedSurface({ activeRole: role, roles });
  const homeTarget = showClientSurface
    ? "/"
    : role === "commercial"
      ? getCommercialNavigationHref("/commercial")
      : getRoleHomePath(role);
  const showCartShortcut = showClientSurface && (user || itemCount > 0);
  const isMobileHomeHeader = showClientSurface && location.pathname === "/";

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const previousScrollY = lastScrollYRef.current;
      const scrollDelta = currentScrollY - previousScrollY;

      lastScrollYRef.current = currentScrollY;

      if (Math.abs(scrollDelta) < 8) return;

      if (currentScrollY < 48 || scrollDelta < 0) {
        setIsHeaderVisible(true);
      } else if (scrollDelta > 0 && !menuOpen && !accountMenuOpen) {
        setIsHeaderVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, [accountMenuOpen, menuOpen]);

  useLayoutEffect(() => {
    const root = document.documentElement;

    const updatePublicNavbarOffset = () => {
      const headerHeight = isHeaderVisible
        ? Math.max(0, Math.round(headerRef.current?.getBoundingClientRect().height ?? 0))
        : 0;

      root.style.setProperty("--tok-public-navbar-offset", `${headerHeight}px`);
    };

    updatePublicNavbarOffset();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" && headerRef.current
        ? new ResizeObserver(updatePublicNavbarOffset)
        : null;

    if (resizeObserver && headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    window.addEventListener("resize", updatePublicNavbarOffset);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePublicNavbarOffset);
      root.style.removeProperty("--tok-public-navbar-offset");
    };
  }, [isHeaderVisible, isMobileHomeHeader]);

  const handleAccountMenuOpenChange = (open: boolean) => {
    setAccountMenuOpen(open);
  };

  return (
    <>
      {/* ─── Top utility bar ─── */}
      {showClientSurface ? (
        <div className="hidden w-full border-b border-border/60 bg-muted/40 dark:border-white/10 dark:bg-slate-950/75 lg:block">
          <div className="container flex h-9 items-center justify-end gap-4 text-xs text-muted-foreground">
            <Link to="/restaurateurs/geneve" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Store className="h-3.5 w-3.5" />
              Pour les restaurateurs
            </Link>
            {tokConnectEnabled ? (
              <>
                <span className="text-border">|</span>
                <Link to="/tok-connect" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                  <Network className="h-3.5 w-3.5" />
                  TOK Connect
                </Link>
              </>
            ) : null}
            <span className="text-border">|</span>
            <Link to="/aide" className="transition-colors hover:text-foreground">Aide</Link>
          </div>
        </div>
      ) : null}

      {/* ─── Main header ─── */}
      <header
        ref={headerRef}
        className={`fixed top-0 z-[70] w-full border-b shadow-sm safe-top transition-[opacity,transform] duration-300 ease-out md:sticky md:z-50 ${isHeaderVisible ? "" : "pointer-events-none"} ${isMobileHomeHeader ? "border-slate-200 bg-white backdrop-blur-none dark:border-slate-200 dark:bg-white" : "border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 dark:border-white/20 dark:bg-slate-950/80 dark:shadow-[0_14px_44px_rgba(0,0,0,0.48),0_0_34px_rgba(249,115,22,0.10)]"}`}
        style={{
          opacity: isHeaderVisible ? 1 : 0,
          transform: isHeaderVisible ? "translateY(0)" : "translateY(-100%)",
        }}
      >
        <div className={`mx-auto flex w-full max-w-[1400px] items-center justify-between gap-2 px-3 min-[380px]:px-4 md:h-20 md:px-8 ${isMobileHomeHeader ? "h-[66px] bg-white dark:bg-white" : "h-16"}`}>
          <Link to={homeTarget} className="flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-2">
            <img src={logoSrc} alt="Tok" className={`${isMobileHomeHeader ? "h-[50px]" : "h-11 min-[380px]:h-12"} w-auto object-contain dark:drop-shadow-[0_0_20px_rgba(249,115,22,0.28)] md:h-16`} />
          </Link>

          {showClientSurface ? (
            <NavigationMenu className="hidden lg:flex">
              <NavigationMenuList>
                <NavigationMenuItem>
                  <Link to="/recherche" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                    <Search className="h-4 w-4" />
                    Explorer
                </Link>
              </NavigationMenuItem>
              {actualitesEnabled ? (
                <NavigationMenuItem>
                  <Link to="/actualites" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                    <Newspaper className="h-4 w-4" />
                    Actualités
                  </Link>
                </NavigationMenuItem>
              ) : null}
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
                    <Link to="/ventes-flash" className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-amber-600 transition-colors hover:text-orange-600 dark:text-amber-300 dark:hover:text-orange-300">
                      <Zap className="h-4 w-4 fill-amber-400/35 text-amber-500 dark:text-amber-300" />
                      Ventes flash
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
              <Button variant="ghost" size="sm" asChild className="hidden gap-2 rounded-full lg:inline-flex">
                <Link to="/actualites">
                  <Newspaper className="h-4 w-4" />
                  Actualités
                </Link>
              </Button>
            ) : null}

            <ThemeToggleButton
              aria-label="Mode sombre"
              onMouseDown={preserveNavbarActionScrollPosition}
              className={isMobileHomeHeader ? "text-slate-950 hover:bg-transparent hover:text-slate-950 dark:text-slate-950" : undefined}
            />

            {showCartShortcut ? (
              <Button variant="ghost" size="icon" asChild aria-label="Panier" onMouseDown={preserveNavbarActionScrollPosition} className="relative">
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

            {showClientSurface ? (
              <Link
                to="/restaurateurs/geneve"
                onMouseDown={preserveNavbarActionScrollPosition}
                className="hidden h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground lg:inline-flex"
              >
                <Store className="h-4 w-4" />
                Restaurateurs
              </Link>
            ) : null}

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
                        ? "order-3 h-[48px] w-[48px] rounded-full bg-primary p-0 text-[0.88rem] font-bold text-white shadow-[0_10px_22px_rgba(255,107,28,0.24)] hover:bg-primary/90 min-[380px]:w-auto min-[380px]:px-5"
                        : "rounded-full"
                    }
                  >
                    <User className="h-5 w-5" />
                    <span className={isMobileHomeHeader ? "hidden min-[380px]:ml-2 min-[380px]:inline" : "sr-only"}>
                      COMPTE
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 data-[state=closed]:hidden">
                  <RoleSpaceMenuSection className="mx-1 mb-2" onNavigate={() => setAccountMenuOpen(false)} />
                  {showClientSurface ? (
                    <DropdownMenuItem asChild>
                      <Link to="/mon-espace">Mon espace</Link>
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

            {showClientSurface ? (
              <ChefHelpButton surface="client" compact className="hidden h-20 w-20 lg:flex" />
            ) : null}

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className={`${isMobileHomeHeader ? "order-2 text-slate-950 hover:bg-transparent" : ""} lg:hidden`}>
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
                    <Link to="/ventes-flash" className="flex items-center gap-2 text-sm font-semibold text-amber-600 hover:text-orange-600 dark:text-amber-300 dark:hover:text-orange-300" onClick={() => setMenuOpen(false)}>
                      <Zap className="h-4 w-4 fill-amber-400/35 text-amber-500 dark:text-amber-300" />
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

                  {showClientSurface && itemCount > 0 ? (
                    <Link to="/panier" className="flex items-center gap-2 text-sm font-medium text-primary" onClick={() => setMenuOpen(false)}>
                      <ShoppingCart className="h-4 w-4" />
                      Voir mon panier ({itemCount})
                    </Link>
                  ) : null}

                  {showClientSurface ? (
                    <div className="mt-2 border-t pt-4">
                      <Link to="/restaurateurs/geneve" className="flex items-center gap-2 text-sm font-medium text-primary" onClick={() => setMenuOpen(false)}>
                        <Store className="h-4 w-4" />
                        Devenir partenaire
                      </Link>
                      {tokConnectEnabled ? (
                        <Link to="/tok-connect" className="mt-3 flex items-center gap-2 text-sm font-medium text-primary" onClick={() => setMenuOpen(false)}>
                          <Network className="h-4 w-4" />
                          TOK Connect
                        </Link>
                      ) : null}
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
                      <RoleSpaceMenuSection onNavigate={() => setMenuOpen(false)} />

                      {showClientSurface ? (
                        <Link to="/mon-espace" className="flex items-center gap-2 text-sm font-medium hover:text-primary" onClick={() => setMenuOpen(false)}>
                          <User className="h-4 w-4" />
                          Mon espace
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
                    </div>
                  ) : null}

                  <div className="mt-2 space-y-4 border-t pt-4">
                    {showClientSurface ? (
                      <ChefHelpButton surface="client" onOpen={() => setMenuOpen(false)} />
                    ) : null}
                    <div className="flex flex-col items-start gap-2">
                      <Link to="/a-propos" className="block text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
                        À propos
                      </Link>
                      <Link to="/contact" className="block text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
                        Contact
                      </Link>
                      <Link to="/cgu" className="block text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
                        CGU
                      </Link>
                      <Link to="/politique-confidentialite" className="block text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
                        Confidentialité
                      </Link>
                      <Link to="/cookies" className="block text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
                        Cookies
                      </Link>
                    </div>
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

