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
});
