import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { TrendingUp, ShoppingCart, Euro, CalendarDays, XCircle, Star } from "lucide-react";

type KpiRow = {
  kpi_date: string;
  orders_count: number;
  revenue: number;
  avg_ticket: number;
  reservations_count: number;
  cancel_rate: number;
  satisfaction_score: number;
};

export default function DashboardPerformances() {
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("");
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("30");

  useEffect(() => {
    if (!loadingRestaurants && restaurants.length && !selectedRestaurant) {
      setSelectedRestaurant(restaurants[0].id);
    }
  }, [loadingRestaurants, restaurants, selectedRestaurant]);

  const load = async () => {
    if (!selectedRestaurant) return setLoading(false);
    setLoading(true);
    const from = new Date();
    from.setDate(from.getDate() - Number(period));
    const { data, error } = await supabase
      .from("restaurant_daily_kpis")
      .select("kpi_date, orders_count, revenue, avg_ticket, reservations_count, cancel_rate, satisfaction_score")
      .eq("restaurant_id", selectedRestaurant)
      .gte("kpi_date", from.toISOString().slice(0, 10))
      .order("kpi_date", { ascending: true });
    setError(error?.message || null);
    setKpis((data || []) as KpiRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedRestaurant) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRestaurant, period]);

  const totalOrders = kpis.reduce((s, k) => s + k.orders_count, 0);
  const totalRevenue = kpis.reduce((s, k) => s + Number(k.revenue), 0);
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalReservations = kpis.reduce((s, k) => s + k.reservations_count, 0);
  const avgCancel = kpis.length > 0 ? kpis.reduce((s, k) => s + Number(k.cancel_rate), 0) / kpis.length : 0;
  const avgSatisfaction = kpis.length > 0 ? kpis.reduce((s, k) => s + Number(k.satisfaction_score), 0) / kpis.filter(k => k.satisfaction_score > 0).length : 0;

  const chartData = kpis.map((k) => ({
    date: new Date(k.kpi_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    Commandes: k.orders_count,
    "CA (CHF)": Number(k.revenue),
    "Panier moyen": Number(k.avg_ticket),
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-bold">Performances</h1>
          <div className="flex gap-2">
            {restaurants.length > 1 && (
              <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 jours</SelectItem>
                <SelectItem value="30">30 jours</SelectItem>
                <SelectItem value="90">90 jours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1"><ShoppingCart className="h-4 w-4" />Commandes</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalOrders}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1"><Euro className="h-4 w-4" />CA</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalRevenue.toFixed(0)} CHF</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1"><TrendingUp className="h-4 w-4" />Panier moyen</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{avgTicket.toFixed(1)} CHF</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1"><CalendarDays className="h-4 w-4" />Réservations</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalReservations}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1"><XCircle className="h-4 w-4" />Annulation</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{avgCancel.toFixed(1)}%</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1"><Star className="h-4 w-4" />Client Satisfaction</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{avgSatisfaction > 0 ? `${avgSatisfaction.toFixed(1)}/5` : "N/A"}</p></CardContent>
          </Card>
        </div>

        {loadingRestaurants || loading ? <p>Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur : {restaurantError || error}</p> : null}

        {!loading && chartData.length > 0 && (
          <>
            <Card>
              <CardHeader><CardTitle>Chiffre d'affaires</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="CA (CHF)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Commandes / jour</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Line type="monotone" dataKey="Commandes" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        {!loading && !error && chartData.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <TrendingUp className="mx-auto h-10 w-10 mb-2 opacity-40" />
              <p>Aucune donnée de performance sur cette période.</p>
              <Button variant="outline" className="mt-3" onClick={async () => {
                if (!selectedRestaurant) return;
                await supabase.rpc("refresh_restaurant_daily_kpis_recent_days", { p_days_back: Number(period) });
                load();
              }}>
                Recalculer les KPIs
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
