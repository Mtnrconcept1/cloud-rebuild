import { Link, useLocation } from "react-router-dom";
import { Bell, Bike, Coins, LayoutDashboard, LogOut, Menu, Shield, Store, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import CourierMissionDialog from "@/components/courier/CourierMissionDialog";
import ChefHelpButton from "@/components/help/ChefHelpButton";
import { BackNavigationButton } from "@/components/navigation/BackNavigationButton";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import ThemeToggleButton from "@/components/theme/ThemeToggleButton";
import SignOutButton from "@/components/auth/SignOutButton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useRealtimeNotifications, type RealtimeNotification } from "@/hooks/useRealtimeNotifications";
import { getAdminNavigationHref } from "@/lib/adminDomains";
import { useAuth } from "@/lib/auth-context";
import { respondToDispatchAttempt } from "@/lib/courier";
import {
  buildCourierMissionFromNotification,
  type CourierMissionPreview,
} from "@/lib/courierMission";
import { useActiveFeatures } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";

type CourierNavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  feature?: string;
};

const NAV_ITEMS: CourierNavItem[] = [
  { to: "/courier", label: "Vue d'ensemble", icon: LayoutDashboard, feature: "courier-home" },
  { to: "/courier/jobs", label: "Missions", icon: Bike, feature: "courier-jobs" },
  { to: "/courier/notifications", label: "Notifications", icon: Bell },
  { to: "/courier/earnings", label: "Gains", icon: Coins, feature: "courier-earnings" },
  { to: "/courier/profile", label: "Profil", icon: UserRound, feature: "courier-profile" },
];

type CourierNavContentProps = {
  pathname: string;
  visibleNavItems: CourierNavItem[];
  roles: string[];
  role: ReturnType<typeof useAuth>["role"];
  activeFeatures: ReadonlySet<string>;
  unreadNotifications: ReturnType<typeof useNotificationCenter>["unreadNotifications"];
  onSignOut: () => void;
  onNavigate?: () => void;
};

