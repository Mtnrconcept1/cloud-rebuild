import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, MapPin, CreditCard, Banknote, Receipt, Percent, Truck, Sparkles, Gift } from "lucide-react";
import { Link } from "react-router-dom";
import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import { Package } from "lucide-react";
import { normalizeOrderStatus } from "@/lib/orderStatus";

const PAYMENT_LABELS: Record<string, { label: string; icon: typeof CreditCard }> = {
  card: { label: "Carte bancaire", icon: CreditCard },
  twint: { label: "TWINT", icon: CreditCard },
  cash: { label: "Espèces", icon: Banknote },
};

function PaymentBreakdown({ order }: { order: any }) {
  const meta = (order.metadata || {}) as any;
  const subtotal = Number(meta.pre_discount_subtotal || 0);
  const formulaDiscount = Number(meta.formula_discount_amount || 0);
  const flexDiscount = Number(meta.flex_discount || 0);
  const pointsDiscount = Number(meta.points_discount || 0);
  const deliveryFee = Number(order.delivery_fee || 0);
  const qualityFee = Number(meta.quality_fee_amount || 0);
  const total = Number(order.total_amount);
  const paymentMethod = meta.payment_method || "card";
  const formulaName = meta.formula_applied;
  const flexOption = meta.flex_option;
  const hasBreakdown = subtotal > 0;

  if (!hasBreakdown) return null;

  const pm = PAYMENT_LABELS[paymentMethod] || PAYMENT_LABELS.card;
  const PmIcon = pm.icon;

  return (
    <div className="mt-3 pt-3 border-t border-dashed space-y-1.5 text-xs">
      <div className="flex justify-between text-muted-foreground">
        <span>Sous-total</span>
        <span>{subtotal.toFixed(2)} CHF</span>
      </div>
      {formulaDiscount > 0 && (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1"><Percent className="h-3 w-3" />{formulaName || "Formule"}</span>
          <span>-{formulaDiscount.toFixed(2)} CHF</span>
        </div>
      )}
      {flexDiscount > 0 && (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" />Remise Flex</span>
          <span>-{flexDiscount.toFixed(2)} CHF</span>
        </div>
      )}
      {pointsDiscount > 0 && (
        <div className="flex justify-between text-emerald-600">
          <span className="flex items-center gap-1"><Gift className="h-3 w-3" />Points fidélité</span>
          <span>-{pointsDiscount.toFixed(2)} CHF</span>
        </div>
      )}
      {deliveryFee > 0 && (
        <div className="flex justify-between text-muted-foreground">
          <span className="flex items-center gap-1"><Truck className="h-3 w-3" />Livraison{flexOption ? ` (${flexOption})` : ""}</span>
          <span>+{deliveryFee.toFixed(2)} CHF</span>
        </div>
      )}
      {qualityFee > 0 && (
        <div className="flex justify-between text-muted-foreground">
          <span>Garantie qualité</span>
          <span>+{qualityFee.toFixed(2)} CHF</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-foreground pt-1">
        <span>Total</span>
        <span>{total.toFixed(2)} CHF</span>
      </div>
      <div className="flex items-center gap-1.5 pt-1 text-muted-foreground">
        <PmIcon className="h-3 w-3" />
        <span>Payé par {pm.label}</span>
      </div>
    </div>
  );
}

export default function Commandes() {
  const { user } = useAuth();
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*, restaurants(name), order_items(*, menu_items(name))").eq("user_id", user!.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });
  const orders = (ordersData || []).filter((order) => (order.metadata as any)?.feature !== "zero-attente");

  return (
    <CustomerDashboardLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Mes commandes</h1>
        {isLoading ? (
          <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : orders && orders.length > 0 ? (
          <div className="space-y-6">
            {Object.entries(
              orders.reduce((acc, order) => {
                const groupKey = order.checkout_id || order.id;
                if (!acc[groupKey]) acc[groupKey] = [];
                acc[groupKey].push(order);
                return acc;
              }, {} as Record<string, any[]>)
            ).map(([groupKey, groupOrders]) => {
              const mainOrder = groupOrders[0];
              const totalAmount = groupOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
              return (
                <div key={groupKey} className="border rounded-2xl bg-card overflow-hidden shadow-sm">
                  <div className="p-4 bg-muted/30 border-b flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-lg"><Package className="h-5 w-5 text-primary" /></div>
                      <div>
                        <p className="font-bold text-sm">{mainOrder.order_number || `#${groupKey.slice(0, 8)}`}</p>
                        <p className="text-xs text-muted-foreground">{new Date(mainOrder.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{totalAmount.toFixed(2)} CHF</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{groupOrders.length} restaurant(s)</p>
                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    {groupOrders.map((order) => (
                      <div key={order.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-sm">{(order.restaurants as any)?.name}</h3>
                          <OrderStatusBadge status={normalizeOrderStatus(order.status)} />
                        </div>
                        <div className="pl-4 border-l-2 border-primary/10 space-y-2">
                          {(order.order_items as any[])?.map((item) => (
                            <div key={item.id} className="flex justify-between text-xs">
                              <span>{item.quantity}x {(item.menu_items as any)?.name || 'Article'}</span>
                              <span className="text-muted-foreground">{Number(item.total_price).toFixed(2)} CHF</span>
                            </div>
                          ))}
                        </div>
                        <PaymentBreakdown order={order} />
                        {normalizeOrderStatus(order.status) !== "delivered" && normalizeOrderStatus(order.status) !== "cancelled" && (order.delivery_address && (order.metadata as any)?.feature !== "zero-attente" && !(order.metadata as any)?.pickup_time) && (
                          <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                            <Link to={`/commande/${order.id}`}><MapPin className="h-3 w-3 mr-1" />Suivi temps réel</Link>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 space-y-2">
            <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Aucune commande pour le moment</p>
          </div>
        )}
      </div>
    </CustomerDashboardLayout>
  );
}