import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/integrations/supabase/client";
import { useDashboardRestaurant } from "./DashboardContext";
import { ArrowUp, ArrowDown, Minus, Scale, Euro, ShoppingCart, Star } from "lucide-react";
import { cn } from "@/lib/utils";

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
  if (avg === 0) return <span className="text-sm text-muted-foreground">—</span>;
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

function MetricCard({ label, icon: Icon, myValue, avgValue, format = "number", reverse = false }: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  myValue: number;
  avgValue: number;
  format?: "number" | "currency" | "rating";
  reverse?: boolean;
}) {
  const fmt = (v: number) => {
    if (format === "currency") return `${v.toFixed(0)} CHF`;
    if (format === "rating") return `${v.toFixed(1)}/5`;
    return String(Math.round(v));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          <Icon className="h-4 w-4" />{label}
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
    const { data, error } = await supabase.rpc("get_restaurant_comparison", {
      p_restaurant_id: selectedId,
      p_period: period,
    });
    setError(error?.message || null);
    setComparison(data as ComparisonData | null);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, period]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-bold">Comparaison marché</h1>
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
                <SelectItem value="7d">7 jours</SelectItem>
                <SelectItem value="30d">30 jours</SelectItem>
                <SelectItem value="90d">90 jours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadingRestaurants || loading ? <p>Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur : {restaurantError || error}</p> : null}

        {comparison && !loading && (
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
        )}

        {comparison && !loading && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" />Analyse</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              {Number(comparison.my_revenue) > Number(comparison.avg_revenue) ? (
                <p>✅ Votre CA est supérieur à la moyenne du marché sur cette période.</p>
              ) : (
                <p>⚠️ Votre CA est en dessous de la moyenne. Pensez à activer des promotions ou ventes flash.</p>
              )}
              {Number(comparison.my_avg_rating) >= 4 ? (
                <p>✅ Votre note client est excellente ({Number(comparison.my_avg_rating).toFixed(1)}/5).</p>
              ) : Number(comparison.my_avg_rating) > 0 ? (
                <p>💡 Votre note peut être améliorée. Consultez les avis pour identifier les points à corriger.</p>
              ) : (
                <p>📝 Pas encore d'avis. Encouragez vos clients à laisser un retour.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
