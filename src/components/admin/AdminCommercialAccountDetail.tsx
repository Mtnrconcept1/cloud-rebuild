import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarClock, Coins, ExternalLink, Loader2, ReceiptText, Store, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchGenevaCommercialProspects } from "@/data/genevaCommercialProspects";
import { getSupabase } from "@/integrations/supabase/client";
import {
  COMMERCIAL_REFUSAL_REASONS,
  getCommercialFollowupStatusLabel,
  getCommercialRefusalReasonLabel,
} from "@/lib/commercialSales";
import type { ManagedCommercialAccount } from "./AdminCommercialAccountsPanel";

type CommercialFollowup = {
  source_objectid: number;
  status: "not_visited" | "visited" | "in_progress" | "signed" | "not_interested";
  notes: string | null;
  assigned_to: string | null;
  last_contacted_by: string | null;
  signed_by: string | null;
  signed_at: string | null;
  signed_restaurant_id: string | null;
  signed_subscription_plan_slug: string | null;
  signed_subscription_plan_name: string | null;
  acquisition_commission_chf: number | string | null;
  visited_at: string | null;
  next_follow_up_at: string | null;
  refusal_reason_codes: string[] | null;
  refusal_other_text: string | null;
  updated_at: string | null;
};

type CommercialCompensationProfile = {
  user_id: string;
  status: "sprint" | "engaged" | "team_lead" | "inactive";
  sprint_started_at: string;
  engaged_at: string | null;
  employment_active: boolean;
};

type CommercialCompensationSummary = {
  profile?: {
    status?: string;
    sprint_started_at?: string;
    sprint_end_at?: string;
    employment_active?: boolean;
  };
  fixed_salary?: { period_chf?: number; monthly_chf?: number };
  signatures?: { period_count?: number; commission_chf?: number };
  reservations?: {
    personal_count?: number;
    team_count?: number;
    personal_commission_chf?: number;
    team_commission_chf?: number;
  };
  adjustments?: { amount_chf?: number };
  total_chf?: number;
};

type RestaurantSubscriptionPlan = {
  slug: string;
  name: string;
  price_monthly_chf: number | string;
};

type RestaurantOption = {
  id: string;
  name: string;
  city: string | null;
};

type SignatureCorrectionDraft = {
  planSlug: string;
  restaurantId: string;
};

type SignatureStatusCorrectionDraft = {
  status: "visited" | "in_progress" | "not_interested";
  nextFollowUpAt: string;
  refusalReasonCodes: string[];
  refusalOtherText: string;
};

type AdminCommercialActivity = {
  followups?: CommercialFollowup[];
};

