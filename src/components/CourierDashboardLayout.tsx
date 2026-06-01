import { Link, useLocation } from "react-router-dom";
import { Bike, Coins, LayoutDashboard, LogOut, Shield, Store, UserRound } from "lucide-react";
import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import CourierMissionDialog from "@/components/courier/CourierMissionDialog";
import { useRealtimeNotifications, type RealtimeNotification } from "@/hooks/useRealtimeNotifications";
import { useAuth } from "@/lib/auth-context";
import { respondToDispatchAttempt } from "@/lib/courier";
import {
  buildCourierMissionFromNotification,
  type CourierMissionPreview,
} from "@/lib/courierMission";
import { useActiveFeatures } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/courier", label: "Vue d'ensemble", icon: LayoutDashboard, feature: "courier-home" },
  { to: "/courier/jobs", label: "Missions", icon: Bike, feature: "courier-jobs" },
  { to: "/courier/earnings", label: "Gains", icon: Coins, feature: "courier-earnings" },
  { to: "/courier/profile", label: "Profil", icon: UserRound, feature: "courier-profile" },
];

export default function CourierDashboardLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { signOut, roles, isSuperAdmin } = useAuth();
  const activeFeatures = useActiveFeatures();
  const queryClient = useQueryClient();
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [missionPreview, setMissionPreview] = useState<CourierMissionPreview | null>(null);
  const visibleNavItems = NAV_ITEMS.filter((item) => activeFeatures.has(item.feature));

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
      <div className="container flex flex-col gap-6 px-3 py-6 sm:px-4 sm:py-8 md:flex-row md:gap-8">
        <aside className="w-full shrink-0 md:w-72">
          <div className="sticky top-24 flex flex-col gap-2 rounded-2xl border bg-card p-4">
            <div className="px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">Operations</p>
              <h2 className="font-display text-lg font-semibold">Espace Livreur</h2>
            </div>

            {visibleNavItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  pathname === item.to
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}

            {isSuperAdmin ? (
              <div className="mt-3 space-y-1 border-t pt-3">
                {roles.includes("restaurateur") && activeFeatures.has("dashboard-restaurateur") ? (
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <Store className="h-4 w-4" />
                    Espace Restaurateur
                  </Link>
                ) : null}
                {roles.includes("admin") ? (
                  <Link
                    to="/admin"
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <Shield className="h-4 w-4" />
                    Administration
                  </Link>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 border-t pt-3">
              <button
                onClick={() => signOut()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Deconnexion
              </button>
            </div>
          </div>
        </aside>

        <main className="min-h-[500px] flex-1 overflow-x-hidden rounded-2xl border bg-card p-4 sm:p-6 md:p-8">
          {children}
        </main>
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

