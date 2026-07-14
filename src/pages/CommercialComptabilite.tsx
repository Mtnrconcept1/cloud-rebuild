import { useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Coins, Gift, MapPin, PiggyBank, ReceiptText, Store, TrendingUp, Users } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import CommercialWorkspaceChrome from "@/components/commercial/CommercialWorkspaceChrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/integrations/supabase/client";
import {
  fetchGenevaCommercialProspects,
  type GenevaCommercialProspect,
} from "@/data/genevaCommercialProspects";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type CommercialCompensationSummary = {
  commercial_user_id?: string;
  period?: {
    start?: string;
    end?: string;
  };
  profile?: {
    exists?: boolean;
    status?: string;
    employment_active?: boolean;
    sprint_started_at?: string;
    sprint_end_at?: string;
    engaged_at?: string | null;
    team_lead_id?: string | null;
    engagement_eligible?: boolean;
  };
  fixed_salary?: {
    monthly_chf?: number;
    nominal_monthly_chf?: number;
    period_chf?: number;
    rule?: string;
  };
  signatures?: {
    period_count?: number;
    sprint_count?: number;
    target_for_engagement?: number;
    commission_phase?: string;
    commission_chf?: number;
    breakdown?: Array<{
      plan_key?: string;
      plan_name?: string;
      signatures_count?: number;
      commission_chf?: number;
    }>;
  };
  sprint_bonus?: {
    current_best_chf?: number;
    payable_this_period_chf?: number;
    paid_at_sprint_end?: string;
  };
  reservations?: {
    enabled?: boolean;
    tok_base_per_honored_reservation_chf?: number;
    personal_count?: number;
    personal_rate_chf?: number;
    personal_base_chf?: number;
    personal_commission_chf?: number;
    team_count?: number;
    team_rate_chf?: number;
    team_base_chf?: number;
    team_commission_chf?: number;
  };
  adjustments?: {
    amount_chf?: number;
    items?: Array<{
      id?: string;
      kind?: string;
      label?: string;
      amount_chf?: number;
      occurred_at?: string;
      restaurant_id?: string | null;
      source_objectid?: number | null;
      notes?: string | null;
    }>;
  };
  total_chf?: number;
};

type CommercialSignedFollowup = {
  source_objectid: number;
  status?: string | null;
  signed_by?: string | null;
  signed_at?: string | null;
  signed_restaurant_id?: string | null;
  signed_subscription_plan_slug?: string | null;
  signed_subscription_plan_name?: string | null;
  signed_subscription_billing_period?: string | null;
  signed_subscription_monthly_price_chf?: number | null;
  signed_subscription_contract_value_chf?: number | null;
  acquisition_commission_chf?: number | null;
  commercial_compensation_mode?: string | null;
  updated_at?: string | null;
};

type CommercialSignedRestaurant = CommercialSignedFollowup & {
  prospect: GenevaCommercialProspect | null;
};

const ADJUSTMENT_OPTIONS = [
  { value: "manual_bonus", label: "Bonus manuel", defaultAmount: 0 },
  { value: "manual_prime", label: "Prime manuelle", defaultAmount: 0 },
  { value: "upgrade_starter_business", label: "Upgrade Starter vers Business", defaultAmount: 60 },
  { value: "upgrade_business_premium", label: "Upgrade Business vers Premium", defaultAmount: 70 },
  { value: "upgrade_premium_elite", label: "Upgrade Premium vers Elite", defaultAmount: 110 },
  { value: "campaign_pack_100", label: "Pack Campaigns 100 crédits", defaultAmount: 8 },
  { value: "campaign_pack_250", label: "Pack Campaigns 250 crédits", defaultAmount: 18 },
  { value: "ai_growth_pack", label: "Pack AI/Growth", defaultAmount: 5 },
  { value: "correction", label: "Correction comptable", defaultAmount: 0 },
] as const;

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatChf(value: unknown) {
  return `${toNumber(value).toLocaleString("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} CHF`;
}

