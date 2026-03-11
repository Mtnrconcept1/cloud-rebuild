import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
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
    in_transit: { lat: 48.8656, lng: 2.3490 },
    delivered: { lat: 48.8706, lng: 2.3477 },
  },
};

export default function DashboardCommandes() {
  const { selectedId } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const restaurant = selectedId ? { id: selectedId } : null;

  const { data: orders } = useQuery({
    queryKey: ["dashboard-all-orders", restaurant?.id],
    queryFn: async () => {
      const [ordersRes, customersRes] = await Promise.all([
        supabase
          .from("orders")
          .select(`*, delivery_tracking(*), order_items(*, menu_items(name), anti_waste_offers(title))`)
          .eq("restaurant_id", restaurant!.id)
          .order("created_at", { ascending: false }),
        supabase.rpc("get_order_customers" as any, { p_restaurant_id: restaurant!.id }),
      ]);

      const customerMap = new Map(
        ((customersRes.data || []) as any[]).map((c: any) => [c.user_id, { full_name: c.full_name, phone: c.phone }])
      );

      return ((ordersRes.data ?? []) as any[]).map((o) => ({
        ...o,
        profiles: customerMap.get(o.user_id) || null,
      })) as unknown as OrderWithRelations[];
    },
    enabled: !!restaurant,
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
      const pos = SIMULATED_COORDS.positions[trackingStatus as keyof typeof SIMULATED_COORDS.positions] || SIMULATED_COORDS.positions.preparing;
      const order = orders?.find((o) => o.id === orderId);
      const existingTracking = order?.delivery_tracking?.[0];

      if (existingTracking) {
        await supabase.from("delivery_tracking").update({
          status: trackingStatus,
          current_lat: pos.lat,
          current_lng: pos.lng,
          ...(trackingStatus === "in_transit" ? { picked_up_at: new Date().toISOString(), driver_name: "Mohamed B.", driver_phone: "06 12 34 56 78" } : {}),
          ...(trackingStatus === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
        }).eq("id", existingTracking.id);
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
          current_lat: pos.lat,
          current_lng: pos.lng,
          estimated_arrival: estimatedArrival.toISOString(),
          driver_name: "Mohamed B.",
          driver_phone: "06 12 34 56 78",
        });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard-all-orders"] });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Commandes</h1>
        <div className="space-y-3">
          {orders?.map((o) => {
            const tracking = o.delivery_tracking?.[0] ?? null;
            const customer = o.profiles;
            const items = o.order_items ?? [];
            const customerPhone = customer?.phone ?? "";
            const customerAddress = o.delivery_address ?? "Adresse non renseignée";

            return (
              <div key={o.id} className="p-5 border rounded-2xl bg-card shadow-sm space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{o.order_number || `#${o.id.slice(0, 8)}`}</span>
                      <OrderStatusBadge status={normalizeOrderStatus(o.status)} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right mr-4">
                      <p className="font-bold text-lg text-primary">{Number(o.total_amount).toFixed(2)} CHF</p>
                      <div className="flex flex-col items-end">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Paiement Reçu</p>
                        {o.metadata && typeof o.metadata === 'object' && !Array.isArray(o.metadata) && (o.metadata as any).payment_method && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <CreditCard className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] font-medium uppercase">{(o.metadata as any).payment_method}</span>
                            {(o.metadata as any).card_last4 && (
                              <span className="text-[10px] bg-secondary px-1 rounded font-mono">**** {(o.metadata as any).card_last4}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <Select value={normalizeOrderStatus(o.status)} onValueChange={(v) => updateStatus(o.id, v)}>
                      <SelectTrigger className="w-40 h-10 shadow-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {({ pending: "En attente", preparing: "En préparation", delivering: "En livraison", delivered: "Livrée", cancelled: "Annulée" } as Record<string, string>)[s] || s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator className="bg-muted/50" />

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><User className="h-4 w-4" />Client</div>
                    <div className="bg-muted/30 p-3 rounded-xl space-y-2">
                      <p className="text-sm font-medium">{customer?.full_name || "Client Anonyme"}</p>
                      <div className="flex flex-col gap-1.5">
                        <a href={customerPhone ? `tel:${customerPhone}` : undefined} className="text-xs text-primary flex items-center gap-2 hover:underline">
                          <Phone className="h-3 w-3" />{customerPhone || "Non renseigné"}
                        </a>
                        <div className="text-xs text-muted-foreground flex items-start gap-2">
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />{customerAddress}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Package2 className="h-4 w-4" />Détail de la commande</div>
                    <div className="bg-muted/30 p-3 rounded-xl space-y-2">
                      {items.map((item) => (
                        <div key={item.id} className="flex justify-between text-xs items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-primary bg-primary/10 w-5 h-5 flex items-center justify-center rounded text-[10px]">{item.quantity}</span>
                            <span className="font-medium">{item.menu_items?.name || item.anti_waste_offers?.title || "Article"}</span>
                          </div>
                          <span className="text-muted-foreground">{Number(item.total_price).toFixed(2)} CHF</span>
                        </div>
                      ))}
                      {o.notes && (
                        <div className="mt-2 pt-2 border-t border-muted/50 flex items-start gap-2 text-xs text-amber-600 bg-amber-50/50 p-2 rounded">
                          <ClipboardList className="h-3 w-3 mt-0.5 shrink-0" />
                          <span><strong>Note :</strong> {o.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {tracking && (
                  <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground bg-secondary/30 w-fit px-2 py-1 rounded-full">
                    <Bike className="h-3 w-3" />LIVRAISON : {tracking.status.toUpperCase()}
                  </div>
                )}
              </div>
            );
          })}
          {(!orders || orders.length === 0) && <p className="text-muted-foreground text-center py-8">Aucune commande</p>}
        </div>
      </div>
    </DashboardLayout>
  );
}