function CourierNavContent({
  pathname,
  visibleNavItems,
  roles,
  role,
  activeFeatures,
  unreadNotifications,
  onSignOut,
  onNavigate,
}: CourierNavContentProps) {
  const adminDashboardHref = getAdminNavigationHref("/admin");

  return (
    <>
      <div className="px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">Operations</p>
        <h2 className="font-display text-lg font-semibold">Espace Livreur</h2>
      </div>

      <div className="px-1 pb-2">
        <ChefHelpButton surface="courier" onOpen={onNavigate} />
      </div>

      {visibleNavItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === item.to
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground hover:bg-muted",
          )}
        >
          <item.icon className="h-4 w-4" />
          <span>{item.label}</span>
          <NotificationMenuBadge route={item.to} role={role} unreadNotifications={unreadNotifications} />
        </Link>
      ))}

      {roles.length > 1 ? (
        <div className="mt-3 space-y-1 border-t pt-3">
          {roles.includes("restaurateur") && activeFeatures.has("dashboard-restaurateur") ? (
            <Link
              to="/dashboard"
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Store className="h-4 w-4" />
              Espace Restaurateur
            </Link>
          ) : null}
          {roles.includes("admin") ? (
            <a
              href={adminDashboardHref}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Shield className="h-4 w-4" />
              Administration
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 border-t pt-3">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          Deconnexion
        </button>
      </div>
    </>
  );
}

export default function CourierDashboardLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { signOut, roles, role } = useAuth();
  const activeFeatures = useActiveFeatures();
  const queryClient = useQueryClient();
  const { unreadNotifications } = useNotificationCenter(50);
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [missionPreview, setMissionPreview] = useState<CourierMissionPreview | null>(null);
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.feature || activeFeatures.has(item.feature));
  const backFallback = pathname === "/courier" ? "/" : "/courier";
  const activeNavItem = visibleNavItems.find((item) => item.to === pathname);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const refreshCourierQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["courier-offers"] });
    queryClient.invalidateQueries({ queryKey: ["courier-offers-home"] });
    queryClient.invalidateQueries({ queryKey: ["courier-active-jobs"] });
    queryClient.invalidateQueries({ queryKey: ["courier-active-jobs-home"] });
    queryClient.invalidateQueries({ queryKey: ["courier-recent-jobs"] });
  }, [queryClient]);

  const respondMutation = useMutation({
    mutationFn: async ({ attemptId, decision }: { attemptId: string; decision: "accept" | "decline" }) =>
      respondToDispatchAttempt(attemptId, decision),
    onSuccess: (_, variables) => {
      toast.success(variables.decision === "accept" ? "Mission acceptée" : "Mission refusée");
      setMissionDialogOpen(false);
      refreshCourierQueries();
      if (variables.decision === "accept") {
        window.location.href = "/courier/jobs";
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Impossible de traiter la mission.");
    },
  });

  const handleRealtimeNotification = useCallback((notification: RealtimeNotification) => {
    const data = notification.data && typeof notification.data === "object" && !Array.isArray(notification.data)
      ? notification.data
      : {};

    const distanceKm = typeof data.distance_km === "number" ? `${data.distance_km.toFixed(1)} km` : "";
    const earnings = typeof data.estimated_earnings === "number" ? `${data.estimated_earnings.toFixed(2)} CHF` : "";
    const restaurantName = typeof data.restaurant_name === "string" ? data.restaurant_name : "";
    const scheduledLabel = typeof data.scheduled_delivery_label === "string"
      ? data.scheduled_delivery_label
      : (typeof data.delivery_window_label === "string" ? data.delivery_window_label : "");
    const detailParts = [restaurantName, distanceKm, earnings, scheduledLabel].filter(Boolean);

    toast(notification.title, {
      description: detailParts.join(" - ") || notification.body,
      action: typeof data.url === "string"
        ? {
            label: "Ouvrir",
            onClick: () => {
              window.location.href = data.url as string;
            },
          }
        : undefined,
    });

    const mission = buildCourierMissionFromNotification(notification);
    if (mission) {
      setMissionPreview(mission);
      setMissionDialogOpen(true);
    }

    refreshCourierQueries();
  }, [refreshCourierQueries]);

  useRealtimeNotifications({
    enabled: true,
    onInsert: handleRealtimeNotification,
  });

  return (
    <div className="min-h-screen bg-muted/30 pt-16">
      <div
        className="fixed left-[calc(env(safe-area-inset-left,0px)+0.75rem)] top-[calc(env(safe-area-inset-top,0px)+4.75rem)] z-[70] md:hidden"
        data-testid="courier-mobile-back-button"
      >
        <BackNavigationButton
          fallback={backFallback}
          showLabel={false}
          className="h-11 w-11 px-0 shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
        />
      </div>

      <div className="container flex flex-col gap-6 px-3 py-6 pb-28 sm:px-4 sm:py-8 sm:pb-28 md:flex-row md:gap-8 md:pb-8">
        <aside className="hidden w-full shrink-0 md:block md:w-72">
          <div className="sticky top-24 flex flex-col gap-2 rounded-2xl border bg-card p-4">
            <CourierNavContent
              pathname={pathname}
              visibleNavItems={visibleNavItems}
              roles={roles}
              role={role}
              activeFeatures={activeFeatures}
              unreadNotifications={unreadNotifications}
              onSignOut={() => signOut()}
            />
          </div>
        </aside>

        <main className="min-h-[500px] flex-1 overflow-x-hidden rounded-2xl border bg-card p-4 sm:p-6 md:p-8">
          <BackNavigationButton fallback={backFallback} className="mb-4 hidden md:inline-flex" />
          {children}
        </main>
      </div>

      <div className="fixed right-[calc(env(safe-area-inset-right,0px)+0.75rem)] top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[70] flex items-center gap-2">
        <ThemeToggleButton className="h-11 w-11 rounded-full border border-border/70 bg-background/95 text-foreground shadow-[0_14px_34px_rgba(15,23,42,0.16)] backdrop-blur-md hover:bg-background dark:border-[#5f7aad]/35 dark:bg-[#07142b]/95 dark:text-white dark:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_30px_rgba(255,106,26,0.16)]" />
        <NotificationBell />
        <SignOutButton iconOnly />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-end px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:hidden">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "pointer-events-auto h-14 rounded-full border border-border/70 bg-background/95 px-2 pr-4 text-foreground shadow-[0_14px_32px_rgba(15,23,42,0.14)] backdrop-blur-md transition-all hover:bg-background dark:border-[#5f7aad]/35 dark:bg-[#07142b]/95 dark:text-white dark:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_30px_rgba(255,106,26,0.18)]",
                mobileMenuOpen && "border-primary/25 bg-primary text-primary-foreground hover:bg-primary",
              )}
              aria-label="Ouvrir le menu coursier"
              data-testid="courier-mobile-menu-trigger"
            >
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors dark:bg-gradient-to-br dark:from-[#ff6a1a] dark:to-[#ff9f1c] dark:shadow-[0_0_24px_rgba(255,106,26,0.46)]",
                  mobileMenuOpen && "bg-white/15 text-current shadow-none",
                )}
              >
                <Menu className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
                    mobileMenuOpen && "text-primary-foreground/75",
                  )}
                >
                  Livreur
                </span>
                <span className="max-w-[10rem] truncate text-sm font-semibold">
                  {activeNavItem?.label ?? "Ouvrir le menu"}
                </span>
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent className="flex h-full flex-col overflow-hidden p-0 dark:border-[#5f7aad]/30 dark:bg-[#010716]">
            <SheetHeader className="border-b px-6 pb-4 pr-14 pt-6">
              <SheetTitle>Espace Livreur</SheetTitle>
              <SheetDescription>
                Navigation rapide vers les missions, les gains et le profil coursier.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto overscroll-y-contain px-6 pb-6 pt-4">
              <nav className="flex flex-col gap-1 pb-4">
                <CourierNavContent
                  pathname={pathname}
                  visibleNavItems={visibleNavItems}
                  roles={roles}
                  role={role}
                  activeFeatures={activeFeatures}
                  unreadNotifications={unreadNotifications}
                  onSignOut={() => signOut()}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              </nav>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <CourierMissionDialog
        mission={missionPreview}
        open={missionDialogOpen}
        onOpenChange={setMissionDialogOpen}
        onAccept={missionPreview?.dispatchAttemptId
          ? () => respondMutation.mutate({ attemptId: missionPreview.dispatchAttemptId!, decision: "accept" })
          : undefined}
        onDecline={missionPreview?.dispatchAttemptId
          ? () => respondMutation.mutate({ attemptId: missionPreview.dispatchAttemptId!, decision: "decline" })
          : undefined}
        decisionPending={respondMutation.isPending}
      />
    </div>
  );
}

