import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChefHat, Bell, CheckCircle2, Zap, Users
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FeatureWizard, WizardNextButton } from "@/components/FeatureWizard";
import ReservationDetailModal from "@/components/ReservationDetailModal";

interface FlashDrop {
  id: string;
  chef: string;
  restaurant: string;
  restaurantId: string;
  dish: string;
  description: string;
  price: number;
  totalPortions: number;
  remaining: number;
  endsIn: number;
  image: string;
  rating: number;
  tags: string[];
  dropTime: string;
}

export default function ChefsTable() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [reserved, setReserved] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const { data: drops } = useQuery({
    queryKey: ["chefs-table-drops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chef_table_drops" as any)
        .select(`*, restaurants (name, rating, cuisine_type, image_url)`)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []).map((drop: any) => ({
        id: drop.id,
        chef: drop.chef_name,
        restaurant: drop.restaurants?.name || "Restaurant partenaire",
        restaurantId: drop.restaurant_id,
        dish: drop.dish_name,
        description: drop.description,
        price: Number(drop.price),
        totalPortions: drop.total_portions,
        remaining: drop.remaining_portions,
        endsIn: Math.floor((new Date(drop.drop_time).getTime() - Date.now()) / 60000),
        image: drop.image_url || drop.restaurants?.image_url || "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80&w=800",
        rating: Number(drop.restaurants?.rating) || 4.5,
        tags: [drop.restaurants?.cuisine_type || "Exclusif", "Signature"],
        dropTime: drop.drop_time,
      })) as FlashDrop[];
    },
  });

  const { data: chefsSubscription } = useQuery({
    queryKey: ["chefs-table-subscription", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_subscriptions" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("topic", "chefs_table")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const notifyAll = !!chefsSubscription;

  const toggleReserve = (id: string) => {
    const next = new Set(reserved);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setReserved(next);
  };

  const reservedDrops = (drops || []).filter((d) => reserved.has(d.id));
  const reservedTotal = reservedDrops.reduce((sum, d) => sum + d.price, 0);

  const handleConfirmReservation = async () => {
    if (!user) {
      toast({ title: "Connectez-vous", description: "Vous devez être connecté pour réserver.", variant: "destructive" });
      return;
    }
    if (reservedDrops.length === 0) return;

    setLoading(true);

    // Group drops by restaurant
    const byRestaurant = new Map<string, FlashDrop[]>();
    for (const drop of reservedDrops) {
      const list = byRestaurant.get(drop.restaurantId) || [];
      list.push(drop);
      byRestaurant.set(drop.restaurantId, list);
    }

    let success = true;
    for (const [restaurantId, dropsForRestaurant] of byRestaurant) {
      const firstDrop = dropsForRestaurant[0];
      const dropDate = new Date(firstDrop.dropTime);
      const dateStr = dropDate.toISOString().split("T")[0];
      const timeStr = dropDate.toTimeString().slice(0, 5);

      const preorderItems = dropsForRestaurant.map((d) => ({
        drop_id: d.id,
        dish: d.dish,
        chef: d.chef,
        price: d.price,
      }));

      const total = dropsForRestaurant.reduce((s, d) => s + d.price, 0);

      const { error } = await (supabase.rpc as any)("validate_and_create_reservation", {
        p_restaurant_id: restaurantId,
        p_date: dateStr,
        p_time: timeStr,
        p_party_size: 1,
        p_feature: "chefs_table",
        p_metadata: {
          feature: "chefs_table",
          drops: preorderItems,
          total_amount: total,
          is_exclusive: true,
        },
        p_notes: `[Chef's Table] ${dropsForRestaurant.map((d) => d.dish).join(", ")}`,
      });

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        success = false;
        break;
      }
    }

    setLoading(false);
    if (success) {
      setConfirmed(true);
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    }
  };

  const handleGoToReservations = () => {
    setShowDetailModal(true);
  };

  const detailForModal = confirmed ? {
    id: crypto.randomUUID(),
    date: reservedDrops[0] ? new Date(reservedDrops[0].dropTime).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    time: reservedDrops[0] ? new Date(reservedDrops[0].dropTime).toTimeString().slice(0, 5) : "19:00",
    party_size: 1,
    status: "pending",
    feature: "chefs_table",
    notes: `[Chef's Table] ${reservedDrops.map((d) => d.dish).join(", ")}`,
    total_amount: reservedTotal,
    created_at: new Date().toISOString(),
    metadata: { feature: "chefs_table" } as any,
    preorder_items: reservedDrops.map((d) => ({
      name: `${d.dish} (${d.chef})`,
      quantity: 1,
      unit_price: d.price,
      total_price: d.price,
    })) as any,
    restaurant_name: reservedDrops[0]?.restaurant || "",
  } : null;

  return (
    <>
    <FeatureWizard
      title="Chef's Table"
      subtitle="Plats off-menu en édition ultra-limitée"
      icon={ChefHat}
      colorClass="amber-500"
      steps={[
        { id: "selection", label: "Sélection" },
        { id: "confirm", label: "Confirmation" },
      ]}
      currentStepId={confirmed ? "confirm" : "selection"}
      headerAction={
        <Button
          variant={notifyAll ? "default" : "outline"}
          onClick={async () => {
            if (!user) {
              toast({ title: "Connectez-vous", description: "Activez les alertes après connexion.", variant: "destructive" });
              return;
            }
            if (notifyAll) {
              await supabase.from("notification_subscriptions" as any).delete().eq("user_id", user.id).eq("topic", "chefs_table");
            } else {
              await supabase.from("notification_subscriptions" as any).upsert({ user_id: user.id, topic: "chefs_table", filters: {} }, { onConflict: "user_id,topic" });
            }
            queryClient.invalidateQueries({ queryKey: ["chefs-table-subscription", user.id] });
            toast({ title: notifyAll ? "Alertes désactivées" : "Alertes Chef's Table activées" });
          }}
          className="gap-2"
        >
          <Bell className={`h-4 w-4 ${notifyAll ? "fill-current" : ""}`} />
          {notifyAll ? "Notifications ON" : "M'alerter"}
        </Button>
      }
    >
      <div className="space-y-8">
        {/* LIVE banner */}
        <div className="rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 p-4 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <p className="text-sm font-medium">
            <span className="text-amber-600">{(drops || []).reduce((s, d) => s + d.remaining, 0)} portions</span> disponibles
          </p>
          <Badge variant="outline" className="ml-auto gap-1">
            <Zap className="h-3 w-3" />
            Live
          </Badge>
        </div>

        {!confirmed && (
          <>
            <div className="space-y-6">
              {(drops || []).map((drop) => {
                const isReserved = reserved.has(drop.id);
                return (
                  <div
                    key={drop.id}
                    className={`rounded-2xl border overflow-hidden ${isReserved ? "ring-2 ring-amber-500" : ""}`}
                  >
                    <div className="relative">
                      <img src={drop.image} className="w-full h-56 object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-4 left-4 text-white">
                        <h3 className="font-display text-xl font-bold">{drop.dish}</h3>
                        <p className="text-sm text-white/80">{drop.chef} · {drop.restaurant}</p>
                      </div>
                    </div>
                    <div className="p-5 space-y-4">
                      <p className="text-sm text-muted-foreground">{drop.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold">{drop.price.toFixed(2)} CHF</span>
                        <Button
                          onClick={() => toggleReserve(drop.id)}
                          variant={isReserved ? "outline" : "default"}
                          className={isReserved ? "border-amber-500 text-amber-600" : "bg-amber-500 hover:bg-amber-600"}
                        >
                          {isReserved ? "Sélectionné ✓" : "Réserver"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {reserved.size > 0 && (
              <div className="sticky bottom-4 z-40">
                <div className="mx-4 rounded-2xl border border-amber-500/40 bg-card/90 backdrop-blur-xl shadow-lg p-5 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>{reserved.size} plat(s) sélectionné(s)</span>
                    <span className="font-bold">{reservedTotal.toFixed(2)} CHF</span>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Réservation de table avec plats exclusifs
                  </p>
                  <Button
                    onClick={handleConfirmReservation}
                    disabled={loading}
                    className="w-full bg-amber-500 hover:bg-amber-600"
                  >
                    {loading ? "Réservation en cours..." : "Confirmer la réservation"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {confirmed && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 p-6 text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 text-amber-500 mx-auto" />
              <h2 className="font-display text-xl font-bold">Réservation confirmée !</h2>
              <p className="text-sm text-muted-foreground">
                Votre table et vos plats exclusifs sont réservés.
              </p>
            </div>
            <WizardNextButton
              onClick={handleGoToReservations}
              label="Voir mes réservations"
              colorClass="amber-500"
            />
          </div>
        )}
      </div>
    </FeatureWizard>
    <ReservationDetailModal
      reservation={detailForModal}
      open={showDetailModal}
      onOpenChange={(open) => {
        setShowDetailModal(open);
        if (!open) navigate("/reservations");
      }}
    />
    </>
  );
}
