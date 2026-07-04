import { useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Check, ChevronLeft, ChevronRight, Clock, Heart, Loader2, Tag, Timer, Utensils, Users, Zap } from "lucide-react";

import ReservationDetailModal from "@/components/ReservationDetailModal";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { trackGoogleBookingEvent } from "@/hooks/useGoogleBusinessBooking";
import { trackSponsoredConversion } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { isMealFormulaAvailableForSlot, type MealFormulaAvailability } from "@/lib/meal-formulas";
import { dispatchQueuedNotifications } from "@/lib/notificationDispatch";
import {
  formatProgressiveCountdown,
  formatProgressiveServiceDate,
  getNextProgressiveDiscount,
  getProgressiveOfferServiceLabel,
  getProgressiveOfferRemainingTables,
  isProgressiveOfferAvailableForSlot,
  selectDailyProgressiveOffers,
  type ProgressiveReservationOffer,
} from "@/lib/progressiveReservationOffers";
import {
  buildReservationSlotGroups,
  isReservationCalendarDateDisabled,
  type ReservationSlotAvailability,
} from "@/lib/reservationAvailability";
import { createReservationWithValidation } from "@/lib/reservationMutations";
import { detectServiceFromTime, getConfiguredServiceSettings, isTimeWithinService } from "@/lib/serviceSettings";
import { buildZeroAttenteReservationUrl } from "@/lib/zeroAttenteReservationContext";

const supabase = getSupabase();

interface ReservationDialogProps {
  restaurantId: string;
  restaurantName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date;
  initialTime?: string;
  initialPartySize?: number;
  initialStep?: Step;
  progressiveOfferId?: string | null;
  resetKey?: number;
}

type Step = "datetime" | "mode" | "promo" | "confirm";
type ReservationMode = "classique" | "zero-attente";
interface PromoOffer {
  id: string;
  kind: "formula" | "progressive";
  label: string;
  description: string;
  discountLabel: string;
  discountPercent: number;
  formulaName: string;
  formulaId?: string | null;
  maxTables?: number | null;
  remainingTables?: number | null;
  progressiveOfferId?: string | null;
}

interface MealFormulaRow {
  id: string;
  name: string;
  description: string | null;
  discount_percent: number;
  availability?: MealFormulaAvailability;
}

type SlotAvailabilityRow = {
  slot_time: string;
  reserved_tables: number;
  capacity: number;
  remaining_tables: number;
  available: boolean;
};

type FormulaServiceAvailabilityRow = {
  formula_id: string;
  formula_name: string;
  max_tables: number | null;
  reserved_tables: number;
  remaining_tables: number | null;
  available: boolean;
};

