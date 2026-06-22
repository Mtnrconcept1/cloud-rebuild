import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeFunction = readFileSync("supabase/functions/generate-campaign/index.ts", "utf8");
const dashboard = readFileSync("src/pages/dashboard/DashboardCampagnes.tsx", "utf8");

describe("generate-campaign AI optimization", () => {
  it("analyzes orders, reservations, products and hours before asking AI", () => {
    expect(edgeFunction).toContain('adminClient.from("orders").select("id, user_id, total_amount, status, created_at")');
    expect(edgeFunction).toContain('adminClient.from("reservations").select("date, time, party_size, status, feature, total_amount, created_at")');
    expect(edgeFunction).toContain('adminClient.from("order_items").select("order_id, menu_item_id, quantity, total_price, metadata")');
    expect(edgeFunction).toContain("buildProductPerformance(orderItemsRes.data || [], menu)");
    expect(edgeFunction).toContain("buildHourlyPerformance(completedOrders, reservations)");
  });

  it("returns automatic targeting, budget, schedule and factual optimization notes", () => {
    expect(edgeFunction).toContain('"target_criteria"');
    expect(edgeFunction).toContain('"starts_at"');
    expect(edgeFunction).toContain('"ends_at"');
    expect(edgeFunction).toContain('"optimization_notes"');
    expect(edgeFunction).toContain("deriveAudienceCriteria({ restaurant, avgTicket, categories, hourlyPerformance, completedOrders, reservations })");
    expect(edgeFunction).toContain("deriveSchedule({ hourlyPerformance");
  });

  it("applies the generated campaign plan in the dashboard form", () => {
    expect(dashboard).toContain("setTargetCriteria(normalizeAudienceCriteria(result.target_criteria))");
    expect(dashboard).toContain("setStartsAt(generatedStart)");
    expect(dashboard).toContain("setDurationDays(getDurationDays(generatedStart, generatedEnd))");
    expect(dashboard).toContain("Ciblage, budget et calendrier ont été optimisés automatiquement.");
  });
});
