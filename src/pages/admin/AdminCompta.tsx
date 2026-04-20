import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calculator, FileSignature, Receipt, Store, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();

type RestaurantFilterRow = {
  id: string;
  name: string;
};

type AdminOrderRow = {
  id: string;
  created_at: string;
  total_amount: number | string | null;
  payment_status?: string | null;
  status: string;
  order_number: string | null;
  metadata: Record<string, unknown> | null;
  restaurant_id: string;
  restaurants?: { name: string | null } | null;
};

type ReservationHistoryRow = {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  customer_name: string | null;
  status: string;
  cancelled_by: string | null;
  cancellation_reason_code: string | null;
  cancellation_reason_details: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  billable: boolean;
  billing_fee_chf: number | string | null;
  invoice_id: string | null;
};

type AdminInvoiceRow = {
  id: string;
  restaurant_id: string;
  invoice_number: string | null;
  period_start: string;
  period_end: string;
  amount_ht: number | string | null;
  amount_tva: number | string | null;
  amount_ttc: number | string | null;
  status: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  invoice_type: "payout" | "reservation_fees" | null;
  restaurants?: { name: string | null } | null;
};

type FraudMetricRow = {
  restaurant_id: string;
  restaurant_name: string;
  confirmed_count: number;
  cancelled_by_restaurant_count: number;
  cancellation_rate: number | string | null;
  late_cancellations_count: number;
  top_reason_code: string | null;
  top_reason_count: number | null;
};

