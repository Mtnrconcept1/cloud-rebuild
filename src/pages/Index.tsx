import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BadgePercent, ChevronRight, Compass, Heart, MapPinned, MoonStar, ShoppingCart, Sparkles, SunMedium, TrendingUp, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import PromoCarousel from "@/components/PromoCarousel";
import CampaignBanner from "@/components/CampaignBanner";
import LoyaltyStatus from "@/components/LoyaltyStatus";
import HeroSection from "@/components/home/HeroSection";
import CuisineCategoryStrip from "@/components/home/CuisineCategoryStrip";
import SolidaritySection from "@/components/home/SolidaritySection";
import RestaurantSection from "@/components/home/RestaurantSection";
import FeaturesSection from "@/components/home/FeaturesSection";
import FooterSection from "@/components/home/FooterSection";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { getActiveSponsoredRestaurants, setAnalyticsUser, trackEvent } from "@/lib/analytics";
import { formatRestaurantCategorySummary } from "@/lib/restaurantCategories";
import { prioritizeSponsoredCards } from "@/lib/sponsoredPlacement";

const supabase = getSupabase();
const NearbyRestaurantsMap = lazy(() => import("@/components/NearbyRestaurantsMap"));

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

function buildSearchLink(params: Record<string, string | null | undefined | boolean>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false || value === "") return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return `/recherche${query ? `?${query}` : ""}`;
}

const sectionStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

const sectionBounce = {
  hidden: { opacity: 0, y: 80, scale: 0.88 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: "spring" as const, stiffness: 180, damping: 12, mass: 0.8 },
  },
};

