import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";

import RestaurantCard from "@/components/RestaurantCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { PREDEFINED_RESTAURANT_CATEGORIES } from "@/lib/restaurantCategories";

type SortValue = "pertinence" | "note" | "prix" | "nouveaux";
type SortDirection = "asc" | "desc";

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "pertinence", label: "Pertinence" },
  { value: "note", label: "Note" },
  { value: "prix", label: "Prix" },
  { value: "nouveaux", label: "Nouveaux restaurants" },
];

const ORDER_OPTIONS: { value: SortDirection; label: string }[] = [
  { value: "desc", label: "Decroissant" },
  { value: "asc", label: "Croissant" },
];

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getRelevanceScore(restaurant: any, query: string) {
  const normalizedQuery = normalizeText(query);
  const name = normalizeText(String(restaurant.name || ""));
  const cuisine = normalizeText(String(restaurant.cuisine_type || ""));
  const city = normalizeText(String(restaurant.city || ""));
  const description = normalizeText(String(restaurant.description || ""));

  let score = 0;
  if (!normalizedQuery) {
    score += toNumber(restaurant.rating) * 18 + toNumber(restaurant.review_count) * 1.2;
  } else {
    if (name === normalizedQuery) score += 220;
    if (name.startsWith(normalizedQuery)) score += 180;
    if (name.includes(normalizedQuery)) score += 130;
    if (cuisine.includes(normalizedQuery)) score += 90;
    if (city.includes(normalizedQuery)) score += 45;
    if (description.includes(normalizedQuery)) score += 35;
  }
  score += toNumber(restaurant.review_count) * 0.5;
  return score;
}

function matchesCuisineFilter(restaurant: any, cuisineFilter: string) {
  if (!cuisineFilter) return true;
  return normalizeText(String(restaurant.cuisine_type || "")).includes(normalizeText(cuisineFilter));
}

function toCardProps(restaurant: any) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    cuisine: restaurant.cuisine_type || "",
    rating: restaurant.rating || 0,
    reviewCount: restaurant.review_count || 0,
    imageUrl: restaurant.image_url || "",
    priceRange: restaurant.price_range || 2,
    city: restaurant.city || "",
    address: restaurant.address || "",
  };
}

