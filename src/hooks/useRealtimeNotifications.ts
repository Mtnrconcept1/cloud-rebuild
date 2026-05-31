import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const supabase = getSupabase();

export type RealtimeNotification = {
  id: string;
  title: string;
  body: string;
  type?: string | null;
  category?: string | null;
  data?: Record<string, unknown> | null;
  created_at?: string;
  read_at?: string | null;
};

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

    const channel = supabase
      .channel(`realtime-notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const notification = payload.new as RealtimeNotification;
          queryClient.invalidateQueries({ queryKey: ["navbar-notifications", user.id] });
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
          onInsert?.(notification);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["navbar-notifications", user.id] });
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, onInsert, queryClient, user?.id]);
}
