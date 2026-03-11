import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import {
  TrendingUp,
  ShoppingCart,
  Euro,
  CalendarDays,
  SunMedium,
  MoonStar,
  XCircle,
  Star,
  DollarSign,
  Receipt,
  CreditCard,
  Percent,
} from "lucide-react";
import { useDashboardRestaurant } from "./DashboardContext";
import { getServicePeriodFromMetadata } from "@/lib/serviceSettings";

type KpiRow = {
  kpi_date: string;
  orders_count: number;
  revenue: number;
  avg_ticket: number;
  reservations_count: number;
  cancel_rate: number;
  satisfaction_score: number;
};

type OrderLite = {
  created_at: string;
  total_amount: number | string | null;
  status: string | null;
  metadata?: unknown;
};

type ReservationLite = {
  date: string;
  time?: string | null;
  status: string | null;
  party_size?: number | null;
  metadata?: unknown;
};

const INVALID_ORDER_STATUSES = new Set(["cancelled", "refused", "payment_failed"]);
const INVALID_RESERVATION_STATUSES = new Set(["cancelled", "no_show"]);

function dayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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
    if (!reservation.date) continue;
    const bucket = byDay.get(reservation.date) || { orderTotal: 0, orderValid: 0, revenue: 0, reservations: 0, cancelled: 0 };
    const status = String(reservation.status || "").toLowerCase();
    if (!INVALID_RESERVATION_STATUSES.has(status)) {
      bucket.reservations += 1;
    }
    byDay.set(reservation.date, bucket);
  }

  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kpi_date, value]) => ({
      kpi_date,
      orders_count: value.orderValid,
      revenue: value.revenue,
      avg_ticket: value.orderValid > 0 ? value.revenue / value.orderValid : 0,
      reservations_count: value.reservations,
      cancel_rate: value.orderTotal > 0 ? (value.cancelled / value.orderTotal) * 100 : 0,
      satisfaction_score: 0,
    }));
}

