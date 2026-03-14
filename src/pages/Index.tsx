import { useEffect } from "react";
import { BadgePercent, ChevronRight, Heart, MapPinned, MoonStar, SunMedium, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import PromoCarousel from "@/components/PromoCarousel";
import CampaignBanner from "@/components/CampaignBanner";
import LoyaltyStatus from "@/components/LoyaltyStatus";
import NearbyRestaurantsMap from "@/components/NearbyRestaurantsMap";
import HeroSection from "@/components/home/HeroSection";
import SearchAndCategories from "@/components/home/SearchAndCategories";
import SolidaritySection from "@/components/home/SolidaritySection";
import RestaurantSection from "@/components/home/RestaurantSection";
import FeaturesSection from "@/components/home/FeaturesSection";
import FooterSection from "@/components/home/FooterSection";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useActiveFeatures } from "@/lib/featureFlags";
import { getActiveSponsoredRestaurants, setAnalyticsUser, trackEvent } from "@/lib/analytics";
import { formatRestaurantCategorySummary } from "@/lib/restaurantCategories";
import { prioritizeSponsoredCards } from "@/lib/sponsoredPlacement";

type SearchSort =
  | "pertinence"
  | "note"
  | "promotion"
  | "prix"
  | "popularite"
  | "nouveaux"
  | "mieux_notes_mois"
  | "plus_reserves_mois";

type HomeRailParams = {
  city?: string | null;
  query?: string | null;
  sortBy?: SearchSort;
  deliveryOnly?: boolean;
  limit?: number;
};

function mapSearchRailRestaurant(row: any) {
  return {
    ...row,
    cuisine_type: formatRestaurantCategorySummary(
      Array.isArray(row?.category_names) ? row.category_names : [],
      row?.cuisine_type || "",
    ),
  };
}

