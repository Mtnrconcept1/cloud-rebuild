import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Building2, Coins, Megaphone, Percent, Receipt, Store, Wallet } from "lucide-react";

import { AccountingFactList, AccountingHero, AccountingMetricCard, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  formatAmount,
  useAdminComptaData,
} from "./adminComptaShared";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "";
}

export default function AdminCompta() {
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
    totalRevenue,
    developerReservedShare,
    monthOptions,
    refundsIssuedCount,
    refundsIssuedTotal,
    refundsPendingAmount,
    refundsPendingCount,
    isLoading,
    error,
  } = useAdminComptaData(selectedRestaurant, selectedMonth);
  const totalPayableOpen = summary.inflow.payableOutstanding + payableAccruals.totalAmount;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <AccountingHero
        badge="Comptabilite TOK"
        title="Cockpit comptable"
        description="Pilotez d'abord ce qui doit etre facture ou regle, puis seulement les explications et l'historique. Cette vue synthétise les montants ouverts entre TOK et les restaurateurs."
        actions={(
          <>
            <Button asChild size="sm">
              <Link to="/admin/compta">Vue d&apos;ensemble</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/compta/entrees">Entrees d&apos;argent</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/compta/sorties">Sorties d&apos;argent</Link>
            </Button>
          </>
        )}
      />

      <Card className="border-dashed bg-muted/20">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_220px]">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/90 px-4 py-3">
            <Store className="h-5 w-5 text-primary" />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Portee</p>
              <p className="truncate text-sm font-semibold">
                {selectedRestaurant === "all"
                  ? "Tous les restaurateurs"
                  : restaurants.find((restaurant) => restaurant.id === selectedRestaurant)?.name || "Restaurateur"}
              </p>
            </div>
          </div>

          <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
            <SelectTrigger>
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
            <SelectTrigger>
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

      {isLoading ? <p className="text-sm text-muted-foreground">Chargement des donnees comptables...</p> : null}
      {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

      {!isLoading && !error ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <AccountingMetricCard
              tone="emerald"
              icon={Coins}
              label="Revenu total"
              value={formatAmount(totalRevenue)}
              description={selectedRestaurant === "all"
                ? `Commissions 10%, frais de réservation (${formatAmount(reservationFeeRevenueAmount)}), campagnes pub (${formatAmount(paidCampaignsTotal)}) et abonnements Tok One (${tokOneSubscriptionCount} encaissement${tokOneSubscriptionCount > 1 ? "s" : ""}, ${formatAmount(tokOneSubscriptionAmount)}).`
                : "Commissions 10%, frais de réservation et campagnes pub du restaurateur sélectionné. Tok One n'est pas rattaché à un restaurateur."}
            />
            <AccountingMetricCard
              tone="primary"
              icon={Percent}
              label="Part réservée au développeur"
              value={formatAmount(developerReservedShare)}
              description="6% du chiffre d'affaires total affiché sur la période et la portée courantes."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AccountingMetricCard
              tone="sky"
              icon={Coins}
              label="Volume encaisse via TOK"
              value={formatAmount(paidEventGross)}
              description="Base client du filtre courant avant separation entre la commission TOK et la part restaurant."
            />
            <AccountingMetricCard
              tone="amber"
              icon={ArrowDownRight}
              label="A encaisser des restaurateurs"
              value={formatAmount(totalPayableOpen)}
              description={`${formatAmount(summary.inflow.payableOutstanding)} deja facture et ${formatAmount(payableAccruals.totalAmount)} encore a facturer.`}
            />
            <AccountingMetricCard
              tone="rose"
              icon={ArrowUpRight}
              label="A reverser aux restaurateurs"
              value={formatAmount(summary.outflow.payoutsOutstanding)}
              description="Reversements deja emis par les restaurants et encore ouverts du cote TOK."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AccountingPanel
              tone="amber"
              icon={Receipt}
              eyebrow="A faire maintenant"
              title="Suivi des factures faites aux restaurateurs"
              description="Commencez ici pour savoir ce qui doit etre facture ou encaisse sans parcourir toute la comptabilite."
              value={formatAmount(totalPayableOpen)}
              valueLabel="Ouvert cote entrees"
            >
              <AccountingFactList
                tone="amber"
                items={[
                  {
                    label: "Encore non facture",
                    value: formatAmount(payableAccruals.totalAmount),
                    helper: `${payableAccruals.totalCount} ligne${payableAccruals.totalCount > 1 ? "s" : ""} en attente de facture`,
                  },
                  {
                    label: "Deja facture, encore a encaisser",
                    value: formatAmount(summary.inflow.payableOutstanding),
                    helper: `${payableInvoiceSections.actionable.length} facture${payableInvoiceSections.actionable.length > 1 ? "s" : ""} a suivre`,
                  },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/admin/compta/entrees">Ouvrir les entrees</Link>
                </Button>
              </div>
            </AccountingPanel>

            <AccountingPanel
              tone="rose"
              icon={Wallet}
              eyebrow="A faire maintenant"
              title="Suivi des reversements restaurateurs"
              description="Ce bloc montre ce qui doit sortir de TOK et ce qui a deja ete regle."
              value={formatAmount(summary.outflow.payoutsOutstanding)}
              valueLabel="Ouvert cote sorties"
            >
              <AccountingFactList
                tone="rose"
                items={[
                  {
                    label: "Deja reverse",
                    value: formatAmount(summary.outflow.payoutsPaid),
                    helper: "Historique regle sur les factures de payout",
                  },
                  {
                    label: "Net comptable ouvert",
                    value: formatAmount(summary.netOutstanding),
                    helper: "Ecart entre les entrees ouvertes et les sorties ouvertes",
                  },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link to="/admin/compta/sorties">Ouvrir les sorties</Link>
                </Button>
              </div>
            </AccountingPanel>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <AccountingPanel
              tone="emerald"
              icon={Coins}
              eyebrow="Comprendre les flux"
              title="Ce qui entre chez TOK"
              description="La ventilation ci-dessous explique d'ou viennent les 10% TOK sans melanger les sources."
              value={formatAmount(summary.inflow.totalCommissions)}
              valueLabel="Commission TOK"
            >
              <AccountingFactList
                tone="emerald"
                items={COMMISSION_SOURCE_ORDER.map((source) => ({
                  label: COMMISSION_SOURCE_LABELS[source],
                  value: formatAmount(summary.inflow.bySource[source]),
                }))}
              />
            </AccountingPanel>

            <AccountingPanel
              tone="violet"
              icon={Wallet}
              eyebrow="Comprendre les flux"
              title="Remboursements emis"
              description="Les remboursements clients sont suivis a part pour distinguer le deja rembourse du restant a traiter."
              value={formatAmount(refundsIssuedTotal)}
              valueLabel="Remboursements"
            >
              <AccountingFactList
                tone="violet"
                items={[
                  {
                    label: "Encore a traiter",
                    value: formatAmount(refundsPendingAmount),
                    helper: `${refundsPendingCount} dossier${refundsPendingCount > 1 ? "s" : ""} encore ouvert${refundsPendingCount > 1 ? "s" : ""}`,
                  },
                  {
                    label: "Remboursements emis",
                    value: String(refundsIssuedCount),
                  },
                ]}
              />
            </AccountingPanel>

            <AccountingPanel
              tone="primary"
              icon={Megaphone}
              eyebrow="Comprendre les flux"
              title="Encaissements hors marketplace"
              description="Les campagnes publicitaires sont volontairement separees des commissions marketplace pour garder la lecture propre."
              value={formatAmount(paidCampaignsTotal)}
              valueLabel="Campagnes payees"
            >
              <AccountingFactList
                tone="primary"
                items={[
                  {
                    label: "Campagnes reglees",
                    value: String(paidCampaignsCount),
                  },
                  {
                    label: "Lecture comptable",
                    value: "Hors 10% / 90%",
                    helper: "Ce flux ne fait pas partie des commissions marketplace",
                  },
                ]}
              />
            </AccountingPanel>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <AccountingMetricCard
              icon={Building2}
              label="Factures TOK deja encaissees"
              value={formatAmount(summary.inflow.payableCollected)}
              description="Montants deja recuperes cote facture payable unique."
            />
            <AccountingMetricCard
              icon={Wallet}
              label="Reversements deja envoyes"
              value={formatAmount(summary.outflow.payoutsPaid)}
              description="Montants deja regles aux restaurateurs sur les factures de payout."
            />
            <AccountingMetricCard
              icon={Receipt}
              label="Net comptable ouvert"
              value={formatAmount(summary.netOutstanding)}
              description="Vision synthetique du solde encore ouvert sur les deux sens de flux."
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
