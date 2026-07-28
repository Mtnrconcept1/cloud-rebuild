import { useMemo, useState, type ReactNode } from "react";
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellRing, Bike, Coins, Clock3, MapPin, Navigation, ShieldCheck, Smartphone } from "lucide-react";
import { getCurrentPosition } from "@/lib/geolocation-native";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import CourierDashboardLayout from "@/components/CourierDashboardLayout";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import CourierPushStatusCard from "@/components/courier/CourierPushStatusCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
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
import type { CommercialDemoSnapshot } from "@/lib/commercialDemoJourney";

type CourierEarningRow = {
  created_at: string;
  amount: number | null;
};

type CourierActiveJobOrder = {
  order_number?: string | null;
  delivery_address?: string | null;
  restaurants?: {
    name?: string | null;
    address?: string | null;
  } | null;
};

type CourierHomeMission = {
  id: string;
  status: string;
  orderNumber: string;
  restaurantName: string;
  pickupAddress: string;
  deliveryAddress: string;
};

type CourierHomeViewModel = {
  courierName: string;
  identityDetail: string;
  approvalLabel: string;
  approvalTone: string;
  isApproved: boolean;
  isOnline: boolean;
  positionLabel: string | null;
  isWatching: boolean;
  locationError: string | null;
  metrics: {
    todayEarnings: number;
    weekEarnings: number;
    activeJobs: number;
    pendingOffers: number;
  };
  activeJob: CourierHomeMission | null;
  acceptanceRate: number;
  averageDeliveryMinutes: number;
  totalDeliveries: number;
};

type CourierHomePresentationProps = {
  viewModel: CourierHomeViewModel;
  onToggleOnline: () => void;
  isToggling: boolean;
  pushStatusCard: ReactNode;
  demo?: boolean;
};

