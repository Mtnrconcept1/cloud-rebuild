import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Bot, Coins, FileDown, FileText, HandCoins, History, Loader2, Megaphone, ReceiptText, Settings, Wallet } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { AccountingDigestCard, AccountingFactList, AccountingHero, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { Badge } from "@/components/ui/badge";
import { AiLoadingState } from "@/components/ui/ai-loading-state";
import {
  ACCOUNTING_PERIOD_PRESETS,
  buildAccountingPeriodRange,
  downloadAccountingExportCsv,
  exportAccountingStatementPdf,
  sanitizeAccountingFilePart,
  type AccountingPeriodPreset,
  type AccountingStatementKind,
} from "@/lib/accountingExports";
import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { useToast } from "@/hooks/use-toast";
import { getAccountingInsightsForRestaurant, runAccountingAgent, type AccountingAgentResult } from "@/lib/ai/tokAiClient";
import {
  fetchDashboardAccountingExportEntries,
  formatAmount,
  useDashboardFacturesData,
} from "./dashboardFacturesShared";

type DashboardAccountingAiDraft = {
  month: string;
  result: AccountingAgentResult | null;
};

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "";
}

function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatInsightPeriod(start: string, end: string) {
  return `${start.slice(0, 7)} (${start} - ${end})`;
}

function getInsightExportMarkdown(metadata: Record<string, unknown> | null | undefined, summary: string) {
  const exportMarkdown = metadata?.export_markdown;
  return typeof exportMarkdown === "string" && exportMarkdown.trim() ? exportMarkdown : summary;
}

function DashboardAccountingAiPanel({
  restaurantId,
  restaurantName,
}: {
  restaurantId: string;
  restaurantName: string;
}) {
  const [draft, setDraft] = useSessionStorageState<DashboardAccountingAiDraft>(
    `tok-dashboard-compta-ai-${restaurantId}`,
    { month: getCurrentMonth(), result: null },
  );

  const historyQuery = useQuery({
    queryKey: ["dashboard-ai-accounting-insights", restaurantId],
    queryFn: () => getAccountingInsightsForRestaurant(restaurantId),
    enabled: !!restaurantId,
  });

  const accountingMutation = useMutation({
    mutationFn: () => runAccountingAgent({
      restaurantId,
      month: draft.month,
      action: "monthly_summary",
    }),
    onSuccess: (result) => {
      setDraft((current) => ({ ...current, result }));
      void historyQuery.refetch();
    },
  });

  const result = draft.result;
  const history = historyQuery.data || [];

  return (
    <AccountingPanel
      tone="sky"
      icon={Bot}
      eyebrow="IA"
      title="Comptabilité IA"
      description={`Synthèse mensuelle, anomalies, impayés, prévision et recommandations pour ${restaurantName}.`}
      value={history.length ? `${history.length}` : undefined}
      valueLabel={history.length ? "rapports" : undefined}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_auto_auto]">
        <Input
          aria-label="Mois du rapport IA comptable"
          type="month"
          value={draft.month}
          onChange={(event) => setDraft((current) => ({ ...current, month: event.target.value || getCurrentMonth() }))}
        />
        <Button
          type="button"
          className="gap-2"
          onClick={() => accountingMutation.mutate()}
          disabled={accountingMutation.isPending}
        >
          <Bot className={accountingMutation.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
          {accountingMutation.isPending ? "Synthèse en cours..." : "Générer une synthèse IA"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={!result}
          onClick={() => {
            if (!result) return;
            downloadMarkdown(`tok-compta-ia-${restaurantId}-${draft.month}.md`, result.export_markdown || result.summary);
          }}
        >
          <FileDown className="h-4 w-4" />
          Exporter
        </Button>
      </div>

      {accountingMutation.isPending ? (
        <AiLoadingState
          title="Préparation de la synthèse IA"
          description="Analyse des écritures, historique et recommandations comptables du restaurant."
          steps={["Données", "Anomalies", "Prévision", "Rapport"]}
        />
      ) : null}

      {accountingMutation.error ? (
        <p className="text-sm text-destructive">{getErrorMessage(accountingMutation.error)}</p>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-2xl border bg-background/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Brouillon</Badge>
            <Badge variant="outline">{draft.month}</Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{result.summary}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Prévision CA</p>
              <p className="mt-1 text-sm">{result.revenue_forecast}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Actions recommandées</p>
              <ul className="mt-1 space-y-1 text-sm">
                {result.recommended_actions.slice(0, 3).map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" />
          Historique des rapports IA
        </div>
        {historyQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement de l'historique IA...</p>
        ) : null}
        {!historyQuery.isLoading && history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun rapport IA enregistré pour ce restaurant.</p>
        ) : null}
        {history.map((insight) => (
          <div key={insight.id} className="rounded-2xl border bg-background/70 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{formatInsightPeriod(insight.period_start, insight.period_end)}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{insight.summary}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => downloadMarkdown(
                  `tok-compta-ia-${restaurantId}-${insight.period_start.slice(0, 7)}.md`,
                  getInsightExportMarkdown(insight.metadata, insight.summary),
                )}
              >
                <FileDown className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        ))}
      </div>
    </AccountingPanel>
  );
}

