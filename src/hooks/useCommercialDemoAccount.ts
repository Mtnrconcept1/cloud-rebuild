import { useQuery } from "@tanstack/react-query";

import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type CommercialDemoAccount = {
  user_id: string;
  demo_restaurant_id: string;
  is_active: boolean;
  template_version: number;
};

export function useCommercialDemoAccount(options?: { enabled?: boolean }) {
  const { user, roles } = useAuth();
  const enabled = (options?.enabled ?? true) && Boolean(user?.id) && roles.includes("commercial");

  const query = useQuery({
    queryKey: ["commercial-demo-account", user?.id],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (getSupabase().from as any)("commercial_demo_accounts")
        .select("user_id,demo_restaurant_id,is_active,template_version")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) {
        // Keeps rolling deployments usable while the migration and frontend
        // reach production at slightly different times.
        if (error.code === "42P01" || error.code === "PGRST205") return null;
        throw error;
      }

      return data as CommercialDemoAccount | null;
    },
  });

  return {
    account: query.data || null,
    isDemoAccount: Boolean(query.data?.is_active && query.data?.demo_restaurant_id),
    demoRestaurantId: query.data?.is_active ? query.data.demo_restaurant_id : null,
    loading: enabled ? query.isLoading : false,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