function formatOptionalChf(value: unknown, fallback = "À qualifier") {
  return value === null || value === undefined || value === "" ? fallback : formatChf(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Non renseigné";
  return new Date(value).toLocaleDateString("fr-CH");
}

function monthBounds(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function profileStatusLabel(status: string | undefined) {
  switch (status) {
    case "engaged":
      return "Commercial engagé";
    case "team_lead":
      return "Responsable commercial";
    case "inactive":
      return "Inactif";
    default:
      return "Sprint 60 jours";
  }
}

function adjustmentOptionLabel(kind: string | undefined) {
  if (kind === "sprint_bonus") return "Ancien suivi de paiement du bonus sprint";
  return ADJUSTMENT_OPTIONS.find((option) => option.value === kind)?.label || kind || "Ajustement";
}

function billingPeriodLabel(value: string | null | undefined) {
  switch (value) {
    case "monthly":
      return "Mensuel";
    case "yearly":
    case "annual":
      return "Annuel";
    default:
      return null;
  }
}

function prospectAddress(prospect: GenevaCommercialProspect | null) {
  if (!prospect) return null;
  return [prospect.address, prospect.postalCode, prospect.locality || prospect.commune]
    .filter(Boolean)
    .join(", ");
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "orange",
}: {
  label: string;
  value: string;
  detail?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "orange" | "emerald" | "sky" | "slate";
}) {
  const toneClass = {
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  }[tone];

  return (
    <div className="rounded-[1.35rem] border bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
      <div className="flex items-center gap-3">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border", toneClass)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
          {detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}

function AdminCompensationAdjustmentForm({ commercialUserId }: { commercialUserId: string }) {
  const { roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = roles.includes("admin");
  const [adjustmentKind, setAdjustmentKind] = useState<(typeof ADJUSTMENT_OPTIONS)[number]["value"]>("manual_bonus");
  const [adjustmentAmount, setAdjustmentAmount] = useState("0");
  const [adjustmentLabel, setAdjustmentLabel] = useState("");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10));
  const selectedAdjustmentOption = ADJUSTMENT_OPTIONS.find((option) => option.value === adjustmentKind) || ADJUSTMENT_OPTIONS[0];

  const addAdjustmentMutation = useMutation({
    mutationFn: async () => {
      if (!isAdmin) throw new Error("Seul un administrateur peut attribuer une prime ou un bonus.");
      const amount = toNumber(adjustmentAmount);
      if (amount === 0) throw new Error("Le montant doit être différent de zéro.");

      const { error } = await (getSupabase().rpc as any)("admin_add_commercial_compensation_adjustment", {
        p_commercial_user_id: commercialUserId,
        p_kind: adjustmentKind,
        p_label: adjustmentLabel.trim() || selectedAdjustmentOption.label,
        p_amount_chf: amount,
        p_occurred_at: `${adjustmentDate}T12:00:00.000Z`,
        p_notes: adjustmentNotes.trim() || null,
        p_restaurant_id: null,
        p_source_objectid: null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Ajustement ajouté", description: "La comptabilité commerciale est mise à jour." });
      setAdjustmentLabel("");
      setAdjustmentNotes("");
      setAdjustmentAmount(String(selectedAdjustmentOption.defaultAmount));
      queryClient.invalidateQueries({ queryKey: ["commercial-compensation-summary"] });
    },
    onError: (error) => {
      toast({
        title: "Ajustement non ajouté",
        description: error instanceof Error ? error.message : "La sauvegarde a échoué.",
        variant: "destructive",
      });
    },
  });

  if (!isAdmin) return null;

  return (
    <div className="rounded-[1.6rem] border bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-orange-600" />
        <h2 className="text-xl font-black">Ajouter bonus, prime ou pack</h2>
      </div>
      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={adjustmentKind}
            onValueChange={(value) => {
              const next = value as typeof adjustmentKind;
              const option = ADJUSTMENT_OPTIONS.find((item) => item.value === next);
              setAdjustmentKind(next);
              setAdjustmentAmount(String(option?.defaultAmount ?? 0));
              setAdjustmentLabel(option?.label || "");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADJUSTMENT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Montant CHF</Label>
            <Input value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={adjustmentDate} onChange={(event) => setAdjustmentDate(event.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Libellé</Label>
          <Input value={adjustmentLabel} onChange={(event) => setAdjustmentLabel(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Notes internes</Label>
          <Textarea value={adjustmentNotes} onChange={(event) => setAdjustmentNotes(event.target.value)} />
        </div>
        <Button
          type="button"
          className="w-full rounded-2xl bg-orange-500 text-white hover:bg-orange-600"
          onClick={() => addAdjustmentMutation.mutate()}
          disabled={addAdjustmentMutation.isPending}
        >
          {addAdjustmentMutation.isPending ? "Ajout..." : "Ajouter à la comptabilité"}
        </Button>
      </div>
    </div>
  );
}

export default function CommercialComptabilite() {
  const { user, roles } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = roles.includes("admin");
  const requestedCommercialUserId = searchParams.get("commercialUserId");
  const commercialUserId = isAdmin ? (requestedCommercialUserId || user?.id || null) : (user?.id || null);
  const [month, setMonth] = useState(currentMonthValue());
  const period = useMemo(() => monthBounds(month), [month]);

  const summaryQuery = useQuery({
    queryKey: ["commercial-compensation-summary", commercialUserId, period.start, period.end],
    enabled: Boolean(commercialUserId),
    queryFn: async () => {
      const { data, error } = await (getSupabase().rpc as any)("get_commercial_compensation_summary", {
        p_commercial_user_id: commercialUserId,
        p_period_start: period.start,
        p_period_end: period.end,
      });

      if (error) throw error;
      return (data || {}) as CommercialCompensationSummary;
    },
  });

  const signedRestaurantsQuery = useQuery({
    queryKey: ["commercial-signed-restaurants", commercialUserId, isAdmin],
    enabled: Boolean(commercialUserId),
    queryFn: async (): Promise<CommercialSignedRestaurant[]> => {
      if (!commercialUserId) return [];

      let followups: CommercialSignedFollowup[] = [];
      if (isAdmin) {
        const { data, error } = await (getSupabase().rpc as any)("get_admin_commercial_activity", {
          p_commercial_user_id: commercialUserId,
        });
        if (error) throw error;
        followups = Array.isArray(data?.followups) ? data.followups : [];
      } else {
        const { data, error } = await (getSupabase()
          .from("commercial_prospect_followups" as any)
          .select(
            "source_objectid,status,signed_by,signed_at,signed_restaurant_id,signed_subscription_plan_slug,signed_subscription_plan_name,signed_subscription_billing_period,signed_subscription_monthly_price_chf,signed_subscription_contract_value_chf,acquisition_commission_chf,commercial_compensation_mode,updated_at",
          )
          .eq("status", "signed")
          .eq("signed_by", commercialUserId) as any);
        if (error) throw error;
        followups = Array.isArray(data) ? data : [];
      }

      const ownSignatures = followups.filter(
        (followup) => followup.status === "signed" && followup.signed_by === commercialUserId,
      );
      const prospects = await fetchGenevaCommercialProspects().catch(() => []);
      const prospectsByObjectId = new Map(prospects.map((prospect) => [prospect.sourceObjectId, prospect]));

      return ownSignatures
        .map((followup) => ({
          ...followup,
          prospect: prospectsByObjectId.get(followup.source_objectid) || null,
        }))
        .sort((left, right) => {
          const leftTime = new Date(left.signed_at || left.updated_at || 0).getTime();
          const rightTime = new Date(right.signed_at || right.updated_at || 0).getTime();
          return rightTime - leftTime;
        });
    },
  });

  const summary = summaryQuery.data;
  const profile = summary?.profile;
  const signatures = summary?.signatures;
  const reservations = summary?.reservations;
  const adjustments = summary?.adjustments?.items || [];
  const signedRestaurants = signedRestaurantsQuery.data || [];
  const sprintCount = toNumber(signatures?.sprint_count);
  const sprintTarget = toNumber(signatures?.target_for_engagement) || 50;
  const sprintProgress = Math.min(100, Math.round((sprintCount / sprintTarget) * 100));

  return (
    <>
      <CommercialWorkspaceChrome activeLabel="Comptabilité" />
      <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,106,26,0.12),transparent_34%),linear-gradient(135deg,#fff7ed_0%,#f8fafc_44%,#eef6ff_100%)] px-4 pb-8 pt-[calc(env(safe-area-inset-top,0px)+5.5rem)] text-slate-950 dark:bg-[radial-gradient(circle_at_top_left,rgba(255,106,26,0.18),transparent_34%),linear-gradient(135deg,#020617_0%,#0f172a_52%,#08111f_100%)] dark:text-white md:px-6 md:pt-[calc(env(safe-area-inset-top,0px)+5rem)]">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[2rem] border border-orange-200/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-orange-400/20 dark:bg-slate-950/75">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <Badge className="rounded-full bg-orange-100 px-3 py-1 text-orange-700 hover:bg-orange-100">
                  {isAdmin ? "Administration des rémunérations" : "Lecture seule"}
                </Badge>
                <h1 className="mt-4 font-serif text-4xl font-black tracking-tight md:text-5xl">
                  Comptabilité commerciale
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                  {isAdmin
                    ? "Consultez la rémunération et attribuez les éventuels bonus, primes ou ajustements depuis votre accès administrateur."
                    : "Consultez vos commissions, votre fixe, vos bonus et vos restaurants signés. Les montants sont calculés côté serveur et ne peuvent pas être modifiés depuis votre compte commercial."}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="commercial-accounting-month">Mois</Label>
                  <Input
                    id="commercial-accounting-month"
                    type="month"
                    value={month}
                    onChange={(event) => setMonth(event.target.value || currentMonthValue())}
                    className="h-11 rounded-2xl bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="rounded-2xl border bg-slate-50 p-3 text-xs dark:border-white/10 dark:bg-white/5">
                  <p className="font-bold uppercase tracking-[0.18em] text-muted-foreground">Commercial</p>
                  <p className="mt-1 break-all font-semibold">
                    {isAdmin ? (commercialUserId || "Non sélectionné") : "Mon compte · lecture seule"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {!isAdmin ? (
            <section
              data-testid="commercial-accounting-readonly"
              className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50/90 p-4 text-sm text-sky-950 dark:border-sky-400/20 dark:bg-sky-950/30 dark:text-sky-100"
            >
              <ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
              <div>
                <p className="font-black">Votre comptabilité est en lecture seule</p>
                <p className="mt-1 leading-6 text-sky-800 dark:text-sky-200">
                  Vous ne pouvez pas vous attribuer de prime, bonus ou correction. Seule l’administration peut enregistrer un ajustement, qui restera visible dans votre historique.
                </p>
              </div>
            </section>
          ) : null}

          {summaryQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-32 rounded-[1.35rem] bg-white/70 shadow-sm dark:bg-white/5" />
              ))}
            </div>
          ) : summaryQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Impossible de charger la comptabilité commerciale.
            </div>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Total période"
                  value={formatChf(summary?.total_chf)}
                  detail={`${formatDate(period.start)} - ${formatDate(period.end)}`}
                  icon={PiggyBank}
                  tone="orange"
                />
                <MetricCard
                  label="Fixe"
                  value={formatChf(summary?.fixed_salary?.period_chf ?? summary?.fixed_salary?.monthly_chf)}
                  detail={summary?.fixed_salary?.rule}
                  icon={Coins}
                  tone="slate"
                />
                <MetricCard
                  label="Signatures"
                  value={formatChf(signatures?.commission_chf)}
                  detail={`${toNumber(signatures?.period_count)} signature(s) sur la période`}
                  icon={ReceiptText}
                  tone="emerald"
                />
                <MetricCard
                  label="Réservations"
                  value={formatChf(toNumber(reservations?.personal_commission_chf) + toNumber(reservations?.team_commission_chf))}
                  detail={`${toNumber(reservations?.personal_count) + toNumber(reservations?.team_count)} réservation(s) honorée(s)`}
                  icon={CalendarClock}
                  tone="sky"
                />
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.6rem] border bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600">Profil</p>
                      <h2 className="mt-2 text-2xl font-black">{profileStatusLabel(profile?.status)}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Sprint du {formatDate(profile?.sprint_started_at)} au {formatDate(profile?.sprint_end_at)}.
                      </p>
                    </div>
                    <Badge variant={profile?.employment_active ? "default" : "outline"} className="w-fit">
                      {profile?.employment_active ? "Rémunération active" : "Sans fixe actif"}
                    </Badge>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                      <span>Objectif engagement</span>
                      <span>{sprintCount}/{sprintTarget} signatures</span>
                    </div>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-500 transition-all"
                        style={{ width: `${sprintProgress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                      <p className="text-xs text-muted-foreground">Bonus palier actuel</p>
                      <p className="text-xl font-black">{formatChf(summary?.sprint_bonus?.current_best_chf)}</p>
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                      <p className="text-xs text-muted-foreground">Payable ce mois</p>
                      <p className="text-xl font-black">{formatChf(summary?.sprint_bonus?.payable_this_period_chf)}</p>
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                      <p className="text-xs text-muted-foreground">Éligibilité fixe</p>
                      <p className="text-xl font-black">{profile?.engagement_eligible ? "Oui" : "Non"}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.6rem] border bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600">Barèmes</p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
                      <p className="font-bold">Sprint signatures</p>
                      <p className="text-muted-foreground">Starter 120, Business 220, Premium 350, Elite 650 CHF.</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
                      <p className="font-bold">Engagé signatures</p>
                      <p className="text-muted-foreground">Starter 60, Business 120, Premium 190, Elite 300 CHF.</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
                      <p className="font-bold">Réservations</p>
                      <p className="text-muted-foreground">0.10 CHF par réservation personnelle honorée. Responsable: 0.05 CHF par réservation équipe.</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[1.6rem] border bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-orange-600" />
                    <h2 className="text-xl font-black">Signatures de la période</h2>
                  </div>
                  <div className="mt-4 space-y-3">
                    {(signatures?.breakdown || []).length > 0 ? (
                      signatures?.breakdown?.map((item) => (
                        <div key={item.plan_key} className="flex items-center justify-between gap-3 rounded-2xl border p-3 text-sm dark:border-white/10">
                          <div>
                            <p className="font-bold">{item.plan_name || item.plan_key}</p>
                            <p className="text-xs text-muted-foreground">{toNumber(item.signatures_count)} signature(s)</p>
                          </div>
                          <p className="font-black">{formatChf(item.commission_chf)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground dark:border-white/10">
                        Aucune signature comptabilisée sur cette période.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-[1.6rem] border bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-orange-600" />
                    <h2 className="text-xl font-black">Réservations rattachées</h2>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border p-4 dark:border-white/10">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Restaurants signés</p>
                      <p className="mt-2 text-2xl font-black">{toNumber(reservations?.personal_count)}</p>
                      <p className="text-sm text-muted-foreground">{formatChf(reservations?.personal_commission_chf)}</p>
                    </div>
                    <div className="rounded-2xl border p-4 dark:border-white/10">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Équipe</p>
                      <p className="mt-2 text-2xl font-black">{toNumber(reservations?.team_count)}</p>
                      <p className="text-sm text-muted-foreground">{formatChf(reservations?.team_commission_chf)}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.6rem] border bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70" aria-labelledby="signed-restaurants-title">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                      <Store className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 id="signed-restaurants-title" className="text-xl font-black">
                        {isAdmin ? "Restaurants signés par ce commercial" : "Mes restaurants signés"}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Historique complet de toutes les signatures, indépendamment du mois sélectionné.
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="w-fit shrink-0 rounded-full px-3 py-1">
                    {signedRestaurants.length} signature{signedRestaurants.length > 1 ? "s" : ""}
                  </Badge>
                </div>

                {signedRestaurantsQuery.isLoading ? (
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {[1, 2].map((item) => (
                      <div key={item} className="h-44 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
                    ))}
                  </div>
                ) : signedRestaurantsQuery.error ? (
                  <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-950/30 dark:text-red-200">
                    Impossible de charger la liste des restaurants signés.
                  </p>
                ) : signedRestaurants.length > 0 ? (
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {signedRestaurants.map((signature) => {
                      const address = prospectAddress(signature.prospect);
                      const billingLabel = billingPeriodLabel(signature.signed_subscription_billing_period);
                      const planName = signature.signed_subscription_plan_name || signature.signed_subscription_plan_slug;

                      return (
                        <article
                          key={signature.source_objectid}
                          className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/5"
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-base font-black text-slate-950 dark:text-white">
                                {signature.prospect?.name || `Restaurant #${signature.source_objectid}`}
                              </p>
                              {signature.prospect?.category ? (
                                <p className="mt-1 break-words text-xs text-muted-foreground">{signature.prospect.category}</p>
                              ) : null}
                            </div>
                            <Badge className="shrink-0 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              Signé
                            </Badge>
                          </div>

                          {address ? (
                            <p className="mt-3 flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
                              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                              <span className="min-w-0 break-words">{address}</span>
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {planName ? <Badge variant="secondary">{planName}</Badge> : null}
                            {billingLabel ? <Badge variant="outline">{billingLabel}</Badge> : null}
                            <Badge variant="outline">
                              {signature.signed_restaurant_id ? "Compte restaurant associé" : "Association admin en attente"}
                            </Badge>
                          </div>

                          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                            <div className="min-w-0">
                              <dt className="text-xs text-muted-foreground">Signature</dt>
                              <dd className="mt-1 break-words font-bold">{formatDate(signature.signed_at)}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-xs text-muted-foreground">Mensuel</dt>
                              <dd className="mt-1 break-words font-bold">{formatOptionalChf(signature.signed_subscription_monthly_price_chf)}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-xs text-muted-foreground">Contrat</dt>
                              <dd className="mt-1 break-words font-bold">{formatOptionalChf(signature.signed_subscription_contract_value_chf)}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-xs text-muted-foreground">Commission</dt>
                              <dd className="mt-1 break-words font-black text-emerald-700 dark:text-emerald-400">
                                {formatOptionalChf(signature.acquisition_commission_chf, "En attente")}
                              </dd>
                            </div>
                          </dl>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-5 rounded-2xl border border-dashed p-5 text-sm text-muted-foreground dark:border-white/10">
                    Aucun restaurant signé pour le moment. Les futures signatures apparaîtront automatiquement ici.
                  </p>
                )}
              </section>

              <section className={cn("grid gap-4", isAdmin && "xl:grid-cols-[0.95fr_1.05fr]")}>
                {isAdmin && commercialUserId ? (
                  <AdminCompensationAdjustmentForm commercialUserId={commercialUserId} />
                ) : null}

                <div className="rounded-[1.6rem] border bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
                  <h2 className="text-xl font-black">Bonus, primes et ajustements</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Total ajustements: {formatChf(summary?.adjustments?.amount_chf)}
                  </p>
                  <div className="mt-4 space-y-3">
                    {adjustments.length > 0 ? (
                      adjustments.map((item) => (
                        <div key={item.id} className="rounded-2xl border p-3 text-sm dark:border-white/10">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold">{item.label || adjustmentOptionLabel(item.kind)}</p>
                              <p className="text-xs text-muted-foreground">
                                {adjustmentOptionLabel(item.kind)} · {formatDate(item.occurred_at)}
                              </p>
                            </div>
                            <p className={cn("font-black", toNumber(item.amount_chf) < 0 ? "text-red-600" : "text-emerald-600")}>
                              {formatChf(item.amount_chf)}
                            </p>
                          </div>
                          {item.notes ? <p className="mt-2 text-xs text-muted-foreground">{item.notes}</p> : null}
                          {item.kind === "sprint_bonus" ? (
                            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                              Marqueur historique : ce montant n’est pas additionné une seconde fois au total.
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground dark:border-white/10">
                        Aucun ajustement sur cette période.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}
