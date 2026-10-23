import { useQuery } from "@tanstack/react-query";
import { Activity, Bot, CreditCard, ScrollText, ShieldAlert } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase } from "@/integrations/supabase/client";
import { getGuardianOverview } from "@/lib/tokIntelligence";
import AdminAuditLogs from "./AdminAuditLogs";
import AdminGuardian from "./AdminGuardian";

type View = "overview" | "audit" | "guardian";
type Health = {
  status?: "ok" | "watch" | "critical";
  score?: number;
  counts?: { critical?: number; watch?: number };
};
type Payment = { status?: string; total?: number; critical?: number };
type Abuse = { status?: string; counts?: { critical?: number; watch?: number } };

const tabs: Array<{ id: View; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Supervision", icon: Activity },
  { id: "audit", label: "Journaux et preuves", icon: ScrollText },
  { id: "guardian", label: "Guardian IA", icon: Bot },
];

export default function AdminSecurityCenter() {
  const [params, setParams] = useSearchParams();
  const viewParam = params.get("view");
  const view: View = viewParam === "audit" || viewParam === "guardian" ? viewParam : "overview";
  const supabase = getSupabase();

  const health = useQuery({
    queryKey: ["admin-production-health"],
    enabled: view === "overview",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_production_health" as never);
      if (error) throw error;
      return data as Health;
    },
  });
  const payments = useQuery({
    queryKey: ["payment-integrity-anomalies", 48],
    enabled: view === "overview",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_payment_integrity_anomalies" as never, { p_hours: 48 } as never);
      if (error) throw error;
      return data as Payment;
    },
  });
  const abuse = useQuery({
    queryKey: ["admin-security-abuse-summary", 24],
    enabled: view === "overview",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_security_abuse_summary" as never, { p_hours: 24 } as never);
      if (error) throw error;
      return data as Abuse;
    },
  });
  const guardian = useQuery({
    queryKey: ["guardian-overview"],
    enabled: view === "overview",
    queryFn: getGuardianOverview,
  });

  const go = (next: View, incidentId?: string) => {
    setParams((previous) => {
      const updated = new URLSearchParams(previous);
      updated.set("view", next);
      updated.delete("function");
      updated.delete("incident");
      if (incidentId && next === "guardian") updated.set("incident", incidentId);
      return updated;
    });
  };

  return (
    <div className="container space-y-5 py-6">
      <header className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 text-primary">
          <ShieldAlert className="h-5 w-5" />
          <span className="text-sm font-semibold">Administration TOK</span>
        </div>
        <h1 className="mt-2 font-dashboard text-2xl font-bold">Centre de sécurité</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Surveillance, preuves et assistance à la résolution. Les correctifs sont préparés
          sur une branche isolée après votre approbation renforcée, jamais appliqués directement en production.
        </p>
        <nav aria-label="Sections du centre de sécurité" className="mt-5 flex flex-wrap gap-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              variant={view === id ? "default" : "outline"}
              size="sm"
              aria-current={view === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </Button>
          ))}
        </nav>
      </header>

      {view === "audit" ? <AdminAuditLogs embedded /> : null}
      {view === "guardian" ? <AdminGuardian embedded /> : null}
      {view === "overview" ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Santé production</CardTitle></CardHeader>
              <CardContent>
                {health.isError ? <p role="alert" className="text-sm text-destructive">État indisponible, vérifier les journaux.</p> : (
                  <>
                    <p className="text-2xl font-bold">{health.data?.score ?? "—"}/100</p>
                    <Badge variant={health.data?.status === "critical" ? "destructive" : "secondary"}>{health.data?.status || "Non vérifié"}</Badge>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Alertes de sécurité</CardTitle></CardHeader>
              <CardContent>
                {abuse.isError ? <p role="alert" className="text-sm text-destructive">État indisponible.</p> : (
                  <>
                    <p className="text-2xl font-bold">{abuse.data?.counts?.critical ?? "—"}</p>
                    <span className="text-xs text-muted-foreground">Alertes critiques</span>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><CreditCard className="h-4 w-4" />Paiements</CardTitle></CardHeader>
              <CardContent>
                {payments.isError ? <p role="alert" className="text-sm text-destructive">État indisponible.</p> : (
                  <>
                    <p className="text-2xl font-bold">{payments.data?.critical ?? "—"}</p>
                    <span className="text-xs text-muted-foreground">Anomalies critiques sur 48 h</span>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Incidents techniques</CardTitle></CardHeader>
              <CardContent>
                {guardian.isError ? <p role="alert" className="text-sm text-destructive">État indisponible : ne pas conclure à l'absence d'incident.</p> : (
                  <>
                    <p className="text-2xl font-bold">{guardian.data?.incidents.length ?? "—"}</p>
                    <span className="text-xs text-muted-foreground">Incidents suivis par Guardian</span>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />Incidents à examiner</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {guardian.isLoading ? <p className="text-sm text-muted-foreground">Chargement sécurisé des incidents…</p> : null}
              {guardian.isError ? <p role="alert" className="text-sm text-destructive">La file d'incidents n'a pas pu être chargée.</p> : null}
              {guardian.data?.incidents.slice(0, 8).map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => go("guardian", incident.id)}
                  className="flex w-full items-center justify-between gap-4 rounded-lg border p-3 text-left hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{incident.title}</span>
                    <span className="text-xs text-muted-foreground">{incident.summary}</span>
                  </span>
                  <Badge variant={incident.severity === "critical" ? "destructive" : "secondary"}>{incident.severity}</Badge>
                </button>
              ))}
              {guardian.data && guardian.data.incidents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun incident actif dans la file consultée.</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => go("audit")}>Consulter les preuves</Button>
                <Button type="button" variant="outline" onClick={() => go("guardian")}>Ouvrir Guardian IA</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
