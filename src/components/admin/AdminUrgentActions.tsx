import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Clock, ExternalLink, Loader2, ShieldAlert, UserCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";

const supabase = getSupabase();

type MarketplaceAlert = {
  alert_key: string;
  severity: "critical" | "high" | "medium" | "info" | string;
  status: "new" | "in_progress" | "resolved" | "ignored" | string;
  source: string;
  title: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  recommended_action: string | null;
  last_seen_at: string;
  metadata: Record<string, unknown> | null;
};

type AdminUrgentActionsProps = {
  compact?: boolean;
  title?: string;
  description?: string;
  sourceWhitelist?: string[];
  maxItems?: number;
  emptyLabel?: string;
};

function severityClass(severity: string) {
  switch (severity) {
    case "critical":
      return "border-red-200 bg-red-50 text-red-900";
    case "high":
      return "border-orange-200 bg-orange-50 text-orange-900";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-900";
  }
}

function severityBadgeClass(severity: string) {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "high":
      return "bg-orange-100 text-orange-800";
    case "medium":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("fr-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getMetadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function isClosedAlertStatus(status: string) {
  return status === "resolved" || status === "ignored";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }
  return String(error || "");
}

function isMissingMarketplaceAlertRpc(error: unknown) {
  const message = getErrorMessage(error);
  return message.includes("admin_get_marketplace_alerts")
    || message.includes("admin_reconcile_marketplace_alerts")
    || message.includes("schema cache")
    || message.includes("Could not find the function");
}

function getAdminUrgentActionsErrorMessage(error: unknown) {
  const message = getErrorMessage(error);

  if (isMissingMarketplaceAlertRpc(error)) {
    return "Impossible de charger les actions urgentes. Vérifiez la migration `admin_get_marketplace_alerts`.";
  }

  if (message.includes("42501") || message.includes("Admin access required") || message.includes("permission denied")) {
    return "Accès admin requis pour charger les actions urgentes.";
  }

  return "Impossible de charger les actions urgentes. Vérifiez les logs Supabase ou réessayez.";
}

function logSkippedReconciliation(error: unknown) {
  const message = getErrorMessage(error);
  console.warn("[admin] marketplace alert reconciliation skipped", message || error);
}

async function reconcileAlerts() {
  const { error } = await (supabase.rpc as any)("admin_reconcile_marketplace_alerts");
  if (error) logSkippedReconciliation(error);
}

async function fetchAlerts(includeResolved: boolean) {
  await reconcileAlerts();
  const { data, error } = await (supabase.rpc as any)("admin_get_marketplace_alerts", {
    p_include_resolved: includeResolved,
  });
  if (error) throw error;
  return (data || []) as MarketplaceAlert[];
}

