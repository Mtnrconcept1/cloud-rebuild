import { useEffect } from "react";
import { Heart, Star, TrendingUp, MapPinned, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PromoCarousel from "@/components/PromoCarousel";
import LoyaltyStatus from "@/components/LoyaltyStatus";
import NearbyRestaurantsMap from "@/components/NearbyRestaurantsMap";
import { useAuth } from "@/lib/auth";
import { useActiveFeatures } from "@/lib/featureFlags";
import { trackEvent, setAnalyticsUser, getActiveSponsoredRestaurants } from "@/lib/analytics";
import { prioritizeSponsoredCards } from "@/lib/sponsoredPlacement";

import HeroSection from "@/components/home/HeroSection";
import SearchAndCategories from "@/components/home/SearchAndCategories";
import SolidaritySection from "@/components/home/SolidaritySection";
import RestaurantSection from "@/components/home/RestaurantSection";
import FeaturesSection from "@/components/home/FeaturesSection";
import FooterSection from "@/components/home/FooterSection";

export default function Index() {
  const { user } = useAuth();
  const activeFeatures = useActiveFeatures();

  useEffect(() => {
    setAnalyticsUser(user?.id || null);
    if (user) trackEvent({ eventType: "page_view", eventData: { page: "home" } });
  }, [user]);

  const { data: sponsoredCampaigns } = useQuery({
    queryKey: ["sponsored-home"],
    queryFn: () => getActiveSponsoredRestaurants("home"),
  });

  const { data: restaurants } = useQuery({
    queryKey: ["popular-restaurants"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("is_active", true).order("rating", { ascending: false }).limit(6);
      return data || [];
    },
  });

  const { data: allRestaurants } = useQuery({
    queryKey: ["all-restaurants-map"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id, name, cuisine_type, rating, city, address").eq("is_active", true);
      return data || [];
    },
  });

  const { data: nearbyRestaurants } = useQuery({
    queryKey: ["nearby-restaurants"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(4);
      return data || [];
    },
  });

  const { data: topRated } = useQuery({
    queryKey: ["top-rated-restaurants"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("is_active", true).order("rating", { ascending: false }).limit(4);
      return data || [];
    },
  });

  const { data: donatedMeals = 0 } = useQuery({
    queryKey: ["donated-meals-total"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_total_donated_meals");
      return error ? 0 : Number(data) || 0;
    },
  });

  const { data: donatedPoints = 0 } = useQuery({
    queryKey: ["donated-points-total"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_total_donated_points");
      if (!error) return Number(data) || 0;
      const { data: rows, error: fallbackError } = await supabase.from("solidarity_donations" as any).select("points_amount");
      if (fallbackError) return 0;
      return (rows || []).reduce((sum: number, r: any) => sum + (r.points_amount || 0), 0);
    },
  });

  const sponsoredCards = (sponsoredCampaigns || [])
    .map((camp: any) => {
      const r = camp.restaurants;
      if (!r) return null;
      return { ...r, campaign_id: camp.id, promo_image: camp.image_url || null };
    })
    .filter(Boolean) as any[];

  const nearbyCards = prioritizeSponsoredCards((nearbyRestaurants || []) as any[], sponsoredCards, { topSlots: 3, maxItems: (nearbyRestaurants || []).length || undefined });
  const topRatedCards = prioritizeSponsoredCards((topRated || []) as any[], sponsoredCards, { topSlots: 3, maxItems: (topRated || []).length || undefined });
  const popularCards = prioritizeSponsoredCards((restaurants || []) as any[], sponsoredCards, { topSlots: 3, maxItems: (restaurants || []).length || undefined });

  return (
    <main className="min-h-screen pb-20">
      <HeroSection />

      <section className="pt-4 pb-8 md:pt-6 md:pb-12 bg-miamz-warm/20">
        <div className="container px-4"><PromoCarousel /></div>
      </section>

      <SearchAndCategories />

      {user && (
        <section className="py-8 bg-gradient-to-b from-background to-secondary/10">
          <div className="container"><LoyaltyStatus /></div>
        </section>
      )}

      <SolidaritySection donatedMeals={donatedMeals} donatedPoints={donatedPoints} />

      <RestaurantSection title="Susceptible de vous plaire" subtitle="Pour vous" icon={Heart} iconColor="text-pink-500" restaurants={nearbyCards} linkText="Découvrir plus" />
      <RestaurantSection title="Meilleurs établissements" subtitle="Incontournables" icon={Star} iconColor="text-amber-500" restaurants={topRatedCards} bgClass="bg-secondary/10" linkText="Voir tout le classement" />
      <RestaurantSection title="Populaires en ce moment" subtitle="Tendances" icon={TrendingUp} iconColor="text-primary" restaurants={popularCards} />

      <section className="py-10 md:py-14">
        <div className="container space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <MapPinned className="h-4 w-4 text-blue-500" />
              </div>
              <h2 className="font-display text-xl md:text-2xl font-semibold">Restaurants à proximité</h2>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-1" asChild>
              <Link to="/recherche">Voir la liste <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>
          <NearbyRestaurantsMap restaurants={allRestaurants || []} />
        </div>
      </section>

      <FeaturesSection activeFeatures={activeFeatures} />
      <FooterSection />
    </main>
  );
}