export default function Index() {
  const { user } = useAuth();
  const { itemCount } = useCart();
  const activeFeatures = useActiveFeatures();
  const deliveryEnabled = activeFeatures.has("livraison");
  const campaignsEnabled = activeFeatures.has("campagnes-pub");
  const [isVisible, setIsVisible] = useState(false);
  const [shouldLoadMap, setShouldLoadMap] = useState(false);
  const mapSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (shouldLoadMap) return;

    const node = mapSectionRef.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      setShouldLoadMap(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoadMap(true);
        observer.disconnect();
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoadMap]);

  useEffect(() => {
    setAnalyticsUser(user?.id || null);
    if (user) trackEvent({ eventType: "page_view", eventData: { page: "home" } });
  }, [user]);

  const { data: sponsoredCampaigns } = useQuery({
    queryKey: ["sponsored-home"],
    queryFn: () => getActiveSponsoredRestaurants("home"),
    enabled: campaignsEnabled,
  });

  const { data: allRestaurants } = useQuery({
    queryKey: ["all-restaurants-map"],
    enabled: shouldLoadMap,
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, cuisine_type, rating, city, address, image_url")
        .eq("is_active", true);
      return data || [];
    },
  });

  const { data: lunchRail = [] } = useQuery({
    queryKey: ["home-rail-lunch", deliveryEnabled],
    queryFn: () => fetchHomeRail({ sortBy: "popularite", deliveryOnly: deliveryEnabled, limit: 4 }),
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
        supabase.from("profiles").select("city, full_name, phone").eq("user_id", user!.id).maybeSingle(),
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
        fullName: String(profileResponse.data?.full_name || "").trim(),
        phone: String(profileResponse.data?.phone || "").trim(),
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
      return {
        ...restaurant,
        campaign_id: campaign.id,
        promo_image: campaign.image_url || null,
        campaign_title: campaign.title || null,
        campaign_body: campaign.body || null,
      };
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
  const hasSavedCity = Boolean(userContext?.city);
  const hasProfileName = Boolean(userContext?.fullName);
  const profileNeedsAttention = Boolean(user && (!hasSavedCity || !hasProfileName));
  const currentHour = new Date().getHours();
  const lunchFocus = currentHour < 16;
  const primaryRail = lunchFocus
    ? {
      title: "Pour ce midi",
      subtitle: deliveryEnabled ? "Rapide et fiable" : "Sélection du midi",
      icon: SunMedium,
      iconColor: "text-amber-500",
      restaurants: lunchCards,
      linkText: "Voir plus pour le midi",
      linkTo: buildSearchLink({
        city: userContext?.city || null,
        sort: "popularite",
        delivery: deliveryEnabled ? "true" : undefined,
      }),
    }
    : {
      title: "Pour ce soir",
      subtitle: "Reservations et plaisir",
      icon: MoonStar,
      iconColor: "text-indigo-500",
      restaurants: dinnerCards,
      linkText: "Voir plus pour le soir",
      linkTo: buildSearchLink({
        city: userContext?.city || null,
        sort: "plus_reserves_mois",
      }),
    };
  const secondaryRail = lunchFocus
    ? {
      title: "Pour ce soir",
      subtitle: "Reservations et plaisir",
      icon: MoonStar,
      iconColor: "text-indigo-500",
      restaurants: dinnerCards,
      linkText: "Voir plus pour le soir",
      linkTo: buildSearchLink({
        city: userContext?.city || null,
        sort: "plus_reserves_mois",
      }),
    }
    : {
      title: "Pour ce midi",
      subtitle: deliveryEnabled ? "Rapide et fiable" : "Sélection du midi",
      icon: SunMedium,
      iconColor: "text-amber-500",
      restaurants: lunchCards,
      linkText: "Voir plus pour le midi",
      linkTo: buildSearchLink({
        city: userContext?.city || null,
        sort: "popularite",
        delivery: deliveryEnabled ? "true" : undefined,
      }),
    };
  const showSecondaryRail = secondaryRail.restaurants.length > 0 && (!user || (!personalCards.length && !cityRail.length));
  const showTrendingRail = trendingCards.length > 0 && (!user || personalCards.length < 3);
  const focusCards = [
    itemCount > 0
      ? {
        key: "cart",
        eyebrow: "A reprendre",
        title: "Votre panier vous attend",
        description: `Vous avez déjà ${itemCount} article${itemCount > 1 ? "s" : ""} en attente. Reprenez le parcours au bon endroit.`,
        cta: "Revenir au panier",
        href: "/panier",
        icon: ShoppingCart,
        tint: "bg-primary/10 text-primary",
      }
      : null,
    profileNeedsAttention
      ? {
        key: "profile",
        eyebrow: "Personnalisation",
        title: hasSavedCity ? "Finalisez votre profil" : "Choisissez votre ville",
        description: hasSavedCity
          ? "Ajoutez votre nom complet pour rendre vos confirmations et favoris plus clairs."
          : "Ajoutez votre ville pour voir plus vite les bonnes adresses autour de vous.",
        cta: "Completer mon profil",
        href: "/profil?tab=infos",
        icon: UserRound,
        tint: "bg-sky-500/10 text-sky-600",
      }
      : null,
    user && itemCount === 0 && personalCards.length === 0
      ? {
        key: "discover",
        eyebrow: "Découverte",
        title: "Lancez votre première sélection",
        description: "Commencez par une recherche simple. Le reste du parcours restera ensuite beaucoup plus personnalisé.",
        cta: "Explorer les restaurants",
        href: buildSearchLink({ city: userContext?.city || null }),
        icon: Compass,
        tint: "bg-emerald-500/10 text-emerald-600",
      }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    eyebrow: string;
    title: string;
    description: string;
    cta: string;
    href: string;
    icon: typeof ShoppingCart;
    tint: string;
  }>;

  return (
    <main className="min-h-screen pb-20">
      <HeroSection contentVisible={isVisible} />
      <CuisineCategoryStrip />

      <motion.div
        variants={sectionStagger}
        initial="hidden"
        animate={isVisible ? "visible" : "hidden"}
      >
        {focusCards.length > 0 ? (
          <motion.div variants={sectionBounce}>
            <section className="py-6 md:py-8">
              <div className="container grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {focusCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.key}
                      className="rounded-[28px] border bg-card/85 p-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)] backdrop-blur-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${card.tint}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                            {card.eyebrow}
                          </p>
                          <h2 className="font-display text-xl font-bold leading-tight">
                            {card.title}
                          </h2>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {card.description}
                      </p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <Button className="rounded-full px-4" asChild>
                          <Link to={card.href}>
                            {card.cta}
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                        {card.key === "cart" ? (
                          <span className="text-xs font-medium text-muted-foreground">Retour direct au bon état</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </motion.div>
        ) : null}

        {user ? (
          <motion.div variants={sectionBounce}>
            <section className="bg-gradient-to-b from-background to-secondary/10 py-8">
              <div className="container">
                <LoyaltyStatus />
              </div>
            </section>
          </motion.div>
        ) : null}

        <motion.div variants={sectionBounce}>
          <RestaurantSection
            title="Vos habitudes"
            subtitle="Pour vous"
            icon={Heart}
            iconColor="text-pink-500"
            restaurants={personalCards}
            linkText="Retrouver vos favoris"
            linkTo="/profil?tab=favoris"
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
            linkTo={buildSearchLink({ city: userContext?.city || null })}
          />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <RestaurantSection
            title={primaryRail.title}
            subtitle={primaryRail.subtitle}
            icon={primaryRail.icon}
            iconColor={primaryRail.iconColor}
            restaurants={primaryRail.restaurants}
            linkText={primaryRail.linkText}
            linkTo={primaryRail.linkTo}
          />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <section className="bg-miamz-warm/10 py-8 md:py-10">
            <div className="container space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">A ne pas manquer</p>
                  <h2 className="font-display text-2xl font-bold">Promotions et activations du moment</h2>
                </div>
              </div>
              <div className="space-y-4">
                <CampaignBanner page="home" maxBanners={1} />
                <PromoCarousel />
              </div>
            </div>
          </section>
        </motion.div>

        <motion.div variants={sectionBounce}>
          <RestaurantSection
            title="Bons plans du moment"
            subtitle="Offres actives"
            icon={BadgePercent}
            iconColor="text-emerald-500"
            restaurants={offersCards}
            linkText="Voir toutes les offres"
            linkTo={buildSearchLink({ sort: "promotion", promo: true, city: userContext?.city || null })}
          />
        </motion.div>

        {showSecondaryRail ? (
          <motion.div variants={sectionBounce}>
            <RestaurantSection
              title={secondaryRail.title}
              subtitle={secondaryRail.subtitle}
              icon={secondaryRail.icon}
              iconColor={secondaryRail.iconColor}
              restaurants={secondaryRail.restaurants}
              bgClass="bg-secondary/10"
              linkText={secondaryRail.linkText}
              linkTo={secondaryRail.linkTo}
            />
          </motion.div>
        ) : null}

        {showTrendingRail ? (
          <motion.div variants={sectionBounce}>
            <RestaurantSection
              title="Tendances en ce moment"
              subtitle="Tops"
              icon={TrendingUp}
              iconColor="text-primary"
              restaurants={trendingCards}
              linkTo={buildSearchLink({ sort: "note", city: userContext?.city || null })}
            />
          </motion.div>
        ) : null}

        <motion.div variants={sectionBounce}>
          <section ref={mapSectionRef} className="py-10 md:py-14">
            <div className="container space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                    <MapPinned className="h-4 w-4 text-blue-500" />
                  </div>
                  <h2 className="font-display text-xl font-semibold md:text-2xl">Restaurants à proximité</h2>
                </div>
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" asChild>
                  <Link to={buildSearchLink({ city: userContext?.city || null })}>
                    Voir la liste <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              {shouldLoadMap ? (
                <Suspense
                  fallback={
                    <div className="flex h-[380px] items-center justify-center rounded-2xl border bg-muted/30 text-sm font-medium text-muted-foreground">
                      Chargement de la carte...
                    </div>
                  }
                >
                  <NearbyRestaurantsMap restaurants={allRestaurants || []} />
                </Suspense>
              ) : (
                <div className="h-[380px] rounded-2xl border bg-muted/30" aria-hidden="true" />
              )}
            </div>
          </section>
        </motion.div>

        <motion.div variants={sectionBounce}>
          <SolidaritySection donatedMeals={donatedMeals} donatedPoints={donatedPoints} />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <FeaturesSection activeFeatures={activeFeatures} />
        </motion.div>
        <motion.div variants={sectionBounce}>
          <FooterSection deliveryEnabled={deliveryEnabled} />
        </motion.div>
      </motion.div>
    </main>
  );
}
