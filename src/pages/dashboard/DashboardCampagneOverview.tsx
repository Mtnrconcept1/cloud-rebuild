import { BarChart3, Eye, MousePointerClick, Pause, Play, TrendingUp } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardRestaurant } from "./DashboardContext";

type Campaign = {
  id: string;
  title: string;
  type: string;
  status: string | null;
  payment_status: string | null;
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
  const queryClient = useQueryClient();
  const { selectedId, restaurants, loading: loadingRestaurants, error: restaurantError } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;

  const { data: campaigns = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ["dashboard-campaigns-overview", selectedId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("ad_campaigns") as any)
        .select("id, title, type, status, payment_status, impressions, clicks, conversions, spent, total_budget, starts_at, ends_at, restaurant_id")
        .eq("restaurant_id", selectedId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Campaign[];
    },
    enabled: !!selectedId && !loadingRestaurants,
  });

  const error = queryError ? (queryError as Error).message : null;

  const totalImpressions = campaigns.reduce((sum, campaign) => sum + (campaign.impressions || 0), 0);
  const totalClicks = campaigns.reduce((sum, campaign) => sum + (campaign.clicks || 0), 0);
  const totalConversions = campaigns.reduce((sum, campaign) => sum + (campaign.conversions || 0), 0);
  const totalSpent = campaigns.reduce((sum, campaign) => sum + Number(campaign.spent || 0), 0);
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : "0";

  const toggleStatus = async (id: string, currentStatus: string | null) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    const { error: updateError } = await (supabase.from("ad_campaigns") as any).update({ status: newStatus }).eq("id", id);
    if (updateError) {
      toast({ title: "Erreur", description: updateError.message, variant: "destructive" });
      return;
    }
    toast({ title: `Campagne ${newStatus === "active" ? "activee" : "mise en pause"}` });
    queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns-overview", selectedId] });
  };

  const statusVariant = (status: string | null) => {
    switch (status) {
      case "active":
        return "default";
      case "paused":
      case "pending_payment":
        return "secondary";
      case "ended":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Vue d ensemble des campagnes</h1>
          <p className="text-sm text-muted-foreground">
            {selectedRestaurant ? `Synthese de ${selectedRestaurant.name}` : "Selectionnez un restaurant dans la barre laterale."}
          </p>
        </div>

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
              <p className="text-xs text-muted-foreground">Depense</p>
            </CardContent>
          </Card>
        </div>

        {loadingRestaurants || loading ? <p className="text-muted-foreground">Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
        {!loading && !error && selectedId && !campaigns.length ? (
          <p className="text-muted-foreground">Aucune campagne. Creez-en une depuis l onglet Campagnes.</p>
        ) : null}

        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const budget = Number(campaign.total_budget || 0);
            const spent = Number(campaign.spent || 0);
            const progress = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            const canActivate = (campaign.payment_status || "unpaid") === "paid";

            return (
              <Card key={campaign.id}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{campaign.title}</h3>
                      <Badge variant={statusVariant(campaign.status)}>{campaign.status || "draft"}</Badge>
                      <Badge variant="outline">{campaign.payment_status || "unpaid"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{campaign.type}</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleStatus(campaign.id, campaign.status)}
                      disabled={campaign.status === "ended" || !canActivate}
                    >
                      {campaign.status === "active" ? (
                        <><Pause className="h-3 w-3 mr-1" /> Pause</>
                      ) : (
                        <><Play className="h-3 w-3 mr-1" /> Activer</>
                      )}
                    </Button>
                  </div>

                  <div className="grid grid-cols-4 gap-4 text-center text-sm">
                    <div>
                      <p className="font-bold">{(campaign.impressions || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Impressions</p>
                    </div>
                    <div>
                      <p className="font-bold">{campaign.clicks || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Clics</p>
                    </div>
                    <div>
                      <p className="font-bold">{campaign.conversions || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Conversions</p>
                    </div>
                    <div>
                      <p className="font-bold">{spent.toFixed(0)} / {budget.toFixed(0)} CHF</p>
                      <p className="text-[10px] text-muted-foreground">Budget</p>
                    </div>
                  </div>

                  {budget > 0 ? (
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  ) : null}

                  {(campaign.starts_at || campaign.ends_at) ? (
                    <p className="text-[10px] text-muted-foreground">
                      {campaign.starts_at ? new Date(campaign.starts_at).toLocaleDateString("fr-FR") : "-"}
                      {" -> "}
                      {campaign.ends_at ? new Date(campaign.ends_at).toLocaleDateString("fr-FR") : "-"}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
