import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { Bike, MapPin, User, Phone, Package2, ClipboardList, CreditCard } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { mapOrderStatusToTrackingStatus, normalizeOrderStatus } from "@/lib/orderStatus";
import type { Database } from "@/integrations/supabase/types";
import { useDashboardRestaurant } from "./DashboardContext";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type DeliveryTrackingRow = Database["public"]["Tables"]["delivery_tracking"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
type MenuItemRow = Database["public"]["Tables"]["menu_items"]["Row"];
type AntiWasteOfferRow = Database["public"]["Tables"]["anti_waste_offers"]["Row"];

type OrderItemWithRelations = OrderItemRow & {
  menu_items: Pick<MenuItemRow, "name"> | null;
  anti_waste_offers: Pick<AntiWasteOfferRow, "title"> | null;
};

type OrderWithRelations = OrderRow & {
  delivery_tracking: DeliveryTrackingRow[] | null;
  profiles: Pick<ProfileRow, "full_name" | "phone"> | null;
  order_items: OrderItemWithRelations[] | null;
};

const STATUSES = ["pending", "preparing", "delivering", "delivered", "cancelled"];

const SIMULATED_COORDS = {
  restaurant: { lat: 48.8566, lng: 2.3522 },
  delivery: { lat: 48.8706, lng: 2.3477 },
  positions: {
    preparing: { lat: 48.8566, lng: 2.3522 },
    picked_up: { lat: 48.8596, lng: 2.3502 },
    in_transit: { lat: 48.8656, lng: 2.349 },
    delivered: { lat: 48.8706, lng: 2.3477 },
  },
};

export default function DashboardCommandes() {
  const { selectedId, restaurants, loading: restaurantsLoading, error: restaurantsError } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId);

  const { data: orders, error: ordersError } = useQuery({
    queryKey: ["dashboard-all-orders", selectedId],
    queryFn: async () => {
      const [ordersRes, customersRes] = await Promise.all([
        supabase
          .from("orders")
          .select("*, delivery_tracking(*), order_items(*, menu_items(name), anti_waste_offers(title))")
          .eq("restaurant_id", selectedId!)
          .order("created_at", { ascending: false }),
        supabase.rpc("get_order_customers" as any, { p_restaurant_id: selectedId! }),
      ]);

      const customerMap = new Map(
        ((customersRes.data || []) as any[]).map((customer: any) => [
          customer.user_id,
          { full_name: customer.full_name, phone: customer.phone },
        ])
      );

      return ((ordersRes.data ?? []) as any[]).map((order) => ({
        ...order,
        profiles: customerMap.get(order.user_id) || null,
      })) as unknown as OrderWithRelations[];
    },
    enabled: !!selectedId,
  });

  const updateStatus = async (orderId: string, status: string) => {
    const normalizedStatus = normalizeOrderStatus(status);
    const { error } = await supabase.from("orders").update({ status: normalizedStatus }).eq("id", orderId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    const trackingStatus = mapOrderStatusToTrackingStatus(normalizedStatus);
    if (trackingStatus) {
      const position = SIMULATED_COORDS.positions[trackingStatus as keyof typeof SIMULATED_COORDS.positions] || SIMULATED_COORDS.positions.preparing;
      const order = orders?.find((item) => item.id === orderId);
      const existingTracking = order?.delivery_tracking?.[0];

      if (existingTracking) {
        await supabase
          .from("delivery_tracking")
          .update({
            status: trackingStatus,
            current_lat: position.lat,
            current_lng: position.lng,
            ...(trackingStatus === "in_transit"
              ? { picked_up_at: new Date().toISOString(), driver_name: "Mohamed B.", driver_phone: "06 12 34 56 78" }
              : {}),
            ...(trackingStatus === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
          })
          .eq("id", existingTracking.id);
      } else {
        const estimatedArrival = new Date();
        estimatedArrival.setMinutes(estimatedArrival.getMinutes() + 30);
        await supabase.from("delivery_tracking").insert({
          order_id: orderId,
          status: trackingStatus,
          restaurant_lat: SIMULATED_COORDS.restaurant.lat,
          restaurant_lng: SIMULATED_COORDS.restaurant.lng,
          delivery_lat: SIMULATED_COORDS.delivery.lat,
          delivery_lng: SIMULATED_COORDS.delivery.lng,
          current_lat: position.lat,
          current_lng: position.lng,
          estimated_arrival: estimatedArrival.toISOString(),
          driver_name: "Mohamed B.",
          driver_phone: "06 12 34 56 78",
        });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard-all-orders", selectedId] });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Commandes</h1>

        {restaurantsLoading ? <p className="text-muted-foreground">Chargement des restaurants...</p> : null}
        {restaurantsError ? <p className="text-destructive">Erreur lors du chargement des restaurants : {restaurantsError}</p> : null}
        {!restaurantsLoading && !restaurantsError && restaurants.length === 0 ? (
          <p className="text-muted-foreground">Aucun restaurant lie a votre compte.</p>
        ) : null}
        {!restaurantsLoading && !restaurantsError && restaurants.length > 0 && !selectedRestaurant ? (
          <p className="text-muted-foreground">Selectionnez un restaurant depuis la barre laterale pour afficher les commandes.</p>
        ) : null}
        {selectedRestaurant ? (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Restaurant actif</p>
            <p className="text-sm font-semibold">{selectedRestaurant.name}</p>
          </div>
        ) : null}
        {ordersError ? (
          <p className="text-destructive">Erreur lors du chargement des commandes : {(ordersError as Error).message}</p>
        ) : null}

        {!restaurantsLoading && !restaurantsError && selectedRestaurant && !ordersError ? (
          <div className="space-y-3">
            {orders?.map((order) => {
              const tracking = order.delivery_tracking?.[0] ?? null;
              const customer = order.profiles;
              const items = order.order_items ?? [];
              const customerPhone = customer?.phone ?? "";
              const customerAddress = order.delivery_address ?? "Adresse non renseignee";

              return (
                <div key={order.id} className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">{order.order_number || `#${order.id.slice(0, 8)}`}</span>
                        <OrderStatusBadge status={normalizeOrderStatus(order.status)} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="mr-4 text-right">
                        <p className="text-lg font-bold text-primary">{Number(order.total_amount).toFixed(2)} CHF</p>
                        <div className="flex flex-col items-end">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paiement recu</p>
                          {order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata) && (order.metadata as any).payment_method ? (
                            <div className="mt-1 flex items-center gap-1.5">
                              <CreditCard className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] font-medium uppercase">{(order.metadata as any).payment_method}</span>
                              {(order.metadata as any).card_last4 ? (
                                <span className="rounded bg-secondary px-1 font-mono text-[10px]">
                                  **** {(order.metadata as any).card_last4}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <Select value={normalizeOrderStatus(order.status)} onValueChange={(value) => updateStatus(order.id, value)}>
                        <SelectTrigger className="h-10 w-40 shadow-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {(
                                {
                                  pending: "En attente",
                                  preparing: "En preparation",
                                  delivering: "En livraison",
                                  delivered: "Livree",
                                  cancelled: "Annulee",
                                } as Record<string, string>
                              )[status] || status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator className="bg-muted/50" />

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <User className="h-4 w-4" />
                        Client
                      </div>
                      <div className="space-y-2 rounded-xl bg-muted/30 p-3">
                        <p className="text-sm font-medium">{customer?.full_name || "Client anonyme"}</p>
                        <div className="flex flex-col gap-1.5">
                          <a href={customerPhone ? `tel:${customerPhone}` : undefined} className="flex items-center gap-2 text-xs text-primary hover:underline">
                            <Phone className="h-3 w-3" />
                            {customerPhone || "Non renseigne"}
                          </a>
                          <div className="flex items-start gap-2 text-xs text-muted-foreground">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                            {customerAddress}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <Package2 className="h-4 w-4" />
                        Detail de la commande
                      </div>
                      <div className="space-y-2 rounded-xl bg-muted/30 p-3">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                                {item.quantity}
                              </span>
                              <span className="font-medium">{item.menu_items?.name || item.anti_waste_offers?.title || "Article"}</span>
                            </div>
                            <span className="text-muted-foreground">{Number(item.total_price).toFixed(2)} CHF</span>
                          </div>
                        ))}
                        {order.notes ? (
                          <div className="mt-2 flex items-start gap-2 rounded border-t border-muted/50 bg-amber-50/50 p-2 pt-2 text-xs text-amber-600">
                            <ClipboardList className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                              <strong>Note :</strong> {order.notes}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {tracking ? (
                    <div className="flex w-fit items-center gap-2 rounded-full bg-secondary/30 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                      <Bike className="h-3 w-3" />
                      LIVRAISON : {tracking.status.toUpperCase()}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!orders || orders.length === 0 ? <p className="py-8 text-center text-muted-foreground">Aucune commande</p> : null}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
