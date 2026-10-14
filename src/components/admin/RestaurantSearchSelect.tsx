import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Loader2, Search } from "lucide-react";

const supabase = getSupabase();
const PAGE_SIZE = 40;

export type RestaurantOption = {
  id: string;
  name: string;
  city: string | null;
  is_active: boolean | null;
};

type Props = {
  value: string;
  onChange: (restaurantId: string) => void;
  onSelect?: (restaurant: RestaurantOption) => void;
  eligibleOnly?: boolean;
  placeholder?: string;
};

export default function RestaurantSearchSelect({
  value,
  onChange,
  onSelect,
  eligibleOnly = false,
  placeholder = "Rechercher un restaurant…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim().slice(0, 80));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const restaurantsQuery = useInfiniteQuery({
    queryKey: ["admin-fast-restaurant-picker", debouncedSearch, eligibleOnly],
    initialPageParam: 0,
    enabled: open,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam, signal }) => {
      // Server-side search uses the existing lower(name)/lower(city) GIN indexes.
      // Fetch only 41 short records to detect the next page without count=exact.
      const { data, error } = await (supabase.rpc as any)(
        "admin_search_restaurants_fast",
        {
          p_query: debouncedSearch,
          p_limit: PAGE_SIZE + 1,
          p_offset: pageParam * PAGE_SIZE,
          p_eligible_only: eligibleOnly,
        },
      ).abortSignal(signal);
      if (error) throw error;
      const items = (data || []) as RestaurantOption[];
      return {
        rows: items.slice(0, PAGE_SIZE),
        page: pageParam,
        hasMore: items.length > PAGE_SIZE,
      };
    },
    getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined,
  });

  const selectedQuery = useQuery({
    queryKey: ["admin-fast-selected-restaurant", value],
    enabled: Boolean(value),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, city, is_active")
        .eq("id", value)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as RestaurantOption | null;
    },
  });

  const options = useMemo(
    () => restaurantsQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [restaurantsQuery.data],
  );
  const selected = selectedQuery.data ?? options.find((item) => item.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Choisir un restaurant"
          className="w-full justify-between gap-2 font-normal"
        >
          <span className="min-w-0 truncate">
            {selected?.name || (value ? "Chargement du restaurant…" : placeholder)}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-2"
        align="start"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom ou ville du restaurant"
            aria-label="Rechercher un restaurant par nom ou ville"
            className="pl-9"
          />
        </div>
        <div
          className="max-h-64 space-y-1 overflow-y-auto pt-2"
          role="listbox"
          aria-label="Restaurants"
        >
          {restaurantsQuery.isPending ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Chargement…</p>
          ) : restaurantsQuery.isError ? (
            <p role="alert" className="px-2 py-3 text-sm text-destructive">
              Impossible de charger les restaurants.
            </p>
          ) : options.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              Aucun restaurant trouvé.
            </p>
          ) : (
            options.map((restaurant) => (
              <button
                type="button"
                role="option"
                aria-selected={restaurant.id === value}
                key={restaurant.id}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent"
                onClick={() => {
                  onChange(restaurant.id);
                  onSelect?.(restaurant);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span className="min-w-0 truncate">
                  {restaurant.name}
                  {restaurant.city ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {restaurant.city}
                    </span>
                  ) : null}
                </span>
                {!restaurant.is_active ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Inactif
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
          <span>{options.length.toLocaleString("fr-CH")} résultat(s) affiché(s)</span>
          {restaurantsQuery.hasNextPage ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={restaurantsQuery.isFetchingNextPage}
              onClick={() => void restaurantsQuery.fetchNextPage()}
            >
              {restaurantsQuery.isFetchingNextPage ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : null}
              Plus de résultats
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