export default function DashboardPerformances() {
  const { restaurants, selectedId, loading: loadingRestaurants, error: restaurantError } = useDashboardRestaurant();
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [reservations, setReservations] = useState<ReservationLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("30");

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const from = new Date();
  from.setDate(from.getDate() - Number(period));
  const fromDay = from.toISOString().slice(0, 10);

  const { data: invoices = [], isLoading: loadingInvoices, error: invoicesError } = useQuery({
    queryKey: ["dashboard-performance-invoices", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error: invoiceError } = await supabase
        .from("restaurant_invoices")
        .select("*")
        .eq("restaurant_id", selectedId)
        .order("period_end", { ascending: false })
        .limit(10);
      if (invoiceError) throw invoiceError;
      return data || [];
    },
    enabled: !!selectedId,
  });

  const load = async () => {
    if (!selectedId) {
      setKpis([]);
      setOrders([]);
      setReservations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [kpiRes, ordersRes, reservationsRes] = await Promise.all([
      supabase
        .from("restaurant_daily_kpis")
        .select("kpi_date, orders_count, revenue, avg_ticket, reservations_count, cancel_rate, satisfaction_score")
        .eq("restaurant_id", selectedId)
        .gte("kpi_date", fromDay)
        .order("kpi_date", { ascending: true }),
      supabase
        .from("orders")
        .select("created_at, total_amount, status, metadata")
        .eq("restaurant_id", selectedId)
        .gte("created_at", `${fromDay}T00:00:00.000Z`),
      supabase
        .from("reservations")
        .select("date, time, status, party_size, metadata")
        .eq("restaurant_id", selectedId)
        .gte("date", fromDay),
    ]);

    const orderRows = (ordersRes.data || []) as OrderLite[];
    const reservationRows = (reservationsRes.data || []) as ReservationLite[];
    setOrders(orderRows);
    setReservations(reservationRows);

    const kpiRows = (kpiRes.data || []) as KpiRow[];
    if (kpiRows.length > 0) {
      setKpis(kpiRows);
      setError(kpiRes.error?.message || ordersRes.error?.message || reservationsRes.error?.message || null);
      setLoading(false);
      return;
    }

    const fallbackRows = buildFallbackKpis(orderRows, reservationRows);
    const fallbackError = ordersRes.error?.message || reservationsRes.error?.message || null;
    setKpis(fallbackRows);
    setError(fallbackRows.length > 0 && !fallbackError ? null : fallbackError || kpiRes.error?.message || null);
    setLoading(false);
  };

  const refreshSelectedRestaurantKpis = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);

    try {
      for (let offset = Number(period) - 1; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        await supabase.rpc("refresh_restaurant_daily_kpis_for_date", {
          p_restaurant_id: selectedId,
          p_day: date.toISOString().slice(0, 10),
        });
      }
      await load();
    } catch (refreshError) {
      setLoading(false);
      setError(refreshError instanceof Error ? refreshError.message : "Impossible de recalculer les KPIs.");
    }
  };

  useEffect(() => {
    if (selectedId) load();
    else {
      setKpis([]);
      setOrders([]);
      setReservations([]);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, period]);

  const totalOrders = kpis.reduce((sum, kpi) => sum + Number(kpi.orders_count || 0), 0);
  const totalRevenue = kpis.reduce((sum, kpi) => sum + Number(kpi.revenue || 0), 0);
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalReservations = kpis.reduce((sum, kpi) => sum + Number(kpi.reservations_count || 0), 0);
  const avgCancel =
    kpis.length > 0 ? kpis.reduce((sum, kpi) => sum + Number(kpi.cancel_rate || 0), 0) / kpis.length : 0;
  const satisfactionValues = kpis
    .map((kpi) => Number(kpi.satisfaction_score))
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgSatisfaction =
    satisfactionValues.length > 0 ? satisfactionValues.reduce((sum, value) => sum + value, 0) / satisfactionValues.length : 0;

  const validOrders = orders.filter((order) => !INVALID_ORDER_STATUSES.has(String(order.status || "").toLowerCase()));
  const validReservations = reservations.filter(
    (reservation) => !INVALID_RESERVATION_STATUSES.has(String(reservation.status || "").toLowerCase()),
  );
  const reservationServiceBreakdown = validReservations.reduce(
    (acc, reservation) => {
      const periodKey = getServicePeriodFromMetadata(reservation.metadata, reservation.time || null);
      acc[periodKey].count += 1;
      acc[periodKey].covers += Number(reservation.party_size || 0);
      return acc;
    },
    {
      lunch: { count: 0, covers: 0 },
      dinner: { count: 0, covers: 0 },
    },
  );

  const invalidOrders = orders.length - validOrders.length;
  let formulaDiscount = 0;
  let promoDiscount = 0;
  let loyaltyDiscount = 0;
  let flexDiscount = 0;

  for (const order of validOrders) {
    const metadata = isRecord(order.metadata) ? order.metadata : {};
    const formulaValue = toNumber(metadata.formula_discount_amount);
    formulaDiscount += formulaValue || toNumber(metadata.formula_discount);
    promoDiscount += toNumber(metadata.promotion_discount_amount) || toNumber(metadata.promo_discount_amount);
    loyaltyDiscount += toNumber(metadata.points_discount);
    flexDiscount += toNumber(metadata.flex_discount);
  }

  const totalDiscounts = formulaDiscount + promoDiscount + loyaltyDiscount + flexDiscount;
  const netRevenue = validOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const grossRevenue = netRevenue + totalDiscounts;
  const accountingAvgTicket = validOrders.length > 0 ? netRevenue / validOrders.length : 0;
  const accountingCancelRate = orders.length > 0 ? Math.round((invalidOrders / orders.length) * 100) : 0;

  const chartData = kpis.map((kpi) => ({
    date: new Date(kpi.kpi_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    Commandes: Number(kpi.orders_count || 0),
    "CA (CHF)": Number(kpi.revenue || 0),
    "Panier moyen": Number(kpi.avg_ticket || 0),
  }));

  const isBusy = loadingRestaurants || loading || loadingInvoices;
  const combinedError = restaurantError || error || invoicesError?.message || null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold">Performances</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{selectedRestaurant?.name || "Aucun restaurant selectionne"}</Badge>
              <span className="text-sm text-muted-foreground">
                Toutes les donnees affichees sont filtrees sur le restaurant selectionne.
              </span>
            </div>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 jours</SelectItem>
              <SelectItem value="30">30 jours</SelectItem>
              <SelectItem value="90">90 jours</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!selectedId && !loadingRestaurants ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Aucun restaurant disponible pour ce dashboard.
            </CardContent>
          </Card>
        ) : null}

        {selectedId ? (
          <>
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <ShoppingCart className="h-4 w-4" />
                    Commandes
                  </CardTitle>
                </CardHeader>
                <CardContent><p className="text-2xl font-bold">{totalOrders}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <Euro className="h-4 w-4" />
                    CA
                  </CardTitle>
                </CardHeader>
                <CardContent><p className="text-2xl font-bold">{totalRevenue.toFixed(0)} CHF</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    Panier moyen
                  </CardTitle>
                </CardHeader>
                <CardContent><p className="text-2xl font-bold">{avgTicket.toFixed(1)} CHF</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    Reservations
                  </CardTitle>
                </CardHeader>
                <CardContent><p className="text-2xl font-bold">{totalReservations}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <XCircle className="h-4 w-4" />
                    Annulation
                  </CardTitle>
                </CardHeader>
                <CardContent><p className="text-2xl font-bold">{avgCancel.toFixed(1)}%</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <Star className="h-4 w-4" />
                    Satisfaction
                  </CardTitle>
                </CardHeader>
                <CardContent><p className="text-2xl font-bold">{avgSatisfaction > 0 ? `${avgSatisfaction.toFixed(1)}/5` : "N/A"}</p></CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    CA net
                  </CardTitle>
                </CardHeader>
                <CardContent><p className="text-2xl font-bold text-primary">{netRevenue.toFixed(2)} CHF</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">CA brut estime</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{grossRevenue.toFixed(2)} CHF</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Commandes valides</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{validOrders.length}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Panier comptable</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{accountingAvgTicket.toFixed(2)} CHF</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Annulation commandes</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{accountingCancelRate}%</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Reservations midi</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold">{reservationServiceBreakdown.lunch.count}</p>
                      <p className="text-xs text-muted-foreground">{reservationServiceBreakdown.lunch.covers} couverts</p>
                    </div>
                    <SunMedium className="h-5 w-5 text-amber-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Reservations soir</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold">{reservationServiceBreakdown.dinner.count}</p>
                      <p className="text-xs text-muted-foreground">{reservationServiceBreakdown.dinner.covers} couverts</p>
                    </div>
                    <MoonStar className="h-5 w-5 text-sky-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {isBusy ? <p>Chargement...</p> : null}
            {combinedError ? <p className="text-destructive">Erreur : {combinedError}</p> : null}

            {!loading && chartData.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
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
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Percent className="h-4 w-4" />
                    Remises sur la periode
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Formules</span><span>-{formulaDiscount.toFixed(2)} CHF</span></div>
                  <div className="flex justify-between"><span>Promotions</span><span>-{promoDiscount.toFixed(2)} CHF</span></div>
                  <div className="flex justify-between"><span>Fidelite</span><span>-{loyaltyDiscount.toFixed(2)} CHF</span></div>
                  <div className="flex justify-between"><span>Flex</span><span>-{flexDiscount.toFixed(2)} CHF</span></div>
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Total remises</span>
                    <span>-{totalDiscounts.toFixed(2)} CHF</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4" />
                    Lecture comptable
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p>Le CA net correspond aux commandes validees du restaurant selectionne.</p>
                  <p>Le CA brut estime ajoute les remises retrouvees dans les metadonnees de commande.</p>
                  <p>Les reservations sont maintenant ventilees entre service du midi et service du soir.</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <h2 className="font-display flex items-center gap-2 text-xl font-bold">
                <Receipt className="h-5 w-5" />
                Factures recentes
              </h2>
              {loadingInvoices ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Chargement...</CardContent></Card>
              ) : !invoices.length ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Aucune facture disponible</CardContent></Card>
              ) : (
                <div className="space-y-3">
                  {invoices.map((invoice: any) => (
                    <Card key={invoice.id}>
                      <CardContent className="flex items-center justify-between gap-3 py-4">
                        <div>
                          <p className="text-sm font-semibold">{invoice.period_start} {"->"} {invoice.period_end}</p>
                          <p className="text-xs text-muted-foreground">
                            HT: {Number(invoice.amount_ht).toFixed(2)} | TVA: {Number(invoice.amount_tva).toFixed(2)} | TTC: {Number(invoice.amount_ttc).toFixed(2)} CHF
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={invoice.status === "paid" ? "default" : invoice.status === "sent" ? "secondary" : "outline"}
                            className="text-[10px]"
                          >
                            {invoice.status === "paid" ? "Payee" : invoice.status === "sent" ? "Envoyee" : "Brouillon"}
                          </Badge>
                          {invoice.pdf_url ? (
                            <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                              PDF
                            </a>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {!loading && !combinedError && chartData.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <TrendingUp className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  <p>Aucune donnee de performance sur cette periode.</p>
                  <Button variant="outline" className="mt-3" onClick={refreshSelectedRestaurantKpis}>
                    Recalculer les KPIs
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
