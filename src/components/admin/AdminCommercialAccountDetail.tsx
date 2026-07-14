import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarClock, Coins, ExternalLink, Loader2, ReceiptText, Store, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchGenevaCommercialProspects } from "@/data/genevaCommercialProspects";
import { getSupabase } from "@/integrations/supabase/client";
import {
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
  fixed_salary?: { monthly_chf?: number };
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
  const period = useMemo(currentMonthBounds, []);

  useEffect(() => {
    setStatusFilter("all");
  }, [account?.user_id]);

  const followupsQuery = useQuery({
    queryKey: ["admin-commercial-account-followups", account?.user_id],
    enabled: open && Boolean(account?.user_id),
    queryFn: async () => {
      if (!account) return [] as CommercialFollowup[];
      const { data, error } = await supabase
        .from("commercial_prospect_followups" as any)
        .select("source_objectid,status,notes,assigned_to,last_contacted_by,signed_by,signed_at,signed_subscription_plan_name,acquisition_commission_chf,visited_at,next_follow_up_at,refusal_reason_codes,refusal_other_text,updated_at")
        .or(`assigned_to.eq.${account.user_id},last_contacted_by.eq.${account.user_id},signed_by.eq.${account.user_id}`)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CommercialFollowup[];
    },
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

  const followups = followupsQuery.data || [];
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-6xl sm:rounded-3xl">
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
                  { label: "Fixe", value: summary?.fixed_salary?.monthly_chf, icon: CalendarClock },
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
