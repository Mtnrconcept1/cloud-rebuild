import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, Coins, Download, FileUp, Megaphone, RefreshCcw, Settings, Wallet } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { AccountingFactList, AccountingHero, AccountingMetricCard, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { InvoiceDetailAccordion } from "@/components/invoices/InvoiceDetailAccordion";
import { COMMISSION_SOURCE_LABELS, COMMISSION_SOURCE_ORDER } from "@/lib/comptaCommissionSources";
import { useAuth } from "@/lib/auth-context";
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
  useDashboardPayoutInvoiceDetailLines,
  useDashboardFacturesData,
} from "./dashboardFacturesShared";

const supabase = getSupabase();

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "";
}

function InvoiceTableRow({
  invoice,
  canMarkPaid,
  isExpanded,
  onToggleDetail,
  onMarkPaid,
  restaurantName,
}: {
  invoice: RestaurantInvoiceRow;
  canMarkPaid: boolean;
  isExpanded: boolean;
  onToggleDetail: (invoiceId: string) => void;
  onMarkPaid: (invoiceId: string) => Promise<void>;
  restaurantName: string | null;
}) {
  const detailQuery = useDashboardPayoutInvoiceDetailLines(isExpanded ? invoice.id : null);
  const isPaid = String(invoice.status || "").trim().toLowerCase() === "paid";
  const detailButtonLabel = isExpanded ? "Masquer le détail" : "Voir le détail";

  return (
    <>
      <TableRow key={invoice.id}>
        <TableCell>
          <div className="font-mono text-xs">{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
          <div className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</div>
          <div className="text-xs text-muted-foreground">Restaurant concerne : {restaurantName || "-"}</div>
        </TableCell>
        <TableCell className="text-sm">{formatPeriod(invoice.period_start, invoice.period_end)}</TableCell>
        <TableCell className="text-right font-semibold whitespace-nowrap">{formatAmount(invoice.amount_ttc)}</TableCell>
        <TableCell>
          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${getInvoiceStatusClass(invoice.status)}`}>
            {invoice.status || "draft"}
          </span>
        </TableCell>
        <TableCell className="text-sm whitespace-nowrap">{formatDate(invoice.due_at)}</TableCell>
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
            <Button size="sm" variant="ghost" onClick={() => onToggleDetail(invoice.id)}>
              {detailButtonLabel}
            </Button>
            {canMarkPaid && !isPaid ? (
              <Button size="sm" variant="outline" onClick={() => void onMarkPaid(invoice.id)}>
                Marquer payée
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
      {isExpanded ? (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={6} className="px-4 py-5">
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
  canMarkPaid,
  onMarkPaid,
  restaurantName,
}: {
  invoices: RestaurantInvoiceRow[];
  canMarkPaid: boolean;
  onMarkPaid: (invoiceId: string) => Promise<void>;
  restaurantName: string | null;
}) {
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

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
        {invoices.map((invoice) => {
          const isPaid = String(invoice.status || "").trim().toLowerCase() === "paid";
          return (
            <Card key={invoice.id}>
              <CardContent className="space-y-3 p-4">
                <div>
                  <div className="font-mono text-xs">{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</div>
                  <div className="text-xs text-muted-foreground">Restaurant concerne : {restaurantName || "-"}</div>
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
                      Marquer payée
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <Table className="min-w-full md:min-w-[760px] [&_th]:px-2 [&_td]:px-2 md:[&_th]:px-4 md:[&_td]:px-4">
        <TableHeader>
          <TableRow>
            <TableHead>Facture</TableHead>
            <TableHead>Période</TableHead>
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
              canMarkPaid={canMarkPaid}
              isExpanded={expandedInvoiceId === invoice.id}
              restaurantName={restaurantName}
              onToggleDetail={(invoiceId) => {
                setExpandedInvoiceId((current) => (current === invoiceId ? null : invoiceId));
              }}
              onMarkPaid={onMarkPaid}
            />
          ))}
        </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function DashboardFacturesInflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const [generating, setGenerating] = useState(false);
  const isAdmin = isSuperAdmin;

  const {
    selectedRestaurant,
    summary,
    paidCampaignsCount,
    paidCampaignsTotal,
    payoutInvoiceSections,
    refundsIssuedCount,
    refundsIssuedTotal,
    refundsPendingAmount,
    refundsPendingCount,
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
          label: COMMISSION_SOURCE_LABELS[source],
          total,
          uninvoiced,
          alreadyInvoicedOrReceived: Math.max(total - uninvoiced, 0),
        };
      }),
    [summary.inflow.bySource, uninvoicedRestaurantShareBySource],
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

    toast({ title: `${Number(data?.generated || 0)} facturé(s) de reversement generee(s)` });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-invoices-v2", selectedRestaurant.id] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-compta-orders-v2", selectedRestaurant.id] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-compta-reservations-v2", selectedRestaurant.id] });
    setGenerating(false);
  };

  const handleMarkPaid = async (invoiceId: string) => {
    const { error: updateError } = await (supabase.rpc as any)("admin_mark_restaurant_invoice_paid", {
      p_invoice_id: invoiceId,
      p_paid_at: new Date().toISOString(),
      p_reference: "Marquage paye depuis le dashboard restaurateur - entrees",
    });

    if (updateError) {
      toast({ title: "Erreur", description: updateError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Facture marquée comme payée" });
    if (selectedRestaurant) {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-invoices-v2", selectedRestaurant.id] });
    }
  };

  const totalRestaurantShare = COMMISSION_SOURCE_ORDER.reduce(
    (sum, source) => sum + summary.inflow.bySource[source],
    0,
  );
  const totalOpenReceivable = summary.inflow.receivableFromTok + uninvoicedRestaurantShareTotal;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <AccountingHero
          badge="Entrees d'argent"
          title="Factures faites a TOK"
          description={selectedRestaurant
            ? `Commencez par les montants que vous devez encore facturer a TOK, puis par les factures déjà emises et non reglees.`
            : "Sélectionnez un restaurant pour afficher ses entrées d'argent."}
          actions={(
            <>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures">Vue d&apos;ensemble</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/dashboard/factures/entrees">Entrées d&apos;argent</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/sorties">Sorties d&apos;argent</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/parametres">
                  <Settings className="mr-2 h-4 w-4" />
                  Paramètres
                </Link>
              </Button>
              {selectedRestaurant ? (
                <Button size="sm" onClick={handleGenerateInvoices} disabled={generating || uninvoicedRestaurantShareTotal <= 0}>
                  <RefreshCcw className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                  {uninvoicedRestaurantShareTotal > 0
                    ? `Facturer l'encours (${formatAmount(uninvoicedRestaurantShareTotal)})`
                    : "Rien à facturer"}
                </Button>
              ) : null}
            </>
          )}
        />

        {!selectedRestaurant && !isLoading ? (
          <Card className="tok-dashboard-section rounded-3xl border border-border/70">
            <CardContent className="py-10 text-center text-muted-foreground dark:text-slate-100/78">
              Sélectionnez un restaurant dans la barre latérale pour afficher ses entrées d&apos;argent.
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? <p className="text-sm text-muted-foreground">Chargement des données comptables...</p> : null}
        {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

        {selectedRestaurant && !isLoading && !error ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <AccountingMetricCard
                tone="primary"
                icon={ArrowDownRight}
                label="A recevoir de TOK"
                value={formatAmount(totalOpenReceivable)}
                description={`${formatAmount(summary.inflow.receivableFromTok)} déjà facturé et ${formatAmount(uninvoicedRestaurantShareTotal)} encore a emettre.`}
              />
              <AccountingMetricCard
                tone="emerald"
                icon={RefreshCcw}
                label="Encore à facturer"
                value={formatAmount(uninvoicedRestaurantShareTotal)}
                description="Part 90% déjà acquise mais pas encore emise a TOK."
              />
              <AccountingMetricCard
                icon={Wallet}
                label="Déjà reçu de TOK"
                value={formatAmount(summary.inflow.receivedFromTok)}
                description="Historique des factures de payout déjà encaissees."
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
                tone="primary"
                icon={FileUp}
                eyebrow="A faire maintenant"
                title="Facturer l'encours"
                description="La priorité est simple: emettre ce qui est déjà du à votre restaurant avant de parcourir l'historique."
                value={formatAmount(uninvoicedRestaurantShareTotal)}
                valueLabel="Encours non facturé"
              >
                <AccountingFactList
                  tone="primary"
                  items={[
                    {
                      label: "Part 90% déjà gagnee",
                      value: formatAmount(totalRestaurantShare),
                    },
                    {
                      label: "Encore a emettre",
                      value: formatAmount(uninvoicedRestaurantShareTotal),
                      helper: "Ce montant peut partir en facturé des maintenant",
                    },
                    {
                      label: "Remboursements encore a traiter",
                      value: formatAmount(refundsPendingAmount),
                      helper: `${refundsPendingCount} dossier${refundsPendingCount > 1 ? "s" : ""} en attente`,
                    },
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleGenerateInvoices} disabled={generating || uninvoicedRestaurantShareTotal <= 0}>
                    <RefreshCcw className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                    Generer la facturé
                  </Button>
                </div>
              </AccountingPanel>

              <AccountingPanel
                tone="emerald"
                icon={ArrowDownRight}
                eyebrow="A faire maintenant"
                title="Suivre les factures déjà emises"
                description="Une fois la facturé envoyée, l'étape suivante est le suivi du reglement cote TOK."
                value={formatAmount(summary.inflow.receivableFromTok)}
                valueLabel="Déjà facturé"
              >
                <AccountingFactList
                  tone="emerald"
                  items={[
                    {
                      label: "Factures ouvertes",
                      value: String(payoutInvoiceSections.actionable.length),
                      helper: "Documents déjà emis et visibles plus bas",
                    },
                    {
                      label: "Déjà reçu",
                      value: formatAmount(summary.inflow.receivedFromTok),
                    },
                    {
                      label: "Ouvert total cote entrées",
                      value: formatAmount(totalOpenReceivable),
                    },
                  ]}
                />
              </AccountingPanel>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <AccountingPanel
                tone="emerald"
                icon={Coins}
                eyebrow="Comprendre les flux"
                title="D'ou vient votre part 90%"
                description="Chaque source montre à la fois le total gagne et ce qui reste encore à facturer."
                value={formatAmount(totalRestaurantShare)}
                valueLabel="Part restaurant"
              >
                <AccountingFactList
                  tone="emerald"
                  items={inflowSourceBreakdown.map((sourceDetail) => ({
                    label: sourceDetail.label,
                    value: formatAmount(sourceDetail.total),
                    helper: `Encore à facturer: ${formatAmount(sourceDetail.uninvoiced)} | Déjà emis ou reçu: ${formatAmount(sourceDetail.alreadyInvoicedOrReceived)}`,
                  }))}
                />
              </AccountingPanel>

              <AccountingPanel
                tone="violet"
                icon={Wallet}
                eyebrow="Comprendre les flux"
                title="Remboursements emis"
                description="Les remboursements clients sont isoles pour ne pas brouiller la lecture des reversements a emettre ou déjà encaisses."
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
                  ]}
                />
              </AccountingPanel>

              <AccountingPanel
                tone="amber"
                icon={Megaphone}
                eyebrow="Comprendre les flux"
                title="Depenses marketing"
                description="Les campagnes publicitaires restent a part pour ne pas polluer la lecture des reversements."
                value={formatAmount(paidCampaignsTotal)}
                valueLabel="Campagnes payées"
              >
                <AccountingFactList
                  tone="amber"
                  items={[
                    {
                      label: "Campagnes concernées",
                      value: String(paidCampaignsCount),
                    },
                    {
                      label: "Lecture comptable",
                      value: "Depense separee",
                      helper: "Ce flux ne fait pas partie de votre part 90%",
                    },
                  ]}
                />
              </AccountingPanel>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <FileUp className="h-4 w-4" />
                A encaisser et historique
              </div>

              <div className="grid gap-4 2xl:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">A encaisser</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <InvoiceTable
                      invoices={payoutInvoiceSections.actionable}
                      canMarkPaid={isAdmin}
                      onMarkPaid={handleMarkPaid}
                      restaurantName={selectedRestaurant?.name || null}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Historique</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <InvoiceTable
                      invoices={payoutInvoiceSections.history}
                      canMarkPaid={isAdmin}
                      onMarkPaid={handleMarkPaid}
                      restaurantName={selectedRestaurant?.name || null}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
