import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChefHat, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { getSupabase } from "@/integrations/supabase/client";
import { readCommercialDemoToolState } from "@/lib/commercialDemoRestaurantTools";

const supabase = getSupabase();
const DEMO_STORAGE_KEY = "daily-dish-ai";

type PublicDailyDish = {
  id?: string;
  restaurant_id?: string;
  service_date: string;
  name: string;
  description: string;
  price_cents: number;
  image_url: string | null;
  published_at?: string;
};

type DemoDailyDishState = {
  published_dish?: PublicDailyDish | null;
};

function todayInZurich() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export default function RestaurantDailyDishCard({
  restaurantId,
  fallbackImageUrl,
}: {
  restaurantId: string;
  fallbackImageUrl?: string | null;
}) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const demoSessionId = commercialDemoFrame?.config.sessionId || null;
  const date = todayInZurich();
  const { data: dish } = useQuery<PublicDailyDish | null>({
    queryKey: ["restaurant-daily-dish", restaurantId, date, demoSessionId || "live"],
    queryFn: async () => {
      if (demoSessionId) {
        const state = readCommercialDemoToolState<DemoDailyDishState>(demoSessionId, DEMO_STORAGE_KEY, {});
        return state.published_dish?.service_date === date ? state.published_dish : null;
      }
      const { data, error } = await (supabase.from("restaurant_daily_dishes" as any) as any)
        .select("id, restaurant_id, service_date, name, description, price_cents, image_url, published_at")
        .eq("restaurant_id", restaurantId)
        .eq("service_date", date)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as PublicDailyDish | null;
    },
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });

  if (!dish) return null;
  const imageUrl = dish.image_url || fallbackImageUrl || null;

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-background to-amber-500/10 shadow-sm">
      <div className="grid md:grid-cols-[minmax(220px,0.8fr)_1.2fr]">
        {imageUrl ? (
          <img src={imageUrl} alt={dish.name} className="h-56 w-full object-cover md:h-full md:min-h-64" />
        ) : (
          <div className="flex h-40 items-center justify-center bg-emerald-500/10 md:h-full md:min-h-64">
            <ChefHat className="h-14 w-14 text-emerald-600" />
          </div>
        )}
        <div className="flex flex-col justify-center p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1 bg-emerald-600 text-white"><Sparkles className="h-3 w-3" /> Plat du jour</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Aujourd’hui</span>
          </div>
          <h2 className="mt-3 font-display text-2xl font-black sm:text-3xl">{dish.name}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{dish.description}</p>
          <div className="mt-4 flex items-end justify-between gap-3">
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{(dish.price_cents / 100).toFixed(2)} CHF</p>
            <span className="text-xs text-muted-foreground">Dans la limite des disponibilités</span>
          </div>
        </div>
      </div>
    </section>
  );
}
