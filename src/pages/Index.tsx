import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BadgePercent, ChevronRight, Compass, Heart, MapPinned, MoonStar, ShoppingCart, Sparkles, SunMedium, Timer, TrendingUp, UserRound, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PromoCarousel from "@/components/PromoCarousel";
import LoyaltyStatus from "@/components/LoyaltyStatus";
import CampaignBanner from "@/components/CampaignBanner";
import HeroSection from "@/components/home/HeroSection";
import CuisineCategoryStrip from "@/components/home/CuisineCategoryStrip";
import SolidaritySection from "@/components/home/SolidaritySection";
import RestaurantSection from "@/components/home/RestaurantSection";
import SectionShowcaseHeader from "@/components/home/SectionShowcaseHeader";
import FeaturesSection from "@/components/home/FeaturesSection";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { getCurrentPosition } from "@/lib/geolocation-native";
import {
  filterRestaurantsWithinRadius,
  isRestaurantWithinRadius,
  type Coordinates,
} from "@/lib/nearbyRestaurants";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { getCommercialDemoClientRestaurants } from "@/lib/commercialDemoClientCatalog";
import { getActiveSponsoredRestaurants, setAnalyticsUser, trackEvent } from "@/lib/analytics";
import {
  formatProgressiveCountdown,
  formatProgressiveServiceDate,
  getCurrentProgressiveDiscount,
  getNextProgressiveDiscount,
  getProgressiveOfferProgressPercent,
  getProgressiveOfferRemainingTables,
  getProgressiveOfferServiceLabel,
  selectDailyProgressiveOffers,
  type ProgressiveReservationOffer,
} from "@/lib/progressiveReservationOffers";
import { formatRestaurantCategorySummary } from "@/lib/restaurantCategories";
import { shuffleRestaurantsWithVisuals } from "@/lib/randomizedRestaurantOrder";
import { prioritizeSponsoredCards } from "@/lib/sponsoredPlacement";

const supabase = getSupabase();
const NearbyRestaurantsMap = lazy(() => import("@/components/NearbyRestaurantsMap"));
const HOME_MAP_RESTAURANTS_LIMIT = 100;
const HOME_RAIL_GEO_CANDIDATE_LIMIT = 100;
const HOME_RAIL_RANDOM_CANDIDATE_LIMIT = 24;
const HOME_NEARBY_RADIUS_KM = 5;
const PROGRESSIVE_OFFERS_TABLE = "reservation_progressive_offers";

const SECTION_HEADER_IMAGES = {
  personal: "/images/section-headers/heart-3d.png",
  local: "/images/section-headers/pin-3d.png",
  lunch: "/desig app/burger.png",
  reservation: "/desig app/calendrier.png",
  promo: "/desig app/chefsection.png",
  offers: "/desig app/cadeau.png",
  trending: "/desig app/flamme.png",
  nearby: "/desig app/chefsection2.png",
} as const;

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

function isMissingOptionalSupabaseRelation(error: unknown, relationName: string) {
  if (!error || typeof error !== "object") return false;
  const details = error as { code?: string; message?: string; details?: string; hint?: string };
  const code = String(details.code || "").toUpperCase();
  const text = [
    details.message,
    details.details,
    details.hint,
  ].join(" ").toLowerCase();

  return (
    code === "42P01" ||
    code === "PGRST200" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    text.includes("schema cache") ||
    text.includes("does not exist") ||
    text.includes("not found")
  ) && text.includes(relationName.toLowerCase());
}

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

