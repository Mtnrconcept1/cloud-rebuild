import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { CalendarDays, ShoppingCart, TrendingUp } from "lucide-react";
import { normalizeOrderStatus } from "@/lib/orderStatus";

export default function Dashboard() {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("owner_id", user!.id).order("created_at", { ascending: true }).limit(1);
      return data?.[0] || null;
    },
    enabled: !!user,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["dashboard-recent-orders", restaurant?.id],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*").eq("restaurant_id", restaurant!.id).order("created_at", { ascending: false }).limit(5);
      return data || [];
    },
    enabled: !!restaurant,
  });

  const { data: upcomingReservations } = useQuery({
    queryKey: ["dashboard-upcoming-reservations", restaurant?.id],
    queryFn: async () => {
      const { data } = await supabase.from("reservations").select("*").eq("restaurant_id", restaurant!.id).gte("date", today).order("date").limit(5);
      return data || [];
    },
    enabled: !!restaurant,
  });

  const { data: totalOrders = 0 } = useQuery({
    queryKey: ["dashboard-total-orders", restaurant?.id],
    queryFn: async () => {
      const { count } = await supabase.from("orders").select("*", { count: "exact", head: true }).eq("restaurant_id", restaurant!.id);
      return count || 0;
    },
    enabled: !!restaurant,
  });

  const { data: totalUpcomingReservations = 0 } = useQuery({
    queryKey: ["dashboard-total-upcoming-reservations", restaurant?.id, today],
    queryFn: async () => {
      const { count } = await supabase.from("reservations").select("*", { count: "exact", head: true }).eq("restaurant_id", restaurant!.id).gte("date", today);
      return count || 0;
    },
    enabled: !!restaurant,
  });

  const { data: monthlyRevenue = 0 } = useQuery({
    queryKey: ["dashboard-monthly-revenue", restaurant?.id, monthStart],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("total_amount").eq("restaurant_id", restaurant!.id).gte("created_at", monthStart).not("status", "in", "(cancelled,refused)");
      return (data || []).reduce((sum, order) => sum + Number(order.total_amount), 0);
    },
    enabled: !!restaurant,
  });

  if (!restaurant) {
    return (
      <DashboardLayout>
        <div className="text-center py-12 space-y-4">
          <h2 className="font-display text-2xl font-bold">Aucun restaurant</h2>
          <p className="text-muted-foreground">Créez votre restaurant depuis l'onglet "Mon restaurant".</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Bonjour, {restaurant.name}</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total commandes</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalOrders}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Réservations à venir</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalUpcomingReservations}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Revenus du mois</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{monthlyRevenue.toFixed(2)} CHF</p></CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Commandes récentes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {recentOrders?.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm">
                  <span>{new Date(o.created_at).toLocaleDateString("fr-FR")}</span>
                  <span className="font-bold">{Number(o.total_amount).toFixed(2)} CHF</span>
                  <OrderStatusBadge status={normalizeOrderStatus(o.status)} />
                </div>
              ))}
              {(!recentOrders || recentOrders.length === 0) && <p className="text-sm text-muted-foreground">Aucune commande</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">Réservations à venir</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {upcomingReservations?.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span>{new Date(r.date).toLocaleDateString("fr-FR")} à {r.time}</span>
                  <span>{r.party_size} pers.</span>
                  <OrderStatusBadge status={r.status} />
                </div>
              ))}
              {(!upcomingReservations || upcomingReservations.length === 0) && <p className="text-sm text-muted-foreground">Aucune réservation</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
