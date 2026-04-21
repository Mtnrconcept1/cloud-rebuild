import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, Download, FileUp, RefreshCcw, Settings } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import {
  formatAmount,
  formatDate,
  formatPeriod,
  getInvoiceStatusClass,
  type RestaurantInvoiceRow,
  useDashboardFacturesData,
} from "./dashboardFacturesShared";

const supabase = getSupabase();

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "";
}

function InvoiceTable({
  invoices,
  canMarkPaid,
  onMarkPaid,
}: {
  invoices: RestaurantInvoiceRow[];
  canMarkPaid: boolean;
  onMarkPaid: (invoiceId: string) => Promise<void>;
}) {
  if (invoices.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Aucune facture sur cette section.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Facture</TableHead>
            <TableHead>Periode</TableHead>
            <TableHead className="text-right">Montant TTC</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Echeance</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => {
            const isPaid = String(invoice.status || "").trim().toLowerCase() === "paid";

            return (
              <TableRow key={invoice.id}>
                <TableCell>
                  <div className="font-mono text-xs">{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</div>
                </TableCell>
                <TableCell className="text-sm">{formatPeriod(invoice.period_start, invoice.period_end)}</TableCell>
                <TableCell className="text-right font-semibold">{formatAmount(invoice.amount_ttc)}</TableCell>
                <TableCell>
                  <Badge className={`text-[10px] ${getInvoiceStatusClass(invoice.status)}`}>{invoice.status || "draft"}</Badge>
                </TableCell>
                <TableCell className="text-sm">{formatDate(invoice.due_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {invoice.pdf_url ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={invoice.pdf_url} target="_blank" rel="noreferrer">
                          <Download className="mr-2 h-4 w-4" />
                          PDF
                        </a>
                      </Button>
                    ) : null}
                    {canMarkPaid && !isPaid ? (
                      <Button size="sm" variant="outline" onClick={() => void onMarkPaid(invoice.id)}>
                        Marquer payee
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function DashboardFacturesInflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const [generating, setGenerating] = useState(false);
  const isAdmin = roles.includes("admin");

  const {
    selectedRestaurant,
    summary,
    paidCampaignsCount,
    paidCampaignsTotal,
    payoutInvoiceSections,
    uninvoicedRestaurantShareBySource,
    uninvoicedRestaurantShareTotal,
    isLoading,
    error,
  } = useDashboardFacturesData();

  const inflowSourceBreakdown = useMemo(
    () =>
      COMMISSION_SOURCE_ORDER.map((source) => {
        const total = summary.inflow.bySource[source];
        const uninvoiced = uninvoicedRestaurantShareBySource[source] || 0;

        return {
          source,
          label: COMMISSION_SOURCE_LABELS[source],
          total,
          uninvoiced,
          alreadyInvoicedOrReceived: Math.max(total - uninvoiced, 0),
        };
      }),
    [summary.inflow.bySource, uninvoicedRestaurantShareBySource],
  );

  const specialOrderBreakdown = useMemo(
    () => inflowSourceBreakdown.filter(({ source }) => source === "flash_sales" || source === "anti_gaspi"),
    [inflowSourceBreakdown],
  );

  const handleGenerateInvoices = async () => {
    if (!selectedRestaurant) return;
    setGenerating(true);

    const { data, error: invokeError } = await supabase.functions.invoke("generate-invoices", {
      body: { restaurant_id: selectedRestaurant.id },
    });

    if (invokeError) {
      toast({ title: "Erreur", description: invokeError.message, variant: "destructive" });
      setGenerating(false);
      return;
    }

    toast({ title: `${Number(data?.generated || 0)} facture(s) de reversement generee(s)` });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-invoices-v2", selectedRestaurant.id] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-compta-orders-v2", selectedRestaurant.id] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-compta-reservations-v2", selectedRestaurant.id] });
    setGenerating(false);
  };

  const handleMarkPaid = async (invoiceId: string) => {
    const { error: updateError } = await supabase
      .from("restaurant_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoiceId);

    if (updateError) {
      toast({ title: "Erreur", description: updateError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Facture marquee comme payee" });
    if (selectedRestaurant) {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-invoices-v2", selectedRestaurant.id] });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="outline" className="px-3 py-1 text-[11px] uppercase tracking-[0.25em]">
              Entrees d&apos;argent
            </Badge>
            <div>
              <h1 className="font-display text-3xl font-bold">Factures faites a TOK</h1>
              <p className="text-sm text-muted-foreground">
                {selectedRestaurant
                  ? `Ce que TOK doit a ${selectedRestaurant.name}: factures emises, encours a facturer et ventilation par source.`
                  : "Selectionnez un restaurant pour afficher ses entrees d'argent."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard/factures">Vue d&apos;ensemble</Link>
            </Button>
            <Button asChild size="sm">
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
            {selectedRestaurant ? (
              <Button size="sm" onClick={handleGenerateInvoices} disabled={generating || uninvoicedRestaurantShareTotal <= 0}>
                <RefreshCcw className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                {uninvoicedRestaurantShareTotal > 0
                  ? `Facturer l'encours (${formatAmount(uninvoicedRestaurantShareTotal)})`
                  : "Rien a facturer"}
              </Button>
            ) : null}
          </div>
        </div>

        {!selectedRestaurant && !isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Selectionnez un restaurant dans la barre laterale pour afficher ses entrees d&apos;argent.
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? <p className="text-sm text-muted-foreground">Chargement des donnees comptables...</p> : null}
        {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

        {selectedRestaurant && !isLoading && !error ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-primary">Factures emises en attente</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-primary">{formatAmount(summary.inflow.receivableFromTok)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Montant deja facture a TOK et pas encore regle</p>
                </CardContent>
              </Card>
              <Card className="border-emerald-200 bg-emerald-50/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-800">Encours non facture</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-emerald-950">{formatAmount(uninvoicedRestaurantShareTotal)}</p>
                  <p className="mt-1 text-xs text-emerald-700">Part 90% deja gagnee mais pas encore emise</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Deja recu de TOK</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{formatAmount(summary.inflow.receivedFromTok)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Historique des reversements encaisses</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Part restaurant 90%</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {formatAmount(COMMISSION_SOURCE_ORDER.reduce((sum, source) => sum + summary.inflow.bySource[source], 0))}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Vue miroir par source de ce que TOK a encaisse</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <ArrowDownRight className="h-5 w-5 text-primary" />
                  <CardTitle>Origine des entrees restaurant</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {specialOrderBreakdown.map((sourceDetail) => (
                    <Card
                      key={sourceDetail.source}
                      className={sourceDetail.source === "flash_sales" ? "border-amber-200 bg-amber-50/60 shadow-none" : "border-emerald-200 bg-emerald-50/60 shadow-none"}
                    >
                      <CardContent className="space-y-3 py-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">{sourceDetail.label}</p>
                            <p className="text-2xl font-bold">{formatAmount(sourceDetail.total)}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            Commande speciale
                          </Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border bg-background/80 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Encours non facture</p>
                            <p className="mt-1 text-lg font-semibold">{formatAmount(sourceDetail.uninvoiced)}</p>
                          </div>
                          <div className="rounded-lg border bg-background/80 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Deja emis ou encaisse</p>
                            <p className="mt-1 text-lg font-semibold">{formatAmount(sourceDetail.alreadyInvoicedOrReceived)}</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          La part restaurateur de cette source est detaillee separement pour rendre visibles les ventes flash et l&apos;anti-gaspi.
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  {inflowSourceBreakdown.map((sourceDetail) => (
                  <Card key={sourceDetail.source} className="shadow-none">
                    <CardContent className="space-y-2 py-5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-muted-foreground">{sourceDetail.label}</p>
                        {sourceDetail.source === "flash_sales" || sourceDetail.source === "anti_gaspi" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Focus
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-2xl font-bold">{formatAmount(sourceDetail.total)}</p>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>Encours non facture: {formatAmount(sourceDetail.uninvoiced)}</p>
                        <p>Deja emis ou encaisse: {formatAmount(sourceDetail.alreadyInvoicedOrReceived)}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Depenses marketing</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Les campagnes publicitaires payees par votre restaurant sont suivies ici a part. Elles ne font pas partie des entrees restaurant ni de votre part 90%.
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
                        Depense separee
                      </Badge>
                    </div>
                    <p className="text-xs text-orange-800">
                      {paidCampaignsCount} campagne{paidCampaignsCount > 1 ? "s" : ""} payee{paidCampaignsCount > 1 ? "s" : ""} pour ce restaurant.
                    </p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <FileUp className="h-4 w-4" />
                Factures faites a TOK
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">A encaisser</CardTitle>
                </CardHeader>
                <CardContent>
                  <InvoiceTable invoices={payoutInvoiceSections.actionable} canMarkPaid={isAdmin} onMarkPaid={handleMarkPaid} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Historique</CardTitle>
                </CardHeader>
                <CardContent>
                  <InvoiceTable invoices={payoutInvoiceSections.history} canMarkPaid={isAdmin} onMarkPaid={handleMarkPaid} />
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