async function fetchHomeRail(params: HomeRailParams) {
  const { data, error } = await (supabase.rpc as any)("search_restaurants_catalog", {
    p_query: params.query || null,
    p_city: params.city || null,
    p_cuisine: null,
    p_price_range: null,
    p_delivery_only: params.deliveryOnly || false,
    p_min_rating: 0,
    p_sort_by: params.sortBy || "popularite",
    p_sort_direction: "desc",
    p_limit: params.limit || 4,
    p_offset: 0,
  });

  if (error) throw error;
  return ((data || []) as any[]).map(mapSearchRailRestaurant);
}

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

  const { data: allRestaurants } = useQuery({
    queryKey: ["all-restaurants-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, cuisine_type, rating, city, address, image_url")
        .eq("is_active", true);
      return data || [];
    },
  });

  const { data: lunchRail = [] } = useQuery({
    queryKey: ["home-rail-lunch"],
    queryFn: () => fetchHomeRail({ sortBy: "popularite", deliveryOnly: true, limit: 4 }),
  });

  const { data: dinnerRail = [] } = useQuery({
    queryKey: ["home-rail-dinner"],
    queryFn: () => fetchHomeRail({ sortBy: "plus_reserves_mois", limit: 4 }),
  });

  const { data: offersRail = [] } = useQuery({
    queryKey: ["home-rail-offers"],
    queryFn: () => fetchHomeRail({ sortBy: "promotion", limit: 4 }),
  });

  const { data: trendingRail = [] } = useQuery({
    queryKey: ["home-rail-trending"],
    queryFn: () => fetchHomeRail({ sortBy: "note", limit: 6 }),
  });

  const { data: userContext } = useQuery({
    queryKey: ["home-user-context", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [profileResponse, favoritesResponse, ordersResponse, reservationsResponse] = await Promise.all([
        supabase.from("profiles").select("city").eq("user_id", user!.id).maybeSingle(),
        supabase
          .from("favorites")
          .select("restaurant_id, restaurants(*)")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("orders")
          .select("restaurant_id, created_at")
          .eq("user_id", user!.id)
          .eq("status", "delivered")
          .order("created_at", { ascending: false })
          .limit(6),
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
      if (ordersResponse.error) throw ordersResponse.error;
      if (reservationsResponse.error) throw reservationsResponse.error;

      const favoriteRestaurants = ((favoritesResponse.data || []) as any[])
        .map((row) => row.restaurants)
        .filter(Boolean)
        .map((row) => ({
          ...row,
          cuisine_type: row?.cuisine_type || "",
        }));

      const favoriteIds = new Set(favoriteRestaurants.map((restaurant: any) => String(restaurant.id)));
      const recentRestaurantIds = [
        ...((ordersResponse.data || []) as any[]).map((row) => row.restaurant_id),
        ...((reservationsResponse.data || []) as any[]).map((row) => row.restaurant_id),
      ]
        .map((value) => String(value || ""))
        .filter((value) => value && !favoriteIds.has(value));

      const uniqueRecentIds = [...new Set(recentRestaurantIds)].slice(0, 6);
      let recentRestaurants: any[] = [];

      if (uniqueRecentIds.length > 0) {
        const { data: restaurantRows, error: restaurantError } = await supabase
          .from("restaurants")
          .select("*")
          .eq("is_active", true)
          .in("id", uniqueRecentIds);

        if (restaurantError) throw restaurantError;

        const byId = new Map(((restaurantRows || []) as any[]).map((restaurant) => [String(restaurant.id), restaurant]));
        recentRestaurants = uniqueRecentIds
          .map((id) => byId.get(id))
          .filter(Boolean);
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
    queryFn: () => fetchHomeRail({ city: userContext?.city || null, sortBy: "popularite", limit: 4 }),
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
      return (rows || []).reduce((sum: number, row: any) => sum + (row.points_amount || 0), 0);
    },
  });

  const sponsoredCards = (sponsoredCampaigns || [])
    .map((campaign: any) => {
      const restaurant = campaign.restaurants;
      if (!restaurant) return null;
      return { ...restaurant, campaign_id: campaign.id, promo_image: campaign.image_url || null };
    })
    .filter(Boolean) as any[];

  const lunchCards = prioritizeSponsoredCards(lunchRail as any[], sponsoredCards, {
    topSlots: 2,
    maxItems: lunchRail.length || undefined,
  });
  const dinnerCards = prioritizeSponsoredCards(dinnerRail as any[], sponsoredCards, {
    topSlots: 2,
    maxItems: dinnerRail.length || undefined,
  });
  const offersCards = prioritizeSponsoredCards(offersRail as any[], sponsoredCards, {
    topSlots: 2,
    maxItems: offersRail.length || undefined,
  });
  const trendingCards = prioritizeSponsoredCards(trendingRail as any[], sponsoredCards, {
    topSlots: 3,
    maxItems: trendingRail.length || undefined,
  });
  const personalCards = (userContext?.personalRestaurants || []) as any[];

  return (
    <main className="min-h-screen pb-20">
      <HeroSection />

      <section className="bg-miamz-warm/20 pt-4 pb-8 md:pt-6 md:pb-12">
        <div className="container space-y-4 px-4">
          <CampaignBanner page="home" maxBanners={1} />
          <PromoCarousel />
        </div>
      </section>

      <SearchAndCategories />

      {user ? (
        <section className="bg-gradient-to-b from-background to-secondary/10 py-8">
          <div className="container">
            <LoyaltyStatus />
          </div>
        </section>
      ) : null}

      <SolidaritySection donatedMeals={donatedMeals} donatedPoints={donatedPoints} />

      <RestaurantSection
        title="Vos habitudes"
        subtitle="Pour vous"
        icon={Heart}
        iconColor="text-pink-500"
        restaurants={personalCards}
        linkText="Retrouver vos favoris"
      />
      <RestaurantSection
        title={userContext?.city ? `Dans ${userContext.city}` : "Pres de chez vous"}
        subtitle="Local"
        icon={MapPinned}
        iconColor="text-sky-500"
        restaurants={cityRail as any[]}
        bgClass="bg-secondary/10"
        linkText="Explorer votre ville"
      />
      <RestaurantSection
        title="Pour ce midi"
        subtitle="Rapide et fiable"
        icon={SunMedium}
        iconColor="text-amber-500"
        restaurants={lunchCards}
        linkText="Voir plus pour le midi"
      />
      <RestaurantSection
        title="Pour ce soir"
        subtitle="Reservations et plaisir"
        icon={MoonStar}
        iconColor="text-indigo-500"
        restaurants={dinnerCards}
        bgClass="bg-secondary/10"
        linkText="Voir plus pour le soir"
      />
      <RestaurantSection
        title="Bons plans du moment"
        subtitle="Offres actives"
        icon={BadgePercent}
        iconColor="text-emerald-500"
        restaurants={offersCards}
        linkText="Voir toutes les offres"
      />
      <RestaurantSection
        title="Tendances en ce moment"
        subtitle="Tops"
        icon={TrendingUp}
        iconColor="text-primary"
        restaurants={trendingCards}
      />

      <section className="py-10 md:py-14">
        <div className="container space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                <MapPinned className="h-4 w-4 text-blue-500" />
              </div>
              <h2 className="font-display text-xl font-semibold md:text-2xl">Restaurants a proximite</h2>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" asChild>
              <Link to="/recherche">
                Voir la liste <ChevronRight className="h-4 w-4" />
              </Link>
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
