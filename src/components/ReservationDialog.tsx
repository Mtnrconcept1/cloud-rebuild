import { useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Check, ChevronLeft, ChevronRight, Clock, Heart, Loader2, Tag, Utensils, Users, Zap } from "lucide-react";

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
import { useActiveFeatures } from "@/lib/featureFlags";
import { isMealFormulaAvailableForSlot, type MealFormulaAvailability } from "@/lib/meal-formulas";
import { dispatchQueuedNotifications } from "@/lib/notificationDispatch";
import { createReservationWithValidation } from "@/lib/reservationMutations";
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

type Step = "datetime" | "mode" | "promo" | "confirm";
type ReservationMode = "classique" | "zero-attente";
interface PromoOffer {
  id: string;
  label: string;
  description: string;
  discountLabel: string;
  discountPercent: number;
  formulaName: string;
}

interface MealFormulaRow {
  id: string;
  name: string;
  description: string | null;
  discount_percent: number;
  availability?: MealFormulaAvailability;
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
  const [loading, setLoading] = useState(false);
  const [donatePoints, setDonatePoints] = useState(false);
  const [reservationMode, setReservationMode] = useState<ReservationMode>("classique");

  useEffect(() => {
    if (!open || !initialDate) return;
    setDate(initialDate);
    setTime(initialTime || "19:00");
    setPartySize(initialPartySize || 2);
    setStep(zeroWaitEnabled ? "mode" : "promo");
  }, [open, initialDate, initialTime, initialPartySize, zeroWaitEnabled]);

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

  const { data: promos = [], isLoading: isPromosLoading } = useQuery({
    queryKey: ["reservation-promos", restaurantId, date ? format(date, "yyyy-MM-dd") : null, time, user?.id || null],
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

      return ((data || []) as MealFormulaRow[])
        .filter((formula) => isMealFormulaAvailableForSlot(formula.availability || null, reservationDate, time))
        .map((formula) => ({
          id: formula.id,
          label: formula.name,
          description: formula.description || "Formule promotionnelle liée à votre réservation.",
          discountLabel: `-${Number(formula.discount_percent) || 0}%`,
          discountPercent: Number(formula.discount_percent) || 0,
          formulaName: formula.name,
        }))
        .sort((a, b) => b.discountPercent - a.discountPercent);
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

    const hasFormula = !!selectedPromo;
    const reservationMetadata = {
      feature: hasFormula ? "promo-formule" : "classique",
      formula_applied: selectedPromo?.formulaName ?? null,
      formula_discount_percent: selectedPromo?.discountPercent ?? null,
      service: servicePeriod,
    };

    const offerPrefix = selectedPromo
      ? `[FORMULE: ${selectedPromo.label} ${selectedPromo.discountLabel}] `
      : "[A la carte] ";

    let reservationResult: Awaited<ReturnType<typeof createReservationWithValidation>>;
    try {
      reservationResult = await createReservationWithValidation({
        restaurantId,
        date: format(date, "yyyy-MM-dd"),
        time,
        partySize,
        feature: hasFormula ? "promo-formule" : "classique",
        metadata: reservationMetadata,
        notes: offerPrefix + (notes || ""),
      });
    } catch (reservationError) {
      setLoading(false);
      toast({
        title: "Erreur",
        description: reservationError instanceof Error ? reservationError.message : "Creation de reservation impossible.",
        variant: "destructive",
      });
      return;
    }

    setLoading(false);

    if (!reservationResult.ok) {
      toast({ title: "Erreur", description: reservationResult.errorMessage, variant: "destructive" });
      return;
    }

    const reservationId = reservationResult.reservationId;

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
      feature: hasFormula ? "promo-formule" : "classique",
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
    setReservationMode("classique");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

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
                  {index < steps.length - 1 && <div className="h-0.5 w-6 rounded bg-secondary" />}
                </div>
              );
            })}
          </div>

          <DialogHeader className="px-6 pb-0 pt-4">
            <div className="text-lg font-semibold leading-none tracking-tight">
              {step === "datetime" && `Reserver chez ${restaurantName}`}
              {step === "mode" && "Type de reservation"}
              {step === "promo" && "Choisir une formule"}
              {step === "confirm" && "Confirmer la reservation"}
            </div>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-6">
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
                      <Calendar mode="single" selected={date} onSelect={setDate} disabled={(value) => value < new Date()} locale={fr} />
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

                <Button onClick={() => setStep(zeroWaitEnabled ? "mode" : "promo")} disabled={!date} className="w-full gap-2">
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
                        <p className="text-sm font-semibold">Zero Attente</p>
                        <p className="text-xs text-muted-foreground">Precommande, tout sera pret a l'arrivee.</p>
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
                        onOpenChange(false);
                        resetForm();
                        navigate(`/zero-attente?restaurant=${restaurantId}`);
                        return;
                      }
                      setStep("promo");
                    }}
                    className="flex-1"
                  >
                    {reservationMode === "zero-attente" ? "Zero Attente" : "Suivant"}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === "promo" && (
              <>
                <button
                  onClick={() => setSelectedPromo(null)}
                  className={`w-full rounded-xl border-2 p-4 text-left ${selectedPromo === null ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="flex items-center gap-3">
                    <Utensils className="h-5 w-5" />
                    <div>
                      <p className="text-sm font-semibold">A la carte</p>
                      <p className="text-xs text-muted-foreground">Reservation sans offre speciale.</p>
                    </div>
                  </div>
                </button>

                {isPromosLoading ? (
                  <div className="flex items-center justify-center rounded-xl border p-6 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Chargement des formules...
                  </div>
                ) : promos.length > 0 ? (
                  promos.map((promo) => (
                    <button
                      key={promo.id}
                      onClick={() => setSelectedPromo(promo)}
                      className={`w-full rounded-xl border-2 p-4 text-left ${selectedPromo?.id === promo.id ? "border-miamz-green bg-miamz-green/5" : "border-border"}`}
                    >
                      <div className="flex items-start gap-3">
                        <Tag className="mt-0.5 h-5 w-5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold">{promo.label}</p>
                            <span className="font-semibold text-miamz-green">{promo.discountLabel}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{promo.description}</p>
                        </div>
                      </div>
                    </button>
                  ))
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
                  <div className="flex justify-between"><span className="text-muted-foreground">Convives</span><span className="font-medium">{partySize}</span></div>
                  {selectedPromo && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-muted-foreground">Formule</span>
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
