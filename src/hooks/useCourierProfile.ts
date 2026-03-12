import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { ensureCourierProfile } from "@/lib/courier";

export function useCourierProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["courier-profile", user?.id],
    enabled: !!user?.id,
    retry: false,
    queryFn: async () => {
      if (!user?.id) return null;
      return ensureCourierProfile();
    },
  });
}
