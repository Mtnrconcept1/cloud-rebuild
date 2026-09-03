import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { getSupabase } from "@/integrations/supabase/client";
import CityAutocomplete from "@/components/CityAutocomplete";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import CampaignBanner from "@/components/CampaignBanner";
import RestaurantCard from "@/components/RestaurantCard";
import { trackSearch, getActiveSponsoredRestaurants } from "@/lib/analytics";
import { prioritizeSponsoredCards } from "@/lib/sponsoredPlacement";
import {
  formatRestaurantCategorySummary,
  PREDEFINED_RESTAURANT_CATEGORIES,
  restaurantMatchesCategoryFilter,
} from "@/lib/restaurantCategories";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { getCommercialDemoClientRestaurants } from "@/lib/commercialDemoClientCatalog";

const supabase = getSupabase();
const SEARCH_PAGE_SIZE = 54;

type SortValue =
  | "pertinence"
  | "note"
  | "promotion"
  | "prix"
  | "popularite"
  | "nouveaux"
  | "mieux_notes_mois"
  | "plus_reserves_mois";
type SortDirection = "asc" | "desc";

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "pertinence", label: "Pertinence" },
  { value: "note", label: "Note" },
  { value: "promotion", label: "Promotion" },
  { value: "prix", label: "Prix" },
  { value: "popularite", label: "Popularite" },
  { value: "nouveaux", label: "Nouveaux restaurants" },
  { value: "mieux_notes_mois", label: "Mieux notes du mois" },
  { value: "plus_reserves_mois", label: "Plus réservés du mois" },
];

const ORDER_OPTIONS: { value: SortDirection; label: string }[] = [
  { value: "desc", label: "Decroissant" },
  { value: "asc", label: "Croissant" },
];

interface SortContext {
  sortBy: SortValue;
  sortDirection: SortDirection;
  query: string;
  monthlyReservationsByRestaurant: Record<string, number>;
  monthlyOrdersByRestaurant: Record<string, number>;
  promotionScoreByRestaurant: Record<string, number>;
}

