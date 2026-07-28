import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import type {
  RestaurantLaunchPack,
  FulfillmentStatus,
  PackPurchaseStatus,
} from "@/lib/launchPacks";

const supabase = getSupabase();

export type AdminRestaurantPack = RestaurantLaunchPack & {
  restaurants: { id: string; name: string; owner_id: string; disabled_dashboard_features: string[] };
};

export type AdminRestaurantSubscription = {
  id: string;
  restaurant_id: string;
  plan: string | null;
  status: string | null;
  billing_period: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  scheduled_plan_change: unknown;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  restaurant_subscription_plan_id: string | null;
  created_at: string | null;
  restaurants: { id: string; name: string; owner_id: string; disabled_dashboard_features: string[] } | null;
  plan_record: {
    id: string;
    slug: string;
    name: string;
    price_monthly_chf: number;
    features: unknown;
    is_active: boolean;
    position: number;
  } | null;
};

/** Fetch all restaurant launch packs with restaurant info (admin) */
export function useAdminLaunchPacks() {
  return useQuery({
    queryKey: ["admin-launch-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_launch_packs")
        .select(`
          *,
          launch_packs (*),
          launch_pack_service_fulfillments (*),
          restaurants!restaurant_launch_packs_restaurant_id_fkey (id, name, owner_id, disabled_dashboard_features)
        `)
        .neq("status", "pending_payment")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as AdminRestaurantPack[];
    },
  });
}

/** Fetch restaurant subscriptions for the admin subscription console. */
export function useAdminRestaurantSubscriptions() {
  return useQuery({
    queryKey: ["admin-restaurant-subscriptions"],
    queryFn: async () => {
      const { data: subscriptionsData, error: subscriptionsError } = await (supabase.from as any)("restaurant_ai_subscriptions")
        .select(`
          id,
          restaurant_id,
          plan,
          status,
          billing_period,
          current_period_start,
          current_period_end,
          cancel_at_period_end,
          scheduled_plan_change,
          stripe_subscription_id,
          stripe_checkout_session_id,
          restaurant_subscription_plan_id,
          created_at
        `)
        .order("created_at", { ascending: false })
        .limit(500);

      if (subscriptionsError) throw subscriptionsError;

      const subscriptions = (subscriptionsData || []) as Array<Omit<AdminRestaurantSubscription, "restaurants" | "plan_record">>;
      const restaurantIds = [...new Set(subscriptions.map((subscription) => subscription.restaurant_id).filter(Boolean))];
      const planIds = [...new Set(subscriptions.map((subscription) => subscription.restaurant_subscription_plan_id).filter(Boolean))];

      const [restaurantsResult, plansByIdResult, activePlansResult] = await Promise.all([
        restaurantIds.length > 0
          ? (supabase.from as any)("restaurants")
            .select("id, name, owner_id, disabled_dashboard_features")
            .in("id", restaurantIds)
          : Promise.resolve({ data: [], error: null }),
        planIds.length > 0
          ? (supabase.from as any)("restaurant_subscription_plans")
            .select("id, slug, name, price_monthly_chf, features, is_active, position")
            .in("id", planIds)
          : Promise.resolve({ data: [], error: null }),
        (supabase.from as any)("restaurant_subscription_plans")
          .select("id, slug, name, price_monthly_chf, features, is_active, position")
          .eq("is_active", true),
      ]);

      if (restaurantsResult.error) throw restaurantsResult.error;
      if (plansByIdResult.error) throw plansByIdResult.error;
      if (activePlansResult.error) throw activePlansResult.error;

      const restaurantsById = new Map<string, AdminRestaurantSubscription["restaurants"]>();
      for (const restaurant of restaurantsResult.data || []) {
        restaurantsById.set(restaurant.id, {
          ...restaurant,
          disabled_dashboard_features: Array.isArray(restaurant.disabled_dashboard_features)
            ? restaurant.disabled_dashboard_features
            : [],
        });
      }

      const plansById = new Map<string, AdminRestaurantSubscription["plan_record"]>();
      const plansBySlug = new Map<string, AdminRestaurantSubscription["plan_record"]>();
      for (const plan of [...(plansByIdResult.data || []), ...(activePlansResult.data || [])]) {
        plansById.set(plan.id, plan);
        plansBySlug.set(String(plan.slug || "").toLowerCase(), plan);
      }

      return subscriptions.map((subscription) => ({
        ...subscription,
        restaurants: restaurantsById.get(subscription.restaurant_id) || null,
        plan_record: subscription.restaurant_subscription_plan_id
          ? plansById.get(subscription.restaurant_subscription_plan_id) || null
          : plansBySlug.get(String(subscription.plan || "").toLowerCase()) || null,
      })) as AdminRestaurantSubscription[];
    },
  });
}

/** Update a service fulfillment (status, assigned_to, scheduled_at, notes) */
export function useUpdateFulfillment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      status?: FulfillmentStatus;
      assigned_to?: string | null;
      scheduled_at?: string | null;
      completed_at?: string | null;
      notes?: string | null;
    }) => {
      const { id, ...patch } = params;

      // Auto-set completed_at when marking as completed
      if (patch.status === "completed" && patch.completed_at === undefined) {
        patch.completed_at = new Date().toISOString();
      }
      // Clear completed_at when reverting from completed
      if (patch.status && patch.status !== "completed" && patch.completed_at === undefined) {
        patch.completed_at = null;
      }

      const { error } = await (supabase.rpc as any)("admin_update_launch_pack_fulfillment", {
        p_fulfillment_id: id,
        p_patch: patch,
        p_reason: "Mise à jour fulfillment Launch Pack",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-launch-packs"] });
    },
  });
}

/** Update disabled dashboard features for a restaurant */
export function useUpdateRestaurantFeatures() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      restaurantId: string;
      disabledFeatures: string[];
    }) => {
      const { error } = await (supabase.rpc as any)("admin_update_restaurant_disabled_features", {
        p_restaurant_id: params.restaurantId,
        p_features: params.disabledFeatures,
        p_reason: "Mise à jour features dashboard Launch Pack",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-launch-packs"] });
    },
  });
}

/** Update the overall pack purchase status */
export function useUpdatePackStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      status: PackPurchaseStatus;
    }) => {
      const { error } = await (supabase.rpc as any)("admin_update_launch_pack_status", {
        p_pack_id: params.id,
        p_status: params.status,
        p_reason: "Mise à jour statut Launch Pack",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-launch-packs"] });
    },
  });
}
