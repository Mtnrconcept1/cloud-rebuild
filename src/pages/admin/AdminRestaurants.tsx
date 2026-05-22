import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Search, Sparkles, Store, Truck } from "lucide-react";

const supabase = getSupabase();

type AdminRestaurant = {
  id: string;
  name: string;
  city: string | null;
  cuisine_type: string | null;
  image_url: string | null;
  is_active: boolean | null;
  is_featured: boolean | null;
  status: string | null;
  supports_pickup: boolean | null;
  supports_dinein: boolean | null;
  supports_reservation: boolean | null;
  avg_rating: number | null;
  rating_count: number | null;
  min_order_amount: number | null;
  base_delivery_fee: number | null;
};

const STATUS_OPTIONS = [
  { value: "active", label: "Actif" },
  { value: "pending", label: "En attente" },
  { value: "paused", label: "En pause" },
  { value: "archived", label: "Archive" },
];

export default function AdminRestaurants() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");

  const { data: restaurants = [], isLoading, error } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, city, cuisine_type, image_url, is_active, is_featured, status, supports_pickup, supports_dinein, supports_reservation, avg_rating, rating_count, min_order_amount, base_delivery_fee")
        .order("name");

      if (error) throw error;
      return (data || []) as AdminRestaurant[];
    },
  });

  const filteredRestaurants = useMemo(() => {
    const term = search.trim().toLowerCase();
    return restaurants.filter((restaurant) => {
      const matchesSearch =
        !term ||
        restaurant.name.toLowerCase().includes(term) ||
        (restaurant.city || "").toLowerCase().includes(term) ||
        (restaurant.cuisine_type || "").toLowerCase().includes(term) ||
        restaurant.id.toLowerCase().includes(term);

      const isActive = restaurant.is_active ?? true;
      const matchesVisibility =
        visibilityFilter === "all" ||
        (visibilityFilter === "active" && isActive) ||
        (visibilityFilter === "inactive" && !isActive) ||
        (visibilityFilter === "featured" && (restaurant.is_featured ?? false));

      return matchesSearch && matchesVisibility;
    });
  }, [restaurants, search, visibilityFilter]);

  const stats = useMemo(() => {
    return {
      total: restaurants.length,
      active: restaurants.filter((restaurant) => restaurant.is_active ?? true).length,
      featured: restaurants.filter((restaurant) => restaurant.is_featured ?? false).length,
      reservationReady: restaurants.filter((restaurant) => restaurant.supports_reservation ?? false).length,
    };
  }, [restaurants]);

  const updateRestaurant = async (restaurantId: string, patch: Partial<AdminRestaurant>, successTitle: string) => {
    const { error } = await supabase.from("restaurants").update(patch).eq("id", restaurantId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
    toast({ title: successTitle });
  };

  if (error) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-10 text-center text-destructive">
            Impossible de charger les restaurants.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <DashboardPageHero
        badge="Admin restaurants"
        title="Gestion des restaurants"
        description="Activez les restaurants, gerez leur visibilite, leurs options de service et les mises en avant depuis une vue de pilotage."
        icon={Store}
        tone="emerald"
        visualLabel="Restaurants"
        stats={[
          { label: "Restaurants", value: stats.total, icon: Store },
          { label: "Actifs", value: stats.active, icon: Sparkles },
          { label: "Reservations", value: stats.reservationReady, icon: CalendarDays },
        ]}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Restaurants</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Actifs</CardTitle>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">Live</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Mis en avant</CardTitle>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.featured}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Reservations</CardTitle>
            <CalendarDays className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.reservationReady}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par nom, ville, cuisine ou id"
              className="pl-9"
            />
          </div>
          <select
            value={visibilityFilter}
            onChange={(event) => setVisibilityFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
            <option value="featured">Mis en avant</option>
          </select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="h-36 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredRestaurants.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucun restaurant ne correspond au filtre.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRestaurants.map((restaurant) => (
            <Card key={restaurant.id}>
              <CardContent className="py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <img
                      src={restaurant.image_url || "/images/kebab-box-spread.jpeg"}
                      alt={restaurant.name}
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{restaurant.name}</h3>
                        <Badge variant={restaurant.is_active ? "default" : "secondary"}>
                          {restaurant.is_active ? "Actif" : "Inactif"}
                        </Badge>
                        {restaurant.is_featured ? <Badge variant="outline">Mis en avant</Badge> : null}
                        {restaurant.supports_reservation ? <Badge variant="outline">Reservation</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[restaurant.city, restaurant.cuisine_type].filter(Boolean).join(" | ") || "Informations incompletes"}
                      </p>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-amber-500" />
                          {Number(restaurant.avg_rating || 0).toFixed(1)} ({restaurant.rating_count || 0} avis)
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          Livraison {Number(restaurant.base_delivery_fee || 0).toFixed(2)} CHF
                        </span>
                        <span>Minimum {Number(restaurant.min_order_amount || 0).toFixed(2)} CHF</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      <span>Active</span>
                      <Switch
                        checked={restaurant.is_active ?? true}
                        onCheckedChange={(checked) =>
                          updateRestaurant(restaurant.id, { is_active: checked }, checked ? "Restaurant active" : "Restaurant desactive")
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      <span>Mise en avant</span>
                      <Switch
                        checked={restaurant.is_featured ?? false}
                        onCheckedChange={(checked) =>
                          updateRestaurant(restaurant.id, { is_featured: checked }, checked ? "Restaurant mis en avant" : "Restaurant retire de la selection")
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      <span>Reservations</span>
                      <Switch
                        checked={restaurant.supports_reservation ?? false}
                        onCheckedChange={(checked) =>
                          updateRestaurant(
                            restaurant.id,
                            { supports_reservation: checked },
                            checked ? "Reservations activees" : "Reservations desactivees"
                          )
                        }
                      />
                    </label>
                    <div className="rounded-lg border px-3 py-2 text-sm">
                      <p className="mb-2 text-xs text-muted-foreground">Statut</p>
                      <select
                        value={restaurant.status || "active"}
                        onChange={(event) =>
                          updateRestaurant(restaurant.id, { status: event.target.value }, "Statut du restaurant mis a jour")
                        }
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateRestaurant(
                        restaurant.id,
                        { supports_pickup: !(restaurant.supports_pickup ?? true) },
                        restaurant.supports_pickup ? "Retrait desactive" : "Retrait active"
                      )
                    }
                  >
                    {restaurant.supports_pickup ? "Desactiver retrait" : "Activer retrait"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateRestaurant(
                        restaurant.id,
                        { supports_dinein: !(restaurant.supports_dinein ?? false) },
                        restaurant.supports_dinein ? "Sur place desactive" : "Sur place active"
                      )
                    }
                  >
                    {restaurant.supports_dinein ? "Desactiver sur place" : "Activer sur place"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
