import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import { computeSubscriptionEnabledFeatures, type GatableFeatureKey } from "@/lib/packFeatureGating";
import { getRestaurantSocialLinks, type RestaurantSocialLinks } from "@/lib/socialCrossPosting";

const supabase = getSupabase();

export type OwnedRestaurant = {
  id: string;
  name: string;
  opening_hours?: Json | null;
  disabled_dashboard_features: string[];
  subscription_enabled_dashboard_features?: GatableFeatureKey[];
  restaurant_subscription?: OwnedRestaurantSubscription | null;
  is_active: boolean | null;
  status: string | null;
  socialLinks?: RestaurantSocialLinks;
};

type OwnedRestaurantSubscription = {
  id: string;
  restaurant_id: string;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  restaurant_subscription_plan_id: string | null;
  plan_record: {
    id: string;
    slug: string;
    features: unknown;
  } | null;
};

type RestaurantSubscriptionRow = {
  id: string;
  restaurant_id: string;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  restaurant_subscription_plan_id: string | null;
};

type RestaurantSubscriptionPlanRow = {
  id: string;
  slug: string;
  features: unknown;
};

function getSubscriptionSortTime(subscription: RestaurantSubscriptionRow) {
  const timestamp = Date.parse(subscription.current_period_end || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function fetchActiveRestaurantSubscriptions(restaurantIds: string[]) {
  if (restaurantIds.length === 0) return new Map<string, OwnedRestaurantSubscription>();

  const [{ data: subscriptionsData, error: subscriptionsError }, { data: plansData, error: plansError }] = await Promise.all([
    (supabase.from as any)("restaurant_ai_subscriptions")
      .select("id, restaurant_id, plan, status, current_period_end, restaurant_subscription_plan_id")
      .in("restaurant_id", restaurantIds)
      .in("status", ["trialing", "active"]),
    (supabase.from as any)("restaurant_subscription_plans")
      .select("id, slug, features")
      .eq("is_active", true),
  ]);

  if (subscriptionsError || plansError) {
    console.warn("[dashboard] abonnement restaurateur indisponible pour le gating", subscriptionsError || plansError);
    return new Map<string, OwnedRestaurantSubscription>();
  }

  const plansById = new Map<string, RestaurantSubscriptionPlanRow>();
  const plansBySlug = new Map<string, RestaurantSubscriptionPlanRow>();

  for (const plan of (plansData || []) as RestaurantSubscriptionPlanRow[]) {
    plansById.set(plan.id, plan);
    plansBySlug.set(String(plan.slug || "").toLowerCase(), plan);
  }

  const subscriptionsByRestaurant = new Map<string, OwnedRestaurantSubscription>();
  const sortedSubscriptions = [...((subscriptionsData || []) as RestaurantSubscriptionRow[])]
    .sort((a, b) => getSubscriptionSortTime(b) - getSubscriptionSortTime(a));

  for (const subscription of sortedSubscriptions) {
    if (subscriptionsByRestaurant.has(subscription.restaurant_id)) continue;

    const planRecord = subscription.restaurant_subscription_plan_id
      ? plansById.get(subscription.restaurant_subscription_plan_id) || null
      : plansBySlug.get(String(subscription.plan || "").toLowerCase()) || null;

    subscriptionsByRestaurant.set(subscription.restaurant_id, {
      ...subscription,
      plan_record: planRecord,
    });
  }

  return subscriptionsByRestaurant;
}

export function useOwnerRestaurants(options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const enabled = options?.enabled ?? true;

  const { data, isLoading, error } = useQuery({
    queryKey: ["owner-restaurants", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, opening_hours, disabled_dashboard_features, is_active, status")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      const restaurantRows = data || [];
      const subscriptionsByRestaurant = await fetchActiveRestaurantSubscriptions(
        restaurantRows.map((restaurant) => restaurant.id),
      );

      return restaurantRows.map((r) => {
        const subscription = subscriptionsByRestaurant.get(r.id) || null;
        const subscriptionEnabledFeatures = computeSubscriptionEnabledFeatures(
          subscription
            ? {
              plan: subscription.plan,
              slug: subscription.plan_record?.slug || subscription.plan,
              status: subscription.status,
              current_period_end: subscription.current_period_end,
              features: subscription.plan_record?.features || [],
            }
            : null,
        );

        return {
          ...r,
          disabled_dashboard_features: Array.isArray(r.disabled_dashboard_features)
            ? r.disabled_dashboard_features
            : [],
          subscription_enabled_dashboard_features: subscriptionEnabledFeatures,
          restaurant_subscription: subscription,
          socialLinks: getRestaurantSocialLinks(r.opening_hours),
        };
      }) as OwnedRestaurant[];
    },
    enabled: enabled && !!user?.id,
  });

  const restaurants = data || [];

  return {
    restaurants,
    restaurantIds: restaurants.map((restaurant) => restaurant.id),
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}
