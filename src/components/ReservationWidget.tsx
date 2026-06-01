import { useEffect, useMemo, useState } from "react";
import { DayPicker, DayContentProps } from "react-day-picker";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users, Clock, CalendarIcon, Percent, ChevronLeft, ChevronRight, LogIn } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { isMealFormulaAvailableForSlot, type MealFormulaAvailability } from "@/lib/meal-formulas";
import {
  buildReservationSlotGroups,
  isReservationCalendarDateDisabled,
  type ReservationSlotAvailability,
} from "@/lib/reservationAvailability";
import { getServiceSettings } from "@/lib/serviceSettings";

const supabase = getSupabase();

interface ReservationWidgetProps { restaurantId: string; restaurantName: string; onReserve: (date: Date, time: string, partySize: number) => void; }

const FALLBACK_PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

function buildPartySizes(settings: ReturnType<typeof getServiceSettings>): number[] {
  const min = Math.min(settings.lunch.min_party_size, settings.dinner.min_party_size);
  const max = Math.max(settings.lunch.max_party_size, settings.dinner.max_party_size);
  const sizes: number[] = [];
  for (let i = min; i <= max; i++) sizes.push(i);
  return sizes.length > 0 ? sizes : FALLBACK_PARTY_SIZES;
}

type SlotAvailabilityRow = {
  slot_time: string;
  reserved_tables: number;
  capacity: number;
  remaining_tables: number;
  available: boolean;
};

