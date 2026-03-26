import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Edit2,
  Eye,
  Loader2,
  Megaphone,
  MousePointer,
  Plus,
  ShoppingCart,
  Sparkles,
  Target,
  Timer,
  Trash2,
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
import ImageUpload from "@/components/ImageUpload";
import PaymentMethodSelector, { type PaymentMethodId } from "@/components/cart/PaymentMethodSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_AUDIENCE_CRITERIA,
  normalizeAudienceCriteria,
  summarizeAudienceCriteria,
  type AudienceCriteria,
} from "@/lib/campaignTargeting";
import {
  deleteRestaurantCampaign,
  listRestaurantCampaigns,
  saveRestaurantCampaign,
  setRestaurantCampaignStatus,
} from "@/lib/campaigns";
import { SUPABASE_URL } from "@/lib/env";
import { fetchWithFreshAccessToken, invokeSupabaseFunction } from "@/lib/session";
import { useDashboardRestaurant } from "./DashboardContext";

const CAMPAIGN_TYPES = [
  { value: "boost", label: "Boost (Sponsorise)" },
  { value: "banner", label: "Banniere" },
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
  cancelled: { label: "Paiement annule", variant: "destructive" },
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

export default function DashboardCampagnes() {
  const { selectedId, restaurants } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [periodDays, setPeriodDays] = useState<"7" | "30" | "90">("30");
  const [paidCampaign, setPaidCampaign] = useState<any>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conversionWindowStart = useMemo(() => {
    const daysBack = Number(periodDays);
    const from = new Date();
    from.setDate(from.getDate() - daysBack);
    return from.toISOString();
  }, [periodDays]);

  const pollCampaignStatus = useCallback(
    (campaignId: string, attempts = 0) => {
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
              title: "Paiement confirme",
              description: "Votre campagne a ete payee avec succes et est maintenant active.",
            });
          } else {
            pollCampaignStatus(campaignId, attempts + 1);
          }
        } catch {
          pollCampaignStatus(campaignId, attempts + 1);
        }
      }, 2000);
    },
    [queryClient, selectedId, toast],
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
        title: "Paiement annule",
        description: "La campagne reste en brouillon tant que le paiement n est pas finalise.",
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

      for (const row of data || []) {
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

  const updateStatus = async (id: string, status: string) => {
    if (!selectedId) return;
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
    const { error } = await deleteRestaurantCampaign(selectedId, id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns", selectedId] });
    toast({ title: "Campagne supprimee" });
  };

  return (
    <DashboardLayout>
      <AlertDialog open={!!paidCampaign} onOpenChange={(open) => { if (!open) setPaidCampaign(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <AlertDialogTitle className="text-center">Paiement confirme</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-center">
                <p>Votre campagne a ete payee avec succes et est maintenant active.</p>
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
                    {(paidCampaign.start_date || paidCampaign.end_date) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Periode</span>
                        <span className="font-medium">
                          {paidCampaign.start_date ? new Date(paidCampaign.start_date).toLocaleDateString("fr-CH") : "—"}
                          {" — "}
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Megaphone className="h-6 w-6 text-primary" />
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold">Campagnes publicitaires</h1>
              <p className="text-sm text-muted-foreground">
                {selectedRestaurant ? `Pilotage de ${selectedRestaurant.name}` : "Selectionnez un restaurant dans la barre laterale."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={periodDays} onValueChange={(value) => setPeriodDays(value as "7" | "30" | "90")}>
              <SelectTrigger className="w-28">
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
                      toast({ title: editing ? "Campagne mise a jour" : "Campagne enregistree" });
                    }}
                  />
                ) : null}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">Conversions sponsorisees ({periodDays}j)</p>
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
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" />Zero Attente</p>
              <p className="text-2xl font-bold">{loadingConversions ? "..." : conversionsByType.zeroAttente}</p>
            </CardContent>
          </Card>
        </div>

        {conversionsError ? <p className="text-xs text-destructive">Impossible de charger le detail des conversions.</p> : null}

        {!selectedId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Selectionnez un restaurant pour gerer ses campagnes.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">{[1, 2].map((value) => <div key={value} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>
        ) : !campaigns?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Aucune campagne. Boostez la visibilite de votre restaurant !
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign: any) => {
              const status = STATUS_MAP[campaign.status] || STATUS_MAP.draft;
              const paymentStatus = PAYMENT_STATUS_MAP[campaign.payment_status || "unpaid"] || PAYMENT_STATUS_MAP.unpaid;
              const pages = Array.isArray(campaign.target_pages) ? campaign.target_pages : [];
              const targetingParts = summarizeAudienceCriteria(campaign.target_criteria || DEFAULT_AUDIENCE_CRITERIA);
              const isPaid = (campaign.payment_status || "unpaid") === "paid";

              return (
                <Card key={campaign.id}>
                  <CardContent className="py-4 space-y-3">
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
                                Finaliser paiement
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
                          <p className="mt-2 text-xs text-muted-foreground">Diffusion large sans ciblage supplementaire.</p>
                        )}

                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-3">
                          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{campaign.impressions || 0} impressions</span>
                          <span className="flex items-center gap-1"><MousePointer className="h-3 w-3" />{campaign.clicks || 0} clics</span>
                          <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{campaign.conversions || 0} conversions</span>
                          <span>Budget: {Number(campaign.spent || 0).toFixed(2)}/{Number(campaign.total_budget || 0).toFixed(2)} CHF</span>
                          <span>Paye: {Number(campaign.paid_amount || 0).toFixed(2)} CHF</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
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
  const { toast } = useToast();
  const [title, setTitle] = useState(initial?.title || "");
  const [body, setBody] = useState(initial?.body || "");
  const [type, setType] = useState(initial?.type || "boost");
  const [imageUrl, setImageUrl] = useState(initial?.image_url || "");
  const [targetPages, setTargetPages] = useState<string[]>(
    Array.isArray(initial?.target_pages) ? initial.target_pages : ["home", "search"]
  );
  const [totalBudget, setTotalBudget] = useState(initial?.total_budget?.toString() || "");
  const [dailyBudget, setDailyBudget] = useState(initial?.budget_daily?.toString() || "");
  const [startsAt, setStartsAt] = useState(initial?.starts_at?.split("T")[0] || "");
  const [endsAt, setEndsAt] = useState(initial?.ends_at?.split("T")[0] || "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>((initial?.payment_method as PaymentMethodId) || "card");
  const [targetCriteria, setTargetCriteria] = useState<AudienceCriteria>(
    normalizeAudienceCriteria(initial?.target_criteria || DEFAULT_AUDIENCE_CRITERIA)
  );
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const isPaidCampaign = (initial?.payment_status || "unpaid") === "paid";
  const totalBudgetValue = Math.max(0, Number(totalBudget) || 0);
  const requiresCheckout = totalBudgetValue > 0 && !isPaidCampaign && paymentMethod !== "cash";

  const togglePage = (page: string) => {
    setTargetPages((previous) =>
      previous.includes(page) ? previous.filter((entry) => entry !== page) : [...previous, page]
    );
  };

  const handleAiGenerate = async () => {
    setAiLoading(true);
    try {
      const response = await fetchWithFreshAccessToken(`${SUPABASE_URL}/functions/v1/generate-campaign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ restaurantId }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || "Erreur IA");
      }

      const result = await response.json();
      if (result.title) setTitle(result.title);
      if (result.body) setBody(result.body);
      if (result.type) setType(result.type);
      if (result.target_pages) setTargetPages(result.target_pages);
      if (result.total_budget) setTotalBudget(String(result.total_budget));
      if (result.budget_daily) setDailyBudget(String(result.budget_daily));

      toast({ title: "Campagne generee par l IA", description: "Relisez et ajustez le ciblage avant publication." });
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
      toast({ title: "Restaurant requis", description: "Aucun restaurant selectionne.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const payload = {
      restaurant_id: restaurantId,
      title,
      body,
      type,
      image_url: imageUrl || null,
      target_pages: targetPages,
      target_criteria: normalizeAudienceCriteria(targetCriteria),
      total_budget: totalBudgetValue,
      budget_daily: Math.max(0, Number(dailyBudget) || 0),
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      payment_method: paymentMethod,
      payment_status: isPaidCampaign ? "paid" : (paymentMethod === "cash" && totalBudgetValue > 0 ? "pending" : "unpaid"),
      status: isPaidCampaign ? (initial?.status || "draft") : (paymentMethod === "cash" && totalBudgetValue > 0 ? "pending_payment" : "draft"),
    };

    try {
      let campaignRecord: any = null;
      const { data, error } = await saveRestaurantCampaign(restaurantId, payload, initial?.id);
      if (error) throw error;
      campaignRecord = data;

      if (requiresCheckout && campaignRecord?.id) {
        const { data: checkoutData, error: checkoutError } = await invokeSupabaseFunction<{ url?: string }>("create-checkout", {
          body: {
            checkout_kind: "campaign",
            items: [
              {
                name: `Campagne publicitaire - ${title}`,
                restaurant_name: null,
                price: totalBudgetValue,
                quantity: 1,
              },
            ],
            payment_method: paymentMethod,
            return_url: `${window.location.origin}/dashboard/campagnes?campaign_checkout=1&campaign_id=${campaignRecord.id}`,
            order_metadata: {
              checkout_kind: "campaign",
              order_reference: `campaign-${campaignRecord.id}`,
              campaign_id: campaignRecord.id,
              campaign_title: title,
              restaurant_id: restaurantId,
              disable_connected_account: true,
            },
          },
        });

        if (checkoutError || !checkoutData?.url) {
          throw new Error(checkoutError?.message || "Impossible de creer la session de paiement.");
        }

        window.location.href = checkoutData.url;
        return;
      }

      if (paymentMethod === "cash" && totalBudgetValue > 0 && !isPaidCampaign) {
        toast({
          title: "Campagne en attente",
          description: "La campagne est en attente de reglement manuel avant activation.",
        });
      }

      onSaved();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible d enregistrer la campagne.",
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
          {aiLoading ? "L IA analyse votre restaurant..." : "Generer automatiquement avec l IA"}
        </Button>
      ) : null}

      <div className="space-y-2">
        <Label>Titre</Label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Ex: Offre speciale week-end" />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Decrivez le message que verront vos clients..." rows={3} />
      </div>

      <ImageUpload value={imageUrl} onChange={setImageUrl} label="Image de la campagne" bucket="images" />

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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Budget total (CHF)</Label>
          <Input
            type="number"
            step="0.01"
            value={totalBudget}
            onChange={(event) => setTotalBudget(event.target.value)}
            disabled={isPaidCampaign}
          />
        </div>
        <div className="space-y-2">
          <Label>Budget quotidien (CHF)</Label>
          <Input type="number" step="0.01" value={dailyBudget} onChange={(event) => setDailyBudget(event.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date debut</Label>
          <Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Date fin</Label>
          <Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold">Paiement de la campagne</p>
          <p className="text-xs text-muted-foreground">
            Les paiements en ligne activent automatiquement la campagne. Le reglement manuel la laisse en attente.
          </p>
        </div>
        <PaymentMethodSelector
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          cashDescription="Le reglement manuel n active pas la campagne tant qu il n est pas valide."
          secureDescription="Paiement securise via Stripe. La campagne est activee apres confirmation."
        />
        {isPaidCampaign ? (
          <p className="text-xs text-green-600">
            Campagne deja payee a hauteur de {Number(initial?.paid_amount || 0).toFixed(2)} CHF via {String(initial?.payment_method || "card").toUpperCase()}.
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading
          ? "Enregistrement..."
          : requiresCheckout
            ? "Payer et lancer la campagne"
            : initial
              ? "Enregistrer la campagne"
              : "Creer la campagne"}
      </Button>
    </form>
  );
}
