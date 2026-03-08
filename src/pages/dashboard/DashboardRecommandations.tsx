import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Lightbulb, CheckCircle2, RefreshCw, TrendingUp, AlertTriangle, Star } from "lucide-react";

type RecommendationRow = {
  id: string;
  recommendation_type: string;
  payload: any;
  priority: number;
  status: string;
  generated_at: string;
};

const typeIcons: Record<string, typeof TrendingUp> = {
  revenue: TrendingUp,
  quality: Star,
  risk: AlertTriangle,
};

const typeLabels: Record<string, string> = {
  menu_optimization: "Optimisation menu",
  pricing: "Tarification",
  marketing: "Marketing",
  operations: "Opérations",
  quality: "Qualité",
  revenue: "Chiffre d'affaires",
  risk: "Risque",
};

export default function DashboardRecommandations() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<RecommendationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!restaurantIds.length) { setItems([]); setLoading(false); return; }
    setLoading(true);
    setError(null);

    // Query the table directly for richer data
    const { data, error } = await supabase
      .from("restaurant_recommendations")
      .select("id, recommendation_type, payload, priority, status, generated_at")
      .in("restaurant_id", restaurantIds)
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .limit(20);

    if (error) setError(error.message);
    else setItems((data || []) as RecommendationRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurants) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRestaurants, restaurantIds.join(",")]);

  const markDone = async (id: string) => {
    const { error } = await supabase
      .from("restaurant_recommendations")
      .update({ status: "done" })
      .eq("id", id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Recommandation traitée" });
    load();
  };

  const dismiss = async (id: string) => {
    const { error } = await supabase
      .from("restaurant_recommendations")
      .update({ status: "dismissed" })
      .eq("id", id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Recommandation ignorée" });
    load();
  };

  const refreshRecommendations = async () => {
    if (!restaurantIds.length) return;
    setRefreshing(true);
    const { error } = await supabase.rpc("get_restaurant_recommendations", { p_restaurant_id: restaurantIds[0] });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else toast({ title: "Recommandations actualisées" });
    setRefreshing(false);
    load();
  };

  const getPayloadField = (payload: any, field: string): string => {
    if (!payload || typeof payload !== "object") return "";
    return String(payload[field] || "");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-7 w-7 text-primary" />
            <h1 className="font-display text-3xl font-bold">Recommandations</h1>
          </div>
          <Button variant="outline" onClick={refreshRecommendations} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>

        {loadingRestaurants || loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : null}

        {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}

        {!loading && !error && !items.length ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-500" />
              <p className="font-semibold">Tout est optimisé !</p>
              <p className="text-sm text-muted-foreground">Aucune recommandation en attente pour vos restaurants.</p>
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-3">
          {items.map((rec) => {
            const Icon = typeIcons[rec.recommendation_type] || Lightbulb;
            const title = getPayloadField(rec.payload, "title") || typeLabels[rec.recommendation_type] || rec.recommendation_type;
            const description = getPayloadField(rec.payload, "description");
            const metric = getPayloadField(rec.payload, "metric");
            const value = getPayloadField(rec.payload, "value");
            const threshold = getPayloadField(rec.payload, "threshold");

            return (
              <Card key={rec.id}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        rec.priority <= 1 ? "bg-destructive/10 text-destructive" :
                        rec.priority <= 2 ? "bg-amber-500/10 text-amber-600" :
                        "bg-primary/10 text-primary"
                      }`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{title}</h3>
                          <Badge variant="outline" className="text-[10px]">
                            P{rec.priority}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {typeLabels[rec.recommendation_type] || rec.recommendation_type}
                          </Badge>
                        </div>
                        {description && <p className="text-sm text-muted-foreground">{description}</p>}
                        {(metric || value) && (
                          <p className="text-xs text-muted-foreground">
                            {metric && `KPI: ${metric}`}
                            {value && ` · Valeur: ${value}`}
                            {threshold && ` · Seuil: ${threshold}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => markDone(rec.id)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Traité
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => dismiss(rec.id)}>
                      Ignorer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
