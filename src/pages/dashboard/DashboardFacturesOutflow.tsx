import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Download, ReceiptText, Settings } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
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

export default function DashboardFacturesOutflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");

  const {
    selectedRestaurant,
    summary,
    reservationFees,
    tokFeeInvoiceSections,
    isLoading,
    error,
  } = useDashboardFacturesData();

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
      await queryClient.invalidateQueries({ queryKey: ["dashboard-reservation-fee-rows-v3", selectedRestaurant.id] });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="outline" className="px-3 py-1 text-[11px] uppercase tracking-[0.25em]">
              Sorties d&apos;argent
            </Badge>
            <div>
              <h1 className="font-display text-3xl font-bold">Factures recues de TOK</h1>
              <p className="text-sm text-muted-foreground">
                {selectedRestaurant
                  ? `Ce que ${selectedRestaurant.name} doit a TOK: factures ouvertes et frais reservation non encore emis.`
                  : "Selectionnez un restaurant pour afficher ses sorties d'argent."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard/factures">Vue d&apos;ensemble</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard/factures/entrees">Entrees d&apos;argent</Link>
            </Button>
            <Button asChild size="sm">
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
              Selectionnez un restaurant dans la barre laterale pour afficher ses sorties d&apos;argent.
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? <p className="text-sm text-muted-foreground">Chargement des donnees comptables...</p> : null}
        {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

        {selectedRestaurant && !isLoading && !error ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="border-orange-200 bg-orange-50/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-orange-800">Factures TOK a payer</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-orange-950">{formatAmount(summary.outflow.payableToTok)}</p>
                  <p className="mt-1 text-xs text-orange-700">Factures deja emises par TOK encore ouvertes</p>
                </CardContent>
              </Card>
              <Card className="border-amber-200 bg-amber-50/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-amber-800">Frais reservation non factures</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-amber-950">{formatAmount(reservationFees.amount)}</p>
                  <p className="mt-1 text-xs text-amber-700">
                    {reservationFees.count} reservation{reservationFees.count > 1 ? "s" : ""} confirmee{reservationFees.count > 1 ? "s" : ""} en attente de facture
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Deja paye a TOK</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{formatAmount(summary.outflow.alreadyPaidToTok)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Historique des factures TOK reglees</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Sortie ouverte totale</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{formatAmount(summary.outflow.payableToTok + reservationFees.amount)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Factures TOK + frais encore non emis</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-orange-700">
                <ArrowUpRight className="h-4 w-4" />
                Factures recues de TOK
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">A regler</CardTitle>
                </CardHeader>
                <CardContent>
                  <InvoiceTable invoices={tokFeeInvoiceSections.actionable} canMarkPaid={isAdmin} onMarkPaid={handleMarkPaid} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <ReceiptText className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">Historique</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <InvoiceTable invoices={tokFeeInvoiceSections.history} canMarkPaid={isAdmin} onMarkPaid={handleMarkPaid} />
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
