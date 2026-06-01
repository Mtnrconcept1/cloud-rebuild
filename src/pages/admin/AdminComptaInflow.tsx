import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, Coins, FileDown, Receipt, RefreshCcw, Wallet } from "lucide-react";

import { AccountingFactList, AccountingHero, AccountingMetricCard, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { TokPayableInvoiceDialog } from "@/components/invoices/TokPayableInvoiceDialog";
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
  downloadAccountingCsv,
  isAccountingPeriodClosed,
  type AdminInvoiceRow,
  useAdminComptaData,
} from "./adminComptaShared";

const supabase = getSupabase();

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "";
}

function downloadInvoicePdf(invoice: AdminInvoiceRow) {
  if (invoice.pdf_url) {
    window.open(invoice.pdf_url, "_blank", "noopener,noreferrer");
  }
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
            Facture adressée à : {invoice.restaurants?.name || "-"}
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
            <Button size="sm" variant="ghost" onClick={() => setPreviewOpen(true)}>
              Voir la facture
            </Button>
            {invoice.pdf_url ? (
              <Button size="sm" variant="ghost" onClick={() => downloadInvoicePdf(invoice)}>
                PDF
              </Button>
            ) : null}
            {isPaid ? (
              <span className="text-xs text-muted-foreground">Reglee</span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void onMarkPaid(invoice)}>
                Marquer payée
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
          Aucune facturé sur cette section.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {invoices.map((invoice) => (
          <MobileInvoiceCard key={invoice.id} invoice={invoice} onMarkPaid={onMarkPaid} />
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <Table className="min-w-full md:min-w-[820px] [&_th]:px-2 [&_td]:px-2 md:[&_th]:px-4 md:[&_td]:px-4">
          <TableHeader>
            <TableRow>
              <TableHead>Facture</TableHead>
              <TableHead>Restaurant</TableHead>
              <TableHead>Période</TableHead>
              <TableHead className="text-right whitespace-nowrap">Montant TTC</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="whitespace-nowrap">Echeance</TableHead>
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
    </>
  );
}

function MobileInvoiceCard({
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
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <div className="font-mono text-xs">{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
            <div className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</div>
            <div className="text-xs text-muted-foreground">Restaurant : {invoice.restaurants?.name || "-"}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Période</p>
              <p>{formatPeriod(invoice.period_start, invoice.period_end)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Echeance</p>
              <p>{formatDate(invoice.due_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Montant TTC</p>
              <p className="font-semibold">{formatAmount(invoice.amount_ttc)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Statut</p>
              <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${getInvoiceStatusClass(invoice.status)}`}>
                {invoice.status || "draft"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPreviewOpen(true)}>
              Voir la facture
            </Button>
            {invoice.pdf_url ? (
              <Button size="sm" variant="ghost" onClick={() => downloadInvoicePdf(invoice)}>
                PDF
              </Button>
            ) : null}
            {!isPaid ? (
              <Button size="sm" variant="outline" onClick={() => void onMarkPaid(invoice)}>
                Marquer payée
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Reglee</span>
            )}
          </div>
        </CardContent>
      </Card>
      <TokPayableInvoiceDialog invoice={previewOpen ? invoice : null} open={previewOpen} onOpenChange={setPreviewOpen} />
    </>
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
    monthOptions,
    payableInvoiceSections,
    periodControl,
    isPeriodClosed,
    refundsIssuedCount,
    refundsIssuedTotal,
    refundsPendingAmount,
    refundsPendingCount,
    isLoading,
    error,
  } = useAdminComptaData(selectedRestaurant, selectedMonth);
  const totalPayableOpen = summary.inflow.payableOutstanding + payableAccruals.totalAmount;
  const exportInflowCsv = () => {
    downloadAccountingCsv(`tok-compta-entrees-${selectedMonth}-${selectedRestaurant}.csv`, [
      ["Mois", selectedMonth],
      ["Période fermée", isAccountingPeriodClosed(periodControl) ? "oui" : "non"],
      ["Encore a facturer", payableAccruals.totalAmount],
      ["Factures ouvertes", summary.inflow.payableOutstanding],
      ["Deja encaisse", summary.inflow.payableCollected],
      ["Commissions commandes", payableAccruals.orderCommissionAmount],
      ["Commissions reservations", payableAccruals.reservationCommissionAmount],
      ["Frais reservations", payableAccruals.reservationFeeAmount],
      ["Campagnes", payableAccruals.campaignAmount],
      ["Remboursements emis", refundsIssuedTotal],
      ["Remboursements en attente", refundsPendingAmount],
    ]);
  };

  const handleGenerateInvoices = async () => {
    if (isPeriodClosed) {
      toast({ title: "Période clôturée", description: "Rouvrez le mois avant de générer des factures.", variant: "destructive" });
      return;
    }

    const confirmed = window.confirm("Generer les factures TOK du mois selectionne ? L'action sera auditee.");
    if (!confirmed) return;

    setGenerating(true);
    try {
      const firstOfMonth = `${selectedMonth}-01`;
      const { data, error: rpcError } = await supabase.rpc(
        selectedRestaurant === "all"
          ? "admin_generate_tok_payable_invoices_all"
          : "admin_generate_tok_payable_invoice",
        selectedRestaurant === "all"
          ? { p_month: firstOfMonth }
          : { p_restaurant_id: selectedRestaurant, p_month: firstOfMonth },
      );

      if (rpcError) throw rpcError;

      const generated = selectedRestaurant === "all" ? Number(data ?? 0) : data ? 1 : 0;
      toast({
        title: generated > 0 ? "Factures TOK generees" : "Aucune facturé generee",
        description: generated > 0
          ? `${generated} facturé${generated > 1 ? "s" : ""} ajoutee${generated > 1 ? "s" : ""} pour ${selectedMonth}.`
          : "Aucune nouvelle facture à produire sur cette période.",
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
    if (isPeriodClosed) {
      toast({ title: "Période clôturée", description: "Rouvrez le mois avant de marquer une facture payée.", variant: "destructive" });
      return;
    }

    const confirmed = window.confirm("Marquer cette facture comme payee ? L'action sera auditee.");
    if (!confirmed) return;

    const { error: updateError } = await (supabase.rpc as any)("admin_mark_restaurant_invoice_paid", {
      p_invoice_id: invoice.id,
    });

    if (updateError) {
      toast({ title: "Erreur", description: updateError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Facture marquée comme payée" });
    await queryClient.invalidateQueries({ queryKey: ["admin-compta-payable-invoices-v3"] });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-foreground dark:text-slate-100">
      <AccountingHero
        badge="Entrees d'argent"
        title="Factures faites aux restaurateurs"
        description="Commencez par ce qui doit être facturé, puis par ce qui est déjà emis et attend l'encaissement. Les explications sur le contenu des factures restent visibles plus bas."
        actions={(
          <>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/compta">Vue d&apos;ensemble</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/admin/compta/entrees">Entrées d&apos;argent</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/compta/sorties">Sorties d&apos;argent</Link>
            </Button>
            <Button size="sm" onClick={handleGenerateInvoices} disabled={generating}>
              <RefreshCcw className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              Generer les factures TOK
            </Button>
            <Button size="sm" variant="outline" onClick={exportInflowCsv}>
              <FileDown className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </>
        )}
      />

      <Card className="tok-dashboard-section rounded-3xl border border-dashed border-border/70 bg-muted/20">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
          <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
            <SelectTrigger className="h-14 rounded-2xl border-border/70 bg-background/90 font-semibold dark:border-[#5f7aad]/35 dark:bg-[#040c1c]/86 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
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
            <SelectTrigger className="h-14 rounded-2xl border-border/70 bg-background/90 font-semibold dark:border-[#5f7aad]/35 dark:bg-[#040c1c]/86 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
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

      {isLoading ? <p className="text-sm text-muted-foreground">Chargement des données comptables...</p> : null}
      {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

      {!isLoading && !error ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AccountingMetricCard
              tone="amber"
              icon={RefreshCcw}
              label="Encore à facturer"
              value={formatAmount(payableAccruals.totalAmount)}
              description={`${payableAccruals.totalCount} ligne${payableAccruals.totalCount > 1 ? "s" : ""} payable${payableAccruals.totalCount > 1 ? "s" : ""} attendent encore une facturé.`}
            />
            <AccountingMetricCard
              tone="orange"
              icon={FileDown}
              label="Déjà facturé, à encaisser"
              value={formatAmount(summary.inflow.payableOutstanding)}
              description={`${payableInvoiceSections.actionable.length} facturé${payableInvoiceSections.actionable.length > 1 ? "s" : ""} ouverte${payableInvoiceSections.actionable.length > 1 ? "s" : ""} cote restaurateurs.`}
            />
            <AccountingMetricCard
              tone="emerald"
              icon={Coins}
              label="Commissions TOK 10%"
              value={formatAmount(summary.inflow.totalCommissions)}
              description="Part TOK sur les paiements confirmés de la période."
            />
            <AccountingMetricCard
              icon={Wallet}
              label="Déjà encaisse"
              value={formatAmount(summary.inflow.payableCollected)}
              description="Historique regle sur les factures payables déjà emises."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AccountingPanel
              tone="amber"
              icon={RefreshCcw}
              eyebrow="A faire maintenant"
              title="Generer les factures du mois"
              description="Ce bloc vous dit ce qui doit partir en facture avant même d'ouvrir le tableau détaillé."
              value={formatAmount(payableAccruals.totalAmount)}
              valueLabel="Encours non facturé"
            >
              <AccountingFactList
                tone="amber"
                items={[
                  {
                    label: "Commissions commandes",
                    value: formatAmount(payableAccruals.orderCommissionAmount),
                    helper: `${payableAccruals.orderCommissionCount} ligne${payableAccruals.orderCommissionCount > 1 ? "s" : ""}`,
                  },
                  {
                    label: "Commissions réservations + frais",
                    value: formatAmount(payableAccruals.reservationCommissionAmount + payableAccruals.reservationFeeAmount),
                    helper: `${payableAccruals.reservationCommissionCount + payableAccruals.reservationFeeCount} ligne${payableAccruals.reservationCommissionCount + payableAccruals.reservationFeeCount > 1 ? "s" : ""}`,
                  },
                  {
                    label: "Campagnes publicitaires",
                    value: formatAmount(payableAccruals.campaignAmount),
                    helper: `${payableAccruals.campaignCount} ligne${payableAccruals.campaignCount > 1 ? "s" : ""}`,
                  },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleGenerateInvoices} disabled={generating}>
                  <RefreshCcw className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                  Generer maintenant
                </Button>
              </div>
            </AccountingPanel>

            <AccountingPanel
              tone="orange"
              icon={FileDown}
              eyebrow="A faire maintenant"
              title="Suivre les factures déjà emises"
              description="Une fois la facture créée, la priorité devient l'encaissement côté restaurateur."
              value={formatAmount(summary.inflow.payableOutstanding)}
              valueLabel="A encaisser"
            >
              <AccountingFactList
                tone="orange"
                items={[
                  {
                    label: "Factures ouvertes",
                    value: String(payableInvoiceSections.actionable.length),
                    helper: "Documents déjà visibles dans la section A encaisser",
                  },
                  {
                    label: "Historique encaisse",
                    value: formatAmount(summary.inflow.payableCollected),
                  },
                  {
                    label: "Ouvert total cote entrées",
                    value: formatAmount(totalPayableOpen),
                  },
                ]}
              />
            </AccountingPanel>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <AccountingPanel
              tone="primary"
              icon={Receipt}
              eyebrow="Comprendre les flux"
              title="Ce que contient la facturé restaurateur"
              description="La facture payable unique agrège seulement ce que le restaurateur doit à TOK sur la période."
              value={formatAmount(totalPayableOpen)}
              valueLabel="Ouvert total"
            >
              <AccountingFactList
                tone="primary"
                items={[
                  {
                    label: "Commission commandes",
                    value: formatAmount(payableAccruals.orderCommissionAmount),
                  },
                  {
                    label: "Commission réservations",
                    value: formatAmount(payableAccruals.reservationCommissionAmount),
                  },
                  {
                    label: "Frais de réservation",
                    value: formatAmount(payableAccruals.reservationFeeAmount),
                  },
                  {
                    label: "Campagnes / autres postes",
                    value: formatAmount(payableAccruals.campaignAmount),
                  },
                ]}
              />
            </AccountingPanel>

            <AccountingPanel
              tone="emerald"
              icon={Coins}
              eyebrow="Comprendre les flux"
              title="Ventilation des 10% TOK"
              description="Chaque source reste visible pour comprendre rapidement d'ou vient la commission du mois."
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
              title="Remboursements clients"
              description="Les remboursements sont séparés des commissions et des factures TOK pour garder une lecture claire des encaissements."
              value={formatAmount(refundsIssuedTotal)}
              valueLabel="Remboursements"
            >
              <AccountingFactList
                tone="violet"
                items={[
                  {
                    label: "Remboursements emis",
                    value: String(refundsIssuedCount),
                  },
                  {
                    label: "Encore a traiter",
                    value: formatAmount(refundsPendingAmount),
                  },
                  {
                    label: "Dossiers en attente",
                    value: String(refundsPendingCount),
                  },
                  {
                    label: "Lecture comptable",
                    value: "Flux separe",
                    helper: "Visible à part même si ce n'est pas le cœur de la facture payable",
                  },
                ]}
              />
            </AccountingPanel>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <ArrowDownRight className="h-4 w-4" />
              A encaisser et historique
            </div>

            <div className="grid gap-4 2xl:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <FileDown className="h-4 w-4 text-amber-700" />
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
          </div>
        </>
      ) : null}
    </div>
  );
}
