import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

async function fetchAlerts(includeResolved: boolean) {
  const { data, error } = await (supabase.rpc as any)("admin_get_marketplace_alerts", {
    p_include_resolved: includeResolved,
  });
  if (error) throw error;
  return (data || []) as MarketplaceAlert[];
}

export default function AdminUrgentActions({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [includeResolved, setIncludeResolved] = useState(false);
  const [noteByAlert, setNoteByAlert] = useState<Record<string, string>>({});

  const { data: alerts = [], isLoading, error } = useQuery({
    queryKey: ["admin-marketplace-alerts", includeResolved],
    queryFn: () => fetchAlerts(includeResolved),
    refetchInterval: 20_000,
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

  const sources = useMemo(() => Array.from(new Set(alerts.map((alert) => alert.source).filter(Boolean))).sort(), [alerts]);
  const filteredAlerts = useMemo(() => alerts.filter((alert) => {
    if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
    if (sourceFilter !== "all" && alert.source !== sourceFilter) return false;
    return true;
  }), [alerts, severityFilter, sourceFilter]);

  const counters = useMemo(() => ({
    critical: alerts.filter((alert) => alert.severity === "critical").length,
    high: alerts.filter((alert) => alert.severity === "high").length,
    open: alerts.filter((alert) => !["resolved", "ignored"].includes(alert.status)).length,
  }), [alerts]);

  return (
    <Card className="border-red-200 bg-gradient-to-br from-red-50 via-background to-background">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              <CardTitle>Actions urgentes marketplace</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              File unifiée des incidents critiques : commandes, paiements, dispatch, réservations, restaurants, campagnes et Edge Functions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-red-100 text-red-800">{counters.critical} critiques</Badge>
            <Badge className="bg-orange-100 text-orange-800">{counters.high} hautes</Badge>
            <Badge variant="secondary">{counters.open} ouvertes</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[180px_220px_auto]">
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
            Impossible de charger les actions urgentes. Vérifiez la migration `admin_get_marketplace_alerts`.
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Aucune alerte prioritaire ouverte avec ces filtres.
          </div>
        ) : (
          <div className={compact ? "grid gap-3" : "grid gap-3 xl:grid-cols-2"}>
            {filteredAlerts.slice(0, compact ? 6 : 20).map((alert) => {
              const note = noteByAlert[alert.alert_key] || "";
              return (
                <div key={alert.alert_key} className={`rounded-xl border p-4 ${severityClass(alert.severity)}`}>
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
                    <Button type="button" variant="outline" onClick={() => updateAlertMutation.mutate({ alertKey: alert.alert_key, status: "in_progress", note })}>
                      Prendre
                    </Button>
                    <Button type="button" variant="outline" onClick={() => updateAlertMutation.mutate({ alertKey: alert.alert_key, status: "ignored", note })} disabled={!note.trim()}>
                      Ignorer
                    </Button>
                    <Button type="button" onClick={() => updateAlertMutation.mutate({ alertKey: alert.alert_key, status: "resolved", note })} disabled={!note.trim()}>
                      Résoudre
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
