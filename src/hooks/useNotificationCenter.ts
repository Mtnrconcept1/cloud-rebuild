import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabase } from "@/integrations/supabase/client";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useAuth } from "@/lib/auth-context";
import {
  commercialDemoEventToNotification,
  useCommercialDemoFrame,
} from "@/components/commercial/CommercialDemoFrameProvider";

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
  const commercialDemoFrame = useCommercialDemoFrame();
  // Actor frames consume isolated journey events. The embedded commercial
  // workspace keeps the authenticated user's real notification centre.
  const isCommercialDemoFrame = Boolean(commercialDemoFrame && commercialDemoFrame.surface !== "commercial");

  useRealtimeNotifications({ enabled: Boolean(options.realtime && user?.id && !isCommercialDemoFrame) });

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
    enabled: Boolean(user?.id && !isCommercialDemoFrame),
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
    enabled: Boolean(user?.id && !isCommercialDemoFrame),
  });

  const inAppEnabled = isCommercialDemoFrame ? true : ((preferencesQuery.data as any)?.channels?.in_app ?? true);
  const allowedCategories = useMemo(
    () => (preferencesQuery.data as any)?.categories ?? DEFAULT_NOTIFICATION_CATEGORIES,
    [preferencesQuery.data],
  );

  const demoNotifications = useMemo<TokNotification[]>(() => {
    if (!commercialDemoFrame) return [];
    return commercialDemoFrame.snapshot.events
      .map((event) => commercialDemoEventToNotification(event, commercialDemoFrame.surface))
      .filter((notification): notification is NonNullable<typeof notification> => Boolean(notification))
      .map((notification) => ({
        ...notification,
        read_at: commercialDemoFrame.readNotificationIds.has(notification.id) ? notification.created_at : null,
      }))
      .reverse()
      .slice(0, limit);
  }, [commercialDemoFrame, limit]);

  const visibleNotifications = useMemo(() => {
    if (isCommercialDemoFrame) return demoNotifications;
    return (notificationsQuery.data || []).filter((notification) => allowedCategories?.[notification.category || ""] !== false);
  }, [allowedCategories, demoNotifications, isCommercialDemoFrame, notificationsQuery.data]);

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

    queryClient.setQueriesData<TokNotification[]>({ queryKey: ["notifications", user.id] }, patch);
    queryClient.setQueryData(["navbar-notifications", user.id], patch);
  }, [queryClient, user?.id]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    if (isCommercialDemoFrame && commercialDemoFrame) {
      commercialDemoFrame.markNotificationRead(notificationId);
      return;
    }
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
  }, [commercialDemoFrame, isCommercialDemoFrame, queryClient, updateNotificationCaches, user?.id]);

  const markAllRead = useCallback(async () => {
    if (isCommercialDemoFrame && commercialDemoFrame) {
      commercialDemoFrame.markAllNotificationsRead();
      return;
    }
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
  }, [commercialDemoFrame, isCommercialDemoFrame, queryClient, unreadNotifications.length, updateNotificationCaches, user?.id]);

  return {
    inAppEnabled,
    notifications: visibleNotifications,
    unreadNotifications,
    unreadCount: unreadNotifications.length,
    isLoading: isCommercialDemoFrame ? false : notificationsQuery.isLoading,
    error: isCommercialDemoFrame ? null : notificationsQuery.error,
    markNotificationRead,
    markAllRead,
  };
}
