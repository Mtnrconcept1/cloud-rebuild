import { useState } from "react";
import { DayPicker, DayContentProps } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Users, Clock, CalendarIcon, Percent, ChevronLeft, ChevronRight } from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMealFormulaAvailableForSlot, type MealFormulaAvailability } from "@/lib/meal-formulas";

interface ReservationWidgetProps { restaurantId: string; restaurantName: string; onReserve: (date: Date, time: string, partySize: number) => void; }

const TIME_SLOTS = ["11:30", "12:00", "12:30", "13:00", "13:30", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];
const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

export default function ReservationWidget({ restaurantId, restaurantName, onReserve }: ReservationWidgetProps) {
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
            <DayPicker mode="single" selected={date} onSelect={setDate} disabled={(d) => isBefore(d, startOfDay(new Date()))} locale={fr} className={cn("p-3")} classNames={{ months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0", month: "space-y-4", caption: "flex justify-center pt-1 relative items-center", caption_label: "text-sm font-medium", nav: "space-x-1 flex items-center", nav_button: cn(buttonVariants({ variant: "outline" }), "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"), nav_button_previous: "absolute left-1", nav_button_next: "absolute right-1", table: "w-full border-collapse space-y-1", head_row: "flex", head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]", row: "flex w-full mt-2", cell: "h-11 w-9 text-center text-sm p-0 relative", day: cn(buttonVariants({ variant: "ghost" }), "h-11 w-9 p-0 font-normal aria-selected:opacity-100"), day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground", day_today: "bg-accent text-accent-foreground", day_outside: "day-outside text-muted-foreground opacity-50", day_disabled: "text-muted-foreground opacity-50", day_hidden: "invisible" }} components={{ IconLeft: () => <ChevronLeft className="h-4 w-4" />, IconRight: () => <ChevronRight className="h-4 w-4" />, DayContent: PromoDayContent }} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Heure</label>
          <div className="grid grid-cols-4 gap-1.5">{TIME_SLOTS.map((slot) => <button key={slot} onClick={() => setTime(slot)} className={`px-2 py-2 rounded-lg text-xs font-semibold transition-all ${time === slot ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary hover:bg-secondary/80 text-secondary-foreground"}`}>{slot}</button>)}</div>
        </div>
        {date && (
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-sm space-y-1">
            <p className="font-semibold text-primary">{format(date, "EEEE d MMMM", { locale: fr })}</p>
            <p className="text-muted-foreground text-xs">{time} · {partySize} personne{Number(partySize) > 1 ? "s" : ""}</p>
            {selectedDiscount > 0 && <p className="text-miamz-green text-xs font-bold flex items-center gap-1"><Percent className="h-3 w-3" />Jusqu'à -{selectedDiscount}% de réduction disponible</p>}
          </div>
        )}
        <Button onClick={() => date && onReserve(date, time, Number(partySize))} disabled={!date} className="w-full h-12 text-base font-bold rounded-xl" size="lg">Réserver</Button>
        <p className="text-[10px] text-muted-foreground text-center">Confirmation immédiate · Annulation gratuite</p>
      </div>
    </div>
  );
}
