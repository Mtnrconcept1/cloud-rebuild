import { Radio, ShieldCheck, ShoppingCart } from "lucide-react";

import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import RestaurantDashboardHomeView, {
  type RestaurantDashboardHomeOrder,
} from "@/components/dashboard/RestaurantDashboardHomeView";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardRestaurant } from "@/pages/dashboard/useDashboardRestaurant";

const DEMO_TO_DASHBOARD_ORDER_STATUS: Record<string, string> = {
  awaiting_payment: "pending_payment",
  restaurant_received: "confirmed",
  restaurant_accepted: "accepted",
  preparing: "preparing",
  ready_for_pickup: "ready",
  picked_up: "delivering",
  delivering: "delivering",
  delivered: "delivered",
};

const CLOSED_DEMO_ORDER_STATUSES = new Set(["awaiting_payment", "delivered"]);

export default function CommercialDemoRestaurantHome() {
  const frame = useCommercialDemoFrame();
  const { restaurants } = useDashboardRestaurant();

  if (!frame || frame.surface !== "restaurant") return null;

  const { snapshot, realtimeStatus } = frame;
  const safeRestaurant = restaurants.find((restaurant) => (
    restaurant.id === snapshot.session.demo_restaurant_id
    && restaurant.is_demo === true
  ));
  const restaurantName = safeRestaurant?.name || "Restaurant Démo TOK";
  const order = snapshot.order;
  const isTestPaid = order?.payment_status === "test_paid";
  const totalAmountCents = Number(order?.total_amount_cents || 0);
  const orderAmount = isTestPaid && Number.isFinite(totalAmountCents)
    ? Math.max(0, totalAmountCents / 100)
    : 0;
  const hasUpcomingOrder = Boolean(
    order
    && isTestPaid
    && !CLOSED_DEMO_ORDER_STATUSES.has(order.status),
  );
  const upcomingOrders: RestaurantDashboardHomeOrder[] = hasUpcomingOrder && order
    ? [{
      id: order.id,
      createdAt: order.created_at || order.updated_at || null,
      totalAmount: orderAmount,
      status: DEMO_TO_DASHBOARD_ORDER_STATUS[order.status] || "confirmed",
    }]
    : [];

  return (
    <RestaurantDashboardHomeView
      restaurantName={restaurantName}
      totalUpcomingOrders={upcomingOrders.length}
      totalUpcomingReservations={0}
      todayRevenue={orderAmount}
      monthlyRevenue={orderAmount}
      activeCampaignsCount={0}
      todayServiceCounts={{ lunch: 0, dinner: 0 }}
      upcomingOrders={upcomingOrders}
      upcomingReservations={[]}
      marketingEnabled={false}
      demoSnapshot
      leadingContent={(
        <Card className="tok-dashboard-section rounded-3xl border border-sky-200 bg-sky-50/80 dark:border-sky-500/30 dark:bg-sky-500/10">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-100">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-sky-950 dark:text-sky-50">Vrai dashboard · données de démonstration isolées</p>
                  <Badge className="bg-sky-600 text-white hover:bg-sky-600">SIMULÉ</Badge>
                </div>
                <p className="mt-1 text-sm text-sky-800 dark:text-sky-100/80">
                  Cette fenêtre utilise la présentation restaurateur de production, alimentée uniquement par la session commerciale en temps réel.
                </p>
                {order ? (
                  <p className="mt-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-sky-950 dark:text-sky-50">
                    <ShoppingCart className="h-4 w-4 shrink-0" />
                    <span className="break-words">Commande {order.order_number} · {order.customer_name}</span>
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-sky-800 dark:text-sky-100/80">Créez une commande depuis la fenêtre client pour la voir apparaître ici.</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-sky-800 dark:text-sky-100">
              <Radio className="h-4 w-4" />
              {realtimeStatus === "connected" ? "Temps réel connecté" : "Synchronisation en cours"}
            </div>
          </CardContent>
        </Card>
      )}
    />
  );
}
