import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Brain, FileDown, LineChart, Receipt, Store } from "lucide-react";

import { AccountingHero } from "@/components/invoices/AccountingCockpit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiLoadingState } from "@/components/ui/ai-loading-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { formatAccountingAiResultForDisplay } from "@/lib/ai/accountingPublicCopy";
import { runAccountingAgent } from "@/lib/ai/tokAiClient";

type AccountingResult = Awaited<ReturnType<typeof runAccountingAgent>>;
type AccountingDraft = {
  month: string;
  action: "monthly_summary" | "invoice_anomalies" | "revenue_forecast" | "margin_review";
  result: AccountingResult | null;
};

const DEFAULT_DRAFT: AccountingDraft = {
  month: new Date().toISOString().slice(0, 7),
  action: "monthly_summary",
  result: null,
};

const ACTION_LABELS: Record<AccountingDraft["action"], string> = {
  monthly_summary: "Résumé mensuel",
  invoice_anomalies: "Anomalies factures",
  revenue_forecast: "Prévision CA",
  margin_review: "Marge par restaurant",
};

const METRIC_LABELS: Record<string, string> = {
  order_count: "Commandes analysées",
  gross_revenue_chf: "Chiffre d'affaires brut",
  invoice_total_chf: "Factures identifiées",
  estimated_tok_commission_chf: "Commission TOK estimée",
  estimated_restaurant_payout_chf: "Versement restaurant estimé",
  ai_cost_chf: "Coût IA estimé",
};

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "rapport";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadAiAccountingMarkdown(result: AccountingResult, month: string, action: AccountingDraft["action"]) {
  const publicResult = formatAccountingAiResultForDisplay(result);
  const markdown = publicResult.export_markdown || [
    `# Rapport comptabilité IA TOK - ${month}`,
    "",
    `Analyse: ${ACTION_LABELS[action]}`,
    "",
    "## Résumé",
    publicResult.summary,
    "",
    "## Prévision CA",
    publicResult.revenue_forecast,
    "",
    "## Recommandations",
    ...publicResult.recommended_actions.map((item) => `- ${item}`),
  ].join("\n");

  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tok-compta-ia-${sanitizeFilePart(month)}-${sanitizeFilePart(ACTION_LABELS[action])}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportAiAccountingPdf(result: AccountingResult, month: string, action: AccountingDraft["action"]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const publicResult = formatAccountingAiResultForDisplay(result);
  const anomalies = publicResult.anomalies
    .map((item) => `<li><strong>${escapeHtml(item.severity)} - ${escapeHtml(item.label)}</strong><br />${escapeHtml(item.evidence)}</li>`)
    .join("");
  const recommendations = publicResult.recommended_actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const marginNotes = publicResult.margin_notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  printWindow.document.write(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Rapport comptabilité IA TOK - ${escapeHtml(month)}</title>
    <style>
      body { color: #111827; font-family: Arial, sans-serif; line-height: 1.5; margin: 32px; }
      h1 { font-size: 24px; margin-bottom: 4px; }
      h2 { border-bottom: 1px solid #e5e7eb; font-size: 16px; margin-top: 24px; padding-bottom: 6px; }
      .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
      li { margin-bottom: 8px; }
      pre { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>Rapport comptabilité IA TOK</h1>
    <div class="meta">Période ${escapeHtml(month)} · ${escapeHtml(ACTION_LABELS[action])} · Brouillon audité</div>
    <h2>Résumé</h2>
    <p>${escapeHtml(publicResult.summary)}</p>
    <h2>Prévision CA</h2>
    <p>${escapeHtml(publicResult.revenue_forecast)}</p>
    <h2>Anomalies factures</h2>
    <ul>${anomalies || "<li>Aucune anomalie prioritaire.</li>"}</ul>
    <h2>Marge et risques</h2>
    <ul>${marginNotes || "<li>Aucune note de marge.</li>"}</ul>
    <h2>Actions recommandées</h2>
    <ul>${recommendations || "<li>Aucune action recommandée.</li>"}</ul>
    <h2>Export synthèse</h2>
    <pre>${escapeHtml(publicResult.export_markdown || "")}</pre>
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  const print = printWindow.print || window.print;
  print.call(printWindow);
}

function formatMetricValue(value: unknown) {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "string") return value;
  if (value == null) return "Non disponible";
  return String(value);
}

function getDisplayMetricEntries(metrics: AccountingResult["metrics"]) {
  return Object.entries(metrics || {})
    .filter(([key]) => key in METRIC_LABELS)
    .map(([key, value]) => ({
      label: METRIC_LABELS[key],
      value: formatMetricValue(value),
    }));
}

export default function AdminComptaAi() {
  const [draft, setDraft, clearDraft] = useSessionStorageState<AccountingDraft>(
    "tok-admin-compta-ai",
    DEFAULT_DRAFT,
  );
  const { month, action } = draft;

  const accountingMutation = useMutation({
    mutationFn: () => runAccountingAgent({ action, month }),
    onSuccess: (data) => setDraft((previous) => ({ ...previous, result: data })),
  });

  const result = draft.result;
  const displayResult = result ? formatAccountingAiResultForDisplay(result) : null;
  const displayMetrics = displayResult ? getDisplayMetricEntries(displayResult.metrics) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <AccountingHero
        badge="IA comptabilité"
        title="Comptabilité intelligente"
        description="Synthèses, anomalies, impayés, prévision CA, marge par restaurant et coût IA par restaurant restent en brouillon audité."
        actions={(
          <Button onClick={() => accountingMutation.mutate()} disabled={accountingMutation.isPending} className="gap-2">
            <Brain className={accountingMutation.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            {accountingMutation.isPending ? "Analyse en cours..." : "Générer l'analyse"}
          </Button>
        )}
      />

      <Card>
        <CardContent className="grid gap-3 p-5 md:grid-cols-[220px_280px_1fr]">
          <Input
            value={month}
            onChange={(event) => setDraft((previous) => ({ ...previous, month: event.target.value }))}
            placeholder="2026-06"
          />
          <Select
            value={action}
            onValueChange={(value) => setDraft((previous) => ({
              ...previous,
              action: value as typeof action,
            }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly_summary">Résumé mensuel</SelectItem>
              <SelectItem value="invoice_anomalies">Anomalies factures</SelectItem>
              <SelectItem value="revenue_forecast">Prévision CA</SelectItem>
              <SelectItem value="margin_review">Marge par restaurant</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">Factures impayées</Badge>
            <Badge variant="secondary">Restaurants à risque</Badge>
            <Badge variant="outline">Commission TOK estimée</Badge>
            <Badge variant="outline">Export synthèse</Badge>
            {result ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearDraft}>
                Effacer l'analyse
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {accountingMutation.error ? <p className="text-sm text-destructive">{accountingMutation.error.message}</p> : null}

      {accountingMutation.isPending ? (
        <AiLoadingState
          title="Génération du rapport comptabilité IA"
          description="Lecture des factures, anomalies, prévisions et recommandations avant export."
          steps={["Factures", "Anomalies", "Prévision", "Synthèse"]}
        />
      ) : null}

      {displayResult ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Résumé mensuel</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{displayResult.summary}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><LineChart className="h-5 w-5" />Prévision CA</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{displayResult.revenue_forecast}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" />Coût IA par restaurant</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {displayMetrics.length > 0 ? displayMetrics.map((metric) => (
                  <div key={metric.label} className="flex items-center justify-between gap-3">
                    <span>{metric.label}</span>
                    <span className="font-semibold text-foreground">{metric.value}</span>
                  </div>
                )) : "Aucune métrique disponible."}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" />Anomalies factures</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {displayResult.anomalies.length > 0 ? displayResult.anomalies.map((anomaly) => (
                <div key={`${anomaly.label}-${anomaly.evidence}`} className="rounded-xl border p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant={anomaly.severity === "high" ? "destructive" : "secondary"}>{anomaly.severity}</Badge>
                    <span className="font-semibold">{anomaly.label}</span>
                  </div>
                  <p className="text-muted-foreground">{anomaly.evidence}</p>
                </div>
              )) : <p className="text-sm text-muted-foreground">Aucune anomalie prioritaire.</p>}
              <Button type="button" variant="outline" className="gap-2" onClick={() => downloadAiAccountingMarkdown(displayResult, month, action)}>
                <FileDown className="h-4 w-4" />
                Export synthèse
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={() => exportAiAccountingPdf(displayResult, month, action)}>
                <FileDown className="h-4 w-4" />
                Export PDF
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
