import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UtensilsCrossed, ShoppingCart, CalendarDays, Sparkles, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "@/lib/featureFlags";

export default function AdminHome() {
  const navigate = useNavigate();
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [restaurants, orders, reservations] = await Promise.all([
        supabase.from("restaurants").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("reservations").select("id", { count: "exact", head: true }),
      ]);
      return { restaurants: restaurants.count || 0, orders: orders.count || 0, reservations: reservations.count || 0 };
    },
  });

  const { flags, toggleFlag } = useFeatureFlags();

  return (
    <div className="container py-8 space-y-6">
      <h1 className="font-display text-3xl font-bold">Administration</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Restaurants</CardTitle>
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats?.restaurants || 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Commandes</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats?.orders || 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Réservations</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats?.reservations || 0}</p></CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/admin/drops")}>
          <CardHeader>
            <div className="flex items-center gap-2"><UtensilsCrossed className="h-5 w-5 text-pink-500" /><CardTitle>Gérer les Drops</CardTitle></div>
          </CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Créez et gérez les ventes flash "Chef's Table".</p></CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/admin/notifications")}>
          <CardHeader>
            <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-amber-500" /><CardTitle>Campagnes Notifications</CardTitle></div>
          </CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Créez des alertes et campagnes ciblées.</p></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><CardTitle>Fonctionnalités exclusives</CardTitle></div>
            <p className="text-sm text-muted-foreground">Activez ou désactivez les fonctionnalités visibles pour les utilisateurs.</p>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {flags.map((flag) => (
                <div key={flag.id} className="flex items-center justify-between py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold">{flag.label}</p>
                    <p className="text-xs text-muted-foreground">{flag.description}</p>
                  </div>
                  <Switch checked={flag.isActive} onCheckedChange={() => toggleFlag(flag.id)} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
