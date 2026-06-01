import { BarChart3, Clock, Eye, MousePointerClick, Pause, Play, TrendingUp, Wallet } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { listRestaurantCampaigns, setRestaurantCampaignStatus } from "@/lib/campaigns";
import {
  getCampaignObservedMetrics,
  getCampaignPricing,
  getCampaignStrategyConfig,
  normalizeCampaignPricingStrategy,
} from "@/lib/campaignPricing";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

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
  budget_daily: number | null;
  conversion_rate: number | null;
  daily_spent: number | null;
  daily_spent_date: string | null;
  cpc_rate: number | null;
  cpm_rate: number | null;
  pricing_strategy: string | null;
  starts_at: string | null;
  ends_at: string | null;
  restaurant_id: string;
};

function computePacingStatus(campaign: Campaign): { label: string; color: string } {
  const totalBudget = Number(campaign.total_budget || 0);
  const spent = Number(campaign.spent || 0);
  if (totalBudget <= 0 || !campaign.starts_at || !campaign.ends_at) {
    return { label: "N/A", color: "text-muted-foreground" };
  }

  const startsAt = Date.parse(campaign.starts_at);
  const endsAt = Date.parse(campaign.ends_at);
  const now = Date.now();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return { label: "N/A", color: "text-muted-foreground" };
  }

  const timeProgression = Math.min(1, Math.max(0, now - startsAt) / (endsAt - startsAt));
  if (timeProgression === 0) return { label: "Pas demarre", color: "text-muted-foreground" };

  const budgetProgression = spent / totalBudget;
  const ratio = budgetProgression / timeProgression;

  if (ratio < 0.8) return { label: "En retard", color: "text-orange-500" };
  if (ratio > 1.2) return { label: "En avance", color: "text-blue-500" };
  return { label: "Dans les temps", color: "text-green-500" };
}

function formatChf(value: number, digits = 2) {
  return `${Number(value || 0).toFixed(digits)} CHF`;
}

