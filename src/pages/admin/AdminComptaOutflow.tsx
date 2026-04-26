import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Coins, FileUp, Receipt, Wallet } from "lucide-react";

import { AccountingFactList, AccountingHero, AccountingMetricCard, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
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
        <TableCell className="text-right font-semibold whitespace-nowrap">{formatAmount(invoice.amount_ttc)}</TableCell>
        <TableCell>
          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${getInvoiceStatusClass(invoice.status)}`}>
            {invoice.status || "draft"}
          </span>
        </TableCell>
        <TableCell className="text-sm whitespace-nowrap">{formatDate(invoice.due_at)}</TableCell>
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
    <div className="overflow-x-auto rounded-xl border">
      <Table className="min-w-full md:min-w-[820px] [&_th]:px-2 [&_td]:px-2 md:[&_th]:px-4 md:[&_td]:px-4">
        <TableHeader>
          <TableRow>
            <TableHead>Facture</TableHead>
            <TableHead>Restaurant</TableHead>
            <TableHead>Periode</TableHead>
            <TableHead className="text-right whitespace-nowrap">Montant TTC</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="whitespace-nowrap">Echeance</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <InvoiceTableRow
              key={invoice.id}
              invoice={invoice}
              isExpanded={expandedInvoiceId === invoice.id}
              onToggleDetail={(invoiceId) => {
                setExpandedInvoiceId((current) => (current === invoiceId ? null : invoiceId));
              }}
              onMarkPaid={onMarkPaid}
            />
          ))}
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
    summary,
    payoutInvoiceSections,
    monthOptions,
    refundsIssuedCount,
    refundsIssuedTotal,
    refundsPendingAmount,
    refundsPendingCount,
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
      <AccountingHero
        badge="Sorties d'argent"
        title="Factures recues des restaurateurs"
        description="Commencez par les reversements a regler, puis descendez vers l'explication des flux et enfin vers le detail facture par facture."
        actions={(
          <>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/compta">Vue d&apos;ensemble</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/compta/entrees">Entrees d&apos;argent</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/admin/compta/sorties">Sorties d&apos;argent</Link>
            </Button>
          </>
        )}
      />

      <Card className="border-dashed bg-muted/20">
        <CardContent className="grid gap-3 p-4 md:grid-cols-2">
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AccountingMetricCard
              tone="rose"
              icon={ArrowUpRight}
              label="A regler maintenant"
              value={formatAmount(summary.outflow.payoutsOutstanding)}
              description={`${payoutInvoiceSections.actionable.length} facture${payoutInvoiceSections.actionable.length > 1 ? "s" : ""} de payout encore ouverte${payoutInvoiceSections.actionable.length > 1 ? "s" : ""}.`}
            />
            <AccountingMetricCard
              icon={Wallet}
              label="Deja reverse"
              value={formatAmount(summary.outflow.payoutsPaid)}
              description="Historique des reversements deja regles par TOK."
            />
            <AccountingMetricCard
              tone="emerald"
              icon={Coins}
              label="Part restaurants 90%"
              value={formatAmount(totalRestaurantShare)}
              description="Vue miroir de la part restaurateur generee sur les paiements du mois."
            />
            <AccountingMetricCard
              tone="violet"
              icon={Wallet}
              label="Remboursements clients"
              value={formatAmount(refundsIssuedTotal)}
              description={`${refundsIssuedCount} remboursement${refundsIssuedCount > 1 ? "s" : ""} emis, ${formatAmount(refundsPendingAmount)} encore a traiter.`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AccountingPanel
              tone="rose"
              icon={FileUp}
              eyebrow="A faire maintenant"
              title="Reversements a regler"
              description="Ce bloc condense ce qui doit etre regle par TOK avant de descendre dans le tableau detaille."
              value={formatAmount(summary.outflow.payoutsOutstanding)}
              valueLabel="A regler"
            >
              <AccountingFactList
                tone="rose"
                items={[
                  {
                    label: "Factures ouvertes",
                    value: String(payoutInvoiceSections.actionable.length),
                    helper: "Documents visibles dans la section A regler",
                  },
                  {
                    label: "Deja regle",
                    value: formatAmount(summary.outflow.payoutsPaid),
                  },
                  {
                    label: "Net comptable ouvert",
                    value: formatAmount(summary.netOutstanding),
                  },
                ]}
              />
            </AccountingPanel>

            <AccountingPanel
              tone="violet"
              icon={Wallet}
              eyebrow="A garder en tete"
              title="Remboursements clients"
              description="Les remboursements restent lisibles a part pour distinguer ce qui a deja ete emis de ce qui attend encore un traitement."
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
                  {
                    label: "Lecture comptable",
                    value: "Sortie distincte",
                  },
                ]}
              />
            </AccountingPanel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AccountingPanel
              tone="emerald"
              icon={Coins}
              eyebrow="Comprendre les flux"
              title="Origine des reversements restaurateurs"
              description="La part restaurant reste detaillee par source pour garder une lecture simple du payout."
              value={formatAmount(totalRestaurantShare)}
              valueLabel="Part restaurant"
            >
              <AccountingFactList
                tone="emerald"
                items={COMMISSION_SOURCE_ORDER.map((source) => ({
                  label: COMMISSION_SOURCE_LABELS[source],
                  value: formatAmount(summary.outflow.bySource[source]),
                }))}
              />
            </AccountingPanel>

            <AccountingPanel
              tone="slate"
              icon={Receipt}
              eyebrow="Comprendre les flux"
              title="Lecture du mois"
              description="Cette vue fait volontairement passer le pilotage avant le detail. L'historique reste accessible plus bas."
              value={formatAmount(summary.outflow.payoutsOutstanding)}
              valueLabel="Ouvert du mois"
            >
              <AccountingFactList
                items={[
                  {
                    label: "A regler maintenant",
                    value: formatAmount(summary.outflow.payoutsOutstanding),
                  },
                  {
                    label: "Deja reverse",
                    value: formatAmount(summary.outflow.payoutsPaid),
                  },
                  {
                    label: "Net comptable ouvert",
                    value: formatAmount(summary.netOutstanding),
                  },
                ]}
              />
            </AccountingPanel>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-900">
              <ArrowUpRight className="h-4 w-4" />
              A regler et historique
            </div>

            <div className="grid gap-4 2xl:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <FileUp className="h-4 w-4 text-rose-700" />
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
          </div>
        </>
      ) : null}
    </div>
  );
}