function DemoCourierPushStatusCard() {
  return (
    <Card data-testid="commercial-demo-courier-push-status">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" />
          Alertes livreur
        </CardTitle>
        <CardDescription>
          Recevez immédiatement les nouvelles missions et les mises à jour importantes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-xl border p-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Notifications de livraison</p>
              <p className="text-xs text-muted-foreground">Synchronisation temps réel active</p>
            </div>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700">Actives</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function CourierHomePresentation({
  viewModel,
  onToggleOnline,
  isToggling,
  pushStatusCard,
  demo = false,
}: CourierHomePresentationProps) {
  const activeJob = viewModel.activeJob;

  return (
    <CourierDashboardLayout>
      <div className="space-y-6" data-testid={demo ? "commercial-demo-courier-home" : "courier-home"}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl font-bold">Vue d'ensemble</h1>
              <Badge className={viewModel.approvalTone}>{viewModel.approvalLabel}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {viewModel.courierName} · {viewModel.identityDetail}
            </p>
          </div>

          <Button
            onClick={onToggleOnline}
            disabled={isToggling}
            variant={viewModel.isOnline ? "destructive" : "default"}
            className="min-w-44"
          >
            {viewModel.isOnline ? "Passer hors ligne" : "Passer en ligne"}
          </Button>
        </div>

        {!viewModel.isApproved ? (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="font-semibold">Profil en attente de validation</p>
                <p className="text-sm text-muted-foreground">
                  Completez votre profil et vos documents pour accelerer l'approbation avant la mise en ligne.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/courier/profile">Completer mon profil</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {(viewModel.isOnline || activeJob) ? (
          <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
            <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                  <Navigation className="h-4 w-4" />
                  Présence synchronisée
                </p>
                <p className="text-sm text-muted-foreground">
                  {viewModel.positionLabel || "En attente d'une position GPS"}
                  {viewModel.isWatching ? " · suivi actif" : ""}
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                {viewModel.locationError ? (
                  <span className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {viewModel.locationError}
                  </span>
                ) : (
                  <span>Les missions seront geolocalisees en temps réel.</span>
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
                {formatCurrency(viewModel.metrics.todayEarnings)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Gains cette semaine</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(viewModel.metrics.weekEarnings)}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Missions actives</CardDescription>
              <CardTitle className="text-2xl">{viewModel.metrics.activeJobs}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Offres en attente</CardDescription>
              <CardTitle className="text-2xl">{viewModel.metrics.pendingOffers}</CardTitle>
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
                      <p className="text-lg font-semibold">{activeJob.restaurantName}</p>
                      <p className="text-sm text-muted-foreground">Commande {activeJob.orderNumber}</p>
                    </div>
                    <Badge className="bg-primary/10 text-primary">{activeJob.status}</Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border p-3">
                      <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        Retrait
                      </p>
                      <p className="text-sm font-medium">{activeJob.pickupAddress}</p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <Bike className="h-3.5 w-3.5" />
                        Livraison
                      </p>
                      <p className="text-sm font-medium">{activeJob.deliveryAddress}</p>
                    </div>
                  </div>
                  <Button asChild>
                    <Link to="/courier/jobs">Ouvrir la mission</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid min-h-44 grid-cols-1 items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 p-5 text-sm text-muted-foreground dark:border-orange-400/20 dark:bg-orange-500/5 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <div>
                    <p className="font-semibold text-foreground">Prêt pour la prochaine mission</p>
                    <p className="mt-2 leading-6">Passez en ligne pour recevoir des propositions de livraison autour de votre position.</p>
                  </div>
                  <img
                    src={DASHBOARD_ILLUSTRATIONS.courierEmpty.src}
                    alt={DASHBOARD_ILLUSTRATIONS.courierEmpty.alt}
                    width={DASHBOARD_ILLUSTRATIONS.courierEmpty.width}
                    height={DASHBOARD_ILLUSTRATIONS.courierEmpty.height}
                    loading="lazy"
                    decoding="async"
                    className="mx-auto h-auto max-h-32 w-full max-w-40 object-contain drop-shadow-[0_18px_22px_rgba(194,78,24,0.18)] sm:max-h-36 sm:max-w-none"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {pushStatusCard}

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
                  <span className="font-semibold">{viewModel.acceptanceRate.toFixed(0)}%</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                    Temps moyen
                  </div>
                  <span className="font-semibold">{viewModel.averageDeliveryMinutes} min</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Bike className="h-4 w-4 text-muted-foreground" />
                    Livraisons totales
                  </div>
                  <span className="font-semibold">{viewModel.totalDeliveries}</span>
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
                  <Link to="/courier/profile">Mettre à jour mon profil</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </CourierDashboardLayout>
  );
}

function buildCommercialDemoCourierHomeViewModel(
  snapshot: CommercialDemoSnapshot,
  isOnline: boolean,
): CourierHomeViewModel {
  const { session, order, mission, events, allowed_actions: allowedActions } = snapshot;
  const delivered = order?.status === "delivered" || mission?.status === "delivered";
  const hasPendingOffer = allowedActions.includes("courier_accept");
  const hasActiveMission = Boolean(mission && !delivered && !hasPendingOffer);
  const courierAccepted = events.some((event) => event.event_type === "courier_accepted");

  return {
    courierName: mission?.courier_name || "Alex · Livreur démo",
    identityDetail: `Session ${session.id.slice(0, 8)}`,
    approvalLabel: "Approuvé",
    approvalTone: "bg-emerald-100 text-emerald-700",
    isApproved: true,
    isOnline,
    positionLabel: "Zone Genève centre · session isolée",
    isWatching: isOnline,
    locationError: null,
    metrics: {
      todayEarnings: delivered ? 8.5 : 0,
      weekEarnings: delivered ? 42.5 : 34,
      activeJobs: hasActiveMission ? 1 : 0,
      pendingOffers: hasPendingOffer ? 1 : 0,
    },
    activeJob: hasActiveMission && mission
      ? {
          id: mission.id,
          status: mission.status,
          orderNumber: order?.order_number || session.id.slice(0, 8).toUpperCase(),
          restaurantName: "Restaurant Démo TOK",
          pickupAddress: "Restaurant de démonstration · Genève",
          deliveryAddress: order?.delivery_address || "Adresse de démonstration",
        }
      : null,
    acceptanceRate: courierAccepted ? 100 : 96,
    averageDeliveryMinutes: 18,
    totalDeliveries: delivered ? 5 : 4,
  };
}

function CommercialDemoCourierHome({ snapshot }: { snapshot: CommercialDemoSnapshot }) {
  const [isOnline, setIsOnline] = useState(true);
  const viewModel = useMemo(
    () => buildCommercialDemoCourierHomeViewModel(snapshot, isOnline),
    [isOnline, snapshot],
  );

  return (
    <CourierHomePresentation
      demo
      viewModel={viewModel}
      isToggling={false}
      onToggleOnline={() => setIsOnline((current) => !current)}
      pushStatusCard={<DemoCourierPushStatusCard />}
    />
  );
}

function LiveCourierHome() {
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
  const earningRows = earnings as CourierEarningRow[];
  const activeOrder = (activeJob?.orders || null) as CourierActiveJobOrder | null;

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

    const todayEarnings = earningRows
      .filter((entry) => String(entry.created_at || "").slice(0, 10) === todayKey)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    const weekEarnings = earningRows
      .filter((entry) => Date.parse(entry.created_at) >= weekStart.getTime())
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    return {
      todayEarnings,
      weekEarnings,
      activeJobs: activeJobs.length,
      pendingOffers: offers.length,
    };
  }, [activeJobs.length, earningRows, offers.length]);

  const onlineMutation = useMutation({
    mutationFn: async (nextOnline: boolean) => {
      if (nextOnline) {
        const coords = await getCurrentPosition();

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
      toast.error(error instanceof Error ? error.message : "Impossible de mettre à jour le statut.");
    },
    onSettled: () => {
      setIsToggling(false);
    },
  });

  const handleToggleOnline = async () => {
    if (!profile) return;
    if (!profile.is_online && String(profile.status || "") !== "approved") {
      toast.error("Le compte coursier doit être approuvé avant de passer en ligne.");
      return;
    }

    if (!profile.is_online && !pushStatus?.enabled) {
      const pushResult = await enablePushAlerts();
      if (pushResult.ok) {
        toast.success("Alertes push actives pour les nouvelles missions");
      } else {
        toast("Alertes push indisponibles", {
          description: `${pushResult.reason || "Activation impossible."} Les offres resteront visibles en temps réel si l'app reste ouverte.`,
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

  const viewModel: CourierHomeViewModel = {
    courierName: formatCourierName(profile),
    identityDetail: user?.email || "Compte livreur",
    approvalLabel: approvalMeta?.label || profile?.status || "En attente",
    approvalTone: approvalMeta?.tone || "",
    isApproved: profile?.status === "approved",
    isOnline: Boolean(profile?.is_online),
    positionLabel: position
      ? `Position ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`
      : null,
    isWatching,
    locationError,
    metrics,
    activeJob: activeJob
      ? {
          id: activeJob.id,
          status: activeJob.status,
          orderNumber: activeOrder?.order_number || activeJob.order_id,
          restaurantName: activeOrder?.restaurants?.name || "Restaurant",
          pickupAddress: activeOrder?.restaurants?.address || "-",
          deliveryAddress: activeOrder?.delivery_address || "-",
        }
      : null,
    acceptanceRate: Number(profile?.acceptance_rate || 0),
    averageDeliveryMinutes: Number(profile?.avg_delivery_time_min || 0),
    totalDeliveries: Number(profile?.total_deliveries || 0),
  };

  return (
    <CourierHomePresentation
      viewModel={viewModel}
      isToggling={isToggling || onlineMutation.isPending}
      onToggleOnline={() => {
        void handleToggleOnline();
      }}
      pushStatusCard={<CourierPushStatusCard />}
    />
  );
}


export default function CourierHome() {
  const commercialDemoFrame = useCommercialDemoFrame();
  if (commercialDemoFrame?.surface === "courier") {
    return <CommercialDemoCourierHome snapshot={commercialDemoFrame.snapshot} />;
  }
  return <LiveCourierHome />;
}