export default function DashboardCampagneOverview() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedId, restaurants, loading: loadingRestaurants, error: restaurantError } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;

  const { data: campaigns = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ["dashboard-campaigns-overview", selectedId],
    queryFn: async () => {
      const { data, error } = await listRestaurantCampaigns(selectedId!);
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
  const observedTotals = getCampaignObservedMetrics({
    impressions: totalImpressions,
    clicks: totalClicks,
    conversions: totalConversions,
    spent: totalSpent,
  });

  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const poolBudgetRestant = activeCampaigns.reduce((sum, c) => {
    const tb = Number(c.total_budget || 0);
    const sp = Number(c.spent || 0);
    return sum + Math.max(0, tb - sp);
  }, 0);
  const moyennePool = activeCampaigns.length > 0 ? poolBudgetRestant / activeCampaigns.length : 0;

  const toggleStatus = async (id: string, currentStatus: string | null) => {
    if (!selectedId) return;
    const newStatus = currentStatus === "active" ? "paused" : "active";
    const { error: updateError } = await setRestaurantCampaignStatus(selectedId, id, newStatus);
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
        <DashboardPageHero
          badge="Marketing restaurant"
          title="Vue d ensemble des campagnes"
          description={selectedRestaurant ? `Synthese de ${selectedRestaurant.name}: depenses, rythme, clics et conversions restent visibles avant le détail des campagnes.` : "Selectionnez un restaurant dans la barre laterale pour afficher la synthese marketing."}
          icon={BarChart3}
          tone="rose"
          visualLabel="Marketing"
          stats={[
            { label: "Campagnes actives", value: activeCampaigns.length, icon: Play },
            { label: "Depense totale", value: formatChf(totalSpent), icon: Wallet },
            { label: "CTR", value: `${ctr}%`, icon: MousePointerClick },
          ]}
        />

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
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
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold">{observedTotals.effectiveCpc > 0 ? observedTotals.effectiveCpc.toFixed(2) : "—"}</p>
              <p className="text-xs text-muted-foreground">CPC moyen (CHF)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold">{observedTotals.effectiveCpa > 0 ? observedTotals.effectiveCpa.toFixed(2) : "—"}</p>
              <p className="text-xs text-muted-foreground">CPA moyen (CHF)</p>
            </CardContent>
          </Card>
        </div>

        {loadingRestaurants || loading ? <p className="text-muted-foreground">Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
        {!loading && !error && selectedId && !campaigns.length ? (
          <p className="text-muted-foreground">Aucune campagne. Créez-en une depuis l onglet Campagnes.</p>
        ) : null}

        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const budget = Number(campaign.total_budget || 0);
            const spent = Number(campaign.spent || 0);
            const budgetRestant = Math.max(0, budget - spent);
            const progress = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            const canActivate = (campaign.payment_status || "unpaid") === "paid";
            const pricingStrategy = normalizeCampaignPricingStrategy(campaign.pricing_strategy, "conversion");
            const strategyConfig = getCampaignStrategyConfig(pricingStrategy);

            const budgetDaily = Number(campaign.budget_daily || 0);
            const today = new Date().toISOString().slice(0, 10);
            const dailySpent = (String(campaign.daily_spent_date || "") === today)
              ? Number(campaign.daily_spent || 0) : 0;
            const dailyProgress = budgetDaily > 0 ? Math.min(100, (dailySpent / budgetDaily) * 100) : 0;

            const pacing = computePacingStatus(campaign);
            const indiceVsMoyenne = moyennePool > 0 && campaign.status === "active"
              ? (budgetRestant / moyennePool) : null;
            const pricing = getCampaignPricing({
              cpmRate: Number(campaign.cpm_rate || 0),
              cpcRate: Number(campaign.cpc_rate || 0),
              conversionRate: Number(campaign.conversion_rate || 0),
            }, pricingStrategy);
            const observed = getCampaignObservedMetrics({
              impressions: campaign.impressions,
              clicks: campaign.clicks,
              conversions: campaign.conversions,
              spent: campaign.spent,
            });

            return (
              <Card key={campaign.id}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{campaign.title}</h3>
                      <Badge variant={statusVariant(campaign.status)}>{campaign.status || "draft"}</Badge>
                      <Badge variant="outline">{campaign.payment_status || "unpaid"}</Badge>
                      <Badge variant="outline" className="text-[10px]">{campaign.type}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{strategyConfig.shortLabel}</Badge>
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

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Restant:</span>
                      <span className="font-medium">{budgetRestant.toFixed(0)} CHF</span>
                    </div>

                    {budgetDaily > 0 ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Jour:</span>
                          <span className="font-medium">{dailySpent.toFixed(2)} / {budgetDaily.toFixed(0)} CHF</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1">
                          <div
                            className={`h-1 rounded-full transition-all ${dailyProgress >= 100 ? "bg-destructive" : "bg-blue-500"}`}
                            style={{ width: `${dailyProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Pacing:</span>
                      <span className={`font-medium ${pacing.color}`}>{pacing.label}</span>
                    </div>

                    {indiceVsMoyenne !== null ? (
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">vs moyenne:</span>
                        <span className={`font-medium ${indiceVsMoyenne >= 1 ? "text-green-500" : "text-orange-500"}`}>
                          {indiceVsMoyenne.toFixed(1)}x
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {(campaign.starts_at || campaign.ends_at) ? (
                    <p className="text-[10px] text-muted-foreground">
                      {campaign.starts_at ? new Date(campaign.starts_at).toLocaleDateString("fr-FR") : "-"}
                      {" -> "}
                      {campaign.ends_at ? new Date(campaign.ends_at).toLocaleDateString("fr-FR") : "-"}
                    </p>
                  ) : null}

                  <div className="rounded-xl border bg-muted/25 p-3">
                    <div className="flex flex-wrap gap-2 text-[11px] font-medium">
                      <span className="rounded-full bg-background px-2.5 py-1">Formule {strategyConfig.label}</span>
                      <span className="rounded-full bg-background px-2.5 py-1">Tarif {formatChf(pricing.cpmRate)} / 1k</span>
                      <span className="rounded-full bg-background px-2.5 py-1">Tarif {formatChf(pricing.cpcRate)} / clic</span>
                      <span className="rounded-full bg-background px-2.5 py-1">Tarif {formatChf(pricing.conversionRate)} / conv.</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                      <span>eCPM {observed.effectiveCpm > 0 ? formatChf(observed.effectiveCpm) : "—"}</span>
                      <span>CPC obs. {observed.effectiveCpc > 0 ? formatChf(observed.effectiveCpc) : "—"}</span>
                      <span>CPA obs. {observed.effectiveCpa > 0 ? formatChf(observed.effectiveCpa) : "—"}</span>
                    </div>
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
