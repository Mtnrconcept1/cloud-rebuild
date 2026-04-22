import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Coins, ReceiptText, Settings, Wallet } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    miamzReimbursementsCount,
    miamzReimbursementsOutstanding,
    miamzReimbursementsTotal,
    summary,
    reservationFees,
    paidCampaignsCount,
    paidCampaignsTotal,
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="outline" className="px-3 py-1 text-[11px] uppercase tracking-[0.25em]">
              Comptabilite restaurateur
            </Badge>
            <div>
              <h1 className="font-display text-3xl font-bold">Page d&apos;accueil compta</h1>
              <p className="text-sm text-muted-foreground">
                {selectedRestaurant
                  ? `Vue d'ensemble des entrees et sorties d'argent pour ${selectedRestaurant.name}, avec separation explicite des commandes, ventes flash et anti-gaspi.`
                  : "Selectionnez un restaurant depuis la barre laterale pour ouvrir la comptabilite."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>

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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Card className="border-sky-200 bg-sky-50/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-sky-800">Paiements clients via TOK</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-sky-950">{formatAmount(totalPaidThroughTok)}</p>
                  <p className="mt-1 text-xs text-sky-700">Base globale avant separation 10% TOK / 90% restaurant</p>
                </CardContent>
              </Card>

              <Card className="border-emerald-200 bg-emerald-50/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-800">Part restaurant 90%</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-emerald-950">{formatAmount(totalRestaurantShare)}</p>
                  <p className="mt-1 text-xs text-emerald-700">Ce que votre restaurant genere sur les paiements encaisses</p>
                </CardContent>
              </Card>

              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-primary">A recevoir de TOK</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-primary">{formatAmount(totalReceivable)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatAmount(summary.inflow.receivableFromTok)} deja facture + {formatAmount(uninvoicedRestaurantShareTotal)} encore non facture
                  </p>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-50/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-orange-800">A payer a TOK</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-orange-950">{formatAmount(totalPayable)}</p>
                  <p className="mt-1 text-xs text-orange-700">
                    {formatAmount(summary.outflow.payableToTok)} facture + {formatAmount(reservationFees.amount)} frais reservation non encore factures
                  </p>
                </CardContent>
              </Card>

              <Card className="border-violet-200 bg-violet-50/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-violet-800">Remboursements Miamz</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-violet-950">{formatAmount(miamzReimbursementsTotal)}</p>
                  <p className="mt-1 text-xs text-violet-700">
                    {miamzReimbursementsCount} commande{miamzReimbursementsCount > 1 ? "s" : ""} avec Miamz, dont {formatAmount(miamzReimbursementsOutstanding)} encore non facture
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-emerald-600" />
                  <CardTitle>Origine de votre part 90%</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">
                  La ventilation est identique a celle de TOK, mais affichee du point de vue restaurateur. Les ventes flash et l&apos;anti-gaspi restent visibles comme sources distinctes.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {COMMISSION_SOURCE_ORDER.map((source) => (
                  <Card key={source} className="border-border/60 bg-muted/20 shadow-none">
                    <CardContent className="space-y-2 py-5">
                      <p className="text-sm font-medium text-muted-foreground">{COMMISSION_SOURCE_LABELS[source]}</p>
                      <p className="text-2xl font-bold">{formatAmount(summary.inflow.bySource[source])}</p>
                      <p className="text-xs text-muted-foreground">
                        {source === "anti_gaspi"
                          ? "Part restaurant sur les commandes anti-gaspi"
                          : source === "flash_sales"
                            ? "Part restaurant sur les ventes flash"
                            : "Part restaurant sur cette source"}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Depenses marketing</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Depenses payees par votre restaurant pour la publicite. Ce bloc reste volontairement separe de votre part 90% et des commissions marketplace.
                </p>
              </CardHeader>
              <CardContent>
                <Card className="border-orange-200 bg-orange-50/60 shadow-none">
                  <CardContent className="space-y-2 py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Campagnes publicitaires</p>
                        <p className="text-2xl font-bold text-orange-950">{formatAmount(paidCampaignsTotal)}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        Hors part 90%
                      </Badge>
                    </div>
                    <p className="text-xs text-orange-800">
                      {paidCampaignsCount} campagne{paidCampaignsCount > 1 ? "s" : ""} payee{paidCampaignsCount > 1 ? "s" : ""} par votre restaurant.
                    </p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Miamz rembourses par TOK</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Lorsqu&apos;un client paye une partie de sa commande en Miamz, TOK rembourse ce montant a votre restaurant. Ce flux reste visible a part mais il est integre a vos reversements.
                </p>
              </CardHeader>
              <CardContent>
                <Card className="border-violet-200 bg-violet-50/60 shadow-none">
                  <CardContent className="space-y-2 py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Remboursements Miamz</p>
                        <p className="text-2xl font-bold text-violet-950">{formatAmount(miamzReimbursementsTotal)}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        Inclus dans vos reversements
                      </Badge>
                    </div>
                    <p className="text-xs text-violet-800">
                      {miamzReimbursementsCount} commande{miamzReimbursementsCount > 1 ? "s" : ""} avec Miamz sur le filtre courant, dont {formatAmount(miamzReimbursementsOutstanding)} encore non facture.
                    </p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Button asChild size="lg" className="h-32 text-lg font-semibold">
                <Link to="/dashboard/factures/entrees" className="flex flex-col items-center justify-center gap-2 text-center">
                  <ArrowDownRight className="h-7 w-7" />
                  <span>Factures faites a TOK</span>
                  <span className="text-sm font-normal opacity-80">Entrées d&apos;argent pour votre restaurant</span>
                </Link>
              </Button>

              <Button asChild size="lg" variant="outline" className="h-32 text-lg font-semibold">
                <Link to="/dashboard/factures/sorties" className="flex flex-col items-center justify-center gap-2 text-center">
                  <ArrowUpRight className="h-7 w-7" />
                  <span>Factures recues de TOK</span>
                  <span className="text-sm font-normal text-muted-foreground">Sorties d&apos;argent vers TOK</span>
                </Link>
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="flex items-center gap-3 py-5">
                  <Wallet className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Deja recu de TOK</p>
                    <p className="text-xl font-semibold">{formatAmount(summary.inflow.receivedFromTok)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 py-5">
                  <ArrowUpRight className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Deja paye a TOK</p>
                    <p className="text-xl font-semibold">{formatAmount(summary.outflow.alreadyPaidToTok)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 py-5">
                  <ReceiptText className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Net ouvert</p>
                    <p className="text-xl font-semibold">{formatAmount(totalReceivable - totalPayable)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
