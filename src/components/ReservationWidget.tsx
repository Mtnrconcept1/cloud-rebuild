import { useEffect, useState } from "react";
import { DayPicker, type DayContentProps } from "react-day-picker";
import { useQuery } from "@tanstack/react-query";
import { format, isBefore, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Percent,
  ShieldCheck,
  Users,
} from "lucide-react";

import { buttonVariants, Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isMealFormulaAvailableForSlot, type MealFormulaAvailability } from "@/lib/meal-formulas";
import {
  fetchReservationAvailability,
  formatAvailabilityReason,
  normalizeReservationTime,
} from "@/lib/reservations";
import { cn } from "@/lib/utils";

interface ReservationWidgetProps {
  restaurantId: string;
  restaurantName: string;
  onReserve: (date: Date, time: string, partySize: number) => void;
}

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

export default function ReservationWidget({
  restaurantId,
  restaurantName,
  onReserve,
}: ReservationWidgetProps) {
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState("2");

  const { data: reservationDiscounts = [] } = useQuery({
    queryKey: ["reservation-widget-promos", restaurantId, date ? format(date, "yyyy-MM-dd") : null, time],
    queryFn: async () => {
      const { data, error } = await (supabase.from("meal_formulas" as any)
        .select("discount_percent, availability")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .in("applies_to", ["reservation", "both", "dine_in"] as any));
      if (error) throw error;
      const reservationDate = date ? format(date, "yyyy-MM-dd") : undefined;
      return ((data || []) as Array<{ discount_percent: number | null; availability?: MealFormulaAvailability }>)
        .filter((row) => isMealFormulaAvailableForSlot(row.availability || null, reservationDate, time))
        .map((row) => Number(row.discount_percent) || 0);
    },
    enabled: !!restaurantId,
  });

  const {
    data: availability = [],
    isLoading: availabilityLoading,
  } = useQuery({
    queryKey: ["reservation-availability-widget", restaurantId, date ? format(date, "yyyy-MM-dd") : null, partySize],
    queryFn: async () =>
      fetchReservationAvailability({
        restaurantId,
        date: date!,
        partySize: Number(partySize),
        channel: "web",
      }),
    enabled: !!restaurantId && !!date,
  });

  useEffect(() => {
    if (!availability.length) return;
    const selectedExists = availability.some(
      (slot) => normalizeReservationTime(slot.slot_time) === normalizeReservationTime(time) && slot.available,
    );
    if (selectedExists) return;

    const firstAvailable = availability.find((slot) => slot.available);
    if (firstAvailable) {
      setTime(normalizeReservationTime(firstAvailable.slot_time));
    }
  }, [availability, time]);

  const selectedDiscount = reservationDiscounts.length > 0 ? Math.max(...reservationDiscounts) : 0;
  const selectedSlot =
    availability.find((slot) => normalizeReservationTime(slot.slot_time) === normalizeReservationTime(time)) || null;
  const availableSlots = availability.filter((slot) => slot.available);

  function PromoDayContent(props: DayContentProps) {
    const { date: dayDate, activeModifiers } = props;
    const discount = !activeModifiers.disabled ? selectedDiscount : 0;
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center">
        <span>{dayDate.getDate()}</span>
        {discount > 0 ? (
          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-bold leading-none text-miamz-green">
            -{discount}%
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-lg">
      <div className="bg-primary px-5 py-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-primary-foreground">
          <CalendarIcon className="h-5 w-5" />
          Réserver une table
        </h3>
        <p className="mt-0.5 text-xs text-primary-foreground/70">{restaurantName}</p>
      </div>
      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Convives
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PARTY_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setPartySize(String(size))}
                className={`h-9 w-9 rounded-lg text-sm font-semibold transition-all ${
                  partySize === String(size)
                    ? "scale-105 bg-primary text-primary-foreground shadow-md"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5" />
            Date
          </label>
          <div className="overflow-hidden rounded-xl border">
            <DayPicker
              mode="single"
              selected={date}
              onSelect={setDate}
              disabled={(value) => isBefore(value, startOfDay(new Date()))}
              locale={fr}
              className={cn("p-3")}
              classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "space-x-1 flex items-center",
                nav_button: cn(buttonVariants({ variant: "outline" }), "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"),
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-1",
                head_row: "flex",
                head_cell: "w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground",
                row: "mt-2 flex w-full",
                cell: "relative h-11 w-9 p-0 text-center text-sm",
                day: cn(buttonVariants({ variant: "ghost" }), "h-11 w-9 p-0 font-normal aria-selected:opacity-100"),
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground",
                day_outside: "day-outside text-muted-foreground opacity-50",
                day_disabled: "text-muted-foreground opacity-50",
                day_hidden: "invisible",
              }}
              components={{
                IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                IconRight: () => <ChevronRight className="h-4 w-4" />,
                DayContent: PromoDayContent,
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Heure
          </label>
          {!date ? (
            <div className="rounded-xl border border-dashed px-3 py-4 text-xs text-muted-foreground">
              Choisissez d'abord une date pour charger les disponibilités.
            </div>
          ) : availabilityLoading ? (
            <div className="flex items-center gap-2 rounded-xl border px-3 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Recherche des créneaux disponibles...
            </div>
          ) : availableSlots.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5">
              {availability.map((slot) => {
                const slotTime = normalizeReservationTime(slot.slot_time);
                const isSelected = time === slotTime;

                return (
                  <button
                    key={`${slot.service_key}-${slotTime}`}
                    onClick={() => (slot.available ? setTime(slotTime) : undefined)}
                    disabled={!slot.available}
                    title={!slot.available ? formatAvailabilityReason(slot.reason) : undefined}
                    className={`rounded-lg px-2 py-2 text-xs font-semibold transition-all ${
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-md"
                        : slot.available
                          ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                          : "cursor-not-allowed bg-muted text-muted-foreground opacity-60"
                    }`}
                  >
                    {slotTime}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-3 py-4 text-xs text-muted-foreground">
              Aucun créneau en ligne pour cette date et ce nombre de convives.
            </div>
          )}
        </div>

        {date ? (
          <div className="space-y-1 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
            <p className="font-semibold text-primary">{format(date, "EEEE d MMMM", { locale: fr })}</p>
            <p className="text-xs text-muted-foreground">
              {time} · {partySize} personne{Number(partySize) > 1 ? "s" : ""}
            </p>
            {selectedDiscount > 0 ? (
              <p className="flex items-center gap-1 text-xs font-bold text-miamz-green">
                <Percent className="h-3 w-3" />
                Jusqu'à -{selectedDiscount}% de réduction disponible
              </p>
            ) : null}
            {selectedSlot?.requires_guarantee ? (
              <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
                <ShieldCheck className="h-3 w-3" />
                Garantie demandée
                {selectedSlot.requires_deposit && selectedSlot.deposit_amount > 0
                  ? ` · acompte ${Number(selectedSlot.deposit_amount).toFixed(2)} CHF`
                  : ""}
              </p>
            ) : null}
          </div>
        ) : null}

        <Button
          onClick={() => (date ? onReserve(date, time, Number(partySize)) : undefined)}
          disabled={!date || !selectedSlot?.available}
          className="h-12 w-full rounded-xl text-base font-bold"
          size="lg"
        >
          Réserver
        </Button>
        <p className="text-center text-[10px] text-muted-foreground">
          Créneaux calculés en temps réel selon la disponibilité du service.
        </p>
      </div>
    </div>
  );
}
