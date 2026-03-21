import { useEffect, useState } from "react";
import { format, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Check, ChevronLeft, ChevronRight, Clock, Heart, Loader2, Tag, Users } from "lucide-react";

import ReservationDetailModal from "@/components/ReservationDetailModal";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { trackSponsoredConversion } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { isMealFormulaAvailableForSlot, type MealFormulaAvailability } from "@/lib/meal-formulas";
import { dispatchQueuedNotifications } from "@/lib/notificationDispatch";
import { detectServiceFromTime, getServiceSettings, isTimeWithinService } from "@/lib/serviceSettings";

interface ReservationDialogProps {
  restaurantId: string;
  restaurantName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date;
  initialTime?: string;
  initialPartySize?: number;
}

type Step = "datetime" | "promo" | "confirm";
type PromoOfferType = "formula" | "promotion";

interface PromoOffer {
  id: string;
  label: string;
  description: string;
  offerType: PromoOfferType;
  discountLabel: string;
  discountPercent: number | null;
  promotionType: string | null;
  promotionValue: number | null;
  formulaName: string | null;
  sortValue: number;
}

interface MealFormulaRow {
  id: string;
  name: string;
  description: string | null;
  discount_percent: number;
  availability?: MealFormulaAvailability;
}

interface RestaurantPromotionRow {
  id: string;
  name: string;
  promotion_type: string;
  promotion_value: number;
  target: string;
  start_at: string;
  end_at: string;
  active: boolean;
}

function isPromotionEligible(target: string | null | undefined, reservationCount: number) {
  if (target === "new") return reservationCount === 0;
  if (target === "returning") return reservationCount > 0;
  return true;
}

function buildPromotionDescription(promotion: RestaurantPromotionRow) {
  if (promotion.promotion_type === "percentage") {
    return `Promotion de ${Number(promotion.promotion_value) || 0}% sur votre venue.`;
  }
  if (promotion.promotion_type === "fixed") {
    return `Remise de ${Number(promotion.promotion_value || 0).toFixed(2)} CHF associee a votre reservation.`;
  }
  return "Offre promotionnelle associee a votre reservation.";
}

