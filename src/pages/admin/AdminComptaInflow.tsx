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
              <TableHead>Periode</TableHead>
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
              <p className="text-muted-foreground">Periode</p>
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
            {!isPaid ? (
              <Button size="sm" variant="outline" onClick={() => void onMarkPaid(invoice)}>
                Marquer payee
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
    refundsIssuedCount,
    refundsIssuedTotal,
    refundsPendingAmount,
    refundsPendingCount,
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
      <AccountingHero
        badge="Entrees d'argent"
        title="Factures faites aux restaurateurs"
        description="Commencez par ce qui doit etre facture, puis par ce qui est deja emis et attend l'encaissement. Les explications sur le contenu des factures restent visibles plus bas."
        actions={(
          <>
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
              tone="amber"
              icon={RefreshCcw}
              label="Encore a facturer"
              value={formatAmount(payableAccruals.totalAmount)}
              description={`${payableAccruals.totalCount} ligne${payableAccruals.totalCount > 1 ? "s" : ""} payable${payableAccruals.totalCount > 1 ? "s" : ""} attendent encore une facture.`}
            />
            <AccountingMetricCard
              tone="orange"
              icon={FileDown}
              label="Deja facture, a encaisser"
              value={formatAmount(summary.inflow.payableOutstanding)}
              description={`${payableInvoiceSections.actionable.length} facture${payableInvoiceSections.actionable.length > 1 ? "s" : ""} ouverte${payableInvoiceSections.actionable.length > 1 ? "s" : ""} cote restaurateurs.`}
            />
            <AccountingMetricCard
              tone="emerald"
              icon={Coins}
              label="Commissions TOK 10%"
              value={formatAmount(summary.inflow.totalCommissions)}
              description="Part TOK sur les paiements confirmes de la periode."
            />
            <AccountingMetricCard
              icon={Wallet}
              label="Deja encaisse"
              value={formatAmount(summary.inflow.payableCollected)}
              description="Historique regle sur les factures payables deja emises."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AccountingPanel
              tone="amber"
              icon={RefreshCcw}
              eyebrow="A faire maintenant"
              title="Generer les factures du mois"
              description="Ce bloc vous dit ce qui doit partir en facture avant meme d'ouvrir le tableau detaille."
              value={formatAmount(payableAccruals.totalAmount)}
              valueLabel="Encours non facture"
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
                    label: "Commissions reservations + frais",
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
              title="Suivre les factures deja emises"
              description="Une fois la facture creee, la priorite devient l'encaissement cote restaurateur."
              value={formatAmount(summary.inflow.payableOutstanding)}
              valueLabel="A encaisser"
            >
              <AccountingFactList
                tone="orange"
                items={[
                  {
                    label: "Factures ouvertes",
                    value: String(payableInvoiceSections.actionable.length),
                    helper: "Documents deja visibles dans la section A encaisser",
                  },
                  {
                    label: "Historique encaisse",
                    value: formatAmount(summary.inflow.payableCollected),
                  },
                  {
                    label: "Ouvert total cote entrees",
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
              title="Ce que contient la facture restaurateur"
              description="La facture payable unique agrège seulement ce que le restaurateur doit a TOK sur la periode."
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
                    label: "Commission reservations",
                    value: formatAmount(payableAccruals.reservationCommissionAmount),
                  },
                  {
                    label: "Frais de reservation",
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
              description="Les remboursements sont separes des commissions et des factures TOK pour garder une lecture claire des encaissements."
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
                    helper: "Visible a part meme si ce n'est pas le coeur de la facture payable",
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
