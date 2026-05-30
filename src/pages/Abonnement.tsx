import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Pause,
  Play,
  Repeat,
  ShoppingCart,
  Sparkles,
  TrendingDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import {
  MEAL_SUBSCRIPTION_DAYS,
  buildMealSubscriptionCartItems,
  getActiveMealSlots,
  getMealSubscriptionSummary,
  normalizeMealSubscriptionSlots,
  type MealSubscriptionSlot,
  type MealSubscriptionStatus,
} from "@/lib/mealSubscription";

const supabase = getSupabase();

type MealSlot = MealSubscriptionSlot;

const EMPTY_MEAL_SETTINGS: MealSubscriptionStatus = { status: "active", resume_at: null };

function createEmptySlot(day: string): MealSlot {
  return {
    day,
    menuItemId: "",
    meal: "",
    restaurant: "",
    restaurantId: "",
    price: 0,
    time: "",
  };
}

export default function Abonnement() {
  const { replaceCartItems } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<MealSlot[]>(MEAL_SUBSCRIPTION_DAYS.map((day) => createEmptySlot(day)));
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);

  const { data: subs } = useQuery({
    queryKey: ["user-subscriptions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_subscriptions" as any)
        .select("*, menu_items(id, name, price), restaurants(id, name)")
        .eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: mealSettings = EMPTY_MEAL_SETTINGS } = useQuery({
    queryKey: ["user-meal-subscription-settings", user?.id],
    queryFn: async (): Promise<MealSubscriptionStatus> => {
      if (!user) return EMPTY_MEAL_SETTINGS;
      const { data, error } = await supabase
        .from("user_meal_subscription_settings" as any)
        .select("status, resume_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;

      return {
        status: data?.status === "paused" ? "paused" : "active",
        resume_at: data?.resume_at || null,
      };
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!subs) return;

    const normalized = normalizeMealSubscriptionSlots(
      (subs as any[]).map((sub) => ({
        day: sub.day_of_week || "",
        menuItemId: sub.menu_item_id || "",
        meal: sub.menu_items?.name || "",
        restaurant: sub.restaurants?.name || "",
        restaurantId: sub.restaurant_id || "",
        price: sub.menu_items?.price ? Number(sub.menu_items.price) : 0,
        time: sub.preferred_time || "12:00",
      })),
    );

    setPlan(normalized);
    setSubscribed(getActiveMealSlots(normalized).length > 0);
  }, [subs]);

  const updateSubMutation = useMutation({
    mutationFn: async (slot: MealSlot) => {
      if (!user) return;

      if (slot.menuItemId) {
        const { error } = await supabase
          .from("user_subscriptions" as any)
          .upsert(
            {
              user_id: user.id,
              day_of_week: slot.day,
              menu_item_id: slot.menuItemId,
              restaurant_id: slot.restaurantId,
              preferred_time: slot.time || "12:00",
              is_active: true,
            },
            { onConflict: "user_id,day_of_week" } as any,
          );
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("user_subscriptions" as any)
        .delete()
        .eq("user_id", user.id)
        .eq("day_of_week", slot.day);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-subscriptions"] });
    },
  });

  const updateMealSettingsMutation = useMutation({
    mutationFn: async (status: MealSubscriptionStatus["status"]) => {
      if (!user) return;
      const { error } = await supabase
        .from("user_meal_subscription_settings" as any)
        .upsert(
          {
            user_id: user.id,
            status,
            resume_at: null,
          },
          { onConflict: "user_id" } as any,
        );
      if (error) throw error;
    },
    onSuccess: (_result, status) => {
      queryClient.invalidateQueries({ queryKey: ["user-meal-subscription-settings"] });
      toast({
        title: status === "paused" ? "Abonnement en pause" : "Abonnement repris",
        description: status === "paused"
          ? "Aucune commande repas ne sera preparee jusqu'a la reprise."
          : "Votre planning repas est de nouveau actif.",
      });
    },
  });

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

  const activeMeals = getActiveMealSlots(plan);
  const summary = getMealSubscriptionSummary(plan, mealSettings);
  const activeRestaurantNames = Array.from(new Set(activeMeals.map((meal) => meal.restaurant).filter(Boolean)));
  const uniqueRestaurantIds = Array.from(new Set(activeMeals.map((meal) => meal.restaurantId).filter(Boolean)));
  const selectedRestaurant = restaurants?.find((restaurant: any) => restaurant.id === selectedRestaurantId);
  const weekLabel =
    weekOffset === 0
      ? "Cette semaine"
      : weekOffset === 1
        ? "Semaine prochaine"
        : `Dans ${weekOffset} semaines`;

  const selectMeal = (day: string, item: any, restaurant: any) => {
    if (!restaurant) return;

    const newSlot: MealSlot = {
      day,
      menuItemId: item.id,
      meal: item.name,
      restaurant: restaurant.name,
      restaurantId: restaurant.id,
      price: Number(item.price),
      time: "12:00",
    };

    setPlan((currentPlan) => currentPlan.map((slot) => (slot.day === day ? newSlot : slot)));
    updateSubMutation.mutate(newSlot);
    setEditingDay(null);
    setSelectedRestaurantId(null);
  };

  const clearDay = (day: string) => {
    const clearedSlot = createEmptySlot(day);
    setPlan((currentPlan) => currentPlan.map((slot) => (slot.day === day ? clearedSlot : slot)));
    updateSubMutation.mutate(clearedSlot);
    setEditingDay(null);
    setSelectedRestaurantId(null);
  };

  const syncSubscriptionCart = () => {
    const cartItems = buildMealSubscriptionCartItems(plan);

    replaceCartItems(cartItems, {
      feature: "abonnement",
      multi_restaurant: uniqueRestaurantIds.length > 1,
      restaurant_count: uniqueRestaurantIds.length,
      restaurants: activeRestaurantNames,
      weeklyTotal: summary.weeklyTotal,
      planDays: activeMeals.map((meal) => meal.day),
      subscription_status: mealSettings.status,
    }, "delivery");

    return cartItems.length;
  };

  const handleSubscribe = () => {
    syncSubscriptionCart();
    setSubscribed(true);
  };

  const handleGoToCart = () => {
    const syncedItemsCount = syncSubscriptionCart();
    if (syncedItemsCount === 0) {
      toast({
        title: "Aucun repas planifie",
        description: "Ajoutez au moins un plat a votre abonnement avant d'ouvrir le panier.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Abonnement active",
      description: `${activeMeals.length} repas/semaine - ${summary.weeklyTotal.toFixed(2)} CHF`,
    });
    navigate("/panier");
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-2xl space-y-8 py-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-500/10">
              <Repeat className="h-6 w-6 text-purple-500" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold">Abonnement repas</h1>
              <p className="text-sm text-muted-foreground">Planifiez vos repas de la semaine</p>
            </div>
          </div>

          {subscribed ? (
            <Button
              variant="outline"
              onClick={() => updateMealSettingsMutation.mutate(summary.isPaused ? "active" : "paused")}
              disabled={updateMealSettingsMutation.isPending}
              className={`w-full gap-2 sm:w-auto ${summary.isPaused ? "border-amber-500 text-amber-600" : ""}`}
            >
              {summary.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {summary.isPaused ? "Reprendre" : "Pause vacances"}
            </Button>
          ) : null}
        </div>

        {summary.isPaused ? (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
            <Pause className="h-5 w-5 shrink-0 text-amber-500" />
            <p className="text-sm text-amber-700">
              Abonnement en pause. Aucune commande ne sera preparee jusqu'a la reprise.
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
            disabled={weekOffset === 0}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="font-semibold">{weekLabel}</p>
            <p className="text-xs text-muted-foreground">{summary.activeMealsCount} repas planifies</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset(weekOffset + 1)}
            disabled={weekOffset >= 3}
          >
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
                className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
                  editingDay === slot.day
                    ? "border-purple-500 bg-purple-500/5"
                    : slot.meal
                      ? "border-border hover:border-purple-500/30"
                      : "border-dashed border-border hover:border-purple-500/30"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      {slot.meal ? (
                        <CheckCircle2 className="h-4 w-4 text-purple-500" />
                      ) : (
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{slot.day}</p>
                      {slot.meal ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {slot.meal} - {slot.restaurant}
                        </p>
                      ) : (
                        <p className="text-xs italic text-muted-foreground">Jour libre</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {slot.price > 0 ? <span className="text-sm font-bold">{slot.price.toFixed(2)} CHF</span> : null}
                    <Edit3 className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </button>

              {editingDay === slot.day && !selectedRestaurantId ? (
                <div className="mt-2 space-y-3 rounded-xl border bg-card p-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Choisir un restaurant pour {slot.day}</p>
                    {slot.meal ? (
                      <Button variant="ghost" size="sm" onClick={() => clearDay(slot.day)} className="text-xs text-destructive">
                        Jour libre
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {restaurants?.map((restaurant: any) => (
                      <button
                        key={restaurant.id}
                        onClick={() => setSelectedRestaurantId(restaurant.id)}
                        className="rounded-lg border p-2 text-left text-sm transition-all hover:border-purple-500/30"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={restaurant.image_url || "/images/kebab-box-spread.jpeg"}
                            alt={restaurant.name}
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{restaurant.name}</p>
                            <p className="text-[10px] text-muted-foreground">{restaurant.cuisine_type}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {editingDay === slot.day && selectedRestaurantId ? (
                <div className="mt-2 space-y-3 rounded-xl border bg-card p-4 animate-fade-in">
                  <div className="flex items-center justify-between gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedRestaurantId(null)} className="gap-1 text-xs">
                      <ChevronLeft className="h-3 w-3" /> Restaurants
                    </Button>
                    <p className="truncate text-sm font-semibold">{selectedRestaurant?.name}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {menuItems?.map((item: any) => (
                      <button
                        key={item.id}
                        onClick={() => selectMeal(slot.day, item, selectedRestaurant)}
                        className={`rounded-lg border p-3 text-left text-sm transition-all hover:border-purple-500/30 ${
                          slot.menuItemId === item.id ? "border-purple-500 bg-purple-500/5" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {item.image_url ? (
                              <img src={item.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                            ) : null}
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{item.name}</p>
                              {item.category ? <p className="text-[10px] text-muted-foreground">{item.category}</p> : null}
                            </div>
                          </div>
                          <p className="shrink-0 text-xs font-bold">{Number(item.price).toFixed(2)} CHF</p>
                        </div>
                      </button>
                    ))}
                    {menuItems?.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">Aucun plat disponible</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Recapitulatif hebdomadaire</h3>
            <Badge variant={summary.isPaused ? "outline" : "secondary"}>
              {summary.isPaused ? "Pause" : "Actif"}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-purple-500/5 p-3">
              <CalendarDays className="mx-auto mb-1 h-4 w-4 text-purple-500" />
              <p className="text-lg font-bold">{summary.activeMealsCount}</p>
              <p className="text-[10px] text-muted-foreground">Repas/semaine</p>
            </div>
            <div className="rounded-lg bg-purple-500/5 p-3">
              <ShoppingCart className="mx-auto mb-1 h-4 w-4 text-purple-500" />
              <p className="text-lg font-bold">{summary.weeklyTotal.toFixed(0)} CHF</p>
              <p className="text-[10px] text-muted-foreground">Cout hebdo</p>
            </div>
            <div className="rounded-lg bg-green-500/5 p-3">
              <TrendingDown className="mx-auto mb-1 h-4 w-4 text-green-500" />
              <p className="text-lg font-bold text-green-600">{summary.savings.toFixed(0)} CHF</p>
              <p className="text-[10px] text-muted-foreground">Economises</p>
            </div>
          </div>
        </div>

        {!subscribed ? (
          <Button
            onClick={handleSubscribe}
            disabled={summary.activeMealsCount === 0 || summary.isPaused}
            className="w-full gap-2 bg-purple-500 hover:bg-purple-600"
            size="lg"
          >
            <Sparkles className="h-5 w-5" />
            S'abonner - {summary.weeklyTotal.toFixed(2)} CHF/semaine
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-purple-500" />
              <p className="text-lg font-semibold">Abonnement actif</p>
              <p className="text-sm text-muted-foreground">
                {summary.activeMealsCount} repas/semaine - {activeRestaurantNames.length} restaurant{activeRestaurantNames.length > 1 ? "s" : ""} - {summary.weeklyTotal.toFixed(2)} CHF
              </p>
              <p className="text-xs text-muted-foreground">Plats de plusieurs restaurants synchronises dans un seul panier, modifiable a tout moment</p>
            </div>
            <Button onClick={handleGoToCart} className="w-full gap-2 bg-purple-500 hover:bg-purple-600" size="lg">
              Voir le panier <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