export default function AdminUrgentActions({
  compact = false,
  title = "Actions urgentes marketplace",
  description = "File unifiée des incidents critiques : commandes, paiements, dispatch, réservations, restaurants, campagnes et Edge Functions.",
  sourceWhitelist,
  maxItems,
  emptyLabel = "Aucune alerte prioritaire ouverte avec ces filtres.",
}: AdminUrgentActionsProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [includeResolved, setIncludeResolved] = useState(false);
  const [noteByAlert, setNoteByAlert] = useState<Record<string, string>>({});
  const [takingAlertKey, setTakingAlertKey] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(!compact);

  const { data: alerts = [], isLoading, error } = useQuery({
    queryKey: ["admin-marketplace-alerts", includeResolved],
    queryFn: () => fetchAlerts(includeResolved),
    refetchOnWindowFocus: false,
  });

  const updateAlertMutation = useMutation({
    mutationFn: async ({ alertKey, status, note }: { alertKey: string; status: string; note?: string }) => {
      const { error: rpcError } = await (supabase.rpc as any)("admin_update_marketplace_alert", {
        p_alert_key: alertKey,
        p_status: status,
        p_note: note || null,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-alerts"] });
      toast({ title: "Alerte mise à jour", description: "Le traitement a été enregistré dans l'audit admin." });
    },
    onError: (mutationError: Error) => {
      toast({ title: "Action impossible", description: mutationError.message, variant: "destructive" });
    },
  });

  const takeAlertMutation = useMutation({
    mutationFn: async ({ alertKey }: { alertKey: string }) => {
      const { error: rpcError } = await (supabase.rpc as any)("admin_take_marketplace_alert", {
        p_alert_key: alertKey,
      });
      if (rpcError) throw rpcError;
    },
    onMutate: ({ alertKey }) => {
      setTakingAlertKey(alertKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-alerts"] });
      toast({ title: "Alerte prise en charge", description: "L'alerte est maintenant marquée en cours à votre nom." });
    },
    onError: (mutationError: Error) => {
      toast({ title: "Prise impossible", description: mutationError.message, variant: "destructive" });
    },
    onSettled: () => {
      setTakingAlertKey(null);
    },
  });

  const scopedAlerts = useMemo(() => {
    if (!sourceWhitelist?.length) return alerts;
    const allowedSources = new Set(sourceWhitelist);
    return alerts.filter((alert) => allowedSources.has(alert.source));
  }, [alerts, sourceWhitelist]);

  const sources = useMemo(() => Array.from(new Set(scopedAlerts.map((alert) => alert.source).filter(Boolean))).sort(), [scopedAlerts]);
  const filteredAlerts = useMemo(() => scopedAlerts.filter((alert) => {
    const term = search.trim().toLowerCase();
    if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
    if (sourceFilter !== "all" && alert.source !== sourceFilter) return false;
    if (statusFilter === "open" && ["resolved", "ignored"].includes(alert.status)) return false;
    if (statusFilter !== "all" && statusFilter !== "open" && alert.status !== statusFilter) return false;
    if (term) {
      const haystack = [
        alert.title,
        alert.description,
        alert.recommended_action,
        alert.source,
        alert.entity_type,
        alert.entity_id,
        JSON.stringify(alert.metadata || {}),
      ].join(" ").toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  }), [scopedAlerts, search, severityFilter, sourceFilter, statusFilter]);

  const counters = useMemo(() => ({
    critical: scopedAlerts.filter((alert) => alert.severity === "critical").length,
    high: scopedAlerts.filter((alert) => alert.severity === "high").length,
    open: scopedAlerts.filter((alert) => !["resolved", "ignored"].includes(alert.status)).length,
  }), [scopedAlerts]);

  function updateAlert(alert: MarketplaceAlert, status: "in_progress" | "resolved" | "ignored") {
    const note = (noteByAlert[alert.alert_key] || "").trim();
    if (["resolved", "ignored"].includes(status) && !note) return;

    if (["resolved", "ignored"].includes(status)) {
      const confirmed = window.confirm(
        `Confirmer l'action "${status}" pour cette alerte ? La note admin sera enregistrée dans l'audit.`,
      );
      if (!confirmed) return;
    }

    updateAlertMutation.mutate({ alertKey: alert.alert_key, status, note });
  }

  function takeAlert(alert: MarketplaceAlert) {
    if (isClosedAlertStatus(alert.status)) return;
    takeAlertMutation.mutate({ alertKey: alert.alert_key });
  }

  const visibleAlerts = filteredAlerts.slice(0, maxItems ?? (compact ? 6 : 20));
  const summaryAlerts = visibleAlerts.slice(0, 3);
  const collapsed = compact && !isExpanded;

  return (
    <Card className={`border-red-200 bg-gradient-to-br from-red-50 via-background to-background ${compact ? "overflow-hidden" : ""}`}>
      <CardHeader className={compact ? "p-4" : undefined}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <button
            type="button"
            onClick={() => compact && setIsExpanded((value) => !value)}
            className={`min-w-0 text-left ${compact ? "rounded-xl transition-colors hover:bg-background/60" : ""}`}
            aria-expanded={isExpanded}
          >
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              <span className="text-lg font-semibold leading-none tracking-tight">{title}</span>
              {compact ? (
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              ) : null}
            </span>
            <span className={compact ? "mt-1 block line-clamp-1 text-sm text-muted-foreground" : "block text-sm text-muted-foreground"}>
              {description}
            </span>
          </button>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-red-100 text-red-800">{counters.critical} critiques</Badge>
            <Badge className="bg-orange-100 text-orange-800">{counters.high} hautes</Badge>
            <Badge variant="secondary">{counters.open} ouvertes</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className={compact ? "space-y-3 px-4 pb-4 pt-0" : "space-y-4"}>
        {collapsed ? (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="w-full rounded-2xl border bg-background/80 p-4 text-left shadow-sm transition-colors hover:border-red-200 hover:bg-white"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Résumé urgent</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isLoading
                    ? "Chargement des alertes prioritaires..."
                    : error
                      ? getAdminUrgentActionsErrorMessage(error)
                      : summaryAlerts.length > 0
                        ? `${summaryAlerts.length} action(s) prioritaire(s) visibles. Cliquez pour traiter.`
                        : emptyLabel}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">Déplier</Badge>
            </div>
            {!isLoading && !error && summaryAlerts.length > 0 ? (
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {summaryAlerts.map((alert) => (
                  <div key={alert.alert_key} className={`rounded-xl border px-3 py-2 ${severityClass(alert.severity)}`}>
                    <div className="flex items-center gap-2">
                      <Badge className={severityBadgeClass(alert.severity)}>{alert.severity}</Badge>
                      <span className="truncate text-xs font-medium">{alert.source}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-semibold">{alert.title}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </button>
        ) : (
          <>
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_220px_180px_auto]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher restaurant, client, ville, statut ou identifiant"
          />
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger><SelectValue placeholder="Gravité" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les gravités</SelectItem>
              <SelectItem value="critical">Critique</SelectItem>
              <SelectItem value="high">Haute</SelectItem>
              <SelectItem value="medium">Moyenne</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les sources</SelectItem>
              {sources.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value);
              if (["all", "resolved", "ignored"].includes(value)) {
                setIncludeResolved(true);
              }
            }}
          >
            <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Ouvertes</SelectItem>
              <SelectItem value="new">Nouvelles</SelectItem>
              <SelectItem value="in_progress">En cours</SelectItem>
              <SelectItem value="resolved">Résolues</SelectItem>
              <SelectItem value="ignored">Ignorées</SelectItem>
              <SelectItem value="all">Tous</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setIncludeResolved((value) => !value)}>
              {includeResolved ? "Masquer l'historique" : "Inclure résolues/ignorées"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-marketplace-alerts"] })}>
              Rafraîchir
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des alertes...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {getAdminUrgentActionsErrorMessage(error)}
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> {emptyLabel}
          </div>
        ) : (
          <div className={compact ? "grid gap-3" : "grid gap-3 xl:grid-cols-2"}>
            {visibleAlerts.map((alert, index) => {
              const note = noteByAlert[alert.alert_key] || "";
              const handledBy = alert.status === "in_progress" ? getMetadataString(alert.metadata, "handled_by") : null;
              const handledAt = alert.status === "in_progress" ? getMetadataString(alert.metadata, "handled_at") : null;
              const isTakenByCurrentAdmin = Boolean(handledBy && user?.id && handledBy === user.id);
              const isTakenByOtherAdmin = Boolean(handledBy && (!user?.id || handledBy !== user.id));
              const isTakingThisAlert = takingAlertKey === alert.alert_key && takeAlertMutation.isPending;
              const takeButtonLabel = isTakingThisAlert
                ? "Prise..."
                : isTakenByCurrentAdmin
                  ? "Pris"
                  : isTakenByOtherAdmin
                    ? "Déjà pris"
                    : "Prendre";
              const takeStatusLabel = isTakenByCurrentAdmin
                ? `Pris par moi${handledAt ? ` le ${formatDateTime(handledAt)}` : ""}`
                : isTakenByOtherAdmin
                  ? `Pris par un autre admin${handledAt ? ` le ${formatDateTime(handledAt)}` : ""}`
                  : null;
              const actionDisabledByClaim = isTakenByOtherAdmin || updateAlertMutation.isPending;
              return (
                <div key={`${alert.alert_key}-${index}`} className={`rounded-xl border p-4 ${severityClass(alert.severity)}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={severityBadgeClass(alert.severity)}>{alert.severity}</Badge>
                        <Badge variant="outline">{alert.status}</Badge>
                        <Badge variant="secondary">{alert.source}</Badge>
                      </div>
                      <p className="font-semibold leading-5">{alert.title}</p>
                      {alert.description ? <p className="text-sm opacity-90">{alert.description}</p> : null}
                      {alert.recommended_action ? (
                        <p className="text-xs font-medium">Action recommandée : {alert.recommended_action}</p>
                      ) : null}
                      <p className="flex items-center gap-1 text-xs opacity-70">
                        <Clock className="h-3 w-3" /> Dernier signal : {formatDateTime(alert.last_seen_at)}
                      </p>
                      {takeStatusLabel ? (
                        <p className="flex items-center gap-1 text-xs font-medium opacity-80">
                          <UserCheck className="h-3 w-3" /> {takeStatusLabel}
                        </p>
                      ) : null}
                    </div>
                    {alert.action_url ? (
                      <Button type="button" size="sm" variant="secondary" onClick={() => navigate(alert.action_url || "/admin")} className="gap-2">
                        Ouvrir <ExternalLink className="h-3 w-3" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
                    <Input
                      value={note}
                      onChange={(event) => setNoteByAlert((previous) => ({ ...previous, [alert.alert_key]: event.target.value }))}
                      placeholder="Note admin obligatoire pour résoudre/ignorer"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => takeAlert(alert)}
                      disabled={isTakingThisAlert || isTakenByCurrentAdmin || isTakenByOtherAdmin || isClosedAlertStatus(alert.status)}
                      className="gap-2"
                    >
                      {isTakingThisAlert ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                      {takeButtonLabel}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => updateAlert(alert, "ignored")} disabled={!note.trim() || actionDisabledByClaim}>
                      Ignorer
                    </Button>
                    <Button type="button" onClick={() => updateAlert(alert, "resolved")} disabled={!note.trim() || actionDisabledByClaim}>
                      Résoudre
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
