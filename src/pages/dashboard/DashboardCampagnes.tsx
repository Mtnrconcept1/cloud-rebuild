import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Edit2,
  Eye,
  Loader2,
  MapPin,
  Megaphone,
  MousePointer,
  Plus,
  ShoppingCart,
  Sparkles,
  Target,
  Timer,
  Type,
  Trash2,
  TrendingUp,
  Wallet,
  WalletCards,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AudienceTargeting from "@/components/AudienceTargeting";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";
import ImageUpload from "@/components/ImageUpload";
import SponsoredRestaurantTemplateCard from "@/components/campaigns/SponsoredRestaurantTemplateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import {
  DEFAULT_CAMPAIGN_CREATIVE,
  normalizeCampaignCreative,
  type CampaignBannerSeparator,
  type CampaignBannerTextPlacement,
  type CampaignCreativeConfig,
  type CampaignCreativeTextElement,
} from "@/lib/campaignCreative";
import {
  DEFAULT_AUDIENCE_CRITERIA,
  normalizeAudienceCriteria,
  summarizeAudienceCriteria,
  type AudienceCriteria,
} from "@/lib/campaignTargeting";
import {
  CAMPAIGN_STRATEGY_CONFIG,
  CAMPAIGN_MARKET_BENCHMARKS,
  CAMPAIGN_PLACEMENT_CONFIG,
  calculateCampaignBaseBudget,
  calculateCampaignTotalCost,
  estimateCampaignPlan,
  buildAutomaticCampaignPlan,
  getCampaignPlacementCostMultiplier,
  getCampaignStrategyConfig,
  getCampaignObservedMetrics,
  getCampaignPricing,
  normalizeCampaignPlacementSelection,
  normalizeCampaignPricingStrategy,
  recommendCampaignStrategy,
  type CampaignPlacementOption,
  type CampaignPricingStrategy,
} from "@/lib/campaignPricing";
import {
  deleteRestaurantCampaign,
  listRestaurantCampaigns,
  saveRestaurantCampaign,
  setRestaurantCampaignStatus,
} from "@/lib/campaigns";
import { SUPABASE_URL } from "@/lib/env";
import { fetchWithFreshAccessToken } from "@/lib/session";
import { TOK_CREDITS_PER_CAMPAIGN_CHF } from "@/lib/tokCredits";
import { cn } from "@/lib/utils";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { askCommercialDemoAi, parseCommercialDemoAiJson } from "@/lib/commercialDemoAi";

const supabase = getSupabase();
const CAMPAIGN_PAYMENT_METHOD = "credits" as const;

function buildCommercialDemoCampaign(restaurantId: string): CampaignRecord {
  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + 6);
  return {
    id: "demo-campaign-week-menu",
    restaurant_id: restaurantId,
    title: "Le plat signature de la semaine",
    body: "Découvrez notre plat signature et réservez votre table en quelques secondes.",
    type: "boost",
    status: "active",
    payment_status: "paid",
    pricing_strategy: "conversion",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    total_budget: 120,
    spent: 42,
    impressions: 2840,
    clicks: 186,
    conversions: 24,
    target_pages: ["home", "search"],
  };
}

const CAMPAIGN_TYPES = [
  { value: "boost", label: "Boost (Sponsorisé)" },
  { value: "banner", label: "Bannière" },
  { value: "push", label: "Push notification" },
];

const TARGET_PAGES = [
  { value: "home", label: "Accueil" },
  { value: "search", label: "Recherche" },
  { value: "flash_sales", label: "Ventes Flash" },
  { value: "anti_waste", label: "Anti-Gaspi" },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Brouillon", variant: "outline" },
  active: { label: "Active", variant: "default" },
  paused: { label: "En pause", variant: "secondary" },
  ended: { label: "Terminee", variant: "destructive" },
  pending_payment: { label: "En attente de paiement", variant: "secondary" },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  unpaid: { label: "A regler", variant: "outline" },
  pending: { label: "Paiement manuel", variant: "secondary" },
  paid: { label: "Paye", variant: "default" },
  failed: { label: "Paiement refuse", variant: "destructive" },
  cancelled: { label: "Paiement annulé", variant: "destructive" },
};

type ConversionByType = {
  order: number;
  reservation: number;
  zeroAttente: number;
  total: number;
};

const EMPTY_CONVERSIONS: ConversionByType = {
  order: 0,
  reservation: 0,
  zeroAttente: 0,
  total: 0,
};

type CampaignRecord = Record<string, any>;
type RestaurantCreditSummary = {
  kind?: string | null;
  balance?: number | string | null;
};
type RestaurantCreditUsage = {
  credits?: RestaurantCreditSummary[] | null;
};

function formatChf(value: number, digits = 2) {
  return `${Number(value || 0).toFixed(digits)} CHF`;
}

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getCampaignCreditBalanceFromUsage(usage: RestaurantCreditUsage | null | undefined) {
  const credits = Array.isArray(usage?.credits) ? usage.credits : [];
  const tokCredit = credits.find((credit) => credit.kind === "tok_credits");
  if (tokCredit) {
    return Math.max(0, toFiniteNumber(tokCredit.balance) / TOK_CREDITS_PER_CAMPAIGN_CHF);
  }

  const campaignCredit = credits.find((credit) => credit.kind === "campaign");
  return Math.max(0, toFiniteNumber(campaignCredit?.balance));
}

async function fetchCampaignCreditBalance(restaurantId: string) {
  const { data, error } = await (supabase.rpc as any)("get_restaurant_credit_usage", {
    p_restaurant_id: restaurantId,
  });

  if (error) throw error;
  return getCampaignCreditBalanceFromUsage(data as RestaurantCreditUsage);
}

function formatPercent(value: number, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

function isCampaignEnded(campaign: CampaignRecord) {
  const status = String(campaign.status || "").toLowerCase();
  if (["ended", "closed", "cancelled", "canceled"].includes(status)) return true;

  const endsAt = Date.parse(String(campaign.ends_at || campaign.end_date || ""));
  return Number.isFinite(endsAt) && endsAt < Date.now() && status !== "active" && status !== "paused";
}

function getCampaignPortfolioMetrics(campaigns: CampaignRecord[]) {
  const impressions = campaigns.reduce((sum, campaign) => sum + Number(campaign.impressions || 0), 0);
  const clicks = campaigns.reduce((sum, campaign) => sum + Number(campaign.clicks || 0), 0);
  const conversions = campaigns.reduce((sum, campaign) => sum + Number(campaign.conversions || 0), 0);
  const spent = campaigns.reduce((sum, campaign) => sum + Number(campaign.spent || 0), 0);
  const totalBudget = campaigns.reduce((sum, campaign) => sum + Number(campaign.total_budget || 0), 0);
  const observed = getCampaignObservedMetrics({ impressions, clicks, conversions, spent });

  return {
    impressions,
    clicks,
    conversions,
    spent,
    totalBudget,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
    ...observed,
  };
}

function getCampaignPacingStatus(campaign: CampaignRecord): { label: string; className: string } {
  const totalBudget = Number(campaign.total_budget || 0);
  const spent = Number(campaign.spent || 0);
  if (totalBudget <= 0 || !campaign.starts_at || !campaign.ends_at) {
    return { label: "N/A", className: "text-muted-foreground" };
  }

  const startsAt = Date.parse(campaign.starts_at);
  const endsAt = Date.parse(campaign.ends_at);
  const now = Date.now();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return { label: "N/A", className: "text-muted-foreground" };
  }

  const timeProgression = Math.min(1, Math.max(0, now - startsAt) / (endsAt - startsAt));
  if (timeProgression === 0) return { label: "Pas démarrée", className: "text-muted-foreground" };

  const budgetProgression = spent / totalBudget;
  const ratio = budgetProgression / timeProgression;
  if (ratio < 0.8) return { label: "En retard", className: "text-orange-600" };
  if (ratio > 1.2) return { label: "En avance", className: "text-blue-600" };
  return { label: "Dans les temps", className: "text-green-600" };
}

function getRecordStrategy(record?: Record<string, unknown> | null) {
  return normalizeCampaignPricingStrategy(record?.pricing_strategy, "conversion");
}

function getRecordPricing(record?: Record<string, unknown> | null) {
  const strategy = getRecordStrategy(record);
  return getCampaignPricing({
    cpmRate: Number(record?.cpm_rate || 0),
    cpcRate: Number(record?.cpc_rate || 0),
    conversionRate: Number(record?.conversion_rate || 0),
  }, strategy);
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultCampaignStartDate() {
  return toDateInputValue(new Date());
}

function getDurationDays(start: string, end: string) {
  const startAt = Date.parse(start);
  const endAt = Date.parse(end);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) return 7;
  return Math.max(1, Math.round((endAt - startAt) / (24 * 60 * 60 * 1000)) + 1);
}

