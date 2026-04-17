import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CreditCard, Download, Eye, FileText, Gift, ReceiptText, RefreshCcw, Settings, Wallet } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  buildRestaurantPaymentSummary,
  filterRestaurantPaymentEvents,
  formatRestaurantPaymentMethod,
  getRestaurantPaymentDirectionMeta,
  getRestaurantPaymentSignedAmount,
  getRestaurantPaymentStatusMeta,
  type RestaurantPaymentDirectionFilter,
  type RestaurantPaymentEvent,
  type RestaurantPaymentStatusFilter,
} from "@/lib/dashboardPayments";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardRestaurant } from "./DashboardContext";

type Invoice = {
  id: string;
  invoice_number: string | null;
  period_start: string;
  period_end: string;
  amount_ht: number | string | null;
  amount_tva: number | string | null;
  amount_ttc: number | string | null;
  status: string | null;
  due_at: string | null;
  paid_at: string | null;
  pdf_url: string | null;
  created_at: string;
  restaurant_id: string;
};

type InvoiceSettings = {
  logo_url: string | null;
  company_name: string | null;
  company_address: string | null;
  company_city: string | null;
  company_postal_code: string | null;
  vat_number: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  payment_terms: string | null;
  footer_note: string | null;
  email: string | null;
  phone: string | null;
};

type ReservationFeeSummary = {
  count: number;
  amount: number;
};

type InvoiceReservationDetail = {
  id: string;
  total_amount: number | string | null;
  date: string;
  status: string | null;
  feature: string | null;
  billing_fee_chf: number | string | null;
  confirmed_at: string | null;
  cancelled_by: string | null;
};

const RESERVATION_FEE_PERIOD_START = "2000-01-01";
const RESERVATION_FEE_PERIOD_END = "2100-12-31";

const INVOICE_STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Brouillon", variant: "outline" },
  pending: { label: "En attente", variant: "secondary" },
  paid: { label: "Payee", variant: "default" },
  overdue: { label: "En retard", variant: "destructive" },
};

function toAmount(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number | string | null | undefined, currency: string | null | undefined = "CHF") {
  return `${toAmount(value).toFixed(2)} ${String(currency || "CHF").toUpperCase()}`;
}

