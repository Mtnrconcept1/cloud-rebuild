import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarDays, Heart, MapPinned, Sparkles } from "lucide-react";

import HeroSection from "@/components/home/HeroSection";
import SearchAndCategories from "@/components/home/SearchAndCategories";
import RestaurantSection from "@/components/home/RestaurantSection";
import FooterSection from "@/components/home/FooterSection";
import NearbyRestaurantsMap from "@/components/NearbyRestaurantsMap";
import FeaturesSection from "@/components/home/FeaturesSection";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { setAnalyticsUser, trackEvent } from "@/lib/analytics";

type ReservationRailParams = {
  city?: string | null;
  sortBy?: "rating" | "created_at" | "review_count";
  limit?: number;
};

async function fetchReservationRail(params: ReservationRailParams) {
  let query = supabase
    .from("restaurants")
    .select("id, name, cuisine_type, rating, review_count, price_range, image_url, city, address, created_at")
    .eq("is_active", true)
    .eq("supports_reservation", true);

  if (params.city) {
    query = query.eq("city", params.city);
  }

  const { data, error } = await query
    .order(params.sortBy || "rating", { ascending: false })
    .limit(params.limit || 6);

  if (error) throw error;
  return data || [];
}

const sectionStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

const sectionBounce = {
  hidden: { opacity: 0, y: 80, scale: 0.88 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 180, damping: 12, mass: 0.8 },
  },
};

export default function Index() {
  const { user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setAnalyticsUser(user?.id || null);
    if (user) {
      trackEvent({ eventType: "page_view", eventData: { page: "home_reservation_only" } });
    }
  }, [user]);

  const { data: allRestaurants = [] } = useQuery({
    queryKey: ["reservation-restaurants-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, cuisine_type, rating, city, address, image_url")
        .eq("is_active", true)
        .eq("supports_reservation", true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: userContext } = useQuery({
    queryKey: ["home-user-context", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [profileResponse, favoritesResponse, reservationsResponse] = await Promise.all([
        supabase.from("profiles").select("city").eq("user_id", user!.id).maybeSingle(),
        supabase
          .from("favorites")
          .select("restaurant_id, restaurants(*)")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("reservations")
          .select("restaurant_id, created_at")
          .eq("user_id", user!.id)
          .in("status", ["confirmed", "completed"])
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      if (profileResponse.error) throw profileResponse.error;
      if (favoritesResponse.error) throw favoritesResponse.error;
      if (reservationsResponse.error) throw reservationsResponse.error;

      const favoriteRestaurants = ((favoritesResponse.data || []) as any[])
        .map((row) => row.restaurants)
        .filter(Boolean)
        .filter((restaurant: any) => restaurant.supports_reservation !== false);

      const favoriteIds = new Set(favoriteRestaurants.map((restaurant: any) => String(restaurant.id)));
      const recentReservationIds = ((reservationsResponse.data || []) as any[])
        .map((row) => String(row.restaurant_id || ""))
        .filter((restaurantId) => restaurantId && !favoriteIds.has(restaurantId));

      const uniqueRecentIds = [...new Set(recentReservationIds)].slice(0, 6);
      let recentRestaurants: any[] = [];

      if (uniqueRecentIds.length > 0) {
        const { data: restaurantRows, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name, cuisine_type, rating, review_count, price_range, image_url, city, address")
          .eq("is_active", true)
          .eq("supports_reservation", true)
          .in("id", uniqueRecentIds);

        if (restaurantError) throw restaurantError;

        const byId = new Map(((restaurantRows || []) as any[]).map((restaurant) => [String(restaurant.id), restaurant]));
        recentRestaurants = uniqueRecentIds.map((restaurantId) => byId.get(restaurantId)).filter(Boolean);
      }

      return {
        city: String(profileResponse.data?.city || "").trim(),
        personalRestaurants: [...favoriteRestaurants, ...recentRestaurants].slice(0, 4),
      };
    },
  });

  const { data: cityRail = [] } = useQuery({
    queryKey: ["home-rail-city", userContext?.city || ""],
    enabled: Boolean(userContext?.city),
    queryFn: () => fetchReservationRail({ city: userContext?.city || null, sortBy: "rating", limit: 4 }),
  });

  const { data: popularRail = [] } = useQuery({
    queryKey: ["home-rail-popular"],
    queryFn: () => fetchReservationRail({ sortBy: "rating", limit: 6 }),
  });

  const { data: recentRail = [] } = useQuery({
    queryKey: ["home-rail-recent"],
    queryFn: () => fetchReservationRail({ sortBy: "created_at", limit: 6 }),
  });

  const personalCards = (userContext?.personalRestaurants || []) as any[];

  return (
    <main className="min-h-screen pb-20">
      <HeroSection contentVisible={isVisible} />

      <motion.div variants={sectionStagger} initial="hidden" animate={isVisible ? "visible" : "hidden"}>
        <motion.div variants={sectionBounce}>
          <SearchAndCategories />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <RestaurantSection
            title="Vos habitudes"
            subtitle="Pour vous"
            icon={Heart}
            iconColor="text-pink-500"
            restaurants={personalCards}
            linkText="Retrouver vos favoris"
          />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <RestaurantSection
            title={userContext?.city ? `Dans ${userContext.city}` : "Pres de chez vous"}
            subtitle="Local"
            icon={MapPinned}
            iconColor="text-sky-500"
            restaurants={cityRail as any[]}
            bgClass="bg-secondary/10"
            linkText="Explorer votre ville"
          />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <RestaurantSection
            title="Les tables les mieux notees"
            subtitle="Selection"
            icon={Sparkles}
            iconColor="text-amber-500"
            restaurants={popularRail as any[]}
            linkText="Voir plus de restaurants"
          />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <RestaurantSection
            title="Nouvelles adresses a reserver"
            subtitle="Nouveautes"
            icon={CalendarDays}
            iconColor="text-indigo-500"
            restaurants={recentRail as any[]}
            bgClass="bg-secondary/10"
            linkText="Voir les nouvelles tables"
          />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <section className="py-10 md:py-14">
            <div className="container space-y-5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <MapPinned className="h-4 w-4 text-blue-500" />
                </div>
                <h2 className="font-display text-xl font-semibold md:text-2xl">Restaurants a proximite</h2>
              </div>
              <NearbyRestaurantsMap restaurants={allRestaurants || []} />
            </div>
          </section>
        </motion.div>

        <motion.div variants={sectionBounce}>
          <FeaturesSection activeFeatures={new Set()} />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <FooterSection />
        </motion.div>
      </motion.div>
    </main>
  );
}
