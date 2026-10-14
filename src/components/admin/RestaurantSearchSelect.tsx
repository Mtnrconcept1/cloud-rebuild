import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Loader2, Search } from "lucide-react";

const supabase = getSupabase();
const PAGE_SIZE = 50;
type RestaurantOption = { id: string; name: string; is_active: boolean | null };

type Props = {
  value: string;
  onChange: (restaurantId: string) => void;
};

export default function RestaurantSearchSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const restaurantsQuery = useInfiniteQuery({
    queryKey: ["admin-golden-tok-restaurant-picker", debouncedSearch],
    initialPageParam: 0,
    enabled: open,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("restaurants")
        .select("id, name, is_active", { count: "exact" })
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);

      if (debouncedSearch) {
        // Treat user-entered %, _ and backslashes as literal characters.
        const literal = debouncedSearch.replace(/[\\%_]/g, "\\$&");
        query = query.ilike("name", `%${literal}%`);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      return {
        rows: (data || []) as RestaurantOption[],
        page: pageParam,
        total: count ?? 0,
      };
    },
    getNextPageParam: (last) =>
      (last.page + 1) * PAGE_SIZE < last.total ? last.page + 1 : undefined,
  });

  const selectedQuery = useQuery({
    queryKey: ["admin-golden-tok-selected-restaurant", value],
    enabled: !!value,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, is_active")
        .eq("id", value)
        .maybeSingle();
      if (error) throw error;
      return data as RestaurantOption | null;
    },
  });

  const options = useMemo(
    () => restaurantsQuery.data?.pages.flatMap((page) => page.rows) || [],
    [restaurantsQuery.data],
  );
  const selected = selectedQuery.data || options.find((item) => item.id === value);
  const total = restaurantsQuery.data?.pages[0]?.total ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Choisir un restaurant"
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selected?.name || (value ? "Chargement du restaurant…" : "Rechercher un restaurant…")}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tapez le nom du restaurant"
            aria-label="Rechercher parmi tous les restaurants"
            className="pl-9"
          />
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto pt-2" role="listbox" aria-label="Restaurants">
          {restaurantsQuery.isPending ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Chargement…</p>
          ) : restaurantsQuery.isError ? (
            <p role="alert" className="px-2 py-3 text-sm text-destructive">Impossible de charger les restaurants.</p>
          ) : options.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Aucun restaurant trouvé.</p>
          ) : (
            options.map((restaurant) => (
              <button
                type="button"
                role="option"
                aria-selected={restaurant.id === value}
                key={restaurant.id}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent"
                onClick={() => {
                  onChange(restaurant.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span className="truncate">{restaurant.name}</span>
                {!restaurant.is_active && <span className="ml-2 shrink-0 text-xs text-muted-foreground">Inactif</span>}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
          <span>{total.toLocaleString("fr-CH")} résultat(s)</span>
          {restaurantsQuery.hasNextPage && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={restaurantsQuery.isFetchingNextPage}
              onClick={() => restaurantsQuery.fetchNextPage()}
            >
              {restaurantsQuery.isFetchingNextPage ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
              Afficher davantage
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