function getDefaultSortDirection(sortBy: SortValue): SortDirection {
  return sortBy === "prix" ? "asc" : "desc";
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toTimestamp(value: unknown): number {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeMinRating10(raw: string): number {
  if (!raw) return 0;
  const parsed = toNumber(raw, 0);
  if (parsed <= 0) return 0;
  return Math.max(0, Math.min(10, parsed <= 5 ? parsed * 2 : parsed));
}

function getRelevanceScore(card: any, ctx: SortContext): number {
  const normalizedQuery = ctx.query.trim().toLowerCase();
  const id = String(card?.id || "");
  const name = String(card?.name || "").toLowerCase();
  const description = String(card?.description || "").toLowerCase();
  const cuisineType = String(card?.cuisine_type || "").toLowerCase();
  const address = String(card?.address || "").toLowerCase();
  const city = String(card?.city || "").toLowerCase();
  const categoryBlob = (
    Array.isArray(card?._categories)
      ? card._categories.map((c: any) => String(c.name || "")).join(" ")
      : ""
  ).toLowerCase();
  const rating = toNumber(card?.rating);
  const reviews = toNumber(card?.review_count);
  const monthlyReservations = toNumber(ctx.monthlyReservationsByRestaurant[id]);
  const monthlyOrders = toNumber(ctx.monthlyOrdersByRestaurant[id]);
  const promotion = Math.max(toNumber(ctx.promotionScoreByRestaurant[id]), card?.campaign_id ? 15 : 0);

  let score = 0;
  if (normalizedQuery) {
    if (name === normalizedQuery) score += 220;
    else if (name.startsWith(normalizedQuery)) score += 170;
    else if (name.includes(normalizedQuery)) score += 120;
    if (cuisineType.includes(normalizedQuery)) score += 80;
    if (categoryBlob.includes(normalizedQuery)) score += 80;
    if (description.includes(normalizedQuery)) score += 50;
    if (address.includes(normalizedQuery)) score += 45;
    if (city.includes(normalizedQuery)) score += 40;
    if (card?.matched_via_menu || card?._matchedViaMenu) score += 60;

    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      for (const tk of tokens) {
        if (name.includes(tk)) score += 40;
        if (cuisineType.includes(tk)) score += 25;
        if (categoryBlob.includes(tk)) score += 25;
        if (description.includes(tk)) score += 15;
        if (address.includes(tk)) score += 15;
        if (city.includes(tk)) score += 12;
      }
    }
  } else {
    score += rating * 18 + reviews * 0.9;
  }

  score += monthlyReservations * 4 + monthlyOrders * 3 + promotion * 1.4;
  if (card?.delivery_available) score += 6;
  return score;
}

function compareRestaurants(a: any, b: any, ctx: SortContext): number {
  const aId = String(a?.id || "");
  const bId = String(b?.id || "");
  const aName = String(a?.name || "");
  const bName = String(b?.name || "");
  const aRating = toNumber(a?.rating);
  const bRating = toNumber(b?.rating);
  const aReviews = toNumber(a?.review_count);
  const bReviews = toNumber(b?.review_count);
  const aPrice = toNumber(a?.price_range, 99);
  const bPrice = toNumber(b?.price_range, 99);
  const aMonthlyReservations = toNumber(ctx.monthlyReservationsByRestaurant[aId]);
  const bMonthlyReservations = toNumber(ctx.monthlyReservationsByRestaurant[bId]);
  const aMonthlyOrders = toNumber(ctx.monthlyOrdersByRestaurant[aId]);
  const bMonthlyOrders = toNumber(ctx.monthlyOrdersByRestaurant[bId]);
  const aPromotion = Math.max(toNumber(ctx.promotionScoreByRestaurant[aId]), a?.campaign_id ? 15 : 0);
  const bPromotion = Math.max(toNumber(ctx.promotionScoreByRestaurant[bId]), b?.campaign_id ? 15 : 0);
  const defaultDirection = getDefaultSortDirection(ctx.sortBy);
  const applyDirection = (value: number) => (ctx.sortDirection === defaultDirection ? value : -value);

  if (ctx.sortBy === "note") {
    return applyDirection(bRating - aRating || bReviews - aReviews || aName.localeCompare(bName));
  }
  if (ctx.sortBy === "promotion") {
    return applyDirection(bPromotion - aPromotion || bRating - aRating || bReviews - aReviews || aName.localeCompare(bName));
  }
  if (ctx.sortBy === "prix") {
    return applyDirection(aPrice - bPrice || bRating - aRating || bReviews - aReviews || aName.localeCompare(bName));
  }
  if (ctx.sortBy === "popularite") {
    const aPopularity = aReviews + (aMonthlyReservations * 4) + (aMonthlyOrders * 3);
    const bPopularity = bReviews + (bMonthlyReservations * 4) + (bMonthlyOrders * 3);
    return applyDirection(bPopularity - aPopularity || bRating - aRating || aName.localeCompare(bName));
  }
  if (ctx.sortBy === "nouveaux") {
    const aCreated = toTimestamp(a?.created_at);
    const bCreated = toTimestamp(b?.created_at);
    return applyDirection(bCreated - aCreated || bRating - aRating || aName.localeCompare(bName));
  }
  if (ctx.sortBy === "mieux_notes_mois") {
    const aHasMonthly = aMonthlyReservations > 0 ? 1 : 0;
    const bHasMonthly = bMonthlyReservations > 0 ? 1 : 0;
    return applyDirection(
      bHasMonthly - aHasMonthly
      || bRating - aRating
      || bMonthlyReservations - aMonthlyReservations
      || bReviews - aReviews
      || aName.localeCompare(bName),
    );
  }
  if (ctx.sortBy === "plus_reserves_mois") {
    return applyDirection(bMonthlyReservations - aMonthlyReservations || bRating - aRating || bReviews - aReviews || aName.localeCompare(bName));
  }

  const aRelevance = getRelevanceScore(a, ctx);
  const bRelevance = getRelevanceScore(b, ctx);
  return applyDirection(bRelevance - aRelevance || bRating - aRating || bReviews - aReviews || aName.localeCompare(bName));
}

function getRestaurantCuisineSummary(restaurant: any): string {
  return formatRestaurantCategorySummary(
    Array.isArray(restaurant?._categories) ? restaurant._categories.map((category: any) => category.name) : [],
    restaurant?.cuisine_type || "",
  );
}

function toCardProps(r: any) {
  return {
    id: r.id,
    slug: r.slug || null,
    name: r.name,
    cuisine: getRestaurantCuisineSummary(r),
    rating: r.rating || 0,
    reviewCount: r.review_count || 0,
    imageUrl: r.image_url || "",
    priceRange: r.price_range || 2,
    deliveryAvailable: !!r.delivery_available,
    city: r.city || "",
    address: r.address || "",
    openingHours: Object.prototype.hasOwnProperty.call(r, "opening_hours") ? r.opening_hours : undefined,
    supportsReservation: Object.prototype.hasOwnProperty.call(r, "supports_reservation") ? r.supports_reservation : undefined,
    sponsoredCampaignId: r.campaign_id || undefined,
    sponsoredPromoImage: r.promo_image || undefined,
    sponsoredCampaignTitle: r.campaign_title || undefined,
    sponsoredCampaignBody: r.campaign_body || undefined,
    sponsoredCampaignCreative: r.campaign_creative || undefined,
  };
}

export default function Recherche() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const demoSessionKey = isCommercialDemoClient ? commercialDemoFrame.config.sessionId : "production";
  const globalActiveFeatures = useActiveFeatures({ enabled: !isCommercialDemoClient });
  const activeFeatures = isCommercialDemoClient
    ? new Set(commercialDemoFrame.snapshot.active_features)
    : globalActiveFeatures;
  const deliveryEnabled = activeFeatures.has("livraison");
  const campaignsEnabled = activeFeatures.has("campagnes-pub");
  const sponsoredRotationSeed = useMemo(() => Math.floor(Math.random() * 1_000_000), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(activeQuery);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const cuisine = searchParams.get("cuisine") || "";
  const city = searchParams.get("city") || "";
  const promo = searchParams.get("promo") || "";
  const price = searchParams.get("price") || "";
  const delivery = searchParams.get("delivery") || "";
  const minRatingParam = searchParams.get("rating") || "";
  const minRating10 = normalizeMinRating10(minRatingParam);
  const minRatingDb = minRating10 > 0 ? minRating10 / 2 : 0;
  const minRatingSelectValue = minRating10 > 0 ? String(minRating10) : "0";
  const sortParam = searchParams.get("sort");
  const orderParam = searchParams.get("order");
  const sortBy: SortValue = SORT_OPTIONS.some((opt) => opt.value === sortParam)
    ? (sortParam as SortValue)
    : promo === "true"
      ? "promotion"
      : "pertinence";
  const defaultSortDirection = getDefaultSortDirection(sortBy);
  const sortDirection: SortDirection = ORDER_OPTIONS.some((opt) => opt.value === orderParam) ? (orderParam as SortDirection) : defaultSortDirection;

  useEffect(() => {
    setQuery(activeQuery);
  }, [activeQuery]);

  const {
    data: organicSearchPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "restaurants-search",
      activeQuery,
      cuisine,
      city,
      price,
      delivery,
      minRatingDb,
      sortBy,
      sortDirection,
      deliveryEnabled,
      demoSessionKey,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = Number(pageParam) || 0;
      if (isCommercialDemoClient) {
        const items = getCommercialDemoClientRestaurants(commercialDemoFrame.snapshot).map((restaurant) => ({
          ...restaurant,
          is_active: true,
          status: "demo",
          opening_hours: {},
          avg_rating: restaurant.rating,
          rating_count: restaurant.review_count,
          _categories: restaurant.cuisine_type ? [{
            id: restaurant.cuisine_type,
            name: restaurant.cuisine_type,
            slug: String(restaurant.cuisine_type).toLowerCase(),
          }] : [],
        }));
        return { items, totalCount: items.length, nextOffset: null as number | null };
      }
      const { data, error } = await (supabase.rpc as any)("search_restaurants_catalog_page", {
        p_query: activeQuery || null,
        p_city: city || null,
        p_cuisine: cuisine || null,
        p_price_range: price ? Number(price) : null,
        p_delivery_only: deliveryEnabled && delivery === "true",
        p_min_rating: minRatingDb || 0,
        p_sort_by: sortBy,
        p_sort_direction: sortDirection,
        p_limit: SEARCH_PAGE_SIZE,
        p_offset: offset,
      });

      if (error) throw error;
      const page = Array.isArray(data) ? data[0] : data;
      const rawItems = Array.isArray(page?.items) ? page.items : [];
      const items = rawItems.map((restaurant: any) => ({
        ...restaurant,
        _categories: Array.isArray(restaurant?.category_names)
          ? restaurant.category_names.map((name: string, index: number) => ({
            name,
            slug: Array.isArray(restaurant?.category_slugs) ? restaurant.category_slugs[index] || null : null,
          }))
          : [],
      }));
      const parsedTotalCount = Number(page?.total_count);
      const parsedNextOffset = Number(page?.next_offset);
      return {
        items,
        totalCount: Number.isFinite(parsedTotalCount) ? parsedTotalCount : items.length,
        nextOffset: page?.next_offset === null
          || page?.next_offset === undefined
          || !Number.isFinite(parsedNextOffset)
          ? null
          : parsedNextOffset,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });

  const organicSearchResults = useMemo(
    () => organicSearchPages?.pages.flatMap((page) => page.items) ?? [],
    [organicSearchPages],
  );
  const organicSearchTotal = Number(
    organicSearchPages?.pages[0]?.totalCount ?? organicSearchResults.length,
  );

  const { data: cuisineOptions = [] } = useQuery({
    queryKey: ["search-cuisine-options", demoSessionKey],
    queryFn: async () => {
      if (isCommercialDemoClient) {
        const cuisineName = commercialDemoFrame.snapshot.demo_restaurant.cuisine_type || "Restaurant";
        return [{ id: "demo", name: cuisineName, slug: String(cuisineName).toLowerCase(), keywords: [] }];
      }
      const fallback = PREDEFINED_RESTAURANT_CATEGORIES.map((category) => ({
        id: category.slug,
        name: category.name,
        slug: category.slug,
        keywords: category.keywords,
      }));
      const { data, error } = await (supabase.from("cuisines") as any)
        .select("id, name, slug, keywords")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data?.length ? data : fallback) as any[];
    },
  });

  const sortedCuisineOptions = useMemo(
    () => [...cuisineOptions].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name))),
    [cuisineOptions],
  );
  const quickCuisineOptions = useMemo(() => sortedCuisineOptions.slice(0, 6), [sortedCuisineOptions]);

  const organicRestaurantById = useMemo(
    () => new Map((organicSearchResults || []).map((restaurant: any) => [String(restaurant.id), restaurant])),
    [organicSearchResults],
  );

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
    setQuery("");
  };

  const { data: sponsoredCampaigns } = useQuery({
    queryKey: ["sponsored-search", demoSessionKey],
    queryFn: () => getActiveSponsoredRestaurants("search", "restaurant_cards"),
    enabled: campaignsEnabled && !isCommercialDemoClient,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter("q", query);
  };

  const matchesSponsoredFilters = (restaurant: any) => {
    const qText = activeQuery.trim().toLowerCase();
    const name = (restaurant?.name || "").toLowerCase();
    const description = (restaurant?.description || "").toLowerCase();
    const cuisineType = (restaurant?.cuisine_type || "").toLowerCase();
    const addressValue = (restaurant?.address || "").toLowerCase();
    const cityValue = (restaurant?.city || "").toLowerCase();
    const matchesCategoryText = restaurantMatchesCategoryFilter({
      query: qText || null,
      cuisineFilter: cuisine || null,
      categories: restaurant?._categories || [],
      legacyCuisineType: restaurant?.cuisine_type || null,
    });
    if (qText) {
      const tokens = qText.split(/\s+/).filter(Boolean);
      const fullMatch = name.includes(qText)
        || description.includes(qText)
        || cuisineType.includes(qText)
        || addressValue.includes(qText)
        || cityValue.includes(qText)
        || matchesCategoryText
        || restaurant?._matchedViaMenu;
      const tokenMatch = tokens.length > 1
        && tokens.some((tk: string) => name.includes(tk) || description.includes(tk) || cuisineType.includes(tk) || addressValue.includes(tk) || cityValue.includes(tk));
      if (!fullMatch && !tokenMatch) return false;
    }
    if (cuisine && !matchesCategoryText) return false;
    if (city && !cityValue.includes(city.toLowerCase())) return false;
    if (price && Number(restaurant?.price_range || 0) !== Number(price)) return false;
    if (deliveryEnabled && delivery === "true" && !restaurant?.delivery_available) return false;
    if (minRatingDb > 0 && Number(restaurant?.rating || 0) < minRatingDb) return false;
    return true;
  };

  const sponsoredCards = (sponsoredCampaigns || [])
    .map((camp: any) => {
      const r = camp.restaurants;
      if (!r) return null;
      const enrichedRestaurant = organicRestaurantById.get(String(r.id)) as (Record<string, unknown> & { _categories?: unknown[] }) | undefined;
      return {
        ...r,
        ...(enrichedRestaurant || {}),
        campaign_id: camp.id,
        promo_image: camp.image_url || null,
        campaign_title: camp.title || null,
        campaign_body: camp.body || null,
        campaign_creative: camp.channels?.creative || null,
        _categories: enrichedRestaurant?._categories || [],
      };
    })
    .filter((r: any) => !!r && matchesSponsoredFilters(r)) as any[];

  const mergedCards = useMemo(
    () => isCommercialDemoClient
      ? organicSearchResults
      : prioritizeSponsoredCards(organicSearchResults as any[], sponsoredCards, { topSlots: 3, rotationSeed: sponsoredRotationSeed }),
    [isCommercialDemoClient, organicSearchResults, sponsoredCards, sponsoredRotationSeed],
  );

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (activeQuery) labels.push(`Recherche: ${activeQuery}`);
    if (city) labels.push(`Ville: ${city}`);
    if (cuisine) {
      const option = sortedCuisineOptions.find((entry: any) => String(entry.slug || entry.name).toLowerCase() === cuisine);
      labels.push(`Cuisine: ${option?.name || cuisine}`);
    }
    if (price) labels.push(`Budget: ${price === "1" ? "CHF" : price === "2" ? "CHF++" : "CHF+++"}`);
    if (minRating10 > 0) labels.push(`Note: ${minRating10.toFixed(1)}/10+`);
    if (deliveryEnabled && delivery === "true") labels.push("Livraison");
    if (promo === "true") labels.push("Bons plans");
    return labels;
  }, [activeQuery, city, cuisine, sortedCuisineOptions, price, minRating10, deliveryEnabled, delivery, promo]);

  useEffect(() => {
    if (isCommercialDemoClient || !hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }

    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isCommercialDemoClient, isFetchingNextPage]);

  useEffect(() => {
    if (!isCommercialDemoClient && mergedCards.length > 0 && (activeQuery || cuisine || city)) {
      trackSearch(activeQuery || cuisine || city, mergedCards.length);
    }
  }, [activeQuery, city, cuisine, isCommercialDemoClient, mergedCards.length]);

  return (
    <main className="min-h-screen bg-background dark:bg-[radial-gradient(circle_at_18%_0%,rgba(249,115,22,0.14),transparent_28rem),radial-gradient(circle_at_86%_12%,rgba(34,211,238,0.10),transparent_24rem)]">
      <div className="container space-y-6 py-8">
        <div className="neon-panel rounded-[32px] border bg-card/70 p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Explorer</p>
                <h1 className="font-display text-3xl font-bold dark:text-white">Trouvez le bon restaurant, plus vite</h1>
                <p className="max-w-2xl text-sm text-muted-foreground dark:text-slate-300">
                  Recherchez par nom, cuisine ou ville, puis affinez uniquement si nécessaire.
                </p>
              </div>
              <div className="rounded-2xl bg-primary/5 px-4 py-3 text-right dark:border dark:border-primary/25 dark:bg-primary/10 dark:shadow-[0_0_26px_rgba(249,115,22,0.16)]">
                <p className="text-2xl font-bold text-primary dark:text-orange-300">{organicSearchTotal.toLocaleString("fr-CH")}</p>
                <p className="text-xs text-muted-foreground dark:text-slate-300">restaurant(s) disponible(s)</p>
              </div>
            </div>

            <form onSubmit={handleSearch} className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nom, cuisine, plat ou adresse..."
                  className="h-12 rounded-full pl-10 dark:border-white/20 dark:bg-slate-950/80 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>
              <Button type="submit" className="h-12 rounded-full px-6 dark:shadow-[0_0_30px_rgba(249,115,22,0.32)]">Rechercher</Button>
            </form>

            {quickCuisineOptions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {quickCuisineOptions.map((option: any) => {
                  const value = String(option.slug || option.name).toLowerCase();
                  const active = cuisine === value;
                  return (
                    <button
                      key={option.id || option.slug || option.name}
                      type="button"
                      onClick={() => updateFilter("cuisine", active ? "" : value)}
                      className={`min-h-[44px] rounded-full border px-4 py-2 text-sm transition-colors ${active ? "border-primary bg-primary text-primary-foreground dark:shadow-[0_0_24px_rgba(249,115,22,0.28)]" : "neon-chip border-border bg-background hover:bg-muted/40"}`}
                    >
                      {option.name}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
              <div className="flex flex-wrap items-center gap-2">
                <div className="neon-chip mr-1 flex items-center gap-2 rounded-lg border border-secondary bg-secondary/50 px-3 py-1.5 text-xs font-bold uppercase tracking-tight text-muted-foreground dark:text-slate-200">
                  <SlidersHorizontal className="h-3 w-3" /> Filtres
                </div>
                <CityAutocomplete
                  value={city}
                  onValueChange={(value) => updateFilter("city", value)}
                  onCitySelect={(selectedCity) => updateFilter("city", selectedCity)}
                  placeholder="Ville..."
                  className="w-40"
                  inputClassName="h-[44px] text-xs"
                />
                <Select value={cuisine} onValueChange={(v) => updateFilter("cuisine", v)}>
                  <SelectTrigger className="h-[44px] w-auto min-w-[10.5rem] text-xs"><SelectValue placeholder="Type de cuisine" /></SelectTrigger>
                  <SelectContent>
                    {sortedCuisineOptions.map((entry: any) => (
                      <SelectItem key={entry.id || entry.slug || entry.name} value={String(entry.slug || entry.name).toLowerCase()}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={price} onValueChange={(v) => updateFilter("price", v)}>
                  <SelectTrigger className="h-[44px] w-auto min-w-[7.5rem] text-xs font-bold uppercase"><SelectValue placeholder="Budget" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">CHF</SelectItem>
                    <SelectItem value="2">CHF++</SelectItem>
                    <SelectItem value="3">CHF+++</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={minRatingSelectValue} onValueChange={(v) => updateFilter("rating", v)}>
                  <SelectTrigger className="h-[44px] w-auto min-w-[9.5rem] text-xs"><SelectValue placeholder="Note minimum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Toutes les notes</SelectItem>
                    <SelectItem value="9">9.0+/10</SelectItem>
                    <SelectItem value="8">8.0+/10</SelectItem>
                    <SelectItem value="7">7.0+/10</SelectItem>
                  </SelectContent>
                </Select>
                {deliveryEnabled ? (
                  <Button
                    type="button"
                    variant={delivery === "true" ? "default" : "outline"}
                    onClick={() => updateFilter("delivery", delivery === "true" ? "" : "true")}
                    className="h-[44px] gap-1 text-xs"
                  >
                    <Badge variant={delivery === "true" ? "secondary" : "default"} className="h-4 px-1 text-[10px]">Oui</Badge>
                    Livraison
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">Trier par :</span>
                <Select value={sortBy} onValueChange={(v) => updateFilter("sort", v)}>
                  <SelectTrigger className="h-[44px] w-auto min-w-[11rem] text-xs font-semibold"><SelectValue placeholder="Pertinence" /></SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortDirection} onValueChange={(v) => updateFilter("order", v)}>
                  <SelectTrigger className="h-[44px] w-auto min-w-[9.5rem] text-xs"><SelectValue placeholder="Ordre" /></SelectTrigger>
                  <SelectContent>
                    {ORDER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {activeFilterLabels.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4 dark:border-white/20">
                {activeFilterLabels.map((label) => (
                  <span key={label} className="neon-chip rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                    {label}
                  </span>
                ))}
                <Button type="button" variant="ghost" onClick={clearFilters} className="ml-auto h-[44px] gap-1 text-xs text-muted-foreground">
                  <X className="h-3 w-3" />
                  Effacer tout
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {!isCommercialDemoClient ? <CampaignBanner page="search" maxBanners={1} /> : null}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[300px] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : mergedCards.length > 0 ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold dark:text-white">{promo === "true" ? "Bons plans disponibles" : "Sélection disponible"}</p>
                <p className="text-xs text-muted-foreground dark:text-slate-300">
                  {promo === "true"
                    ? "Les promotions et activations remontees sont affichées en priorité."
                    : "Affinez si nécessaire, sinon ouvrez directement une fiche restaurant."}
                </p>
              </div>
              <p className="text-sm font-medium text-muted-foreground dark:text-slate-300">
                <span className="text-foreground dark:text-white">{mergedCards.length}</span>
                {" "}sur{" "}
                <span className="text-foreground dark:text-white">{organicSearchTotal.toLocaleString("fr-CH")}</span>
                {" "}restaurant(s) chargé(s)
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {mergedCards.map((restaurant: any) => (
                <RestaurantCard key={`${restaurant.id}-${restaurant.campaign_id || "organic"}`} {...toCardProps(restaurant)} />
              ))}
            </div>
            {hasNextPage && !isCommercialDemoClient ? (
              <div
                ref={loadMoreRef}
                className="flex min-h-20 items-center justify-center"
                aria-live="polite"
              >
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-64 rounded-full"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage
                    ? `Chargement de ${SEARCH_PAGE_SIZE} restaurants…`
                    : `Charger les ${SEARCH_PAGE_SIZE} suivants`}
                </Button>
              </div>
            ) : organicSearchTotal > 0 ? (
              <p className="text-center text-sm text-muted-foreground dark:text-slate-300">
                Tous les restaurants correspondants sont affichés.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="neon-panel rounded-[28px] border border-dashed py-20 text-center text-muted-foreground dark:text-slate-300">
            <p className="text-lg font-semibold text-foreground dark:text-white">Aucun restaurant ne correspond à ces critères</p>
            <p className="mt-2 text-sm">Essayez une autre ville, une cuisine plus large ou reinitialisez les filtres.</p>
            <Button type="button" variant="outline" className="mt-5 rounded-full" onClick={clearFilters}>
              Réinitialiser la recherche
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
