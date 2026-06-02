import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Clock3, ExternalLink, MapPin, Package, Route, Store, Timer } from "lucide-react";
import { toast } from "sonner";

import CourierMissionDialog from "@/components/courier/CourierMissionDialog";
import DeliveryProofPanel from "@/components/courier/DeliveryProofPanel";
import CourierDashboardLayout from "@/components/CourierDashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCourierPresenceSync } from "@/hooks/useCourierPresenceSync";
import { useCourierProfile } from "@/hooks/useCourierProfile";
import {
  COURIER_JOB_STATUS_META,
  fetchCourierActiveJobs,
  fetchCourierOffers,
  fetchCourierRecentJobs,
  formatCurrency,
  getNextCourierJobAction,
  getOfferTimeLeftSeconds,
  respondToDispatchAttempt,
  updateCourierJobStatus,
  verifyCourierDelivery,
  type DeliveryVerificationPayload,
} from "@/lib/courier";
import {
  buildCourierMissionFromJob,
  buildCourierMissionFromOffer,
  type CourierMissionPreview,
} from "@/lib/courierMission";

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function mapsLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default function CourierJobs() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading: profileLoading } = useCourierProfile();
  const [clockTick, setClockTick] = useState(Date.now());
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<CourierMissionPreview | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: offers = [], isLoading: offersLoading } = useQuery({
    queryKey: ["courier-offers", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => fetchCourierOffers(profile!.id),
    refetchInterval: 10000,
  });

  const { data: activeJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["courier-active-jobs", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => fetchCourierActiveJobs(profile!.id),
    refetchInterval: 10000,
  });

  const { data: recentJobs = [] } = useQuery({
    queryKey: ["courier-recent-jobs", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => fetchCourierRecentJobs(profile!.id),
  });

  const activeJob = activeJobs[0] || null;

  useCourierPresenceSync({
    enabled: Boolean(profile?.is_online || activeJobs.length > 0),
    isOnline: Boolean(profile?.is_online),
    activeDispatchJobId: activeJob?.id || null,
  });

  const visibleOffers = useMemo(
    () => offers.filter((offer: any) => getOfferTimeLeftSeconds(offer.offered_at, offer.timeout_seconds, clockTick) > 0),
    [clockTick, offers],
  );

  const refreshCourierQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["courier-offers"] });
    queryClient.invalidateQueries({ queryKey: ["courier-active-jobs"] });
    queryClient.invalidateQueries({ queryKey: ["courier-recent-jobs"] });
    queryClient.invalidateQueries({ queryKey: ["courier-profile"] });
    queryClient.invalidateQueries({ queryKey: ["courier-earnings"] });
  };

  const openMissionDetails = (mission: CourierMissionPreview | null) => {
    if (!mission) return;
    setSelectedMission(mission);
    setMissionDialogOpen(true);
  };

  const respondMutation = useMutation({
    mutationFn: async ({ attemptId, decision }: { attemptId: string; decision: "accept" | "decline" }) =>
      respondToDispatchAttempt(attemptId, decision),
    onSuccess: (_, variables) => {
      toast.success(variables.decision === "accept" ? "Mission acceptée" : "Mission refusée");
      refreshCourierQueries();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Impossible de traiter la mission.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ dispatchJobId, status }: { dispatchJobId: string; status: string }) =>
      updateCourierJobStatus(dispatchJobId, status),
    onSuccess: (_, variables) => {
      const meta = COURIER_JOB_STATUS_META[variables.status];
      toast.success(meta?.label || "Mission mise à jour");
      refreshCourierQueries();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Impossible de mettre à jour la mission.");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ dispatchJobId, proof }: { dispatchJobId: string; proof: DeliveryVerificationPayload }) =>
      verifyCourierDelivery(dispatchJobId, proof),
    onSuccess: () => {
      toast.success("Livraison validée");
      refreshCourierQueries();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Impossible de vérifier la preuve client.");
    },
  });

  if (profileLoading || offersLoading || jobsLoading) {
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
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold">Missions</h1>
          <p className="text-sm text-muted-foreground">
            Offres en attente, livraisons actives et historique récent.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader>
              <CardTitle>Offres en attente</CardTitle>
              <CardDescription>
                {visibleOffers.length > 0
                  ? `${visibleOffers.length} proposition(s) a repondre rapidement.`
                  : "Aucune proposition active pour le moment."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {visibleOffers.length > 0 ? (
                visibleOffers.map((offer: any) => {
                  const secondsLeft = getOfferTimeLeftSeconds(offer.offered_at, offer.timeout_seconds);
                  const order = offer.dispatch_jobs?.orders;
                  const restaurant = order?.restaurants;
                  const orderMeta = order?.metadata || {};

                  return (
                    <div key={offer.id} className="rounded-2xl border p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-semibold">{restaurant?.name || "Restaurant"}</p>
                          <p className="text-xs text-muted-foreground">
                            Commande {order?.order_number || order?.id || offer.dispatch_job_id}
                          </p>
                        </div>
                        <Badge className="bg-amber-100 text-amber-700">
                          <Timer className="mr-1 h-3.5 w-3.5" />
                          {formatCountdown(secondsLeft)}
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <div className="rounded-xl bg-muted/40 p-3 text-sm">
                          <div className="mb-1 flex items-center gap-2 font-medium">
                            <Store className="h-4 w-4 text-muted-foreground" />
                            Retrait
                          </div>
                          <p className="text-muted-foreground">{restaurant?.address || "-"}</p>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-3 text-sm">
                          <div className="mb-1 flex items-center gap-2 font-medium">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            Livraison
                          </div>
                          <p className="text-muted-foreground">{order?.delivery_address || "-"}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-4 w-4" />
                          {(offer.distance_to_pickup_meters || 0) > 0
                            ? `${((offer.distance_to_pickup_meters || 0) / 1000).toFixed(1)} km`
                            : "Distance inconnue"}
                        </span>
                        {orderMeta?.delivery_window_label ? (
                          <span>Fenetre {String(orderMeta.delivery_window_label)}</span>
                        ) : null}
                        <span className="font-semibold text-foreground">
                          {formatCurrency(Number(offer.estimated_earnings || 0))}
                        </span>
                      </div>

                      <div className="mt-4 flex gap-3">
                        <Button
                          className="flex-1"
                          onClick={() => respondMutation.mutate({ attemptId: offer.id, decision: "accept" })}
                          disabled={respondMutation.isPending}
                        >
                          Accepter
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => respondMutation.mutate({ attemptId: offer.id, decision: "decline" })}
                          disabled={respondMutation.isPending}
                        >
                          Refuser
                        </Button>
                      </div>

                      <Button
                        variant="ghost"
                        className="mt-2 w-full"
                        onClick={() => openMissionDetails(buildCourierMissionFromOffer(offer))}
                      >
                        <Route className="mr-2 h-4 w-4" />
                        Voir le parcours
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                  Aucune course disponible. Passez en ligne et gardez votre position active pour recevoir des offres.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Missions actives</CardTitle>
              <CardDescription>
                {activeJobs.length > 0
                  ? `${activeJobs.length} mission(s) en cours.`
                  : "Aucune mission active pour l'instant."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeJobs.length > 0 ? (
                activeJobs.map((job: any) => {
                  const order = job.orders;
                  const restaurant = order?.restaurants;
                  const nextAction = getNextCourierJobAction(job.status);
                  const jobMeta = COURIER_JOB_STATUS_META[job.status] || COURIER_JOB_STATUS_META.pending;
                  const tracking = Array.isArray(order?.delivery_tracking) ? order.delivery_tracking[0] : null;
                  const orderMeta = order?.metadata || {};
                  const requiresProof = job.status === "arriving_dropoff";

                  return (
                    <div key={job.id} className="rounded-2xl border p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-semibold">{restaurant?.name || "Restaurant"}</p>
                          <p className="text-xs text-muted-foreground">
                            Commande {order?.order_number || order?.id || job.order_id}
                          </p>
                        </div>
                        <Badge className={jobMeta.tone}>{jobMeta.label}</Badge>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl bg-muted/40 p-3 text-sm">
                          <div className="mb-1 flex items-center gap-2 font-medium">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            Retrait
                          </div>
                          <p>{restaurant?.address || "-"}</p>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-3 text-sm">
                          <div className="mb-1 flex items-center gap-2 font-medium">
                            <Bike className="h-4 w-4 text-muted-foreground" />
                            Livraison
                          </div>
                          <p>{order?.delivery_address || "-"}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span>{formatCurrency(Number(job.earnings_base || 0) + Number(job.earnings_tip || 0) + Number(job.earnings_bonus || 0))}</span>
                        {orderMeta?.delivery_window_label ? (
                          <span>Fenetre {String(orderMeta.delivery_window_label)}</span>
                        ) : null}
                        {tracking?.estimated_arrival ? (
                          <span>ETA client: {new Date(tracking.estimated_arrival).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</span>
                        ) : null}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          variant="secondary"
                          onClick={() => openMissionDetails(buildCourierMissionFromJob(job))}
                        >
                          <Route className="mr-2 h-4 w-4" />
                          Details mission
                        </Button>
                        <Button asChild variant="outline">
                          <a href={mapsLink(restaurant?.address || "")} target="_blank" rel="noreferrer">
                            Retrait <ExternalLink className="ml-2 h-4 w-4" />
                          </a>
                        </Button>
                        <Button asChild variant="outline">
                          <a href={mapsLink(order?.delivery_address || "")} target="_blank" rel="noreferrer">
                            Livraison <ExternalLink className="ml-2 h-4 w-4" />
                          </a>
                        </Button>
                        {nextAction && !requiresProof ? (
                          <Button
                            onClick={() => statusMutation.mutate({ dispatchJobId: job.id, status: nextAction.nextStatus })}
                            disabled={statusMutation.isPending}
                          >
                            {nextAction.label}
                          </Button>
                        ) : null}
                      </div>

                      {requiresProof ? (
                        <DeliveryProofPanel
                          isLoading={verifyMutation.isPending}
                          onVerify={({ code, signatureDataUrl, verificationMethod }) =>
                            verifyMutation.mutate({
                              dispatchJobId: job.id,
                              proof: {
                                proofCode: code,
                                signatureDataUrl,
                                verificationMethod,
                              },
                            })}
                        />
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                  Les missions acceptées apparaitront ici avec le prochain statut a valider.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Historique récent</CardTitle>
            <CardDescription>Vos dernieres missions terminées ou annulées.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentJobs.length > 0 ? (
              recentJobs.map((job: any) => {
                const meta = COURIER_JOB_STATUS_META[job.status] || COURIER_JOB_STATUS_META.pending;
                const total = Number(job.earnings_base || 0) + Number(job.earnings_tip || 0) + Number(job.earnings_bonus || 0);
                return (
                  <div key={job.id} className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">{job.orders?.restaurants?.name || "Restaurant"}</p>
                      <p className="text-sm text-muted-foreground">
                        {job.orders?.order_number || job.order_id} · {new Date(job.updated_at).toLocaleString("fr-CH")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={meta.tone}>{meta.label}</Badge>
                      <span className="font-semibold">{formatCurrency(total)}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                Aucune mission terminée pour l'instant.
              </div>
            )}
          </CardContent>
        </Card>

        <CourierMissionDialog
          mission={selectedMission}
          open={missionDialogOpen}
          onOpenChange={setMissionDialogOpen}
          onAccept={selectedMission?.dispatchAttemptId
            ? () => respondMutation.mutate({ attemptId: selectedMission.dispatchAttemptId!, decision: "accept" })
            : undefined}
          onDecline={selectedMission?.dispatchAttemptId
            ? () => respondMutation.mutate({ attemptId: selectedMission.dispatchAttemptId!, decision: "decline" })
            : undefined}
          decisionPending={respondMutation.isPending}
        />
      </div>
    </CourierDashboardLayout>
  );
}