export default function ReservationWidget({ restaurantId, restaurantName, onReserve }: ReservationWidgetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState("2");

  const { data: serviceSettingsData } = useQuery({
    queryKey: ["reservation-widget-settings", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("opening_hours").eq("id", restaurantId).maybeSingle();
      if (error) throw error;
      return getServiceSettings(data?.opening_hours);
    },
    enabled: !!restaurantId,
  });

  const selectedDateKey = date ? format(date, "yyyy-MM-dd") : null;

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
    enabled: !!restaurantId && !!selectedDateKey,
  });

  const slotGroups = useMemo(() => {
    const reservedTablesByTime = Object.fromEntries(
      slotAvailability.map((slot) => [slot.slot_time, Number(slot.reserved_tables || 0)]),
    );
    const slotAvailabilityByTime = new Map(slotAvailability.map((slot) => [slot.slot_time, slot]));

    return buildReservationSlotGroups({
      serviceSettings: serviceSettingsData || getServiceSettings(null),
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
    }));
  }, [date, serviceSettingsData, slotAvailability]);

  const availableSlots = slotGroups.flatMap((group) => group.slots).filter((slot) => slot.available);
  const selectedSlot = slotGroups.flatMap((group) => group.slots).find((slot) => slot.time === time) || null;

  useEffect(() => {
    if (!date || selectedSlot?.available || !availableSlots[0]) return;
    setTime(availableSlots[0].time);
  }, [availableSlots, date, selectedSlot?.available]);

  const PARTY_SIZES = useMemo(() => {
    if (!serviceSettingsData) return FALLBACK_PARTY_SIZES;
    return buildPartySizes(serviceSettingsData);
  }, [serviceSettingsData]);

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

  const selectedDiscount = reservationDiscounts.length > 0 ? Math.max(...reservationDiscounts) : 0;

  function PromoDayContent(props: DayContentProps) {
    const { date: dayDate, activeModifiers } = props;
    const discount = !activeModifiers.disabled ? selectedDiscount : 0;
    return (
      <div className="relative flex flex-col items-center justify-center w-full h-full">
        <span>{dayDate.getDate()}</span>
        {discount > 0 && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-miamz-green leading-none whitespace-nowrap">-{discount}%</span>}
      </div>
    );
  }

  const renderSlotButton = (slot: ReservationSlotAvailability) => {
    const isSelected = slot.time === time;
    return (
      <button
        key={slot.time}
        type="button"
        disabled={!slot.available}
        onClick={() => setTime(slot.time)}
        className={`min-h-[48px] rounded-lg border px-2 py-2 text-left text-xs transition-all ${
          isSelected
            ? "border-primary bg-primary text-primary-foreground shadow-md"
            : slot.available
              ? "border-border bg-secondary text-secondary-foreground hover:border-primary/50 hover:bg-primary/5"
              : "cursor-not-allowed border-dashed bg-muted/70 text-muted-foreground opacity-70"
        }`}
      >
        <span className="block font-semibold">{slot.time}</span>
        <span className="text-[10px] leading-tight">
          {slot.available ? `${slot.remainingTables} table${slot.remainingTables > 1 ? "s" : ""}` : slot.disabledReason}
        </span>
      </button>
    );
  };

  return (
    <div className="rounded-2xl border bg-card shadow-lg overflow-hidden">
      <div className="bg-primary px-5 py-4">
        <h3 className="font-display text-lg font-bold text-primary-foreground flex items-center gap-2"><CalendarIcon className="h-5 w-5" />Réserver une table</h3>
        <p className="text-primary-foreground/70 text-xs mt-0.5">{restaurantName}</p>
      </div>
      <div className="p-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Convives</label>
          <div className="flex gap-1.5 flex-wrap">{PARTY_SIZES.map((size) => <button key={size} onClick={() => setPartySize(String(size))} className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${partySize === String(size) ? "bg-primary text-primary-foreground shadow-md scale-105" : "bg-secondary hover:bg-secondary/80 text-secondary-foreground"}`}>{size}</button>)}</div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Date</label>
          <div className="border rounded-xl overflow-hidden">
            <DayPicker mode="single" selected={date} onSelect={setDate} disabled={(d) => isReservationCalendarDateDisabled(d)} locale={fr} className={cn("p-3")} classNames={{ months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0", month: "space-y-4", caption: "flex justify-center pt-1 relative items-center", caption_label: "text-sm font-medium", nav: "space-x-1 flex items-center", nav_button: cn(buttonVariants({ variant: "outline" }), "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"), nav_button_previous: "absolute left-1", nav_button_next: "absolute right-1", table: "w-full border-collapse space-y-1", head_row: "flex", head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]", row: "flex w-full mt-2", cell: "h-11 w-9 text-center text-sm p-0 relative", day: cn(buttonVariants({ variant: "ghost" }), "h-11 w-9 p-0 font-normal aria-selected:opacity-100"), day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground", day_today: "bg-accent text-accent-foreground", day_outside: "day-outside text-muted-foreground opacity-50", day_disabled: "text-muted-foreground opacity-50", day_hidden: "invisible" }} components={{ IconLeft: () => <ChevronLeft className="h-4 w-4" />, IconRight: () => <ChevronRight className="h-4 w-4" />, DayContent: PromoDayContent }} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Heure</label>
          {!date ? (
            <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              Choisissez une date pour voir les horaires ouverts.
            </div>
          ) : isSlotAvailabilityLoading ? (
            <div className="rounded-xl border p-3 text-xs text-muted-foreground">
              Vérification des disponibilités...
            </div>
          ) : slotGroups.length > 0 ? (
            <div className="space-y-2">
              {slotGroups.map((group) => (
                <div key={group.service} className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{group.label}</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {group.slots.map(renderSlotButton)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              Aucun creneau ouvert et disponible pour cette date.
            </div>
          )}
        </div>
        {date && (
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-sm space-y-1">
            <p className="font-semibold text-primary">{format(date, "EEEE d MMMM yyyy", { locale: fr })}</p>
            <p className="text-muted-foreground text-xs">{time} · {partySize} personne{Number(partySize) > 1 ? "s" : ""}</p>
            {selectedDiscount > 0 && <p className="text-miamz-green text-xs font-bold flex items-center gap-1"><Percent className="h-3 w-3" />Jusqu'à -{selectedDiscount}% de réduction disponible</p>}
          </div>
        )}
        {user ? (
          <Button onClick={() => date && selectedSlot?.available && onReserve(date, time, Number(partySize))} disabled={!date || !selectedSlot?.available} className="w-full h-12 text-base font-bold rounded-xl" size="lg">Réserver</Button>
        ) : (
          <Button onClick={() => navigate("/auth")} className="w-full h-12 text-base font-bold rounded-xl gap-2" size="lg">
            <LogIn className="h-5 w-5" />
            Connexion pour réserver
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground text-center">Confirmation immédiate · Annulation gratuite</p>
      </div>
    </div>
  );
}
