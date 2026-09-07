import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listPrintOrders, type PrintOrderSummary } from "@/lib/print/client";
import { Loader2, Package, RefreshCw } from "lucide-react";
import PrintOrderDetails from "./PrintOrderDetails";

const PAGE_SIZE = 8;

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency: currency || "CHF" }).format(cents / 100);
}

export default function PrintOrdersPanel({ restaurantId }: { restaurantId: string }) {
  const [orders, setOrders] = useState<PrintOrderSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PrintOrderSummary | null>(null);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const result = await listPrintOrders({ restaurantId, page: nextPage, pageSize: PAGE_SIZE });
      setOrders(result.orders || []);
      setPage(result.pagination.page);
      setHasMore(result.pagination.hasMore);
      if (selected) {
        const refreshed = (result.orders || []).find((order) => order.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } finally {
      setLoading(false);
    }
  }, [page, restaurantId, selected?.id]);

  useEffect(() => {
    void load(1);
    const refresh = window.setInterval(() => void load(page), 60_000);
    return () => window.clearInterval(refresh);
  }, [restaurantId]);

  return (
    <Card className="rounded-3xl border-primary/10" data-testid="marketing-print-orders-panel">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Mes impressions</CardTitle>
          <CardDescription>Commandes, production et livraison directement dans TheTok.</CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load(page)}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Actualiser
        </Button>
      </CardHeader>
      <CardContent>
        {loading && orders.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des impressions…</div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune commande d’impression pour le moment.</div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelected(order)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{order.quantity} exemplaires</p>
                  <p className="truncate text-xs text-muted-foreground">{order.provider_reference || "En préparation"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMoney(order.customer_amount_cents, order.customer_currency)}</p>
                  <p className="text-xs capitalize text-muted-foreground">{order.status.replace(/_/g, " ")}</p>
                </div>
              </button>
            ))}
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground" data-pagination="print-orders-pagination">
              <span>Page {page}</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => void load(page - 1)}>Précédent</Button>
                <Button type="button" variant="outline" size="sm" disabled={loading || !hasMore} onClick={() => void load(page + 1)}>Suivant</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <PrintOrderDetails
        restaurantId={restaurantId}
        order={selected}
        open={Boolean(selected)}
        onOpenChange={(nextOpen) => { if (!nextOpen) setSelected(null); }}
        onChanged={() => void load(page)}
      />
    </Card>
  );
}