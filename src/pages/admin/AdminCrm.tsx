import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import CustomerCrmDashboard, { type CustomerCrmRestaurantOption } from "@/components/crm/CustomerCrmDashboard";
import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();

export default function AdminCrm() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  const restaurantsQuery = useQuery({
    queryKey: ["admin-crm-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, city")
        .order("name", { ascending: true })
        .limit(300);

      if (error) throw error;
      return (data || []) as CustomerCrmRestaurantOption[];
    },
  });

  return (
    <CustomerCrmDashboard
      surface="admin"
      restaurantId={restaurantId}
      restaurants={restaurantsQuery.data || []}
      onRestaurantChange={setRestaurantId}
      restaurantLoading={restaurantsQuery.isLoading}
      restaurantError={restaurantsQuery.error instanceof Error ? restaurantsQuery.error.message : null}
    />
  );
}
