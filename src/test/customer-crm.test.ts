import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCustomerCrmInsights,
  getPreferredHourLabel,
  normalizeCustomerCrmProfile,
} from "@/lib/customerCrm";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("customer CRM", () => {
  it("normalizes CRM rows from the Supabase RPC", () => {
    const profile = normalizeCustomerCrmProfile({
      user_id: "user-1",
      first_name: "Lea",
      last_name: "Martin",
      full_name: "",
      email: "lea@example.test",
      phone: "+41790000000",
      total_orders: "4",
      total_reservations: 2,
      total_spent: "184.50",
      avg_order_value: "46.125",
      favorite_order_hour: "12",
      favorite_reservation_hour: 20,
      favorite_items: [
        { label: "Pizza napolitaine", category: "Pizzas", quantity: "3", orders: "2" },
        { label: "", quantity: 1 },
      ],
      favorite_cuisines: ["Italien", "", "Bistro"],
      preferred_channel: "mixed",
      preferred_service: "lunch",
      crm_score: "82",
      total_matching_count: "14",
    });

    expect(profile.fullName).toBe("lea@example.test");
    expect(profile.totalOrders).toBe(4);
    expect(profile.totalSpent).toBe(184.5);
    expect(profile.favoriteOrderHour).toBe(12);
    expect(profile.favoriteItems).toEqual([
      { label: "Pizza napolitaine", category: "Pizzas", quantity: 3, orders: 2 },
    ]);
    expect(profile.favoriteCuisines).toEqual(["Italien", "Bistro"]);
    expect(profile.crmScore).toBe(82);
    expect(profile.totalMatchingCount).toBe(14);
  });

  it("builds useful sales insights from habits and preferences", () => {
    const profile = normalizeCustomerCrmProfile({
      user_id: "user-2",
      full_name: "Sam Client",
      total_orders: 6,
      total_reservations: 1,
      total_spent: 420,
      favorite_items: [{ label: "Burger maison", quantity: 5, orders: 3 }],
      favorite_cuisines: ["Americain"],
      preferred_channel: "orders",
      preferred_service: "dinner",
      preferred_weekday: 5,
      favorite_order_hour: 19,
      crm_score: 91,
      last_activity_at: new Date().toISOString(),
    });

    const insights = buildCustomerCrmInsights(profile);

    expect(insights.segments).toContain("Client prioritaire");
    expect(insights.segments).toContain("Forte valeur");
    expect(insights.habitSummary).toContain("vendredi");
    expect(insights.habitSummary).toContain("19h");
    expect(insights.salesAngle).toContain("Americain");
    expect(insights.nextBestActions.join(" ")).toContain("Burger maison");
    expect(getPreferredHourLabel(7)).toBe("07h");
  });

  it("guards CRM access server-side and seeds feature flags", () => {
    const migration = readSource("supabase/migrations/20260616164131_customer_crm_profiles.sql");
    const app = readSource("src/App.tsx");

    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("public.auth_is_admin()");
    expect(migration).toContain("public.auth_owns_restaurant(p_restaurant_id)");
    expect(migration).toContain("LEFT JOIN auth.users");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.get_customer_crm_profiles");
    expect(migration).toContain("'dashboard-crm'");
    expect(migration).toContain("'admin-crm'");

    expect(app).toContain('path="/dashboard/crm"');
    expect(app).toContain('path="/admin/crm"');
  });
});
