import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Brain, FileDown, LineChart, Receipt, Store } from "lucide-react";

import { AccountingHero } from "@/components/invoices/AccountingCockpit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
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
  const markdown = result.export_markdown || [
    `# Rapport comptabilité IA TOK - ${month}`,
    "",
    `Action: ${action}`,
    "",
    "## Résumé",
    result.summary,
    "",
    "## Prévision CA",
    result.revenue_forecast,
    "",
    "## Recommandations",
    ...result.recommended_actions.map((item) => `- ${item}`),
  ].join("\n");

  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tok-compta-ia-${sanitizeFilePart(month)}-${sanitizeFilePart(action)}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportAiAccountingPdf(result: AccountingResult, month: string, action: AccountingDraft["action"]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const anomalies = result.anomalies
    .map((item) => `<li><strong>${escapeHtml(item.severity)} - ${escapeHtml(item.label)}</strong><br />${escapeHtml(item.evidence)}</li>`)
    .join("");
  const recommendations = result.recommended_actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const marginNotes = result.margin_notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

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
    <div class="meta">Période ${escapeHtml(month)} · ${escapeHtml(action)} · Brouillon audité</div>
    <h2>Résumé</h2>
    <p>${escapeHtml(result.summary)}</p>
    <h2>Prévision CA</h2>
    <p>${escapeHtml(result.revenue_forecast)}</p>
    <h2>Anomalies factures</h2>
    <ul>${anomalies || "<li>Aucune anomalie prioritaire.</li>"}</ul>
    <h2>Marge et risques</h2>
    <ul>${marginNotes || "<li>Aucune note de marge.</li>"}</ul>
    <h2>Actions recommandées</h2>
    <ul>${recommendations || "<li>Aucune action recommandée.</li>"}</ul>
    <h2>Export synthèse</h2>
    <pre>${escapeHtml(result.export_markdown || "")}</pre>
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  const print = printWindow.print || window.print;
  print.call(printWindow);
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <AccountingHero
        badge="IA comptabilité"
        title="Comptabilité intelligente"
        description="Synthèses, anomalies, impayés, prévision CA, marge par restaurant et coût IA par restaurant restent en brouillon audité."
        actions={(
          <Button onClick={() => accountingMutation.mutate()} disabled={accountingMutation.isPending} className="gap-2">
            <Brain className="h-4 w-4" />
            Générer l'analyse
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

      {result ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Résumé mensuel</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{result.summary}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><LineChart className="h-5 w-5" />Prévision CA</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{result.revenue_forecast}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" />Coût IA par restaurant</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{JSON.stringify(result.metrics || {}, null, 2)}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" />Anomalies factures</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {result.anomalies.length > 0 ? result.anomalies.map((anomaly) => (
                <div key={`${anomaly.label}-${anomaly.evidence}`} className="rounded-xl border p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant={anomaly.severity === "high" ? "destructive" : "secondary"}>{anomaly.severity}</Badge>
                    <span className="font-semibold">{anomaly.label}</span>
                  </div>
                  <p className="text-muted-foreground">{anomaly.evidence}</p>
                </div>
              )) : <p className="text-sm text-muted-foreground">Aucune anomalie prioritaire.</p>}
              <Button type="button" variant="outline" className="gap-2" onClick={() => downloadAiAccountingMarkdown(result, month, action)}>
                <FileDown className="h-4 w-4" />
                Export synthèse
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={() => exportAiAccountingPdf(result, month, action)}>
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
