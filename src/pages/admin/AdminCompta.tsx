import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Coins, FileDown, FileText, HandCoins, Loader2, Lock, Megaphone, Percent, Receipt, Store, Target, Unlock, Wallet } from "lucide-react";

import { AccountingDigestCard, AccountingFactList, AccountingHero, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { AccountingBreakdownCard, type AccountingBreakdownItem } from "@/components/invoices/AccountingBreakdownCard";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import {
  downloadAccountingCsv,
  fetchAdminAccountingExportEntries,
  formatAmount,
  toAmount,
  useAdminComptaData,
} from "./adminComptaShared";

const supabase = getSupabase();

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "";
}

export default function AdminCompta() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRestaurant, setSelectedRestaurant] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const currentDate = new Date();
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  });
  const [exportPeriodPreset, setExportPeriodPreset] = useState<AccountingPeriodPreset>("current_month");
  const [exporting, setExporting] = useState<"csv" | AccountingStatementKind | null>(null);

  const {
    restaurants,
    summary,
    payableAccruals,
    payableInvoiceSections,
    paidEventGross,
    paidCampaignsCount,
    paidCampaignsTotal,
    reservationFeeRevenueAmount,
    tokOneSubscriptionAmount,
    tokOneSubscriptionCount,
    directTokPurchaseRevenueAmount,
    tokCoveredMiamzAmount,
    tokCoveredMiamzCount,
    totalRevenue,
    developerReservedShare,
    monthOptions,
    refundsIssuedCount,
    refundsIssuedTotal,
    refundsPendingAmount,
    refundsPendingCount,
    financialHealth,
    periodControl,
    stripeReconciliation,
    platformFinanceSnapshot,
    isPeriodClosed,
    isLoading,
    error,
  } = useAdminComptaData(selectedRestaurant, selectedMonth);

  const totalPayableOpen = summary.inflow.payableOutstanding + payableAccruals.totalAmount;
  const netOpen = totalPayableOpen - summary.outflow.payoutsOutstanding;
  const marketingBudgetAuthorized = totalRevenue * 0.6;
  const commercialBudgetCap = totalRevenue * 0.12;
  const aiBudgetCap = totalRevenue * 0.04;
  const reserveMinimum = totalRevenue * 0.07;
  const estimatedControllableEnvelope = Math.max(
    0,
    totalRevenue
      - marketingBudgetAuthorized
      - commercialBudgetCap
      - aiBudgetCap
      - reserveMinimum
      - developerReservedShare,
  );
  const commercialGoalCapacity = [10, 15, 25, 30, 50].map((restaurantsSigned) => ({
    label: `${restaurantsSigned} restaurants signes`,
    value: formatAmount(commercialBudgetCap / restaurantsSigned),
    helper: "Commission moyenne disponible par restaurant signe, avant bonus d'activation.",
  }));
  const adminRevenueBreakdown: AccountingBreakdownItem[] = [
    {
      label: "Commissions marketplace",
      amount: summary.inflow.totalCommissions,
      helper: "Part TOK de 10 % sur les paiements marketplace.",
      tone: "emerald",
    },
    {
      label: "Frais de réservation",
      amount: reservationFeeRevenueAmount,
      helper: "Frais fixes liés aux réservations confirmées.",
      tone: "sky",
    },
    {
      label: "Campagnes publicitaires",
      amount: paidCampaignsTotal,
      helper: "Budgets publicitaires réellement encaissés.",
      tone: "violet",
    },
    {
      label: "Abonnements Tok One",
      amount: tokOneSubscriptionAmount,
      helper: "Encaissements Tok One de la période.",
      tone: "orange",
    },
    {
      label: "Abonnements, packs et crédits",
      amount: directTokPurchaseRevenueAmount,
      helper: "Achats directs des restaurateurs auprès de TOK.",
      tone: "amber",
    },
  ];
  const recordedPlatformExpenseBreakdown: AccountingBreakdownItem[] = [
    {
      label: "Charges marketing enregistrées",
      amount: toAmount(platformFinanceSnapshot?.marketing_spent_chf),
      helper: "Dépenses marketing réellement saisies pour le mois.",
      tone: "orange",
    },
    {
      label: "Coûts commerciaux enregistrés",
      amount: toAmount(platformFinanceSnapshot?.commercial_cost_chf),
      helper: "Commissions, primes et coûts commerciaux comptabilisés.",
      tone: "amber",
    },
    {
      label: "Coûts IA enregistrés",
      amount: toAmount(platformFinanceSnapshot?.ai_cost_chf),
      helper: "Consommation OpenAI et autres usages IA suivis.",
      tone: "sky",
    },
    {
      label: "Autres charges enregistrées",
      amount: toAmount(platformFinanceSnapshot?.other_cost_chf),
      helper: "Hébergement, outils, support, juridique et autres fournisseurs saisis.",
      tone: "rose",
    },
    {
      label: "Part développeur réservée",
      amount: developerReservedShare,
      helper: "Engagement séparé correspondant à 10 % du revenu TOK reconnu.",
      tone: "violet",
    },
  ];
  const recordedPlatformExpenseTotal = recordedPlatformExpenseBreakdown.reduce((sum, item) => sum + item.amount, 0);
  const selectedRestaurantName = selectedRestaurant === "all"
    ? "Tous les restaurateurs"
    : restaurants.find((restaurant) => restaurant.id === selectedRestaurant)?.name || "Restaurateur";
  const exportPeriod = useMemo(
    () => buildAccountingPeriodRange(exportPeriodPreset),
    [exportPeriodPreset],
  );
  const lockStatusLabel = isPeriodClosed
    ? "Mois cloture"
    : periodControl?.status === "reopened"
      ? "Mois rouvert"
      : "Mois ouvert";

  const exportAdminComptaCsv = () => {
    downloadAccountingCsv(`tok-compta-${selectedMonth}-${selectedRestaurant}.csv`, [
      ["Mois", selectedMonth],
      ["Portee", selectedRestaurantName],
      ["Statut periode", lockStatusLabel],
      ["Revenu Tok", totalRevenue],
      ["Part developpeur", developerReservedShare],
      ["A encaisser", totalPayableOpen],
      ["A reverser", summary.outflow.payoutsOutstanding],
      ["Net ouvert", netOpen],
      ["Commissions", summary.inflow.totalCommissions],
      ["Campagnes", paidCampaignsTotal],
      ["Achats restaurateur TOK", directTokPurchaseRevenueAmount],
      ["Tok One", tokOneSubscriptionAmount],
      ["Miamz Tok", tokCoveredMiamzAmount],
      ["Remboursements emis", refundsIssuedTotal],
    ]);
  };

  const runAccountingExport = async (kind: "csv" | AccountingStatementKind) => {
    setExporting(kind);
    try {
      const entries = await fetchAdminAccountingExportEntries({
        selectedRestaurant,
        period: exportPeriod,
      });
      const scopeFilePart = sanitizeAccountingFilePart(selectedRestaurantName);
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
        title: "Comptabilité admin TOK",
        scopeLabel: selectedRestaurantName,
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

  const setAccountingMonthLock = async (status: "closed" | "reopened") => {
    const reason = window.prompt(
      status === "closed"
        ? "Raison de cloture du mois"
        : "Raison de reouverture du mois",
    );
    if (!reason?.trim()) {
      toast({
        title: "Raison obligatoire",
        description: "La cloture ou reouverture comptable doit etre justifiee pour l'audit.",
        variant: "destructive",
      });
      return;
    }

    const { error: lockError } = await (supabase.rpc as any)("admin_set_accounting_month_lock", {
      p_month: `${selectedMonth}-01`,
      p_status: status,
      p_reason: reason.trim(),
    });

    if (lockError) {
      toast({ title: "Controle comptable impossible", description: lockError.message, variant: "destructive" });
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-compta-period-control"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-compta-stripe-reconciliation"] }),
    ]);
    toast({
      title: status === "closed" ? "Mois cloture" : "Mois rouvert",
      description: "Le changement est enregistre dans l'audit admin.",
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-foreground dark:text-slate-100">
      <AccountingHero
        badge="Comptabilite TOK"
        title="Vue comptable admin"
        description="Lecture courte: revenu Tok, montants ouverts, reversements et prises en charge. Les détails restent limites aux lignes utiles pour agir."
        actions={(
          <>
            <Button asChild size="sm">
              <Link to="/admin/compta">Vue d&apos;ensemble</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/compta/entrees">Entrées</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/compta/sorties">Sorties</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={exportAdminComptaCsv}>
              <FileDown className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </>
        )}
      />

      <Card className="tok-dashboard-section rounded-3xl border border-border/70">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_220px_220px] md:p-6">
          <div className="tok-dashboard-kpi tok-tone-orange flex items-center gap-4 rounded-2xl px-4 py-4">
            <div className="tok-kpi-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="tok-kpi-label text-xs font-bold uppercase tracking-[0.22em]">Portee</p>
              <p className="tok-kpi-value truncate text-base font-bold">{selectedRestaurantName}</p>
            </div>
          </div>

          <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
            <SelectTrigger className="h-14 rounded-2xl border-border/70 bg-background/90 font-semibold dark:border-[#5f7aad]/35 dark:bg-[#040c1c]/86 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <SelectValue placeholder="Restaurant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les restaurateurs</SelectItem>
              {restaurants.map((restaurant) => (
                <SelectItem key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-14 rounded-2xl border-border/70 bg-background/90 font-semibold dark:border-[#5f7aad]/35 dark:bg-[#040c1c]/86 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <SelectValue placeholder="Mois" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Chargement des données comptables...</p> : null}
      <Card className="tok-dashboard-section rounded-3xl border border-border/70">
        <CardContent className="space-y-4 p-4 sm:p-5 md:p-6">
          <div className="max-w-3xl space-y-1">
            <p className="text-sm font-semibold">Exports comptables</p>
            <p className="text-sm text-muted-foreground">
              Journal CSV complet des entrées et sorties, puis PDF bilan, compte de résultat ou journal sur la période choisie.
            </p>
          </div>

          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,260px)_repeat(4,minmax(130px,1fr))]">
            <Select value={exportPeriodPreset} onValueChange={(value) => setExportPeriodPreset(value as AccountingPeriodPreset)}>
              <SelectTrigger className="h-12 w-full rounded-2xl border-border/70 bg-background/90 font-semibold dark:border-[#5f7aad]/35 dark:bg-[#040c1c]/86 dark:text-white">
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-12 w-full justify-center rounded-2xl"
              onClick={() => void runAccountingExport("csv")}
              disabled={exporting !== null}
            >
              {exporting === "csv" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              CSV écritures
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-12 w-full justify-center rounded-2xl"
              onClick={() => void runAccountingExport("balance_sheet")}
              disabled={exporting !== null}
            >
              {exporting === "balance_sheet" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              PDF bilan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-12 w-full justify-center rounded-2xl"
              onClick={() => void runAccountingExport("income_statement")}
              disabled={exporting !== null}
            >
              {exporting === "income_statement" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              PDF résultat
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-12 w-full justify-center rounded-2xl"
              onClick={() => void runAccountingExport("journal")}
              disabled={exporting !== null}
            >
              {exporting === "journal" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              PDF journal
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}
      {!isLoading && !error && !financialHealth.healthy ? (
        <Card className="border-amber-200 bg-amber-50 text-amber-950">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="space-y-1">
                <p className="font-semibold">Ecart financier a vérifier</p>
                <p className="text-sm text-amber-900">
                  {financialHealth.confirmedNotCaptured} capture manquante, {financialHealth.refundPending} remboursement en attente, {financialHealth.failedPayments} paiement échoué.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100">
              <Link to="/admin/commandes-reservations">Ouvrir les operations</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error ? (
        <>
          <Card className="border-border/70">
            <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{lockStatusLabel}</span>
                  {isPeriodClosed ? <Lock className="h-4 w-4 text-amber-700" /> : <Unlock className="h-4 w-4 text-emerald-700" />}
                </div>
                <p className="text-sm text-muted-foreground">
                  La cloture fige les totaux officiels du mois et bloque les mutations destructives sans reouverture auditee.
                </p>
                {periodControl?.lock?.reason ? (
                  <p className="text-xs text-muted-foreground">Derniere raison : {periodControl.lock.reason}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void setAccountingMonthLock("closed")} disabled={isPeriodClosed}>
                  <Lock className="mr-2 h-4 w-4" />
                  Clôturer le mois
                </Button>
                <Button type="button" variant="outline" onClick={() => void setAccountingMonthLock("reopened")} disabled={!isPeriodClosed}>
                  <Unlock className="mr-2 h-4 w-4" />
                  Réouvrir
                </Button>
              </div>
            </CardContent>
          </Card>

          <AccountingPanel
            tone="slate"
            icon={AlertTriangle}
            title="Écarts Stripe"
            description="Rapprochement mensuel entre les flux attendus, recus, rembourses, orphelins ou incoherents."
            value={String(stripeReconciliation.reduce((sum, row) => sum + Number(row.orphan_count || 0) + Number(row.mismatch_count || 0), 0))}
            valueLabel="Ecarts detectes"
          >
            <AccountingFactList
              items={stripeReconciliation.length > 0
                ? stripeReconciliation.map((row) => ({
                  label: row.item_kind,
                  value: formatAmount(toAmount(row.received_amount)),
                  helper: `${row.received_count} recus, ${row.orphan_count} orphelins, ${row.mismatch_count} incoherents, ${formatAmount(row.refunded_amount)} rembourses.`,
                }))
                : [{ label: "Rapprochement", value: "Aucun ecart", helper: "Aucun signal Stripe/Base sur cette periode." }]}
            />
          </AccountingPanel>

          <AccountingDigestCard
            title="A lire en premier"
            description="Les chiffres prioritaires pour piloter le mois sans parcourir toutes les factures."
            items={[
              {
                tone: "emerald",
                icon: Coins,
                label: "Revenu Tok",
                value: formatAmount(totalRevenue),
                helper: "Commissions, frais réservation, campagnes, achats restaurateur et Tok One.",
              },
              {
                tone: "primary",
                icon: Percent,
                label: "Part developpeur",
                value: formatAmount(developerReservedShare),
                helper: "10% du CA Tok encaissé.",
              },
              {
                tone: "violet",
                icon: HandCoins,
                label: "Miamz pris en charge",
                value: formatAmount(tokCoveredMiamzAmount),
                helper: `${tokCoveredMiamzCount} commande${tokCoveredMiamzCount > 1 ? "s" : ""} avec réduction Miamz financée par Tok.`,
              },
              {
                tone: netOpen >= 0 ? "amber" : "rose",
                icon: Wallet,
                label: "Net ouvert",
                value: formatAmount(netOpen),
                helper: "A encaisser moins a reverser.",
              },
            ]}
          />

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <AccountingBreakdownCard
              title="D'où viennent les recettes Tok"
              description="Chaque poste est rapporté au revenu Tok total du mois sélectionné."
              totalLabel="Recettes Tok"
              total={totalRevenue}
              items={adminRevenueBreakdown}
              formatValue={formatAmount}
            />
            <AccountingBreakdownCard
              title="Dépenses réelles et engagements"
              description={selectedRestaurant === "all"
                ? "Charges réellement enregistrées dans le suivi plateforme, plus la part développeur. Les reversements restaurants restent séparés car ils ne sont pas une charge TOK."
                : "Les charges plateforme sont disponibles dans la vue Tous les restaurateurs. La part développeur reste calculée sur la portée sélectionnée."}
              totalLabel="Charges suivies"
              total={recordedPlatformExpenseTotal}
              items={recordedPlatformExpenseBreakdown}
              formatValue={formatAmount}
            />
          </div>

          <AccountingPanel
            tone="violet"
            icon={Megaphone}
            title="Budget marketing 60 %"
            description="Politique théorique distincte des dépenses réelles : les plafonds marketing, commercial, IA, réserve et développeur s’additionnent sur le revenu TOK."
            value={formatAmount(marketingBudgetAuthorized)}
            valueLabel="Marketing autorise"
          >
            <AccountingFactList
              tone="violet"
              items={[
                {
                  label: "CA encaissé TOK",
                  value: formatAmount(totalRevenue),
                  helper: "Base utilisée pour calculer les plafonds opérationnels.",
                },
                {
                  label: "Commerciaux max 12 %",
                  value: formatAmount(commercialBudgetCap),
                  helper: "Commissions payables uniquement sur revenus encaissés et non remboursés.",
                },
                {
                  label: "OpenAI max 4 %",
                  value: formatAmount(aiBudgetCap),
                  helper: "Photos IA, campagnes et assistants doivent rester dans cette enveloppe.",
                },
                {
                  label: "Réserve minimum 7 %",
                  value: formatAmount(reserveMinimum),
                },
                {
                  label: "Part développeur 10 %",
                  value: formatAmount(developerReservedShare),
                  helper: "Engagement soustrait avant de calculer le reste pilotable.",
                },
                {
                  label: "Reste pilotable après politiques",
                  value: formatAmount(estimatedControllableEnvelope),
                  helper: "Hébergement, outils, support, admin, juridique et marge nette.",
                },
              ]}
            />
          </AccountingPanel>

          <AccountingPanel
            tone="amber"
            icon={Target}
            title="Dashboard commercial"
            description="Objectifs 10/15/25/30/50 restaurants et commissions plafonnees sur les revenus vraiment encaisses."
            value={formatAmount(commercialBudgetCap)}
            valueLabel="Plafond commercial 12 %"
          >
            <AccountingFactList
              tone="amber"
              items={[
                {
                  label: "Regle de paiement",
                  value: "CA encaisse",
                  helper: "Pas de commission sur restaurant non paye, rembourse ou en litige.",
                },
                ...commercialGoalCapacity,
              ]}
            />
          </AccountingPanel>

          <div className="grid gap-4 xl:grid-cols-2">
            <AccountingPanel
              tone="amber"
              icon={ArrowDownRight}
              eyebrow="Action"
              title="Encaisser les restaurateurs"
              description="Le montant a suivre cote entrées, separe entre facturé déjà emise et encours à facturer."
              value={formatAmount(totalPayableOpen)}
              valueLabel="A encaisser"
            >
              <AccountingFactList
                tone="amber"
                items={[
                  {
                    label: "Encore à facturer",
                    value: formatAmount(payableAccruals.totalAmount),
                    helper: `${payableAccruals.totalCount} ligne${payableAccruals.totalCount > 1 ? "s" : ""} non facturee${payableAccruals.totalCount > 1 ? "s" : ""}`,
                  },
                  {
                    label: "Facture, pas encore encaisse",
                    value: formatAmount(summary.inflow.payableOutstanding),
                    helper: `${payableInvoiceSections.actionable.length} facturé${payableInvoiceSections.actionable.length > 1 ? "s" : ""} ouverte${payableInvoiceSections.actionable.length > 1 ? "s" : ""}`,
                  },
                  {
                    label: "Déjà encaisse",
                    value: formatAmount(summary.inflow.payableCollected),
                  },
                ]}
              />
              <Button asChild>
                <Link to="/admin/compta/entrees">Ouvrir les entrées</Link>
              </Button>
            </AccountingPanel>

            <AccountingPanel
              tone="rose"
              icon={ArrowUpRight}
              eyebrow="Action"
              title="Reverser aux restaurateurs"
              description="Le montant a sortir de Tok et les remboursements clients a garder visibles."
              value={formatAmount(summary.outflow.payoutsOutstanding)}
              valueLabel="A reverser"
            >
              <AccountingFactList
                tone="rose"
                items={[
                  {
                    label: "Reversements ouverts",
                    value: formatAmount(summary.outflow.payoutsOutstanding),
                  },
                  {
                    label: "Déjà reverse",
                    value: formatAmount(summary.outflow.payoutsPaid),
                  },
                  {
                    label: "Remboursements emis",
                    value: formatAmount(refundsIssuedTotal),
                    helper: `${refundsIssuedCount} emis, ${formatAmount(refundsPendingAmount)} encore a traiter sur ${refundsPendingCount} dossier${refundsPendingCount > 1 ? "s" : ""}.`,
                  },
                ]}
              />
              <Button asChild variant="outline">
                <Link to="/admin/compta/sorties">Ouvrir les sorties</Link>
              </Button>
            </AccountingPanel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AccountingPanel
              tone="emerald"
              icon={Receipt}
              title="Composition du revenu Tok"
              description="Uniquement les flux qui forment le chiffre d'affaires final de Tok."
              value={formatAmount(totalRevenue)}
              valueLabel="Revenu total"
            >
              <AccountingFactList
                tone="emerald"
                items={[
                  {
                    label: "Commissions marketplace 10%",
                    value: formatAmount(summary.inflow.totalCommissions),
                    helper: `${formatAmount(paidEventGross)} encaisses via Tok avant separation 10% / 90%.`,
                  },
                  {
                    label: "Frais de réservation",
                    value: formatAmount(reservationFeeRevenueAmount),
                    helper: "Frais fixes factures sur les réservations confirmées.",
                  },
                  {
                    label: "Campagnes publicitaires",
                    value: formatAmount(paidCampaignsTotal),
                    helper: `${paidCampaignsCount} campagne${paidCampaignsCount > 1 ? "s" : ""} payée${paidCampaignsCount > 1 ? "s" : ""}.`,
                  },
                  {
                    label: "Abonnements Tok One",
                    value: formatAmount(tokOneSubscriptionAmount),
                    helper: `${tokOneSubscriptionCount} encaissement${tokOneSubscriptionCount > 1 ? "s" : ""}.`,
                  },
                  {
                    label: "Achats restaurateur TOK",
                    value: formatAmount(directTokPurchaseRevenueAmount),
                    helper: "Packs de lancement, abonnements restaurateur et packs de crédits déjà payés à TOK.",
                  },
                ]}
              />
            </AccountingPanel>

            <AccountingPanel
              tone="sky"
              icon={Megaphone}
              title="Contrôles utiles"
              description="Les lignes qui expliquent les ecarts sans alourdir la page."
              value={formatAmount(tokCoveredMiamzAmount)}
              valueLabel="Miamz Tok"
            >
              <AccountingFactList
                tone="sky"
                items={[
                  ...COMMISSION_SOURCE_ORDER.map((source) => ({
                    label: COMMISSION_SOURCE_LABELS[source],
                    value: formatAmount(summary.inflow.bySource[source]),
                    helper: "Commission Tok 10%",
                  })),
                  {
                    label: "Miamz pris en charge par Tok",
                    value: formatAmount(tokCoveredMiamzAmount),
                    helper: "Réduction client ajoutee à la base de reversement restaurant, hors revenu Tok.",
                  },
                ]}
              />
            </AccountingPanel>
          </div>
        </>
      ) : null}
    </div>
  );
}