function getProgressiveOfferRestaurant(offer: ProgressiveReservationOffer) {
  const restaurant = offer.restaurants;
  return Array.isArray(restaurant) ? restaurant[0] : restaurant;
}

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const demoSessionKey = isCommercialDemoClient ? commercialDemoFrame.config.sessionId : "production";
  const globalActiveFeatures = useActiveFeatures({ enabled: !isCommercialDemoClient });
  const activeFeatures = isCommercialDemoClient
    ? new Set(commercialDemoFrame.snapshot.active_features)
    : globalActiveFeatures;
  const demoRestaurants = useMemo(
    () => isCommercialDemoClient
      ? getCommercialDemoClientRestaurants(commercialDemoFrame.snapshot).map(mapSearchRailRestaurant)
      : [],
    [commercialDemoFrame, isCommercialDemoClient],
  );
  const deliveryEnabled = activeFeatures.has("livraison");
  const campaignsEnabled = activeFeatures.has("campagnes-pub");
  const [isVisible, setIsVisible] = useState(false);
  const [shouldLoadMap, setShouldLoadMap] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [userCoordinates, setUserCoordinates] = useState<Coordinates | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const homepageShuffleSeed = useRef(Math.floor(Math.random() * 1_000_000_000));
  const todayServiceDate = useMemo(() => toLocalDateInputValue(new Date(nowMs)), [nowMs]);
  const geolocationQueryKey = userCoordinates
    ? `${userCoordinates.latitude.toFixed(4)}:${userCoordinates.longitude.toFixed(4)}`
    : "unavailable";
  const railCandidateLimit = userCoordinates
    ? HOME_RAIL_GEO_CANDIDATE_LIMIT
    : HOME_RAIL_RANDOM_CANDIDATE_LIMIT;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isCommercialDemoClient) {
      setUserCoordinates(null);
      return;
    }

    let active = true;
    getCurrentPosition()
      .then((position) => {
        if (!active) return;
        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        setUserCoordinates({ latitude, longitude });
      })
      .catch(() => {
        if (active) setUserCoordinates(null);
      });

    return () => {
      active = false;
    };
  }, [isCommercialDemoClient]);

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
    if (isCommercialDemoClient) return;
    setAnalyticsUser(user?.id || null);
    if (user) trackEvent({ eventType: "page_view", eventData: { page: "home" } });
  }, [isCommercialDemoClient, user]);

  const { data: sponsoredCampaigns } = useQuery({
    queryKey: ["sponsored-home", demoSessionKey],
    queryFn: () => getActiveSponsoredRestaurants("home", "restaurant_cards"),
    enabled: campaignsEnabled && !isCommercialDemoClient,
  });

  const { data: allRestaurants } = useQuery({
    queryKey: ["all-restaurants-map", geolocationQueryKey, demoSessionKey],
    enabled: shouldLoadMap,
    queryFn: async () => {
      if (isCommercialDemoClient) return demoRestaurants;
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, cuisine_type, rating, city, address, image_url, latitude, longitude")
        .eq("is_active", true)
        .order("rating", { ascending: false })
        .limit(HOME_MAP_RESTAURANTS_LIMIT);
      const restaurants = data || [];
      return userCoordinates
        ? filterRestaurantsWithinRadius(restaurants, userCoordinates, HOME_NEARBY_RADIUS_KM)
        : restaurants;
    },
  });

  const { data: lunchRail = [] } = useQuery({
    queryKey: ["home-rail-lunch", deliveryEnabled, geolocationQueryKey, demoSessionKey],
    queryFn: () => isCommercialDemoClient
      ? demoRestaurants
      : fetchHomeRail({
        sortBy: "popularite",
        deliveryOnly: deliveryEnabled,
        limit: railCandidateLimit,
      }),
  });

  const { data: dinnerRail = [] } = useQuery({
    queryKey: ["home-rail-dinner", geolocationQueryKey, demoSessionKey],
    queryFn: () => isCommercialDemoClient
      ? demoRestaurants
      : fetchHomeRail({ sortBy: "plus_reserves_mois", limit: railCandidateLimit }),
  });

  const { data: offersRail = [] } = useQuery({
    queryKey: ["home-rail-offers", geolocationQueryKey, demoSessionKey],
    queryFn: () => isCommercialDemoClient
      ? demoRestaurants
      : fetchHomeRail({ sortBy: "promotion", limit: railCandidateLimit }),
  });

  const progressiveOffersBaseQuery = {
    queryKey: ["home-progressive-reservation-offers", todayServiceDate],
  };

  const { data: progressiveOffers = [] } = useQuery({
    queryKey: [...progressiveOffersBaseQuery.queryKey, geolocationQueryKey, demoSessionKey],
    queryFn: async () => {
      if (isCommercialDemoClient) return [] as ProgressiveReservationOffer[];
      const { data, error } = await (supabase.from(PROGRESSIVE_OFFERS_TABLE as any) as any)
        .select(`
          *,
          restaurants (
            id,
            name,
            city,
            image_url,
            cuisine_type,
            rating,
            latitude,
            longitude
          )
        `)
        .eq("status", "active")
        .eq("service_date", todayServiceDate)
        .gt("booking_cutoff_at", new Date().toISOString())
        .order("booking_cutoff_at", { ascending: true })
        .limit(24);

      if (error) {
        if (isMissingOptionalSupabaseRelation(error, PROGRESSIVE_OFFERS_TABLE)) return [];
        throw error;
      }
      return (data || []) as ProgressiveReservationOffer[];
    },
    staleTime: 30_000,
  });

  const visibleProgressiveOffers = useMemo(() => {
    const imageBackedOffers = progressiveOffers.filter((offer) => {
      const restaurant = getProgressiveOfferRestaurant(offer) as any;
      return Boolean(String(restaurant?.image_url || "").trim());
    });
    const localizedOffers = userCoordinates
      ? imageBackedOffers.filter((offer) => {
        const restaurant = getProgressiveOfferRestaurant(offer) as any;
        return Boolean(restaurant) && isRestaurantWithinRadius(
          restaurant,
          userCoordinates,
          HOME_NEARBY_RADIUS_KM,
        );
      })
      : imageBackedOffers;

    return selectDailyProgressiveOffers(localizedOffers, {
      reservationDate: todayServiceDate,
      maxOffers: 3,
    });
  }, [progressiveOffers, todayServiceDate, userCoordinates]);

  const { data: trendingRail = [] } = useQuery({
    queryKey: ["home-rail-trending", geolocationQueryKey, demoSessionKey],
    queryFn: () => isCommercialDemoClient
      ? demoRestaurants
      : fetchHomeRail({ sortBy: "note", limit: railCandidateLimit }),
  });

  const { data: userContext } = useQuery({
    queryKey: ["home-user-context", user?.id, demoSessionKey],
    enabled: Boolean(isCommercialDemoClient || user?.id),
    queryFn: async () => {
      if (isCommercialDemoClient) {
        const demoOrder = commercialDemoFrame.snapshot.order;
        return {
          city: commercialDemoFrame.snapshot.demo_restaurant.city || "Genève",
          fullName: demoOrder?.customer_name || "Client Démo",
          phone: "",
          personalRestaurants: demoRestaurants,
        };
      }
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
    queryKey: ["home-rail-city", userContext?.city || "", geolocationQueryKey, demoSessionKey],
    enabled: Boolean(userCoordinates || userContext?.city),
    queryFn: () => isCommercialDemoClient
      ? demoRestaurants
      : fetchHomeRail({
        city: userCoordinates ? null : userContext?.city || null,
        sortBy: "popularite",
        limit: railCandidateLimit,
      }),
  });

  const { data: donatedPoints = 0 } = useQuery({
    queryKey: ["donated-points-total", demoSessionKey],
    queryFn: async () => {
      if (isCommercialDemoClient) return 0;
      const { data, error } = await (supabase as any).rpc("get_total_donated_points");
      if (error) throw error;
      return Number(data) || 0;
    },
  });

  const localizeCards = (restaurants: any[], maxItems: number) => {
    const localizedRestaurants = userCoordinates
      ? filterRestaurantsWithinRadius(
        restaurants,
        userCoordinates,
        HOME_NEARBY_RADIUS_KM,
      )
      : restaurants;

    return shuffleRestaurantsWithVisuals(
      localizedRestaurants,
      `${homepageShuffleSeed.current}:${maxItems}`,
    ).slice(0, maxItems);
  };

  const sponsoredCards = localizeCards(
    (sponsoredCampaigns || [])
      .map((campaign: any) => {
        const restaurant = campaign.restaurants;
        if (!restaurant) return null;
        return {
          ...restaurant,
          campaign_id: campaign.id,
          promo_image: campaign.image_url || null,
          campaign_title: campaign.title || null,
          campaign_body: campaign.body || null,
          campaign_creative: campaign.channels?.creative || null,
        };
      })
      .filter(Boolean) as any[],
    6,
  );

  const currentHour = new Date().getHours();
  const lunchFocus = currentHour < 16;
  const organicLunchCards = localizeCards(lunchRail as any[], 4);
  const organicDinnerCards = localizeCards(dinnerRail as any[], 4);
  const primaryBaseCards = lunchFocus ? organicLunchCards : organicDinnerCards;
  const primarySponsoredCards = prioritizeSponsoredCards(primaryBaseCards, sponsoredCards, {
    topSlots: 3,
    maxItems: primaryBaseCards.length || undefined,
  });
  const lunchCards = lunchFocus ? primarySponsoredCards : organicLunchCards;
  const dinnerCards = lunchFocus ? organicDinnerCards : primarySponsoredCards;
  const offersCards = localizeCards(offersRail as any[], 4);
  const trendingCards = localizeCards(trendingRail as any[], 6);
  const personalCards = localizeCards((userContext?.personalRestaurants || []) as any[], 4);
  const localCards = localizeCards(cityRail as any[], 4);
  const hasSavedCity = Boolean(userContext?.city);
  const hasProfileName = Boolean(userContext?.fullName);
  const profileNeedsAttention = Boolean(user && (!hasSavedCity || !hasProfileName));
  const primaryRail = lunchFocus
    ? {
      title: "Pour ce midi",
      subtitle: deliveryEnabled ? "Rapide et fiable" : "Sélection du midi",
      icon: SunMedium,
      iconColor: "text-amber-500",
      restaurants: lunchCards,
      linkText: "Voir plus pour le midi",
      linkTo: buildSearchLink({
        city: userCoordinates ? null : userContext?.city || null,
        sort: "popularite",
        delivery: deliveryEnabled ? "true" : undefined,
      }),
    }
    : {
      title: "Pour ce soir",
      subtitle: "Réservations et plaisir",
      icon: MoonStar,
      iconColor: "text-indigo-500",
      restaurants: dinnerCards,
      linkText: "Voir plus pour le soir",
      linkTo: buildSearchLink({
        city: userCoordinates ? null : userContext?.city || null,
        sort: "plus_reserves_mois",
      }),
    };
  const secondaryRail = lunchFocus
    ? {
      title: "Pour ce soir",
      subtitle: "Réservations et plaisir",
      icon: MoonStar,
      iconColor: "text-indigo-500",
      restaurants: dinnerCards,
      linkText: "Voir plus pour le soir",
      linkTo: buildSearchLink({
        city: userCoordinates ? null : userContext?.city || null,
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
        city: userCoordinates ? null : userContext?.city || null,
        sort: "popularite",
        delivery: deliveryEnabled ? "true" : undefined,
      }),
    };
  const showSecondaryRail = secondaryRail.restaurants.length > 0;
  const showTrendingRail = trendingCards.length > 0;
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
        cta: "Compléter mon profil",
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
        href: buildSearchLink({ city: userCoordinates ? null : userContext?.city || null }),
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
      {!isCommercialDemoClient ? (
        <section className="container py-4">
          <CampaignBanner page="home" maxBanners={1} />
        </section>
      ) : null}

      {visibleProgressiveOffers.length > 0 ? (
        <section className="container py-4" aria-labelledby="progressive-offers-title">
          <div className="overflow-hidden rounded-[28px] border border-orange-200 bg-orange-50/90 shadow-[0_18px_44px_rgba(249,115,22,0.12)] dark:bg-orange-950/20">
            <div className="flex flex-col gap-4 p-5 md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-primary">
                    <Timer className="h-5 w-5" />
                    <p className="text-xs font-semibold uppercase tracking-[0.24em]">Offres progressives</p>
                  </div>
                  <h2 id="progressive-offers-title" className="font-display text-2xl font-bold md:text-3xl">
                    Plus vous reservez, plus la remise grandit
                  </h2>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    Les participants obtiennent le meme pourcentage final a la fin du compte a rebours.
                  </p>
                </div>
                <Button asChild variant="outline" className="w-full rounded-full bg-background/80 md:w-auto">
                  <Link to={buildSearchLink({ sort: "promotion", promo: true })}>
                    Explorer les offres
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {visibleProgressiveOffers.map((offer) => {
                  const restaurant = getProgressiveOfferRestaurant(offer);
                  const restaurantId = restaurant?.id || offer.restaurant_id;
                  const currentDiscount = getCurrentProgressiveDiscount(offer);
                  const nextDiscount = getNextProgressiveDiscount(offer);
                  const remainingTables = getProgressiveOfferRemainingTables(offer);
                  const reservationLink = `/restaurant/${restaurantId}?reserve=true&progressiveOfferId=${offer.id}`;

                  return (
                    <Link
                      key={offer.id}
                      to={reservationLink}
                      className="group overflow-hidden rounded-2xl border bg-background shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="aspect-[2.2/1] overflow-hidden bg-muted">
                        <img
                          src={restaurant?.image_url || "/images/kebab-box-spread.jpeg"}
                          alt={restaurant?.name || offer.title}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{restaurant?.name || "Restaurant TOK"}</p>
                            <p className="text-xs text-muted-foreground">{formatProgressiveServiceDate(offer.service_date)} · service {getProgressiveOfferServiceLabel(offer)}</p>
                          </div>
                          <Badge className="bg-orange-500 text-white">-{nextDiscount}%</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-orange-50 p-2 text-orange-900 dark:bg-orange-950/30 dark:text-orange-100">
                            <p className="text-muted-foreground">Remise actuelle</p>
                            <p className="text-base font-bold">-{currentDiscount}%</p>
                          </div>
                          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                            <p className="text-muted-foreground">Tables restantes</p>
                            <p className="flex items-center gap-1 text-base font-bold">
                              <Users className="h-3.5 w-3.5" />
                              {remainingTables}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-orange-500"
                              style={{ width: `${getProgressiveOfferProgressPercent(offer)}%` }}
                            />
                          </div>
                          <p className="text-xs font-medium text-primary">
                            Fin dans {formatProgressiveCountdown(offer.countdown_ends_at, nowMs)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : null}

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

        {user && !isCommercialDemoClient ? (
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
            bgClass="bg-rose-50/70 dark:bg-rose-950/10"
            accentClassName="bg-pink-500/80"
            headerTheme="rose"
            headerImageSrc={SECTION_HEADER_IMAGES.personal}
            linkText="Retrouver vos favoris"
            linkTo="/profil?tab=favoris"
          />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <RestaurantSection
            title={userCoordinates ? "À moins de 5 km de vous" : userContext?.city ? `Dans ${userContext.city}` : "Près de chez vous"}
            subtitle={userCoordinates ? "Votre position actuelle" : "Local"}
            icon={MapPinned}
            iconColor="text-sky-500"
            restaurants={localCards}
            bgClass="bg-sky-50/75 dark:bg-sky-950/10"
            accentClassName="bg-sky-500/80"
            headerTheme="sky"
            headerImageSrc={SECTION_HEADER_IMAGES.local}
            linkText={userCoordinates ? "Explorer autour de vous" : "Explorer votre ville"}
            linkTo={buildSearchLink({ city: userCoordinates ? null : userContext?.city || null })}
          />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <RestaurantSection
            title={primaryRail.title}
            subtitle={primaryRail.subtitle}
            icon={primaryRail.icon}
            iconColor={primaryRail.iconColor}
            restaurants={primaryRail.restaurants}
            bgClass={lunchFocus ? "bg-amber-50/70 dark:bg-amber-950/10" : "bg-indigo-50/70 dark:bg-indigo-950/10"}
            accentClassName={lunchFocus ? "bg-amber-500/80" : "bg-indigo-500/80"}
            headerTheme={lunchFocus ? "amber" : "indigo"}
            headerImageSrc={lunchFocus ? SECTION_HEADER_IMAGES.lunch : SECTION_HEADER_IMAGES.reservation}
            linkText={primaryRail.linkText}
            linkTo={primaryRail.linkTo}
          />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <section className="relative isolate z-10 overflow-visible border-y border-border/70 bg-orange-50/70 py-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/10 dark:bg-orange-950/10 md:py-12">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent" aria-hidden="true" />
            <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-1.5 bg-primary/80" aria-hidden="true" />
            <div className="container relative space-y-6">
              <SectionShowcaseHeader
                title={"Promotions\u00a0et activations\u00a0du moment"}
                subtitle="À ne pas manquer"
                icon={Sparkles}
                iconColor="text-primary"
                imageSrc={SECTION_HEADER_IMAGES.promo}
                theme="orange"
                className="-mx-4 min-h-[222px] pb-16 pt-5 sm:mx-0 sm:min-h-[258px] sm:pb-20 sm:pt-7 md:min-h-[286px] md:pb-20 md:pt-8"
                linkText="Voir les actualités"
                linkTo="/actualites"
                contentClassName="z-30 max-w-[12rem] pr-0 sm:max-w-xs sm:pr-20 md:z-30 md:max-w-lg md:pr-48"
                illustrationClassName="z-[60] right-4 -top-6 w-44 sm:right-6 sm:-top-8 sm:w-72 md:right-8 md:-top-10 md:w-[26rem]"
                imageClassName="right-0 h-44 w-44 translate-x-0 sm:h-72 sm:w-72 md:h-[26rem] md:w-[26rem]"
                titleClassName="text-[1.9rem] leading-[1.05] sm:text-4xl md:text-5xl"
              />
              <div className="space-y-4">
                {isCommercialDemoClient ? (
                  <div className="rounded-2xl border border-dashed bg-background/80 p-5 text-sm text-muted-foreground">
                    Les promotions de démonstration restent limitées au restaurant simulé.
                  </div>
                ) : <PromoCarousel />}
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
            bgClass="bg-emerald-50/75 dark:bg-emerald-950/10"
            accentClassName="bg-emerald-500/80"
            headerTheme="emerald"
            headerImageSrc={SECTION_HEADER_IMAGES.offers}
            linkText="Voir toutes les offres"
            linkTo={buildSearchLink({ sort: "promotion", promo: true, city: userCoordinates ? null : userContext?.city || null })}
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
              bgClass={lunchFocus ? "bg-indigo-50/70 dark:bg-indigo-950/10" : "bg-amber-50/70 dark:bg-amber-950/10"}
              accentClassName={lunchFocus ? "bg-indigo-500/80" : "bg-amber-500/80"}
              headerTheme={lunchFocus ? "indigo" : "amber"}
              headerImageSrc={lunchFocus ? SECTION_HEADER_IMAGES.reservation : SECTION_HEADER_IMAGES.lunch}
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
              bgClass="bg-slate-50/90 dark:bg-slate-900/30"
              accentClassName="bg-primary/80"
              headerTheme="orange"
              headerImageSrc={SECTION_HEADER_IMAGES.trending}
              linkTo={buildSearchLink({ sort: "note", city: userCoordinates ? null : userContext?.city || null })}
            />
          </motion.div>
        ) : null}

        <motion.div variants={sectionBounce}>
          <section ref={mapSectionRef} className="relative isolate overflow-hidden border-y border-border/70 bg-blue-50/60 py-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/10 dark:bg-blue-950/10 md:py-16">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent" aria-hidden="true" />
            <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-1.5 bg-blue-500/80" aria-hidden="true" />
            <div className="container relative space-y-6">
              <SectionShowcaseHeader
                title={userCoordinates ? "Restaurants dans un rayon de 5 km" : "Restaurants à proximité"}
                subtitle={userCoordinates ? "Selon votre position actuelle" : "Autour de vous"}
                icon={MapPinned}
                iconColor="text-blue-500"
                imageSrc={SECTION_HEADER_IMAGES.nearby}
                theme="blue"
                linkText="Voir la liste"
                linkTo={buildSearchLink({ city: userCoordinates ? null : userContext?.city || null })}
                titleClassName="text-3xl sm:text-4xl md:text-5xl"
              />
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
          <SolidaritySection donatedPoints={donatedPoints} />
        </motion.div>

        <motion.div variants={sectionBounce}>
          <FeaturesSection activeFeatures={activeFeatures} />
        </motion.div>
      </motion.div>
    </main>
  );
}
