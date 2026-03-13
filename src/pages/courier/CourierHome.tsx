import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bike, Coins, Clock3, MapPin, Navigation, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import CourierDashboardLayout from "@/components/CourierDashboardLayout";
import CourierPushStatusCard from "@/components/courier/CourierPushStatusCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import {
  COURIER_ACTIVE_JOB_STATUSES,
  COURIER_APPROVAL_STATUS_META,
  fetchCourierActiveJobs,
  fetchCourierEarnings,
  fetchCourierOffers,
  formatCourierName,
  formatCurrency,
  syncCourierPresence,
} from "@/lib/courier";
import { useCourierProfile } from "@/hooks/useCourierProfile";
import { useCourierPushStatus } from "@/hooks/useCourierPushStatus";
import { useCourierPresenceSync } from "@/hooks/useCourierPresenceSync";

export default function CourierHome() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isToggling, setIsToggling] = useState(false);

  const { data: profile, isLoading: profileLoading } = useCourierProfile();
  const { data: pushStatus, enable: enablePushAlerts } = useCourierPushStatus();

  const { data: offers = [] } = useQuery({
    queryKey: ["courier-offers-home", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => fetchCourierOffers(profile!.id),
    refetchInterval: 15000,
  });

  const { data: activeJobs = [] } = useQuery({
    queryKey: ["courier-active-jobs-home", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => fetchCourierActiveJobs(profile!.id),
    refetchInterval: 10000,
  });

  const { data: earnings = [] } = useQuery({
    queryKey: ["courier-earnings-home", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => fetchCourierEarnings(profile!.id),
  });

  const activeJob = activeJobs[0] || null;

  const { position, locationError, isWatching } = useCourierPresenceSync({
    enabled: Boolean(profile?.is_online || activeJobs.some((job) => COURIER_ACTIVE_JOB_STATUSES.includes(job.status))),
    isOnline: Boolean(profile?.is_online),
    activeDispatchJobId: activeJob?.id || null,
  });

  const metrics = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

    const todayEarnings = earnings
      .filter((entry: any) => String(entry.created_at || "").slice(0, 10) === todayKey)
      .reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0);

    const weekEarnings = earnings
      .filter((entry: any) => Date.parse(entry.created_at) >= weekStart.getTime())
      .reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0);

    return {
      todayEarnings,
      weekEarnings,
      activeJobs: activeJobs.length,
      pendingOffers: offers.length,
    };
  }, [activeJobs.length, earnings, offers.length]);

  const onlineMutation = useMutation({
    mutationFn: async (nextOnline: boolean) => {
      if (nextOnline) {
        if (!("geolocation" in navigator)) {
          throw new Error("La geolocalisation est necessaire pour passer en ligne.");
        }

        const coords = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        });

        return syncCourierPresence({
          isOnline: true,
          lat: coords.coords.latitude,
          lng: coords.coords.longitude,
          heading: coords.coords.heading,
          speed: coords.coords.speed,
          accuracy: coords.coords.accuracy,
          activeDispatchJobId: activeJob?.id || null,
        });
      }

      return syncCourierPresence({
        isOnline: false,
        activeDispatchJobId: activeJob?.id || null,
      });
    },
    onSuccess: (_, nextOnline) => {
      toast.success(nextOnline ? "Statut en ligne active" : "Statut hors ligne active");
      queryClient.invalidateQueries({ queryKey: ["courier-profile", user?.id] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Impossible de mettre a jour le statut.");
    },
    onSettled: () => {
      setIsToggling(false);
    },
  });

  const handleToggleOnline = async () => {
    if (!profile) return;
    if (!profile.is_online && ["suspended", "rejected"].includes(String(profile.status || ""))) {
      toast.error("Le compte coursier ne peut pas passer en ligne dans son etat actuel.");
      return;
    }

    if (!profile.is_online && !pushStatus?.enabled) {
      const pushResult = await enablePushAlerts();
      if (pushResult.ok) {
        toast.success("Alertes push actives pour les nouvelles missions");
      } else {
        toast("Alertes push indisponibles", {
          description: `${pushResult.reason || "Activation impossible."} Les offres resteront visibles en temps reel si l'app reste ouverte.`,
        });
      }
    }

    setIsToggling(true);
    onlineMutation.mutate(!profile.is_online);
  };

  const approvalMeta = COURIER_APPROVAL_STATUS_META[profile?.status || "pending_approval"];

  if (profileLoading) {
    return (
      <CourierDashboardLayout>
        <div className="space-y-4">
          {[1, 2, 3].map((value) => (
            <div key={value} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </CourierDashboardLayout>
    );
  }

  return (
    <CourierDashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl font-bold">Vue d'ensemble</h1>
              <Badge className={approvalMeta?.tone}>{approvalMeta?.label || profile?.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatCourierName(profile)} · {user?.email}
            </p>
          </div>

          <Button
            onClick={handleToggleOnline}
            disabled={isToggling || onlineMutation.isPending}
            variant={profile?.is_online ? "destructive" : "default"}
            className="min-w-44"
          >
            {profile?.is_online ? "Passer hors ligne" : "Passer en ligne"}
          </Button>
        </div>

        {profile?.status !== "approved" ? (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="font-semibold">Profil en attente de validation</p>
                <p className="text-sm text-muted-foreground">
                  Completez votre profil coursier pour accelerer l'approbation et la mise en ligne.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/courier/profile">Completer mon profil</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {(profile?.is_online || activeJob) ? (
          <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
            <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                  <Navigation className="h-4 w-4" />
                  Presence synchronisee
                </p>
                <p className="text-sm text-muted-foreground">
                  {position
                    ? `Position ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`
                    : "En attente d'une position GPS"}
                  {isWatching ? " · suivi actif" : ""}
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                {locationError ? (
                  <span className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {locationError}
                  </span>
                ) : (
                  <span>Les missions seront geolocalisees en temps reel.</span>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Gains du jour</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Coins className="h-5 w-5 text-primary" />
                {formatCurrency(metrics.todayEarnings)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Gains cette semaine</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(metrics.weekEarnings)}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Missions actives</CardDescription>
              <CardTitle className="text-2xl">{metrics.activeJobs}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Offres en attente</CardDescription>
              <CardTitle className="text-2xl">{metrics.pendingOffers}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Mission prioritaire</CardTitle>
              <CardDescription>
                {activeJob ? "Votre mission en cours." : "Aucune mission active pour le moment."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeJob ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold">
                        {(activeJob.orders as any)?.restaurants?.name || "Restaurant"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Commande {(activeJob.orders as any)?.order_number || activeJob.order_id}
                      </p>
                    </div>
                    <Badge className="bg-primary/10 text-primary">{activeJob.status}</Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border p-3">
                      <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        Retrait
                      </p>
                      <p className="text-sm font-medium">{(activeJob.orders as any)?.restaurants?.address || "-"}</p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <Bike className="h-3.5 w-3.5" />
                        Livraison
                      </p>
                      <p className="text-sm font-medium">{(activeJob.orders as any)?.delivery_address || "-"}</p>
                    </div>
                  </div>
                  <Button asChild>
                    <Link to="/courier/jobs">Ouvrir la mission</Link>
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                  Passez en ligne pour recevoir des propositions de livraison autour de votre position.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <CourierPushStatusCard />

            <Card>
              <CardHeader>
                <CardTitle>Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    Taux d'acceptation
                  </div>
                  <span className="font-semibold">{Number(profile?.acceptance_rate || 0).toFixed(0)}%</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                    Temps moyen
                  </div>
                  <span className="font-semibold">{profile?.avg_delivery_time_min || 0} min</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Bike className="h-4 w-4 text-muted-foreground" />
                    Livraisons totales
                  </div>
                  <span className="font-semibold">{profile?.total_deliveries || 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actions rapides</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Button asChild variant="outline">
                  <Link to="/courier/jobs">Voir mes missions</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/courier/earnings">Consulter mes gains</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/courier/profile">Mettre a jour mon profil</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </CourierDashboardLayout>
  );
}
