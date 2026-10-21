import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { getNotificationTarget, getNotificationBadgeCountForRoute } from "@/lib/notificationRouting";
import { createRealtimeNotificationManager } from "@/lib/realtimeNotifications";

function receive(type: string, data: Record<string, unknown>) {
  const handlers = new Map<string, (payload: { new?: unknown }) => void>();
  const channel = {
    on: (_: string, filter: { event: string }, callback: (payload: { new?: unknown }) => void) => {
      handlers.set(filter.event, callback);
      return channel;
    },
    subscribe: () => channel,
  };
  const invalidateQueries = vi.fn();
  const manager = createRealtimeNotificationManager({ client: { channel: () => channel, removeChannel: vi.fn() } });
  const release = manager.retain("user-1", { queryClient: { invalidateQueries } as unknown as QueryClient });
  handlers.get("INSERT")?.({ new: { id: "alert-1", title: "Alerte", body: "Action disponible", type, data } });
  release();
  return invalidateQueries;
}

describe("business notification destinations and live views", () => {
  it("routes Golden TOK by the currently selected role", () => {
    expect(getNotificationTarget({ type: "golden_tok" }, "admin")).toBe("/admin/drops");
    expect(getNotificationTarget({ type: "golden_tok" }, "restaurateur")).toBe("/dashboard/formules");
    expect(getNotificationTarget({ type: "golden_tok", data: { url: "/admin/drops" } }, "client")).toBe("/notifications");
    expect(getNotificationTarget({ type: "golden_tok", data: { url: "/admin/drops" } }, "commercial")).toBe("/commercial/notifications");
  });
  it("routes signup and restaurant billing without relying on an arbitrary payload URL", () => {
    expect(getNotificationTarget({ type: "signup_application" }, "admin")).toBe("/admin/utilisateurs?tab=applications");
    expect(getNotificationTarget({ type: "signup_application" }, "client")).toBe("/auth");
    expect(getNotificationTarget({ type: "restaurant_subscription" }, "restaurateur")).toBe("/dashboard/mon-compte-facturation");
    expect(getNotificationTarget({ type: "restaurant_subscription" }, "admin")).toBe("/admin/restaurants");
    expect(getNotificationTarget({ type: "restaurant_subscription", data: { url: "/admin/restaurants" } }, "client")).toBe("/notifications");
  });
  it("counts the Golden TOK admin menu badge on the actual review page", () => {
    expect(getNotificationBadgeCountForRoute([{ type: "golden_tok" }], "/admin/drops", "admin")).toBe(1);
  });
  it("refreshes the admin application list when a new Golden TOK alert arrives", () => {
    const invalidate = receive("golden_tok", { recipient_role: "admin", restaurant_id: "restaurant-1" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-golden-tok-applications"] });
  });
  it("refreshes the restaurant entitlement and offer list after a decision", () => {
    const invalidate = receive("golden_tok", { recipient_role: "restaurateur", restaurant_id: "restaurant-1" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["golden-tok-accreditation", "restaurant-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["golden-tok-formulas", "restaurant-1"] });
  });
  it("refreshes signup decisions and subscription self-service", () => {
    const signup = receive("signup_application", { recipient_role: "applicant" });
    expect(signup).toHaveBeenCalledWith({ queryKey: ["signup-application", "user-1"] });
    const admin = receive("signup_application", { recipient_role: "admin" });
    expect(admin).toHaveBeenCalledWith({ queryKey: ["admin-signup-applications"] });
    const billing = receive("restaurant_subscription", { recipient_role: "restaurateur", restaurant_id: "restaurant-1" });
    expect(billing).toHaveBeenCalledWith({ queryKey: ["restaurant-subscription-self-service", "restaurant-1"] });
  });
  it("leaves unrelated alerts on the existing two notification caches", () => {
    expect(receive("other", {}).mock.calls).toHaveLength(2);
  });
  it("builds administrator notification emails on the canonical admin host", () => {
    const worker = readFileSync(resolve(process.cwd(), "supabase/functions/send-email/index.ts"), "utf8");
    expect(worker).toContain('data.recipient_role === "admin"');
    expect(worker).toContain('"https://admin.thetok.ch"');
  });
});
