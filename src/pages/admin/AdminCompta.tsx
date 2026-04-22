import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Building2, Coins, Megaphone, Receipt, Store, Wallet } from "lucide-react";

import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    paidEventGross,
    paidCampaignsCount,
    paidCampaignsTotal,
    miamzReimbursementsCount,
    miamzReimbursementsOutstanding,
    miamzReimbursementsTotal,
    monthOptions,
    isLoading,
    error,
  } = useAdminComptaData(selectedRestaurant, selectedMonth);
  const totalPayableOpen = summary.inflow.payableOutstanding + payableAccruals.totalAmount;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge variant="outline" className="px-3 py-1 text-[11px] uppercase tracking-[0.25em]">
            Comptabilite TOK
          </Badge>
          <div>
            <h1 className="font-display text-3xl font-bold">Page d&apos;accueil compta</h1>
            <p className="text-sm text-muted-foreground">
              Vue d&apos;ensemble des paiements encaisses par TOK, des commissions 10% par source et des mouvements ouverts avec les restaurateurs.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/admin/compta">Vue d&apos;ensemble</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/compta/entrees">Entrees d&apos;argent</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/compta/sorties">Sorties d&apos;argent</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_220px_220px]">
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 py-4">
            <Store className="h-5 w-5 text-primary" />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Portee</p>
              <p className="truncate text-sm font-semibold">
                {selectedRestaurant === "all"
                  ? "Tous les restaurateurs"
                  : restaurants.find((restaurant) => restaurant.id === selectedRestaurant)?.name || "Restaurateur"}
              </p>
            </div>
          </CardContent>
        </Card>

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
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Chargement des donnees comptables...</p> : null}
      {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

      {!isLoading && !error ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="border-sky-200 bg-sky-50/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-sky-800">Paiements clients passes par TOK</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-sky-950">{formatAmount(paidEventGross)}</p>
                <p className="mt-1 text-xs text-sky-700">Base de calcul globale avant ventilation 10% / 90%</p>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-emerald-800">Commissions TOK 10%</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-emerald-950">{formatAmount(summary.inflow.totalCommissions)}</p>
                <p className="mt-1 text-xs text-emerald-700">Part TOK issue des paiements confirms</p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-800">Facturation restaurateurs ouverte</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-amber-950">{formatAmount(totalPayableOpen)}</p>
                <p className="mt-1 text-xs text-amber-700">
                  {formatAmount(summary.inflow.payableOutstanding)} deja facture + {formatAmount(payableAccruals.totalAmount)} non facture
                </p>
              </CardContent>
            </Card>

            <Card className="border-violet-200 bg-violet-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-violet-800">Paiements Miamz</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-violet-950">{formatAmount(miamzReimbursementsTotal)}</p>
                <p className="mt-1 text-xs text-violet-700">
                  {miamzReimbursementsCount} commande{miamzReimbursementsCount > 1 ? "s" : ""} avec Miamz, dont {formatAmount(miamzReimbursementsOutstanding)} encore non facture
                </p>
              </CardContent>
            </Card>

            <Card className="border-rose-200 bg-rose-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-rose-800">Sorties a traiter</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-rose-950">{formatAmount(summary.outflow.payoutsOutstanding)}</p>
                <p className="mt-1 text-xs text-rose-700">Factures recues des restaurateurs a regler</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-600" />
                <CardTitle>Origine des 10% TOK</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Chaque paiement confirme est affecte a une seule source pour rendre les 10% lisibles sans melange.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {COMMISSION_SOURCE_ORDER.map((source) => (
                <Card key={source} className="border-border/60 bg-muted/20 shadow-none">
                  <CardContent className="space-y-2 py-5">
                    <p className="text-sm font-medium text-muted-foreground">{COMMISSION_SOURCE_LABELS[source]}</p>
                    <p className="text-2xl font-bold">{formatAmount(summary.inflow.bySource[source])}</p>
                    <p className="text-xs text-muted-foreground">Commission TOK sur cette source</p>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-violet-600" />
                <CardTitle>Paiements Miamz rembourses aux restaurateurs</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Les reductions Miamz appliquees par les clients sont remboursees par TOK aux restaurateurs et restent visibles a part, meme si elles sont integrees aux reversements.
              </p>
            </CardHeader>
            <CardContent>
              <Card className="border-violet-200 bg-violet-50/60 shadow-none">
                <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Remboursements Miamz</p>
                    <p className="text-2xl font-bold">{formatAmount(miamzReimbursementsTotal)}</p>
                    <p className="text-xs text-muted-foreground">
                      {miamzReimbursementsCount} commande{miamzReimbursementsCount > 1 ? "s" : ""} avec remise Miamz sur le filtre courant
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit text-[11px] uppercase tracking-wide">
                    Inclus dans les reversements restaurants
                  </Badge>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                <CardTitle>Autres encaissements TOK</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Revenus encaisses par TOK hors commissions marketplace et hors ventilation 10% / 90%.
              </p>
            </CardHeader>
            <CardContent>
              <Card className="border-border/60 bg-muted/20 shadow-none">
                <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Campagnes publicitaires</p>
                    <p className="text-2xl font-bold">{formatAmount(paidCampaignsTotal)}</p>
                    <p className="text-xs text-muted-foreground">
                      {paidCampaignsCount} campagne{paidCampaignsCount > 1 ? "s" : ""} payee{paidCampaignsCount > 1 ? "s" : ""} sur le filtre courant
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit text-[11px] uppercase tracking-wide">
                    Hors commissions marketplace
                  </Badge>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Button asChild size="lg" className="h-32 text-lg font-semibold">
              <Link to="/admin/compta/entrees" className="flex flex-col items-center justify-center gap-2 text-center">
                <ArrowDownRight className="h-7 w-7" />
                <span>Factures faites aux restaurateurs</span>
                <span className="text-sm font-normal opacity-80">Voir uniquement ce qui entre chez TOK</span>
              </Link>
            </Button>

            <Button asChild size="lg" variant="outline" className="h-32 text-lg font-semibold">
              <Link to="/admin/compta/sorties" className="flex flex-col items-center justify-center gap-2 text-center">
                <ArrowUpRight className="h-7 w-7" />
                <span>Factures recues des restaurateurs</span>
                <span className="text-sm font-normal text-muted-foreground">Voir uniquement ce qui sort de TOK</span>
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 py-5">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Factures TOK deja encaissees</p>
                  <p className="text-xl font-semibold">{formatAmount(summary.inflow.payableCollected)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-5">
                <Wallet className="h-5 w-5 text-rose-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Reversements deja envoyes</p>
                  <p className="text-xl font-semibold">{formatAmount(summary.outflow.payoutsPaid)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-5">
                <Receipt className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Net comptable ouvert</p>
                  <p className="text-xl font-semibold">{formatAmount(summary.netOutstanding)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
