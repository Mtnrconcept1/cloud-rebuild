import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import {
  CalendarDays, Clock, Users, MapPin, Utensils, ChefHat,
  Zap, Timer, AlertTriangle, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";

interface PreorderItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface ReservationDetail {
  id: string;
  date: string;
  time: string;
  party_size: number;
  status: string;
  feature: string;
  notes: string | null;
  total_amount: number;
  created_at: string;
  metadata: Json;
  preorder_items: Json;
  restaurant_name: string;
}

interface Props {
  reservation: ReservationDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isJsonRecord = (v: Json): v is Record<string, Json> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const getFeatureLabel = (feature: string) => {
  switch (feature) {
    case "zero-attente": return { label: "Zéro Attente", icon: Timer, color: "text-indigo-600 bg-indigo-50 border-indigo-200" };
    case "chefs_table": return { label: "Chef's Table", icon: ChefHat, color: "text-amber-600 bg-amber-50 border-amber-200" };
    case "promo-formule": return { label: "Formule promo", icon: Utensils, color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
    default: return { label: "Classique", icon: Utensils, color: "text-primary bg-primary/5 border-primary/20" };
  }
};

const canCancel = (reservation: ReservationDetail) => {
  if (reservation.status === "cancelled" || reservation.status === "no_show") return false;
  const reservationDateTime = new Date(`${reservation.date}T${reservation.time}`);
  const now = new Date();
  const hoursUntil = (reservationDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursUntil >= 2;
};

export default function ReservationDetailModal({ reservation, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!reservation) return null;

  const featureInfo = getFeatureLabel(reservation.feature);
  const FeatureIcon = featureInfo.icon;

  const preorderItems: PreorderItem[] = (() => {
    if (Array.isArray(reservation.preorder_items)) {
      return reservation.preorder_items.filter(
        (item): item is Record<string, Json> => isJsonRecord(item)
      ).map((item) => ({
        name: String(item.name || item.dish || ""),
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || item.price || 0),
        total_price: Number(item.total_price || 0),
      }));
    }
    if (isJsonRecord(reservation.metadata)) {
      const metaItems = reservation.metadata.preorder_items || reservation.metadata.drops;
      if (Array.isArray(metaItems)) {
        return metaItems.filter(
          (item): item is Record<string, Json> => isJsonRecord(item)
        ).map((item) => ({
          name: String(item.name || item.dish || ""),
          quantity: Number(item.quantity || 1),
          unit_price: Number(item.unit_price || item.price || 0),
          total_price: Number(item.total_price || Number(item.price || 0) * Number(item.quantity || 1)),
        }));
      }
    }
    return [];
  })();

  const promoInfo = (() => {
    if (!isJsonRecord(reservation.metadata)) return null;
    if (reservation.metadata.promo_discount_percent) {
      return { discount: Number(reservation.metadata.promo_discount_percent) };
    }
    return null;
  })();

  const dateFormatted = new Date(reservation.date).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const createdFormatted = new Date(reservation.created_at).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const isCancellable = canCancel(reservation);

  const handleCancel = async () => {
    setCancelling(true);
    const { error } = await (supabase.rpc as any)("cancel_reservation", {
      p_reservation_id: reservation.id,
    });
    setCancelling(false);
    if (error) {
      toast({ title: "Impossible d'annuler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Réservation annulée", description: "Votre réservation a bien été annulée." });
      queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
      setConfirmCancel(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setConfirmCancel(false); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CalendarDays className="h-5 w-5 text-primary" />
            Détail de la réservation
          </DialogTitle>
          <DialogDescription>
            Réservation chez {reservation.restaurant_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status + Feature */}
          <div className="flex items-center justify-between">
            <OrderStatusBadge status={reservation.status} />
            <Badge variant="outline" className={`gap-1 text-xs ${featureInfo.color}`}>
              <FeatureIcon className="h-3 w-3" />
              {featureInfo.label}
            </Badge>
          </div>

          {/* Main info */}
          <div className="rounded-xl border bg-secondary/30 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-semibold">{reservation.restaurant_name}</span>
            </div>
            <div className="flex items-center gap-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm capitalize">{dateFormatted}</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{reservation.time}</span>
            </div>
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{reservation.party_size} personne{reservation.party_size > 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Promo */}
          {promoInfo && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2 text-sm text-emerald-700">
              <Utensils className="h-4 w-4" />
              <span>Formule avec <strong>-{promoInfo.discount}%</strong> de réduction</span>
            </div>
          )}

          {/* Preorder items */}
          {preorderItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Utensils className="h-4 w-4 text-muted-foreground" />
                Plats précommandés
              </h4>
              <div className="rounded-xl border divide-y">
                {preorderItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground bg-secondary rounded-md px-1.5 py-0.5">
                        x{item.quantity}
                      </span>
                      <span>{item.name}</span>
                    </div>
                    <span className="font-medium">{item.total_price.toFixed(2)} CHF</span>
                  </div>
                ))}
              </div>
              {reservation.total_amount > 0 && (
                <div className="flex justify-between font-bold text-sm px-1 pt-1">
                  <span>Total</span>
                  <span>{Number(reservation.total_amount).toFixed(2)} CHF</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {reservation.notes && (
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-muted-foreground">Notes</h4>
              <p className="text-sm bg-secondary/50 rounded-lg p-3">{reservation.notes}</p>
            </div>
          )}

          {/* Created at */}
          <p className="text-xs text-muted-foreground">
            Réservée le {createdFormatted}
          </p>
        </div>

        {/* Cancel section */}
        {isCancellable && (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {!confirmCancel ? (
              <Button
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => setConfirmCancel(true)}
              >
                <X className="h-4 w-4 mr-2" />
                Annuler cette réservation
              </Button>
            ) : (
              <div className="w-full rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">Confirmer l'annulation ?</p>
                    <p className="text-xs text-muted-foreground">Cette action est irréversible.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setConfirmCancel(false)}
                  >
                    Non, garder
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={handleCancel}
                    disabled={cancelling}
                  >
                    {cancelling ? "Annulation..." : "Oui, annuler"}
                  </Button>
                </div>
              </div>
            )}
          </DialogFooter>
        )}

        {reservation.status === "cancelled" && (
          <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 text-sm text-destructive flex items-center gap-2">
            <X className="h-4 w-4" />
            Cette réservation a été annulée.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
