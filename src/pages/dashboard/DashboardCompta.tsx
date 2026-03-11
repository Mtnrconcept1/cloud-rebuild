import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardRestaurant } from "./DashboardContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Receipt, CreditCard, Percent } from "lucide-react";

const INVALID_ORDER_STATUSES = new Set(["cancelled", "refused", "payment_failed"]);

const isJsonRecord = (value: Json | null | undefined): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toNumber = (value: Json | null | undefined) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

export default function DashboardCompta() {
  const { restaurants, selectedId, setSelectedId, loading: loadingRestaurants } = useDashboardRestaurant();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data: monthOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["compta-month-orders", selectedId, monthStart],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("total_amount, status, created_at, metadata")
        .eq("restaurant_id", selectedId)
        .gte("created_at", monthStart);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedId,
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["compta-invoices", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("restaurant_invoices")
        .select("*")
        .eq("restaurant_id", selectedId)
        .order("period_end", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedId,
  });

  const summary = useMemo(() => {
    const allOrders = monthOrders as any[];
    const validOrders = allOrders.filter((o) => !INVALID_ORDER_STATUSES.has(String(o.status || "").toLowerCase()));
    const invalidOrders = allOrders.length - validOrders.length;
    const netRevenue = validOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const avgTicket = validOrders.length ? netRevenue / validOrders.length : 0;
    const cancelRate = allOrders.length > 0 ? Math.round((invalidOrders / allOrders.length) * 100) : 0;

    let formulaDiscount = 0;
    let promoDiscount = 0;
    let loyaltyDiscount = 0;
    let flexDiscount = 0;

    validOrders.forEach((order) => {
      const meta = isJsonRecord(order.metadata as Json) ? (order.metadata as Record<string, Json>) : {};
      formulaDiscount += toNumber(meta.formula_discount_amount) || toNumber(meta.formula_discount);
      promoDiscount += toNumber(meta.promotion_discount_amount) || toNumber(meta.promo_discount_amount);
      loyaltyDiscount += toNumber(meta.points_discount);
      flexDiscount += toNumber(meta.flex_discount);
    });

    const totalDiscounts = formulaDiscount + promoDiscount + loyaltyDiscount + flexDiscount;
    const grossRevenue = netRevenue + totalDiscounts;

    return {
      netRevenue,
      grossRevenue,
      validOrdersCount: validOrders.length,
      avgTicket,
      cancelRate,
      formulaDiscount,
      promoDiscount,
      loyaltyDiscount,
      flexDiscount,
      totalDiscounts,
    };
  }, [monthOrders]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DollarSign className="h-6 w-6 text-primary" />
            <h1 className="font-display text-3xl font-bold">Comptabilité</h1>
          </div>
          {restaurants.length > 1 && (
            <select
              value={selectedId || ""}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">CA net (mois)</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-primary">{summary.netRevenue.toFixed(2)} CHF</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">CA brut estimé</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{summary.grossRevenue.toFixed(2)} CHF</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Commandes (mois)</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{summary.validOrdersCount}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Panier moyen</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{summary.avgTicket.toFixed(2)} CHF</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Taux d'annulation</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{summary.cancelRate}%</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Percent className="h-4 w-4" />Remises du mois</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Formules</span><span>-{summary.formulaDiscount.toFixed(2)} CHF</span></div>
            <div className="flex justify-between"><span>Promotions</span><span>-{summary.promoDiscount.toFixed(2)} CHF</span></div>
            <div className="flex justify-between"><span>Fidélité</span><span>-{summary.loyaltyDiscount.toFixed(2)} CHF</span></div>
            <div className="flex justify-between"><span>Flex</span><span>-{summary.flexDiscount.toFixed(2)} CHF</span></div>
            <div className="flex justify-between font-semibold border-t pt-2"><span>Total remises</span><span>-{summary.totalDiscounts.toFixed(2)} CHF</span></div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold flex items-center gap-2"><Receipt className="h-5 w-5" />Factures récentes</h2>
          {loadingRestaurants || loadingOrders || loadingInvoices ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Chargement...</CardContent></Card>
          ) : !invoices.length ? (
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

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />Lecture comptable</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>Le CA net correspond aux commandes validées (hors `cancelled`, `refused`, `payment_failed`).</p>
            <p>Le CA brut estimé = CA net + remises enregistrées dans les métadonnées commande.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
