import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RestaurantCard from "@/components/RestaurantCard";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { trackEvent, getActiveSponsoredRestaurants } from "@/lib/analytics";
import { prioritizeSponsoredCards } from "@/lib/sponsoredPlacement";

const CUISINES = ["Italien", "Pizza", "Burger", "Japonais", "Sushi", "Chinois", "Indien", "Thai", "Mexicain", "Libanais", "Francais", "Suisse", "Vegetarien", "Vegan", "Poke", "Kebab", "Tacos", "Pates", "Salade", "Dessert"];
type SortValue = "pertinence" | "note" | "promotion" | "prix" | "popularite" | "nouveaux" | "mieux_notes_mois" | "plus_reserves_mois";
type SortDirection = "asc" | "desc";

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "pertinence", label: "Pertinence" },
  { value: "note", label: "Note" },
  { value: "promotion", label: "Promotion" },
  { value: "prix", label: "Prix" },
  { value: "popularite", label: "Popularité" },
  { value: "nouveaux", label: "Nouveaux restaurants" },
  { value: "mieux_notes_mois", label: "Établissements les mieux notés du mois" },
  { value: "plus_reserves_mois", label: "Établissements les plus réservés du mois" },
];

const ORDER_OPTIONS: { value: SortDirection; label: string }[] = [
  { value: "desc", label: "Décroissant" },
  { value: "asc", label: "Croissant" },
];

interface SortContext {
  sortBy: SortValue; sortDirection: SortDirection; query: string;
  monthlyReservationsByRestaurant: Record<string, number>;
  monthlyOrdersByRestaurant: Record<string, number>;
  promotionScoreByRestaurant: Record<string, number>;
}

function getDefaultSortDirection(sortBy: SortValue): SortDirection { return sortBy === "prix" ? "asc" : "desc"; }
function normalizeMinRating10(raw: string): number { if (!raw) return 0; const parsed = toNumber(raw, 0); if (parsed <= 0) return 0; return Math.max(0, Math.min(10, parsed <= 5 ? parsed * 2 : parsed)); }
function toNumber(value: unknown, fallback = 0): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function toTimestamp(value: unknown): number { const ts = Date.parse(String(value || "")); return Number.isFinite(ts) ? ts : 0; }
function isCancelledStatus(status: unknown): boolean { const s = String(status || "").toLowerCase(); return s.includes("cancel") || s.includes("annul"); }

function getRelevanceScore(card: any, ctx: SortContext): number {
  const normalizedQuery = ctx.query.trim().toLowerCase();
  const id = String(card?.id || "");
  const name = String(card?.name || "").toLowerCase();
  const cuisineType = String(card?.cuisine_type || "").toLowerCase();
  const city = String(card?.city || "").toLowerCase();
  const rating = toNumber(card?.rating);
  const reviews = toNumber(card?.review_count);
  const monthlyReservations = toNumber(ctx.monthlyReservationsByRestaurant[id]);
  const monthlyOrders = toNumber(ctx.monthlyOrdersByRestaurant[id]);
  const promotion = Math.max(toNumber(ctx.promotionScoreByRestaurant[id]), card?.campaign_id ? 15 : 0);
  let score = 0;
  if (normalizedQuery) {
    if (name === normalizedQuery) score += 220;
    if (name.startsWith(normalizedQuery)) score += 170;
    if (name.includes(normalizedQuery)) score += 120;
    if (cuisineType.includes(normalizedQuery)) score += 80;
    if (city.includes(normalizedQuery)) score += 40;
  } else {
    score += rating * 18 + reviews * 0.9;
  }
  score += monthlyReservations * 4 + monthlyOrders * 3 + promotion * 1.4;
  if (card?.delivery_available) score += 6;
  return score;
}

