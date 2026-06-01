import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Coins, FileDown, HandCoins, Lock, Megaphone, Percent, Receipt, Store, Unlock, Wallet } from "lucide-react";

import { AccountingDigestCard, AccountingFactList, AccountingHero, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import {
  downloadAccountingCsv,
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
    isPeriodClosed,
    isLoading,
    error,
  } = useAdminComptaData(selectedRestaurant, selectedMonth);

  const totalPayableOpen = summary.inflow.payableOutstanding + payableAccruals.totalAmount;
  const netOpen = totalPayableOpen - summary.outflow.payoutsOutstanding;
  const selectedRestaurantName = selectedRestaurant === "all"
    ? "Tous les restaurateurs"
    : restaurants.find((restaurant) => restaurant.id === selectedRestaurant)?.name || "Restaurateur";
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
      ["Tok One", tokOneSubscriptionAmount],
      ["Miamz Tok", tokCoveredMiamzAmount],
      ["Remboursements emis", refundsIssuedTotal],
    ]);
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
                helper: "Commissions, frais réservation, campagnes et Tok One.",
              },
              {
                tone: "primary",
                icon: Percent,
                label: "Part developpeur",
                value: formatAmount(developerReservedShare),
                helper: "6% du revenu Tok affiche.",
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
