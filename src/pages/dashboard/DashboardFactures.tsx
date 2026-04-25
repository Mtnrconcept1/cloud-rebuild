import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Coins, Megaphone, ReceiptText, Settings, Wallet } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { AccountingFactList, AccountingHero, AccountingMetricCard, AccountingPanel } from "@/components/invoices/AccountingCockpit";
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <AccountingHero
          badge="Comptabilite restaurateur"
          title="Piloter votre compta"
          description={selectedRestaurant
            ? `Commencez par ce que TOK vous doit, puis par ce que vous devez a TOK. La lecture detaillee des flux reste visible plus bas sans encombrer l'ecran.`
            : "Selectionnez un restaurant depuis la barre laterale pour ouvrir la comptabilite."}
          actions={(
            <>
              <Button asChild size="sm">
                <Link to="/dashboard/factures">Vue d&apos;ensemble</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/entrees">Entrees d&apos;argent</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/sorties">Sorties d&apos;argent</Link>
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
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <ReceiptText className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>Selectionnez un restaurant dans la barre laterale pour afficher sa comptabilite.</p>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? <p className="text-sm text-muted-foreground">Chargement des donnees comptables...</p> : null}
        {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

        {selectedRestaurant && !isLoading && !error ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <AccountingMetricCard
                tone="primary"
                icon={ArrowDownRight}
                label="A recevoir de TOK"
                value={formatAmount(totalReceivable)}
                description={`${formatAmount(summary.inflow.receivableFromTok)} deja facture et ${formatAmount(uninvoicedRestaurantShareTotal)} encore a facturer.`}
              />
              <AccountingMetricCard
                tone="orange"
                icon={ArrowUpRight}
                label="A payer a TOK"
                value={formatAmount(totalPayable)}
                description={`${formatAmount(summary.outflow.payableToTok)} deja facture et ${formatAmount(payableAccruals.totalAmount)} encore non facture.`}
              />
              <AccountingMetricCard
                tone="emerald"
                icon={Coins}
                label="Part restaurant 90%"
                value={formatAmount(totalRestaurantShare)}
                description="Ce que votre restaurant a deja genere sur les paiements encaisses via TOK."
              />
              <AccountingMetricCard
                tone="violet"
                icon={Wallet}
                label="Remboursements clients"
                value={formatAmount(refundsIssuedTotal)}
                description={`${refundsIssuedCount} remboursement${refundsIssuedCount > 1 ? "s" : ""} emis, dont ${formatAmount(refundsPendingAmount)} encore a traiter sur ${refundsPendingCount} dossier${refundsPendingCount > 1 ? "s" : ""}.`}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <AccountingPanel
                tone="primary"
                icon={ArrowDownRight}
                eyebrow="A faire maintenant"
                title="Ce que TOK vous doit"
                description="Ce bloc reunit le suivi immediat des montants que vous pouvez attendre ou encore faire emettre."
                value={formatAmount(totalReceivable)}
                valueLabel="Entrees ouvertes"
              >
                <AccountingFactList
                  tone="primary"
                  items={[
                    {
                      label: "Deja facture et en attente",
                      value: formatAmount(summary.inflow.receivableFromTok),
                      helper: "Factures de payout deja emises par votre restaurant",
                    },
                    {
                      label: "Encore a facturer",
                      value: formatAmount(uninvoicedRestaurantShareTotal),
                      helper: "Part 90% deja acquise mais pas encore emise",
                    },
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link to="/dashboard/factures/entrees">Ouvrir les entrees</Link>
                  </Button>
                </div>
              </AccountingPanel>

              <AccountingPanel
                tone="orange"
                icon={ArrowUpRight}
                eyebrow="A faire maintenant"
                title="Ce que vous devez a TOK"
                description="Retrouvez ici ce qui est deja facture par TOK et ce qui risque d'arriver dans la prochaine facture."
                value={formatAmount(totalPayable)}
                valueLabel="Sorties ouvertes"
              >
                <AccountingFactList
                  tone="orange"
                  items={[
                    {
                      label: "Factures deja emises par TOK",
                      value: formatAmount(summary.outflow.payableToTok),
                      helper: "Montants deja ouverts sur vos factures TOK",
                    },
                    {
                      label: "Encours non encore facture",
                      value: formatAmount(payableAccruals.totalAmount),
                      helper: `${payableAccruals.totalCount} ligne${payableAccruals.totalCount > 1 ? "s" : ""} encore en attente de facture`,
                    },
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link to="/dashboard/factures/sorties">Ouvrir les sorties</Link>
                  </Button>
                </div>
              </AccountingPanel>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <AccountingPanel
                tone="emerald"
                icon={Coins}
                eyebrow="Comprendre les flux"
                title="D'ou vient votre part 90%"
                description="La ventilation reste visible par source, mais dans un bloc compact plus lisible."
                value={formatAmount(totalRestaurantShare)}
                valueLabel="Part restaurant"
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
                description="Les annulations remboursees restent visibles a part pour suivre ce qui a deja ete rembourse et ce qui attend encore un traitement."
                value={formatAmount(refundsIssuedTotal)}
                valueLabel="Remboursements"
              >
                <AccountingFactList
                  tone="violet"
                  items={[
                    {
                      label: "Encore a traiter",
                      value: formatAmount(refundsPendingAmount),
                    },
                    {
                      label: "Dossiers en attente",
                      value: String(refundsPendingCount),
                    },
                    {
                      label: "Remboursements emis",
                      value: String(refundsIssuedCount),
                    },
                  ]}
                />
              </AccountingPanel>

              <AccountingPanel
                tone="amber"
                icon={Megaphone}
                eyebrow="Comprendre les flux"
                title="Depenses marketing"
                description="Les campagnes publicitaires restent visibles a part pour ne pas brouiller vos flux de marketplace."
                value={formatAmount(paidCampaignsTotal)}
                valueLabel="Campagnes payees"
              >
                <AccountingFactList
                  tone="amber"
                  items={[
                    {
                      label: "Campagnes concernees",
                      value: String(paidCampaignsCount),
                    },
                    {
                      label: "Lecture comptable",
                      value: "Hors part 90%",
                      helper: "Ce flux n'entre ni dans vos reversements ni dans les commissions marketplace",
                    },
                  ]}
                />
              </AccountingPanel>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <AccountingMetricCard
                icon={Coins}
                label="Paiements clients via TOK"
                value={formatAmount(totalPaidThroughTok)}
                description="Base globale avant separation entre la part restaurant et la commission TOK."
              />
              <AccountingMetricCard
                icon={Wallet}
                label="Deja recu de TOK"
                value={formatAmount(summary.inflow.receivedFromTok)}
                description="Historique des reversements deja encaisses par votre restaurant."
              />
              <AccountingMetricCard
                icon={ReceiptText}
                label="Net ouvert"
                value={formatAmount(totalReceivable - totalPayable)}
                description="Difference entre ce que TOK vous doit et ce que vous devez encore a TOK."
              />
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
