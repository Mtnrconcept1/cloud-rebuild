import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Coins, FileUp, HandCoins, Receipt, Wallet } from "lucide-react";

import { AccountingFactList, AccountingHero, AccountingMetricCard, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

function InvoiceMeta({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm ${emphasized ? "whitespace-nowrap font-semibold text-foreground" : "break-words text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function InvoiceListItem({
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
  const detailButtonLabel = isExpanded ? "Masquer le détail" : "Voir le détail";

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="break-all font-mono text-xs">{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
            <div className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</div>
            <div className="break-words text-xs text-muted-foreground">
              Facture emise par : {invoice.restaurants?.name || "-"}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => onToggleDetail(invoice.id)}>
              {detailButtonLabel}
            </Button>
            {isPaid ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                Reglee
              </span>
            ) : (
              <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => void onMarkPaid(invoice)}>
                Marquer payée
              </Button>
            )}
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <InvoiceMeta label="Restaurant" value={invoice.restaurants?.name || "-"} />
          <InvoiceMeta label="Periode" value={formatPeriod(invoice.period_start, invoice.period_end)} />
          <InvoiceMeta label="Montant TTC" value={formatAmount(invoice.amount_ttc)} emphasized />
          <InvoiceMeta label="Echeance" value={formatDate(invoice.due_at)} />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Statut</p>
            <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${getInvoiceStatusClass(invoice.status)}`}>
              {invoice.status || "draft"}
            </span>
          </div>
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-4 border-t pt-4">
          <InvoiceDetailAccordion
            mode="payout"
            lines={detailQuery.data || []}
            loading={detailQuery.isLoading}
            error={detailQuery.error}
            invoiceAmountTtc={invoice.amount_ttc}
          />
        </div>
      ) : null}
    </div>
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
      <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
        Aucune facturé sur cette section.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((invoice) => (
        <InvoiceListItem
          key={invoice.id}
          invoice={invoice}
          isExpanded={expandedInvoiceId === invoice.id}
          onToggleDetail={(invoiceId) => {
            setExpandedInvoiceId((current) => (current === invoiceId ? null : invoiceId));
          }}
          onMarkPaid={onMarkPaid}
        />
      ))}
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
    tokCoveredMiamzAmount,
    tokCoveredMiamzCount,
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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-foreground dark:text-slate-100">
      <AccountingHero
        badge="Sorties d'argent"
        title="Factures recues des restaurateurs"
        description="Commencez par les reversements a regler, puis descendez vers l'explication des flux et enfin vers le détail facturé par facturé."
        actions={(
          <>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/compta">Vue d&apos;ensemble</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/compta/entrees">Entrées d&apos;argent</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/admin/compta/sorties">Sorties d&apos;argent</Link>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <AccountingMetricCard
              tone="rose"
              icon={ArrowUpRight}
              label="A regler maintenant"
              value={formatAmount(summary.outflow.payoutsOutstanding)}
              description={`${payoutInvoiceSections.actionable.length} facturé${payoutInvoiceSections.actionable.length > 1 ? "s" : ""} de payout encore ouverte${payoutInvoiceSections.actionable.length > 1 ? "s" : ""}.`}
            />
            <AccountingMetricCard
              icon={Wallet}
              label="Déjà reverse"
              value={formatAmount(summary.outflow.payoutsPaid)}
              description="Historique des reversements déjà règles par TOK."
            />
            <AccountingMetricCard
              tone="emerald"
              icon={Coins}
              label="Part restaurants 90%"
              value={formatAmount(totalRestaurantShare)}
              description="Vue miroir de la part restaurateur generee sur les paiements du mois."
            />
            <AccountingMetricCard
              tone="sky"
              icon={HandCoins}
              label="Miamz pris en charge"
              value={formatAmount(tokCoveredMiamzAmount)}
              description={`${tokCoveredMiamzCount} commande${tokCoveredMiamzCount > 1 ? "s" : ""} avec réduction Miamz financée par Tok.`}
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
              description="Ce bloc condense ce qui doit être regle par TOK avant de descendre dans le tableau detaille."
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
                    label: "Déjà regle",
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
              icon={HandCoins}
              eyebrow="A garder en tete"
              title="Prises en charge clients"
              description="Les remboursements et les Miamz finances par Tok restent visibles a part des reversements classiques."
              value={formatAmount(refundsIssuedTotal + tokCoveredMiamzAmount)}
              valueLabel="Remboursements + Miamz"
            >
              <AccountingFactList
                tone="violet"
                items={[
                  {
                    label: "Miamz pris en charge par Tok",
                    value: formatAmount(tokCoveredMiamzAmount),
                    helper: `${tokCoveredMiamzCount} commande${tokCoveredMiamzCount > 1 ? "s" : ""} avec réduction fidélité.`,
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
                    label: "Remboursements emis",
                    value: String(refundsIssuedCount),
                  },
                  {
                    label: "Lecture comptable",
                    value: "Sorties distinctes",
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
              description="Cette vue fait volontairement passer le pilotage avant le détail. L'historique reste accessible plus bas."
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
                    label: "Déjà reverse",
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

            <div className="grid items-start gap-4 2xl:grid-cols-2">
              <Card className="min-w-0">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <FileUp className="h-4 w-4 text-rose-700" />
                    <CardTitle className="text-base">A regler</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="min-w-0">
                  <InvoiceTable invoices={payoutInvoiceSections.actionable} onMarkPaid={handleMarkPaid} />
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">Historique</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="min-w-0">
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
