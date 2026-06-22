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
    expect(edgeFunction).toContain('"pricing_strategy"');
    expect(edgeFunction).toContain('"channels"');
    expect(edgeFunction).toContain("deriveAudienceCriteria({ restaurant, avgTicket, categories, hourlyPerformance, completedOrders, reservations })");
    expect(edgeFunction).toContain("deriveSchedule({ hourlyPerformance");
  });

  it("sends every customizable campaign setting to the AI agent", () => {
    expect(dashboard).toContain("currentSettings");
    expect(dashboard).toContain("target_criteria: normalizeAudienceCriteria(targetCriteria)");
    expect(dashboard).toContain("base_budget: baseBudgetValue");
    expect(dashboard).toContain("total_budget: totalBudgetValue");
    expect(dashboard).toContain("budget_daily: dailyBudgetValue");
    expect(dashboard).toContain("duration_days: durationDays");
    expect(dashboard).toContain("pricing_strategy: strategy");
    expect(dashboard).toContain("creative: campaignCreative");
    expect(edgeFunction).toContain("normalizeRequestedCampaignSettings(requestBody?.currentSettings)");
    expect(edgeFunction).toContain("PARAMETRES PERSONNALISES SAISIS DANS LE FORMULAIRE");
    expect(edgeFunction).toContain("Utilise tous les parametres personnalises transmis");
    expect(edgeFunction).toContain("requested_settings: requestedSettings");
  });

  it("applies the generated campaign plan in the dashboard form", () => {
    expect(dashboard).toContain("setTargetCriteria(normalizeAudienceCriteria(result.target_criteria))");
    expect(dashboard).toContain("setStartsAt(generatedStart)");
    expect(dashboard).toContain("setDurationDays(getDurationDays(generatedStart, generatedEnd))");
    expect(dashboard).toContain("setPlacementSelection(normalizeCampaignPlacementSelection(result.channels");
    expect(dashboard).toContain("setSelectedStrategy(normalizeCampaignPricingStrategy(result.pricing_strategy");
    expect(dashboard).toContain("Objectif, emplacements, pages, ciblage, budget et calendrier ont été optimisés automatiquement.");
  });
});
