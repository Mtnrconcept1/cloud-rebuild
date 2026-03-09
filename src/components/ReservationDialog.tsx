import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Clock, Users, ChevronRight, ChevronLeft, Utensils, Tag, Check, Percent, Heart, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { trackSponsoredConversion } from "@/lib/analytics";
import { detectServiceFromTime, getServiceSettings, isTimeWithinService } from "@/lib/serviceSettings";

interface ReservationDialogProps { restaurantId: string; restaurantName: string; open: boolean; onOpenChange: (open: boolean) => void; initialDate?: Date; initialTime?: string; initialPartySize?: number; }
type Step = "datetime" | "mode" | "promo" | "confirm";
type ReservationMode = "classique" | "zero-attente";

interface PromoOffer { id: string; label: string; description: string; discount: number; formula: string; }
interface MealFormulaRow { id: string; name: string; description: string | null; discount_percent: number; }

const ESTIMATED_SPEND_PER_GUEST_CHF = 35;

// getPromosForDate removed — promotions now come from meal_formulas table server-side

export default function ReservationDialog({ restaurantId, restaurantName, open, onOpenChange, initialDate, initialTime, initialPartySize }: ReservationDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("datetime");
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState(2);
  const [notes, setNotes] = useState("");
  const [selectedPromo, setSelectedPromo] = useState<PromoOffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [donatePoints, setDonatePoints] = useState(false);
  const [reservationMode, setReservationMode] = useState<ReservationMode>("classique");

  useEffect(() => { if (open && initialDate) { setDate(initialDate); setTime(initialTime || "19:00"); setPartySize(initialPartySize || 2); setStep("mode"); } }, [open, initialDate, initialTime, initialPartySize]);

  const { data: profile } = useQuery({ queryKey: ["profile-loyalty", user?.id], queryFn: async () => { const { data } = await supabase.from("profiles" as any).select("loyalty_points").eq("user_id", user?.id).single(); return data as any; }, enabled: !!user });
  const loyaltyPoints = profile?.loyalty_points || 0;
  const earnedXp = 100;

  const { data: promos = [], isLoading: isPromosLoading } = useQuery({
    queryKey: ["reservation-promos", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("meal_formulas").select("id, name, description, discount_percent").eq("restaurant_id", restaurantId).eq("is_active", true).eq("applies_to", "reservation" as any).order("discount_percent", { ascending: false });
      if (error) throw error;
      return ((data || []) as MealFormulaRow[]).map((f) => ({ id: f.id, label: f.name, description: f.description || "Formule promotionnelle", discount: Number(f.discount_percent) || 0, formula: f.name }));
    },
    enabled: open && !!restaurantId,
  });

  const { data: restaurantSettings } = useQuery({ queryKey: ["restaurant-service-settings", restaurantId], queryFn: async () => { const { data, error } = await supabase.from("restaurants").select("opening_hours").eq("id", restaurantId).maybeSingle(); if (error) throw error; return getServiceSettings(data?.opening_hours); }, enabled: open && !!restaurantId });

  useEffect(() => { if (!selectedPromo) return; if (!promos.some((p) => p.id === selectedPromo.id)) setSelectedPromo(null); }, [promos, selectedPromo]);

  const handleSubmit = async () => {
    if (!user || !date) return;
    const settingsMap = restaurantSettings || getServiceSettings(null);
    const servicePeriod = detectServiceFromTime(time);
    const ss = settingsMap[servicePeriod];
    if (!ss.online_booking_enabled || ss.service_closed) { toast({ title: "Réservations indisponibles", variant: "destructive" }); return; }
    if (partySize < ss.min_party_size || partySize > ss.max_party_size) { toast({ title: "Nombre de convives invalide", variant: "destructive" }); return; }
    if (!isTimeWithinService(time, ss)) { toast({ title: "Horaire indisponible", variant: "destructive" }); return; }

    setLoading(true);
    const promoDiscountPercent = selectedPromo ? selectedPromo.discount : 0;
    const reservationMetadata = { feature: selectedPromo ? "promo-formule" : "classique", promo_applied: !!selectedPromo, promo_offer_id: selectedPromo?.id ?? null, promo_discount_percent: promoDiscountPercent > 0 ? promoDiscountPercent : null, service: servicePeriod };
    const promoNote = selectedPromo ? `[PROMO: ${selectedPromo.formula} -${selectedPromo.discount}%] ` : "[À la carte] ";

    const { error } = await supabase.from("reservations").insert({ restaurant_id: restaurantId, user_id: user.id, date: format(date, "yyyy-MM-dd"), time, party_size: partySize, feature: selectedPromo ? "promo-formule" : "classique", metadata: reservationMetadata, notes: promoNote + (notes || "") });
    setLoading(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); } else {
      await trackSponsoredConversion(restaurantId);
      if (donatePoints && earnedXp > 0) { await (supabase.rpc as any)("donate_points_for_meal", { points_param: earnedXp, description_param: `Don solidaire (réservation chez ${restaurantName})` }); }
      toast({ title: donatePoints ? "Réservation confirmée ! XP reversés 💚" : "Réservation confirmée ! +100 XP 🎉", description: `Chez ${restaurantName} le ${format(date, "dd/MM/yyyy")} à ${time}` });
      onOpenChange(false); resetForm();
    }
  };

  const resetForm = () => { setStep("datetime"); setDate(undefined); setTime("19:00"); setPartySize(2); setNotes(""); setSelectedPromo(null); setDonatePoints(false); setReservationMode("classique"); };
  const handleOpenChange = (open: boolean) => { if (!open) resetForm(); onOpenChange(open); };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="flex items-center justify-center gap-2 pt-6 px-6">
          {(["datetime", "mode", "promo", "confirm"] as Step[]).map((s, i) => {
            const allSteps: Step[] = ["datetime", "mode", "promo", "confirm"];
            const currentIdx = allSteps.indexOf(step);
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${step === s ? "bg-primary text-primary-foreground" : i < currentIdx ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {i < currentIdx ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                {i < 3 && <div className="w-6 h-0.5 bg-secondary rounded" />}
              </div>
            );
          })}
        </div>
        <DialogHeader className="px-6 pt-4 pb-0">
          <div className="text-lg font-semibold leading-none tracking-tight">
            {step === "datetime" && "Réserver chez " + restaurantName}
            {step === "mode" && "Type de réservation"}
            {step === "promo" && "Choisir une offre"}
            {step === "confirm" && "Confirmer la réservation"}
          </div>
        </DialogHeader>
        <div className="px-6 pb-6 space-y-4">
          {step === "datetime" && (
            <>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><CalendarIcon className="h-4 w-4 text-muted-foreground" />Date</Label>
                <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, "EEEE d MMMM yyyy", { locale: fr }) : "Choisir une date"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} disabled={(d) => d < new Date()} locale={fr} /></PopoverContent></Popover>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-muted-foreground" />Heure</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
                <div className="space-y-2"><Label className="flex items-center gap-1.5"><Users className="h-4 w-4 text-muted-foreground" />Convives</Label><Input type="number" min={1} max={20} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} /></div>
              </div>
              <Button onClick={() => setStep("mode")} disabled={!date} className="w-full gap-2">Suivant<ChevronRight className="h-4 w-4" /></Button>
            </>
          )}
          {step === "mode" && (
            <>
              <div className="space-y-3">
                <button onClick={() => setReservationMode("classique")} className={`w-full text-left rounded-xl border-2 p-4 transition-all ${reservationMode === "classique" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <div className="flex items-center gap-3"><Utensils className="h-6 w-6" /><div><p className="font-semibold text-sm">Réservation classique</p><p className="text-xs text-muted-foreground">Réservez avec des promos</p></div></div>
                </button>
                <button onClick={() => setReservationMode("zero-attente")} className={`w-full text-left rounded-xl border-2 p-4 transition-all ${reservationMode === "zero-attente" ? "border-indigo-500 bg-indigo-500/5" : "border-border"}`}>
                  <div className="flex items-center gap-3"><Zap className="h-6 w-6" /><div><p className="font-semibold text-sm">Zéro Attente</p><p className="text-xs text-muted-foreground">Précommandez, tout sera prêt</p></div></div>
                </button>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("datetime")}><ChevronLeft className="h-4 w-4" /></Button>
                <Button onClick={() => { if (reservationMode === "zero-attente") { onOpenChange(false); resetForm(); navigate(`/zero-attente?restaurant=${restaurantId}`); } else setStep("promo"); }} className="flex-1">{reservationMode === "zero-attente" ? "Zéro Attente" : "Suivant"}<ChevronRight className="h-4 w-4" /></Button>
              </div>
            </>
          )}
          {step === "promo" && (
            <>
              <button onClick={() => setSelectedPromo(null)} className={`w-full text-left rounded-xl border-2 p-4 ${selectedPromo === null ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="flex items-center gap-3"><Utensils className="h-5 w-5" /><div><p className="font-semibold text-sm">À la carte</p></div></div>
              </button>
              {promos.map((promo) => (
                <button key={promo.id} onClick={() => setSelectedPromo(promo)} className={`w-full text-left rounded-xl border-2 p-4 ${selectedPromo?.id === promo.id ? "border-miamz-green bg-miamz-green/5" : "border-border"}`}>
                  <div className="flex items-center gap-3"><Tag className="h-5 w-5" /><div><p className="font-semibold text-sm">{promo.label} <span className="text-miamz-green">-{promo.discount}%</span></p><p className="text-xs text-muted-foreground">{promo.description}</p></div></div>
                </button>
              ))}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("mode")}><ChevronLeft className="h-4 w-4" /></Button>
                <Button onClick={() => setStep("confirm")} className="flex-1">Suivant<ChevronRight className="h-4 w-4" /></Button>
              </div>
            </>
          )}
          {step === "confirm" && (
            <>
              <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Restaurant</span><span className="font-medium">{restaurantName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{date ? format(date, "EEEE d MMMM", { locale: fr }) : ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Heure</span><span className="font-medium">{time}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Convives</span><span className="font-medium">{partySize}</span></div>
                {selectedPromo && <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Formule</span><span className="font-semibold text-miamz-green">{selectedPromo.formula} -{selectedPromo.discount}%</span></div>}
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-miamz-green/5 border border-miamz-green/20">
                <div className="flex items-center gap-3"><Heart className="h-5 w-5 text-miamz-green fill-miamz-green" /><div><Label className="font-semibold cursor-pointer text-sm">Reverser mes XP</Label><p className="text-xs text-muted-foreground">+{earnedXp} XP solidaires</p></div></div>
                <Switch checked={donatePoints} onCheckedChange={setDonatePoints} />
              </div>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes..." rows={2} />
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("promo")}><ChevronLeft className="h-4 w-4" /></Button>
                <Button onClick={handleSubmit} disabled={loading} className="flex-1">{loading ? "Envoi..." : "Confirmer"}</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
