import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, TrendingUp } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import PerformanceBusinessTab from "@/components/dashboard/performance/PerformanceBusinessTab";
import PerformanceTodayTab from "@/components/dashboard/performance/PerformanceTodayTab";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  buildPerformanceAlerts,
  buildPerformanceInsights,
  buildPerformanceSummary,
  buildPeriodServiceSummary,
  buildTodayActivity,
  buildTodayServiceSummary,
  getPerformancePeriodBounds,
  getTodayPerformanceSnapshot,
  type OrderPerformanceRow,
  type PerformanceSummary,
  type ReservationPerformanceRow,
  type ReviewPerformanceRow,
} from "@/lib/dashboardPerformance";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

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

function getCurrentServiceLabel(now = new Date()) {
  const hour = now.getHours();
  if (hour < 15) return "Midi";
  if (hour < 23) return "Soir";
  return "Hors service";
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
          .select("id, created_at, total_amount, status, metadata")
          .eq("restaurant_id", selectedId)
          .gte("created_at", fromTimestamp)
          .lt("created_at", toTimestampExclusive),
        supabase
          .from("reservations")
          .select("id, date, time, status, party_size, feature, total_amount, metadata")
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
      const summary = buildPerformanceSummary({
        orders,
        reservations,
        reviews,
        fromDay,
        toDay,
      });

      return {
        orders,
        reservations,
        reviews,
        summary,
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
  const orders = useMemo(() => performanceData?.orders || [], [performanceData?.orders]);
  const reservations = useMemo(() => performanceData?.reservations || [], [performanceData?.reservations]);
  const todaySnapshot = useMemo(() => getTodayPerformanceSnapshot(summary, toDay), [summary, toDay]);
  const todayServices = useMemo(() => buildTodayServiceSummary(reservations, toDay), [reservations, toDay]);
  const periodServices = useMemo(() => buildPeriodServiceSummary(reservations, fromDay, toDay), [reservations, fromDay, toDay]);
  const alerts = useMemo(
    () => buildPerformanceAlerts({ summary, today: todaySnapshot, todayServices }),
    [summary, todaySnapshot, todayServices],
  );
  const insights = useMemo(() => buildPerformanceInsights(summary), [summary]);
  const activity = useMemo(
    () => buildTodayActivity({ orders, reservations, dayKey: toDay }),
    [orders, reservations, toDay],
  );
  const chartData = useMemo(
    () => summary.dailyRows.map((row) => ({
      date: formatDayLabel(row.kpi_date),
      orders: row.orders_count,
      revenue: Number(row.revenue.toFixed(2)),
      avgTicket: Number(row.avg_ticket.toFixed(2)),
    })),
    [summary.dailyRows],
  );

  const isBusy = loadingRestaurants || loadingPerformance || loadingInvoices;
  const combinedError = restaurantError || getErrorMessage(performanceError) || getErrorMessage(invoicesError) || null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Analyse restaurateur"
          title="Performances"
          description={`Lecture du ${formatDayLabel(fromDay)} au ${formatDayLabel(toDay)} pour suivre le service du jour, le chiffre d'affaires, les annulations et les signaux business.`}
          icon={BarChart3}
          tone="sky"
          visualLabel="Performance"
          stats={[
            { label: "Restaurant", value: selectedRestaurant?.name || "Aucun", icon: BarChart3 },
            { label: "Commandes", value: summary.validOrdersCount, icon: TrendingUp },
            { label: "CA periode", value: `${summary.totalRevenue.toFixed(2)} CHF`, icon: TrendingUp },
          ]}
          actions={(
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-14 w-36 rounded-2xl border-border/70 bg-background/90 font-semibold dark:border-[#5f7aad]/35 dark:bg-[#040c1c]/86 dark:text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 jours</SelectItem>
              <SelectItem value="30">30 jours</SelectItem>
              <SelectItem value="90">90 jours</SelectItem>
            </SelectContent>
          </Select>
          )}
        />

        {!selectedId && !loadingRestaurants ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Aucun restaurant disponible pour ce dashboard.
            </CardContent>
          </Card>
        ) : null}

        {combinedError ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-center gap-3 py-4 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span>Erreur : {combinedError}</span>
            </CardContent>
          </Card>
        ) : null}

        {selectedId ? (
          <Tabs defaultValue="today" className="space-y-4">
            <TabsList className="h-auto rounded-2xl bg-muted/60 p-1">
              <TabsTrigger value="today" className="rounded-xl px-4 py-2.5">
                Pilotage du jour
              </TabsTrigger>
              <TabsTrigger value="business" className="rounded-xl px-4 py-2.5">
                Analyse business
              </TabsTrigger>
            </TabsList>

            {isBusy ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((entry) => (
                  <div key={entry} className="h-32 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            ) : null}

            {!isBusy && !combinedError && !summary.hasActivity ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <TrendingUp className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  <p>Aucune donnee de performance sur cette periode.</p>
                </CardContent>
              </Card>
            ) : null}

            {!isBusy && !combinedError && summary.hasActivity ? (
              <>
                <TabsContent value="today" className="mt-0">
                  <PerformanceTodayTab
                    snapshot={todaySnapshot}
                    alerts={alerts}
                    services={todayServices}
                    currentServiceLabel={getCurrentServiceLabel()}
                    recentOrders={activity.recentOrders}
                    recentReservations={activity.recentReservations}
                  />
                </TabsContent>

                <TabsContent value="business" className="mt-0">
                  <PerformanceBusinessTab
                    summary={summary}
                    chartData={chartData}
                    insights={insights}
                    serviceSummary={periodServices}
                    invoices={invoices as RestaurantInvoiceRow[]}
                  />
                </TabsContent>
              </>
            ) : null}
          </Tabs>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