function addDaysToInputDate(value: string, days: number) {
  const base = Number.isFinite(Date.parse(value)) ? new Date(value) : new Date();
  base.setDate(base.getDate() + Math.max(0, days - 1));
  return toDateInputValue(base);
}

export default function DashboardCampagnes() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const { selectedId, restaurants } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [periodDays, setPeriodDays] = useState<"7" | "30" | "90">("30");
  const [paidCampaign, setPaidCampaign] = useState<any>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conversionWindowStart = useMemo(() => {
    const daysBack = Number(periodDays);
    const from = new Date();
    from.setDate(from.getDate() - daysBack);
    return from.toISOString();
  }, [periodDays]);

  const pollCampaignStatus = useCallback(
    (campaignId: string, attempts = 0) => {
      if (isCommercialDemo) {
        setPaidCampaign({ id: campaignId, payment_status: "paid", status: "active" });
        return;
      }
      if (!selectedId) {
        setPaidCampaign({ id: campaignId });
        return;
      }

      if (attempts >= 10) {
        queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns", selectedId] });
        setPaidCampaign({ id: campaignId });
        return;
      }

      pollTimerRef.current = setTimeout(async () => {
        try {
          const { data: freshCampaigns } = await listRestaurantCampaigns(selectedId);
          const campaign = freshCampaigns?.find((c: any) => c.id === campaignId);

          if (campaign?.payment_status === "paid") {
            queryClient.setQueryData(["dashboard-campaigns", selectedId], freshCampaigns);
            setPaidCampaign(campaign);
            toast({
              title: "Paiement confirmé",
              description: "Votre campagne a été payée avec succès et est maintenant active.",
            });
          } else {
            pollCampaignStatus(campaignId, attempts + 1);
          }
        } catch {
          pollCampaignStatus(campaignId, attempts + 1);
        }
      }, 2000);
    },
    [isCommercialDemo, queryClient, selectedId, toast],
  );

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const hasCampaignCheckout = searchParams.get("campaign_checkout") === "1";
    const status = searchParams.get("status");
    if (!hasCampaignCheckout || !status) return;

    if (status === "success") {
      const campaignId = searchParams.get("campaign_id");
      if (campaignId) {
        pollCampaignStatus(campaignId);
      } else {
        queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns", selectedId] });
        setPaidCampaign({});
      }
    } else if (status === "cancelled") {
      toast({
        title: "Paiement annulé",
        description: "La campagne reste en brouillon tant que le paiement n'est pas finalisé.",
        variant: "destructive",
      });
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("campaign_checkout");
    nextParams.delete("status");
    nextParams.delete("session_id");
    nextParams.delete("campaign_id");
    setSearchParams(nextParams, { replace: true });
  }, [pollCampaignStatus, queryClient, searchParams, selectedId, setSearchParams, toast]);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["dashboard-campaigns", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      if (isCommercialDemo) return [buildCommercialDemoCampaign(selectedId)];
      const { data, error } = await listRestaurantCampaigns(selectedId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedId,
  });

  const {
    data: conversionsByTypeRaw,
    isLoading: loadingConversions,
    error: conversionsError,
  } = useQuery({
    queryKey: ["dashboard-campaign-conversions-by-type", selectedId, periodDays],
    queryFn: async () => {
      if (!selectedId) return EMPTY_CONVERSIONS;

      const { data, error } = await (supabase.from("ad_campaign_events" as any))
        .select("conversion_type, occurred_at")
        .eq("event_type", "conversion")
        .eq("restaurant_id", selectedId)
        .gte("occurred_at", conversionWindowStart);

      if (error) throw error;

      let order = 0;
      let reservation = 0;
      let zeroAttente = 0;

      const rows = (data || []) as unknown as Array<{ conversion_type?: string | null }>;
      for (const row of rows) {
        const conversionType = String(row.conversion_type || "");
        if (conversionType === "order") order += 1;
        else if (conversionType === "reservation") reservation += 1;
        else if (conversionType === "zero-attente" || conversionType === "zero_attente") zeroAttente += 1;
      }

      return {
        order,
        reservation,
        zeroAttente,
        total: order + reservation + zeroAttente,
      };
    },
    enabled: !!selectedId,
    retry: false,
    staleTime: 30_000,
  });
  const conversionsByType = conversionsByTypeRaw || EMPTY_CONVERSIONS;
  const campaignRows = useMemo(() => (campaigns || []) as CampaignRecord[], [campaigns]);
  const campaignsInProgress = useMemo(
    () => campaignRows.filter((campaign) => !isCampaignEnded(campaign)),
    [campaignRows],
  );
  const endedCampaigns = useMemo(
    () => campaignRows.filter((campaign) => isCampaignEnded(campaign)),
    [campaignRows],
  );
  const activeCampaigns = useMemo(
    () => campaignRows.filter((campaign) => campaign.status === "active"),
    [campaignRows],
  );
  const portfolioMetrics = useMemo(
    () => getCampaignPortfolioMetrics(campaignRows),
    [campaignRows],
  );
  const selectedCampaign = useMemo(
    () => campaignRows.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaignRows, selectedCampaignId],
  );

  const updateStatus = async (id: string, status: string) => {
    if (!selectedId) return;
    if (isCommercialDemo) {
      queryClient.setQueryData<CampaignRecord[]>(["dashboard-campaigns", selectedId], (current = []) => (
        current.map((campaign) => (campaign.id === id ? { ...campaign, status } : campaign))
      ));
      toast({ title: `Campagne ${STATUS_MAP[status]?.label || status} dans la démonstration` });
      return;
    }
    const { error } = await setRestaurantCampaignStatus(selectedId, id, status);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns", selectedId] });
    toast({ title: `Campagne ${STATUS_MAP[status]?.label || status}` });
  };

  const deleteCampaign = async (id: string) => {
    if (!selectedId) return;
    if (isCommercialDemo) {
      queryClient.setQueryData<CampaignRecord[]>(["dashboard-campaigns", selectedId], (current = []) => (
        current.filter((campaign) => campaign.id !== id)
      ));
      setSelectedCampaignId((current) => (current === id ? null : current));
      toast({ title: "Campagne supprimée de la démonstration" });
      return;
    }
    const { error } = await deleteRestaurantCampaign(selectedId, id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns", selectedId] });
    setSelectedCampaignId((current) => (current === id ? null : current));
    toast({ title: "Campagne supprimée" });
  };

  return (
    <DashboardLayout>
      <AlertDialog open={!!paidCampaign} onOpenChange={(open) => { if (!open) setPaidCampaign(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <AlertDialogTitle className="text-center">Paiement confirmé</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-center">
                <p>Votre campagne a été payée avec succès et est maintenant active.</p>
                {paidCampaign?.title && (
                  <div className="rounded-lg border bg-muted/50 p-3 text-left text-sm space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Campagne</span>
                      <span className="font-medium">{paidCampaign.title}</span>
                    </div>
                    {paidCampaign.type && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium capitalize">{paidCampaign.type}</span>
                      </div>
                    )}
                    {(paidCampaign.paid_amount || paidCampaign.total_budget) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Montant</span>
                        <span className="font-medium">{Number(paidCampaign.paid_amount || paidCampaign.total_budget).toFixed(2)} CHF</span>
                      </div>
                    )}
                    {paidCampaign.payment_method && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Moyen de paiement</span>
                        <span className="font-medium capitalize">{paidCampaign.payment_method}</span>
                      </div>
                    )}
                    {paidCampaign.budget_daily != null && Number(paidCampaign.budget_daily) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Budget journalier</span>
                        <span className="font-medium">{Number(paidCampaign.budget_daily).toFixed(2)} CHF</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tarif 1k impressions</span>
                      <span className="font-medium">{formatChf(getRecordPricing(paidCampaign).cpmRate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tarif par clic</span>
                      <span className="font-medium">{formatChf(getRecordPricing(paidCampaign).cpcRate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tarif par conversion</span>
                      <span className="font-medium">{formatChf(getRecordPricing(paidCampaign).conversionRate)}</span>
                    </div>
                    {(paidCampaign.start_date || paidCampaign.end_date) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Période</span>
                        <span className="font-medium">
                          {paidCampaign.start_date ? new Date(paidCampaign.start_date).toLocaleDateString("fr-CH") : "—"}
                          {" ? "}
                          {paidCampaign.end_date ? new Date(paidCampaign.end_date).toLocaleDateString("fr-CH") : "—"}
                        </span>
                      </div>
                    )}
                    {Array.isArray(paidCampaign.target_pages) && paidCampaign.target_pages.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pages cibles</span>
                        <span className="font-medium capitalize">{paidCampaign.target_pages.join(", ")}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Statut</span>
                      <Badge variant="default" className="bg-green-600 text-xs">Active</Badge>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction>Fermer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-6">
        <DashboardPageHero
          badge="Acquisition"
          title="Campagnes publicitaires"
          description={selectedRestaurant ? `Pilotage de ${selectedRestaurant.name}: ciblage, budget, conversions et statut de paiement restent regroupés.` : "Sélectionnez un restaurant dans la barre latérale pour préparer ses campagnes."}
          icon={Megaphone}
          tone="rose"
          visualLabel="Ads"
          illustration={DASHBOARD_ILLUSTRATIONS.restaurantCampaigns}
          stats={[
            { label: "Campagnes", value: campaigns?.length || 0, icon: Megaphone },
            { label: "Conversions", value: loadingConversions ? "..." : conversionsByType.total, icon: Target },
            { label: "Période", value: `${periodDays} jours`, icon: CalendarDays },
          ]}
          actions={(
          <div className="flex items-center gap-2">
            <Select value={periodDays} onValueChange={(value) => setPeriodDays(value as "7" | "30" | "90")}>
              <SelectTrigger className="h-14 w-32 rounded-2xl border-border/70 bg-background/90 font-semibold dark:border-[#5f7aad]/35 dark:bg-[#040c1c]/86 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 jours</SelectItem>
                <SelectItem value="30">30 jours</SelectItem>
                <SelectItem value="90">90 jours</SelectItem>
              </SelectContent>
            </Select>
            <Dialog
              open={open}
              onOpenChange={(value) => {
                setOpen(value);
                if (!value) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button className="gap-2" disabled={!selectedId}>
                  <Plus className="h-4 w-4" /> Nouvelle campagne
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editing ? "Modifier la campagne" : "Nouvelle campagne"}</DialogTitle>
                </DialogHeader>
                {selectedId ? (
                  <CampaignForm
                    restaurantId={selectedId}
                    initial={editing}
                    onSaved={() => {
                      setOpen(false);
                      setEditing(null);
                      queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns", selectedId] });
                      queryClient.invalidateQueries({ queryKey: ["dashboard-campaign-conversions-by-type", selectedId] });
                      toast({ title: editing ? "Campagne mise à jour" : "Campagne enregistrée" });
                    }}
                  />
                ) : null}
              </DialogContent>
            </Dialog>
          </div>
          )}
        />

        <section className="space-y-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Vue globale des campagnes
            </p>
            <p className="text-sm text-muted-foreground">
              Synthèse consolidée de toutes les campagnes du restaurant, avec coût, impressions, clics, conversions et ratios observés.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
            <CampaignMetricTile icon={Megaphone} label="Campagnes actives" value={activeCampaigns.length} />
            <CampaignMetricTile icon={Wallet} label="Coût global" value={formatChf(portfolioMetrics.spent)} />
            <CampaignMetricTile icon={Eye} label="Impressions" value={portfolioMetrics.impressions.toLocaleString("fr-CH")} />
            <CampaignMetricTile icon={MousePointer} label="Clics" value={portfolioMetrics.clicks.toLocaleString("fr-CH")} />
            <CampaignMetricTile icon={ShoppingCart} label="Conversions" value={portfolioMetrics.conversions.toLocaleString("fr-CH")} />
            <CampaignMetricTile icon={BarChart3} label="CPC moyen" value={portfolioMetrics.effectiveCpc > 0 ? formatChf(portfolioMetrics.effectiveCpc) : "-"} />
            <CampaignMetricTile icon={TrendingUp} label="CTR" value={formatPercent(portfolioMetrics.ctr)} />
            <CampaignMetricTile icon={Target} label="CPA moyen" value={portfolioMetrics.effectiveCpa > 0 ? formatChf(portfolioMetrics.effectiveCpa) : "-"} />
          </div>
        </section>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">Conversions sponsorisées ({periodDays}j)</p>
              <p className="text-2xl font-bold">{loadingConversions ? "..." : conversionsByType.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><ShoppingCart className="h-3 w-3" />Commandes</p>
              <p className="text-2xl font-bold">{loadingConversions ? "..." : conversionsByType.order}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" />Reservations</p>
              <p className="text-2xl font-bold">{loadingConversions ? "..." : conversionsByType.reservation}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" />Zéro Attente</p>
              <p className="text-2xl font-bold">{loadingConversions ? "..." : conversionsByType.zeroAttente}</p>
            </CardContent>
          </Card>
        </div>

        {conversionsError ? <p className="text-xs text-destructive">Impossible de charger le détail des conversions.</p> : null}

        {!selectedId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Sélectionnez un restaurant pour gérer ses campagnes.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">{[1, 2].map((value) => <div key={value} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>
        ) : !campaigns?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Aucune campagne. Boostez la visibilité de votre restaurant !
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
            <Tabs defaultValue="active" className="min-w-0">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList className="w-full justify-start sm:w-auto">
                  <TabsTrigger value="active" className="flex-1 sm:flex-none">
                    Campagnes actives ({campaignsInProgress.length})
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1 sm:flex-none">
                    Historique des campagnes ({endedCampaigns.length})
                  </TabsTrigger>
                </TabsList>
                <p className="text-xs text-muted-foreground">
                  Cliquez sur une campagne pour afficher ses métriques détaillées.
                </p>
              </div>

              <TabsContent value="active" className="mt-0">
                <div className="space-y-3">
            {campaignsInProgress.map((campaign: any) => {
              const status = STATUS_MAP[campaign.status] || STATUS_MAP.draft;
              const paymentStatus = PAYMENT_STATUS_MAP[campaign.payment_status || "unpaid"] || PAYMENT_STATUS_MAP.unpaid;
              const pages = Array.isArray(campaign.target_pages) ? campaign.target_pages : [];
              const targetingParts = summarizeAudienceCriteria(campaign.target_criteria || DEFAULT_AUDIENCE_CRITERIA);
              const isPaid = (campaign.payment_status || "unpaid") === "paid";
              const pricingStrategy = getRecordStrategy(campaign);
              const strategyLabel = getCampaignStrategyConfig(pricingStrategy).shortLabel;
              const pricing = getRecordPricing(campaign);
              const observed = getCampaignObservedMetrics({
                impressions: campaign.impressions,
                clicks: campaign.clicks,
                conversions: campaign.conversions,
                spent: campaign.spent,
              });
              const isSelected = selectedCampaignId === campaign.id;

              return (
                <Card key={campaign.id} className={isSelected ? "border-primary/60 bg-primary/5" : undefined}>
                  <CardContent
                    className="py-4 space-y-3"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCampaignId(campaign.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedCampaignId(campaign.id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-4">
                      {campaign.image_url ? (
                        <img src={campaign.image_url} alt={campaign.title} className="w-20 h-14 rounded-lg object-cover shrink-0" />
                      ) : null}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{campaign.title}</p>
                            <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                            <Badge variant={paymentStatus.variant} className="text-[10px]">{paymentStatus.label}</Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {CAMPAIGN_TYPES.find((type) => type.value === campaign.type)?.label || campaign.type}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {strategyLabel}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {campaign.status === "draft" && isPaid ? (
                              <Button size="sm" variant="default" onClick={() => updateStatus(campaign.id, "active")}>
                                Lancer
                              </Button>
                            ) : null}
                            {campaign.status === "active" ? (
                              <Button size="sm" variant="secondary" onClick={() => updateStatus(campaign.id, "paused")}>
                                Pause
                              </Button>
                            ) : null}
                            {campaign.status === "paused" ? (
                              <Button size="sm" variant="default" onClick={() => updateStatus(campaign.id, "active")}>
                                Reprendre
                              </Button>
                            ) : null}
                            {!isPaid ? (
                              <Button size="sm" variant="outline" onClick={() => { setEditing(campaign); setOpen(true); }}>
                                Réserver crédits
                              </Button>
                            ) : null}
                            <Button size="icon" variant="ghost" onClick={() => { setEditing(campaign); setOpen(true); }}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteCampaign(campaign.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {campaign.body ? <p className="mt-1 text-sm text-muted-foreground">{campaign.body}</p> : null}

                        {pages.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-2">
                            <Target className="h-3 w-3 text-muted-foreground mt-1" />
                            {pages.map((page: string) => (
                              <Badge key={page} variant="secondary" className="text-[9px]">
                                {TARGET_PAGES.find((targetPage) => targetPage.value === page)?.label || page}
                              </Badge>
                            ))}
                          </div>
                        ) : null}

                        {targetingParts.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {targetingParts.map((part) => (
                              <Badge key={part} variant="outline" className="text-[10px]">{part}</Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">Diffusion large sans ciblage supplémentaire.</p>
                        )}

                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-3">
                          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{campaign.impressions || 0} impressions</span>
                          <span className="flex items-center gap-1"><MousePointer className="h-3 w-3" />{campaign.clicks || 0} clics</span>
                          <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{campaign.conversions || 0} conversions</span>
                          <span>Budget: {formatChf(Number(campaign.spent || 0))}/{formatChf(Number(campaign.total_budget || 0))}</span>
                          <span>Payé: {formatChf(Number(campaign.paid_amount || 0))}</span>
                        </div>

                        <div className="mt-3 rounded-xl border bg-muted/30 p-3">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-foreground/80">
                            <span className="rounded-full bg-background px-2.5 py-1">TOK: {formatChf(pricing.cpmRate)} / 1k impressions</span>
                            <span className="rounded-full bg-background px-2.5 py-1">TOK: {formatChf(pricing.cpcRate)} / clic</span>
                            <span className="rounded-full bg-background px-2.5 py-1">TOK: {formatChf(pricing.conversionRate)} / conversion</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                            <span>Observé: eCPM {observed.effectiveCpm > 0 ? formatChf(observed.effectiveCpm) : "—"}</span>
                            <span>Observé: CPC {observed.effectiveCpc > 0 ? formatChf(observed.effectiveCpc) : "—"}</span>
                            <span>Observé: CPA {observed.effectiveCpa > 0 ? formatChf(observed.effectiveCpa) : "—"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
                </div>
              </TabsContent>

              <TabsContent value="history" className="mt-0">
                <CampaignHistoryList
                  campaigns={endedCampaigns}
                  selectedCampaignId={selectedCampaignId}
                  onSelect={setSelectedCampaignId}
                />
              </TabsContent>
            </Tabs>

            <CampaignDetailPanel campaign={selectedCampaign} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function CampaignMetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <p className="mt-2 text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function CampaignHistoryList({
  campaigns,
  selectedCampaignId,
  onSelect,
}: {
  campaigns: CampaignRecord[];
  selectedCampaignId: string | null;
  onSelect: (campaignId: string) => void;
}) {
  if (!campaigns.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Aucune campagne terminée pour le moment.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {campaigns.map((campaign) => {
        const metrics = getCampaignPortfolioMetrics([campaign]);
        const status = STATUS_MAP[campaign.status] || STATUS_MAP.ended;
        const isSelected = selectedCampaignId === campaign.id;

        return (
          <Card key={campaign.id} className={isSelected ? "border-primary/60 bg-primary/5" : undefined}>
            <CardContent
              className="space-y-3 py-4"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(campaign.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(campaign.id);
                }
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{campaign.title || "Campagne terminée"}</p>
                  <p className="text-xs text-muted-foreground">
                    {campaign.starts_at ? new Date(campaign.starts_at).toLocaleDateString("fr-CH") : "-"}
                    {" -> "}
                    {campaign.ends_at ? new Date(campaign.ends_at).toLocaleDateString("fr-CH") : "-"}
                  </p>
                </div>
                <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <span>{metrics.impressions.toLocaleString("fr-CH")} impressions</span>
                <span>{metrics.clicks.toLocaleString("fr-CH")} clics</span>
                <span>{metrics.conversions.toLocaleString("fr-CH")} conversions</span>
                <span>{formatChf(metrics.spent)} dépensés</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CampaignDetailPanel({ campaign }: { campaign: CampaignRecord | null }) {
  if (!campaign) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Détail de campagne</p>
          <p className="mt-2">Sélectionnez une campagne active ou terminée pour voir ses données détaillées.</p>
        </CardContent>
      </Card>
    );
  }

  const metrics = getCampaignPortfolioMetrics([campaign]);
  const pricingStrategy = getRecordStrategy(campaign);
  const strategyConfig = getCampaignStrategyConfig(pricingStrategy);
  const pricing = getRecordPricing(campaign);
  const pacing = getCampaignPacingStatus(campaign);
  const status = STATUS_MAP[campaign.status] || STATUS_MAP.draft;
  const paymentStatus = PAYMENT_STATUS_MAP[campaign.payment_status || "unpaid"] || PAYMENT_STATUS_MAP.unpaid;
  const pages = Array.isArray(campaign.target_pages) ? campaign.target_pages : [];
  const targetingParts = summarizeAudienceCriteria(campaign.target_criteria || DEFAULT_AUDIENCE_CRITERIA);
  const totalBudget = Number(campaign.total_budget || 0);
  const spent = Number(campaign.spent || 0);
  const remaining = Math.max(0, totalBudget - spent);
  const budgetProgress = totalBudget > 0 ? Math.min(100, (spent / totalBudget) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const dailySpent = String(campaign.daily_spent_date || "") === today ? Number(campaign.daily_spent || 0) : 0;
  const dailyBudget = Number(campaign.budget_daily || 0);

  return (
    <Card className="xl:sticky xl:top-6 xl:self-start">
      <CardContent className="space-y-4 py-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Détail de campagne
          </p>
          <div className="min-w-0 space-y-2">
            <h3 className="max-w-full break-words text-lg font-bold leading-tight">{campaign.title || "Campagne"}</h3>
            <div className="flex max-w-full flex-wrap gap-2">
              <Badge variant={status.variant} className="max-w-full whitespace-normal text-left leading-tight">
                {status.label}
              </Badge>
              <Badge variant={paymentStatus.variant} className="max-w-full whitespace-normal text-left leading-tight">
                {paymentStatus.label}
              </Badge>
            </div>
          </div>
          {campaign.body ? <p className="text-sm text-muted-foreground">{campaign.body}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <CampaignDetailMetric label="Impressions" value={metrics.impressions.toLocaleString("fr-CH")} />
          <CampaignDetailMetric label="Clics" value={metrics.clicks.toLocaleString("fr-CH")} />
          <CampaignDetailMetric label="Conversions" value={metrics.conversions.toLocaleString("fr-CH")} />
          <CampaignDetailMetric label="Coût global" value={formatChf(metrics.spent)} />
          <CampaignDetailMetric label="CPC moyen" value={metrics.effectiveCpc > 0 ? formatChf(metrics.effectiveCpc) : "-"} />
          <CampaignDetailMetric label="CPA moyen" value={metrics.effectiveCpa > 0 ? formatChf(metrics.effectiveCpa) : "-"} />
          <CampaignDetailMetric label="CTR" value={formatPercent(metrics.ctr)} />
          <CampaignDetailMetric label="Taux conv." value={formatPercent(metrics.conversionRate)} />
        </div>

        <div className="space-y-2 rounded-xl border bg-muted/25 p-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Budget restant</span>
            <span className="font-medium">{formatChf(remaining)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${budgetProgress}%` }} />
          </div>
          <div className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{formatChf(spent)} dépensés</span>
            <span>{formatChf(totalBudget)} budget</span>
          </div>
          {dailyBudget > 0 ? (
            <div className="flex justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Aujourd'hui</span>
              <span className="font-medium">{formatChf(dailySpent)} / {formatChf(dailyBudget)}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Pacing</span>
            <span className={`font-medium ${pacing.className}`}>{pacing.label}</span>
          </div>
        </div>

        <div className="rounded-xl border bg-muted/25 p-3">
          <p className="text-xs font-semibold">{strategyConfig.label}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>{formatChf(pricing.cpmRate)} / 1k impressions</span>
            <span>{formatChf(pricing.cpcRate)} / clic</span>
            <span>{formatChf(pricing.conversionRate)} / conversion</span>
          </div>
        </div>

        {pages.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {pages.map((page: string) => (
              <Badge key={page} variant="secondary" className="text-[10px]">
                {TARGET_PAGES.find((targetPage) => targetPage.value === page)?.label || page}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1">
          {targetingParts.length > 0
            ? targetingParts.map((part) => <Badge key={part} variant="outline" className="text-[10px]">{part}</Badge>)
            : <span className="text-xs text-muted-foreground">Diffusion large sans ciblage supplémentaire.</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignDetailMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-muted/35 p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

function getCampaignCreativeFromChannels(channels: unknown) {
  if (!channels || typeof channels !== "object" || Array.isArray(channels)) {
    return normalizeCampaignCreative(null);
  }

  return normalizeCampaignCreative((channels as Record<string, unknown>).creative);
}

const CREATIVE_TEXT_ELEMENTS: Array<{
  id: CampaignCreativeTextElement;
  label: string;
  description: string;
}> = [
  { id: "badge", label: "Badge", description: "Ex. Sponsorisé" },
  { id: "discount", label: "Promo", description: "Badge promotion" },
  { id: "eyebrow", label: "Cuisine + ville", description: "Ligne haute" },
  { id: "restaurant", label: "Restaurant", description: "Nom principal" },
  { id: "tagline", label: "Signature", description: "Phrase sous le nom" },
  { id: "address", label: "Adresse", description: "Localisation" },
  { id: "headline", label: "Accroche", description: "Titre de l'offre" },
  { id: "body", label: "Texte", description: "Description courte" },
  { id: "sealTop", label: "Rond haut", description: "Texte au-dessus de Flash" },
  { id: "sealMain", label: "Rond centre", description: "Mot central" },
  { id: "sealBottom", label: "Rond bas", description: "Texte bas du rond" },
  { id: "cta", label: "Bouton", description: "Appel à l'action" },
];

const CREATIVE_FONT_OPTIONS: Array<{
  value: CampaignCreativeConfig["text"][CampaignCreativeTextElement]["font"];
  label: string;
}> = [
  { value: "sans", label: "Moderne" },
  { value: "display", label: "TOK display" },
  { value: "serif", label: "Editorial" },
  { value: "rounded", label: "Arrondie" },
  { value: "mono", label: "Compacte" },
];

const CREATIVE_STYLE_OPTIONS: Array<{
  value: CampaignCreativeConfig["text"][CampaignCreativeTextElement]["style"];
  label: string;
}> = [
  { value: "normal", label: "Normal" },
  { value: "bold", label: "Gras" },
  { value: "italic", label: "Italique" },
];

const CREATIVE_BANNER_PLACEMENT_OPTIONS: Array<{
  value: CampaignBannerTextPlacement;
  label: string;
  description: string;
}> = [
  { value: "left", label: "Texte à gauche", description: "Photo à droite" },
  { value: "right", label: "Texte à droite", description: "Photo à gauche" },
  { value: "top", label: "Texte en haut", description: "Photo en bas" },
  { value: "bottom", label: "Texte en bas", description: "Photo en haut" },
];

const CREATIVE_BANNER_SEPARATOR_OPTIONS: Array<{
  value: CampaignBannerSeparator;
  label: string;
  description: string;
}> = [
  { value: "fade", label: "Fondu", description: "Transition douce" },
  { value: "wave", label: "Vague", description: "Séparation organique" },
  { value: "curve", label: "Courbe", description: "Découpe inclinée" },
  { value: "straight", label: "Droite", description: "Séparation nette" },
];

function getCreativeCopyFallback(
  element: CampaignCreativeTextElement,
  input: {
    title: string;
    body: string;
    restaurantName: string;
    cuisine: string;
    city: string;
    address: string;
    ctaLabel: string;
    discountLabel: string;
  },
) {
  switch (element) {
    case "badge":
      return "Sponsorisé";
    case "discount":
      return input.discountLabel;
    case "eyebrow":
      return `${input.cuisine} · ${input.city}`;
    case "restaurant":
      return input.restaurantName;
    case "tagline":
      return "Savourez l'instant";
    case "address":
      return input.address;
    case "headline":
      return input.title;
    case "body":
      return input.body;
    case "sealTop":
      return "Offres";
    case "sealMain":
      return "Flash";
    case "sealBottom":
      return "Quantités limitées";
    case "cta":
      return input.ctaLabel;
    default:
      return "";
  }
}

function CampaignCreativeStudio({
  value,
  onChange,
  title,
  body,
  imageUrl,
  type,
  placementSelection,
}: {
  value: CampaignCreativeConfig;
  onChange: (next: CampaignCreativeConfig) => void;
  title: string;
  body: string;
  imageUrl: string;
  type: string;
  placementSelection: Record<CampaignPlacementOption, boolean>;
}) {
  const previewTitle = title.trim() || "La fondue du Quirinale";
  const previewBody = body.trim() || "Viens déguster la meilleure fondue de Genève!";
  const previewVariant = type === "push" ? "push" : type === "banner" || placementSelection.banner ? "banner" : "card";

  const updateCreative = useCallback((next: CampaignCreativeConfig) => {
    onChange(normalizeCampaignCreative(next));
  }, [onChange]);

  const updateTextElement = useCallback((
    key: CampaignCreativeTextElement,
    patch: Pick<Partial<CampaignCreativeConfig["text"][CampaignCreativeTextElement]>, "color" | "font" | "style">,
  ) => {
    updateCreative({
      ...value,
      text: {
        ...value.text,
        [key]: {
          ...value.text[key],
          ...patch,
        },
      },
    });
  }, [updateCreative, value]);

  const updateTextCopy = useCallback((key: CampaignCreativeTextElement, text: string) => {
    updateCreative({
      ...value,
      copy: {
        ...value.copy,
        [key]: text,
      },
    });
  }, [updateCreative, value]);

  const updateBannerLayout = useCallback((
    patch: Partial<Pick<CampaignCreativeConfig, "bannerTextPlacement" | "bannerSeparator">>,
  ) => {
    updateCreative({
      ...value,
      ...patch,
    });
  }, [updateCreative, value]);

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-background via-orange-50/40 to-background p-4 shadow-sm dark:via-orange-950/15">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Studio visuel de campagne</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Un modèle unique décliné en carte, bannière et notification push. Tous les textes de la bannière sont personnalisables, avec police, graisse et italique.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          TOK Spotlight
        </Badge>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className={cn("mx-auto w-full", previewVariant === "banner" ? "max-w-full" : "max-w-[390px]")}>
          <SponsoredRestaurantTemplateCard
            creative={value}
            imageUrl={imageUrl}
            restaurantName="Quirinale"
            cuisine="Italien"
            city="Puplinge"
            address="Rue de Graman"
            headline={previewTitle}
            body={previewBody}
            variant={previewVariant}
          />
          <p className="mt-3 rounded-2xl border bg-background/80 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Aperçu {previewVariant === "banner" ? "bannière" : previewVariant === "push" ? "notification push" : "carte restaurant"}. La taille et la structure suivent le format diffusé aux clients.
          </p>
        </div>

        <div className="space-y-4">
          {previewVariant === "banner" ? (
            <div className="rounded-2xl border bg-background/80 p-3 shadow-sm">
              <div>
                <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Megaphone className="h-4 w-4" /> Composition bannière
                </Label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Réservez une zone lisible au texte et choisissez la transition avec la photo.
                </p>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CREATIVE_BANNER_PLACEMENT_OPTIONS.map((option) => {
                  const selected = value.bannerTextPlacement === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => updateBannerLayout({ bannerTextPlacement: option.value })}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left transition-all hover:border-primary/50",
                        selected && "border-primary bg-primary/10 shadow-sm",
                      )}
                    >
                      <span className="block text-xs font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{option.description}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CREATIVE_BANNER_SEPARATOR_OPTIONS.map((option) => {
                  const selected = value.bannerSeparator === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => updateBannerLayout({ bannerSeparator: option.value })}
                      className={cn(
                        "min-h-14 rounded-xl border px-2 py-2 text-left transition-all hover:border-primary/50",
                        selected && "border-primary bg-primary/10 shadow-sm",
                      )}
                    >
                      <span className="block text-[11px] font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-3 text-muted-foreground">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border bg-background/80 p-3 shadow-sm">
            <div>
              <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Type className="h-4 w-4" /> Textes personnalisables
              </Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Chaque zone de texte dispose de son champ, de 5 polices au choix, d'un style normal, gras ou italique et d'une couleur.
              </p>
            </div>

            <div className="mt-3 max-h-[540px] space-y-3 overflow-y-auto pr-1">
              {CREATIVE_TEXT_ELEMENTS.map((entry) => {
                const textStyle = value.text[entry.id];
                const fallbackText = getCreativeCopyFallback(entry.id, {
                  title: previewTitle,
                  body: previewBody,
                  restaurantName: "Quirinale",
                  cuisine: "Italien",
                  city: "Puplinge",
                  address: "Rue de Graman",
                  ctaLabel: "Découvrir l'offre",
                  discountLabel: "Jusqu'à -18%",
                });
                const textValue = value.copy[entry.id] || fallbackText;
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border bg-background/75 p-3 shadow-sm"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {entry.label}
                      </Label>
                      <span className="text-[11px] text-muted-foreground">{entry.description}</span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        Texte
                      </Label>
                      <Input
                        value={textValue}
                        onChange={(event) => updateTextCopy(entry.id, event.target.value)}
                        className="h-10 rounded-xl"
                        maxLength={90}
                      />
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          Police
                        </Label>
                        <Select
                          value={textStyle.font}
                          onValueChange={(font) => updateTextElement(entry.id, {
                            font: font as CampaignCreativeConfig["text"][CampaignCreativeTextElement]["font"],
                          })}
                        >
                          <SelectTrigger className="h-10 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CREATIVE_FONT_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          Style
                        </Label>
                        <Select
                          value={textStyle.style}
                          onValueChange={(style) => updateTextElement(entry.id, {
                            style: style as CampaignCreativeConfig["text"][CampaignCreativeTextElement]["style"],
                          })}
                        >
                          <SelectTrigger className="h-10 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CREATIVE_STYLE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          Couleur
                        </Label>
                        <div className="flex h-10 items-center gap-2 rounded-xl border bg-background px-2">
                          <input
                            type="color"
                            value={textStyle.color}
                            onChange={(event) => updateTextElement(entry.id, { color: event.target.value })}
                            className="h-7 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0"
                            aria-label={`Couleur ${entry.label}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CampaignAutoDecisionPanel({
  type,
  targetPages,
  placementSelection,
  strategy,
  targetCriteria,
  totalBudgetValue,
  durationDays,
}: {
  type: string;
  targetPages: string[];
  placementSelection: Record<CampaignPlacementOption, boolean>;
  strategy: CampaignPricingStrategy;
  targetCriteria: AudienceCriteria;
  totalBudgetValue: number;
  durationDays: number;
}) {
  const plan = buildAutomaticCampaignPlan({ preferredPages: targetPages });
  const strategyLabel = getCampaignStrategyConfig(strategy).label;
  const targetingParts = summarizeAudienceCriteria(targetCriteria);
  const placementLabels = (Object.keys(CAMPAIGN_PLACEMENT_CONFIG) as CampaignPlacementOption[])
    .filter((placement) => placementSelection[placement])
    .map((placement) => CAMPAIGN_PLACEMENT_CONFIG[placement].label);

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-2">
          <p className="font-semibold">Pilotage automatique IA de tous les champs</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Le bouton IA analyse catalogue, produits vendus, avis, ventes flash, anti-gaspi, réservations, campagnes passées, pics horaires et tous les paramètres personnalisables déjà saisis. Il utilise le titre, texte, objectif {strategyLabel.toLowerCase()}, type {type}, pages, ciblage, budget, dates, image, emplacements {placementLabels.join(" + ") || "aucun"}, composition bannière, couleurs, polices, styles et suivi anti-gaspi si pertinent.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {targetPages.map((page) => (
              <Badge key={page} variant="secondary" className="text-[10px]">
                {TARGET_PAGES.find((targetPage) => targetPage.value === page)?.label || page}
              </Badge>
            ))}
            <Badge variant="outline" className="text-[10px]">Budget {formatChf(totalBudgetValue)}</Badge>
            <Badge variant="outline" className="text-[10px]">{durationDays} jours</Badge>
            <Badge variant="outline" className="text-[10px]">Objectif {strategyLabel}</Badge>
            <Badge variant="outline" className="text-[10px]">Paiement crédits TOK</Badge>
            {targetingParts.slice(0, 4).map((part) => (
              <Badge key={part} variant="outline" className="text-[10px]">{part}</Badge>
            ))}
            {plan.rationale.slice(0, 1).map((note) => <Badge key={note} variant="outline" className="text-[10px]">{note}</Badge>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignForm({
  restaurantId,
  initial,
  onSaved,
}: {
  restaurantId: string;
  initial?: any;
  onSaved: () => void;
}) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const { toast } = useToast();
  const initialPlacementSelection = normalizeCampaignPlacementSelection(initial?.channels, initial?.type);
  const initialBaseBudget = initial?.total_budget
    ? calculateCampaignBaseBudget(initial.total_budget, initialPlacementSelection, initial?.type).toString()
    : "";
  const [title, setTitle] = useState(initial?.title || "");
  const [body, setBody] = useState(initial?.body || "");
  const [type, setType] = useState(initial?.type || "boost");
  const [imageUrl, setImageUrl] = useState(initial?.image_url || "");
  const [campaignCreative, setCampaignCreative] = useState<CampaignCreativeConfig>(
    getCampaignCreativeFromChannels(initial?.channels),
  );
  const [placementSelection, setPlacementSelection] = useState(initialPlacementSelection);
  const [targetPages, setTargetPages] = useState<string[]>(
    Array.isArray(initial?.target_pages) ? initial.target_pages : ["home", "search"]
  );
  const [totalBudget, setTotalBudget] = useState(initialBaseBudget);
  const initialStartsAt = initial?.starts_at?.split("T")[0] || getDefaultCampaignStartDate();
  const initialEndsAt = initial?.ends_at?.split("T")[0] || addDaysToInputDate(initialStartsAt, 7);
  const [startsAt, setStartsAt] = useState(initialStartsAt);
  const [durationDays, setDurationDays] = useState(getDurationDays(initialStartsAt, initialEndsAt));
  const [selectedStrategy, setSelectedStrategy] = useState<CampaignPricingStrategy>(
    getRecordStrategy(initial || null),
  );
  const [strategyTouched, setStrategyTouched] = useState(Boolean(initial?.pricing_strategy));
  const [targetCriteria, setTargetCriteria] = useState<AudienceCriteria>(
    normalizeAudienceCriteria(initial?.target_criteria || DEFAULT_AUDIENCE_CRITERIA)
  );
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const isPaidCampaign = (initial?.payment_status || "unpaid") === "paid";
  const baseBudgetValue = Math.max(0, Number(totalBudget) || 0);
  const placementMultiplier = getCampaignPlacementCostMultiplier(placementSelection, type);
  const totalBudgetValue = calculateCampaignTotalCost(baseBudgetValue, placementSelection, type);
  const copyLimit = 250;
  const copyLength = title.length + body.length;
  const creditBalanceQuery = useQuery({
    queryKey: ["restaurant-campaign-credit-balance", restaurantId],
    queryFn: () => fetchCampaignCreditBalance(restaurantId),
    enabled: Boolean(restaurantId) && !isPaidCampaign && !isCommercialDemo,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const availableCampaignCredits = isCommercialDemo
    ? Number.POSITIVE_INFINITY
    : isPaidCampaign
    ? Math.max(0, Number(initial?.paid_amount || initial?.total_budget || 0))
    : Math.max(0, creditBalanceQuery.data ?? 0);
  const creditShortfall = Math.max(0, totalBudgetValue - availableCampaignCredits);
  const isCheckingCredits = !isPaidCampaign && totalBudgetValue > 0 && creditBalanceQuery.isLoading;
  const hasInsufficientCredits = !isPaidCampaign
    && totalBudgetValue > 0
    && !isCheckingCredits
    && !creditBalanceQuery.isError
    && creditShortfall > 0;
  const cannotReserveCredits = !isPaidCampaign
    && totalBudgetValue > 0
    && (isCheckingCredits || creditBalanceQuery.isError || hasInsufficientCredits);
  const recommendedStrategy = useMemo(
    () => recommendCampaignStrategy({
      type,
      targetPages,
      hasFlashSales: targetPages.includes("flash_sales"),
      hasAntiWaste: targetPages.includes("anti_waste"),
      hasPriorConversions: Number(initial?.conversions || 0) > 0,
    }),
    [initial?.conversions, targetPages, type],
  );
  const strategy = strategyTouched ? selectedStrategy : recommendedStrategy;
  const strategyConfig = useMemo(
    () => getCampaignStrategyConfig(strategy),
    [strategy],
  );
  const pricing = useMemo(
    () => getCampaignPricing(undefined, strategy),
    [strategy],
  );
  const plannerEstimate = useMemo(
    () => estimateCampaignPlan({
      totalBudgetChf: totalBudgetValue,
      durationDays,
      strategy,
      pricing,
    }),
    [durationDays, pricing, strategy, totalBudgetValue],
  );
  const dailyBudgetValue = plannerEstimate.dailyBudget;
  const endsAt = useMemo(
    () => addDaysToInputDate(startsAt, durationDays),
    [durationDays, startsAt],
  );

  useEffect(() => {
    if (!strategyTouched) {
      setSelectedStrategy(recommendedStrategy);
    }
  }, [recommendedStrategy, strategyTouched]);

  useEffect(() => {
    setTitle((currentTitle) => {
      const nextTitle = currentTitle.slice(0, copyLimit);
      setBody((currentBody) => currentBody.slice(0, Math.max(0, copyLimit - nextTitle.length)));
      return nextTitle;
    });
  }, [copyLimit]);

  const togglePage = (page: string) => {
    setTargetPages((previous) =>
      previous.includes(page) ? previous.filter((entry) => entry !== page) : [...previous, page]
    );
  };

  const togglePlacement = (placement: CampaignPlacementOption) => {
    setPlacementSelection((previous) => {
      const next = {
        ...previous,
        [placement]: !previous[placement],
      };

      if (!next.banner && !next.restaurant_cards) {
        return previous;
      }

      return next;
    });
  };

  const handleTitleChange = (nextTitle: string) => {
    const normalizedTitle = nextTitle.slice(0, copyLimit);
    setTitle(normalizedTitle);
    setBody((currentBody) => currentBody.slice(0, Math.max(0, copyLimit - normalizedTitle.length)));
  };

  const handleBodyChange = (nextBody: string) => {
    setBody(nextBody.slice(0, Math.max(0, copyLimit - title.length)));
  };

  const handleAiGenerate = async () => {
    setAiLoading(true);
    try {
      const currentSettings = {
        title,
        body,
        type,
        image_url: imageUrl || null,
        target_pages: targetPages,
        target_criteria: normalizeAudienceCriteria(targetCriteria),
        base_budget: baseBudgetValue,
        total_budget: totalBudgetValue,
        budget_daily: dailyBudgetValue,
        duration_days: durationDays,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        pricing_strategy: strategy,
        channels: {
          ...placementSelection,
          creative: campaignCreative,
        },
        creative: campaignCreative,
      };

      let result: Record<string, any>;
      if (isCommercialDemo && commercialDemoFrame) {
        const generated = await askCommercialDemoAi({
          runtime: {
            sessionId: commercialDemoFrame.config.sessionId,
            surface: "restaurant",
          },
          tool: "assistant",
          message: [
            "Optimise cette campagne de restaurant comme l’outil TOK de production.",
            "Retourne exclusivement un objet JSON avec title, body, type, target_pages, target_criteria,",
            "base_budget, total_budget, duration_days, pricing_strategy, channels et optimization_notes.",
            "Le titre et le texte réunis ne doivent pas dépasser 250 caractères.",
          ].join(" "),
          context: {
            entrypoint: "restaurant_campaign_optimizer",
            current_settings: currentSettings,
          },
        });
        result = parseCommercialDemoAiJson<Record<string, any>>(generated.reply);
      } else {
        const response = await fetchWithFreshAccessToken(`${SUPABASE_URL}/functions/v1/generate-campaign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            restaurantId,
            currentSettings,
          }),
        });

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          throw new Error(errorPayload.error || "Erreur IA");
        }
        result = await response.json();
      }
      if (result.title) {
        const generatedTitle = String(result.title).slice(0, copyLimit);
        setTitle(generatedTitle);
        if (result.body) setBody(String(result.body).slice(0, Math.max(0, copyLimit - generatedTitle.length)));
      } else if (result.body) {
        setBody(String(result.body).slice(0, Math.max(0, copyLimit - title.length)));
      }
      const generatedType = result.type ? String(result.type) : type;
      const generatedPlacementSelection = result.channels
        ? normalizeCampaignPlacementSelection(result.channels, generatedType)
        : result.placement_selection
          ? normalizeCampaignPlacementSelection(result.placement_selection, generatedType)
          : placementSelection;

      if (result.type) setType(generatedType);
      if (result.target_pages) setTargetPages(result.target_pages);
      if (result.channels || result.placement_selection) setPlacementSelection(generatedPlacementSelection);
      if (result.pricing_strategy) {
        setSelectedStrategy(normalizeCampaignPricingStrategy(result.pricing_strategy, recommendedStrategy));
        setStrategyTouched(true);
      }
      if (result.image_url) setImageUrl(String(result.image_url));
      if (result.target_criteria) setTargetCriteria(normalizeAudienceCriteria(result.target_criteria));
      const generatedBaseBudget = Number(result.base_budget);
      const generatedTotalBudget = Number(result.total_budget);
      if (Number.isFinite(generatedBaseBudget) && generatedBaseBudget >= 0) {
        setTotalBudget(String(generatedBaseBudget));
      } else if (Number.isFinite(generatedTotalBudget) && generatedTotalBudget >= 0) {
        setTotalBudget(String(calculateCampaignBaseBudget(generatedTotalBudget, generatedPlacementSelection, generatedType)));
      }
      if (result.duration_days) {
        setDurationDays(Math.max(1, Math.round(Number(result.duration_days) || 1)));
      }
      if (result.starts_at) {
        const generatedStart = String(result.starts_at).split("T")[0];
        if (generatedStart) setStartsAt(generatedStart);
      }
      if (result.starts_at && result.ends_at) {
        const generatedStart = String(result.starts_at).split("T")[0];
        const generatedEnd = String(result.ends_at).split("T")[0];
        if (generatedStart && generatedEnd) setDurationDays(getDurationDays(generatedStart, generatedEnd));
      }

      const optimizationNotes = Array.isArray(result.optimization_notes)
        ? result.optimization_notes.filter(Boolean).slice(0, 3).join(" · ")
        : "";
      toast({
        title: "Campagne générée par l’IA",
        description: optimizationNotes || "Objectif, emplacements, pages, ciblage, budget et calendrier ont été optimisés automatiquement.",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur IA",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!restaurantId) {
      toast({ title: "Restaurant requis", description: "Aucun restaurant sélectionné.", variant: "destructive" });
      return;
    }
    if (cannotReserveCredits) {
      toast({
        title: hasInsufficientCredits ? "Crédits TOK insuffisants" : "Solde TOK indisponible",
        description: hasInsufficientCredits
          ? "Achetez un pack de recharge ou attendez le prochain renouvellement de votre abonnement avant de créer cette campagne."
          : "Impossible de vérifier le solde de crédits TOK pour le moment.",
        variant: "destructive",
      });
      return;
    }

    if (isCommercialDemo) {
      toast({
        title: initial?.id ? "Campagne mise à jour dans la démonstration" : "Campagne créée dans la démonstration",
        description: "Aucun crédit, paiement ou canal de diffusion réel n'a été utilisé.",
      });
      onSaved();
      return;
    }

    setLoading(true);
    const existingChannels = initial?.channels && typeof initial.channels === "object" && !Array.isArray(initial.channels)
      ? initial.channels
      : {};
    const campaignChannels = {
      ...existingChannels,
      ...placementSelection,
      creative: campaignCreative,
    };
    const safeTitle = title.trim().slice(0, copyLimit);
    const safeBody = body.trim().slice(0, Math.max(0, copyLimit - safeTitle.length));
    const payload = {
      restaurant_id: restaurantId,
      title: safeTitle,
      body: safeBody,
      type,
      pricing_strategy: strategy,
      image_url: imageUrl || null,
      target_pages: targetPages,
      target_criteria: normalizeAudienceCriteria(targetCriteria),
      base_budget: baseBudgetValue,
      total_budget: totalBudgetValue,
      budget_daily_base: Math.round((baseBudgetValue / Math.max(1, durationDays)) * 100) / 100,
      budget_daily: dailyBudgetValue,
      channels: campaignChannels,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      payment_method: CAMPAIGN_PAYMENT_METHOD,
      payment_status: isPaidCampaign || totalBudgetValue > 0 ? "paid" : "unpaid",
      status: isPaidCampaign ? (initial?.status || "draft") : "draft",
    };

    try {
      const { error } = await saveRestaurantCampaign(restaurantId, payload, initial?.id);
      if (error) throw error;

      if (totalBudgetValue > 0 && !isPaidCampaign) {
        toast({
          title: "Crédits réservés",
          description: "Le budget de campagne a été réservé sur votre solde TOK.",
        });
      }

      onSaved();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible d’enregistrer la campagne.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!initial ? (
        <Button
          type="button"
          variant="outline"
          onClick={handleAiGenerate}
          disabled={aiLoading}
          className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5"
        >
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {aiLoading ? "L’IA analyse votre restaurant..." : "Générer automatiquement avec l’IA"}
        </Button>
      ) : null}

      <div className="space-y-2">
        <Label>Titre</Label>
        <Input value={title} onChange={(event) => handleTitleChange(event.target.value)} maxLength={copyLimit} required placeholder="Ex: Offre spéciale week-end" />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={body} onChange={(event) => handleBodyChange(event.target.value)} maxLength={Math.max(0, copyLimit - title.length)} placeholder="Décrivez le message que verront vos clients..." rows={3} />
        <p className={cn("text-xs", copyLength >= copyLimit ? "text-primary font-semibold" : "text-muted-foreground")}>
          {copyLength}/{copyLimit} caractères pour ce format.
        </p>
      </div>

      <ImageUpload value={imageUrl} onChange={setImageUrl} label="Image de la campagne" bucket="images" />

      <CampaignCreativeStudio
        value={campaignCreative}
        onChange={setCampaignCreative}
        title={title}
        body={body}
        imageUrl={imageUrl}
        type={type}
        placementSelection={placementSelection}
      />

      <div className="space-y-2">
        <Label>Type de campagne</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAMPAIGN_TYPES.map((campaignType) => (
              <SelectItem key={campaignType.value} value={campaignType.value}>
                {campaignType.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CampaignAutoDecisionPanel
        type={type}
        targetPages={targetPages}
        placementSelection={placementSelection}
        strategy={strategy}
        targetCriteria={targetCriteria}
        totalBudgetValue={totalBudgetValue}
        durationDays={durationDays}
      />

      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Megaphone className="h-4 w-4" /> Emplacements de diffusion
        </Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(CAMPAIGN_PLACEMENT_CONFIG) as CampaignPlacementOption[]).map((placement) => {
            const config = CAMPAIGN_PLACEMENT_CONFIG[placement];
            const checked = placementSelection[placement];
            const premiumLabel = config.costPremium > 0 ? `+${Math.round(config.costPremium * 100)}%` : "Inclus";

            return (
              <label
                key={placement}
                className="flex min-h-[92px] cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40"
              >
                <Checkbox checked={checked} onCheckedChange={() => togglePlacement(placement)} />
                <span className="space-y-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {config.label}
                    <Badge variant={config.costPremium > 0 ? "secondary" : "outline"} className="text-[10px]">
                      {premiumLabel}
                    </Badge>
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">{config.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border bg-muted/20 p-4 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Budget et objectif</p>
          <p className="text-xs text-muted-foreground">
            Tout ce qui pilote le budget est réuni ici. TOK recommande automatiquement notoriété, trafic ou conversion selon les produits, offres et ventes du moment.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Budget de base (CHF)</Label>
              <Input
                type="number"
                step="0.01"
                value={totalBudget}
                onChange={(event) => setTotalBudget(event.target.value)}
                disabled={isPaidCampaign}
              />
            </div>
            <div className="space-y-2">
              <Label>Duree (jours)</Label>
              <Input
                type="number"
                min={1}
                step="1"
                value={durationDays}
                onChange={(event) => setDurationDays(Math.max(1, Math.round(Number(event.target.value) || 1)))}
              />
            </div>
            <div className="space-y-2">
              <Label>Date de début</Label>
              <Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value || getDefaultCampaignStartDate())} />
            </div>
            <div className="space-y-2">
              <Label>Fin calculee</Label>
              <Input type="date" value={endsAt} readOnly />
            </div>
          </div>

          <div className="rounded-xl border bg-background p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium">Recommandation TOK</p>
                <p className="mt-1 text-lg font-semibold">{strategyConfig.label}</p>
                <p className="text-xs text-muted-foreground">{strategyConfig.recommendationHint}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {strategyTouched ? "Choisie manuellement" : "Recommandée"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-3 text-center">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Budget / jour</p>
                <p className="mt-1 text-lg font-semibold">{formatChf(dailyBudgetValue)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-center">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Total à payer</p>
                <p className="mt-1 text-lg font-semibold">{formatChf(totalBudgetValue)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Options d’affichage x{placementMultiplier.toFixed(2)} appliquées au budget de base.
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {(Object.keys(CAMPAIGN_STRATEGY_CONFIG) as CampaignPricingStrategy[]).map((entry) => {
            const config = CAMPAIGN_STRATEGY_CONFIG[entry];
            const estimate = estimateCampaignPlan({
              totalBudgetChf: totalBudgetValue,
              durationDays,
              strategy: entry,
            });
            const isSelected = strategy === entry;
            const isRecommended = recommendedStrategy === entry;

            return (
              <button
                key={entry}
                type="button"
                onClick={() => {
                  setSelectedStrategy(entry);
                  setStrategyTouched(true);
                }}
                className={`rounded-2xl border p-4 text-left transition-all ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "hover:border-primary/40 hover:bg-background"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{config.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{config.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {isRecommended ? <Badge variant="secondary" className="text-[10px]">Recommandée</Badge> : null}
                    {isSelected ? <Badge variant="default" className="text-[10px]">Active</Badge> : null}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/40 px-2 py-3">
                    <p className="text-sm font-semibold">{estimate.estimatedPeopleReached.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">personnes</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2 py-3">
                    <p className="text-sm font-semibold">{estimate.projectedClicks.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">clics</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2 py-3">
                    <p className="text-sm font-semibold">{estimate.projectedConversions}</p>
                    <p className="text-[10px] text-muted-foreground">conv.</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full bg-background px-2.5 py-1">{formatChf(config.pricing.cpmRate)} / 1k</span>
                  <span className="rounded-full bg-background px-2.5 py-1">{formatChf(config.pricing.cpcRate)} / clic</span>
                  <span className="rounded-full bg-background px-2.5 py-1">{formatChf(config.pricing.conversionRate)} / conv.</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border bg-background p-3">
            <p className="text-xs font-medium">Performance estimée</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 px-3 py-3">
                <p className="text-xs text-muted-foreground">Personnes touchées</p>
                <p className="mt-1 text-lg font-semibold">{plannerEstimate.estimatedPeopleReached.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-3">
                <p className="text-xs text-muted-foreground">Impressions</p>
                <p className="mt-1 text-lg font-semibold">{plannerEstimate.projectedImpressions.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-3">
                <p className="text-xs text-muted-foreground">Clics</p>
                <p className="mt-1 text-lg font-semibold">{plannerEstimate.projectedClicks.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-3">
                <p className="text-xs text-muted-foreground">Conversions</p>
                <p className="mt-1 text-lg font-semibold">{plannerEstimate.projectedConversions}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-3">
                <p className="text-xs text-muted-foreground">CPC estimé</p>
                <p className="mt-1 text-lg font-semibold">{plannerEstimate.estimatedCpc > 0 ? formatChf(plannerEstimate.estimatedCpc) : "—"}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-3">
                <p className="text-xs text-muted-foreground">CPA estimé</p>
                <p className="mt-1 text-lg font-semibold">{plannerEstimate.estimatedCpa > 0 ? formatChf(plannerEstimate.estimatedCpa) : "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-background p-3">
            <p className="text-xs font-medium">Repères concurrence</p>
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              <p>Meta Food & Beverage: env. {CAMPAIGN_MARKET_BENCHMARKS.metaFoodCpmUsd.toFixed(2)} USD CPM et {CAMPAIGN_MARKET_BENCHMARKS.metaFoodCpcUsd.toFixed(2)} USD CPC.</p>
              <p>Google Search Food: env. {CAMPAIGN_MARKET_BENCHMARKS.googleSearchFoodCpcUsd.toFixed(2)} USD CPC et {CAMPAIGN_MARKET_BENCHMARKS.googleSearchFoodCpaUsd.toFixed(2)} USD CPA.</p>
              <p>DoorDash: {CAMPAIGN_MARKET_BENCHMARKS.doordashPricingLabel}. Uber Eats: {CAMPAIGN_MARKET_BENCHMARKS.uberPricingLabel}.</p>
              <p>La formule active applique un mix hybride réel de prix impression, clic et conversion.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Target className="h-4 w-4" /> Pages d affichage
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {TARGET_PAGES.map((page) => (
            <label key={page.value} className="flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
              <Checkbox checked={targetPages.includes(page.value)} onCheckedChange={() => togglePage(page.value)} />
              <span className="text-sm">{page.label}</span>
            </label>
          ))}
        </div>
      </div>

      <AudienceTargeting criteria={targetCriteria} onChange={setTargetCriteria} restaurantId={restaurantId} />

      <div className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold">Paiement de la campagne</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Les campagnes se règlent uniquement avec vos crédits TOK. Si le solde est insuffisant, achetez un pack de recharge ou attendez le prochain renouvellement mensuel de votre abonnement.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Solde disponible</p>
            <p className="mt-1 text-sm font-semibold">
              {isCheckingCredits ? "Vérification..." : creditBalanceQuery.isError ? "À vérifier" : formatChf(availableCampaignCredits)}
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Budget campagne</p>
            <p className="mt-1 text-sm font-semibold">{formatChf(totalBudgetValue)}</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Après réservation</p>
            <p className="mt-1 text-sm font-semibold">
              {isCheckingCredits || creditBalanceQuery.isError ? "-" : formatChf(Math.max(0, availableCampaignCredits - totalBudgetValue))}
            </p>
          </div>
        </div>

        {hasInsufficientCredits ? (
          <div className="space-y-3 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Crédits TOK insuffisants</p>
                <p className="text-xs leading-5">
                  Il manque {formatChf(creditShortfall)} pour réserver ce budget. Achetez un pack de recharge ou attendez les crédits inclus dans votre abonnement au prochain renouvellement.
                </p>
              </div>
            </div>
            <Button asChild type="button" variant="outline" className="h-9 rounded-xl border-destructive/30 bg-background text-destructive hover:bg-destructive/10">
              <Link to="/dashboard/mon-compte-facturation">Recharger mes credits</Link>
            </Button>
          </div>
        ) : null}

        {creditBalanceQuery.isError ? (
          <p className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive">
            Impossible de vérifier le solde de crédits TOK. Réessayez dans quelques instants avant de créer la campagne.
          </p>
        ) : null}

        {!hasInsufficientCredits && !creditBalanceQuery.isError ? (
          <p className="text-xs text-primary">
            Le budget sera réservé sur le solde de crédits TOK de l'abonnement ou des packs achetés.
          </p>
        ) : null}

        {isPaidCampaign ? (
          <p className="text-xs text-green-600">
            Campagne déjà payée à hauteur de {Number(initial?.paid_amount || initial?.total_budget || 0).toFixed(2)} CHF via crédits TOK.
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={loading || cannotReserveCredits} className="w-full">
        {loading
          ? "Enregistrement..."
          : totalBudgetValue > 0 && !isPaidCampaign
              ? "Utiliser les crédits TOK et créer la campagne"
            : initial
              ? "Enregistrer la campagne"
              : "Créer la campagne"}
      </Button>
    </form>
  );
}