function compareRestaurants(a: any, b: any, ctx: SortContext): number {
  const aId = String(a?.id || ""); const bId = String(b?.id || "");
  const aName = String(a?.name || ""); const bName = String(b?.name || "");
  const aRating = toNumber(a?.rating); const bRating = toNumber(b?.rating);
  const aReviews = toNumber(a?.review_count); const bReviews = toNumber(b?.review_count);
  const aPrice = toNumber(a?.price_range, 99); const bPrice = toNumber(b?.price_range, 99);
  const aMonthlyReservations = toNumber(ctx.monthlyReservationsByRestaurant[aId]);
  const bMonthlyReservations = toNumber(ctx.monthlyReservationsByRestaurant[bId]);
  const aMonthlyOrders = toNumber(ctx.monthlyOrdersByRestaurant[aId]);
  const bMonthlyOrders = toNumber(ctx.monthlyOrdersByRestaurant[bId]);
  const aPromotion = Math.max(toNumber(ctx.promotionScoreByRestaurant[aId]), a?.campaign_id ? 15 : 0);
  const bPromotion = Math.max(toNumber(ctx.promotionScoreByRestaurant[bId]), b?.campaign_id ? 15 : 0);
  const defaultDirection = getDefaultSortDirection(ctx.sortBy);
  const applyDirection = (value: number) => ctx.sortDirection === defaultDirection ? value : -value;

  if (ctx.sortBy === "note") return applyDirection(bRating - aRating || bReviews - aReviews || aName.localeCompare(bName));
  if (ctx.sortBy === "promotion") return applyDirection(bPromotion - aPromotion || bRating - aRating || bReviews - aReviews || aName.localeCompare(bName));
  if (ctx.sortBy === "prix") return applyDirection(aPrice - bPrice || bRating - aRating || bReviews - aReviews || aName.localeCompare(bName));
  if (ctx.sortBy === "popularite") {
    const aPopularity = aReviews + (aMonthlyReservations * 4) + (aMonthlyOrders * 3);
    const bPopularity = bReviews + (bMonthlyReservations * 4) + (bMonthlyOrders * 3);
    return applyDirection(bPopularity - aPopularity || bRating - aRating || aName.localeCompare(bName));
  }
  if (ctx.sortBy === "nouveaux") {
    const aCreated = toTimestamp(a?.created_at); const bCreated = toTimestamp(b?.created_at);
    return applyDirection(bCreated - aCreated || bRating - aRating || aName.localeCompare(bName));
  }
  if (ctx.sortBy === "mieux_notes_mois") {
    const aHasMonthly = aMonthlyReservations > 0 ? 1 : 0; const bHasMonthly = bMonthlyReservations > 0 ? 1 : 0;
    return applyDirection(bHasMonthly - aHasMonthly || bRating - aRating || bMonthlyReservations - aMonthlyReservations || bReviews - aReviews || aName.localeCompare(bName));
  }
  if (ctx.sortBy === "plus_reserves_mois") {
    return applyDirection(bMonthlyReservations - aMonthlyReservations || bRating - aRating || bReviews - aReviews || aName.localeCompare(bName));
  }
  const aRelevance = getRelevanceScore(a, ctx);
  const bRelevance = getRelevanceScore(b, ctx);
  return applyDirection(bRelevance - aRelevance || bRating - aRating || bReviews - aReviews || aName.localeCompare(bName));
}

