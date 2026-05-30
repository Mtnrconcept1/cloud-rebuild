import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("create-checkout subscription grouping", () => {
  it("groups meal subscription Stripe pricing by restaurant, delivery date and delivery time", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase", "functions", "create-checkout", "index.ts"),
      "utf8",
    );

    expect(source).toContain("getCheckoutItemPaymentGroupKey");
    expect(source).toContain("delivery_date");
    expect(source).toContain("delivery_time");
    expect(source).toContain("groupRestaurantId");
    expect(source).toContain("pointsByPaymentGroup");
    expect(source).toContain("flexByPaymentGroup");
  });
});
