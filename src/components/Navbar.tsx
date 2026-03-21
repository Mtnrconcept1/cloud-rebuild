import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarDays,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Search,
  Shield,
  Sun,
  TrendingUp,
  User,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { LOGO_URL } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export default function Navbar() {
  const { user, role, roles, switchRole, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const queryClient = useQueryClient();

  const visibleRoles = roles.filter((currentRole) => currentRole !== "courier");

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
  const visibleNotifications = (notifications || []).filter((notification: any) =>
    allowedCategories?.[notification.category] !== false,
  );
  const unreadCount = inAppEnabled
    ? visibleNotifications.filter((notification: any) => !notification.read_at).length
    : 0;

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

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={LOGO_URL} alt="Deliveroom" className="h-10 w-auto object-contain" />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link to="/recherche" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Restaurants
          </Link>
          <Link to="/recherche" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Reserver une table
          </Link>
          {user ? (
            <Link to="/reservations" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Mes reservations
            </Link>
          ) : null}
          <Link to="/aide" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Aide
          </Link>
        </nav>

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
                    <div className="px-3 py-3 text-xs text-muted-foreground">
                      Activez le canal In-app pour voir vos alertes.
                    </div>
                  ) : visibleNotifications.length > 0 ? (
                    visibleNotifications.map((notification: any) => {
                      const isRecent = isRecentNotification(notification.created_at);
                      return (
                        <DropdownMenuItem
                          key={notification.id}
                          asChild
                          className={`cursor-pointer items-start rounded-none border-l-2 p-0 ${
                            isRecent ? "border-l-primary bg-primary/5" : "border-l-transparent"
                          }`}
                        >
                          <Link to={notification.data?.url || "/notifications"} className="flex w-full flex-col gap-1 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{notification.title}</span>
                              {isRecent ? (
                                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                  Recente
                                </span>
                              ) : null}
                              {!notification.read_at ? (
                                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                  Nouveau
                                </span>
                              ) : null}
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
                {visibleRoles.length > 1 ? (
                  <div className="mb-1 border-b px-2 py-2">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Espace actif
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {visibleRoles.map((currentRole) => (
                        <button
                          key={currentRole}
                          onClick={() => switchRole(currentRole)}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            role === currentRole
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {{ client: "Client", restaurateur: "Restaurateur", admin: "Admin" }[currentRole]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <DropdownMenuItem asChild>
                  <Link to="/profil">Mon profil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/reservations">Mes reservations</Link>
                </DropdownMenuItem>
                {(role === "restaurateur" || role === "admin" || roles.includes("restaurateur")) ? (
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" className="font-bold text-primary">Dashboard Restaurant</Link>
                  </DropdownMenuItem>
                ) : null}
                {(role === "admin" || roles.includes("admin")) ? (
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="font-bold text-primary">Administration</Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={signOut} className="mt-2 border-t pt-2 font-medium text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Deconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="hidden text-muted-foreground hover:text-primary lg:flex">
                <Link to="/auth?type=restaurateur">Vous etes restaurateur ?</Link>
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
              <nav className="mt-6 flex flex-col gap-3">
                <Link to="/recherche" className="text-sm font-medium hover:text-primary">Restaurants</Link>
                <Link to="/recherche" className="text-sm font-medium hover:text-primary">Reserver une table</Link>
                <Link to="/aide" className="text-sm font-medium hover:text-primary">Aide</Link>

                {user ? (
                  <div className="mt-2 space-y-4 border-t pt-4">
                    {visibleRoles.length > 1 ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Espace actif
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {visibleRoles.map((currentRole) => (
                            <button
                              key={currentRole}
                              onClick={() => {
                                switchRole(currentRole);
                                setMenuOpen(false);
                              }}
                              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                                role === currentRole
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                            >
                              {{ client: "Client", restaurateur: "Restaurateur", admin: "Admin" }[currentRole]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <Link to="/profil" className="flex items-center gap-2 text-sm font-medium hover:text-primary">
                      <User className="h-4 w-4" />
                      Mon profil
                    </Link>
                    <Link to="/reservations" className="flex items-center gap-2 text-sm font-medium hover:text-primary">
                      <CalendarDays className="h-4 w-4" />
                      Mes reservations
                    </Link>
                    {(roles.includes("restaurateur") || roles.includes("admin")) ? (
                      <Link to="/dashboard" className="flex items-center gap-2 text-sm font-bold text-primary">
                        <TrendingUp className="h-4 w-4" />
                        Dashboard Restaurant
                      </Link>
                    ) : null}
                    {roles.includes("admin") ? (
                      <Link to="/admin" className="flex items-center gap-2 text-sm font-bold text-primary">
                        <Shield className="h-4 w-4" />
                        Administration
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
                  <Link to="/a-propos" className="text-sm font-medium text-muted-foreground hover:text-foreground">A propos</Link>
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