export default function Recherche() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const cuisine = searchParams.get("cuisine") || "";
  const city = searchParams.get("city") || "";
  const price = searchParams.get("price") || "";
  const delivery = searchParams.get("delivery") || "";
  const minRatingParam = searchParams.get("rating") || "";
  const minRating10 = normalizeMinRating10(minRatingParam);
  const minRatingDb = minRating10 > 0 ? minRating10 / 2 : 0;
  const minRatingSelectValue = minRating10 > 0 ? String(minRating10) : "0";
  const sortParam = searchParams.get("sort");
  const orderParam = searchParams.get("order");
  const sortBy: SortValue = SORT_OPTIONS.some((opt) => opt.value === sortParam) ? (sortParam as SortValue) : "pertinence";
  const defaultSortDirection = getDefaultSortDirection(sortBy);
  const sortDirection: SortDirection = ORDER_OPTIONS.some((opt) => opt.value === orderParam) ? (orderParam as SortDirection) : defaultSortDirection;

  const monthStart = useMemo(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; }, []);
  const monthStartIso = monthStart.toISOString();
  const monthStartYmd = monthStartIso.slice(0, 10);
  const todayYmd = new Date().toISOString().slice(0, 10);

  const { data: restaurants, isLoading } = useQuery({
    queryKey: ["restaurants-search", cuisine, city, price, delivery, minRating10, query],
    queryFn: async () => {
      let q = supabase.from("restaurants").select("*").eq("is_active", true);
      if (query) q = q.or(`name.ilike.%${query}%,cuisine_type.ilike.%${query}%`);
      if (cuisine) q = q.ilike("cuisine_type", `%${cuisine}%`);
      if (city) q = q.ilike("city", `%${city}%`);
      if (price) q = q.eq("price_range", Number(price));
      if (delivery === "true") q = q.eq("delivery_available", true);
      if (minRatingDb > 0) q = q.gte("rating", minRatingDb);
      const { data } = await q;
      return data || [];
    },
  });

  const { data: monthlyReservationsByRestaurant = {} } = useQuery({
    queryKey: ["search-monthly-reservations", monthStartYmd],
    queryFn: async () => {
      try {
        const { data } = await supabase.from("reservations").select("restaurant_id, status, date").gte("date", monthStartYmd);
        const counts: Record<string, number> = {};
        (data || []).forEach((row: any) => {
          if (!row?.restaurant_id || isCancelledStatus(row?.status)) return;
          counts[row.restaurant_id] = (counts[row.restaurant_id] || 0) + 1;
        });
        return counts;
      } catch { return {}; }
    },
  });

  const { data: monthlyOrdersByRestaurant = {} } = useQuery({
    queryKey: ["search-monthly-orders", monthStartIso],
    queryFn: async () => {
      try {
        const { data } = await supabase.from("orders").select("restaurant_id, status, created_at").gte("created_at", monthStartIso);
        const counts: Record<string, number> = {};
        (data || []).forEach((row: any) => {
          if (!row?.restaurant_id || isCancelledStatus(row?.status)) return;
          counts[row.restaurant_id] = (counts[row.restaurant_id] || 0) + 1;
        });
        return counts;
      } catch { return {}; }
    },
  });

  const { data: promotionScoreByRestaurant = {} } = useQuery({
    queryKey: ["search-promotion-score", todayYmd],
    queryFn: async () => {
      try {
        const [offersRes, formulasRes] = await Promise.all([
          supabase.from("anti_waste_offers" as any).select("restaurant_id, original_price, discounted_price, available_date").eq("is_active", true).in("offer_type", ["regular", "surprise_bag", "solidarity"] as any).gte("available_date", todayYmd),
          supabase.from("meal_formulas" as any).select("restaurant_id, discount_percent").eq("is_active", true),
        ]);
        const scores: Record<string, number> = {};
        ((offersRes.data || []) as any[]).forEach((offer) => {
          const rid = String(offer?.restaurant_id || ""); if (!rid) return;
          const original = toNumber(offer?.original_price); const discounted = toNumber(offer?.discounted_price);
          const discountPercent = original > 0 ? ((original - discounted) / original) * 100 : 0;
          scores[rid] = Math.max(scores[rid] || 0, discountPercent);
        });
        ((formulasRes.data || []) as any[]).forEach((formula) => {
          const rid = String(formula?.restaurant_id || ""); if (!rid) return;
          const discountPercent = toNumber(formula?.discount_percent);
          scores[rid] = Math.max(scores[rid] || 0, discountPercent);
        });
        return scores;
      } catch { return {}; }
    },
  });

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value); else params.delete(key);
    setSearchParams(params);
  };

  useEffect(() => {
    if (query || cuisine || city) {
      trackEvent({ eventType: "search", eventData: { query, cuisine, city, price, delivery, minRating10, sortBy, sortDirection } });
    }
  }, [query, cuisine, city, price, delivery, minRating10, sortBy, sortDirection]);

  const { data: sponsoredCampaigns } = useQuery({
    queryKey: ["sponsored-search"],
    queryFn: () => getActiveSponsoredRestaurants("search"),
  });

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); updateFilter("q", query); };

  const matchesFilters = (restaurant: any) => {
    const qText = query.trim().toLowerCase();
    const name = (restaurant?.name || "").toLowerCase();
    const cuisineType = (restaurant?.cuisine_type || "").toLowerCase();
    const cityValue = (restaurant?.city || "").toLowerCase();
    if (qText && !name.includes(qText) && !cuisineType.includes(qText)) return false;
    if (cuisine && !cuisineType.includes(cuisine.toLowerCase())) return false;
    if (city && !cityValue.includes(city.toLowerCase())) return false;
    if (price && Number(restaurant?.price_range || 0) !== Number(price)) return false;
    if (delivery === "true" && !restaurant?.delivery_available) return false;
    if (minRatingDb > 0 && Number(restaurant?.rating || 0) < minRatingDb) return false;
    return true;
  };

  const sponsoredCards = (sponsoredCampaigns || []).map((camp: any) => {
    const r = camp.restaurants; if (!r) return null;
    return { ...r, campaign_id: camp.id, promo_image: camp.image_url || null };
  }).filter((r: any) => !!r && matchesFilters(r)) as any[];

  const sortContext = useMemo<SortContext>(() => {
    return { sortBy, sortDirection, query, monthlyReservationsByRestaurant, monthlyOrdersByRestaurant, promotionScoreByRestaurant };
  }, [sortBy, sortDirection, query, monthlyReservationsByRestaurant, monthlyOrdersByRestaurant, promotionScoreByRestaurant]);

  const sortedOrganicCards = useMemo(() => [...((restaurants || []) as any[])].sort((a, b) => compareRestaurants(a, b, sortContext)), [restaurants, sortContext]);
  const sortedSponsoredCards = useMemo(() => [...sponsoredCards].sort((a, b) => compareRestaurants(a, b, sortContext)), [sponsoredCards, sortContext]);
  const mergedCards = useMemo(() => prioritizeSponsoredCards(sortedOrganicCards, sortedSponsoredCards, { topSlots: 3 }), [sortedOrganicCards, sortedSponsoredCards]);

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 space-y-6">
        <h1 className="font-display text-3xl font-bold">Rechercher un restaurant</h1>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, cuisine..." className="pl-10" />
          </div>
          <Button type="submit">Rechercher</Button>
        </form>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 mr-2 py-1.5 px-3 rounded-lg bg-secondary/50 border border-secondary text-xs font-bold uppercase tracking-tight text-muted-foreground shrink-0">
            <SlidersHorizontal className="h-3 w-3" /> Filtres
          </div>
          <Input placeholder="Ville..." value={city} onChange={(e) => updateFilter("city", e.target.value)} className="w-32 h-9 text-xs" />
          <Select value={cuisine} onValueChange={(v) => updateFilter("cuisine", v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Type de cuisine" /></SelectTrigger>
            <SelectContent>{[...CUISINES].sort().map((c) => (<SelectItem key={c} value={c.toLowerCase()}>{c}</SelectItem>))}</SelectContent>
          </Select>
          <Select value={price} onValueChange={(v) => updateFilter("price", v)}>
            <SelectTrigger className="w-24 h-9 text-xs uppercase font-bold"><SelectValue placeholder="Budget" /></SelectTrigger>
            <SelectContent><SelectItem value="1">CHF</SelectItem><SelectItem value="2">CHF++</SelectItem><SelectItem value="3">CHF+++</SelectItem></SelectContent>
          </Select>
          <Select value={minRatingSelectValue} onValueChange={(v) => updateFilter("rating", v)}>
            <SelectTrigger className="w-28 h-9 text-xs"><SelectValue placeholder="Note minimum" /></SelectTrigger>
            <SelectContent><SelectItem value="0">Toutes les notes</SelectItem><SelectItem value="9">9.0+/10</SelectItem><SelectItem value="8">8.0+/10</SelectItem><SelectItem value="7">7.0+/10</SelectItem></SelectContent>
          </Select>
          <Button variant={delivery === "true" ? "default" : "outline"} onClick={() => updateFilter("delivery", delivery === "true" ? "" : "true")} className="h-9 text-xs gap-1"><Badge variant={delivery === "true" ? "secondary" : "default"} className="px-1 text-[10px] h-4">Oui</Badge> Livraison</Button>
          {(query || cuisine || city || price || delivery || minRating10 > 0) && (
            <Button variant="ghost" onClick={() => { setSearchParams(new URLSearchParams()); setQuery(""); }} className="h-9 text-xs text-muted-foreground ml-auto gap-1"><X className="h-3 w-3" /> Effacer</Button>
          )}
        </div>
        <div className="flex items-center gap-4 border-b pb-4 mt-6">
          <div className="flex-1 flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Trier par :</span>
            <Select value={sortBy} onValueChange={(v) => updateFilter("sort", v)}>
              <SelectTrigger className="h-9 text-xs font-semibold bg-secondary/20 border-transparent"><SelectValue placeholder="Pertinence" /></SelectTrigger>
              <SelectContent>{SORT_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={sortDirection} onValueChange={(v) => updateFilter("order", v)}>
              <SelectTrigger className="h-9 text-xs w-32 bg-secondary/20 border-transparent"><SelectValue placeholder="Ordre" /></SelectTrigger>
              <SelectContent>{ORDER_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="text-sm font-medium text-muted-foreground"><span className="text-foreground">{mergedCards.length}</span> résultats</div>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{[1, 2, 3, 4, 5, 6].map((i) => (<div key={i} className="h-[300px] rounded-2xl bg-muted animate-pulse" />))}</div>
        ) : mergedCards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mergedCards.map((restaurant: any) => (<RestaurantCard key={restaurant.id} {...restaurant} />))}
          </div>
        ) : (
          <div className="text-center py-20 text-muted-foreground">Aucun restaurant trouvé pour vos critères.</div>
        )}
      </div>
    </main>
  );
}