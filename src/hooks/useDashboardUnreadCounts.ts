import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  countUnreadEntries,
  DASHBOARD_INBOX_PATHS,
  type DashboardInboxPath,
  getLatestCreatedAt,
  isAntiWasteDashboardOrder,
  isFlashSaleDashboardOrder,
  isRecord,
  isStandardDashboardOrder,
  readDashboardSeenAt,
  writeDashboardSeenAt,
} from "@/lib/dashboardInbox";

type UnreadOrderRow = {
  id: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

type UnreadReservationRow = {
  id: string;
  created_at: string;
};

const MONITORED_PATHS: DashboardInboxPath[] = [
  DASHBOARD_INBOX_PATHS.orders,
  DASHBOARD_INBOX_PATHS.antiWasteOrders,
  DASHBOARD_INBOX_PATHS.flashSaleOrders,
  DASHBOARD_INBOX_PATHS.reservations,
];

export function useDashboardUnreadCounts(selectedRestaurantId?: string | null, pathname?: string) {
  const [seenVersion, setSeenVersion] = useState(0);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["dashboard-unread-orders", selectedRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_restaurant_orders_dashboard" as any, {
        p_restaurant_id: selectedRestaurantId!,
      });

      if (error) throw error;

      return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id || ""),
        created_at: String(row.created_at || ""),
        metadata: isRecord(row.metadata) ? row.metadata : {},
      })) as UnreadOrderRow[];
    },
    enabled: Boolean(selectedRestaurantId),
  });

  const { data: reservations = [], isLoading: reservationsLoading } = useQuery({
    queryKey: ["dashboard-unread-reservations", selectedRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, created_at")
        .eq("restaurant_id", selectedRestaurantId!)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id || ""),
        created_at: String(row.created_at || ""),
      })) as UnreadReservationRow[];
    },
    enabled: Boolean(selectedRestaurantId),
  });

  const entriesByPath = useMemo<Record<DashboardInboxPath, Array<{ created_at: string }>>>(() => ({
    [DASHBOARD_INBOX_PATHS.orders]: orders.filter(isStandardDashboardOrder),
    [DASHBOARD_INBOX_PATHS.antiWasteOrders]: orders.filter(isAntiWasteDashboardOrder),
    [DASHBOARD_INBOX_PATHS.flashSaleOrders]: orders.filter(isFlashSaleDashboardOrder),
    [DASHBOARD_INBOX_PATHS.reservations]: reservations,
  }), [orders, reservations]);

  const counts = (() => {
    if (!selectedRestaurantId) {
      return Object.fromEntries(MONITORED_PATHS.map((path) => [path, 0])) as Record<DashboardInboxPath, number>;
    }

    const nextCounts = {} as Record<DashboardInboxPath, number>;
    for (const path of MONITORED_PATHS) {
      nextCounts[path] = countUnreadEntries(
        entriesByPath[path],
        readDashboardSeenAt(selectedRestaurantId, path),
      );
    }
    return nextCounts;
  })();

  const activePath = useMemo(
    () => (pathname && MONITORED_PATHS.includes(pathname as DashboardInboxPath) ? pathname as DashboardInboxPath : null),
    [pathname],
  );

  const activeEntries = useMemo(
    () => (activePath ? entriesByPath[activePath] : []),
    [activePath, entriesByPath],
  );
  const activeLatestCreatedAt = useMemo(() => getLatestCreatedAt(activeEntries), [activeEntries]);

  useEffect(() => {
    if (!selectedRestaurantId || !activePath) return;
    if (activePath === DASHBOARD_INBOX_PATHS.reservations && reservationsLoading) return;
    if (activePath !== DASHBOARD_INBOX_PATHS.reservations && ordersLoading) return;

    writeDashboardSeenAt(selectedRestaurantId, activePath, activeLatestCreatedAt);
    setSeenVersion((current) => current + 1);
  }, [
    activeLatestCreatedAt,
    activePath,
    ordersLoading,
    reservationsLoading,
    selectedRestaurantId,
  ]);

  return {
    counts,
  };
}
