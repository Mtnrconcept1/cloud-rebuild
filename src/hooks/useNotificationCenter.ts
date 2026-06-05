import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabase } from "@/integrations/supabase/client";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useAuth } from "@/lib/auth-context";

const supabase = getSupabase();

const DEFAULT_NOTIFICATION_CATEGORIES = {
  transactional: true,
  product: true,
  marketing: false,
  system: true,
};

export type TokNotification = {
  id: string;
  user_id?: string;
  title: string;
  body: string;
  type?: string | null;
  category?: string | null;
  data?: Record<string, unknown> | null;
  created_at?: string;
  read_at?: string | null;
};

function normalizeNotification(row: any): TokNotification {
  return {
    ...row,
    data: row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {},
  };
}

export function useNotificationCenter(limit = 50, options: { realtime?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useRealtimeNotifications({ enabled: Boolean(options.realtime && user?.id) });

  const notificationsQuery = useQuery({
    queryKey: ["notifications", user?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []).map(normalizeNotification);
    },
    enabled: Boolean(user?.id),
  });

  const preferencesQuery = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(user?.id),
  });

  const inAppEnabled = (preferencesQuery.data as any)?.channels?.in_app ?? true;
  const allowedCategories = useMemo(
    () => (preferencesQuery.data as any)?.categories ?? DEFAULT_NOTIFICATION_CATEGORIES,
    [preferencesQuery.data],
  );

  const visibleNotifications = useMemo(
    () => (notificationsQuery.data || []).filter((notification) => allowedCategories?.[notification.category || ""] !== false),
    [allowedCategories, notificationsQuery.data],
  );

  const unreadNotifications = useMemo(
    () => (inAppEnabled ? visibleNotifications.filter((notification) => !notification.read_at) : []),
    [inAppEnabled, visibleNotifications],
  );

  const updateNotificationCaches = useCallback((readAt: string, notificationId?: string) => {
    if (!user?.id) return;

    const patch = (current: TokNotification[] | undefined) => (current || []).map((notification) => {
      if (notificationId && notification.id !== notificationId) return notification;
      return { ...notification, read_at: notification.read_at ?? readAt };
    });

    queryClient.setQueryData(["notifications", user.id, limit], patch);
    queryClient.setQueryData(["notifications", user.id], patch);
    queryClient.setQueryData(["navbar-notifications", user.id], patch);
  }, [limit, queryClient, user?.id]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    if (!user?.id) return;

    const readAt = new Date().toISOString();
    updateNotificationCaches(readAt, notificationId);

    const { error } = await supabase
      .from("notifications" as any)
      .update({ read_at: readAt })
      .eq("id", notificationId)
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
      queryClient.invalidateQueries({ queryKey: ["navbar-notifications", user.id] });
    }
  }, [queryClient, updateNotificationCaches, user?.id]);

  const markAllRead = useCallback(async () => {
    if (!user?.id || unreadNotifications.length === 0) return;

    const readAt = new Date().toISOString();
    updateNotificationCaches(readAt);

    const { error } = await supabase
      .from("notifications" as any)
      .update({ read_at: readAt })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
      queryClient.invalidateQueries({ queryKey: ["navbar-notifications", user.id] });
    }
  }, [queryClient, unreadNotifications.length, updateNotificationCaches, user?.id]);

  return {
    inAppEnabled,
    notifications: visibleNotifications,
    unreadNotifications,
    unreadCount: unreadNotifications.length,
    isLoading: notificationsQuery.isLoading,
    error: notificationsQuery.error,
    markNotificationRead,
    markAllRead,
  };
}
