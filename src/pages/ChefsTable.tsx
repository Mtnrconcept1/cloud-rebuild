import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChefHat, Flame, Users, Bell,
  CheckCircle2, AlertCircle, Star, Zap
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FeatureWizard, WizardNextButton, WizardCartSummary } from "@/components/FeatureWizard";
import CountdownTimer, { getTargetFromMinutes } from "@/components/CountdownTimer";

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
}

export default function ChefsTable() {

  const { addItem, clearCart, updateCartMetadata, setOrderMode } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [reserved, setReserved] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);

  const { data: drops, isLoading } = useQuery({
    queryKey: ["chefs-table-drops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chef_table_drops" as any)
        .select(`
          *,
          restaurants (
            name,
            rating,
            cuisine_type,
            image_url
          )
        `)
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
        endsIn: Math.floor((new Date(drop.drop_time).getTime() - new Date().getTime()) / 60000),
        image: drop.image_url || drop.restaurants?.image_url || "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80&w=800",
        rating: Number(drop.restaurants?.rating) || 4.5,
        tags: [drop.restaurants?.cuisine_type || "Exclusif", "Signature"]
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

  const handleCheckout = () => {

    clearCart();
    setOrderMode("takeaway");

    updateCartMetadata({
      feature: "chefs-table",
      reservedDrops: reservedDrops.map(d => ({ dish: d.dish, chef: d.chef }))
    });

    reservedDrops.forEach((drop) => {

      addItem({
        menuItemId: drop.id + "-chef",
        name: `[Chef's Table] ${drop.dish}`,
        price: drop.price,
        restaurantId: drop.restaurantId,
        restaurantName: drop.restaurant,
        metadata: { is_exclusive: true, exclusive_type: 'chefs_table' }
      });

    });

    setConfirmed(true);

  };

  const handleGoToCart = () => {

    toast({
      title: "Chef's Table réservé !",
      description: `${reservedDrops.length} plat(s) · ${reservedTotal.toFixed(2)} CHF`,
    });

    navigate("/panier");

  };

  return (

    <FeatureWizard
      title="Chef's Table"
      subtitle="Plats off-menu en édition ultra-limitée"
      icon={ChefHat}
      colorClass="amber-500"
      steps={[
        { id: "selection", label: "Sélection" },
        { id: "confirm", label: "Confirmation" }
      ]}
      currentStepId={confirmed ? "confirm" : "selection"}
      headerAction={
        <Button
          variant={notifyAll ? "default" : "outline"}
          onClick={async () => {
            if (!user) {
              toast({ title: "Connectez-vous", description: "Activez les alertes apres connexion.", variant: "destructive" });
              return;
            }
            if (notifyAll) {
              await supabase
                .from("notification_subscriptions" as any)
                .delete()
                .eq("user_id", user.id)
                .eq("topic", "chefs_table");
            } else {
              await supabase
                .from("notification_subscriptions" as any)
                .upsert({ user_id: user.id, topic: "chefs_table", filters: {} }, { onConflict: "user_id,topic" });
            }
            queryClient.invalidateQueries({ queryKey: ["chefs-table-subscription", user.id] });
            toast({
              title: notifyAll ? "Alertes desactivees" : "Alertes Chef's Table activees",
              description: notifyAll ? "" : "Vous serez notifie des prochains drops",
            });
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
                const urgency = drop.remaining <= 5;

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
                          className="bg-amber-500 hover:bg-amber-600"
                        >
                          Réserver
                        </Button>

                      </div>

                    </div>

                  </div>

                );

              })}

            </div>

            {/* Checkout bar */}
            <div className="sticky bottom-4 z-40 flex justify-center">
              <div
                className="relative mx-4 rounded-2xl overflow-hidden
               border-1 border-amber-500/80
               bg-white/30 backdrop-blur-2xl backdrop-saturate-150
               shadow-[0_20px_60px_rgba(0,0,0,0.25)]
               p-0"
              >
                {/* Reflet verre (couvre EXACTEMENT la hauteur du cadre) */}
                <div
                  className="pointer-events-none absolute inset-0
                 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.45),rgba(255,255,255,0.12),transparent)]
                 opacity-20"
                  aria-hidden="true"
                />
                {/* Bordure intérieure fine (effet verre) */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl
                 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(0,0,0,0.10)]"
                  aria-hidden="true"
                />

                {/* IMPORTANT: on ne rajoute aucun padding ici */}
                <div className="relative [&>*]:m-0 [&>*]:p-6">
                  <WizardCartSummary
                    count={reserved.size}
                    subtotal={reservedTotal}
                    colorClass="amber-500"
                    total={reservedTotal}
                    onValidate={handleCheckout}
                    validateLabel="Confirmer les réservations"
                  />
                </div>
              </div>
            </div>

          </>

        )}

        {confirmed && (

          <div className="space-y-6">

            <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 p-6 text-center">

              <CheckCircle2 className="h-12 w-12 text-amber-500 mx-auto" />

              <h2 className="font-display text-xl font-bold">
                Réservations confirmées !
              </h2>

            </div>

            <WizardNextButton
              onClick={handleGoToCart}
              label="Procéder au paiement"
              colorClass="amber-500"
            />

          </div>

        )}

      </div>

    </FeatureWizard>

  );

}
