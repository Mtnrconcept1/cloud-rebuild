import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Crown, History, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  buildTierBenefitPayload,
  getTierBenefitConfigMap,
  getTierBenefits,
  isLoyaltyTier,
  LOYALTY_BENEFITS,
  LOYALTY_TIER_ORDER,
  LOYALTY_TIERS,
  type LoyaltyBenefitConfig,
  type LoyaltyTierId,
} from "@/lib/loyaltyBenefits";
import {
  TOK_ONE_DEFAULT_DISCOUNT_PERCENT,
  buildSubscriptionBenefitRows,
  buildTokOneEntitlements,
  type SubscriptionBenefitInput,
  type TokOneBenefitForm,
} from "@/lib/subscriptionEntitlements";

const supabase = getSupabase();
const TOK_ONE_CURRENCY = "CHF";
const tokOneAmountFormatter = new Intl.NumberFormat("fr-CH", {
  style: "currency",
  currency: TOK_ONE_CURRENCY,
});

function formatTokOneAmount(value: unknown) {
  return tokOneAmountFormatter.format(Number(value || 0));
}

function parseTierBenefitsJson(value: string): Record<string, unknown> {
  if (!value.trim()) return {};

  const parsed = JSON.parse(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function normalizeTierName(value: string): LoyaltyTierId | null {
  const normalized = value.trim().toLowerCase();
  return isLoyaltyTier(normalized) ? normalized : null;
}

function getEditableBenefitsForTier(tierName: string) {
  const tierId = normalizeTierName(tierName);
  return tierId ? LOYALTY_BENEFITS.filter((benefit) => benefit.appliesFrom === tierId) : LOYALTY_BENEFITS;
}

function mergeTierBenefitPayload(rawBenefits: Record<string, unknown>, tierName: string) {
  const editableBenefits = getEditableBenefitsForTier(tierName);
  const currentConfigs = getTierBenefitConfigMap(rawBenefits);

  return {
    ...rawBenefits,
    ...buildTierBenefitPayload(editableBenefits, currentConfigs),
  };
}

const EMPTY_PLAN = {
  name: "",
  description: "",
  price_monthly: "",
  price_yearly: "",
  currency: "CHF",
  free_delivery_min_order: "",
  status: "active",
};

const EMPTY_BENEFIT_FORM: TokOneBenefitForm = {
  discountPercent: TOK_ONE_DEFAULT_DISCOUNT_PERCENT,
  freeDeliveryMinOrder: 0,
  chefTablePriority: true,
  flashEarlyAccess: true,
  prioritySupport: true,
  surpriseOffers: true,
};

const EMPTY_TIER = {
  name: "",
  min_points: "",
  multiplier: "1",
  benefits: "",
  status: "active",
};

type TokOneMetrics = {
  activePlans?: number;
  activeSubscribers?: number;
  monthlyRevenue?: number;
  churnCount?: number;
  benefitsConsumed?: number;
  estimatedBenefitCost?: number;
  marginImpact?: number;
};

export default function AdminLoyalty() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [planOpen, setPlanOpen] = useState(false);
  const [tierOpen, setTierOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [editingTier, setEditingTier] = useState<any>(null);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN);
  const [benefitForm, setBenefitForm] = useState<TokOneBenefitForm>(EMPTY_BENEFIT_FORM);
  const [tierForm, setTierForm] = useState(EMPTY_TIER);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingTier, setSavingTier] = useState(false);

  const { data: tiers = [] } = useQuery({
    queryKey: ["admin-loyalty-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_tiers").select("*").order("min_points");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: subscriptionPlans = [] } = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_subscription_plans").select("*").order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: subscriptionBenefits = [] } = useQuery({
    queryKey: ["admin-subscription-benefits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_benefits").select("*").order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: tokOneMetrics = {} as TokOneMetrics } = useQuery({
    queryKey: ["admin-tok-one-metrics"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_get_tok_one_metrics");
      if (error) throw error;
      return (data || {}) as TokOneMetrics;
    },
  });

  const { data: loyaltyHistory = [] } = useQuery({
    queryKey: ["admin-loyalty-change-history"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_loyalty_change_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data || [];
    },
  });

  const tierEditorRawBenefits = (() => {
    try {
      return parseTierBenefitsJson(tierForm.benefits);
    } catch {
      return {};
    }
  })();
  const tierBenefitConfigs = getTierBenefitConfigMap(tierEditorRawBenefits);
  const tierBenefitEditorBenefits = getEditableBenefitsForTier(tierForm.name);

  const updateTierBenefitConfig = (benefitId: string, nextConfig: LoyaltyBenefitConfig) => {
    setTierForm((previous) => {
      let rawBenefits: Record<string, unknown> = {};
      try {
        rawBenefits = parseTierBenefitsJson(previous.benefits);
      } catch {
        rawBenefits = {};
      }

      const currentConfigs = getTierBenefitConfigMap(rawBenefits);
      const editableBenefits = getEditableBenefitsForTier(previous.name);
      const nextConfigs = {
        ...currentConfigs,
        [benefitId]: {
          ...currentConfigs[benefitId],
          ...nextConfig,
        },
      };

      return {
        ...previous,
        benefits: JSON.stringify(
          {
            ...rawBenefits,
            ...buildTierBenefitPayload(editableBenefits, nextConfigs),
          },
          null,
          2,
        ),
      };
    });
  };

  const toggleTierBenefit = (benefitId: string, enabled: boolean) => {
    updateTierBenefitConfig(benefitId, { enabled });
  };

  const updateTierBenefitText = (
    benefitId: string,
    field: "title" | "description",
    value: string,
  ) => {
    updateTierBenefitConfig(benefitId, { [field]: value });
  };

  const getPlanBenefits = (planId: string): SubscriptionBenefitInput[] =>
    subscriptionBenefits
      .filter((benefit: any) => benefit.plan_id === planId)
      .map((benefit: any) => ({
        benefit_type: String(benefit.benefit_type || ""),
        value:
          benefit.value && typeof benefit.value === "object" && !Array.isArray(benefit.value)
            ? (benefit.value as Record<string, unknown>)
            : null,
      }));

  const buildBenefitForm = (plan: any, benefits: SubscriptionBenefitInput[]): TokOneBenefitForm => {
    const entitlements = buildTokOneEntitlements({ plan, benefits });
    return {
      discountPercent: entitlements.discountPercent,
      freeDeliveryMinOrder: Number.isFinite(entitlements.freeDeliveryMinOrder) ? entitlements.freeDeliveryMinOrder : 0,
      chefTablePriority: entitlements.flags.chefTablePriority,
      flashEarlyAccess: entitlements.flags.flashEarlyAccess,
      prioritySupport: entitlements.flags.prioritySupport,
      surpriseOffers: entitlements.flags.surpriseOffers,
    };
  };

  const simulationMarge = {
    revenue: Number(tokOneMetrics.monthlyRevenue || 0),
    estimatedCost:
      Number(tokOneMetrics.estimatedBenefitCost || 0) +
      Number(benefitForm.discountPercent || 0) * Number(tokOneMetrics.activeSubscribers || 0) * 0.25 +
      Number(tierForm.multiplier || 1) * 0.5,
  };
  const simulatedMargin = simulationMarge.revenue - simulationMarge.estimatedCost;

  const invalidateLoyalty = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
    queryClient.invalidateQueries({ queryKey: ["admin-subscription-benefits"] });
    queryClient.invalidateQueries({ queryKey: ["admin-loyalty-tiers"] });
    queryClient.invalidateQueries({ queryKey: ["admin-tok-one-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["admin-loyalty-change-history"] });
  };

  const openNewPlan = () => {
    setEditingPlan(null);
    setPlanForm(EMPTY_PLAN);
    setBenefitForm(EMPTY_BENEFIT_FORM);
    setPlanOpen(true);
  };

  const openEditPlan = (plan: any) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name || "",
      description: plan.description || "",
      price_monthly: String(plan.price_monthly ?? ""),
      price_yearly: String(plan.price_yearly ?? ""),
      currency: plan.currency || TOK_ONE_CURRENCY,
      free_delivery_min_order: String(plan.free_delivery_min_order ?? ""),
      status: plan.status || "active",
    });
    setBenefitForm(buildBenefitForm(plan, getPlanBenefits(plan.id)));
    setPlanOpen(true);
  };

  const savePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingPlan(true);

    const payload = {
      name: planForm.name,
      description: planForm.description || null,
      price_monthly: Number(planForm.price_monthly || 0),
      price_yearly: Number(planForm.price_yearly || 0),
      currency: planForm.currency || TOK_ONE_CURRENCY,
      free_delivery_min_order: planForm.free_delivery_min_order ? Number(planForm.free_delivery_min_order) : null,
      status: planForm.status,
    };

    try {
      if (payload.price_monthly < 0 || payload.price_yearly < 0) throw new Error("Le prix ne peut pas etre negatif.");
      const benefitRows = buildSubscriptionBenefitRows(editingPlan?.id || "00000000-0000-0000-0000-000000000000", benefitForm).map(
        ({ benefit_type, value }) => ({ benefit_type, value }),
      );
      const { error } = await (supabase.rpc as any)("admin_save_subscription_plan", {
        p_plan_id: editingPlan?.id || null,
        p_payload: payload,
        p_benefits: benefitRows,
        p_reason: editingPlan ? "Mise à jour admin Tok One" : "Création admin Tok One",
      });
      if (error) throw error;
    } catch (error) {
      setSavingPlan(false);
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible d'enregistrer le forfait.",
        variant: "destructive",
      });
      return;
    }

    setSavingPlan(false);
    setPlanOpen(false);
    setEditingPlan(null);
    setPlanForm(EMPTY_PLAN);
    setBenefitForm(EMPTY_BENEFIT_FORM);
    invalidateLoyalty();
    toast({ title: editingPlan ? "Forfait mis a jour" : "Forfait cree" });
  };

  const deletePlan = async (id: string) => {
    const reason = window.prompt("Raison obligatoire pour archiver ce forfait utilise ou publiable.");
    if (!reason?.trim()) return;
    const { error } = await (supabase.rpc as any)("admin_archive_subscription_plan", {
      p_plan_id: id,
      p_reason: reason.trim(),
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    invalidateLoyalty();
    toast({ title: "Forfait archive" });
  };

  const openNewTier = () => {
    setEditingTier(null);
    setTierForm(EMPTY_TIER);
    setTierOpen(true);
  };

  const openEditTier = (tier: any) => {
    setEditingTier(tier);
    setTierForm({
      name: tier.name || "",
      min_points: String(tier.min_points ?? ""),
      multiplier: String(tier.multiplier ?? 1),
      benefits: tier.benefits ? JSON.stringify(tier.benefits, null, 2) : "",
      status: tier.status || "active",
    });
    setTierOpen(true);
  };

  const saveTier = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingTier(true);

    let benefitsPayload: Record<string, unknown> = {};
    if (tierForm.benefits.trim()) {
      try {
        benefitsPayload = JSON.parse(tierForm.benefits);
      } catch {
        setSavingTier(false);
        toast({ title: "Erreur", description: "Le JSON des avantages est invalide.", variant: "destructive" });
        return;
      }
    }

    const payload = {
      name: tierForm.name,
      min_points: Number(tierForm.min_points || 0),
      multiplier: Number(tierForm.multiplier || 1),
      benefits: mergeTierBenefitPayload(benefitsPayload, tierForm.name),
      status: tierForm.status,
    };

    if (payload.multiplier <= 0 || payload.multiplier > 10) {
      setSavingTier(false);
      toast({ title: "Erreur", description: "Multiplicateur invalide.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase.rpc as any)("admin_save_loyalty_tier", {
      p_tier_id: editingTier?.id || null,
      p_payload: payload,
      p_reason: editingTier ? "Mise à jour palier fidelite" : "Création palier fidelite",
    });

    setSavingTier(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    setTierOpen(false);
    setEditingTier(null);
    setTierForm(EMPTY_TIER);
    invalidateLoyalty();
    toast({ title: editingTier ? "Palier mis a jour" : "Palier cree" });
  };

  const deleteTier = async (id: string) => {
    const reason = window.prompt("Raison obligatoire pour archiver ce palier.");
    if (!reason?.trim()) return;
    const { error } = await (supabase.rpc as any)("admin_archive_loyalty_tier", {
      p_tier_id: id,
      p_reason: reason.trim(),
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    invalidateLoyalty();
    toast({ title: "Palier archive" });
  };

  return (
    <div className="container py-8 space-y-6">
      <DashboardPageHero
        badge="Fidelite"
        title="Fidelite et abonnement"
        description="Configurez Tok One et les paliers de fidelite avec controle marge, audit et archivage."
        icon={Crown}
        tone="amber"
        visualLabel="Loyalty"
        stats={[
          { label: "Forfaits", value: subscriptionPlans.length, icon: ShieldCheck },
          { label: "Abonnes", value: Number(tokOneMetrics.activeSubscribers || 0), icon: ShieldCheck },
          { label: "Paliers", value: tiers.length, icon: Crown },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Revenu mensuel Tok One</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatTokOneAmount(tokOneMetrics.monthlyRevenue)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Avantages consommes</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{Number(tokOneMetrics.benefitsConsumed || 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Coût avantages</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatTokOneAmount(tokOneMetrics.estimatedBenefitCost)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Impact marge</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatTokOneAmount(tokOneMetrics.marginImpact)}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Simulation marge</CardTitle>
            <CardDescription>Variation indicative selon remise, multiplicateur et volume abonnés courant.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Revenu</p>
              <p className="text-lg font-semibold">{formatTokOneAmount(simulationMarge.revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Coût simule</p>
              <p className="text-lg font-semibold">{formatTokOneAmount(simulationMarge.estimatedCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Impact marge simule</p>
              <p className="text-lg font-semibold">{formatTokOneAmount(simulatedMargin)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" />Historique des changements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loyaltyHistory.slice(0, 5).map((entry: any) => (
              <div key={entry.id} className="rounded-md border p-2 text-xs">
                <p className="font-medium">{entry.action} · {entry.entity_type}</p>
                <p className="text-muted-foreground">{entry.reason || "Sans raison"}</p>
              </div>
            ))}
            {loyaltyHistory.length === 0 ? <p className="text-sm text-muted-foreground">Aucun changement audite.</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalogue des avantages</CardTitle>
          <CardDescription>Avantages client affiches dans le programme fidelite, par niveau debloque.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {LOYALTY_TIER_ORDER.map((tierId) => {
            const tier = LOYALTY_TIERS[tierId];
            const benefits = getTierBenefits(tierId, tiers).filter((benefit) => benefit.appliesFrom === tierId);
            return (
              <div key={tierId} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{tier.label}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Des {tier.threshold} pts</span>
                </div>
                <div className="mt-3 space-y-2">
                  {benefits.map((benefit) => (
                    <div key={benefit.id} className="rounded-lg bg-muted/40 p-2">
                      <p className="text-sm font-medium">{benefit.title}</p>
                      <p className="text-xs text-muted-foreground">{benefit.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle>Abonnements</CardTitle>
              </div>
              <Dialog open={planOpen} onOpenChange={setPlanOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" onClick={openNewPlan}>Créer forfait</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>{editingPlan ? "Modifier le forfait" : "Nouveau forfait"}</DialogTitle></DialogHeader>
                  <form onSubmit={savePlan} className="space-y-3">
                    <Input placeholder="Nom" value={planForm.name} onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))} required />
                    <Textarea placeholder="Description" value={planForm.description} onChange={(event) => setPlanForm((prev) => ({ ...prev, description: event.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Prix mensuel" type="number" step="0.01" value={planForm.price_monthly} onChange={(event) => setPlanForm((prev) => ({ ...prev, price_monthly: event.target.value }))} required />
                      <Input placeholder="Prix annuel" type="number" step="0.01" value={planForm.price_yearly} onChange={(event) => setPlanForm((prev) => ({ ...prev, price_yearly: event.target.value }))} required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Devise" value={planForm.currency} onChange={(event) => setPlanForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))} />
                      <Input placeholder="Seuil livraison offerte" type="number" step="0.01" value={planForm.free_delivery_min_order} onChange={(event) => setPlanForm((prev) => ({ ...prev, free_delivery_min_order: event.target.value }))} />
                    </div>
                    <div className="rounded-md border p-3 space-y-3">
                      <p className="text-sm font-semibold">Avantages Tok One</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Input aria-label="Remise Tok One en pourcentage" placeholder="Remise en %" type="number" step="1" value={benefitForm.discountPercent} onChange={(event) => setBenefitForm((prev) => ({ ...prev, discountPercent: Number(event.target.value || 0) }))} />
                        <Input aria-label="Minimum livraison offerte" placeholder="Minimum livraison" type="number" step="0.01" value={benefitForm.freeDeliveryMinOrder} onChange={(event) => setBenefitForm((prev) => ({ ...prev, freeDeliveryMinOrder: Number(event.target.value || 0) }))} />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          ["chefTablePriority", "La Table du Chef"],
                          ["flashEarlyAccess", "Ventes flash en avance"],
                          ["prioritySupport", "Support prioritaire"],
                          ["surpriseOffers", "Offres surprises"],
                        ].map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <Checkbox checked={Boolean(benefitForm[key as keyof TokOneBenefitForm])} onCheckedChange={(checked) => setBenefitForm((prev) => ({ ...prev, [key]: checked === true }))} />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <select value={planForm.status} onChange={(event) => setPlanForm((prev) => ({ ...prev, status: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      <option value="active">active</option>
                      <option value="archived">archived</option>
                    </select>
                    <Button type="submit" className="w-full" disabled={savingPlan}>{savingPlan ? "Enregistrement..." : editingPlan ? "Mettre à jour" : "Créer"}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <CardDescription>Forfaits de livraison et d'avantages partenaires.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscriptionPlans.map((plan: any) => {
              const entitlements = buildTokOneEntitlements({ plan, benefits: getPlanBenefits(plan.id) });
              const enabledBenefits = entitlements.displayBenefits.filter((benefit) => benefit.enabled);
              return (
                <div key={plan.id} className="flex items-start justify-between gap-4 rounded-xl border p-4">
                  <div>
                    <p className="text-lg font-bold">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">{formatTokOneAmount(plan.price_monthly)} / mois · {plan.status || "active"}</p>
                    <p className="text-xs text-muted-foreground">{plan.description || "Sans description"}</p>
                    <p className="mt-1 text-xs text-green-600">
                      Livraison offerte {Number.isFinite(entitlements.freeDeliveryMinOrder) && entitlements.freeDeliveryMinOrder > 0 ? `(des ${formatTokOneAmount(entitlements.freeDeliveryMinOrder)})` : "sans minimum"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {enabledBenefits.map((benefit) => (
                        <span key={benefit.id} className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{benefit.label}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => openEditPlan(plan)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deletePlan(plan.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              );
            })}
            {subscriptionPlans.length === 0 ? <p className="text-sm text-muted-foreground">Aucun abonnement configure.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                <CardTitle>Paliers de fidelite</CardTitle>
              </div>
              <Dialog open={tierOpen} onOpenChange={setTierOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" onClick={openNewTier}>Ajouter palier</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
                  <DialogHeader><DialogTitle>{editingTier ? "Modifier le palier" : "Nouveau palier"}</DialogTitle></DialogHeader>
                  <form onSubmit={saveTier} className="space-y-3">
                    <Input placeholder="Nom" value={tierForm.name} onChange={(event) => setTierForm((prev) => ({ ...prev, name: event.target.value }))} required />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Points minimum" type="number" value={tierForm.min_points} onChange={(event) => setTierForm((prev) => ({ ...prev, min_points: event.target.value }))} required />
                      <Input placeholder="Multiplicateur" type="number" step="0.1" value={tierForm.multiplier} onChange={(event) => setTierForm((prev) => ({ ...prev, multiplier: event.target.value }))} required />
                    </div>
                    <div className="rounded-md border p-3 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Avantages Miamz du palier</p>
                        <p className="text-xs text-muted-foreground">Texte visible sur la page des avantages et dans la modal client.</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {tierBenefitEditorBenefits.map((benefit) => {
                          const config = tierBenefitConfigs[benefit.id] || {};
                          const enabled = config.enabled !== false;
                          return (
                            <div key={benefit.id} className={enabled ? "rounded-lg border p-3" : "rounded-lg border border-dashed p-3 opacity-70"}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">{benefit.title}</p>
                                  <p className="text-xs text-muted-foreground">{benefit.appliesFrom}</p>
                                </div>
                                <Switch
                                  checked={enabled}
                                  aria-label={`Activer ${benefit.title}`}
                                  onCheckedChange={(checked) => toggleTierBenefit(benefit.id, checked === true)}
                                />
                              </div>
                              <div className="mt-3 space-y-2">
                                <Input
                                  aria-label={`Titre ${benefit.title}`}
                                  value={config.title ?? benefit.title}
                                  onChange={(event) => updateTierBenefitText(benefit.id, "title", event.target.value)}
                                />
                                <Textarea
                                  aria-label={`Description ${benefit.title}`}
                                  rows={2}
                                  value={config.description ?? benefit.description}
                                  onChange={(event) => updateTierBenefitText(benefit.id, "description", event.target.value)}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <details className="rounded-md border p-3">
                      <summary className="cursor-pointer text-sm font-medium">JSON avance</summary>
                      <Textarea
                        className="mt-3 font-mono text-xs"
                        placeholder='Avantages JSON ex: {"miamz_benefits":{"priority_support":{"enabled":true}}}'
                        rows={5}
                        value={tierForm.benefits}
                        onChange={(event) => setTierForm((prev) => ({ ...prev, benefits: event.target.value }))}
                      />
                    </details>
                    <select value={tierForm.status} onChange={(event) => setTierForm((prev) => ({ ...prev, status: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      <option value="active">active</option>
                      <option value="archived">archived</option>
                    </select>
                    <Button type="submit" className="w-full" disabled={savingTier}>{savingTier ? "Enregistrement..." : editingTier ? "Mettre à jour" : "Créer"}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <CardDescription>Paliers de points et multiplicateurs associes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tiers.map((tier: any) => (
              <div key={tier.id} className="flex items-start justify-between gap-4 rounded-xl border bg-gradient-to-tr from-card to-muted/50 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold capitalize">{tier.name}</p>
                    <span className="rounded-full bg-primary px-2 py-0.5 text-sm text-primary-foreground">Des {tier.min_points} pts</span>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">Multiplicateur: x{tier.multiplier} · {tier.status || "active"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{tier.benefits ? JSON.stringify(tier.benefits) : "Aucun avantage JSON configure"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => openEditTier(tier)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteTier(tier.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            {tiers.length === 0 ? <p className="text-sm text-muted-foreground">Aucun palier configure.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
