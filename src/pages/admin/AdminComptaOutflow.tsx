import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, FileUp, Receipt, Wallet } from "lucide-react";

import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { InvoiceDetailAccordion } from "@/components/invoices/InvoiceDetailAccordion";
import {
  formatAmount,
  formatDate,
  formatPeriod,
  getInvoiceStatusClass,
  type AdminInvoiceRow,
  useAdminPayoutInvoiceDetailLines,
  useAdminComptaData,
} from "./adminComptaShared";

const supabase = getSupabase();

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "";
}

function InvoiceTableRow({
  invoice,
  isExpanded,
  onToggleDetail,
  onMarkPaid,
}: {
  invoice: AdminInvoiceRow;
  isExpanded: boolean;
  onToggleDetail: (invoiceId: string) => void;
  onMarkPaid: (invoice: AdminInvoiceRow) => Promise<void>;
}) {
  const detailQuery = useAdminPayoutInvoiceDetailLines(isExpanded ? invoice.id : null);
  const isPaid = String(invoice.status || "").trim().toLowerCase() === "paid";
  const detailButtonLabel = isExpanded ? "Masquer le detail" : "Voir le detail";

  return (
    <>
      <TableRow key={invoice.id}>
        <TableCell>
          <div className="font-mono text-xs">{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
          <div className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</div>
          <div className="text-xs text-muted-foreground">
            Facture emise par : {invoice.restaurants?.name || "-"}
          </div>
        </TableCell>
        <TableCell className="text-sm">{invoice.restaurants?.name || "-"}</TableCell>
        <TableCell className="text-sm">{formatPeriod(invoice.period_start, invoice.period_end)}</TableCell>
        <TableCell className="text-right font-semibold">{formatAmount(invoice.amount_ttc)}</TableCell>
        <TableCell>
          <Badge className={`text-[10px] ${getInvoiceStatusClass(invoice.status)}`}>{invoice.status || "draft"}</Badge>
        </TableCell>
        <TableCell className="text-sm">{formatDate(invoice.due_at)}</TableCell>
        <TableCell className="text-right">
          <div className="flex flex-col items-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => onToggleDetail(invoice.id)}>
              {detailButtonLabel}
            </Button>
            {isPaid ? (
              <span className="text-xs text-muted-foreground">Reglee</span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void onMarkPaid(invoice)}>
                Marquer payee
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {isExpanded ? (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={7} className="px-4 py-5">
            <InvoiceDetailAccordion
              mode="payout"
              lines={detailQuery.data || []}
              loading={detailQuery.isLoading}
              error={detailQuery.error}
              invoiceAmountTtc={invoice.amount_ttc}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function InvoiceTable({
  invoices,
  onMarkPaid,
}: {
  invoices: AdminInvoiceRow[];
  onMarkPaid: (invoice: AdminInvoiceRow) => Promise<void>;
}) {
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

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
            <TableHead>Restaurant</TableHead>
            <TableHead>Periode</TableHead>
            <TableHead className="text-right">Montant TTC</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Echeance</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => {
            return (
              <InvoiceTableRow
                key={invoice.id}
                invoice={invoice}
                isExpanded={expandedInvoiceId === invoice.id}
                onToggleDetail={(invoiceId) => {
                  setExpandedInvoiceId((current) => (current === invoiceId ? null : invoiceId));
                }}
                onMarkPaid={onMarkPaid}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AdminComptaOutflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRestaurant, setSelectedRestaurant] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const currentDate = new Date();
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  });

  const {
    restaurants,
    miamzReimbursementsCount,
    miamzReimbursementsOutstanding,
    miamzReimbursementsTotal,
    summary,
    payoutInvoiceSections,
    monthOptions,
    isLoading,
    error,
  } = useAdminComptaData(selectedRestaurant, selectedMonth);

  const handleMarkPaid = async (invoice: AdminInvoiceRow) => {
    const { error: updateError } = await supabase
      .from("restaurant_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoice.id);

    if (updateError) {
      toast({ title: "Erreur", description: updateError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Reversement marque comme paye" });
    await queryClient.invalidateQueries({ queryKey: ["admin-compta-payout-invoices-v2"] });
  };

  const totalRestaurantShare = COMMISSION_SOURCE_ORDER.reduce(
    (sum, source) => sum + summary.outflow.bySource[source],
    0,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge variant="outline" className="px-3 py-1 text-[11px] uppercase tracking-[0.25em]">
            Sorties d&apos;argent
          </Badge>
          <div>
            <h1 className="font-display text-3xl font-bold">Factures recues des restaurateurs</h1>
            <p className="text-sm text-muted-foreground">
              Ecran dedie a ce qui sort de TOK: reversements dus aux restaurateurs et factures de payout a regler.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/compta">Vue d&apos;ensemble</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/compta/entrees">Entrees d&apos;argent</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/admin/compta/sorties">Sorties d&apos;argent</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-2">
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
            <Card className="border-rose-200 bg-rose-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-rose-800">A reverser</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-rose-950">{formatAmount(summary.outflow.payoutsOutstanding)}</p>
                <p className="mt-1 text-xs text-rose-700">Factures recues des restaurateurs encore ouvertes</p>
              </CardContent>
            </Card>
            <Card className="border-violet-200 bg-violet-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-violet-800">Paiements Miamz</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-violet-950">{formatAmount(miamzReimbursementsTotal)}</p>
                <p className="mt-1 text-xs text-violet-700">
                  {miamzReimbursementsCount} commande{miamzReimbursementsCount > 1 ? "s" : ""} avec remise Miamz, dont {formatAmount(miamzReimbursementsOutstanding)} encore non facture
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Deja reverse</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{formatAmount(summary.outflow.payoutsPaid)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Historique des reversements regles</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Part restaurants 90%</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{formatAmount(totalRestaurantShare)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Ventilation miroir des paiements du mois</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Net comptable ouvert</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{formatAmount(summary.netOutstanding)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Entrees ouvertes moins reversements ouverts</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-rose-600" />
                <CardTitle>Origine des reversements restaurateurs</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Les reversements incluent la part 90% restaurant ainsi que les remboursements Miamz quand un client utilise ses points sur une commande.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {COMMISSION_SOURCE_ORDER.map((source) => (
                <Card key={source} className="shadow-none">
                  <CardContent className="space-y-2 py-5">
                    <p className="text-sm font-medium text-muted-foreground">{COMMISSION_SOURCE_LABELS[source]}</p>
                    <p className="text-2xl font-bold">{formatAmount(summary.outflow.bySource[source])}</p>
                    <p className="text-xs text-muted-foreground">Part restaurateur provenant de cette source</p>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
              <ArrowUpRight className="h-4 w-4" />
              Factures recues des restaurateurs
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FileUp className="h-4 w-4 text-rose-600" />
                  <CardTitle className="text-base">A regler</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <InvoiceTable invoices={payoutInvoiceSections.actionable} onMarkPaid={handleMarkPaid} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Historique</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <InvoiceTable invoices={payoutInvoiceSections.history} onMarkPaid={handleMarkPaid} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
