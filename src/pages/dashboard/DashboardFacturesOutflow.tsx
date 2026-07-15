import { Link } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ReceiptText, Settings, Wallet } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { CommercialDemoAccounting } from "@/components/dashboard/CommercialDemoScenario";
import { AccountingFactList, AccountingHero, AccountingMetricCard, AccountingPanel } from "@/components/invoices/AccountingCockpit";
import { TokPayableInvoiceDialog } from "@/components/invoices/TokPayableInvoiceDialog";
import { useAuth } from "@/lib/auth-context";
import type { PayableInvoiceRow } from "@/lib/payableInvoice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { getInvoiceStatusLabel } from "@/lib/invoicePresentation";
import {
  formatAmount,
  formatDate,
  formatPeriod,
  getInvoiceStatusClass,
  useDashboardFacturesData,
} from "./dashboardFacturesShared";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";

const supabase = getSupabase();

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "";
}

function InvoiceListItem({
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
  const reference = invoice.invoice_number || invoice.id.slice(0, 8);

  return (
    <>
      <Card role="article" aria-label={`Facture ${reference}`}>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="break-all font-mono text-xs">{reference}</p>
              <p className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</p>
              <p className="break-words text-xs text-muted-foreground">Restaurant : {restaurantName || "-"}</p>
            </div>
            <span className={`inline-flex w-fit rounded-full px-2 py-1 text-[10px] font-medium ${getInvoiceStatusClass(invoice.status)}`}>
              {getInvoiceStatusLabel(invoice.status)}
            </span>
          </div>

          <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Période</dt>
              <dd className="break-words font-medium">{formatPeriod(invoice.period_start, invoice.period_end)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Échéance</dt>
              <dd className="break-words font-medium">{formatDate(invoice.due_at)}</dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Montant TTC</dt>
              <dd className="break-words text-lg font-bold">{formatAmount(invoice.amount_ttc)}</dd>
            </div>
          </dl>

          <div className="flex min-w-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-auto min-h-[44px] max-w-full whitespace-normal text-left"
              aria-label={`Voir la facture ${reference}`}
              onClick={() => setPreviewOpen(true)}
            >
              Voir la facture
            </Button>
            {canMarkPaid && !isPaid ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-auto min-h-[44px] max-w-full whitespace-normal"
                onClick={() => void onMarkPaid(invoice.id)}
              >
                Marquer payée
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
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
          canMarkPaid={canMarkPaid}
          onMarkPaid={onMarkPaid}
          restaurantName={restaurantName}
        />
      ))}
    </div>
  );
}

export default function DashboardFacturesOutflow() {
  const commercialDemoFrame = useCommercialDemoFrame();
  if (commercialDemoFrame?.surface === "restaurant") return <CommercialDemoAccounting />;
  return <LiveDashboardFacturesOutflow />;
}

function LiveDashboardFacturesOutflow() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
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
    if (isCommercialDemo) {
      toast({ title: "Paiement simulé", description: `La facture ${invoiceId.slice(0, 8)} reste inchangée en production.` });
      return;
    }
    const { error: updateError } = await (supabase.rpc as any)("admin_mark_restaurant_invoice_paid", {
      p_invoice_id: invoiceId,
      p_paid_at: new Date().toISOString(),
      p_reference: "Marquage paye depuis le dashboard restaurateur - sorties",
    });

    if (updateError) {
      toast({ title: "Erreur", description: updateError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Facture marquée comme payée" });
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
            : "Sélectionnez un restaurant pour afficher ses sorties d'argent."}
          actions={(
            <>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures">Vue d&apos;ensemble</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/entrees">Entrées d&apos;argent</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/dashboard/factures/sorties">Sorties d&apos;argent</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/factures/parametres">
                  <Settings className="mr-2 h-4 w-4" />
                  Paramètres
                </Link>
              </Button>
            </>
          )}
        />

        {!selectedRestaurant && !isLoading ? (
          <Card className="tok-dashboard-section rounded-3xl border border-border/70">
            <CardContent className="py-10 text-center text-muted-foreground dark:text-slate-100/78">
              Sélectionnez un restaurant dans la barre latérale pour afficher ses sorties d&apos;argent.
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
                label="Déjà paye a TOK"
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
                valueLabel="Déjà facturé"
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
                      label: "Déjà paye a TOK",
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
                    label: "Déjà regle",
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
