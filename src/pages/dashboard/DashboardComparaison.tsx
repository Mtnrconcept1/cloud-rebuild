import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Euro, Minus, Scale, ShoppingCart, Star } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

type ComparisonData = {
  my_revenue: number;
  my_orders: number;
  my_avg_rating: number;
  avg_revenue: number;
  avg_orders: number;
  avg_rating: number;
};

function DeltaIndicator({ my, avg, suffix = "", reverse = false }: { my: number; avg: number; suffix?: string; reverse?: boolean }) {
  if (avg === 0) return <span className="text-sm text-muted-foreground">-</span>;
  const diff = ((my - avg) / avg) * 100;
  const isPositive = reverse ? diff < 0 : diff > 0;
  const isNeutral = Math.abs(diff) < 2;

  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium", isNeutral ? "text-muted-foreground" : isPositive ? "text-primary" : "text-destructive")}>
      {isNeutral ? <Minus className="h-3 w-3" /> : isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(diff).toFixed(0)}%{suffix}
    </span>
  );
}

function MetricCard({
  label,
  icon: Icon,
  myValue,
  avgValue,
  format = "number",
  reverse = false,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  myValue: number;
  avgValue: number;
  format?: "number" | "currency" | "rating";
  reverse?: boolean;
}) {
  const fmt = (value: number) => {
    if (format === "currency") return `${value.toFixed(0)} CHF`;
    if (format === "rating") return `${value.toFixed(1)}/5`;
    return String(Math.round(value));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold">{fmt(myValue)}</p>
          <DeltaIndicator my={myValue} avg={avgValue} reverse={reverse} />
        </div>
        <p className="text-xs text-muted-foreground">Moyenne marché : {fmt(avgValue)}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardComparaison() {
  const { restaurants, selectedId, setSelectedId, loading: loadingRestaurants, error: restaurantError } = useDashboardRestaurant();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const [period, setPeriod] = useState("30d");
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!selectedId) {
      setComparison(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (isCommercialDemo && commercialDemoFrame) {
      const periodMultiplier = period === "7d" ? 0.25 : period === "90d" ? 3 : 1;
      const paidOrderRevenue = commercialDemoFrame.snapshot.order?.payment_status === "test_paid"
        ? Number(commercialDemoFrame.snapshot.order.total_amount_cents || 0) / 100
        : 0;
      const reservationDemand = commercialDemoFrame.snapshot.reservations.length;
      setComparison({
        my_revenue: Math.round((8250 + paidOrderRevenue * 8) * periodMultiplier),
        my_orders: Math.max(1, Math.round((186 + (paidOrderRevenue > 0 ? 1 : 0)) * periodMultiplier)),
        my_avg_rating: Math.max(0, Math.min(5, Number(commercialDemoFrame.snapshot.demo_restaurant.rating || 4.7))),
        avg_revenue: Math.round(7100 * periodMultiplier),
        avg_orders: Math.max(1, Math.round((162 + reservationDemand) * periodMultiplier)),
        avg_rating: 4.3,
      });
      setError(null);
      setLoading(false);
      return;
    }
    const { data, error: comparisonError } = await supabase.rpc("get_restaurant_comparison", {
      p_restaurant_id: selectedId,
      p_period: period,
    });
    setError(comparisonError?.message || null);
    setComparison(data as ComparisonData | null);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commercialDemoFrame, isCommercialDemo, selectedId, period]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Benchmark"
          title="Comparaison marché"
          description="Comparez votre chiffre d'affaires, le volume de commandes et la note moyenne avec la tendance du marché sur la période choisie."
          icon={Scale}
          tone="violet"
          visualLabel="Benchmark"
          illustration={DASHBOARD_ILLUSTRATIONS.restaurantComparison}
          stats={[
            { label: "CA restaurant", value: comparison ? `${Number(comparison.my_revenue).toFixed(0)} CHF` : "-", icon: Euro },
            { label: "Commandes", value: comparison ? Math.round(Number(comparison.my_orders)) : "-", icon: ShoppingCart },
            { label: "Note", value: comparison ? `${Number(comparison.my_avg_rating).toFixed(1)}/5` : "-", icon: Star },
          ]}
          actions={(
            <div className="flex flex-wrap gap-2">
              {restaurants.length > 1 ? (
                <Select value={selectedId || ""} onValueChange={setSelectedId}>
                  <SelectTrigger className="h-14 w-48 rounded-2xl border-border/70 bg-background/90 font-semibold dark:border-[#5f7aad]/35 dark:bg-[#040c1c]/86 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {restaurants.map((restaurant) => (
                      <SelectItem key={restaurant.id} value={restaurant.id}>
                        {restaurant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-14 w-36 rounded-2xl border-border/70 bg-background/90 font-semibold dark:border-[#5f7aad]/35 dark:bg-[#040c1c]/86 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 jours</SelectItem>
                  <SelectItem value="30d">30 jours</SelectItem>
                  <SelectItem value="90d">90 jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        />

        {loadingRestaurants || loading ? <p>Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur : {restaurantError || error}</p> : null}

        {comparison && !loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Chiffre d'affaires"
              icon={Euro}
              myValue={Number(comparison.my_revenue)}
              avgValue={Number(comparison.avg_revenue)}
              format="currency"
            />
            <MetricCard
              label="Commandes"
              icon={ShoppingCart}
              myValue={Number(comparison.my_orders)}
              avgValue={Number(comparison.avg_orders)}
            />
            <MetricCard
              label="Note moyenne"
              icon={Star}
              myValue={Number(comparison.my_avg_rating)}
              avgValue={Number(comparison.avg_rating)}
              format="rating"
            />
          </div>
        ) : null}

        {comparison && !loading ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Analyse
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {Number(comparison.my_revenue) > Number(comparison.avg_revenue) ? (
                <p>Votre CA est supérieur à la moyenne du marché sur cette période.</p>
              ) : (
                <p>Votre CA est en dessous de la moyenne. Pensez à activer des promotions ou ventes flash.</p>
              )}
              {Number(comparison.my_avg_rating) >= 4 ? (
                <p>Votre note client est excellente ({Number(comparison.my_avg_rating).toFixed(1)}/5).</p>
              ) : Number(comparison.my_avg_rating) > 0 ? (
                <p>Votre note peut être améliorée. Consultez les avis pour identifier les points à corriger.</p>
              ) : (
                <p>Pas encore d'avis. Encouragez vos clients à laisser un retour.</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
