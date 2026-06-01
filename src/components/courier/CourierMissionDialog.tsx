import { Link } from "react-router-dom";
import { Clock3, MapPin, Package, Route, Store, Wallet } from "lucide-react";

import DeliveryMap from "@/components/DeliveryMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CourierMissionPreview } from "@/lib/courierMission";
import { formatCurrency } from "@/lib/courier";

interface CourierMissionDialogProps {
  mission: CourierMissionPreview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept?: () => void;
  onDecline?: () => void;
  decisionPending?: boolean;
}

export default function CourierMissionDialog({
  mission,
  open,
  onOpenChange,
  onAccept,
  onDecline,
  decisionPending = false,
}: CourierMissionDialogProps) {
  const geoSteps = mission?.routeSteps.filter(
    (step) => step.latitude !== null && step.longitude !== null,
  ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-4xl">
        {mission ? (
          <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-5 p-6">
              <DialogHeader className="space-y-2 text-left">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary">Nouvelle mission</Badge>
                  {mission.multiRestaurant ? (
                    <Badge variant="outline">Multi-resto</Badge>
                  ) : null}
                </div>
                <DialogTitle className="font-display text-2xl">
                  {mission.restaurantName || "Mission livraison"}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {mission.orderNumber ? `Commande ${mission.orderNumber}` : "Mission en attente de réponse"}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wallet className="h-4 w-4 text-primary" />
                    Gain estimé
                  </div>
                  <p className="mt-2 text-lg font-semibold">
                    {formatCurrency(Number(mission.estimatedEarnings || 0))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mission.distanceKm ? `${mission.distanceKm.toFixed(1)} km jusqu’au premier retrait` : "Distance calculee au dispatch"}
                  </p>
                </div>

                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock3 className="h-4 w-4 text-primary" />
                    Fenetre
                  </div>
                  <p className="mt-2 text-lg font-semibold">
                    {mission.scheduledDeliveryLabel || mission.deliveryWindowLabel || "Dès que possible"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mission.totalAmount ? `${formatCurrency(Number(mission.totalAmount))} de commande` : "Montant client disponible dans la mission"}
                  </p>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Package className="h-4 w-4 text-primary" />
                  Détails de livraison
                </div>
                {mission.itemsSummary ? (
                  <p className="text-sm text-foreground">{mission.itemsSummary}</p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-muted/40 p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2 font-medium">
                      <Store className="h-4 w-4 text-muted-foreground" />
                      Retraits
                    </div>
                    <p className="text-muted-foreground">
                      {mission.routeSteps.filter((step) => step.type === "pickup").length} étape(s)
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2 font-medium">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      Adresse client
                    </div>
                    <p className="text-muted-foreground">{mission.deliveryAddress || "-"}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Route className="h-4 w-4 text-primary" />
                  Parcours
                </div>
                <div className="space-y-2">
                  {mission.routeSteps.map((step) => (
                    <div key={step.id} className="flex gap-3 rounded-2xl border p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {step.stepIndex}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{step.label}</p>
                        {step.restaurantName ? (
                          <p className="text-xs text-muted-foreground">{step.restaurantName}</p>
                        ) : null}
                        <p className="text-sm text-muted-foreground">{step.address || "-"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-l bg-muted/20 p-6">
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold">Carte de mission</h3>
                  <p className="text-sm text-muted-foreground">
                    Le parcours affiche les retraits puis la livraison finale.
                  </p>
                </div>
                {geoSteps.length >= 2 ? (
                  <DeliveryMap routeStops={geoSteps} className="h-[280px] md:h-[420px]" />
                ) : (
                  <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed bg-card px-6 text-center text-sm text-muted-foreground">
                    Coordonnées insuffisantes pour afficher le parcours. Le détail de la mission reste disponible ci-contre.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-3 border-t p-6 sm:justify-between sm:space-x-0">
          <Button asChild variant="outline">
            <Link to="/courier/jobs">Voir les missions</Link>
          </Button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            {onDecline ? (
              <Button variant="outline" onClick={onDecline} disabled={decisionPending}>
                Refuser
              </Button>
            ) : null}
            {onAccept ? (
              <Button onClick={onAccept} disabled={decisionPending}>
                Accepter
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
