import { useMutation } from "@tanstack/react-query";
import { Activity, AlertTriangle, Brain, Clock, ShieldAlert, Ticket, Zap } from "lucide-react";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { runAdminMonitor } from "@/lib/ai/tokAiClient";

type AdminMonitorResult = Awaited<ReturnType<typeof runAdminMonitor>>;
type AdminAiOperationsDraft = {
  action: "health" | "security" | "costs" | "incidents" | "full_report";
  result: AdminMonitorResult | null;
};

const DEFAULT_DRAFT: AdminAiOperationsDraft = {
  action: "health",
  result: null,
};

export default function AdminAiOperations() {
  const [draft, setDraft, clearDraft] = useSessionStorageState<AdminAiOperationsDraft>(
    "tok-admin-ai-operations",
    DEFAULT_DRAFT,
  );
  const action = draft.action;

  const monitorMutation = useMutation({
    mutationFn: () => runAdminMonitor({ action }),
    onSuccess: (data) => setDraft((previous) => ({ ...previous, result: data })),
  });

  const result = draft.result;

  return (
    <div className="container space-y-6 py-8">
      <DashboardPageHero
        badge="IA admin"
        title="Santé IA"
        description="Centre de supervision IA pour coût OpenAI estimé, sécurité, performance, erreurs Supabase Functions, tickets critiques et actions recommandées."
        icon={Brain}
        tone="violet"
        visualLabel="AI Ops"
        stats={[
          { label: "Coût OpenAI estimé", value: result?.metrics?.estimated_ai_cost_chf ? `${result.metrics.estimated_ai_cost_chf} CHF` : "0 CHF", icon: Zap },
          { label: "Temps de réponse moyen", value: result?.average_response_time || "-", icon: Clock },
          { label: "Taux d'escalade humaine", value: result?.human_escalation_rate || "-", icon: Ticket },
        ]}
      />

      <Card>
        <CardContent className="grid gap-3 p-5 md:grid-cols-[260px_auto_1fr]">
          <Select
            value={action}
            onValueChange={(value) => setDraft((previous) => ({
              ...previous,
              action: value as typeof action,
            }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="health">Santé plateforme</SelectItem>
              <SelectItem value="security">Alertes sécurité</SelectItem>
              <SelectItem value="costs">Coûts IA</SelectItem>
              <SelectItem value="incidents">Tickets critiques</SelectItem>
              <SelectItem value="full_report">Rapport complet</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => monitorMutation.mutate()} disabled={monitorMutation.isPending} className="gap-2">
            <Activity className="h-4 w-4" />
            Lancer l'analyse
          </Button>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Utilisateurs abusifs</Badge>
            <Badge variant="secondary">Restaurants avec incidents répétés</Badge>
            <Badge variant="outline">Actions recommandées</Badge>
            {result ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearDraft}>
                Effacer le rapport
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {monitorMutation.error ? <p className="text-sm text-destructive">{monitorMutation.error.message}</p> : null}

      {result ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Santé IA</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{result.healthScore}/100</p>
                <p className="mt-2 text-sm text-muted-foreground">{result.executive_summary}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />Coût OpenAI estimé</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{result.cost_summary}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Erreurs Supabase Functions</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{result.function_errors.join("\n") || "Aucune erreur prioritaire."}</CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-600" />Alertes sécurité</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {result.security_alerts.length > 0 ? result.security_alerts.map((alert) => (
                  <div key={`${alert.label}-${alert.evidence}`} className="rounded-xl border p-3 text-sm">
                    <Badge variant={alert.severity === "critical" || alert.severity === "high" ? "destructive" : "secondary"}>{alert.severity}</Badge>
                    <p className="mt-2 font-semibold">{alert.label}</p>
                    <p className="text-muted-foreground">{alert.evidence}</p>
                  </div>
                )) : <p className="text-sm text-muted-foreground">Aucune alerte sécurité ouverte.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Tickets critiques</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div>{result.critical_tickets.join("\n") || "Aucun ticket critique."}</div>
                <div>{result.abusive_users.join("\n") || "Aucun utilisateur abusif détecté."}</div>
                <div>{result.repeated_incidents_restaurants.join("\n") || "Aucun restaurant avec incidents répétés."}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Actions recommandées</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {result.recommended_actions.map((item) => <li key={item}>- {item}</li>)}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
