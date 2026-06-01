import { Link } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ReceiptText, Settings, Wallet } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { AccountingFactList, AccountingHero, AccountingMetricCard, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { TokPayableInvoiceDialog } from "@/components/invoices/TokPayableInvoiceDialog";
import { useAuth } from "@/lib/auth-context";
import type { PayableInvoiceRow } from "@/lib/payableInvoice";
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
  onMarkPaid,
  restaurantName,
}: {
  invoice: PayableInvoiceRow;
  canMarkPaid: boolean;
  onMarkPaid: (invoiceId: string) => Promise<void>;
  restaurantName: string | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const isPaid = String(invoice.status || "").trim().toLowerCase() === "paid";

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
            <Button size="sm" variant="ghost" onClick={() => setPreviewOpen(true)}>
              Voir la facturé
            </Button>
            {canMarkPaid && !isPaid ? (
              <Button size="sm" variant="outline" onClick={() => void onMarkPaid(invoice.id)}>
                Marquer payee
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
      <TokPayableInvoiceDialog invoice={previewOpen ? invoice : null} open={previewOpen} onOpenChange={setPreviewOpen} />
    </>
  );
}

function InvoiceTable({
  invoices,
  canMarkPaid,
  onMarkPaid,
  restaurantName,
}: {
  invoices: PayableInvoiceRow[];
  canMarkPaid: boolean;
  onMarkPaid: (invoiceId: string) => Promise<void>;
  restaurantName: string | null;
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
                  {canMarkPaid && !isPaid ? (
                    <Button size="sm" variant="outline" onClick={() => void onMarkPaid(invoice.id)}>
                      Marquer payee
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
                canMarkPaid={canMarkPaid}
                onMarkPaid={onMarkPaid}
                restaurantName={restaurantName}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function DashboardFacturesOutflow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const isAdmin = isSuperAdmin;

  const {
    selectedRestaurant,
    summary,
    payableAccruals,
    payableInvoiceSections,
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-invoices-v2", selectedRestaurant.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-payable-line-items-v1", selectedRestaurant.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-reservation-fee-rows-v3", selectedRestaurant.id] }),
      ]);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <AccountingHero
          badge="Sorties d'argent"
          title="Factures recues de TOK"
          description={selectedRestaurant
            ? `Commencez par ce qui est déjà facturé par TOK, puis regardez ce qui risque d'arriver dans la prochaine facturé.`
            : "Selectionnez un restaurant pour afficher ses sorties d'argent."}
          actions={(
            <>
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
            </>
          )}
        />

        {!selectedRestaurant && !isLoading ? (
          <Card className="tok-dashboard-section rounded-3xl border border-border/70">
            <CardContent className="py-10 text-center text-muted-foreground dark:text-slate-100/78">
              Selectionnez un restaurant dans la barre laterale pour afficher ses sorties d&apos;argent.
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? <p className="text-sm text-muted-foreground">Chargement des données comptables...</p> : null}
        {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

        {selectedRestaurant && !isLoading && !error ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <AccountingMetricCard
                tone="orange"
                icon={ArrowUpRight}
                label="Factures TOK a payer"
                value={formatAmount(summary.outflow.payableToTok)}
                description="Montants déjà factures par TOK et encore ouverts."
              />
              <AccountingMetricCard
                tone="amber"
                icon={Wallet}
                label="Encours non facturé"
                value={formatAmount(payableAccruals.totalAmount)}
                description={`${payableAccruals.totalCount} ligne${payableAccruals.totalCount > 1 ? "s" : ""} attend${payableAccruals.totalCount > 1 ? "ent" : ""} encore une facturé.`}
              />
              <AccountingMetricCard
                icon={Wallet}
                label="Deja paye a TOK"
                value={formatAmount(summary.outflow.alreadyPaidToTok)}
                description="Historique des factures TOK déjà reglees."
              />
              <AccountingMetricCard
                icon={ReceiptText}
                label="Sortie ouverte totale"
                value={formatAmount(summary.outflow.totalOutstanding)}
                description="Factures TOK ouvertes plus encours non encore emis."
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <AccountingPanel
                tone="orange"
                icon={ArrowUpRight}
                eyebrow="A faire maintenant"
                title="Regler les factures TOK déjà emises"
                description="La première lecture doit vous dire ce qui est déjà payable, sans vous forcer à lire tous les détails de composition."
                value={formatAmount(summary.outflow.payableToTok)}
                valueLabel="Deja facturé"
              >
                <AccountingFactList
                  tone="orange"
                  items={[
                    {
                      label: "Factures ouvertes",
                      value: String(payableInvoiceSections.actionable.length),
                      helper: "Documents visibles dans la section A regler",
                    },
                    {
                      label: "Deja paye a TOK",
                      value: formatAmount(summary.outflow.alreadyPaidToTok),
                    },
                  ]}
                />
              </AccountingPanel>

              <AccountingPanel
                tone="amber"
                icon={Wallet}
                eyebrow="A faire maintenant"
                title="Anticiper la prochaine facturé"
                description="Ce bloc montre le contenu potentiel de la prochaine facturé TOK avant emission."
                value={formatAmount(payableAccruals.totalAmount)}
                valueLabel="Encours non facturé"
              >
                <AccountingFactList
                  tone="amber"
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
            </div>

            <AccountingPanel
              eyebrow="Comprendre les flux"
              title="Lecture simple de vos sorties"
              description="La sortie totale regroupe ce qui est déjà facturé et ce qui ne l'est pas encore. L'historique reste volontairement en bas pour ne pas polluer la lecture."
              value={formatAmount(summary.outflow.totalOutstanding)}
              valueLabel="Sortie ouverte totale"
            >
              <AccountingFactList
                items={[
                  {
                    label: "Factures TOK déjà emises",
                    value: formatAmount(summary.outflow.payableToTok),
                  },
                  {
                    label: "Encore non facturé",
                    value: formatAmount(payableAccruals.totalAmount),
                  },
                  {
                    label: "Deja regle",
                    value: formatAmount(summary.outflow.alreadyPaidToTok),
                  },
                ]}
              />
            </AccountingPanel>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-orange-900">
                <ArrowUpRight className="h-4 w-4" />
                A regler et historique
              </div>

              <div className="grid gap-4 2xl:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">A regler</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <InvoiceTable
                      invoices={payableInvoiceSections.actionable as PayableInvoiceRow[]}
                      canMarkPaid={isAdmin}
                      onMarkPaid={handleMarkPaid}
                      restaurantName={selectedRestaurant?.name || null}
                    />
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
                    <InvoiceTable
                      invoices={payableInvoiceSections.history as PayableInvoiceRow[]}
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
