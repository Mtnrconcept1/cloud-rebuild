import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, Coins, FileDown, Loader2, Receipt, RefreshCcw, Wallet } from "lucide-react";

import { AccountingFactList, AccountingHero, AccountingMetricCard, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { TokPayableInvoiceDialog } from "@/components/invoices/TokPayableInvoiceDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { getInvoiceStatusLabel } from "@/lib/invoicePresentation";
import { openExternalHttpsUrl } from "@/lib/securityUrls";
import {
  generateAdminTokPayableInvoices,
  getAdminComptaActionErrorMessage,
  markAdminRestaurantInvoicePaid,
  type AdminComptaRpcClient,
} from "@/lib/adminComptaActions";
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
  return getAdminComptaActionErrorMessage(error);
}

function downloadInvoicePdf(invoice: AdminInvoiceRow) {
  if (invoice.pdf_url) {
    openExternalHttpsUrl(invoice.pdf_url);
  }
}

function InvoiceTable({
  invoices,
  onMarkPaid,
  payingInvoiceId,
}: {
  invoices: PayableInvoiceRow[];
  onMarkPaid: (invoice: PayableInvoiceRow) => Promise<void>;
  payingInvoiceId: string | null;
}) {
  if (invoices.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Aucune facture dans cette section.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((invoice) => (
        <InvoiceListItem
          key={invoice.id}
          invoice={invoice}
          onMarkPaid={onMarkPaid}
          payingInvoiceId={payingInvoiceId}
        />
      ))}
    </div>
  );
}

function InvoiceListItem({
  invoice,
  onMarkPaid,
  payingInvoiceId,
}: {
  invoice: PayableInvoiceRow;
  onMarkPaid: (invoice: PayableInvoiceRow) => Promise<void>;
  payingInvoiceId: string | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const isPaid = String(invoice.status || "").trim().toLowerCase() === "paid";
  const isPaying = payingInvoiceId === invoice.id;
  const reference = invoice.invoice_number || invoice.id.slice(0, 8);

  return (
    <>
      <Card role="article" aria-label={`Facture ${reference}`}>
        <CardContent className="space-y-3 p-4">
          <div>
            <div className="font-mono text-xs">{reference}</div>
            <div className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</div>
            <div className="text-xs text-muted-foreground">Restaurant : {invoice.restaurants?.name || "-"}</div>
          </div>
          <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-2">
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
                {getInvoiceStatusLabel(invoice.status)}
              </span>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="h-auto min-h-[44px] max-w-full whitespace-normal text-left sm:h-9 sm:whitespace-nowrap" aria-label={`Voir la facture ${reference}`} onClick={() => setPreviewOpen(true)}>
              Voir la facture
            </Button>
            {invoice.pdf_url ? (
              <Button size="sm" variant="ghost" className="h-auto min-h-[44px] max-w-full whitespace-normal sm:h-9 sm:whitespace-nowrap" aria-label={`Télécharger le PDF de la facture ${reference}`} onClick={() => downloadInvoicePdf(invoice)}>
                PDF
              </Button>
            ) : null}
            {!isPaid ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-auto min-h-[44px] max-w-full whitespace-normal text-left sm:h-9 sm:whitespace-nowrap"
                disabled={isPaying}
                aria-busy={isPaying}
                aria-label={`Marquer la facture ${reference} comme payée`}
                onClick={() => void onMarkPaid(invoice)}
              >
                {isPaying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isPaying ? "Marquage..." : "Marquer payée"}
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
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

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

    if (payableAccruals.totalAmount <= 0) {
      toast({
        title: "Aucune facture TOK à générer",
        description: "Aucune ligne non facturée n'est disponible sur ce mois et ce filtre restaurant.",
      });
      return;
    }

    const confirmed = window.confirm("Generer les factures TOK du mois selectionne ? L'action sera auditee.");
    if (!confirmed) return;

    setGenerating(true);
    try {
      const generated = await generateAdminTokPayableInvoices(supabase as unknown as AdminComptaRpcClient, {
        restaurantId: selectedRestaurant,
        selectedMonth,
      });
      toast({
        title: generated > 0 ? "Factures TOK générées" : "Aucune facture générée",
        description: generated > 0
          ? `${generated} facture${generated > 1 ? "s" : ""} ajoutée${generated > 1 ? "s" : ""} pour ${selectedMonth}.`
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

    setPayingInvoiceId(invoice.id);
    try {
      await markAdminRestaurantInvoicePaid(supabase as unknown as AdminComptaRpcClient, {
        invoiceId: invoice.id,
        reference: "Marquage paye depuis l'admin compta - entrees",
      });

      toast({ title: "Facture marquée comme payée" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-compta-payable-invoices-v3"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-compta-payout-invoices-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-compta-period-control"] }),
      ]);
    } catch (markPaidError) {
      toast({
        title: "Erreur",
        description: getErrorMessage(markPaidError) || "Impossible de marquer la facture comme payée.",
        variant: "destructive",
      });
    } finally {
      setPayingInvoiceId(null);
    }
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
            <Button type="button" size="sm" onClick={handleGenerateInvoices} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              {generating ? "Génération..." : "Generer les factures TOK"}
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
                <Button type="button" onClick={handleGenerateInvoices} disabled={generating}>
                  {generating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  {generating ? "Génération..." : "Generer maintenant"}
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
                  <InvoiceTable
                    invoices={payableInvoiceSections.actionable as PayableInvoiceRow[]}
                    onMarkPaid={handleMarkPaid}
                    payingInvoiceId={payingInvoiceId}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Historique</CardTitle>
                </CardHeader>
                <CardContent>
                  <InvoiceTable
                    invoices={payableInvoiceSections.history as PayableInvoiceRow[]}
                    onMarkPaid={handleMarkPaid}
                    payingInvoiceId={payingInvoiceId}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
