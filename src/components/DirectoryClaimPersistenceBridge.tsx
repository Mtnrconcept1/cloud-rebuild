import { useEffect } from "react";

import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();
const fromUntyped = supabase.from.bind(supabase) as (relation: string) => any;

async function persistClaimIntent(restaurantId: string) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return;

  const { data: restaurant, error: restaurantError } = await fromUntyped("restaurants")
    .select("id, name, address, city, is_directory_listing")
    .eq("id", restaurantId)
    .eq("is_directory_listing", true)
    .maybeSingle();
  if (restaurantError || !restaurant) return;

  const { error } = await fromUntyped("restaurant_directory_claim_requests").insert({
    restaurant_id: restaurant.id,
    requester_id: user.id,
    restaurant_name: restaurant.name,
    restaurant_address: restaurant.address,
    restaurant_city: restaurant.city,
    status: "awaiting_signup",
  });

  if (error && error.code !== "23505") {
    console.warn("Directory restaurant claim intent could not be persisted", error.message);
  }
}

export default function DirectoryClaimPersistenceBridge() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claimRestaurantId = params.get("claimRestaurant")?.trim() || "";
    if (!claimRestaurantId) return;

    void persistClaimIntent(claimRestaurantId);

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void persistClaimIntent(claimRestaurantId);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
