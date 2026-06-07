import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const dispatchOrderSource = readFileSync(resolve(root, "supabase/functions/dispatch-order/index.ts"), "utf8");
const deliveryDispatchSource = readFileSync(resolve(root, "supabase/functions/_shared/delivery-dispatch.ts"), "utf8");

describe("dispatch service-role callback", () => {
  it("lets restaurant-order-status trigger dispatch-order with the service-role callback token", () => {
    expect(deliveryDispatchSource).toContain("apikey: serviceRoleKey");
    expect(deliveryDispatchSource).toContain('Authorization: `Bearer ${serviceRoleKey}`');
    expect(dispatchOrderSource).toContain("authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true })");
  });
});
