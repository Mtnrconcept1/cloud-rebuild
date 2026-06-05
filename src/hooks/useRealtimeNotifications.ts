import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  createRealtimeNotificationManager,
  type RealtimeNotification,
} from "@/lib/realtimeNotifications";

const supabase = getSupabase();
const realtimeNotificationManager = createRealtimeNotificationManager({ client: supabase });

export type { RealtimeNotification } from "@/lib/realtimeNotifications";

export function useRealtimeNotifications({
  enabled = true,
  onInsert,
}: {
  enabled?: boolean;
  onInsert?: (notification: RealtimeNotification) => void;
} = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !user?.id) return;

    return realtimeNotificationManager.retain(user.id, {
      queryClient,
      onInsert,
    });
  }, [enabled, onInsert, queryClient, user?.id]);
}
