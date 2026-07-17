import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  ChefHat,
  Clock,
  CreditCard,
  Crown,
  MapPin,
  Receipt,
  Smartphone,
  Timer,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { dispatchQueuedNotifications } from "@/lib/notificationDispatch";
import { cancelReservationByCustomer } from "@/lib/reservationMutations";
import { parseBusinessDateTime } from "@/lib/businessTime";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

interface PreorderItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface ReservationDetail {
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
  progressive_offer_id?: string | null;
  progressive_offer_discount_percent?: number | null;
  progressive_offer_discount_status?: string | null;
  payment_method?: string | null;
  refund_status?: string | null;
  refunded_amount_chf?: number | null;
  reservation_time?: string | null;
}

interface Props {
  reservation: ReservationDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isJsonRecord = (value: Json): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const formatCardBrand = (brand: string | null) => {
  if (!brand) return "";
  return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
};

const readString = (...values: Array<Json | undefined>) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const getFeatureLabel = (feature: string) => {
  switch (feature) {
    case "zero-attente":
      return { label: "Zéro Attente", icon: Timer, color: "text-indigo-600 bg-indigo-50 border-indigo-200" };
    case "chefs_table":
      return { label: "La Table du Chef", icon: ChefHat, color: "text-amber-600 bg-amber-50 border-amber-200" };
    case "promo-formule":
      return { label: "Formule promo", icon: Utensils, color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
    case "promo-offre":
      return { label: "Offre promo", icon: Utensils, color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
    case "promo-progressive":
      return { label: "Offre progressive", icon: Timer, color: "text-orange-600 bg-orange-50 border-orange-200" };
    default:
      return { label: "Classique", icon: Utensils, color: "text-primary bg-primary/5 border-primary/20" };
  }
};

const canCancel = (reservation: ReservationDetail) => {
  if (reservation.status === "cancelled" || reservation.status === "no_show") return false;

  let effectiveTime = reservation.time;
  if (reservation.feature === "zero-attente" && isJsonRecord(reservation.metadata)) {
    const arrivalTime = reservation.metadata.arrival_time ?? reservation.metadata.arrivalTime;
    if (typeof arrivalTime === "string" && arrivalTime) effectiveTime = arrivalTime;
  }

  const reservationDateTime = reservation.reservation_time
    ? new Date(reservation.reservation_time)
    : parseBusinessDateTime(reservation.date, effectiveTime);
  if (!reservationDateTime || !Number.isFinite(reservationDateTime.getTime())) return false;
  const hoursUntil = (reservationDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
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

  const displayTime = (() => {
    if (reservation.feature !== "zero-attente") return reservation.time;
    if (!isJsonRecord(reservation.metadata)) return reservation.time;
    const arrivalTime = reservation.metadata.arrival_time ?? reservation.metadata.arrivalTime;
    return typeof arrivalTime === "string" && arrivalTime ? arrivalTime : reservation.time;
  })();

  const preorderItems: PreorderItem[] = (() => {
    const fromColumn = Array.isArray(reservation.preorder_items) ? reservation.preorder_items : [];
    const fromMetadata = isJsonRecord(reservation.metadata)
      ? (reservation.metadata.preorder_items || reservation.metadata.drops)
      : [];
    const itemsToProcess = fromColumn.length > 0 ? fromColumn : (Array.isArray(fromMetadata) ? fromMetadata : []);

    return itemsToProcess
      .filter((item): item is Record<string, Json> => isJsonRecord(item))
      .map((item) => ({
        name: String(item.name || item.dish || ""),
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || item.price || 0),
        total_price: Number(
          item.total_price || (Number(item.price || 0) * Number(item.quantity || 1)) || 0,
        ),
      }));
  })();

  const promoInfo = (() => {
    if (!isJsonRecord(reservation.metadata)) return null;

    const progressiveDiscountPercent = Number(
      reservation.progressive_offer_discount_percent
      || reservation.metadata.progressive_offer_discount_percent
      || 0,
    );
    const progressiveName = readString(
      reservation.metadata.progressive_offer_name,
      reservation.metadata.progressive_offer_title,
    );
    const progressiveStatus = readString(
      reservation.progressive_offer_discount_status || undefined,
      reservation.metadata.progressive_offer_discount_status,
    );
    const formulaDiscountPercent = Number(reservation.metadata.formula_discount_percent || 0);
    const formulaDiscountAmount = Number(reservation.metadata.formula_discount_amount || 0);
    const formulaName = reservation.metadata.formula_applied
      ? String(reservation.metadata.formula_applied)
      : null;
    const promoName = reservation.metadata.promo_offer_name
      ? String(reservation.metadata.promo_offer_name)
      : reservation.metadata.promotion_name
        ? String(reservation.metadata.promotion_name)
        : null;

    if (formulaDiscountPercent > 0 || formulaDiscountAmount > 0) {
      return {
        type: "formula" as const,
        name: formulaName,
        discountPercent: formulaDiscountPercent,
        discountAmount: formulaDiscountAmount,
      };
    }

    if (progressiveDiscountPercent > 0) {
      return {
        type: "progressive" as const,
        name: progressiveName,
        discountPercent: progressiveDiscountPercent,
        discountAmount: 0,
        status: progressiveStatus,
      };
    }

    if (reservation.metadata.promo_discount_percent) {
      return {
        type: "promo" as const,
        name: promoName,
        discountPercent: Number(reservation.metadata.promo_discount_percent),
        discountAmount: 0,
      };
    }

    if (reservation.metadata.promo_discount_value) {
      return {
        type: "promo" as const,
        name: promoName,
        discountPercent: 0,
        discountAmount: Number(reservation.metadata.promo_discount_value),
      };
    }

    return null;
  })();

  const dateFormatted = new Date(reservation.date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const createdFormatted = new Date(reservation.created_at).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const isCancelled = reservation.status === "cancelled";
  const isNoShow = reservation.status === "no_show";
  const isLateCancellation = !canCancel(reservation);
  const cancellationLockMessage = isCancelled
    ? "Cette réservation a déjà été annulée."
    : isNoShow
      ? "Cette réservation est déjà terminée."
      : isLateCancellation
        ? "Annulation impossible moins de 2h avant la réservation."
        : null;
  const isCancellable = !isCancelled && !isNoShow && !isLateCancellation;

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const result = await cancelReservationByCustomer(reservation.id);
      if (!result.ok) {
        throw new Error(result.errorMessage ?? "Annulation impossible.");
      }

      try {
        await dispatchQueuedNotifications("reservation-cancel");
      } catch (dispatchError) {
        console.error("Reservation cancellation notification dispatch failed:", dispatchError);
      }
      toast({ title: "Réservation annulée", description: "Votre réservation a bien été annulée." });
      queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
      setConfirmCancel(false);
      onOpenChange(false);
    } catch (cancellationError) {
      toast({
        title: "Annulation impossible",
        description: cancellationError instanceof Error ? cancellationError.message : "Réessayez dans un instant.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setConfirmCancel(false);
        onOpenChange(nextOpen);
      }}
    >
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
          <div className="flex items-center justify-between">
            <OrderStatusBadge status={reservation.status} />
            <Badge variant="outline" className={`gap-1 text-xs ${featureInfo.color}`}>
              <FeatureIcon className="h-3 w-3" />
              {featureInfo.label}
            </Badge>
          </div>

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
              <span className="text-sm">{displayTime}</span>
            </div>
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm">
                {reservation.party_size} personne{reservation.party_size > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {promoInfo && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2 text-sm text-emerald-700">
              <Utensils className="h-4 w-4" />
              <span>
                {promoInfo.type === "formula" ? "Formule" : promoInfo.type === "progressive" ? "Offre progressive" : "Promotion"} avec{" "}
                <strong>
                  {promoInfo.discountAmount > 0 && promoInfo.discountPercent <= 0
                    ? `-${promoInfo.discountAmount.toFixed(2)} CHF`
                    : `-${promoInfo.discountPercent}%`}
                </strong>
                {promoInfo.name ? ` (${promoInfo.name})` : ""}
                {"status" in promoInfo && promoInfo.status ? ` - ${promoInfo.status === "finalized" ? "remise finale" : "remise en cours"}` : ""}
              </span>
            </div>
          )}

          {preorderItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Utensils className="h-4 w-4 text-muted-foreground" />
                Plats précommandés
              </h4>
              <div className="rounded-xl border divide-y">
                {preorderItems.map((item, index) => (
                  <div key={index} className="flex min-w-0 items-start justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        x{item.quantity}
                      </span>
                      <span className="min-w-0 break-words">{item.name}</span>
                    </div>
                    <span className="shrink-0 text-right font-medium">{item.total_price.toFixed(2)} CHF</span>
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

          {(reservation.total_amount > 0 || (isJsonRecord(reservation.metadata) && Number(reservation.metadata.points_discount_amount || reservation.metadata.points_discount || 0) > 0)) && (() => {
            const meta = isJsonRecord(reservation.metadata) ? reservation.metadata : {};
            const paymentMethod = String(reservation.payment_method || meta.payment_method || "card");
            const formulaDiscountPercent = Number(meta.formula_discount_percent || 0);
            const promoDiscountPercent = Number(meta.promo_discount_percent || 0);
            const subtotalFromMeta = Number(meta.pre_discount_subtotal || 0);
            const subtotalFromItems = preorderItems.reduce((sum, item) => sum + item.total_price, 0);
            const subtotalBeforeDiscount = subtotalFromMeta > 0 ? subtotalFromMeta : subtotalFromItems;
            const formulaDiscountAmount = Number(meta.formula_discount_amount || 0);
            const promoDiscountAmount = Number(meta.promo_discount_amount || meta.promo_discount_value || 0);
            const tokOneDiscountAmount = Number(meta.tok_one_discount_amount || meta.tok_one_total_saved || 0);
            const tokOneDiscountPercent = Number(meta.tok_one_discount_percent || 0);
            const pointsDiscountAmount = Number(meta.points_discount_amount || meta.points_discount || 0);
            const pointsRedeemed = Number(meta.points_redeemed || meta.points_to_redeem || 0);
            const formulaName = readString(meta.formula_applied);
            const cardBrand = readString(meta.card_brand);
            const cardLast4 = readString(meta.card_last4);
            const twintPhoneNumber = readString(
              meta.twint_phone_number,
              meta.customer_phone,
              meta.billing_phone,
            );
            const cardDetails = [formatCardBrand(cardBrand), cardLast4 ? `**** ${cardLast4}` : ""]
              .filter(Boolean)
              .join(" ");
            const paymentLabels: Record<string, string> = {
              card: "Carte bancaire",
              twint: "TWINT",
              cash: "Espèces",
            };
            const paymentLabel = paymentLabels[paymentMethod] || paymentLabels.card;
            const PaymentIcon = paymentMethod === "cash"
              ? Banknote
              : paymentMethod === "twint"
                ? Smartphone
                : CreditCard;

            return (
              <div className="rounded-xl border p-4 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Détail du paiement
                </h4>
                <div className="space-y-1.5 text-xs">
                  {subtotalBeforeDiscount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Sous-total</span>
                      <span>{subtotalBeforeDiscount.toFixed(2)} CHF</span>
                    </div>
                  )}
                  {formulaDiscountAmount > 0 && (
                    <div className="flex min-w-0 items-start justify-between gap-3 text-emerald-600">
                      <span className="min-w-0 break-words">
                        Réduction formule
                        {formulaDiscountPercent > 0 ? ` (-${formulaDiscountPercent.toFixed(0)}%)` : ""}
                        {formulaName ? ` (${formulaName})` : ""}
                      </span>
                      <span className="shrink-0 text-right">-{formulaDiscountAmount.toFixed(2)} CHF</span>
                    </div>
                  )}
                  {promoDiscountAmount > 0 && (
                    <div className="flex min-w-0 items-start justify-between gap-3 text-emerald-600">
                      <span className="min-w-0 break-words">
                        Réduction promotion
                        {promoDiscountPercent > 0 ? ` (-${promoDiscountPercent.toFixed(0)}%)` : ""}
                      </span>
                      <span className="shrink-0 text-right">-{promoDiscountAmount.toFixed(2)} CHF</span>
                    </div>
                  )}
                  {tokOneDiscountAmount > 0 && (
                    <div className="flex min-w-0 items-start justify-between gap-3 text-violet-600">
                      <span className="flex min-w-0 items-start gap-1 break-words">
                        <Crown className="h-3 w-3 shrink-0" />
                        Réduction Tok One
                        {tokOneDiscountPercent > 0 ? ` (-${tokOneDiscountPercent.toFixed(0)}%)` : ""}
                      </span>
                      <span className="shrink-0 text-right">-{tokOneDiscountAmount.toFixed(2)} CHF</span>
                    </div>
                  )}
                  {pointsDiscountAmount > 0 && (
                    <div className="flex min-w-0 items-start justify-between gap-3 text-pink-500">
                      <span className="min-w-0 break-words">Miamz utilisés{pointsRedeemed > 0 ? ` (${pointsRedeemed} pts)` : ""}</span>
                      <span className="shrink-0 text-right">-{pointsDiscountAmount.toFixed(2)} CHF</span>
                    </div>
                  )}
                  <div className="flex min-w-0 items-start justify-between gap-3 border-t pt-1 font-bold text-foreground">
                    <span className="min-w-0 break-words">Total de la réservation</span>
                    <span className="shrink-0 text-right">{Number(reservation.total_amount).toFixed(2)} CHF</span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1 text-muted-foreground">
                    <PaymentIcon className="h-3 w-3" />
                    <span>Mode de paiement : {paymentLabel}</span>
                  </div>
                  {reservation.refund_status ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-2 py-1 text-muted-foreground">
                      <span>Remboursement</span>
                      <span className="font-medium">
                        {reservation.refund_status === "pending" ? "En cours" : reservation.refund_status}
                        {Number(reservation.refunded_amount_chf || 0) > 0 ? ` · ${Number(reservation.refunded_amount_chf).toFixed(2)} CHF` : ""}
                      </span>
                    </div>
                  ) : null}
                  {paymentMethod === "card" && cardDetails && (
                    <div className="flex items-center justify-between gap-3 text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="h-3 w-3" />
                        Carte utilisée
                      </span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                        {cardDetails}
                      </span>
                    </div>
                  )}
                  {paymentMethod === "twint" && twintPhoneNumber && (
                    <div className="flex items-center justify-between gap-3 text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Smartphone className="h-3 w-3" />
                        Numéro TWINT
                      </span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                        {twintPhoneNumber}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {reservation.notes && (
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-muted-foreground">Notes</h4>
              <p className="text-sm bg-secondary/50 rounded-lg p-3">{reservation.notes}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Réservée le {createdFormatted}
          </p>
        </div>

        {cancellationLockMessage ? (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full"
              disabled
            >
              <X className="h-4 w-4 mr-2" />
              Annulation verrouillée
            </Button>
            <p className="text-xs text-muted-foreground">{cancellationLockMessage}</p>
          </DialogFooter>
        ) : null}

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