export default function Recherche() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(activeQuery);
  const cuisine = searchParams.get("cuisine") || "";
  const city = searchParams.get("city") || "";
  const price = searchParams.get("price") || "";
  const rating = searchParams.get("rating") || "0";
  const sortBy = (searchParams.get("sort") as SortValue) || "pertinence";
  const sortDirection = (searchParams.get("order") as SortDirection) || (sortBy === "prix" ? "asc" : "desc");

  useEffect(() => {
    setQuery(activeQuery);
  }, [activeQuery]);

  const { data: restaurants = [], isLoading } = useQuery({
    queryKey: ["reservation-search-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, description, cuisine_type, rating, review_count, price_range, image_url, city, address, created_at")
        .eq("is_active", true)
        .eq("supports_reservation", true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: cuisineOptions = [] } = useQuery({
    queryKey: ["search-cuisine-options"],
    queryFn: async () => {
      const fallback = PREDEFINED_RESTAURANT_CATEGORIES.map((category) => ({
        id: category.slug,
        name: category.name,
        slug: category.slug,
      }));
      const { data, error } = await (supabase.from("cuisines") as any)
        .select("id, name, slug")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data?.length ? data : fallback) as any[];
    },
  });

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    setSearchParams(params);
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    updateFilter("q", query);
  };

  const filteredRestaurants = useMemo(() => {
    const normalizedQuery = normalizeText(activeQuery);
    const normalizedCity = normalizeText(city);
    const minRating = Number(rating || 0);

      const filtered = [...restaurants].filter((restaurant: any) => {
      const haystack = normalizeText(
        `${restaurant.name || ""} ${restaurant.cuisine_type || ""} ${restaurant.city || ""} ${restaurant.description || ""}`,
      );

      if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
      if (normalizedCity && !normalizeText(String(restaurant.city || "")).includes(normalizedCity)) return false;
      if (!matchesCuisineFilter(restaurant, cuisine)) return false;
      if (price && Number(restaurant.price_range || 0) !== Number(price)) return false;
      if (minRating > 0 && Number(restaurant.rating || 0) * 2 < minRating) return false;
      return true;
    });

    filtered.sort((a: any, b: any) => {
      const direction = sortDirection === "asc" ? 1 : -1;

      if (sortBy === "note") {
        return direction * ((Number(a.rating || 0) - Number(b.rating || 0)) || (Number(a.review_count || 0) - Number(b.review_count || 0)));
      }
      if (sortBy === "prix") {
        return direction * ((Number(a.price_range || 99) - Number(b.price_range || 99)) || (Number(b.rating || 0) - Number(a.rating || 0)));
      }
      if (sortBy === "nouveaux") {
        return direction * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }

      return direction * (getRelevanceScore(a, activeQuery) - getRelevanceScore(b, activeQuery));
    });

      return filtered;
  }, [activeQuery, city, cuisine, price, rating, restaurants, sortBy, sortDirection]);

  return (
    <main className="min-h-screen bg-background">
      <div className="container space-y-6 py-8">
        <h1 className="font-display text-3xl font-bold">Rechercher un restaurant a reserver</h1>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom, cuisine, ambiance..."
              className="pl-10"
            />
          </div>
          <Button type="submit">Rechercher</Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 flex shrink-0 items-center gap-2 rounded-lg border border-secondary bg-secondary/50 px-3 py-1.5 text-xs font-bold uppercase tracking-tight text-muted-foreground">
            <SlidersHorizontal className="h-3 w-3" />
            Filtres
          </div>
          <Input placeholder="Ville..." value={city} onChange={(event) => updateFilter("city", event.target.value)} className="h-9 w-32 text-xs" />
          <Select value={cuisine} onValueChange={(value) => updateFilter("cuisine", value)}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder="Type de cuisine" />
            </SelectTrigger>
            <SelectContent>
              {[...cuisineOptions]
                .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
                .map((option: any) => (
                  <SelectItem key={option.id || option.slug || option.name} value={String(option.slug || option.name).toLowerCase()}>
                    {option.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={price} onValueChange={(value) => updateFilter("price", value)}>
            <SelectTrigger className="h-9 w-24 text-xs font-bold uppercase">
              <SelectValue placeholder="Budget" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">CHF</SelectItem>
              <SelectItem value="2">CHF++</SelectItem>
              <SelectItem value="3">CHF+++</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rating} onValueChange={(value) => updateFilter("rating", value)}>
            <SelectTrigger className="h-9 w-28 text-xs">
              <SelectValue placeholder="Note minimum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Toutes les notes</SelectItem>
              <SelectItem value="9">9.0+/10</SelectItem>
              <SelectItem value="8">8.0+/10</SelectItem>
              <SelectItem value="7">7.0+/10</SelectItem>
            </SelectContent>
          </Select>
          {(query || cuisine || city || price || Number(rating) > 0) ? (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchParams(new URLSearchParams());
                setQuery("");
              }}
              className="ml-auto h-9 gap-1 text-xs text-muted-foreground"
            >
              <X className="h-3 w-3" />
              Effacer
            </Button>
          ) : null}
        </div>

        <div className="mt-6 flex items-center gap-4 border-b pb-4">
          <div className="flex flex-1 items-center gap-2">
            <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">Trier par :</span>
            <Select value={sortBy} onValueChange={(value) => updateFilter("sort", value)}>
              <SelectTrigger className="h-9 border-transparent bg-secondary/20 text-xs font-semibold">
                <SelectValue placeholder="Pertinence" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortDirection} onValueChange={(value) => updateFilter("order", value)}>
              <SelectTrigger className="h-9 w-32 border-transparent bg-secondary/20 text-xs">
                <SelectValue placeholder="Ordre" />
              </SelectTrigger>
              <SelectContent>
                {ORDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            <span className="text-foreground">{filteredRestaurants.length}</span> resultats
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="h-[300px] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : filteredRestaurants.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredRestaurants.map((restaurant: any) => (
              <RestaurantCard key={restaurant.id} {...toCardProps(restaurant)} />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-muted-foreground">
            Aucun restaurant reservable ne correspond a vos criteres.
          </div>
        )}
      </div>
    </main>
  );
}
