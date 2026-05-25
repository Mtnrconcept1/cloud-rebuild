import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Coins, HandCoins, Megaphone, ReceiptText, Settings, Wallet } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { AccountingDigestCard, AccountingFactList, AccountingHero, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatAmount,
  useDashboardFacturesData,
} from "./dashboardFacturesShared";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "";
}

export default function DashboardFactures() {
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

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <AccountingHero
          badge="Comptabilite restaurateur"
          title="Vue comptable"
          description={selectedRestaurant
            ? "Les chiffres essentiels: ce que Tok vous doit, ce que vous devez a Tok, les Miamz pris en charge et le net ouvert."
            : "Selectionnez un restaurant depuis la barre laterale pour ouvrir la comptabilite."}
          actions={(
            <>
              <Button asChild size="sm">
                <Link to="/dashboard/factures">Vue d&apos;ensemble</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/entrees">Entrees</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/sorties">Sorties</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/parametres">
                  <Settings className="mr-2 h-4 w-4" />
                  Parametres
                </Link>
              </Button>
            </>
          )}
        />

        {!selectedRestaurant && !isLoading ? (
          <Card className="tok-dashboard-section rounded-3xl border border-border/70">
            <CardContent className="py-10 text-center text-muted-foreground dark:text-slate-100/78">
              <ReceiptText className="mx-auto mb-3 h-10 w-10 text-[#ff6a1a] opacity-80" />
              <p>Selectionnez un restaurant dans la barre laterale pour afficher sa comptabilite.</p>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? <p className="text-sm text-muted-foreground">Chargement des donnees comptables...</p> : null}
        {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

        {selectedRestaurant && !isLoading && !error ? (
          <>
            <AccountingDigestCard
              title="A lire en premier"
              description="Une lecture courte pour savoir quoi encaisser, quoi payer et ce que Tok finance en Miamz."
              items={[
                {
                  tone: "primary",
                  icon: ArrowDownRight,
                  label: "A recevoir de Tok",
                  value: formatAmount(totalReceivable),
                  helper: `${formatAmount(summary.inflow.receivableFromTok)} deja facture, ${formatAmount(uninvoicedRestaurantShareTotal)} a facturer.`,
                },
                {
                  tone: "orange",
                  icon: ArrowUpRight,
                  label: "A payer a Tok",
                  value: formatAmount(totalPayable),
                  helper: `${formatAmount(summary.outflow.payableToTok)} facture, ${formatAmount(payableAccruals.totalAmount)} en attente.`,
                },
                {
                  tone: "violet",
                  icon: HandCoins,
                  label: "Miamz pris en charge",
                  value: formatAmount(tokCoveredMiamzAmount),
                  helper: `${tokCoveredMiamzCount} commande${tokCoveredMiamzCount > 1 ? "s" : ""} avec reduction Miamz remboursee par Tok.`,
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

            <div className="grid gap-4 xl:grid-cols-2">
              <AccountingPanel
                tone="primary"
                icon={ArrowDownRight}
                eyebrow="Action"
                title="Ce que Tok vous doit"
                description="La part restaurant a recuperer, separee entre facture deja emise et encours."
                value={formatAmount(totalReceivable)}
                valueLabel="Entrees ouvertes"
              >
                <AccountingFactList
                  tone="primary"
                  items={[
                    {
                      label: "Deja facture et en attente",
                      value: formatAmount(summary.inflow.receivableFromTok),
                    },
                    {
                      label: "Encore a facturer",
                      value: formatAmount(uninvoicedRestaurantShareTotal),
                      helper: "Part 90% deja acquise mais pas encore emise.",
                    },
                    {
                      label: "Deja recu de Tok",
                      value: formatAmount(summary.inflow.receivedFromTok),
                    },
                  ]}
                />
                <Button asChild>
                  <Link to="/dashboard/factures/entrees">Ouvrir les entrees</Link>
                </Button>
              </AccountingPanel>

              <AccountingPanel
                tone="orange"
                icon={ArrowUpRight}
                eyebrow="Action"
                title="Ce que vous devez a Tok"
                description="Les factures Tok ouvertes et les lignes qui arriveront dans une prochaine facture."
                value={formatAmount(totalPayable)}
                valueLabel="Sorties ouvertes"
              >
                <AccountingFactList
                  tone="orange"
                  items={[
                    {
                      label: "Factures Tok deja emises",
                      value: formatAmount(summary.outflow.payableToTok),
                    },
                    {
                      label: "Encours non facture",
                      value: formatAmount(payableAccruals.totalAmount),
                      helper: `${payableAccruals.totalCount} ligne${payableAccruals.totalCount > 1 ? "s" : ""} en attente.`,
                    },
                    {
                      label: "Deja paye a Tok",
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
                title="Ce qui explique vos entrees"
                description="La base client, la part restaurant et le montant Miamz finance par Tok."
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
                      label: "Miamz pris en charge par Tok",
                      value: formatAmount(tokCoveredMiamzAmount),
                      helper: "Reduction client ajoutee a votre base de reversement.",
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
                      label: "Campagnes payees",
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
