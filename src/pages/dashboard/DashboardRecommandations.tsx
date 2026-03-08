import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";

type Recommendation = { priority: number; title: string; description: string; context: { metric: string; value: number | string; threshold?: number } };

export default function DashboardRecommandations() {
  const { toast } = useToast();
  const { restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!restaurantIds.length) return setLoading(false);
    setLoading(true);
    const { data, error } = await supabase.rpc("get_restaurant_recommendations", { p_restaurant_id: restaurantIds[0] });
    setError(error?.message || null);
    setItems(((data || []) as Recommendation[]).sort((a, b) => a.priority - b.priority));
    setLoading(false);
  };

  useEffect(() => { if (!loadingRestaurants) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loadingRestaurants, restaurantIds.join(",")]);

  return (
    <DashboardLayout><div className="space-y-6"><h1 className="font-display text-3xl font-bold">Recommandations</h1>
      <Card><CardHeader><CardTitle>Actions suggérées (KPI SQL)</CardTitle></CardHeader><CardContent><Button onClick={load} variant="outline">Rafraîchir</Button></CardContent></Card>
      {loadingRestaurants || loading ? <p>Chargement...</p> : null}
      {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
      {!loading && !error && !items.length ? <p>Aucune recommandation.</p> : null}
      <div className="space-y-2">{items.map((item, index) => <Card key={`${item.title}-${index}`}><CardContent className="pt-4"><p className="text-sm font-medium">P{item.priority} · {item.title}</p><p className="text-sm text-muted-foreground mt-1">{item.description}</p><p className="text-xs text-muted-foreground mt-2">KPI: {item.context?.metric} · Valeur: {String(item.context?.value)}{item.context?.threshold !== undefined ? ` · Seuil: ${item.context.threshold}` : ""}</p><div className="mt-3"><Button size="sm" onClick={() => toast({ title: "Action notée", description: item.title })}>Marquer comme traité</Button></div></CardContent></Card>)}</div>
    </div></DashboardLayout>
  );
}
