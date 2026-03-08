import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type OwnedRestaurant = {
  id: string;
  name: string;
};

export function useOwnerRestaurants() {
  const { user } = useAuth();
  const [restaurants, setRestaurants] = useState<OwnedRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!user?.id) {
        if (mounted) {
          setRestaurants([]);
          setLoading(false);
          setError(null);
        }
        return;
      }

      setLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from("restaurants")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true });

      if (!mounted) return;

      if (queryError) {
        setError(queryError.message);
        setRestaurants([]);
      } else {
        setRestaurants((data || []) as OwnedRestaurant[]);
      }
      setLoading(false);
    };

    load();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return {
    restaurants,
    restaurantIds: restaurants.map((restaurant) => restaurant.id),
    loading,
    error,
  };
}