export default function ReservationDialog({
  restaurantId,
  restaurantName,
  open,
  onOpenChange,
  initialDate,
  initialTime,
  initialPartySize,
  initialStep = "datetime",
  progressiveOfferId,
  resetKey,
}: ReservationDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeFeatures = useActiveFeatures();
  const zeroWaitEnabled = activeFeatures.has("zero-attente");
  const steps: Step[] = zeroWaitEnabled ? ["datetime", "mode", "promo", "confirm"] : ["datetime", "promo", "confirm"];

  const [step, setStep] = useState<Step>("datetime");
  const [confirmedReservation, setConfirmedReservation] = useState<any>(null);
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState(2);
  const [notes, setNotes] = useState("");
  const [selectedPromo, setSelectedPromo] = useState<PromoOffer | null>(null);
  const [promoChoiceTouched, setPromoChoiceTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [donatePoints, setDonatePoints] = useState(false);
  const [reservationMode, setReservationMode] = useState<ReservationMode>("classique");

  useEffect(() => {
    if (!open) return;
    setStep(initialStep === "confirm" && initialDate && initialTime ? "confirm" : "datetime");
  }, [initialDate, initialStep, initialTime, open, resetKey]);

  useEffect(() => {
    if (!open || !initialDate) return;
    setDate(initialDate);
    setTime(initialTime || "19:00");
    setPartySize(initialPartySize || 2);
    setPromoChoiceTouched(false);
    setStep(initialStep === "confirm" && initialTime ? "confirm" : "datetime");
  }, [open, initialDate, initialTime, initialPartySize, initialStep]);

  useEffect(() => {
    if (!zeroWaitEnabled && reservationMode === "zero-attente") {
      setReservationMode("classique");
    }
  }, [reservationMode, zeroWaitEnabled]);

  useEffect(() => {
    if (!zeroWaitEnabled && step === "mode") {
      setStep("promo");
    }
  }, [step, zeroWaitEnabled]);

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

  const { data: initialProgressiveOffer } = useQuery({
    queryKey: ["reservation-progressive-offer", restaurantId, progressiveOfferId],
    queryFn: async () => {
      if (!progressiveOfferId) return null;
      const { data, error } = await (supabase.from("reservation_progressive_offers" as any) as any)
        .select("*")
        .eq("id", progressiveOfferId)
        .eq("restaurant_id", restaurantId)
        .eq("status", "active")
        .gt("booking_cutoff_at", new Date().toISOString())
        .maybeSingle();
      if (error) throw error;
      return data as ProgressiveReservationOffer | null;
    },
    enabled: open && !!restaurantId && !!progressiveOfferId,
  });

  useEffect(() => {
    if (!open || !initialProgressiveOffer) return;
    const serviceDate = new Date(`${initialProgressiveOffer.service_date}T12:00:00`);
    if (!Number.isNaN(serviceDate.getTime())) {
      setDate(serviceDate);
    }
    setTime((initialProgressiveOffer.service_time || "19:00").slice(0, 5));
    setPromoChoiceTouched(false);
    setStep("datetime");
  }, [initialProgressiveOffer, open]);

  const { data: promos = [], isLoading: isPromosLoading } = useQuery({
    queryKey: ["reservation-promos", restaurantId, date ? format(date, "yyyy-MM-dd") : null, time, user?.id || null, progressiveOfferId || null],
    queryFn: async () => {
      const reservationDate = date ? format(date, "yyyy-MM-dd") : undefined;

      const { data, error } = await supabase
        .from("meal_formulas")
        .select("id, name, description, discount_percent, applies_to, availability")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .in("applies_to", ["reservation", "both", "dine_in"] as any)
        .order("discount_percent", { ascending: false });

      if (error) throw error;

      const formulaAvailabilityById = new Map<string, FormulaServiceAvailabilityRow>();
      if (reservationDate) {
        const { data: formulaAvailabilityData, error: formulaAvailabilityError } = await (supabase.rpc as any)("get_meal_formula_service_availability", {
          p_restaurant_id: restaurantId,
          p_date: reservationDate,
          p_time: time,
        });

        if (formulaAvailabilityError) {
          console.warn("Meal formula service availability fallback:", formulaAvailabilityError.message);
        } else {
          ((formulaAvailabilityData || []) as FormulaServiceAvailabilityRow[]).forEach((row) => {
            if (row?.formula_id) formulaAvailabilityById.set(row.formula_id, row);
          });
        }
      }

      let progressiveRows: ProgressiveReservationOffer[] = [];
      if (reservationDate) {
        let progressiveQuery = (supabase.from("reservation_progressive_offers" as any) as any)
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("service_date", reservationDate)
          .eq("status", "active")
          .gt("booking_cutoff_at", new Date().toISOString())
          .order("booking_cutoff_at", { ascending: true });

        if (progressiveOfferId) {
          progressiveQuery = progressiveQuery.eq("id", progressiveOfferId);
        }

        const { data: progressiveData, error: progressiveError } = await progressiveQuery;
        if (progressiveError) throw progressiveError;
        progressiveRows = selectDailyProgressiveOffers(
          ((progressiveData || []) as ProgressiveReservationOffer[])
            .filter((offer) => isProgressiveOfferAvailableForSlot(offer, reservationDate, time)),
          {
            reservationDate,
            reservationTime: time,
            maxOffers: 1,
          },
        );
      }

      const formulaPromos = ((data || []) as MealFormulaRow[])
        .filter((formula) => isMealFormulaAvailableForSlot(formula.availability || null, reservationDate, time))
        .flatMap((formula) => {
          const serviceAvailability = formulaAvailabilityById.get(formula.id);
          if (serviceAvailability && !serviceAvailability.available) return [];
          const remainingText = typeof serviceAvailability?.remaining_tables === "number"
            ? ` ${serviceAvailability.remaining_tables} table(s) promo restante(s) sur ce service.`
            : "";

          return [{
          id: formula.id,
          kind: "formula" as const,
          label: formula.name,
          description: `${formula.description || "Formule promotionnelle liee a votre reservation."}${remainingText}`,
          discountLabel: `-${Number(formula.discount_percent) || 0}%`,
          discountPercent: Number(formula.discount_percent) || 0,
          formulaName: formula.name,
          formulaId: formula.id,
          maxTables: serviceAvailability?.max_tables ?? null,
          remainingTables: serviceAvailability?.remaining_tables ?? null,
          }];
        })
        .sort((a, b) => b.discountPercent - a.discountPercent);

      const progressivePromos = progressiveRows
        .filter((offer) => getProgressiveOfferRemainingTables(offer) > 0)
        .map((offer) => {
          const nextDiscount = getNextProgressiveDiscount(offer);
          return {
            id: `progressive-${offer.id}`,
            kind: "progressive" as const,
            label: offer.title,
            description: `${formatProgressiveServiceDate(offer.service_date)} - service ${getProgressiveOfferServiceLabel(offer)} - ${getProgressiveOfferRemainingTables(offer)} table(s) restante(s), fin dans ${formatProgressiveCountdown(offer.countdown_ends_at)}.`,
            discountLabel: `jusqu'a -${Number(offer.max_discount_percent || 0).toFixed(0)}%`,
            discountPercent: nextDiscount,
            formulaName: offer.title,
            progressiveOfferId: offer.id,
          };
        });

      return [...progressivePromos, ...formulaPromos];
    },
    enabled: open && !!restaurantId,
  });

  const { data: restaurantSettings } = useQuery({
    queryKey: ["restaurant-service-settings", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("opening_hours").eq("id", restaurantId).maybeSingle();
      if (error) throw error;
      return getConfiguredServiceSettings(data?.opening_hours);
    },
    enabled: open && !!restaurantId,
  });

  const selectedDateKey = date ? format(date, "yyyy-MM-dd") : null;
  const normalizedInitialTime = initialTime?.slice(0, 5);

  const { data: slotAvailability = [], isLoading: isSlotAvailabilityLoading } = useQuery({
    queryKey: ["reservation-slot-availability", restaurantId, selectedDateKey],
    queryFn: async () => {
      if (!selectedDateKey) return [] as SlotAvailabilityRow[];

      const { data, error } = await (supabase.rpc as any)("get_restaurant_reservation_slot_availability", {
        p_restaurant_id: restaurantId,
        p_date: selectedDateKey,
      });

      if (error) {
        console.warn("Reservation slot availability fallback:", error.message);
        return [] as SlotAvailabilityRow[];
      }

      return ((data || []) as SlotAvailabilityRow[]).map((row) => ({
        ...row,
        slot_time: String(row.slot_time || "").slice(0, 5),
      }));
    },
    enabled: open && !!restaurantId && !!selectedDateKey,
  });

  const slotAvailabilityByTime = new Map(slotAvailability.map((slot) => [slot.slot_time, slot]));
  const reservedTablesByTime = Object.fromEntries(
    slotAvailability.map((slot) => [slot.slot_time, Number(slot.reserved_tables || 0)]),
  );

  const slotGroups = restaurantSettings
    ? buildReservationSlotGroups({
        serviceSettings: restaurantSettings,
        selectedDate: date,
        reservedTablesByTime,
      }).map((group) => ({
        ...group,
        slots: group.slots.map((slot) => {
          const serverSlot = slotAvailabilityByTime.get(slot.time);
          if (!serverSlot) return slot;
          const remainingTables = Math.max(0, Number(serverSlot.remaining_tables || 0));
          const available = Boolean(serverSlot.available) && remainingTables > 0;
          return {
            ...slot,
            capacity: Number(serverSlot.capacity || slot.capacity),
            reservedTables: Number(serverSlot.reserved_tables || 0),
            remainingTables,
            available,
            disabledReason: available ? null : "Complet",
          };
        }),
      }))
    : [];

  const availableSlots = slotGroups.flatMap((group) => group.slots).filter((slot) => slot.available);
  const selectedSlot = slotGroups.flatMap((group) => group.slots).find((slot) => slot.time === time) || null;
  const selectedServiceSettings = restaurantSettings?.[detectServiceFromTime(time)];
  const partySizeMin = selectedServiceSettings?.min_party_size || 1;
  const partySizeMax = selectedServiceSettings?.max_party_size || 20;

  useEffect(() => {
    if (!open || !date) return;
    if (selectedSlot?.available) return;
    if (normalizedInitialTime && time === normalizedInitialTime) return;
    if (availableSlots[0]) {
      setTime(availableSlots[0].time);
    }
  }, [availableSlots, date, normalizedInitialTime, open, selectedSlot, selectedSlot?.available, time]);

  useEffect(() => {
    if (!selectedPromo) return;
    if (!promos.some((promo) => promo.id === selectedPromo.id)) {
      setSelectedPromo(null);
    }
  }, [promos, selectedPromo]);

  useEffect(() => {
    if (!progressiveOfferId || selectedPromo || promoChoiceTouched) return;
    const progressivePromo = promos.find((promo) => promo.kind === "progressive" && promo.progressiveOfferId === progressiveOfferId);
    if (progressivePromo) {
      setSelectedPromo(progressivePromo);
    }
  }, [progressiveOfferId, promoChoiceTouched, promos, selectedPromo]);

  const handleSubmit = async () => {
    if (!user || !date) return;

    if (!restaurantSettings) {
      toast({
        title: "Horaires indisponibles",
        description: "Ce restaurant n'a pas encore configure ses horaires de reservation en ligne.",
        variant: "destructive",
      });
      return;
    }

    const settingsMap = restaurantSettings;
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
    if (!selectedSlot?.available) {
      toast({
        title: "Créneau indisponible",
        description: selectedSlot?.disabledReason || "Choisissez une heure encore disponible.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const hasProgressiveOffer = selectedPromo?.kind === "progressive" && !!selectedPromo.progressiveOfferId;
    const hasFormula = selectedPromo?.kind === "formula";
    const reservationFeature = hasProgressiveOffer ? "promo-progressive" : hasFormula ? "promo-formule" : "classique";
    const reservationMetadata = {
      feature: reservationFeature,
      formula_id: hasFormula ? selectedPromo?.formulaId ?? null : null,
      formula_applied: hasFormula ? selectedPromo?.formulaName ?? null : null,
      formula_discount_percent: hasFormula ? selectedPromo?.discountPercent ?? null : null,
      formula_max_tables_per_service: hasFormula ? selectedPromo?.maxTables ?? null : null,
      formula_remaining_tables: hasFormula ? selectedPromo?.remainingTables ?? null : null,
      progressive_offer_id: hasProgressiveOffer ? selectedPromo?.progressiveOfferId ?? null : null,
      progressive_offer_name: hasProgressiveOffer ? selectedPromo?.formulaName ?? null : null,
      progressive_offer_discount_percent: hasProgressiveOffer ? selectedPromo?.discountPercent ?? null : null,
      progressive_offer_discount_status: hasProgressiveOffer ? "pending" : null,
      service: servicePeriod,
      restaurant_confirmation_required: serviceSettings.restaurant_confirmation_required,
      confirmation_deadline_minutes: serviceSettings.confirmation_deadline_minutes,
      deposit_amount_chf: serviceSettings.deposit_amount_chf,
      acquisition_source:
        typeof window !== "undefined" && new URLSearchParams(window.location.search).get("utm_source") === "google_business"
          ? "google_business"
          : null,
    };

    const offerPrefix = selectedPromo
      ? hasProgressiveOffer
        ? `[OFFRE PROGRESSIVE: ${selectedPromo.label} ${selectedPromo.discountLabel}] `
        : `[FORMULE: ${selectedPromo.label} ${selectedPromo.discountLabel}] `
      : "[A la carte] ";

    let reservationResult: Awaited<ReturnType<typeof createReservationWithValidation>>;
    try {
      reservationResult = await createReservationWithValidation({
        restaurantId,
        date: format(date, "yyyy-MM-dd"),
        time,
        partySize,
        feature: reservationFeature,
        metadata: reservationMetadata,
        notes: offerPrefix + (notes || ""),
        progressiveOfferId: hasProgressiveOffer ? selectedPromo?.progressiveOfferId ?? null : null,
      });
    } catch (reservationError) {
      setLoading(false);
      toast({
        title: "Erreur",
        description: reservationError instanceof Error ? reservationError.message : "Création de réservation impossible.",
        variant: "destructive",
      });
      return;
    }

    setLoading(false);

    if ("errorMessage" in reservationResult) {
      toast({ title: "Erreur", description: reservationResult.errorMessage, variant: "destructive" });
      return;
    }

    const reservationId = reservationResult.reservationId;

    if (typeof window !== "undefined") {
      const currentSearchParams = new URLSearchParams(window.location.search);
      if (currentSearchParams.get("utm_source") === "google_business") {
        await trackGoogleBookingEvent(restaurantId, "google_booking_reservation_completed", {
          reservation_id: reservationId,
          source: "google_business",
          medium: currentSearchParams.get("utm_medium") || "booking_button",
        });
      }
    }

    await trackSponsoredConversion(restaurantId, {
      conversionType: "reservation",
      entityId: reservationId || null,
      journeyType: "reservation",
    });

    try {
      await dispatchQueuedNotifications("reservation-create");
    } catch (dispatchError) {
      console.error("Reservation notification dispatch failed:", dispatchError);
    }

    if (donatePoints && loyaltyPoints >= 0 && earnedXp > 0) {
      await (supabase.rpc as any)("donate_points_for_meal", {
        points_param: earnedXp,
        description_param: `Don solidaire (réservation chez ${restaurantName})`,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
    queryClient.invalidateQueries({ queryKey: ["reservation-slot-availability", restaurantId] });
    setConfirmedReservation({
      id: reservationId,
      date: format(date, "yyyy-MM-dd"),
      time,
      party_size: partySize,
      status: "pending",
      feature: reservationFeature,
      notes: offerPrefix + (notes || ""),
      total_amount: 0,
      created_at: new Date().toISOString(),
      metadata: reservationMetadata,
      preorder_items: [],
      restaurant_name: restaurantName,
      progressive_offer_id: hasProgressiveOffer ? selectedPromo?.progressiveOfferId ?? null : null,
      progressive_offer_discount_percent: hasProgressiveOffer ? selectedPromo?.discountPercent ?? null : null,
      progressive_offer_discount_status: hasProgressiveOffer ? "pending" : "none",
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
    setPromoChoiceTouched(false);
    setDonatePoints(false);
    setReservationMode("classique");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const renderSlotButton = (slot: ReservationSlotAvailability) => {
    const isSelected = slot.time === time;
    return (
      <button
        key={slot.time}
        type="button"
        disabled={!slot.available}
        onClick={() => setTime(slot.time)}
        className={`min-h-[54px] rounded-xl border px-3 py-2 text-left text-sm transition ${
          isSelected
            ? "border-primary bg-primary text-primary-foreground shadow"
            : slot.available
              ? "border-border bg-background hover:border-primary/50 hover:bg-primary/5"
              : "cursor-not-allowed border-dashed bg-muted/60 text-muted-foreground opacity-70"
        }`}
      >
        <span className="block font-semibold">{slot.time}</span>
        <span className="text-[11px]">
          {slot.available ? `${slot.remainingTables} table${slot.remainingTables > 1 ? "s" : ""}` : slot.disabledReason}
        </span>
      </button>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden p-0 sm:max-w-md">
          <DialogTitle className="sr-only">Reservation</DialogTitle>
          <DialogDescription className="sr-only">
            Choisissez une date, un créneau disponible et le nombre de convives pour réserver une table.
          </DialogDescription>

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
                  {index < steps.length - 1 && <div className="h-0.5 w-6 rounded bg-secondary" />}
                </div>
              );
            })}
          </div>

          <DialogHeader className="px-6 pb-0 pt-4">
            <div className="text-lg font-semibold leading-none tracking-tight">
              {step === "datetime" && `Réserver chez ${restaurantName}`}
              {step === "mode" && "Type de réservation"}
              {step === "promo" && "Choisir une formule"}
              {step === "confirm" && "Confirmer la réservation"}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
            {step === "datetime" && (
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
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        disabled={(value) => isReservationCalendarDateDisabled(value)}
                        locale={fr}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Heure disponible
                  </Label>
                  {!date ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      Choisissez une date pour voir les horaires ouverts.
                    </div>
                  ) : isSlotAvailabilityLoading ? (
                    <div className="flex items-center rounded-xl border p-4 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Vérification des disponibilités...
                    </div>
                  ) : slotGroups.length > 0 ? (
                    <div className="space-y-3">
                      {slotGroups.map((group) => (
                        <div key={group.service} className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {group.label}
                          </p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {group.slots.map(renderSlotButton)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      Aucun créneau ouvert et disponible pour cette date.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Convives
                    </Label>
                    <Input type="number" min={partySizeMin} max={partySizeMax} value={partySize} onChange={(event) => setPartySize(Number(event.target.value))} />
                  </div>
                </div>

                <Button
                  onClick={() => setStep(zeroWaitEnabled ? "mode" : "promo")}
                  disabled={!date || !selectedSlot?.available}
                  className="w-full gap-2"
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}

            {step === "mode" && zeroWaitEnabled && (
              <>
                <div className="space-y-3">
                  <button
                    onClick={() => setReservationMode("classique")}
                    className={`w-full rounded-xl border-2 p-4 text-left transition-all ${reservationMode === "classique" ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <div className="flex items-center gap-3">
                      <Utensils className="h-6 w-6" />
                      <div>
                        <p className="text-sm font-semibold">Reservation classique</p>
                        <p className="text-xs text-muted-foreground">Reserve avec une offre ou une formule.</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setReservationMode("zero-attente")}
                    className={`w-full rounded-xl border-2 p-4 text-left transition-all ${reservationMode === "zero-attente" ? "border-indigo-500 bg-indigo-500/5" : "border-border"}`}
                  >
                    <div className="flex items-center gap-3">
                      <Zap className="h-6 w-6" />
                      <div>
                        <p className="text-sm font-semibold">Zéro Attente</p>
                        <p className="text-xs text-muted-foreground">Précommande, tout sera prêt à l'arrivée.</p>
                      </div>
                    </div>
                  </button>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep("datetime")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => {
                      if (reservationMode === "zero-attente") {
                        const zeroAttenteUrl = buildZeroAttenteReservationUrl({
                          restaurantId,
                          date: date ? format(date, "yyyy-MM-dd") : null,
                          time,
                          partySize,
                        });
                        onOpenChange(false);
                        resetForm();
                        navigate(zeroAttenteUrl);
                        return;
                      }
                      setStep("promo");
                    }}
                    className="flex-1"
                  >
                    {reservationMode === "zero-attente" ? "Zéro Attente" : "Suivant"}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === "promo" && (
              <>
                <button
                  onClick={() => {
                    setSelectedPromo(null);
                    setPromoChoiceTouched(true);
                  }}
                  className={`w-full rounded-xl border-2 p-4 text-left ${selectedPromo === null ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="flex items-center gap-3">
                    <Utensils className="h-5 w-5" />
                    <div>
                      <p className="text-sm font-semibold">À la carte</p>
                      <p className="text-xs text-muted-foreground">Reservation sans offre spéciale.</p>
                    </div>
                  </div>
                </button>

                {isPromosLoading ? (
                  <div className="flex items-center justify-center rounded-xl border p-6 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Chargement des formules...
                  </div>
                ) : promos.length > 0 ? (
                  promos.map((promo) => {
                    const PromoIcon = promo.kind === "progressive" ? Timer : Tag;
                    const selectedClass = promo.kind === "progressive"
                      ? "border-orange-500 bg-orange-500/5"
                      : "border-miamz-green bg-miamz-green/5";
                    const discountClass = promo.kind === "progressive" ? "text-orange-600" : "text-miamz-green";

                    return (
                      <button
                        key={promo.id}
                        onClick={() => {
                          setSelectedPromo(promo);
                          setPromoChoiceTouched(true);
                        }}
                        className={`w-full rounded-xl border-2 p-4 text-left ${selectedPromo?.id === promo.id ? selectedClass : "border-border"}`}
                      >
                        <div className="flex items-start gap-3">
                          <PromoIcon className="mt-0.5 h-5 w-5" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">{promo.label}</p>
                              <span className={`font-semibold ${discountClass}`}>{promo.discountLabel}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{promo.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Aucune formule disponible pour ce créneau. Vous pouvez continuer à la carte.
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(zeroWaitEnabled ? "mode" : "datetime")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button onClick={() => setStep("confirm")} className="flex-1">
                    Suivant
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === "confirm" && (
              <>
                <div className="space-y-2 rounded-xl bg-secondary/50 p-4 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Restaurant</span><span className="font-medium">{restaurantName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{date ? format(date, "EEEE d MMMM yyyy", { locale: fr }) : ""}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Heure</span><span className="font-medium">{time}</span></div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="reservation-confirm-party-size" className="text-muted-foreground">
                      Convives
                    </Label>
                    <Input
                      id="reservation-confirm-party-size"
                      type="number"
                      min={partySizeMin}
                      max={partySizeMax}
                      value={partySize}
                      onChange={(event) => setPartySize(Number(event.target.value))}
                      className="h-9 w-24 text-right"
                    />
                  </div>
                  {selectedPromo && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-muted-foreground">{selectedPromo.kind === "progressive" ? "Offre progressive" : "Formule"}</span>
                      <span className="font-semibold text-miamz-green">{selectedPromo.label} {selectedPromo.discountLabel}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-pink-300/40 bg-pink-50 dark:bg-pink-950/20 p-3">
                  <div className="flex items-center gap-3">
                    <Heart className="h-5 w-5 fill-pink-500 text-pink-500" />
                    <div>
                      <Label className="cursor-pointer text-sm font-semibold">Reverser mes Miamz</Label>
                      <p className="text-xs text-muted-foreground">+{earnedXp} Miamz solidaires</p>
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
            )}
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
