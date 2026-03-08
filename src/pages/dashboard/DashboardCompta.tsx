import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Receipt, CreditCard } from "lucide-react";

export default function DashboardCompta() {
  const { restaurantIds } = useOwnerRestaurants();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data: monthOrders } = useQuery({
    queryKey: ["compta-month-orders", restaurantIds, monthStart],
    queryFn: async () => {
      if (!restaurantIds.length) return [];
      const { data } = await supabase.from("orders").select("total_amount, status, created_at")
        .in("restaurant_id", restaurantIds).gte("created_at", monthStart);
      return data || [];
    },
    enabled: restaurantIds.length > 0,
  });

  const { data: invoices } = useQuery({
    queryKey: ["compta-invoices", restaurantIds],
    queryFn: async () => {
      if (!restaurantIds.length) return [];
      const { data } = await supabase.from("restaurant_invoices").select("*")
        .in("restaurant_id", restaurantIds).order("period_end", { ascending: false }).limit(10);
      return data || [];
    },
    enabled: restaurantIds.length > 0,
  });

  const validOrders = (monthOrders || []).filter((o: any) => o.status !== "cancelled");
  const revenue = validOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0);
  const avgTicket = validOrders.length ? revenue / validOrders.length : 0;
  const cancelledCount = (monthOrders || []).filter((o: any) => o.status === "cancelled").length;
  const cancelRate = monthOrders?.length ? Math.round((cancelledCount / monthOrders.length) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-primary" />
          <h1 className="font-display text-3xl font-bold">Comptabilité</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Chiffre d'affaires (mois)</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-primary">{revenue.toFixed(2)} CHF</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Commandes (mois)</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{validOrders.length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Panier moyen</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{avgTicket.toFixed(2)} CHF</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Taux d'annulation</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{cancelRate}%</p></CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold flex items-center gap-2"><Receipt className="h-5 w-5" /> Factures récentes</h2>
          {!invoices?.length ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Aucune facture disponible</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv: any) => (
                <Card key={inv.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-semibold text-sm">{inv.period_start} → {inv.period_end}</p>
                      <p className="text-xs text-muted-foreground">HT: {Number(inv.amount_ht).toFixed(2)} · TVA: {Number(inv.amount_tva).toFixed(2)} · TTC: {Number(inv.amount_ttc).toFixed(2)} CHF</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={inv.status === "paid" ? "default" : inv.status === "sent" ? "secondary" : "outline"} className="text-[10px]">
                        {inv.status === "paid" ? "Payée" : inv.status === "sent" ? "Envoyée" : "Brouillon"}
                      </Badge>
                      {inv.pdf_url && <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">PDF</a>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}