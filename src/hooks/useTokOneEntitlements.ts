import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/integrations/supabase/client";

export function useTokOneEntitlements(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tok-one-entitlements", user?.id],
    enabled: enabled && Boolean(user),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (getSupabase().rpc as any)("get_my_tok_one_entitlements");
      if (error) throw error;
      return data as Record<string, boolean>;
    },
  });
}
