import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { CalendarDays, ShoppingCart, SunMedium, MoonStar, TrendingUp } from "lucide-react";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { useDashboardRestaurant } from "./DashboardContext";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";

const INVALID_ORDER_STATUS_FILTER = "(cancelled,refused,payment_failed)";
const INVALID_RESERVATION_STATUS_FILTER = "(cancelled,no_show)";

export default function Dashboard() {
  const { selectedId } = useDashboardRestaurant();
  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant-detail", selectedId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("id", selectedId!).single();
      return data;
    },
    enabled: !!selectedId,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["dashboard-recent-orders", restaurant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .not("status", "in", INVALID_ORDER_STATUS_FILTER)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!restaurant,
  });

  const { data: upcomingReservations = [] } = useQuery({
    queryKey: ["dashboard-upcoming-reservations", restaurant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("reservations")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .gte("date", today)
        .not("status", "in", INVALID_RESERVATION_STATUS_FILTER)
        .order("date")
        .limit(5);
      return data || [];
    },
    enabled: !!restaurant,
  });

  const { data: totalOrders = 0 } = useQuery({
    queryKey: ["dashboard-total-orders", restaurant?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurant!.id)
        .not("status", "in", INVALID_ORDER_STATUS_FILTER);
      return count || 0;
    },
    enabled: !!restaurant,
  });

  const { data: totalUpcomingReservations = 0 } = useQuery({
    queryKey: ["dashboard-total-upcoming-reservations", restaurant?.id, today],
    queryFn: async () => {
      const { count } = await supabase
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurant!.id)
        .gte("date", today)
        .not("status", "in", INVALID_RESERVATION_STATUS_FILTER);
      return count || 0;
    },
    enabled: !!restaurant,
  });

  const { data: monthlyRevenue = 0 } = useQuery({
    queryKey: ["dashboard-monthly-revenue", restaurant?.id, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("total_amount")
        .eq("restaurant_id", restaurant!.id)
        .gte("created_at", monthStart)
        .not("status", "in", INVALID_ORDER_STATUS_FILTER);
      return (data || []).reduce((sum, order) => sum + Number(order.total_amount), 0);
    },
    enabled: !!restaurant,
  });

  const todayServiceCounts = upcomingReservations.reduce(
    (acc, reservation: any) => {
      if (reservation.date !== today) return acc;
      const period = getServicePeriodFromMetadata(reservation.metadata, reservation.time);
      acc[period] += 1;
      return acc;
    },
    { lunch: 0, dinner: 0 },
  );

  if (!restaurant) {
    return (
      <DashboardLayout>
        <div className="space-y-4 py-12 text-center">
          <h2 className="font-display text-2xl font-bold">Aucun restaurant</h2>
          <p className="text-muted-foreground">Creez votre restaurant depuis l'onglet "Mon restaurant".</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Bonjour, {restaurant.name}</h1>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Commandes validees</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalOrders}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Reservations a venir</CardTitle>
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Midi aujourd'hui</CardTitle>
              <SunMedium className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{todayServiceCounts.lunch}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Soir aujourd'hui</CardTitle>
              <MoonStar className="h-4 w-4 text-sky-500" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{todayServiceCounts.dinner}</p></CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-lg">Commandes recentes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {recentOrders?.map((order) => (
                <div key={order.id} className="flex items-center justify-between text-sm">
                  <span>{new Date(order.created_at).toLocaleDateString("fr-FR")}</span>
                  <span className="font-bold">{Number(order.total_amount).toFixed(2)} CHF</span>
                  <OrderStatusBadge status={normalizeOrderStatus(order.status)} />
                </div>
              ))}
              {(!recentOrders || recentOrders.length === 0) ? <p className="text-sm text-muted-foreground">Aucune commande</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">Reservations a venir</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {upcomingReservations?.map((reservation: any) => {
                const period = getServicePeriodFromMetadata(reservation.metadata, reservation.time);
                return (
                  <div key={reservation.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span>{new Date(reservation.date).toLocaleDateString("fr-FR")} a {reservation.time}</span>
                      <Badge variant="outline" className="text-[10px]">{getServicePeriodLabel(period)}</Badge>
                    </div>
                    <span>{reservation.party_size} pers.</span>
                    <OrderStatusBadge status={reservation.status} />
                  </div>
                );
              })}
              {(!upcomingReservations || upcomingReservations.length === 0) ? <p className="text-sm text-muted-foreground">Aucune reservation</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
