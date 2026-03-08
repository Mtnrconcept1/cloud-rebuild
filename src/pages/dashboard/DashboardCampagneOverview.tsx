import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { BarChart3, Eye, MousePointerClick, TrendingUp, Pause, Play } from "lucide-react";

type Campaign = {
  id: string;
  title: string;
  type: string;
  status: string | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  spent: number | null;
  total_budget: number | null;
  starts_at: string | null;
  ends_at: string | null;
  restaurant_id: string;
};

export default function DashboardCampagneOverview() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!restaurantIds.length) { setCampaigns([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("ad_campaigns")
      .select("id, title, type, status, impressions, clicks, conversions, spent, total_budget, starts_at, ends_at, restaurant_id")
      .in("restaurant_id", restaurantIds)
      .order("created_at", { ascending: false });
    setError(error?.message || null);
    setCampaigns((data || []) as Campaign[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurants) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRestaurants, restaurantIds.join(",")]);

  const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
  const totalConversions = campaigns.reduce((s, c) => s + (c.conversions || 0), 0);
  const totalSpent = campaigns.reduce((s, c) => s + Number(c.spent || 0), 0);
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : "0";

  const toggleStatus = async (id: string, currentStatus: string | null) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    const { error } = await supabase.from("ad_campaigns").update({ status: newStatus }).eq("id", id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: `Campagne ${newStatus === "active" ? "activée" : "mise en pause"}` });
    load();
  };

  const statusColor = (status: string | null) => {
    switch (status) {
      case "active": return "default";
      case "paused": return "secondary";
      case "draft": return "outline";
      case "ended": return "destructive";
      default: return "outline";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Vue d'ensemble des campagnes</h1>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <Eye className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Impressions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <MousePointerClick className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Clics</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{ctr}%</p>
              <p className="text-xs text-muted-foreground">CTR</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <BarChart3 className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{totalConversions}</p>
              <p className="text-xs text-muted-foreground">Conversions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold">{totalSpent.toFixed(0)} CHF</p>
              <p className="text-xs text-muted-foreground">Dépensé</p>
            </CardContent>
          </Card>
        </div>

        {loadingRestaurants || loading ? <p className="text-muted-foreground">Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
        {!loading && !error && !campaigns.length ? <p className="text-muted-foreground">Aucune campagne. Créez-en une depuis l'onglet Campagnes.</p> : null}

        <div className="space-y-3">
          {campaigns.map((c) => {
            const budget = Number(c.total_budget || 0);
            const spent = Number(c.spent || 0);
            const progress = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

            return (
              <Card key={c.id}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{c.title}</h3>
                      <Badge variant={statusColor(c.status)}>{c.status || "draft"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{c.type}</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleStatus(c.id, c.status)}
                      disabled={c.status === "ended"}
                    >
                      {c.status === "active" ? <><Pause className="h-3 w-3 mr-1" /> Pause</> : <><Play className="h-3 w-3 mr-1" /> Activer</>}
                    </Button>
                  </div>

                  <div className="grid grid-cols-4 gap-4 text-center text-sm">
                    <div>
                      <p className="font-bold">{(c.impressions || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Impressions</p>
                    </div>
                    <div>
                      <p className="font-bold">{c.clicks || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Clics</p>
                    </div>
                    <div>
                      <p className="font-bold">{c.conversions || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Conversions</p>
                    </div>
                    <div>
                      <p className="font-bold">{spent.toFixed(0)} / {budget.toFixed(0)} CHF</p>
                      <p className="text-[10px] text-muted-foreground">Budget</p>
                    </div>
                  </div>

                  {budget > 0 && (
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  )}

                  {(c.starts_at || c.ends_at) && (
                    <p className="text-[10px] text-muted-foreground">
                      {c.starts_at ? new Date(c.starts_at).toLocaleDateString("fr-FR") : "—"} → {c.ends_at ? new Date(c.ends_at).toLocaleDateString("fr-FR") : "—"}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