export default function ReservationDialog({
  restaurantId,
  restaurantName,
  open,
  onOpenChange,
  initialDate,
  initialTime,
  initialPartySize,
}: ReservationDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("datetime");
  const [confirmedReservation, setConfirmedReservation] = useState<any>(null);
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState(2);
  const [notes, setNotes] = useState("");
  const [selectedPromo, setSelectedPromo] = useState<PromoOffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [donatePoints, setDonatePoints] = useState(false);

  useEffect(() => {
    if (!open || !initialDate) return;
    setDate(initialDate);
    setTime(initialTime || "19:00");
    setPartySize(initialPartySize || 2);
    setStep("promo");
  }, [open, initialDate, initialTime, initialPartySize]);

  const { data: profile } = useQuery({
    queryKey: ["profile-loyalty", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as any).select("loyalty_points").eq("user_id", user?.id).single();
      return data as any;
    },
    enabled: !!user,
  });

  const loyaltyPoints = profile?.loyalty_points || 0;
  const earnedXp = 100;

  const { data: promos = [], isLoading: isPromosLoading } = useQuery({
    queryKey: ["reservation-promos", restaurantId, date ? format(date, "yyyy-MM-dd") : null, time, user?.id || null],
    queryFn: async () => {
      const reservationDate = date ? format(date, "yyyy-MM-dd") : undefined;
      const reservationDateTime = reservationDate ? new Date(`${reservationDate}T${time}`) : null;

      const [formulaResponse, promotionResponse, reservationCountResponse] = await Promise.all([
        supabase
          .from("meal_formulas")
          .select("id, name, description, discount_percent, applies_to, availability")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true)
          .in("applies_to", ["reservation", "both", "dine_in"] as any)
          .order("discount_percent", { ascending: false }),
        supabase
          .from("restaurant_promotions")
          .select("id, name, promotion_type, promotion_value, target, start_at, end_at, active")
          .eq("restaurant_id", restaurantId)
          .eq("active", true),
        user?.id
          ? (supabase.from("reservations").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("user_id", user.id) as any)
          : Promise.resolve({ count: 0, error: null }),
      ]);

      if (formulaResponse.error) throw formulaResponse.error;
      if (promotionResponse.error) throw promotionResponse.error;
      if ((reservationCountResponse as any).error) throw (reservationCountResponse as any).error;

      const reservationCount = Number((reservationCountResponse as any).count || 0);

      const formulaOffers: PromoOffer[] = ((formulaResponse.data || []) as MealFormulaRow[])
        .filter((formula) => isMealFormulaAvailableForSlot(formula.availability || null, reservationDate, time))
        .map((formula) => ({
          id: formula.id,
          label: formula.name,
          description: formula.description || "Formule promotionnelle liee a votre reservation.",
          offerType: "formula",
          discountLabel: `-${Number(formula.discount_percent) || 0}%`,
          discountPercent: Number(formula.discount_percent) || 0,
          promotionType: "percentage",
          promotionValue: Number(formula.discount_percent) || 0,
          formulaName: formula.name,
          sortValue: Number(formula.discount_percent) || 0,
        }));

      const promotionOffers: PromoOffer[] = ((promotionResponse.data || []) as RestaurantPromotionRow[])
        .filter((promotion) => promotion.promotion_type !== "free_delivery")
        .filter((promotion) => isPromotionEligible(promotion.target, reservationCount))
        .filter((promotion) => {
          if (!reservationDateTime || Number.isNaN(reservationDateTime.getTime())) return true;
          const startAt = new Date(promotion.start_at);
          const endAt = new Date(promotion.end_at);
          if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return true;
          return reservationDateTime >= startAt && reservationDateTime <= endAt;
        })
        .map((promotion) => {
          const isPercentage = promotion.promotion_type === "percentage";
          return {
            id: promotion.id,
            label: promotion.name,
            description: buildPromotionDescription(promotion),
            offerType: "promotion",
            discountLabel: isPercentage
              ? `-${Number(promotion.promotion_value) || 0}%`
              : `-${Number(promotion.promotion_value || 0).toFixed(2)} CHF`,
            discountPercent: isPercentage ? Number(promotion.promotion_value) || 0 : null,
            promotionType: promotion.promotion_type,
            promotionValue: Number(promotion.promotion_value) || 0,
            formulaName: null,
            sortValue: Number(promotion.promotion_value) || 0,
          };
        });

      return [...formulaOffers, ...promotionOffers].sort((a, b) => {
        if (a.sortValue !== b.sortValue) return b.sortValue - a.sortValue;
        if (a.offerType !== b.offerType) return a.offerType === "formula" ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
    },
    enabled: open && !!restaurantId,
  });

  const { data: restaurantSettings } = useQuery({
    queryKey: ["restaurant-service-settings", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("opening_hours").eq("id", restaurantId).maybeSingle();
      if (error) throw error;
      return getServiceSettings(data?.opening_hours);
    },
    enabled: open && !!restaurantId,
  });

  useEffect(() => {
    if (!selectedPromo) return;
    if (!promos.some((promo) => promo.id === selectedPromo.id)) {
      setSelectedPromo(null);
    }
  }, [promos, selectedPromo]);

  const handleSubmit = async () => {
    if (!user || !date) return;

    const settingsMap = restaurantSettings || getServiceSettings(null);
    const servicePeriod = detectServiceFromTime(time);
    const serviceSettings = settingsMap[servicePeriod];

    if (!serviceSettings.online_booking_enabled || serviceSettings.service_closed) {
      toast({ title: "Reservations indisponibles", variant: "destructive" });
      return;
    }
    if (partySize < serviceSettings.min_party_size || partySize > serviceSettings.max_party_size) {
      toast({ title: "Nombre de convives invalide", variant: "destructive" });
      return;
    }
    if (!isTimeWithinService(time, serviceSettings)) {
      toast({ title: "Horaire indisponible", variant: "destructive" });
      return;
    }

    setLoading(true);

    const hasOffer = !!selectedPromo;
    const isFormulaOffer = selectedPromo?.offerType === "formula";
    const reservationMetadata = {
      feature: hasOffer ? (isFormulaOffer ? "promo-formule" : "promo-offre") : "classique",
      promo_applied: hasOffer,
      promo_offer_id: selectedPromo?.id ?? null,
      promo_offer_type: selectedPromo?.offerType ?? null,
      promo_offer_name: selectedPromo?.label ?? null,
      promo_discount_percent: selectedPromo?.discountPercent ?? null,
      promo_discount_value: selectedPromo?.promotionValue ?? null,
      promotion_name: selectedPromo?.offerType === "promotion" ? selectedPromo.label : null,
      promotion_type: selectedPromo?.offerType === "promotion" ? selectedPromo.promotionType : null,
      promotion_value: selectedPromo?.offerType === "promotion" ? selectedPromo.promotionValue : null,
      formula_applied: isFormulaOffer ? selectedPromo?.formulaName : null,
      formula_discount_percent: isFormulaOffer ? selectedPromo?.discountPercent : null,
      formula_discount_amount: null,
      service: servicePeriod,
    };

    const offerPrefix = selectedPromo
      ? `[OFFRE: ${selectedPromo.label} ${selectedPromo.discountLabel}] `
      : "[A la carte] ";

    const { data: reservationId, error } = await (supabase.rpc as any)("validate_and_create_reservation", {
      p_restaurant_id: restaurantId,
      p_date: format(date, "yyyy-MM-dd"),
      p_time: time,
      p_party_size: partySize,
      p_feature: hasOffer ? (isFormulaOffer ? "promo-formule" : "promo-offre") : "classique",
      p_metadata: reservationMetadata,
      p_notes: offerPrefix + (notes || ""),
    });

    setLoading(false);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    await trackSponsoredConversion(restaurantId, {
      conversionType: "reservation",
      entityId: reservationId || null,
    });

    try {
      await dispatchQueuedNotifications("reservation-create");
    } catch (dispatchError) {
      console.error("Reservation notification dispatch failed:", dispatchError);
    }

    if (donatePoints && loyaltyPoints >= 0 && earnedXp > 0) {
      await (supabase.rpc as any)("donate_points_for_meal", {
        points_param: earnedXp,
        description_param: `Don solidaire (reservation chez ${restaurantName})`,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
    setConfirmedReservation({
      id: reservationId,
      date: format(date, "yyyy-MM-dd"),
      time,
      party_size: partySize,
      status: "pending",
      feature: hasOffer ? (isFormulaOffer ? "promo-formule" : "promo-offre") : "classique",
      notes: offerPrefix + (notes || ""),
      total_amount: 0,
      created_at: new Date().toISOString(),
      metadata: reservationMetadata,
      preorder_items: [],
      restaurant_name: restaurantName,
    });
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setStep("datetime");
    setDate(undefined);
    setTime("19:00");
    setPartySize(2);
    setNotes("");
    setSelectedPromo(null);
    setDonatePoints(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const steps: Step[] = ["datetime", "promo", "confirm"];

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-md">
          <DialogTitle className="sr-only">Reservation</DialogTitle>

          <div className="flex items-center justify-center gap-2 px-6 pt-6">
            {steps.map((currentStep, index) => {
              const currentIndex = steps.indexOf(step);
              return (
                <div key={currentStep} className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      step === currentStep
                        ? "bg-primary text-primary-foreground"
                        : index < currentIndex
                          ? "bg-primary/20 text-primary"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {index < currentIndex ? <Check className="h-4 w-4" /> : index + 1}
                  </div>
                  {index < steps.length - 1 ? <div className="h-0.5 w-6 rounded bg-secondary" /> : null}
                </div>
              );
            })}
          </div>

          <DialogHeader className="px-6 pb-0 pt-4">
            <div className="text-lg font-semibold leading-none tracking-tight">
              {step === "datetime" ? `Reserver chez ${restaurantName}` : null}
              {step === "promo" ? "Choisir une offre" : null}
              {step === "confirm" ? "Confirmer la reservation" : null}
            </div>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-6">
            {step === "datetime" ? (
              <>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "EEEE d MMMM yyyy", { locale: fr }) : "Choisir une date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={date} onSelect={setDate} disabled={(value) => value < startOfDay(new Date())} locale={fr} />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Heure
                    </Label>
                    <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Convives
                    </Label>
                    <Input type="number" min={1} max={20} value={partySize} onChange={(event) => setPartySize(Number(event.target.value))} />
                  </div>
                </div>

                <Button onClick={() => setStep("promo")} disabled={!date} className="w-full gap-2">
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}

            {step === "promo" ? (
              <>
                <button
                  onClick={() => setSelectedPromo(null)}
                  className={`w-full rounded-xl border-2 p-4 text-left ${
                    selectedPromo === null ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Tag className="h-5 w-5" />
                    <div>
                      <p className="text-sm font-semibold">A la carte</p>
                      <p className="text-xs text-muted-foreground">Reservation sans offre speciale.</p>
                    </div>
                  </div>
                </button>

                {isPromosLoading ? (
                  <div className="flex items-center justify-center rounded-xl border p-6 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Chargement des offres...
                  </div>
                ) : promos.length > 0 ? (
                  promos.map((promo) => (
                    <button
                      key={promo.id}
                      onClick={() => setSelectedPromo(promo)}
                      className={`w-full rounded-xl border-2 p-4 text-left ${
                        selectedPromo?.id === promo.id ? "border-miamz-green bg-miamz-green/5" : "border-border"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Tag className="mt-0.5 h-5 w-5" />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{promo.label}</p>
                            <span className="font-semibold text-miamz-green">{promo.discountLabel}</span>
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {promo.offerType === "formula" ? "Formule" : "Promotion"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{promo.description}</p>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Aucune offre n'est disponible pour ce creneau. Vous pouvez continuer en reservation a la carte.
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("datetime")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button onClick={() => setStep("confirm")} className="flex-1">
                    Suivant
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : null}

            {step === "confirm" ? (
              <>
                <div className="space-y-2 rounded-xl bg-secondary/50 p-4 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Restaurant</span><span className="font-medium">{restaurantName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{date ? format(date, "EEEE d MMMM", { locale: fr }) : ""}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Heure</span><span className="font-medium">{time}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Convives</span><span className="font-medium">{partySize}</span></div>
                  {selectedPromo ? (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-muted-foreground">Offre</span>
                      <span className="font-semibold text-miamz-green">{selectedPromo.label} {selectedPromo.discountLabel}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-miamz-green/20 bg-miamz-green/5 p-3">
                  <div className="flex items-center gap-3">
                    <Heart className="h-5 w-5 fill-miamz-green text-miamz-green" />
                    <div>
                      <Label className="cursor-pointer text-sm font-semibold">Reverser mes XP</Label>
                      <p className="text-xs text-muted-foreground">+{earnedXp} XP solidaires</p>
                    </div>
                  </div>
                  <Switch checked={donatePoints} onCheckedChange={setDonatePoints} />
                </div>

                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes..." rows={2} />

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("promo")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                    {loading ? "Envoi..." : "Confirmer"}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <ReservationDetailModal
        reservation={confirmedReservation}
        open={!!confirmedReservation}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmedReservation(null);
        }}
      />
    </>
  );
}
