import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, Repeat, Pause, Play, Edit3,
  CheckCircle2, ChevronLeft, ChevronRight,
  TrendingDown, Sparkles, ShoppingCart,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DAY_EMOJIS = ["🍽️", "🍽️", "🍽️", "🍽️", "🍽️", "☀️", "☀️"];

interface MealSlot {
  day: string;
  menuItemId: string;
  meal: string;
  restaurant: string;
  restaurantId: string;
  price: number;
  emoji: string;
  time: string;
}

export default function Abonnement() {
  const { addItem, clearCart, updateCartMetadata, setOrderMode } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<MealSlot[]>(
    DAYS.map((day, i) => ({
      day,
      menuItemId: "",
      meal: "",
      restaurant: "",
      restaurantId: "",
      price: 0,
      emoji: DAY_EMOJIS[i],
      time: "",
    }))
  );

  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);

  // Fetch subscriptions
  const { data: subs } = useQuery({
    queryKey: ["user-subscriptions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_subscriptions" as any)
        .select("*, menu_items(id, name, price), restaurants(id, name)")
        .eq("user_id", user.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Sync with state
  useEffect(() => {
    if (subs && subs.length > 0) {
      setPlan(DAYS.map((day, i) => {
        const sub = (subs as any[]).find(s => s.day_of_week === day);
        return {
          day,
          menuItemId: sub?.menu_item_id || "",
          meal: sub?.menu_items?.name || "",
          restaurant: sub?.restaurants?.name || "",
          restaurantId: sub?.restaurant_id || "",
          price: sub?.menu_items?.price ? Number(sub.menu_items.price) : 0,
          emoji: sub?.menu_item_id ? "🍽️" : DAY_EMOJIS[i],
          time: sub?.preferred_time || "12:00",
        };
      }));
      setSubscribed(true);
    }
  }, [subs]);

  // Mutation to save/update sub
  const updateSubMutation = useMutation({
    mutationFn: async (slot: MealSlot) => {
      if (!user) return;
      if (slot.menuItemId) {
        const { error } = await supabase
          .from("user_subscriptions" as any)
          .upsert({
            user_id: user.id,
            day_of_week: slot.day,
            menu_item_id: slot.menuItemId,
            restaurant_id: slot.restaurantId,
            preferred_time: slot.time || "12:00",
            is_active: true
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_subscriptions" as any)
          .delete()
          .eq("user_id", user.id)
          .eq("day_of_week", slot.day);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-subscriptions"] });
    },
  });

  // Fetch restaurants
  const { data: restaurants } = useQuery({
    queryKey: ["abonnement-restaurants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_active", true)
        .eq("delivery_available", true)
        .order("rating", { ascending: false })
        .limit(12);
      return data || [];
    },
  });

  // Fetch menu items for selected restaurant
  const { data: menuItems } = useQuery({
    queryKey: ["abonnement-menu", selectedRestaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", selectedRestaurantId!)
        .eq("is_available", true)
        .order("price", { ascending: true })
        .limit(12);
      return data || [];
    },
    enabled: !!selectedRestaurantId,
  });

  const activeMeals = plan.filter((p) => p.meal);
  const weeklyTotal = activeMeals.reduce((sum, p) => sum + p.price, 0);
  const regularTotal = activeMeals.length * 18;
  const savings = Math.max(0, regularTotal - weeklyTotal);

  const selectMeal = (day: string, item: any, restaurant: any) => {
    const newSlot = {
      day,
      menuItemId: item.id,
      meal: item.name,
      restaurant: restaurant.name,
      restaurantId: restaurant.id,
      price: Number(item.price),
      emoji: "🍽️",
      time: "12:00",
    };

    setPlan(plan.map((p) => p.day === day ? newSlot : p));
    updateSubMutation.mutate(newSlot);

    setEditingDay(null);
    setSelectedRestaurantId(null);
  };

  const clearDay = (day: string) => {
    const clearedSlot = { day, menuItemId: "", meal: "", restaurant: "", restaurantId: "", price: 0, emoji: "☀️", time: "" };
    setPlan(plan.map((p) => p.day === day ? clearedSlot : p));
    updateSubMutation.mutate(clearedSlot);

    setEditingDay(null);
    setSelectedRestaurantId(null);
  };

  const handleSubscribe = () => {
    clearCart();
    setOrderMode("delivery");

    // Save subscription status to cart metadata
    updateCartMetadata({
      feature: "abonnement",
      weeklyTotal: weeklyTotal,
      planDays: activeMeals.map(m => m.day)
    });

    activeMeals.forEach((slot) => {
      addItem({
        menuItemId: slot.menuItemId,
        name: `[${slot.day}] ${slot.meal}`,
        price: slot.price,
        restaurantId: slot.restaurantId,
        restaurantName: slot.restaurant,
        metadata: { subscription_day: slot.day }
      });
    });
    setSubscribed(true);
  };

  const handleGoToCart = () => {
    toast({
      title: "Abonnement activé !",
      description: `${activeMeals.length} repas/semaine · ${weeklyTotal.toFixed(2)} CHF`,
    });
    navigate("/panier");
  };

  const weekLabel = weekOffset === 0 ? "Cette semaine" : weekOffset === 1 ? "Semaine prochaine" : `Dans ${weekOffset} semaines`;
  const selectedRestaurant = restaurants?.find((r: any) => r.id === selectedRestaurantId);

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
              <Repeat className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Abonnement repas</h1>
              <p className="text-muted-foreground text-sm">Planifiez vos repas de la semaine</p>
            </div>
          </div>
          {subscribed && (
            <Button
              variant="outline"
              onClick={() => setPaused(!paused)}
              className={`gap-2 ${paused ? "border-amber-500 text-amber-600" : ""}`}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? "Reprendre" : "Pause vacances"}
            </Button>
          )}
        </div>

        {paused && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-center gap-3">
            <Pause className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700">Abonnement en pause. Aucune commande ne sera passée jusqu'à la reprise.</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="font-semibold">{weekLabel}</p>
            <p className="text-xs text-muted-foreground">
              {activeMeals.length} repas planifiés
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset(weekOffset + 1)} disabled={weekOffset >= 3}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-2">
          {plan.map((slot) => (
            <div key={slot.day}>
              <button
                onClick={() => {
                  setEditingDay(editingDay === slot.day ? null : slot.day);
                  setSelectedRestaurantId(null);
                }}
                className={`w-full text-left rounded-xl border-2 p-4 transition-all
                  ${editingDay === slot.day
                    ? "border-purple-500 bg-purple-500/5"
                    : slot.meal
                      ? "border-border hover:border-purple-500/30"
                      : "border-dashed border-border hover:border-purple-500/30"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{slot.emoji}</span>
                    <div>
                      <p className="font-semibold text-sm">{slot.day}</p>
                      {slot.meal ? (
                        <p className="text-xs text-muted-foreground">
                          {slot.meal} · {slot.restaurant}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Jour libre</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {slot.price > 0 && <span className="text-sm font-bold">{slot.price.toFixed(2)} CHF</span>}
                    <Edit3 className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </button>

              {editingDay === slot.day && !selectedRestaurantId && (
                <div className="mt-2 rounded-xl border bg-card p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Choisir un restaurant pour {slot.day}</p>
                    {slot.meal && (
                      <Button variant="ghost" size="sm" onClick={() => clearDay(slot.day)} className="text-xs text-destructive">
                        Jour libre
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {restaurants?.map((r: any) => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRestaurantId(r.id)}
                        className="text-left rounded-lg border p-2 transition-all hover:border-purple-500/30 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={r.image_url || "/images/kebab-box-spread.jpeg"}
                            alt={r.name}
                            className="w-10 h-10 rounded-lg object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-xs truncate">{r.name}</p>
                            <p className="text-[10px] text-muted-foreground">{r.cuisine_type}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {editingDay === slot.day && selectedRestaurantId && (
                <div className="mt-2 rounded-xl border bg-card p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedRestaurantId(null)} className="gap-1 text-xs">
                      <ChevronLeft className="h-3 w-3" /> Restaurants
                    </Button>
                    <p className="text-sm font-semibold">{selectedRestaurant?.name}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {menuItems?.map((item: any) => (
                      <button
                        key={item.id}
                        onClick={() => selectMeal(slot.day, item, selectedRestaurant)}
                        className={`text-left rounded-lg border p-3 transition-all hover:border-purple-500/30 text-sm
                          ${slot.menuItemId === item.id ? "border-purple-500 bg-purple-500/5" : "border-border"}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {item.image_url && <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                            <div>
                              <p className="font-medium text-xs">{item.name}</p>
                              {item.category && <p className="text-[10px] text-muted-foreground">{item.category}</p>}
                            </div>
                          </div>
                          <p className="text-xs font-bold">{Number(item.price).toFixed(2)} CHF</p>
                        </div>
                      </button>
                    ))}
                    {menuItems?.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Aucun plat disponible</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold">Récapitulatif hebdomadaire</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-purple-500/5 p-3">
              <CalendarDays className="h-4 w-4 text-purple-500 mx-auto mb-1" />
              <p className="text-lg font-bold">{activeMeals.length}</p>
              <p className="text-[10px] text-muted-foreground">Repas/semaine</p>
            </div>
            <div className="rounded-lg bg-purple-500/5 p-3">
              <ShoppingCart className="h-4 w-4 text-purple-500 mx-auto mb-1" />
              <p className="text-lg font-bold">{weeklyTotal.toFixed(0)} CHF</p>
              <p className="text-[10px] text-muted-foreground">Coût hebdo</p>
            </div>
            <div className="rounded-lg bg-green-500/5 p-3">
              <TrendingDown className="h-4 w-4 text-green-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-green-600">{savings.toFixed(0)} CHF</p>
              <p className="text-[10px] text-muted-foreground">Économisés</p>
            </div>
          </div>
        </div>

        {!subscribed ? (
          <Button
            onClick={handleSubscribe}
            disabled={activeMeals.length === 0}
            className="w-full bg-purple-500 hover:bg-purple-600 gap-2"
            size="lg"
          >
            <Sparkles className="h-5 w-5" />
            S'abonner · {weeklyTotal.toFixed(2)} CHF/semaine
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-purple-500/5 border border-purple-500/20 p-6 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-purple-500 mx-auto" />
              <p className="font-semibold text-lg">Abonnement actif !</p>
              <p className="text-sm text-muted-foreground">
                {activeMeals.length} repas/semaine · {weeklyTotal.toFixed(2)} CHF · Créneaux réservés automatiquement
              </p>
              <p className="text-xs text-muted-foreground">Modifiable en 2 taps, pause vacances à tout moment</p>
            </div>
            <Button onClick={handleGoToCart} className="w-full bg-purple-500 hover:bg-purple-600 gap-2" size="lg">
              Voir le panier <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