export default function AdminCompta() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [generatingFeeInvoices, setGeneratingFeeInvoices] = useState(false);

  const handleGenerateTokFeeInvoices = async () => {
    setGeneratingFeeInvoices(true);
    try {
      const firstOfMonth = `${selectedMonth}-01`;
      const { data, error } = await (supabase.rpc as any)(
        selectedRestaurant === "all"
          ? "generate_tok_reservation_fee_invoices_all"
          : "generate_tok_reservation_fee_invoice",
        selectedRestaurant === "all"
          ? { p_month: firstOfMonth }
          : { p_restaurant_id: selectedRestaurant, p_month: firstOfMonth },
      );
      if (error) throw error;

      const generated = selectedRestaurant === "all"
        ? Number(data ?? 0)
        : data
          ? 1
          : 0;

      toast({
        title: generated > 0 ? "Factures TOK generees" : "Aucune facture a generer",
        description: generated > 0
          ? `${generated} facture${generated > 1 ? "s" : ""} TOK -> restaurant emise${generated > 1 ? "s" : ""} pour ${selectedMonth}.`
          : "Aucune reservation facturable non encore facturee pour cette periode.",
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-compta-reservations"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-compta-fraud"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-compta-reservation-fee-invoices"] }),
      ]);
    } catch (err) {
      toast({
        title: "Erreur de generation",
        description: err instanceof Error ? err.message : "Impossible de generer les factures TOK.",
        variant: "destructive",
      });
    } finally {
      setGeneratingFeeInvoices(false);
    }
  };

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-restaurants-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return (data || []) as RestaurantFilterRow[];
    },
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["admin-compta-orders", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      const startOfMonth = new Date(`${selectedMonth}-01T00:00:00Z`);
      const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59);

        let query = supabase
          .from("orders")
          .select(`
            id,
            created_at,
            total_amount,
            payment_status,
            status,
            order_number,
            metadata,
            restaurant_id,
            restaurants ( name )
          `)
          .gte("created_at", startOfMonth.toISOString())
          .lte("created_at", endOfMonth.toISOString())
          .in("payment_status", ["paid", "captured"])
          .not("status", "eq", "cancelled")
          .not("status", "eq", "pending");

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AdminOrderRow[];
    },
  });

  const { data: reservationHistory = [], isLoading: reservationHistoryLoading } = useQuery({
    queryKey: ["admin-compta-reservations", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      const firstOfMonth = `${selectedMonth}-01`;
      const { data, error } = await (supabase.rpc as any)("admin_get_reservation_billing_history", {
        p_restaurant_id: selectedRestaurant === "all" ? null : selectedRestaurant,
        p_month: firstOfMonth,
      });

      if (error) throw error;
      return (data || []) as ReservationHistoryRow[];
    },
  });

  const { data: payoutInvoices = [], isLoading: payoutInvoicesLoading } = useQuery({
    queryKey: ["admin-compta-payout-invoices", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      const startOfMonth = `${selectedMonth}-01`;
      const startDate = new Date(`${selectedMonth}-01T00:00:00Z`);
      const endOfMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).toISOString().slice(0, 10);

      let query = supabase
        .from("restaurant_invoices")
        .select(`
          id,
          restaurant_id,
          invoice_number,
          period_start,
          period_end,
          amount_ht,
          amount_tva,
          amount_ttc,
          status,
          due_at,
          paid_at,
          created_at,
          invoice_type,
          restaurants ( name )
        `)
        .eq("invoice_type", "payout")
        .gte("period_start", startOfMonth)
        .lte("period_end", endOfMonth)
        .order("created_at", { ascending: false });

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AdminInvoiceRow[];
    },
  });

  const { data: tokFeeInvoices = [], isLoading: tokFeeInvoicesLoading } = useQuery({
    queryKey: ["admin-compta-reservation-fee-invoices", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      const startOfMonth = `${selectedMonth}-01`;
      const startDate = new Date(`${selectedMonth}-01T00:00:00Z`);
      const endOfMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).toISOString().slice(0, 10);

      let query = supabase
        .from("restaurant_invoices")
        .select(`
          id,
          restaurant_id,
          invoice_number,
          period_start,
          period_end,
          amount_ht,
          amount_tva,
          amount_ttc,
          status,
          due_at,
          paid_at,
          created_at,
          invoice_type,
          restaurants ( name )
        `)
        .eq("invoice_type", "reservation_fees")
        .gte("period_start", startOfMonth)
        .lte("period_end", endOfMonth)
        .order("created_at", { ascending: false });

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AdminInvoiceRow[];
    },
  });

  const handleMarkInvoicePaid = async (invoice: AdminInvoiceRow) => {
    const { error } = await supabase
      .from("restaurant_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoice.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: invoice.invoice_type === "reservation_fees"
        ? "Reglement facture TOK marque comme paye"
        : "Reversement marque comme paye",
    });

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-compta-payout-invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-compta-reservation-fee-invoices"] }),
    ]);
  };

  const { data: fraudMetrics = [], isLoading: fraudMetricsLoading } = useQuery({
    queryKey: ["admin-compta-fraud", selectedMonth],
    queryFn: async () => {
      const firstOfMonth = `${selectedMonth}-01`;
      const { data, error } = await (supabase.rpc as any)("admin_get_cancellation_fraud_metrics", {
        p_month: firstOfMonth,
      });

      if (error) throw error;
      return (data || []) as FraudMetricRow[];
    },
  });

  const { metrics, standardOrders, miamzOrders } = useMemo(() => {
    let totalPaid = 0;
    let totalMiamz = 0;

    const standard: AdminOrderRow[] = [];
    const miamz: AdminOrderRow[] = [];

    orders.forEach((order) => {
      const amount = Number(order.total_amount || 0);
      const miamzValue = Number((order.metadata as Record<string, unknown> | null)?.points_discount_amount || 0);

      totalPaid += amount;
      totalMiamz += miamzValue;

      if (miamzValue > 0) {
        miamz.push(order);
      }
      standard.push(order);
    });

    const grossRevenue = totalPaid + totalMiamz;
    const tokCommission = grossRevenue * 0.1;
    const restaurantPayout = grossRevenue * 0.9;

    return {
      metrics: {
        totalPaid,
        totalMiamz,
        grossRevenue,
        tokCommission,
        restaurantPayout,
      },
      standardOrders: standard.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      miamzOrders: miamz.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    };
  }, [orders]);

  const payoutMetrics = useMemo(() => {
    const totalTtc = payoutInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);
    const unpaid = payoutInvoices.filter((invoice) => String(invoice.status || "").toLowerCase() !== "paid");
    const unpaidTtc = unpaid.reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);
    return {
      total: payoutInvoices.length,
      totalTtc,
      unpaidCount: unpaid.length,
      unpaidTtc,
    };
  }, [payoutInvoices]);

  const tokFeeMetrics = useMemo(() => {
    const totalTtc = tokFeeInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);
    const unpaid = tokFeeInvoices.filter((invoice) => String(invoice.status || "").toLowerCase() !== "paid");
    const unpaidTtc = unpaid.reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);
    return {
      total: tokFeeInvoices.length,
      totalTtc,
      unpaidCount: unpaid.length,
      unpaidTtc,
    };
  }, [tokFeeInvoices]);

  const reservationMetrics = useMemo(() => {
    const confirmed = reservationHistory.filter((row) => !!row.confirmed_at).length;
    const billable = reservationHistory.filter((row) => row.billable).length;
    const cancelledByRestaurant = reservationHistory.filter((row) => row.cancelled_by === "restaurant").length;
    const revenue = reservationHistory
      .filter((row) => row.billable)
      .reduce((sum, row) => sum + Number(row.billing_fee_chf || 0), 0);

    return { confirmed, billable, cancelledByRestaurant, revenue };
  }, [reservationHistory]);

  const displayedFraudMetrics = useMemo(() => {
    if (selectedRestaurant === "all") {
      return fraudMetrics;
    }
    return fraudMetrics.filter((row) => row.restaurant_id === selectedRestaurant);
  }, [fraudMetrics, selectedRestaurant]);

  const monthOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    for (let index = 0; index < 6; index += 1) {
      const date = new Date();
      date.setMonth(date.getMonth() - index);
      const value = format(date, "yyyy-MM");
      const label = format(date, "MMMM yyyy", { locale: fr });
      options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return options;
  }, []);

  const isLoading =
    ordersLoading
    || reservationHistoryLoading
    || fraudMetricsLoading
    || payoutInvoicesLoading
    || tokFeeInvoicesLoading;

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
            <Calculator className="h-7 w-7 text-primary" />
            Comptabilite (Reversements)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verifiez les commissions (10%) et les compensations Miamz avant emission de facture.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Periode</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px] bg-white">
                <SelectValue />
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

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Restaurant</label>
            <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
              <SelectTrigger className="w-[220px] bg-white">
                <SelectValue placeholder="Selectionner un restaurant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les restaurants</SelectItem>
                {restaurants.map((restaurant) => (
                  <SelectItem key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CA Virtuel Brut</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{metrics.grossRevenue.toFixed(2)} CHF</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Paye ({metrics.totalPaid.toFixed(2)}) + Miamz ({metrics.totalMiamz.toFixed(2)})
            </p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-700">Commission TOK (10%)</CardTitle>
            <Calculator className="h-4 w-4 text-orange-700" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-700">{metrics.tokCommission.toFixed(2)} CHF</p>
            <p className="mt-1 text-xs text-orange-600">Ce que Tok a gagne sur le CA Brut</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-700">Reversement Restos (90%)</CardTitle>
            <Store className="h-4 w-4 text-emerald-700" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-700">{metrics.restaurantPayout.toFixed(2)} CHF</p>
            <p className="mt-1 text-xs text-emerald-600">Montant global de la facture</p>
          </CardContent>
        </Card>
        <Card className="border-pink-200 bg-pink-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-pink-700">Miamz Compenses</CardTitle>
            <Ticket className="h-4 w-4 text-pink-700" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-pink-700">{metrics.totalMiamz.toFixed(2)} CHF</p>
            <p className="mt-1 text-xs text-pink-600">Couverture de Tok pour fidelite</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Tabs defaultValue="all" className="w-full">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle>Historique detaille</CardTitle>
              <TabsList>
                <TabsTrigger value="all">Toutes les transactions ({standardOrders.length})</TabsTrigger>
                <TabsTrigger
                  value="miamz"
                  className="text-pink-600 data-[state=active]:bg-pink-50 data-[state=active]:text-pink-700"
                >
                  Transaction avec Miamz ({miamzOrders.length})
                </TabsTrigger>
                <TabsTrigger value="reservations">Reservations ({reservationHistory.length})</TabsTrigger>
                <TabsTrigger
                  value="payouts"
                  className="text-emerald-700 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800"
                >
                  Reversements ({payoutInvoices.length})
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : (
              <>
                <TabsContent value="all" className="mt-0">
                  {standardOrders.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground">Aucune donnee pour cette periode.</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Num / Date</TableHead>
                            {selectedRestaurant === "all" ? <TableHead>Restaurant</TableHead> : null}
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">Paye (Carte/Twint)</TableHead>
                            <TableHead className="text-right text-pink-600">Part Miamz</TableHead>
                            <TableHead className="text-right font-bold text-primary">Total Brut</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {standardOrders.map((order) => {
                            const paid = Number(order.total_amount || 0);
                            const miamz = Number((order.metadata as Record<string, unknown> | null)?.points_discount_amount || 0);
                            return (
                              <TableRow key={order.id}>
                                <TableCell>
                                  <div className="text-xs font-medium">#{order.order_number}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(order.created_at), "dd MMM HH:mm", { locale: fr })}
                                  </div>
                                </TableCell>
                                {selectedRestaurant === "all" ? (
                                  <TableCell className="text-xs">{order.restaurants?.name}</TableCell>
                                ) : null}
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px]">
                                    {order.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-sm">{paid.toFixed(2)} CHF</TableCell>
                                <TableCell className="text-right text-sm text-pink-600">
                                  {miamz > 0 ? `+${miamz.toFixed(2)} CHF` : "-"}
                                </TableCell>
                                <TableCell className="text-right text-sm font-bold text-primary">
                                  {(paid + miamz).toFixed(2)} CHF
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="miamz" className="mt-0">
                  {miamzOrders.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground">Aucune utilisation de Miamz sur cette periode.</p>
                  ) : (
                    <div className="rounded-md border border-pink-100">
                      <Table>
                        <TableHeader className="bg-pink-50/50">
                          <TableRow>
                            <TableHead>Num / Date</TableHead>
                            {selectedRestaurant === "all" ? <TableHead>Restaurant</TableHead> : null}
                            <TableHead className="text-right">Paye par client</TableHead>
                            <TableHead className="text-right font-bold text-pink-600">Pris en charge (Miamz)</TableHead>
                            <TableHead className="text-right">Total Commande</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {miamzOrders.map((order) => {
                            const paid = Number(order.total_amount || 0);
                            const miamz = Number((order.metadata as Record<string, unknown> | null)?.points_discount_amount || 0);
                            return (
                              <TableRow key={order.id}>
                                <TableCell>
                                  <div className="text-xs font-medium">#{order.order_number}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(order.created_at), "dd MMM", { locale: fr })}
                                  </div>
                                </TableCell>
                                {selectedRestaurant === "all" ? (
                                  <TableCell className="text-xs">{order.restaurants?.name}</TableCell>
                                ) : null}
                                <TableCell className="text-right text-sm">{paid.toFixed(2)} CHF</TableCell>
                                <TableCell className="text-right text-sm font-bold text-pink-600">
                                  {miamz.toFixed(2)} CHF
                                </TableCell>
                                <TableCell className="text-right text-sm">{(paid + miamz).toFixed(2)} CHF</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="reservations" className="mt-0 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                    <div className="text-sm">
                      <p className="font-semibold text-primary">Facturer les frais de reservation TOK -&gt; restaurateur</p>
                      <p className="text-xs text-muted-foreground">
                        Genere une facture {selectedRestaurant === "all" ? "par restaurant" : "pour ce restaurant"} pour {monthOptions.find((option) => option.value === selectedMonth)?.label || selectedMonth}.
                        Chaque reservation confirmee non facturee = 5.- pour TOK.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleGenerateTokFeeInvoices}
                      disabled={generatingFeeInvoices || reservationMetrics.billable === 0}
                    >
                      <FileSignature className={`mr-1 h-4 w-4 ${generatingFeeInvoices ? "animate-pulse" : ""}`} />
                      {generatingFeeInvoices ? "Generation..." : "Generer les factures TOK"}
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="bg-white">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Confirmees</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">{reservationMetrics.confirmed}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-emerald-200 bg-emerald-50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-700">Facturables</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-emerald-700">{reservationMetrics.billable}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-orange-200 bg-orange-50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-orange-700">Annulees par le resto</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-orange-700">{reservationMetrics.cancelledByRestaurant}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-primary">Revenu TOK (5.-)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-primary">{reservationMetrics.revenue.toFixed(2)} CHF</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm">
                    <p className="font-semibold text-orange-800">Factures TOK emises aux restaurateurs (5.- par reservation confirmee)</p>
                    <p className="mt-1 text-xs text-orange-700">
                      Ces factures sont payees par les restaurateurs a TOK. Marquez-les comme payees une fois l'encaissement confirme.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="bg-white">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total facture</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">{tokFeeMetrics.totalTtc.toFixed(2)} CHF</p>
                        <p className="mt-1 text-xs text-muted-foreground">{tokFeeMetrics.total} facture(s) sur la periode</p>
                      </CardContent>
                    </Card>
                    <Card className="border-orange-200 bg-orange-50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-orange-700">Restant a encaisser</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-orange-700">{tokFeeMetrics.unpaidTtc.toFixed(2)} CHF</p>
                        <p className="mt-1 text-xs text-orange-600">{tokFeeMetrics.unpaidCount} facture(s) impayee(s)</p>
                      </CardContent>
                    </Card>
                    <Card className="border-emerald-200 bg-emerald-50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-700">Deja encaisse</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-emerald-700">
                          {(tokFeeMetrics.totalTtc - tokFeeMetrics.unpaidTtc).toFixed(2)} CHF
                        </p>
                        <p className="mt-1 text-xs text-emerald-600">{tokFeeMetrics.total - tokFeeMetrics.unpaidCount} facture(s) payee(s)</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Factures TOK - frais de reservation</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {tokFeeInvoices.length === 0 ? (
                        <p className="py-6 text-center text-muted-foreground">Aucune facture TOK sur cette periode.</p>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>N facture / Date</TableHead>
                                {selectedRestaurant === "all" ? <TableHead>Restaurant</TableHead> : null}
                                <TableHead>Periode</TableHead>
                                <TableHead className="text-right">Montant HT</TableHead>
                                <TableHead className="text-right">TVA</TableHead>
                                <TableHead className="text-right font-bold">Total TTC</TableHead>
                                <TableHead>Statut</TableHead>
                                <TableHead>Echeance</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tokFeeInvoices.map((invoice) => {
                                const status = String(invoice.status || "").toLowerCase();
                                const isPaid = status === "paid";
                                const statusColor = isPaid
                                  ? "bg-emerald-100 text-emerald-700"
                                  : status === "overdue"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700";
                                return (
                                  <TableRow key={invoice.id}>
                                    <TableCell>
                                      <div className="font-mono text-xs">{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {format(new Date(invoice.created_at), "dd MMM yyyy", { locale: fr })}
                                      </div>
                                    </TableCell>
                                    {selectedRestaurant === "all" ? (
                                      <TableCell className="text-xs">{invoice.restaurants?.name || "-"}</TableCell>
                                    ) : null}
                                    <TableCell className="text-xs">
                                      {format(new Date(invoice.period_start), "dd MMM", { locale: fr })} -{" "}
                                      {format(new Date(invoice.period_end), "dd MMM", { locale: fr })}
                                    </TableCell>
                                    <TableCell className="text-right text-sm">{Number(invoice.amount_ht || 0).toFixed(2)} CHF</TableCell>
                                    <TableCell className="text-right text-xs text-muted-foreground">
                                      {Number(invoice.amount_tva || 0).toFixed(2)} CHF
                                    </TableCell>
                                    <TableCell className="text-right text-sm font-bold">{Number(invoice.amount_ttc || 0).toFixed(2)} CHF</TableCell>
                                    <TableCell>
                                      <Badge className={`text-[10px] ${statusColor}`}>{invoice.status || "draft"}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {invoice.due_at
                                        ? format(new Date(invoice.due_at), "dd MMM yyyy", { locale: fr })
                                        : "-"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {!isPaid ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleMarkInvoicePaid(invoice)}
                                        >
                                          Marquer payee
                                        </Button>
                                      ) : (
                                        <span className="text-xs text-emerald-600">
                                          Payee {invoice.paid_at ? `le ${format(new Date(invoice.paid_at), "dd/MM", { locale: fr })}` : ""}
                                        </span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Analyse anti-fraude</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {displayedFraudMetrics.length === 0 ? (
                        <p className="py-6 text-center text-muted-foreground">Aucune donnee.</p>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Restaurant</TableHead>
                                <TableHead className="text-right">Confirmees</TableHead>
                                <TableHead className="text-right">Annulees resto</TableHead>
                                <TableHead className="text-right">Taux annulation</TableHead>
                                <TableHead className="text-right">Annulations tardives (&lt; 2h)</TableHead>
                                <TableHead>Raison la plus invoquee</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {displayedFraudMetrics.map((row) => {
                                const rate = Number(row.cancellation_rate || 0);
                                const badgeClass =
                                  rate > 25
                                    ? "border-red-200 bg-red-50 text-red-700"
                                    : rate >= 10
                                      ? "border-orange-200 bg-orange-50 text-orange-700"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700";
                                return (
                                  <TableRow key={row.restaurant_id}>
                                    <TableCell className="font-medium">{row.restaurant_name}</TableCell>
                                    <TableCell className="text-right">{row.confirmed_count}</TableCell>
                                    <TableCell className="text-right">{row.cancelled_by_restaurant_count}</TableCell>
                                    <TableCell className="text-right">
                                      <Badge variant="outline" className={badgeClass}>
                                        {rate.toFixed(1)}%
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{row.late_cancellations_count}</TableCell>
                                    <TableCell className="text-xs">
                                      {row.top_reason_code ? `${row.top_reason_code} (x${row.top_reason_count || 0})` : "-"}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Historique des reservations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {reservationHistory.length === 0 ? (
                        <p className="py-6 text-center text-muted-foreground">Aucune reservation sur cette periode.</p>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                {selectedRestaurant === "all" ? <TableHead>Restaurant</TableHead> : null}
                                <TableHead>Client</TableHead>
                                <TableHead>Statut</TableHead>
                                <TableHead>Annule par</TableHead>
                                <TableHead>Raison</TableHead>
                                <TableHead className="text-center">Facturable</TableHead>
                                <TableHead className="text-right">5.-</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {reservationHistory.map((row) => (
                                <TableRow key={row.id}>
                                  <TableCell className="text-xs">
                                    {format(new Date(`${row.reservation_date}T${row.reservation_time}`), "dd MMM HH:mm", {
                                      locale: fr,
                                    })}
                                  </TableCell>
                                  {selectedRestaurant === "all" ? (
                                    <TableCell className="text-xs">{row.restaurant_name}</TableCell>
                                  ) : null}
                                  <TableCell className="text-xs">{row.customer_name || "-"}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px]">
                                      {row.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs">{row.cancelled_by || "-"}</TableCell>
                                  <TableCell className="text-xs">
                                    {row.cancellation_reason_code
                                      ? `${row.cancellation_reason_code}${row.cancellation_reason_details ? ` - ${row.cancellation_reason_details}` : ""}`
                                      : "-"}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {row.billable ? (
                                      <Badge className="bg-emerald-100 text-emerald-700">Oui</Badge>
                                    ) : (
                                      <Badge variant="outline">Non</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right text-xs font-medium">
                                    {row.billable ? Number(row.billing_fee_chf || 0).toFixed(2) : "-"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="payouts" className="mt-0 space-y-6">
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
                    <p className="font-semibold text-emerald-800">Factures emises par les restaurateurs (90% des commandes / reservations payees)</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      TOK doit reverser ces montants aux restaurateurs. Marquez chaque facture comme payee une fois le virement effectue.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="bg-white">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total a reverser</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">{payoutMetrics.totalTtc.toFixed(2)} CHF</p>
                        <p className="mt-1 text-xs text-muted-foreground">{payoutMetrics.total} facture(s) sur la periode</p>
                      </CardContent>
                    </Card>
                    <Card className="border-orange-200 bg-orange-50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-orange-700">Restant a payer</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-orange-700">{payoutMetrics.unpaidTtc.toFixed(2)} CHF</p>
                        <p className="mt-1 text-xs text-orange-600">{payoutMetrics.unpaidCount} facture(s) impayee(s)</p>
                      </CardContent>
                    </Card>
                    <Card className="border-emerald-200 bg-emerald-50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-700">Deja regle</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-emerald-700">
                          {(payoutMetrics.totalTtc - payoutMetrics.unpaidTtc).toFixed(2)} CHF
                        </p>
                        <p className="mt-1 text-xs text-emerald-600">{payoutMetrics.total - payoutMetrics.unpaidCount} facture(s) payee(s)</p>
                      </CardContent>
                    </Card>
                  </div>

                  {payoutInvoices.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground">Aucune facture restaurateur sur cette periode.</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>N facture / Date</TableHead>
                            {selectedRestaurant === "all" ? <TableHead>Restaurant</TableHead> : null}
                            <TableHead>Periode</TableHead>
                            <TableHead className="text-right">Montant HT</TableHead>
                            <TableHead className="text-right">TVA</TableHead>
                            <TableHead className="text-right font-bold">Total TTC</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead>Echeance</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payoutInvoices.map((invoice) => {
                            const status = String(invoice.status || "").toLowerCase();
                            const isPaid = status === "paid";
                            const statusColor = isPaid
                              ? "bg-emerald-100 text-emerald-700"
                              : status === "overdue"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700";
                            return (
                              <TableRow key={invoice.id}>
                                <TableCell>
                                  <div className="font-mono text-xs">{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(invoice.created_at), "dd MMM yyyy", { locale: fr })}
                                  </div>
                                </TableCell>
                                {selectedRestaurant === "all" ? (
                                  <TableCell className="text-xs">{invoice.restaurants?.name || "-"}</TableCell>
                                ) : null}
                                <TableCell className="text-xs">
                                  {format(new Date(invoice.period_start), "dd MMM", { locale: fr })} -{" "}
                                  {format(new Date(invoice.period_end), "dd MMM", { locale: fr })}
                                </TableCell>
                                <TableCell className="text-right text-sm">{Number(invoice.amount_ht || 0).toFixed(2)} CHF</TableCell>
                                <TableCell className="text-right text-xs text-muted-foreground">
                                  {Number(invoice.amount_tva || 0).toFixed(2)} CHF
                                </TableCell>
                                <TableCell className="text-right text-sm font-bold">{Number(invoice.amount_ttc || 0).toFixed(2)} CHF</TableCell>
                                <TableCell>
                                  <Badge className={`text-[10px] ${statusColor}`}>{invoice.status || "draft"}</Badge>
                                </TableCell>
                                <TableCell className="text-xs">
                                  {invoice.due_at
                                    ? format(new Date(invoice.due_at), "dd MMM yyyy", { locale: fr })
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {!isPaid ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleMarkInvoicePaid(invoice)}
                                    >
                                      Marquer payee
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-emerald-600">
                                      Payee {invoice.paid_at ? `le ${format(new Date(invoice.paid_at), "dd/MM", { locale: fr })}` : ""}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
