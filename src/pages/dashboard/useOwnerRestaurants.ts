import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import { getRestaurantSocialLinks, type RestaurantSocialLinks } from "@/lib/socialCrossPosting";

const supabase = getSupabase();

export type OwnedRestaurant = {
  id: string;
  name: string;
  opening_hours?: Json | null;
  disabled_dashboard_features: string[];
  socialLinks?: RestaurantSocialLinks;
};

export function useOwnerRestaurants(options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const enabled = options?.enabled ?? true;

  const { data, isLoading, error } = useQuery({
    queryKey: ["owner-restaurants", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, opening_hours, disabled_dashboard_features")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []).map((r) => ({
        ...r,
        disabled_dashboard_features: Array.isArray(r.disabled_dashboard_features)
          ? r.disabled_dashboard_features
          : [],
        socialLinks: getRestaurantSocialLinks(r.opening_hours),
      })) as OwnedRestaurant[];
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
