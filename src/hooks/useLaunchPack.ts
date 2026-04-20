import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import type { LaunchPack, RestaurantLaunchPack } from "@/lib/launchPacks";

const supabase = getSupabase();

/** Fetch all active launch packs (public page) */
export function useLaunchPacks() {
  return useQuery({
    queryKey: ["launch-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("launch_packs")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true });

      if (error) throw error;
      return (data || []) as LaunchPack[];
    },
  });
}

/** Fetch the restaurant's purchased launch pack with fulfillments */
export function useRestaurantLaunchPack(restaurantId: string | null) {
  return useQuery({
    queryKey: ["restaurant-launch-pack", restaurantId],
    enabled: !!restaurantId,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!restaurantId) return null;

      const { data, error } = await supabase
        .from("restaurant_launch_packs")
        .select(`
          *,
          launch_packs (*),
          launch_pack_service_fulfillments (*)
        `)
        .eq("restaurant_id", restaurantId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      return ((data || [])[0] as RestaurantLaunchPack) || null;
    },
  });
}