function formatSignedAmount(value: number, currency: string | null | undefined = "CHF") {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${Math.abs(value).toFixed(2)} ${String(currency || "CHF").toUpperCase()}`;
}

function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(error: unknown) {
  if (!error) return null;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }
  return String(error);
}

export default function DashboardFactures() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const { selectedId, restaurants, loading: restaurantsLoading, error: restaurantsError } = useDashboardRestaurant();
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [generating, setGenerating] = useState(false);
  const [paymentDirectionFilter, setPaymentDirectionFilter] = useState<RestaurantPaymentDirectionFilter>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<RestaurantPaymentStatusFilter>("all");
  const isAdmin = roles.includes("admin");

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;

  const {
    data: invoices = [],
    isLoading: invoicesLoading,
    error: invoicesError,
  } = useQuery({
    queryKey: ["dashboard-invoices", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_invoices")
        .select("*")
        .eq("restaurant_id", selectedId!)
        .order("period_end", { ascending: false });

      if (error) throw error;
      return (data || []) as Invoice[];
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const {
    data: invoiceSettings = null,
    isLoading: settingsLoading,
    error: settingsError,
  } = useQuery({
    queryKey: ["dashboard-invoice-settings", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_invoice_settings")
        .select("*")
        .eq("restaurant_id", selectedId!)
        .maybeSingle();

      if (error) throw error;
      return (data || null) as InvoiceSettings | null;
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const {
    data: paymentHistory = [],
    isLoading: paymentsLoading,
    error: paymentsError,
  } = useQuery({
    queryKey: ["dashboard-payment-history", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_restaurant_payment_history" as never, {
        p_restaurant_id: selectedId!,
        p_limit: 500,
        p_before: null,
      } as never);

      if (error) throw error;
      return (data || []) as RestaurantPaymentEvent[];
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const { data: reservationFees = { count: 0, amount: 0 }, isLoading: reservationFeesLoading } = useQuery({
    queryKey: ["dashboard-reservation-fees", selectedId, RESERVATION_FEE_PERIOD_START, RESERVATION_FEE_PERIOD_END],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("compute_restaurant_reservation_fees", {
        p_restaurant_id: selectedId!,
        p_period_start: RESERVATION_FEE_PERIOD_START,
        p_period_end: RESERVATION_FEE_PERIOD_END,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      return {
        count: Number(row?.reservations_count ?? 0),
        amount: Number(row?.reservations_amount ?? 0),
      } satisfies ReservationFeeSummary;
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const { data: currentUninvoicedBase = 0, isLoading: uninvoicedBaseLoading } = useQuery({
    queryKey: ["dashboard-uninvoiced-amount", selectedId],
    queryFn: async () => {
      const [ordersRes, resRes] = await Promise.all([
        supabase
          .from("orders")
          .select("total_amount, metadata")
          .eq("restaurant_id", selectedId!)
          .is("restaurant_invoice_id", null)
          .not("status", "in", ["cancelled", "payment_failed", "refused", "pending"]),
        supabase
          .from("reservations")
          .select("total_amount")
          .eq("restaurant_id", selectedId!)
          .is("restaurant_invoice_id", null)
          .eq("feature", "zero-attente")
          .not("status", "in", ["cancelled", "no_show", "pending"])
          .gt("total_amount", 0),
      ]);

      let total = 0;
      (ordersRes.data || []).forEach(o => {
        total += Number(o.total_amount || 0) + Number((o.metadata as any)?.points_discount_amount || 0);
      });
      (resRes.data || []).forEach(r => {
        total += Number(r.total_amount || 0);
      });

      return total * 0.90; // La part du restaurateur a facturer
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const currentUninvoiced = currentUninvoicedBase + reservationFees.amount;
  const uninvoicedLoading = uninvoicedBaseLoading || reservationFeesLoading;

  const totalHT = useMemo(
    () => invoices.reduce((sum, invoice) => sum + toAmount(invoice.amount_ht), 0),
    [invoices],
  );
  const totalTTC = useMemo(
    () => invoices.reduce((sum, invoice) => sum + toAmount(invoice.amount_ttc), 0),
    [invoices],
  );
  const unpaidInvoices = useMemo(
    () => invoices.filter((invoice) => String(invoice.status || "").toLowerCase() !== "paid").length,
    [invoices],
  );

  const paymentSummary = useMemo(
    () => buildRestaurantPaymentSummary(paymentHistory),
    [paymentHistory],
  );
  const filteredPaymentHistory = useMemo(
    () => filterRestaurantPaymentEvents(paymentHistory, paymentDirectionFilter, paymentStatusFilter),
    [paymentDirectionFilter, paymentHistory, paymentStatusFilter],
  );

  const billingError = restaurantsError || getErrorMessage(invoicesError) || getErrorMessage(settingsError);
  const paymentError = getErrorMessage(paymentsError);

  const refreshBillingQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard-invoices", selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-invoice-settings", selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-payment-history", selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-uninvoiced-amount", selectedId] }),
      queryClient.invalidateQueries({
        queryKey: ["dashboard-reservation-fees", selectedId, RESERVATION_FEE_PERIOD_START, RESERVATION_FEE_PERIOD_END],
      }),
    ]);
  };

  const generateInvoices = async () => {
    setGenerating(true);

    const { data, error } = await supabase.functions.invoke("generate-invoices", { 
      body: selectedId ? { restaurant_id: selectedId } : {} 
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setGenerating(false);
      return;
    }

    toast({ title: `${Number(data?.generated || 0)} facture(s) de reversement generee(s)` });
    await refreshBillingQueries();
    setGenerating(false);
  };
  const markInvoicePaid = async (invoiceId: string) => {
    const { error } = await supabase
      .from("restaurant_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoiceId);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Facture marquee comme payee" });
    await refreshBillingQueries();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Factures & Reversements</h1>
            <p className="text-sm text-muted-foreground">
              {selectedRestaurant ? `Suivi des reversements de ${selectedRestaurant.name}` : "Selectionnez un restaurant dans la barre laterale."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/factures/parametres">
                <Settings className="mr-1 h-4 w-4" />
                Personnaliser
              </Link>
            </Button>
            {selectedRestaurant && (
              <Button size="sm" onClick={generateInvoices} disabled={generating || currentUninvoiced <= 0}>
                <RefreshCcw className={`mr-1 h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                {currentUninvoiced > 0 ? `Facturer l'encours (${formatAmount(currentUninvoiced)})` : "Rien a facturer"}
              </Button>
            )}
          </div>
        </div>

        {restaurantsLoading ? <p className="text-muted-foreground">Chargement des restaurants...</p> : null}
        {restaurantsError ? <p className="text-destructive">Erreur lors du chargement des restaurants : {restaurantsError}</p> : null}
        {!restaurantsLoading && !restaurantsError && restaurants.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>Aucun restaurant lie a votre compte.</p>
            </CardContent>
          </Card>
        ) : null}
        {!restaurantsLoading && !restaurantsError && restaurants.length > 0 && !selectedRestaurant ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <ReceiptText className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>Selectionnez un restaurant depuis la barre laterale pour afficher les factures.</p>
            </CardContent>
          </Card>
        ) : null}

        {selectedRestaurant ? (
          <>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Restaurant actif</p>
              <p className="text-sm font-semibold">{selectedRestaurant.name}</p>
            </div>

            <Tabs defaultValue="invoices" className="space-y-6">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="invoices">Factures</TabsTrigger>
                <TabsTrigger value="payments">Paiements</TabsTrigger>
              </TabsList>

              <TabsContent value="invoices" className="space-y-6">
                <div className="mb-4 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 text-violet-800">
                  <div className="flex items-start gap-3">
                    <Gift className="mt-0.5 h-5 w-5 text-violet-600" />
                    <div>
                      <h4 className="font-semibold">Remboursements Miamz (Points Fidelite)</h4>
                      <p className="text-sm">
                        Lorsqu'un client utilise ses Miamz pour payer, Tok prend en charge ce montant en totalite.
                        Ces remboursements sont automatiquement inclus sous forme de credit dans vos factures periodiques, ou vous pouvez demander un versement anticipe.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-primary">A Facturer (Encours)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-2xl font-bold text-primary">{uninvoicedLoading ? "..." : formatAmount(currentUninvoiced)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Montant pret a etre facture</p>
                      {!uninvoicedLoading ? (
                        <div className="space-y-1 border-t border-primary/10 pt-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Commandes et reservations prepayees</span>
                            <span className="font-medium">{formatAmount(currentUninvoicedBase)}</span>
                          </div>
                          {reservationFees.count > 0 ? (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">
                                Reservations confirmees ({reservationFees.count} x 5.-)
                              </span>
                              <span className="font-medium">{reservationFees.amount.toFixed(2)} CHF</span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Historique HT</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{formatAmount(totalHT)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Historique TTC</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{formatAmount(totalTTC)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Factures Impayees</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{unpaidInvoices}</p>
                    </CardContent>
                  </Card>
                </div>

                {invoicesLoading || settingsLoading ? <p className="text-muted-foreground">Chargement des factures...</p> : null}
                {billingError ? <p className="text-destructive">Erreur lors du chargement : {billingError}</p> : null}

                {!invoicesLoading && !billingError && invoices.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
                      <p>Aucune facture pour ce restaurant.</p>
                      <p className="mt-1 text-xs">Les factures apparaitront ici des qu elles sont generees.</p>
                    </CardContent>
                  </Card>
                ) : null}

                {!invoicesLoading && !billingError ? (
                  <div className="space-y-3">
                    {invoices.map((invoice) => {
                      const statusKey = String(invoice.status || "draft").toLowerCase();
                      const statusMeta = INVOICE_STATUS_META[statusKey] || {
                        label: statusKey || "Inconnu",
                        variant: "outline" as const,
                      };

                      return (
                        <Card key={invoice.id}>
                          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-4">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{formatAmount(invoice.amount_ttc)}</span>
                                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                                {invoice.invoice_number ? (
                                  <span className="font-mono text-xs text-muted-foreground">{invoice.invoice_number}</span>
                                ) : null}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Periode : {formatDate(invoice.period_start)} {"->"} {formatDate(invoice.period_end)}
                              </p>
                              {invoice.due_at && !invoice.paid_at ? (
                                <p className="text-xs text-muted-foreground">Echeance : {formatDate(invoice.due_at)}</p>
                              ) : null}
                              {invoice.paid_at ? (
                                <p className="text-xs text-muted-foreground">Payee le {formatDate(invoice.paid_at)}</p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => setPreviewInvoice(invoice)}>
                                <Eye className="mr-1 h-4 w-4" />
                                Apercu
                              </Button>
                              {invoice.pdf_url ? (
                                <Button size="sm" variant="outline" asChild>
                                  <a href={invoice.pdf_url} target="_blank" rel="noreferrer">
                                    <Download className="mr-1 h-4 w-4" />
                                    PDF
                                  </a>
                                </Button>
                              ) : null}
                              {isAdmin && String(invoice.status || "").toLowerCase() !== "paid" ? (
                                <Button size="sm" onClick={() => markInvoicePaid(invoice.id)}>
                                  Marquer payee
                                </Button>
                              ) : null}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="payments" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Card>
                    <CardContent className="flex items-center justify-between py-5">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Encaissements recus</p>
                        <p className="text-2xl font-bold">{formatAmount(paymentSummary.receivedCharges)}</p>
                      </div>
                      <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex items-center justify-between py-5">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Remboursements</p>
                        <p className="text-2xl font-bold">{formatAmount(paymentSummary.refunds)}</p>
                      </div>
                      <ArrowUpRight className="h-5 w-5 text-amber-600" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex items-center justify-between py-5">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Paiements effectues</p>
                        <p className="text-2xl font-bold">{formatAmount(paymentSummary.issuedPayments)}</p>
                      </div>
                      <Wallet className="h-5 w-5 text-primary" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="flex items-center justify-between py-5">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Net plateforme</p>
                        <p className="text-2xl font-bold">{formatSignedAmount(paymentSummary.netPlatform)}</p>
                      </div>
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardContent className="space-y-2 pt-5">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Type</p>
                      <Select
                        value={paymentDirectionFilter}
                        onValueChange={(value) => setPaymentDirectionFilter(value as RestaurantPaymentDirectionFilter)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Tous les paiements" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous</SelectItem>
                          <SelectItem value="received">Recus</SelectItem>
                          <SelectItem value="issued">Effectues</SelectItem>
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="space-y-2 pt-5">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Statut</p>
                      <Select
                        value={paymentStatusFilter}
                        onValueChange={(value) => setPaymentStatusFilter(value as RestaurantPaymentStatusFilter)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Tous les statuts" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tous</SelectItem>
                          <SelectItem value="succeeded">Reussis</SelectItem>
                          <SelectItem value="pending">En attente</SelectItem>
                          <SelectItem value="failed">Echoues</SelectItem>
                          <SelectItem value="cancelled">Annules</SelectItem>
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                </div>

                {paymentsLoading ? <p className="text-muted-foreground">Chargement des paiements...</p> : null}
                {paymentError ? <p className="text-destructive">Erreur lors du chargement des paiements : {paymentError}</p> : null}

                {!paymentsLoading && !paymentError && filteredPaymentHistory.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      <Wallet className="mx-auto mb-3 h-10 w-10 opacity-40" />
                      <p>Aucun paiement pour ce restaurant.</p>
                    </CardContent>
                  </Card>
                ) : null}

                {!paymentsLoading && !paymentError && filteredPaymentHistory.length > 0 ? (
                  <div className="space-y-3">
                    {filteredPaymentHistory.map((event) => {
                      const directionMeta = getRestaurantPaymentDirectionMeta(event.direction);
                      const statusMeta = getRestaurantPaymentStatusMeta(event.status);
                      const amount = getRestaurantPaymentSignedAmount(event);
                      const paymentMethod = formatRestaurantPaymentMethod(event.payment_method);
                      return (
                        <Card key={`${event.event_kind}-${event.event_id}`}>
                          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-4">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{event.title}</span>
                                <Badge variant={directionMeta.variant}>{directionMeta.label}</Badge>
                                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                              </div>
                              {event.subtitle ? (
                                <p className="text-sm text-muted-foreground">{event.subtitle}</p>
                              ) : null}
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>{formatDateTime(event.occurred_at) || event.occurred_at}</span>
                                {paymentMethod ? <span>Methode : {paymentMethod}</span> : null}
                              </div>
                            </div>

                            <div className="text-right">
                              <p className={`text-lg font-bold ${amount >= 0 ? "text-emerald-600" : "text-foreground"}`}>
                                {formatSignedAmount(amount, event.currency)}
                              </p>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">{event.event_kind}</p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>

            <Dialog open={!!previewInvoice} onOpenChange={(open) => { if (!open) setPreviewInvoice(null); }}>
              <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Apercu de la facture</DialogTitle>
                </DialogHeader>
                {previewInvoice ? (
                  <InvoicePreview
                    invoice={previewInvoice}
                    settings={invoiceSettings}
                    restaurantName={selectedRestaurant.name}
                  />
                ) : null}
              </DialogContent>
            </Dialog>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

function InvoicePreview({
  invoice,
  settings,
  restaurantName,
}: {
  invoice: Invoice;
  settings: InvoiceSettings | null;
  restaurantName: string;
}) {
  const invoiceDate = formatDate(invoice.created_at, { month: "long" });
  const dueDate = formatDate(invoice.due_at, { month: "long" });
  const periodStart = formatDate(invoice.period_start, { month: "long" });
  const periodEnd = formatDate(invoice.period_end, { month: "long" });
  const invoiceStatus = String(invoice.status || "").toLowerCase();

  const { data: details, isLoading } = useQuery({
    queryKey: ["invoice-details", invoice.id],
    queryFn: async () => {
      const [ordersRes, resRes] = await Promise.all([
        supabase.from("orders").select("id, order_number, total_amount, metadata, created_at").eq("restaurant_invoice_id", invoice.id),
        supabase
          .from("reservations")
          .select("id, total_amount, date, status, feature, billing_fee_chf, confirmed_at, cancelled_by")
          .eq("restaurant_invoice_id", invoice.id),
      ]);
      return {
        orders: ordersRes.data || [],
        reservations: (resRes.data || []) as InvoiceReservationDetail[],
      };
    },
  });

  const billedReservationFees = (details?.reservations || []).filter((reservation) => {
    const isCustomerSideCancellation =
      reservation.status === "cancelled" &&
      (reservation.cancelled_by === "customer" || reservation.cancelled_by === "admin");
    return Boolean(reservation.confirmed_at) && !isCustomerSideCancellation;
  });

  const prepaidReservations = (details?.reservations || []).filter((reservation) => {
    return Number(reservation.total_amount || 0) > 0;
  });

  return (
    <div className="space-y-6 rounded-lg border bg-white p-8 text-sm text-black">
      <div className="flex items-start justify-between">
        <div>
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="mb-2 h-16 object-contain" />
          ) : (
            <div className="mb-2 flex h-12 w-28 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">Logo</div>
          )}
          <p className="text-base font-bold">{settings?.company_name || restaurantName}</p>
          {settings?.company_address ? <p>{settings.company_address}</p> : null}
          {(settings?.company_postal_code || settings?.company_city) ? (
            <p>{settings?.company_postal_code} {settings?.company_city}</p>
          ) : null}
          {settings?.vat_number ? <p className="mt-1 text-xs">N TVA : {settings.vat_number}</p> : null}
          {settings?.email ? <p className="text-xs">{settings.email}</p> : null}
          {settings?.phone ? <p className="text-xs">{settings.phone}</p> : null}
        </div>

        <div className="text-right">
          <p className="text-2xl font-bold text-gray-800">FACTURE</p>
          {invoice.invoice_number ? <p className="mt-1 font-mono text-sm">{invoice.invoice_number}</p> : null}
          {invoiceDate ? <p className="mt-2 text-xs text-gray-500">Date d emission : {invoiceDate}</p> : null}
          {dueDate ? <p className="text-xs text-gray-500">Echeance : {dueDate}</p> : null}
        </div>
      </div>

      <div className="rounded-lg bg-gray-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Periode de facturation</p>
        <p className="font-medium">{periodStart} - {periodEnd}</p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="py-3 text-left font-semibold">Description</th>
            <th className="py-3 text-right font-semibold">Montant</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr className="border-b"><td className="py-3" colSpan={2}>Chargement des details...</td></tr>
          ) : details && (details.orders.length > 0 || prepaidReservations.length > 0 || billedReservationFees.length > 0) ? (
            <>
              {details.orders.map(o => {
                const paid = Number(o.total_amount || 0);
                const miamz = Number((o.metadata as any)?.points_discount_amount || 0);
                const base = paid + miamz;
                const payout = base * 0.90;
                return (
                  <tr key={o.id} className="border-b text-xs text-gray-600">
                    <td className="py-2">Commande #{o.order_number} <span className="text-gray-400">({formatDate(o.created_at)})</span></td>
                    <td className="py-2 text-right">{formatAmount(payout)}</td>
                  </tr>
                );
              })}
              {prepaidReservations.map((reservation) => {
                const payout = Number(reservation.total_amount || 0) * 0.90;
                const reservationLabel =
                  reservation.feature === "chefs_table" ? "Chef's Table" : "Flash / Zero Attente";
                return (
                  <tr key={`prepaid-${reservation.id}`} className="border-b text-xs text-gray-600">
                    <td className="py-2">
                      {reservationLabel} <span className="text-gray-400">({formatDate(reservation.date)})</span>
                    </td>
                    <td className="py-2 text-right">{formatAmount(payout)}</td>
                  </tr>
                );
              })}
              {billedReservationFees.map((reservation) => {
                const fee = Number(reservation.billing_fee_chf || 0);
                const statusLabel = reservation.status ? ` - ${reservation.status}` : "";
                const cancellationLabel =
                  reservation.status === "cancelled" && reservation.cancelled_by
                    ? ` (${reservation.cancelled_by})`
                    : "";
                return (
                  <tr key={`billing-fee-${reservation.id}`} className="border-b text-xs text-gray-600">
                    <td className="py-2">
                      Reservation confirmee 5.-{statusLabel}
                      {cancellationLabel} <span className="text-gray-400">({formatDate(reservation.date)})</span>
                    </td>
                    <td className="py-2 text-right">{formatAmount(fee)}</td>
                  </tr>
                );
              })}
            </>
          ) : (
            <tr className="border-b">
              <td className="py-3 text-gray-500 italic">Prestation globale - {restaurantName}</td>
              <td className="py-3 text-right text-gray-500">{formatAmount(invoice.amount_ht)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className="py-2 font-semibold">Sous-total HT</td>
            <td className="py-2 text-right">{formatAmount(invoice.amount_ht)}</td>
          </tr>
          <tr>
            <td className="py-2">TVA (7.7%)</td>
            <td className="py-2 text-right">{formatAmount(invoice.amount_tva)}</td>
          </tr>
          <tr className="border-t-2 border-gray-800">
            <td className="py-3 text-lg font-bold">Total TTC</td>
            <td className="py-3 text-right text-lg font-bold">{formatAmount(invoice.amount_ttc)}</td>
          </tr>
        </tfoot>
      </table>

      {settings?.iban ? (
        <div className="space-y-1 rounded-lg bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Coordonnees bancaires</p>
          <p>IBAN : {settings.iban}</p>
          {settings.bic ? <p>BIC : {settings.bic}</p> : null}
          {settings.bank_name ? <p>Banque : {settings.bank_name}</p> : null}
        </div>
      ) : null}

      {settings?.payment_terms ? <p className="text-xs text-gray-500">{settings.payment_terms}</p> : null}

      <div
        className={`rounded-lg py-3 text-center text-lg font-bold ${
          invoiceStatus === "paid"
            ? "bg-green-50 text-green-700"
            : invoiceStatus === "overdue"
              ? "bg-red-50 text-red-700"
              : "bg-yellow-50 text-yellow-700"
        }`}
      >
        {invoiceStatus === "paid" ? "PAYEE" : invoiceStatus === "overdue" ? "EN RETARD" : "EN ATTENTE DE PAIEMENT"}
      </div>

      {settings?.footer_note ? (
        <p className="border-t pt-4 text-center text-xs text-gray-400">{settings.footer_note}</p>
      ) : null}
    </div>
  );
}
