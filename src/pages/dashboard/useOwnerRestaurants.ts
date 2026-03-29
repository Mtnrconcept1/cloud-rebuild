import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type OwnedRestaurant = {
  id: string;
  name: string;
};

export function useOwnerRestaurants() {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["owner-restaurants", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as OwnedRestaurant[];
    },
    enabled: !!user?.id,
  });

  const restaurants = data || [];

  return {
    restaurants,
    restaurantIds: restaurants.map((restaurant) => restaurant.id),
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}
