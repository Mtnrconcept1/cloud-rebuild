import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, Coins, FileDown, RefreshCcw } from "lucide-react";

import { TokPayableInvoiceDialog } from "@/components/invoices/TokPayableInvoiceDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import type { PayableInvoiceRow } from "@/lib/payableInvoice";
import {
  formatAmount,
  formatDate,
  formatPeriod,
  getInvoiceStatusClass,
  type AdminInvoiceRow,
  useAdminComptaData,
} from "./adminComptaShared";

const supabase = getSupabase();

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "";
}

function InvoiceTableRow({
  invoice,
  onMarkPaid,
}: {
  invoice: PayableInvoiceRow;
  onMarkPaid: (invoice: PayableInvoiceRow) => Promise<void>;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const isPaid = String(invoice.status || "").trim().toLowerCase() === "paid";

  return (
    <>
      <TableRow key={invoice.id}>
        <TableCell>
          <div className="font-mono text-xs">{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
          <div className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</div>
          <div className="text-xs text-muted-foreground">
            Facture adressee a : {invoice.restaurants?.name || "-"}
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
            <Button size="sm" variant="ghost" onClick={() => setPreviewOpen(true)}>
              Voir la facture
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
      <TokPayableInvoiceDialog invoice={previewOpen ? invoice : null} open={previewOpen} onOpenChange={setPreviewOpen} />
    </>
  );
}

function InvoiceTable({
  invoices,
  onMarkPaid,
}: {
  invoices: PayableInvoiceRow[];
  onMarkPaid: (invoice: PayableInvoiceRow) => Promise<void>;
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
            <TableHead>Restaurant</TableHead>
            <TableHead>Periode</TableHead>
            <TableHead className="text-right">Montant TTC</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Echeance</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <InvoiceTableRow key={invoice.id} invoice={invoice} onMarkPaid={onMarkPaid} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AdminComptaInflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRestaurant, setSelectedRestaurant] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const currentDate = new Date();
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  });
  const [generating, setGenerating] = useState(false);

  const {
    restaurants,
    summary,
    payableAccruals,
    miamzReimbursementsCount,
    miamzReimbursementsTotal,
    monthOptions,
    payableInvoiceSections,
    isLoading,
    error,
  } = useAdminComptaData(selectedRestaurant, selectedMonth);
  const totalPayableOpen = summary.inflow.payableOutstanding + payableAccruals.totalAmount;

  const handleGenerateInvoices = async () => {
    setGenerating(true);
    try {
      const firstOfMonth = `${selectedMonth}-01`;
      const { data, error: rpcError } = await supabase.rpc(
        selectedRestaurant === "all"
          ? "generate_tok_payable_invoices_all"
          : "generate_tok_payable_invoice",
        selectedRestaurant === "all"
          ? { p_month: firstOfMonth }
          : { p_restaurant_id: selectedRestaurant, p_month: firstOfMonth },
      );

      if (rpcError) throw rpcError;

      const generated = selectedRestaurant === "all" ? Number(data ?? 0) : data ? 1 : 0;
      toast({
        title: generated > 0 ? "Factures TOK generees" : "Aucune facture generee",
        description: generated > 0
          ? `${generated} facture${generated > 1 ? "s" : ""} ajoutee${generated > 1 ? "s" : ""} pour ${selectedMonth}.`
          : "Aucune nouvelle facture a produire sur cette periode.",
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-compta-payable-invoices-v3"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-compta-payable-line-items-v1"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-compta-orders-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-compta-reservation-payments-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-compta-reservation-fee-accruals-v1"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-compta-paid-campaigns"] }),
      ]);
    } catch (generationError) {
      toast({
        title: "Erreur de generation",
        description: getErrorMessage(generationError) || "Impossible de generer les factures TOK.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkPaid = async (invoice: AdminInvoiceRow) => {
    const { error: updateError } = await supabase
      .from("restaurant_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoice.id);

    if (updateError) {
      toast({ title: "Erreur", description: updateError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Facture marquee comme payee" });
    await queryClient.invalidateQueries({ queryKey: ["admin-compta-payable-invoices-v3"] });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge variant="outline" className="px-3 py-1 text-[11px] uppercase tracking-[0.25em]">
            Entrees d&apos;argent
          </Badge>
          <div>
            <h1 className="font-display text-3xl font-bold">Factures faites aux restaurateurs</h1>
            <p className="text-sm text-muted-foreground">
              Ecran dedie a ce qui entre chez TOK: facture payable unique, commissions 10% et postes factures aux restaurateurs.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/compta">Vue d&apos;ensemble</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/admin/compta/entrees">Entrees d&apos;argent</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/compta/sorties">Sorties d&apos;argent</Link>
          </Button>
          <Button size="sm" onClick={handleGenerateInvoices} disabled={generating}>
            <RefreshCcw className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`} />
            Generer les factures TOK
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
            <Card className="border-emerald-200 bg-emerald-50/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-emerald-800">Commissions 10%</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-emerald-950">{formatAmount(summary.inflow.totalCommissions)}</p>
                <p className="mt-1 text-xs text-emerald-700">Part TOK sur tous les paiements de la periode</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-800">Encours non facture</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-amber-950">{formatAmount(payableAccruals.totalAmount)}</p>
                <p className="mt-1 text-xs text-amber-700">
                  {payableAccruals.totalCount} ligne{payableAccruals.totalCount > 1 ? "s" : ""} payable{payableAccruals.totalCount > 1 ? "s" : ""} encore non facturee{payableAccruals.totalCount > 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
            <Card className="border-orange-200 bg-orange-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-orange-800">Factures a encaisser</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-orange-950">{formatAmount(summary.inflow.payableOutstanding)}</p>
                <p className="mt-1 text-xs text-orange-700">Factures TOK deja emises cote restaurateurs</p>
              </CardContent>
            </Card>
            <Card className="border-violet-200 bg-violet-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-violet-800">Paiements Miamz</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-violet-950">{formatAmount(miamzReimbursementsTotal)}</p>
                <p className="mt-1 text-xs text-violet-700">
                  {miamzReimbursementsCount} commande{miamzReimbursementsCount > 1 ? "s" : ""} avec remise Miamz sur la periode
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Deja encaisse</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{formatAmount(summary.inflow.payableCollected)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Historique regle sur les factures TOK</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-dashed">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
              <div>
                <p className="font-medium">Lecture de la facture payable unique</p>
                <p className="text-muted-foreground">
                  {formatAmount(totalPayableOpen)} a encaisser au total: {formatAmount(payableAccruals.totalAmount)} encore non factures et {formatAmount(summary.inflow.payableOutstanding)} deja factures.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Entrees ouvertes</p>
                <p className="text-xl font-semibold">{formatAmount(summary.inflow.totalOutstanding)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-600" />
                <CardTitle>Ventilation des 10% TOK</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {COMMISSION_SOURCE_ORDER.map((source) => (
                <Card key={source} className="shadow-none">
                  <CardContent className="space-y-2 py-5">
                    <p className="text-sm font-medium text-muted-foreground">{COMMISSION_SOURCE_LABELS[source]}</p>
                    <p className="text-2xl font-bold">{formatAmount(summary.inflow.bySource[source])}</p>
                    <p className="text-xs text-muted-foreground">Ce que TOK a percu sur cette source</p>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <ArrowDownRight className="h-4 w-4" />
              Factures TOK a encaisser
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FileDown className="h-4 w-4 text-amber-600" />
                  <CardTitle className="text-base">A encaisser</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <InvoiceTable invoices={payableInvoiceSections.actionable as PayableInvoiceRow[]} onMarkPaid={handleMarkPaid} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Historique</CardTitle>
              </CardHeader>
              <CardContent>
                <InvoiceTable invoices={payableInvoiceSections.history as PayableInvoiceRow[]} onMarkPaid={handleMarkPaid} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
