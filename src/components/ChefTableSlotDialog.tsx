import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, ChefHat, Clock3, Minus, Plus, Users } from "lucide-react";

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

export default function ChefTableSlotDialog({
  open,
  onOpenChange,
  dishName,
  chefName,
  restaurantName,
  serviceSettings,
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                    ? "border-amber-500 bg-amber-500 text-white shadow"
                    : "border-border bg-background text-foreground hover:border-amber-300 hover:bg-amber-50",
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
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-amber-500" />
            Reservez votre Table du Chef
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{dishName}</span> par {chefName} - {restaurantName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Date</label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
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

            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Users className="h-4 w-4" />
                Nombre de convives
              </div>
              <p className="mt-1 text-xs leading-5 text-amber-700/80">
                Ce nombre determine la reservation et le nombre d'experiences facturees.
              </p>
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-2 shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl"
                  onClick={() => setPartySize((current) => Math.max(partyBounds.min_party_size, current - 1))}
                  disabled={partySize <= partyBounds.min_party_size}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="text-center">
                  <p className="font-display text-3xl font-bold text-foreground">{partySize}</p>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">convive{partySize > 1 ? "s" : ""}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl"
                  onClick={() => setPartySize((current) => Math.min(partyBounds.max_party_size, current + 1))}
                  disabled={partySize >= partyBounds.max_party_size}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Limites du service {selectedService === "lunch" ? "midi" : "soir"} : {partyBounds.min_party_size} a {partyBounds.max_party_size} convives
              </p>
            </div>
          </div>

          {hasAnySlot ? (
            <div className="space-y-4">
              {renderSlotGroup("Service du midi", slots.lunch)}
              {renderSlotGroup("Service du soir", slots.dinner)}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              Le restaurant n'a pas configure d'horaires de reservation en ligne.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedTime} className="bg-amber-500 text-white hover:bg-amber-600">
            Ajouter {partySize} convive{partySize > 1 ? "s" : ""} au panier
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
