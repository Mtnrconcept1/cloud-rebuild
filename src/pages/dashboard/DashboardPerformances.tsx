import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { Database } from "@/integrations/supabase/types";
import {
  buildPerformanceSummary,
  getPerformancePeriodBounds,
  type OrderPerformanceRow,
  type PerformanceSummary,
  type ReservationPerformanceRow,
  type ReviewPerformanceRow,
} from "@/lib/dashboardPerformance";

type RestaurantInvoiceRow = Database["public"]["Tables"]["restaurant_invoices"]["Row"];

const EMPTY_SUMMARY: PerformanceSummary = {
  dailyRows: [],
  totalOrders: 0,
  validOrdersCount: 0,
  invalidOrdersCount: 0,
  totalRevenue: 0,
  grossRevenue: 0,
  avgTicket: 0,
  totalReservations: 0,
  cancelRate: 0,
  avgSatisfaction: 0,
  accountingAvgTicket: 0,
  reservationServiceBreakdown: {
    lunch: { count: 0, covers: 0 },
    dinner: { count: 0, covers: 0 },
  },
  discounts: {
    formula: 0,
    promo: 0,
    loyalty: 0,
    flex: 0,
    total: 0,
  },
  hasActivity: false,
};

function formatDayLabel(dayKey: string) {
  return new Date(`${dayKey}T00:00:00.000Z`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
}

export default function DashboardPerformances() {
  const { restaurants, selectedId, loading: loadingRestaurants, error: restaurantError } = useDashboardRestaurant();
  const [period, setPeriod] = useState("30");

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const { fromDay, toDay, fromTimestamp, toTimestampExclusive } = useMemo(
    () => getPerformancePeriodBounds(Number(period)),
    [period],
  );

  const {
    data: performanceData,
    isLoading: loadingPerformance,
    error: performanceError,
  } = useQuery({
    queryKey: ["dashboard-performance", selectedId, fromDay, toDay],
    queryFn: async () => {
      if (!selectedId) return null;

      const [ordersRes, reservationsRes, reviewsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("created_at, total_amount, status, metadata")
          .eq("restaurant_id", selectedId)
          .gte("created_at", fromTimestamp)
          .lt("created_at", toTimestampExclusive),
        supabase
          .from("reservations")
          .select("date, time, status, party_size, metadata")
          .eq("restaurant_id", selectedId)
          .gte("date", fromDay)
          .lte("date", toDay),
        supabase
          .from("reviews")
          .select("created_at, rating")
          .eq("restaurant_id", selectedId)
          .gte("created_at", fromTimestamp)
          .lt("created_at", toTimestampExclusive),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (reservationsRes.error) throw reservationsRes.error;
      if (reviewsRes.error) throw reviewsRes.error;

      const orders = (ordersRes.data || []) as OrderPerformanceRow[];
      const reservations = (reservationsRes.data || []) as ReservationPerformanceRow[];
      const reviews = (reviewsRes.data || []) as ReviewPerformanceRow[];

      return {
        orders,
        reservations,
        reviews,
        summary: buildPerformanceSummary({
          orders,
          reservations,
          reviews,
          fromDay,
          toDay,
        }),
      };
    },
    enabled: !!selectedId,
  });

  const {
    data: invoices = [],
    isLoading: loadingInvoices,
    error: invoicesError,
  } = useQuery({
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

  const summary = performanceData?.summary || EMPTY_SUMMARY;
  const chartData = summary.dailyRows.map((row) => ({
    date: formatDayLabel(row.kpi_date),
    Commandes: row.orders_count,
    "CA (CHF)": row.revenue,
    "Panier moyen": row.avg_ticket,
  }));

  const isBusy = loadingRestaurants || loadingPerformance || loadingInvoices;
  const combinedError = restaurantError || getErrorMessage(performanceError) || getErrorMessage(invoicesError) || null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold">Performances</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{selectedRestaurant?.name || "Aucun restaurant selectionne"}</Badge>
              <span className="text-sm text-muted-foreground">
                Donnees filtrees sur le restaurant selectionne du {formatDayLabel(fromDay)} au {formatDayLabel(toDay)}.
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
                <CardContent>
                  <p className="text-2xl font-bold">{summary.totalOrders}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <Euro className="h-4 w-4" />
                    CA
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.totalRevenue.toFixed(0)} CHF</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    Panier moyen
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.avgTicket.toFixed(1)} CHF</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    Reservations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.totalReservations}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <XCircle className="h-4 w-4" />
                    Annulation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.cancelRate.toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <Star className="h-4 w-4" />
                    Satisfaction
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {summary.avgSatisfaction > 0 ? `${summary.avgSatisfaction.toFixed(1)}/5` : "N/A"}
                  </p>
                </CardContent>
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
                <CardContent>
                  <p className="text-2xl font-bold text-primary">{summary.totalRevenue.toFixed(2)} CHF</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">CA brut estime</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.grossRevenue.toFixed(2)} CHF</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Commandes valides</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.validOrdersCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Panier comptable</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.accountingAvgTicket.toFixed(2)} CHF</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Annulation commandes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.cancelRate.toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Reservations midi</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold">{summary.reservationServiceBreakdown.lunch.count}</p>
                      <p className="text-xs text-muted-foreground">
                        {summary.reservationServiceBreakdown.lunch.covers} couverts
                      </p>
                    </div>
                    <SunMedium className="h-5 w-5 text-amber-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Reservations soir</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold">{summary.reservationServiceBreakdown.dinner.count}</p>
                      <p className="text-xs text-muted-foreground">
                        {summary.reservationServiceBreakdown.dinner.covers} couverts
                      </p>
                    </div>
                    <MoonStar className="h-5 w-5 text-sky-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {isBusy ? <p>Chargement...</p> : null}
            {combinedError ? <p className="text-destructive">Erreur : {combinedError}</p> : null}

            {!loadingPerformance && summary.hasActivity ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Chiffre d'affaires</CardTitle>
                  </CardHeader>
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
                  <CardHeader>
                    <CardTitle>Commandes / jour</CardTitle>
                  </CardHeader>
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
                  <div className="flex justify-between">
                    <span>Formules</span>
                    <span>-{summary.discounts.formula.toFixed(2)} CHF</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Promotions</span>
                    <span>-{summary.discounts.promo.toFixed(2)} CHF</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fidelite</span>
                    <span>-{summary.discounts.loyalty.toFixed(2)} CHF</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Flex</span>
                    <span>-{summary.discounts.flex.toFixed(2)} CHF</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Total remises</span>
                    <span>-{summary.discounts.total.toFixed(2)} CHF</span>
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
                  <p>Le CA net exclut les commandes annulees, refusees et en echec de paiement.</p>
                  <p>Le CA brut estime reconstitue les remises retrouvees dans les metadonnees de commande.</p>
                  <p>Les reservations du dashboard sont bornees a la periode selectionnee, sans inclure le futur.</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <h2 className="font-display flex items-center gap-2 text-xl font-bold">
                <Receipt className="h-5 w-5" />
                Factures recentes
              </h2>
              {loadingInvoices ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">Chargement...</CardContent>
                </Card>
              ) : !invoices.length ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">Aucune facture disponible</CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {invoices.map((invoice: RestaurantInvoiceRow) => (
                    <Card key={invoice.id}>
                      <CardContent className="flex items-center justify-between gap-3 py-4">
                        <div>
                          <p className="text-sm font-semibold">
                            {invoice.period_start} {"->"} {invoice.period_end}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            HT: {Number(invoice.amount_ht).toFixed(2)} | TVA: {Number(invoice.amount_tva).toFixed(2)} |
                            TTC: {Number(invoice.amount_ttc).toFixed(2)} CHF
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

            {!loadingPerformance && !combinedError && !summary.hasActivity ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <TrendingUp className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  <p>Aucune donnee de performance sur cette periode.</p>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
