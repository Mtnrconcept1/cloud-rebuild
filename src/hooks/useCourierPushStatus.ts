import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { enablePush, disablePush } from "@/lib/push-unified";
import {
  getWebPushStatus,
  type WebPushStatus,
} from "@/lib/push";

export function useCourierPushStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<WebPushStatus>({
    queryKey: ["courier-web-push", user?.id],
    enabled: !!user?.id,
    queryFn: async () => getWebPushStatus(user!.id),
    staleTime: 30_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["courier-web-push", user?.id] });
  };

  const enable = async () => {
    if (!user?.id) {
      return { ok: false, reason: "Utilisateur non connecte." };
    }

    const result = await enablePush(user.id);
    await refresh();
    return result;
  };

  const disable = async () => {
    if (!user?.id) {
      return { ok: false, reason: "Utilisateur non connecte." };
    }

    const result = await disablePush(user.id);
    await refresh();
    return result;
  };

  return {
    ...query,
    refresh,
    enable,
    disable,
  };
}
