import { describe, expect, it } from "vitest";

import { countUnreadOperationNotificationsByDate } from "@/lib/dashboardNotificationBadges";
import type { TokNotification } from "@/hooks/useNotificationCenter";

describe("dashboard operation notification day badges", () => {
  it("counts distinct unread order notifications on the matching visible day", () => {
    const counts = countUnreadOperationNotificationsByDate({
      kind: "order",
      items: [
        { id: "order-1", created_at: "2026-06-30T10:00:00.000Z" },
        { id: "order-2", created_at: "2026-07-01T10:00:00.000Z" },
      ],
      getItemId: (order) => order.id,
      getDateKey: (order) => order.created_at.slice(0, 10),
      notifications: [
        { id: "notif-1", title: "", body: "", data: { order_id: "order-1" }, read_at: null },
        { id: "notif-2", title: "", body: "", data: { order_id: "order-1" }, read_at: null },
        { id: "notif-3", title: "", body: "", data: { order_id: "order-2" }, read_at: "2026-07-01T11:00:00.000Z" },
      ] satisfies TokNotification[],
    });

    expect(counts.get("2026-06-30")).toBe(1);
    expect(counts.has("2026-07-01")).toBe(false);
  });

  it("supports reservation notifications from direct and generic entity metadata", () => {
    const counts = countUnreadOperationNotificationsByDate({
      kind: "reservation",
      items: [
        { id: "reservation-1", date: "2026-06-30" },
        { id: "reservation-2", date: "2026-07-01" },
      ],
      getItemId: (reservation) => reservation.id,
      getDateKey: (reservation) => reservation.date,
      notifications: [
        { id: "notif-1", title: "", body: "", data: { reservation_id: "reservation-1" }, read_at: null },
        {
          id: "notif-2",
          title: "",
          body: "",
          data: { entity_type: "reservation", entity_id: "reservation-2" },
          read_at: null,
        },
      ] satisfies TokNotification[],
    });

    expect(counts.get("2026-06-30")).toBe(1);
    expect(counts.get("2026-07-01")).toBe(1);
  });
});
