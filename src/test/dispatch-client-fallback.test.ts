import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("courier dispatch boundary", () => {
  it("keeps courier dispatch server-side without a browser fallback", () => {
    expect(existsSync(resolve(root, "src/lib/clientDispatch.ts"))).toBe(false);

    const dashboardOrders = readFileSync(resolve(root, "src/pages/dashboard/DashboardCommandes.tsx"), "utf8");
    const restaurantStatusFunction = readFileSync(resolve(root, "supabase/functions/restaurant-order-status/index.ts"), "utf8");
    const deliveryDispatch = readFileSync(resolve(root, "supabase/functions/_shared/delivery-dispatch.ts"), "utf8");

    expect(dashboardOrders).toContain('invokeSupabaseFunction("restaurant-order-status"');
    expect(restaurantStatusFunction).toContain("triggerDispatchOrder");
    expect(deliveryDispatch).toContain("/functions/v1/dispatch-order");
  });

  it("surfaces structured Edge diagnostics instead of raw Unauthorized dispatch errors", () => {
    const dashboardOrders = readFileSync(resolve(root, "src/pages/dashboard/DashboardCommandes.tsx"), "utf8");
    const restaurantStatusFunction = readFileSync(resolve(root, "supabase/functions/restaurant-order-status/index.ts"), "utf8");
    const dispatchFunction = readFileSync(resolve(root, "supabase/functions/dispatch-order/index.ts"), "utf8");
    const sendPushFunction = readFileSync(resolve(root, "supabase/functions/send-push/index.ts"), "utf8");
    const deliveryDispatch = readFileSync(resolve(root, "supabase/functions/_shared/delivery-dispatch.ts"), "utf8");

    expect(deliveryDispatch).toContain("diagnostic: parsedBody?.diagnostic");
    expect(restaurantStatusFunction).toContain("getEdgeErrorPayload");
    expect(dispatchFunction).toContain("getEdgeErrorPayload");
    expect(sendPushFunction).toContain("getEdgeErrorPayload");
    expect(dashboardOrders).toContain("getDispatchFailureMessage");
    expect(dashboardOrders).toContain("missing_authorization");
    expect(dashboardOrders).toContain("firebase_config_invalid");
    expect(dashboardOrders).toContain('code.startsWith("missing_")');
    expect(dashboardOrders).toContain("l'alerte livreur n'a pas pu etre envoyee");
    expect(dashboardOrders).toContain("notification push livreur est temporairement indisponible");
    expect(dashboardOrders).not.toContain("missing_secret");
    expect(dashboardOrders).not.toContain("dispatch-order a refuse");
    expect(dashboardOrders).not.toContain("secret service-role");
    expect(dashboardOrders).not.toContain("secret Edge Function");
    expect(dashboardOrders).not.toContain("FIREBASE_SERVICE_ACCOUNT");
    expect(dashboardOrders).not.toContain("const dispatchError = typeof data?.dispatch?.error");
  });

  it("creates an Operations Center retry signal when post-status dispatch fails", () => {
    const restaurantStatusFunction = readFileSync(resolve(root, "supabase/functions/restaurant-order-status/index.ts"), "utf8");

    expect(restaurantStatusFunction).toContain("upsertDispatchRetryAlert");
    expect(restaurantStatusFunction).toContain('.from("dispatch_jobs")');
    expect(restaurantStatusFunction).toContain('status: "no_courier"');
    expect(restaurantStatusFunction).toContain("marketplace_alert_states");
    expect(restaurantStatusFunction).toContain("marketplace_alert_state_history");
    expect(restaurantStatusFunction).toContain("dispatch:retry-required");
    expect(restaurantStatusFunction).toContain("/admin/commandes-reservations?dispatch=");
  });
});