export default function DashboardFactures() {
  const { toast } = useToast();
  const [exportPeriodPreset, setExportPeriodPreset] = useState<AccountingPeriodPreset>("current_month");
  const [exporting, setExporting] = useState<"csv" | AccountingStatementKind | null>(null);
  const {
    selectedRestaurant,
    commissionBases,
    payableAccruals,
    summary,
    paidCampaignsCount,
    paidCampaignsTotal,
    refundsIssuedCount,
    refundsIssuedTotal,
    refundsPendingAmount,
    refundsPendingCount,
    tokCoveredMiamzAmount,
    tokCoveredMiamzCount,
    uninvoicedRestaurantShareTotal,
    isLoading,
    error,
  } = useDashboardFacturesData();

  const totalPaidThroughTok = COMMISSION_SOURCE_ORDER.reduce(
    (sum, source) => sum + commissionBases[source],
    0,
  );
  const totalRestaurantShare = COMMISSION_SOURCE_ORDER.reduce(
    (sum, source) => sum + summary.inflow.bySource[source],
    0,
  );
  const totalReceivable = summary.inflow.receivableFromTok + uninvoicedRestaurantShareTotal;
  const totalPayable = summary.outflow.totalOutstanding;
  const netOpen = totalReceivable - totalPayable;
  const exportPeriod = useMemo(
    () => buildAccountingPeriodRange(exportPeriodPreset),
    [exportPeriodPreset],
  );

  const runAccountingExport = async (kind: "csv" | AccountingStatementKind) => {
    if (!selectedRestaurant) return;

    setExporting(kind);
    try {
      const entries = await fetchDashboardAccountingExportEntries({
        restaurantId: selectedRestaurant.id,
        period: exportPeriod,
      });
      const scopeFilePart = sanitizeAccountingFilePart(selectedRestaurant.name);
      const periodFilePart = sanitizeAccountingFilePart(exportPeriod.label);

      if (kind === "csv") {
        downloadAccountingExportCsv(
          `tok-journal-comptable-${scopeFilePart}-${periodFilePart}.csv`,
          entries,
        );
        toast({
          title: "Export CSV préparé",
          description: `${entries.length} écriture${entries.length > 1 ? "s" : ""} exportée${entries.length > 1 ? "s" : ""}.`,
        });
        return;
      }

      exportAccountingStatementPdf({
        entries,
        statement: kind,
        title: "Comptabilité restaurateur TOK",
        scopeLabel: selectedRestaurant.name,
        periodLabel: exportPeriod.label,
      });
    } catch (exportError) {
      toast({
        title: "Export impossible",
        description: getErrorMessage(exportError) || "Impossible de préparer l'export comptable.",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <AccountingHero
          badge="Comptabilite restaurateur"
          title="Vue comptable"
          description={selectedRestaurant
            ? "Les chiffres essentiels: ce que Tok vous doit, ce que vous devez à Tok, les ajustements fidélité couverts et le net ouvert."
            : "Sélectionnez un restaurant depuis la barre latérale pour ouvrir la comptabilité."}
          actions={(
            <>
              <Button asChild size="sm">
                <Link to="/dashboard/factures">Vue d&apos;ensemble</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/entrees">Entrées</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/sorties">Sorties</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/parametres">
                  <Settings className="mr-2 h-4 w-4" />
                  Paramètres
                </Link>
              </Button>
            </>
          )}
        />

        <Card className="tok-dashboard-section rounded-3xl border border-border/70">
          <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-center md:p-6">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Exports comptables</p>
              <p className="text-sm text-muted-foreground">
                Journal CSV complet des entrées et sorties, puis PDF bilan, compte de résultat ou journal sur la période choisie.
              </p>
            </div>

            <Select value={exportPeriodPreset} onValueChange={(value) => setExportPeriodPreset(value as AccountingPeriodPreset)}>
              <SelectTrigger className="h-12 rounded-2xl border-border/70 bg-background/90 font-semibold dark:border-[#5f7aad]/35 dark:bg-[#040c1c]/86 dark:text-white">
                <SelectValue placeholder="Période comptable" />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNTING_PERIOD_PRESETS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void runAccountingExport("csv")}
                disabled={!selectedRestaurant || exporting !== null}
              >
                {exporting === "csv" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                CSV écritures
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void runAccountingExport("balance_sheet")}
                disabled={!selectedRestaurant || exporting !== null}
              >
                {exporting === "balance_sheet" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                PDF bilan
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void runAccountingExport("income_statement")}
                disabled={!selectedRestaurant || exporting !== null}
              >
                {exporting === "income_statement" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                PDF résultat
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void runAccountingExport("journal")}
                disabled={!selectedRestaurant || exporting !== null}
              >
                {exporting === "journal" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                PDF journal
              </Button>
            </div>
          </CardContent>
        </Card>

        {!selectedRestaurant && !isLoading ? (
          <Card className="tok-dashboard-section rounded-3xl border border-border/70">
            <CardContent className="py-10 text-center text-muted-foreground dark:text-slate-100/78">
              <ReceiptText className="mx-auto mb-3 h-10 w-10 text-[#ff6a1a] opacity-80" />
              <p>Sélectionnez un restaurant dans la barre latérale pour afficher sa comptabilité.</p>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? <p className="text-sm text-muted-foreground">Chargement des données comptables...</p> : null}
        {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

        {selectedRestaurant && !isLoading && !error ? (
          <>
            <AccountingDigestCard
              title="A lire en premier"
              description="Une lecture courte pour savoir quoi encaisser, quoi payer et quels avantages fidélité Tok couvre."
              items={[
                {
                  tone: "primary",
                  icon: ArrowDownRight,
                  label: "A recevoir de Tok",
                  value: formatAmount(totalReceivable),
                  helper: `${formatAmount(summary.inflow.receivableFromTok)} déjà facturé, ${formatAmount(uninvoicedRestaurantShareTotal)} à facturer.`,
                },
                {
                  tone: "orange",
                  icon: ArrowUpRight,
                  label: "A payer a Tok",
                  value: formatAmount(totalPayable),
                  helper: `${formatAmount(summary.outflow.payableToTok)} facturé, ${formatAmount(payableAccruals.totalAmount)} en attente.`,
                },
                {
                  tone: "violet",
                  icon: HandCoins,
                  label: "Avantages fidélité couverts",
                  value: formatAmount(tokCoveredMiamzAmount),
                  helper: `${tokCoveredMiamzCount} commande${tokCoveredMiamzCount > 1 ? "s" : ""} avec avantage fidélité remboursé par Tok.`,
                },
                {
                  tone: netOpen >= 0 ? "emerald" : "rose",
                  icon: Wallet,
                  label: "Net ouvert",
                  value: formatAmount(netOpen),
                  helper: "A recevoir moins a payer.",
                },
              ]}
            />

            <DashboardAccountingAiPanel
              restaurantId={selectedRestaurant.id}
              restaurantName={selectedRestaurant.name}
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <AccountingPanel
                tone="primary"
                icon={ArrowDownRight}
                eyebrow="Action"
                title="Ce que Tok vous doit"
                description="La part restaurant a récupérer, separee entre facturé déjà emise et encours."
                value={formatAmount(totalReceivable)}
                valueLabel="Entrees ouvertes"
              >
                <AccountingFactList
                  tone="primary"
                  items={[
                    {
                      label: "Déjà facturé et en attente",
                      value: formatAmount(summary.inflow.receivableFromTok),
                    },
                    {
                      label: "Encore à facturer",
                      value: formatAmount(uninvoicedRestaurantShareTotal),
                      helper: "Part 90% déjà acquise mais pas encore emise.",
                    },
                    {
                      label: "Déjà reçu de Tok",
                      value: formatAmount(summary.inflow.receivedFromTok),
                    },
                  ]}
                />
                <Button asChild>
                  <Link to="/dashboard/factures/entrees">Ouvrir les entrées</Link>
                </Button>
              </AccountingPanel>

              <AccountingPanel
                tone="orange"
                icon={ArrowUpRight}
                eyebrow="Action"
                title="Ce que vous devez a Tok"
                description="Les factures Tok ouvertes et les lignes qui arriveront dans une prochaine facturé."
                value={formatAmount(totalPayable)}
                valueLabel="Sorties ouvertes"
              >
                <AccountingFactList
                  tone="orange"
                  items={[
                    {
                      label: "Factures Tok déjà emises",
                      value: formatAmount(summary.outflow.payableToTok),
                    },
                    {
                      label: "Encours non facturé",
                      value: formatAmount(payableAccruals.totalAmount),
                      helper: `${payableAccruals.totalCount} ligne${payableAccruals.totalCount > 1 ? "s" : ""} en attente.`,
                    },
                    {
                      label: "Déjà paye a Tok",
                      value: formatAmount(summary.outflow.alreadyPaidToTok),
                    },
                  ]}
                />
                <Button asChild variant="outline">
                  <Link to="/dashboard/factures/sorties">Ouvrir les sorties</Link>
                </Button>
              </AccountingPanel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <AccountingPanel
                tone="emerald"
                icon={Coins}
                title="Ce qui explique vos entrées"
                description="La base client, la part restaurant et les avantages fidélité pris en charge par Tok."
                value={formatAmount(totalRestaurantShare)}
                valueLabel="Part restaurant"
              >
                <AccountingFactList
                  tone="emerald"
                  items={[
                    {
                      label: "Paiements clients via Tok",
                      value: formatAmount(totalPaidThroughTok),
                      helper: "Base avant separation 10% Tok / 90% restaurant.",
                    },
                    {
                      label: "Part restaurant 90%",
                      value: formatAmount(totalRestaurantShare),
                    },
                    {
                      label: "Avantages fidélité pris en charge",
                      value: formatAmount(tokCoveredMiamzAmount),
                      helper: "Ajustement client ajouté à votre base de reversement.",
                    },
                    ...COMMISSION_SOURCE_ORDER.map((source) => ({
                      label: COMMISSION_SOURCE_LABELS[source],
                      value: formatAmount(summary.inflow.bySource[source]),
                    })),
                  ]}
                />
              </AccountingPanel>

              <AccountingPanel
                tone="violet"
                icon={Megaphone}
                title="Autres lignes a surveiller"
                description="Les couts et remboursements qui doivent rester visibles sans dominer la page."
                value={formatAmount(paidCampaignsTotal + refundsIssuedTotal)}
                valueLabel="Suivi"
              >
                <AccountingFactList
                  tone="violet"
                  items={[
                    {
                      label: "Campagnes payées",
                      value: formatAmount(paidCampaignsTotal),
                      helper: `${paidCampaignsCount} campagne${paidCampaignsCount > 1 ? "s" : ""}.`,
                    },
                    {
                      label: "Remboursements clients emis",
                      value: formatAmount(refundsIssuedTotal),
                      helper: `${refundsIssuedCount} remboursement${refundsIssuedCount > 1 ? "s" : ""}.`,
                    },
                    {
                      label: "Remboursements encore a traiter",
                      value: formatAmount(refundsPendingAmount),
                      helper: `${refundsPendingCount} dossier${refundsPendingCount > 1 ? "s" : ""} ouvert${refundsPendingCount > 1 ? "s" : ""}.`,
                    },
                  ]}
                />
              </AccountingPanel>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
