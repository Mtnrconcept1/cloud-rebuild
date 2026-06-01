import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, ChefHat, Clock3, Minus, Plus, ShieldCheck, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  detectServiceFromTime,
  generateDailyTimeSlots,
  type ServiceSettingsMap,
} from "@/lib/serviceSettings";
import { cn } from "@/lib/utils";

interface ChefTableSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dishName: string;
  chefName: string;
  restaurantName: string;
  serviceSettings: ServiceSettingsMap;
  pricePerGuest?: number | null;
  remainingPortions?: number | null;
  initialDate?: Date | null;
  initialTime?: string | null;
  initialPartySize?: number | null;
  onConfirm: (selectedIso: string, partySize: number) => void;
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function buildIsoFromDateAndTime(date: Date, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next.toISOString();
}

const currencyFormatter = new Intl.NumberFormat("fr-CH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number) {
  return `${currencyFormatter.format(value)} CHF`;
}

export default function ChefTableSlotDialog({
  open,
  onOpenChange,
  dishName,
  chefName,
  restaurantName,
  serviceSettings,
  pricePerGuest,
  remainingPortions,
  initialDate,
  initialTime,
  initialPartySize,
  onConfirm,
}: ChefTableSlotDialogProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(1);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const slots = useMemo(() => generateDailyTimeSlots(serviceSettings, 30), [serviceSettings]);
  const selectedService = useMemo(
    () => detectServiceFromTime(selectedTime || initialTime || serviceSettings.dinner.start_time),
    [initialTime, selectedTime, serviceSettings.dinner.start_time],
  );
  const partyBounds = serviceSettings[selectedService];
  const totalAmount = Math.max(0, Number(pricePerGuest || 0) * partySize);
  const selectedDateLabel = format(selectedDate, "EEEE d MMMM", { locale: fr });

  useEffect(() => {
    if (!open) return;
    const baseDate = initialDate ? startOfDay(initialDate) : today;
    setSelectedDate(baseDate < today ? today : baseDate);

    const nextTime = initialTime && slots.all.includes(initialTime)
      ? initialTime
      : slots.dinner[0] ?? slots.lunch[0] ?? null;
    setSelectedTime(nextTime);

    const nextService = detectServiceFromTime(nextTime || serviceSettings.dinner.start_time);
    const nextSettings = serviceSettings[nextService];
    const nextPartySize = Math.max(
      nextSettings.min_party_size,
      Math.min(initialPartySize || 1, nextSettings.max_party_size),
    );
    setPartySize(nextPartySize);
  }, [open, initialDate, initialPartySize, initialTime, serviceSettings, slots, today]);

  useEffect(() => {
    setPartySize((current) =>
      Math.max(partyBounds.min_party_size, Math.min(current, partyBounds.max_party_size)),
    );
  }, [partyBounds.max_party_size, partyBounds.min_party_size]);

  const handleConfirm = () => {
    if (!selectedTime) return;
    onConfirm(buildIsoFromDateAndTime(selectedDate, selectedTime), partySize);
    onOpenChange(false);
  };

  const renderSlotGroup = (label: string, list: string[]) => {
    if (list.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground dark:text-amber-100/75">
          {label}
        </p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {list.map((time) => {
            const isSelected = time === selectedTime;
            return (
              <button
                key={`${label}-${time}`}
                type="button"
                onClick={() => setSelectedTime(time)}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-medium transition",
                  isSelected
                    ? "border-amber-500 bg-amber-500 text-white shadow dark:border-amber-300 dark:text-slate-950"
                    : "border-border bg-background text-foreground hover:border-amber-300 hover:bg-amber-50 dark:border-white/20 dark:bg-slate-950 dark:text-white dark:hover:border-amber-300/50 dark:hover:bg-amber-400/20",
                )}
              >
                <Clock3 className="h-3.5 w-3.5" />
                {time}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const hasAnySlot = slots.all.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-amber-200 bg-white p-0 shadow-[0_40px_120px_-48px_rgba(120,53,15,0.55)] dark:border-amber-300/25 dark:bg-slate-950 dark:text-white dark:shadow-[0_40px_130px_-40px_rgba(0,0,0,0.82),0_0_48px_rgba(245,158,11,0.18)] sm:max-w-[780px] sm:rounded-[32px]">
        <DialogHeader className="border-b border-amber-200/70 bg-gradient-to-br from-stone-950 via-neutral-900 to-amber-950 px-6 pb-6 pt-6 text-left">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">
              <ChefHat className="h-3.5 w-3.5 text-amber-300" />
              Table du Chef
            </div>
            {remainingPortions != null ? (
              <div className="rounded-full border border-amber-300/40 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-100">
                {remainingPortions} portion{remainingPortions > 1 ? "s" : ""} restante{remainingPortions > 1 ? "s" : ""}
              </div>
            ) : null}
          </div>

          <DialogTitle className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {dishName}
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
            <span className="font-medium text-white">{chefName}</span> chez{" "}
            <span className="font-medium text-white">{restaurantName}</span>. Choisissez le creneau, le nombre de convives, puis confirmez votre étape de paiement.
          </DialogDescription>

          <div className="mt-5 flex flex-wrap gap-2">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">Date</p>
              <p className="mt-1 text-sm font-medium text-white">{selectedDateLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">Creneau</p>
              <p className="mt-1 text-sm font-medium text-white">{selectedTime || "A choisir"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">Convives</p>
              <p className="mt-1 text-sm font-medium text-white">
                {partySize} convive{partySize > 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-6 px-6 pb-6 pt-5 lg:grid-cols-[minmax(0,1.15fr)_280px]">
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold dark:text-slate-100">Date de réservation</label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-12 w-full justify-start rounded-2xl border-amber-200 text-left font-normal dark:border-amber-300/30 dark:bg-slate-950 dark:text-white dark:hover:bg-amber-400/20">
                    <CalendarIcon className="mr-2 h-4 w-4 text-amber-600" />
                    {format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto rounded-2xl p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) setSelectedDate(startOfDay(date));
                      setPopoverOpen(false);
                    }}
                    disabled={(date) => startOfDay(date) < today}
                    fromDate={today}
                    locale={fr}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {hasAnySlot ? (
              <div className="space-y-4 rounded-[28px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50/70 p-4 dark:border-amber-300/25 dark:bg-[linear-gradient(135deg,rgba(120,53,15,0.22),rgba(15,23,42,0.92))] dark:shadow-[0_0_28px_rgba(245,158,11,0.12)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-100">
                  <Clock3 className="h-4 w-4" />
                  Choisissez votre creneau
                </div>
                <p className="text-xs leading-5 text-amber-800/75 dark:text-amber-100/75">
                  Les horaires affichés correspondent aux services disponibles pour cette expérience.
                </p>
                {renderSlotGroup("Service du midi", slots.lunch)}
                {renderSlotGroup("Service du soir", slots.dinner)}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                Le restaurant n'a pas configure d'horaires de réservation en ligne.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-amber-200 bg-amber-50/80 p-5 shadow-sm dark:border-amber-300/30 dark:bg-amber-950/25 dark:shadow-[0_0_30px_rgba(245,158,11,0.14),inset_0_1px_0_rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-100">
                <Users className="h-4 w-4" />
                Nombre de convives
              </div>
              <p className="mt-1 text-xs leading-5 text-amber-700/80 dark:text-amber-100/75">
                Ce nombre determiné la réservation et le nombre d'expériences facturees.
              </p>

              <div className="mt-4 flex items-center justify-between rounded-[24px] bg-white p-2 shadow-sm dark:border dark:border-amber-300/25 dark:bg-slate-950 dark:shadow-[0_0_24px_rgba(245,158,11,0.12)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 rounded-2xl dark:text-white dark:hover:bg-white/10"
                  onClick={() => setPartySize((current) => Math.max(partyBounds.min_party_size, current - 1))}
                  disabled={partySize <= partyBounds.min_party_size}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="text-center">
                  <p className="font-display text-4xl font-bold text-foreground dark:text-white">{partySize}</p>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground dark:text-amber-100/75">
                    convive{partySize > 1 ? "s" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 rounded-2xl dark:text-white dark:hover:bg-white/10"
                  onClick={() => setPartySize((current) => Math.min(partyBounds.max_party_size, current + 1))}
                  disabled={partySize >= partyBounds.max_party_size}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <p className="mt-3 text-[11px] leading-5 text-muted-foreground dark:text-slate-200/75">
                Limites du service {selectedService === "lunch" ? "midi" : "soir"} : {partyBounds.min_party_size} a {partyBounds.max_party_size} convives
              </p>
            </div>

            <div className="rounded-[28px] bg-stone-950 p-5 text-white shadow-[0_28px_90px_-46px_rgba(15,23,42,0.92)]">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <p className="text-sm font-semibold text-white">Paiement sécurisé ensuite</p>
                  <p className="mt-1 text-xs leading-5 text-white/68">
                    Cette étape prepare votre réservation. Le paiement confirme ensuite votre Table du Chef.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="flex items-center justify-between gap-4 text-xs text-white/60">
                  <span>Prix par convive</span>
                  <span>{pricePerGuest ? formatCurrency(pricePerGuest) : "--"}</span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Total estimé</p>
                    <p className="mt-1 font-display text-3xl font-bold text-white">
                      {pricePerGuest ? formatCurrency(totalAmount) : "--"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-300/30 bg-amber-500/20 px-3 py-2 text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100/70">Sélection</p>
                    <p className="mt-1 text-sm font-semibold text-amber-100">
                      {selectedTime || "--:--"} · {partySize} convive{partySize > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-3 text-xs text-white/70">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <p>
                  Vos convives, votre date et votre creneau seront conserves dans le panier avant l'ouverture du paiement.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-amber-100 px-6 py-4 dark:border-white/10 sm:flex-row sm:justify-end">
          <Button variant="outline" className="rounded-2xl" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedTime}
            className="rounded-2xl bg-amber-500 text-white shadow-[0_20px_50px_-26px_rgba(245,158,11,0.92)] hover:bg-amber-600"
          >
            Continuer vers le paiement · {partySize} convive{partySize > 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
