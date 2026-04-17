import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calculator, CalendarDays, Receipt, Store, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export default function AdminCompta() {
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), "yyyy-MM"));

  // 1. Fetch Restaurants pour le filtre
  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-restaurants-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // 2. Fetch Orders filtrés
  const { data: orders = [], isLoading } = useQuery({
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
          status,
          order_number,
          metadata,
          restaurant_id,
          restaurants ( name )
        `)
        .gte("created_at", startOfMonth.toISOString())
        .lte("created_at", endOfMonth.toISOString())
        .not("status", "eq", "cancelled")
        .not("status", "eq", "pending");

      if (selectedRestaurant && selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Calculs financiers
  const { metrics, standardOrders, miamzOrders } = useMemo(() => {
    let totalPaid = 0; // Ce qui a coulé via carte de crédit / client reel
    let totalMiamz = 0; // Miamz déduits que Tok compense

    const standard: any[] = [];
    const miamz: any[] = [];

    orders.forEach((order) => {
      const amount = Number(order.total_amount || 0);
      const miamzValue = Number((order.metadata as any)?.points_discount_amount || 0);

      totalPaid += amount;
      totalMiamz += miamzValue;

      if (miamzValue > 0) {
        miamz.push(order);
      }
      standard.push(order);
    });

    const grossRevenue = totalPaid + totalMiamz;
    const tokCommission = grossRevenue * 0.10;
    const restaurantPayout = grossRevenue * 0.90;

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

  // Générateur de mois (6 derniers mois)
  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const val = format(d, "yyyy-MM");
      const label = format(d, "MMMM yyyy", { locale: fr });
      options.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return options;
  }, []);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
            <Calculator className="h-7 w-7 text-primary" />
            Comptabilite (Reversements)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
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
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
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
                {restaurants.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
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
            <p className="text-xs text-muted-foreground mt-1">Paye ({metrics.totalPaid.toFixed(2)}) + Miamz ({metrics.totalMiamz.toFixed(2)})</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-700">Commission TOK (10%)</CardTitle>
            <Calculator className="h-4 w-4 text-orange-700" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-700">{metrics.tokCommission.toFixed(2)} CHF</p>
            <p className="text-xs text-orange-600 mt-1">Ce que Tok a gagne sur le CA Brut</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-700">Reversement Restos (90%)</CardTitle>
            <Store className="h-4 w-4 text-emerald-700" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-700">{metrics.restaurantPayout.toFixed(2)} CHF</p>
            <p className="text-xs text-emerald-600 mt-1">Montant global de la facture</p>
          </CardContent>
        </Card>
        <Card className="bg-pink-50 border-pink-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-pink-700">Miamz Compenses</CardTitle>
            <Ticket className="h-4 w-4 text-pink-700" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-pink-700">{metrics.totalMiamz.toFixed(2)} CHF</p>
            <p className="text-xs text-pink-600 mt-1">Couverture de Tok pour fidelite</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Tabs defaultValue="all" className="w-full">
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle>Historique detaille</CardTitle>
              <TabsList>
                <TabsTrigger value="all">Toutes les transactions ({standardOrders.length})</TabsTrigger>
                <TabsTrigger value="miamz" className="text-pink-600 data-[state=active]:text-pink-700 data-[state=active]:bg-pink-50">
                  Transaction avec Miamz ({miamzOrders.length})
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                <TabsContent value="all" className="mt-0">
                  {standardOrders.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Aucune donnee pour cette periode.</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Num / Date</TableHead>
                            {selectedRestaurant === "all" && <TableHead>Restaurant</TableHead>}
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">Paye (Carte/Twint)</TableHead>
                            <TableHead className="text-right text-pink-600">Part Miamz</TableHead>
                            <TableHead className="text-right font-bold text-primary">Total Brut</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {standardOrders.map((order) => {
                            const paid = Number(order.total_amount || 0);
                            const miamz = Number((order.metadata as any)?.points_discount_amount || 0);
                            return (
                              <TableRow key={order.id}>
                                <TableCell>
                                  <div className="font-medium text-xs">#{order.order_number}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(order.created_at), "dd MMM HH:mm", { locale: fr })}
                                  </div>
                                </TableCell>
                                {selectedRestaurant === "all" && (
                                  <TableCell className="text-xs">
                                    {order.restaurants?.name}
                                  </TableCell>
                                )}
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px]">
                                    {order.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                  {paid.toFixed(2)} CHF
                                </TableCell>
                                <TableCell className="text-right text-sm text-pink-600">
                                  {miamz > 0 ? `+${miamz.toFixed(2)} CHF` : "-"}
                                </TableCell>
                                <TableCell className="text-right font-bold text-sm text-primary">
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
                    <p className="text-center text-muted-foreground py-8">Aucune utilisation de Miamz sur cette periode.</p>
                  ) : (
                    <div className="rounded-md border border-pink-100">
                      <Table>
                        <TableHeader className="bg-pink-50/50">
                          <TableRow>
                            <TableHead>Num / Date</TableHead>
                            {selectedRestaurant === "all" && <TableHead>Restaurant</TableHead>}
                            <TableHead className="text-right">Paye par client</TableHead>
                            <TableHead className="text-right font-bold text-pink-600">Pris en charge (Miamz)</TableHead>
                            <TableHead className="text-right">Total Commande</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {miamzOrders.map((order) => {
                            const paid = Number(order.total_amount || 0);
                            const miamz = Number((order.metadata as any)?.points_discount_amount || 0);
                            return (
                              <TableRow key={order.id}>
                                <TableCell>
                                  <div className="font-medium text-xs">#{order.order_number}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(order.created_at), "dd MMM", { locale: fr })}
                                  </div>
                                </TableCell>
                                {selectedRestaurant === "all" && (
                                  <TableCell className="text-xs">
                                    {order.restaurants?.name}
                                  </TableCell>
                                )}
                                <TableCell className="text-right text-sm">
                                  {paid.toFixed(2)} CHF
                                </TableCell>
                                <TableCell className="text-right font-bold text-sm text-pink-600">
                                  {miamz.toFixed(2)} CHF
                                </TableCell>
                                <TableCell className="text-right text-sm">
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
              </>
            )}
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
