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
        p_reason: "Mise a jour fulfillment Launch Pack",
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
        p_reason: "Mise a jour features dashboard Launch Pack",
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
        p_reason: "Mise a jour statut Launch Pack",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-launch-packs"] });
    },
  });
}