const STATUS_FILTERS = ["all", "visited", "in_progress", "signed", "not_interested"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function toNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatChf(value: unknown) {
  return `${toNumber(value).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Non renseigné";
  return new Date(value).toLocaleDateString("fr-CH");
}

function currentMonthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function statusTone(status: CommercialFollowup["status"]) {
  if (status === "signed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "not_interested") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "in_progress") return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

export default function AdminCommercialAccountDetail({
  account,
  open,
  onOpenChange,
}: {
  account: ManagedCommercialAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [savingRegime, setSavingRegime] = useState(false);
  const [correctingSignatureId, setCorrectingSignatureId] = useState<number | null>(null);
  const [signatureDrafts, setSignatureDrafts] = useState<Record<number, SignatureCorrectionDraft>>({});
  const [signatureStatusDrafts, setSignatureStatusDrafts] = useState<Record<number, SignatureStatusCorrectionDraft>>({});
  const period = useMemo(currentMonthBounds, []);

  useEffect(() => {
    setStatusFilter("all");
    setSignatureDrafts({});
    setSignatureStatusDrafts({});
    setCorrectingSignatureId(null);
  }, [account?.user_id]);

  const followupsQuery = useQuery({
    queryKey: ["admin-commercial-account-followups", account?.user_id],
    enabled: open && Boolean(account?.user_id),
    queryFn: async () => {
      if (!account) return [] as CommercialFollowup[];
      const { data, error } = await (supabase.rpc as any)("get_admin_commercial_activity", {
        p_commercial_user_id: account.user_id,
      });
      if (error) throw error;
      return ((data || {}) as AdminCommercialActivity).followups || [];
    },
  });

  const plansQuery = useQuery({
    queryKey: ["admin-active-restaurant-subscription-plans"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("restaurant_subscription_plans")
        .select("slug,name,price_monthly_chf")
        .eq("is_active", true)
        .in("slug", ["starter", "pro", "premium", "elite"])
        .order("price_monthly_chf", { ascending: true });
      if (error) throw error;
      return (data || []) as RestaurantSubscriptionPlan[];
    },
    staleTime: 60_000,
  });

  const restaurantsQuery = useQuery({
    queryKey: ["admin-real-restaurants-for-commercial-signatures"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("restaurants")
        .select("id,name,city")
        .eq("is_demo", false)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as RestaurantOption[];
    },
    staleTime: 30_000,
  });

  const prospectsQuery = useQuery({
    queryKey: ["commercial-prospects-source"],
    enabled: open,
    queryFn: fetchGenevaCommercialProspects,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const profileQuery = useQuery({
    queryKey: ["admin-commercial-compensation-profile", account?.user_id],
    enabled: open && Boolean(account?.user_id),
    queryFn: async () => {
      if (!account) return null;
      const { data, error } = await supabase
        .from("commercial_compensation_profiles" as any)
        .select("user_id,status,sprint_started_at,engaged_at,employment_active")
        .eq("user_id", account.user_id)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as unknown as CommercialCompensationProfile | null;
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["commercial-compensation-summary", account?.user_id, period.start, period.end],
    enabled: open && Boolean(account?.user_id),
    queryFn: async () => {
      if (!account) return {} as CommercialCompensationSummary;
      const { data, error } = await (supabase.rpc as any)("get_commercial_compensation_summary", {
        p_commercial_user_id: account.user_id,
        p_period_start: period.start,
        p_period_end: period.end,
      });
      if (error) throw error;
      return (data || {}) as CommercialCompensationSummary;
    },
  });

  const followups = useMemo(() => followupsQuery.data || [], [followupsQuery.data]);
  const prospectsById = useMemo(
    () => new Map((prospectsQuery.data || []).map((prospect) => [prospect.sourceObjectId, prospect])),
    [prospectsQuery.data],
  );
  const counts = useMemo(() => followups.reduce((result, row) => {
    if (row.status !== "not_visited") result[row.status] = (result[row.status] || 0) + 1;
    return result;
  }, {} as Record<string, number>), [followups]);
  const filteredFollowups = statusFilter === "all"
    ? followups.filter((row) => row.status !== "not_visited")
    : followups.filter((row) => row.status === statusFilter);
  const summary = summaryQuery.data;
  const reservationCommission = toNumber(summary?.reservations?.personal_commission_chf)
    + toNumber(summary?.reservations?.team_commission_chf);

  async function updateCompensationRegime(status: CommercialCompensationProfile["status"]) {
    if (!account) return;
    setSavingRegime(true);
    try {
      const current = profileQuery.data;
      const employmentActive = status === "engaged" || status === "team_lead";
      const { error } = await supabase
        .from("commercial_compensation_profiles" as any)
        .upsert({
          user_id: account.user_id,
          status,
          sprint_started_at: current?.sprint_started_at || new Date().toISOString().slice(0, 10),
          engaged_at: employmentActive ? (current?.engaged_at || new Date().toISOString().slice(0, 10)) : null,
          employment_active: employmentActive,
        }, { onConflict: "user_id" });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-commercial-compensation-profile", account.user_id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-commercial-compensation-profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["commercial-compensation-summary", account.user_id] }),
      ]);
      toast.success("Régime de rémunération mis à jour par l’administration.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de modifier le régime.");
    } finally {
      setSavingRegime(false);
    }
  }

  function updateSignatureDraft(
    followup: CommercialFollowup,
    patch: Partial<SignatureCorrectionDraft>,
  ) {
    setSignatureDrafts((current) => ({
      ...current,
      [followup.source_objectid]: {
        planSlug: followup.signed_subscription_plan_slug || "",
        restaurantId: followup.signed_restaurant_id || "unlinked",
        ...current[followup.source_objectid],
        ...patch,
      },
    }));
  }

  function updateSignatureStatusDraft(
    followup: CommercialFollowup,
    patch: Partial<SignatureStatusCorrectionDraft>,
  ) {
    setSignatureStatusDrafts((current) => ({
      ...current,
      [followup.source_objectid]: {
        status: "visited",
        nextFollowUpAt: "",
        refusalReasonCodes: [],
        refusalOtherText: "",
        ...current[followup.source_objectid],
        ...patch,
      },
    }));
  }

  async function correctSignature(followup: CommercialFollowup) {
    if (!account) return;

    const draft = signatureDrafts[followup.source_objectid];
    const planSlug = draft?.planSlug || followup.signed_subscription_plan_slug || null;
    const restaurantId = draft?.restaurantId || followup.signed_restaurant_id || "unlinked";
    const reason = window.prompt(
      "Motif de la correction (10 caractères minimum). Il sera conservé dans le journal d’audit :",
    );

    if (reason === null) return;
    if (reason.trim().length < 10) {
      toast.error("Le motif de correction doit contenir au moins 10 caractères.");
      return;
    }

    setCorrectingSignatureId(followup.source_objectid);
    try {
      const { error } = await (supabase.rpc as any)("admin_correct_commercial_signature", {
        p_source_objectid: followup.source_objectid,
        p_plan_slug: planSlug,
        p_restaurant_id: restaurantId === "unlinked" ? null : restaurantId,
        p_reason: reason.trim(),
      });
      if (error) throw error;

      setSignatureDrafts((current) => {
        const next = { ...current };
        delete next[followup.source_objectid];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-commercial-account-followups", account.user_id] }),
        queryClient.invalidateQueries({ queryKey: ["commercial-compensation-summary", account.user_id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-commercial-refusal-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-commercial-commission-summary"] }),
      ]);
      toast.success("Signature corrigée et journalisée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de corriger cette signature.");
    } finally {
      setCorrectingSignatureId(null);
    }
  }

  async function correctSignatureStatus(followup: CommercialFollowup) {
    if (!account) return;

    const draft = signatureStatusDrafts[followup.source_objectid] || {
      status: "visited" as const,
      nextFollowUpAt: "",
      refusalReasonCodes: [],
      refusalOtherText: "",
    };
    if (draft.status === "in_progress" && !draft.nextFollowUpAt) {
      toast.error("Choisissez une date de rappel.");
      return;
    }
    if (draft.status === "not_interested" && draft.refusalReasonCodes.length === 0) {
      toast.error("Sélectionnez au moins un motif de refus.");
      return;
    }
    if (
      draft.status === "not_interested"
      && draft.refusalReasonCodes.includes("other")
      && !draft.refusalOtherText.trim()
    ) {
      toast.error("Précisez le motif « Autre ».");
      return;
    }

    const reason = window.prompt(
      "Pourquoi annulez-vous cette signature ? Motif d’audit obligatoire (10 caractères minimum) :",
    );
    if (reason === null) return;
    if (reason.trim().length < 10) {
      toast.error("Le motif de correction doit contenir au moins 10 caractères.");
      return;
    }

    setCorrectingSignatureId(followup.source_objectid);
    try {
      const { error } = await (supabase.rpc as any)("admin_correct_commercial_signature_status", {
        p_source_objectid: followup.source_objectid,
        p_status: draft.status,
        p_reason: reason.trim(),
        p_next_follow_up_at: draft.status === "in_progress" ? draft.nextFollowUpAt : null,
        p_refusal_reason_codes: draft.status === "not_interested" ? draft.refusalReasonCodes : [],
        p_refusal_other_text: draft.status === "not_interested" ? draft.refusalOtherText.trim() || null : null,
      });
      if (error) throw error;

      setSignatureStatusDrafts((current) => {
        const next = { ...current };
        delete next[followup.source_objectid];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-commercial-account-followups", account.user_id] }),
        queryClient.invalidateQueries({ queryKey: ["commercial-compensation-summary", account.user_id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-commercial-refusal-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-commercial-commission-summary"] }),
      ]);
      toast.success("Signature annulée, commission retirée et correction journalisée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d’annuler cette signature.");
    } finally {
      setCorrectingSignatureId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-1rem)] max-w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-1rem)] overflow-hidden p-0 sm:max-w-6xl sm:rounded-3xl">
        <DialogHeader className="border-b bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 px-6 py-6 text-left text-white">
          <DialogTitle className="text-2xl text-white">{account?.full_name || "Profil commercial"}</DialogTitle>
          <DialogDescription className="text-slate-300">
            Activité terrain, objections et comptabilité du mois en cours dans une seule fiche.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(100dvh-10rem)] space-y-6 overflow-y-auto p-4 sm:p-6">
          <section className="grid gap-4 rounded-2xl border bg-muted/25 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div>
              <p className="text-sm font-semibold">Régime décidé par l’admin</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Le commercial peut consulter sa rémunération, mais ne peut jamais modifier ce réglage.
              </p>
            </div>
            <Select
              value={profileQuery.data?.status || "sprint"}
              onValueChange={(value) => void updateCompensationRegime(value as CommercialCompensationProfile["status"])}
              disabled={savingRegime || profileQuery.isLoading}
            >
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sprint">Sprint de 60 jours</SelectItem>
                <SelectItem value="engaged">Commercial fixe</SelectItem>
                <SelectItem value="team_lead">Responsable commercial</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
              </SelectContent>
            </Select>
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Restaurants suivis</h3>
                <p className="text-sm text-muted-foreground">Toutes les visites et issues enregistrées par ce commercial.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={statusFilter === status ? "default" : "outline"}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status === "all" ? `Tous (${followups.filter((row) => row.status !== "not_visited").length})` : `${getCommercialFollowupStatusLabel(status)} (${counts[status] || 0})`}
                  </Button>
                ))}
              </div>
            </div>

            {followupsQuery.isLoading || prospectsQuery.isLoading ? (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l’activité…
              </div>
            ) : followupsQuery.error || prospectsQuery.error ? (
              <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Impossible de charger l’activité commerciale.
              </div>
            ) : filteredFollowups.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Aucun restaurant dans cette catégorie.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {filteredFollowups.map((followup) => {
                  const prospect = prospectsById.get(followup.source_objectid);
                  const signatureDraft = signatureDrafts[followup.source_objectid];
                  const signatureStatusDraft = signatureStatusDrafts[followup.source_objectid] || {
                    status: "visited" as const,
                    nextFollowUpAt: "",
                    refusalReasonCodes: [],
                    refusalOtherText: "",
                  };
                  const selectedPlanSlug = signatureDraft?.planSlug
                    || followup.signed_subscription_plan_slug
                    || "";
                  const selectedRestaurantId = signatureDraft?.restaurantId
                    || followup.signed_restaurant_id
                    || "unlinked";
                  const signedPlanMissingFromOptions = Boolean(
                    followup.signed_subscription_plan_slug
                    && !(plansQuery.data || []).some((plan) => plan.slug === followup.signed_subscription_plan_slug),
                  );
                  const selectedPlanIsActive = Boolean(
                    selectedPlanSlug
                    && (plansQuery.data || []).some((plan) => plan.slug === selectedPlanSlug),
                  );
                  const linkedRestaurantMissingFromOptions = Boolean(
                    followup.signed_restaurant_id
                    && !(restaurantsQuery.data || []).some((restaurant) => restaurant.id === followup.signed_restaurant_id),
                  );
                  const signatureHasChanges = followup.status === "signed" && (
                    selectedPlanSlug !== (followup.signed_subscription_plan_slug || "")
                    || selectedRestaurantId !== (followup.signed_restaurant_id || "unlinked")
                  );
                  return (
                    <article key={followup.source_objectid} className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{prospect?.name || `Restaurant #${followup.source_objectid}`}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {[prospect?.address, prospect?.commune].filter(Boolean).join(", ") || "Adresse non renseignée"}
                          </p>
                        </div>
                        <Badge variant="outline" className={statusTone(followup.status)}>
                          {getCommercialFollowupStatusLabel(followup.status)}
                        </Badge>
                      </div>

                      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div><dt className="text-muted-foreground">Dernière action</dt><dd className="font-medium">{formatDate(followup.updated_at)}</dd></div>
                        {followup.next_follow_up_at ? <div><dt className="text-muted-foreground">Doit repasser</dt><dd className="font-medium">{formatDate(followup.next_follow_up_at)}</dd></div> : null}
                        {followup.status === "signed" ? <div><dt className="text-muted-foreground">Commission</dt><dd className="font-semibold text-emerald-700">{formatChf(followup.acquisition_commission_chf)}</dd></div> : null}
                        {followup.status === "signed" ? <div><dt className="text-muted-foreground">Offre</dt><dd className="font-medium">{followup.signed_subscription_plan_name || "Non renseignée"}</dd></div> : null}
                      </dl>

                      {followup.refusal_reason_codes?.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {followup.refusal_reason_codes.map((reason) => (
                            <Badge key={reason} variant="secondary" className="whitespace-normal text-left">
                              {getCommercialRefusalReasonLabel(reason)}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {followup.refusal_other_text ? <p className="mt-2 text-xs text-muted-foreground">Autre motif : {followup.refusal_other_text}</p> : null}
                      {followup.notes ? <p className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm">{followup.notes}</p> : null}

                      {followup.status === "signed" ? (
                        <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-400/20 dark:bg-emerald-500/5">
                          <div>
                            <p className="text-sm font-semibold">Correction administrative</p>
                            <p className="text-xs text-muted-foreground">
                              Corrigez l’offre ou associez la signature à un compte restaurant réel. Toute modification exige un motif et reste auditée.
                            </p>
                          </div>

                          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            <div className="min-w-0 space-y-1.5">
                              <p className="text-xs font-medium">Offre signée</p>
                              <Select
                                value={selectedPlanSlug || undefined}
                                onValueChange={(value) => updateSignatureDraft(followup, { planSlug: value })}
                                disabled={plansQuery.isLoading || plansQuery.isError || correctingSignatureId === followup.source_objectid}
                              >
                                <SelectTrigger className="w-full min-w-0 bg-background">
                                  <SelectValue placeholder="Choisir une offre" />
                                </SelectTrigger>
                                <SelectContent>
                                  {signedPlanMissingFromOptions ? (
                                    <SelectItem value={followup.signed_subscription_plan_slug as string} disabled>
                                      {followup.signed_subscription_plan_name || followup.signed_subscription_plan_slug} · inactive
                                    </SelectItem>
                                  ) : null}
                                  {(plansQuery.data || []).map((plan) => (
                                    <SelectItem key={plan.slug} value={plan.slug}>
                                      {plan.name} · {formatChf(plan.price_monthly_chf)}/mois
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="min-w-0 space-y-1.5">
                              <p className="text-xs font-medium">Compte restaurant</p>
                              <Select
                                value={selectedRestaurantId}
                                onValueChange={(value) => updateSignatureDraft(followup, { restaurantId: value })}
                                disabled={restaurantsQuery.isLoading || restaurantsQuery.isError || correctingSignatureId === followup.source_objectid}
                              >
                                <SelectTrigger className="w-full min-w-0 bg-background">
                                  <SelectValue placeholder="Associer un restaurant" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unlinked" disabled={Boolean(followup.signed_restaurant_id)}>
                                    Non associé
                                  </SelectItem>
                                  {linkedRestaurantMissingFromOptions ? (
                                    <SelectItem value={followup.signed_restaurant_id as string}>
                                      Restaurant actuellement associé
                                    </SelectItem>
                                  ) : null}
                                  {(restaurantsQuery.data || []).map((restaurant) => (
                                    <SelectItem key={restaurant.id} value={restaurant.id}>
                                      {restaurant.name}{restaurant.city ? ` · ${restaurant.city}` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {plansQuery.isError || restaurantsQuery.isError ? (
                            <p className="text-xs text-destructive">Les offres ou restaurants disponibles n’ont pas pu être chargés.</p>
                          ) : null}

                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void correctSignature(followup)}
                              disabled={
                                !signatureHasChanges
                                || !selectedPlanIsActive
                                || plansQuery.isLoading
                                || plansQuery.isError
                                || restaurantsQuery.isLoading
                                || restaurantsQuery.isError
                                || correctingSignatureId === followup.source_objectid
                              }
                              className="w-full sm:w-auto"
                            >
                              {correctingSignatureId === followup.source_objectid ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              Enregistrer la correction
                            </Button>
                          </div>

                          <div className="space-y-3 border-t border-emerald-200 pt-3 dark:border-emerald-400/20">
                            <div>
                              <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">Signature enregistrée par erreur</p>
                              <p className="text-xs text-muted-foreground">
                                Remet le restaurant dans le suivi, annule la commission et conserve l’ancienne signature dans le journal d’audit.
                              </p>
                            </div>

                            <Select
                              value={signatureStatusDraft.status}
                              onValueChange={(value) => updateSignatureStatusDraft(followup, {
                                status: value as SignatureStatusCorrectionDraft["status"],
                                nextFollowUpAt: "",
                                refusalReasonCodes: [],
                                refusalOtherText: "",
                              })}
                              disabled={correctingSignatureId === followup.source_objectid}
                            >
                              <SelectTrigger className="w-full bg-background">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="visited">Visité — à requalifier</SelectItem>
                                <SelectItem value="in_progress">À repasser</SelectItem>
                                <SelectItem value="not_interested">Refusé</SelectItem>
                              </SelectContent>
                            </Select>

                            {signatureStatusDraft.status === "in_progress" ? (
                              <div className="space-y-1.5">
                                <p className="text-xs font-medium">Date de rappel</p>
                                <Input
                                  type="date"
                                  min={new Date().toISOString().slice(0, 10)}
                                  value={signatureStatusDraft.nextFollowUpAt}
                                  onChange={(event) => updateSignatureStatusDraft(followup, { nextFollowUpAt: event.target.value })}
                                />
                              </div>
                            ) : null}

                            {signatureStatusDraft.status === "not_interested" ? (
                              <div className="space-y-3 rounded-xl border bg-background p-3">
                                <p className="text-xs font-semibold">Motifs du refus</p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {COMMERCIAL_REFUSAL_REASONS.map((reason) => {
                                    const checked = signatureStatusDraft.refusalReasonCodes.includes(reason.value);
                                    return (
                                      <label key={reason.value} className="flex cursor-pointer items-start gap-2 text-xs">
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={(nextChecked) => updateSignatureStatusDraft(followup, {
                                            refusalReasonCodes: nextChecked === true
                                              ? [...signatureStatusDraft.refusalReasonCodes, reason.value]
                                              : signatureStatusDraft.refusalReasonCodes.filter((code) => code !== reason.value),
                                          })}
                                        />
                                        <span>{reason.label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                                {signatureStatusDraft.refusalReasonCodes.includes("other") ? (
                                  <Input
                                    value={signatureStatusDraft.refusalOtherText}
                                    onChange={(event) => updateSignatureStatusDraft(followup, { refusalOtherText: event.target.value })}
                                    placeholder="Précisez le motif"
                                    maxLength={500}
                                  />
                                ) : null}
                              </div>
                            ) : null}

                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="w-full sm:w-auto"
                                onClick={() => void correctSignatureStatus(followup)}
                                disabled={
                                  correctingSignatureId === followup.source_objectid
                                  || (signatureStatusDraft.status === "in_progress" && !signatureStatusDraft.nextFollowUpAt)
                                  || (signatureStatusDraft.status === "not_interested" && signatureStatusDraft.refusalReasonCodes.length === 0)
                                }
                              >
                                {correctingSignatureId === followup.source_objectid ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Annuler la signature
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4 border-t pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Comptabilité du mois</h3>
                <p className="text-sm text-muted-foreground">Du {formatDate(period.start)} au {formatDate(period.end)}.</p>
              </div>
              {account ? (
                <Button asChild variant="outline" size="sm">
                  <Link to={`/commercial/comptabilite?commercialUserId=${account.user_id}`}>
                    Ouvrir le détail comptable <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>

            {summaryQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calcul en cours…</div>
            ) : summaryQuery.error ? (
              <p className="text-sm text-destructive">La comptabilité de ce commercial est indisponible.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: "Total dû", value: summary?.total_chf, icon: Coins },
                  { label: "Fixe", value: summary?.fixed_salary?.period_chf ?? summary?.fixed_salary?.monthly_chf, icon: CalendarClock },
                  { label: `${toNumber(summary?.signatures?.period_count)} signature(s)`, value: summary?.signatures?.commission_chf, icon: ReceiptText },
                  { label: "Réservations", value: reservationCommission, icon: TrendingUp },
                  { label: "Ajustements", value: summary?.adjustments?.amount_chf, icon: BarChart3 },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-2xl border bg-card p-4">
                    <Icon className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-bold">{formatChf(value)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
