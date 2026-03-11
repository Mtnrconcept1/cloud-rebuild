import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { TrendingUp, ShoppingCart, Euro, CalendarDays, XCircle, Star } from "lucide-react";
import { useDashboardRestaurant } from "./DashboardContext";

type KpiRow = {
  kpi_date: string;
  orders_count: number;
  revenue: number;
  avg_ticket: number;
  reservations_count: number;
  cancel_rate: number;
  satisfaction_score: number;
};

type OrderLite = { created_at: string; total_amount: number | string | null; status: string | null };
type ReservationLite = { date: string; status: string | null };

const INVALID_ORDER_STATUSES = new Set(["cancelled", "refused", "payment_failed"]);
const INVALID_RESERVATION_STATUSES = new Set(["cancelled", "no_show"]);

function dayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function buildFallbackKpis(orders: OrderLite[], reservations: ReservationLite[]): KpiRow[] {
  const byDay = new Map<
    string,
    { orderTotal: number; orderValid: number; revenue: number; reservations: number; cancelled: number }
  >();

  for (const order of orders) {
    const key = dayKeyFromIso(order.created_at);
    if (!key) continue;
    const bucket = byDay.get(key) || { orderTotal: 0, orderValid: 0, revenue: 0, reservations: 0, cancelled: 0 };
    bucket.orderTotal += 1;
    const status = String(order.status || "").toLowerCase();
    if (INVALID_ORDER_STATUSES.has(status)) {
      bucket.cancelled += 1;
    } else {
      bucket.orderValid += 1;
      bucket.revenue += Number(order.total_amount || 0);
    }
    byDay.set(key, bucket);
  }

  for (const reservation of reservations) {
    const key = reservation.date;
    if (!key) continue;
    const bucket = byDay.get(key) || { orderTotal: 0, orderValid: 0, revenue: 0, reservations: 0, cancelled: 0 };
    const status = String(reservation.status || "").toLowerCase();
    if (!INVALID_RESERVATION_STATUSES.has(status)) {
      bucket.reservations += 1;
    }
    byDay.set(key, bucket);
  }

  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kpi_date, v]) => ({
      kpi_date,
      orders_count: v.orderValid,
      revenue: v.revenue,
      avg_ticket: v.orderValid > 0 ? v.revenue / v.orderValid : 0,
      reservations_count: v.reservations,
      cancel_rate: v.orderTotal > 0 ? (v.cancelled / v.orderTotal) * 100 : 0,
      satisfaction_score: 0,
    }));
}

export default function DashboardPerformances() {
  const { restaurants, selectedId, setSelectedId, loading: loadingRestaurants, error: restaurantError } = useDashboardRestaurant();
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("30");

  const load = async () => {
    if (!selectedId) {
      setKpis([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const from = new Date();
    from.setDate(from.getDate() - Number(period));
    const fromDay = from.toISOString().slice(0, 10);

    const [kpiRes, ordersRes, reservationsRes] = await Promise.all([
      supabase
        .from("restaurant_daily_kpis")
        .select("kpi_date, orders_count, revenue, avg_ticket, reservations_count, cancel_rate, satisfaction_score")
        .eq("restaurant_id", selectedId)
        .gte("kpi_date", fromDay)
        .order("kpi_date", { ascending: true }),
      supabase
        .from("orders")
        .select("created_at, total_amount, status")
        .eq("restaurant_id", selectedId)
        .gte("created_at", `${fromDay}T00:00:00.000Z`),
      supabase
        .from("reservations")
        .select("date, status")
        .eq("restaurant_id", selectedId)
        .gte("date", fromDay),
    ]);

    const kpiRows = (kpiRes.data || []) as KpiRow[];
    if (kpiRows.length > 0) {
      setKpis(kpiRows);
      setError(kpiRes.error?.message || null);
      setLoading(false);
      return;
    }

    const fallbackRows = buildFallbackKpis((ordersRes.data || []) as OrderLite[], (reservationsRes.data || []) as ReservationLite[]);
    const fallbackError = ordersRes.error?.message || reservationsRes.error?.message || null;
    setKpis(fallbackRows);
    setError(fallbackRows.length > 0 && !fallbackError ? null : fallbackError || kpiRes.error?.message || null);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, period]);

  const totalOrders = kpis.reduce((s, k) => s + k.orders_count, 0);
  const totalRevenue = kpis.reduce((s, k) => s + Number(k.revenue), 0);
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalReservations = kpis.reduce((s, k) => s + k.reservations_count, 0);
  const avgCancel = kpis.length > 0 ? kpis.reduce((s, k) => s + Number(k.cancel_rate), 0) / kpis.length : 0;
  const satisfactionValues = kpis.map((k) => Number(k.satisfaction_score)).filter((v) => Number.isFinite(v) && v > 0);
  const avgSatisfaction = satisfactionValues.length > 0
    ? satisfactionValues.reduce((s, v) => s + v, 0) / satisfactionValues.length
    : 0;

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
              <Select value={selectedId || ""} onValueChange={setSelectedId}>
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
                if (!selectedId) return;
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
