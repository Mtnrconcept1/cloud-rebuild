import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildCommercialDemoCrmRows,
  buildCommercialDemoPerformanceRows,
  buildCommercialDemoReviewReply,
  buildCommercialDemoReviewSeeds,
} from "@/lib/commercialDemoRestaurantTools";
import type { CommercialDemoSnapshot } from "@/lib/commercialDemoJourney";

const snapshot: CommercialDemoSnapshot = {
  session: {
    id: "11111111-1111-4111-8111-111111111111",
    demo_restaurant_id: "22222222-2222-4222-8222-222222222222",
    created_at: "2026-07-15T08:00:00.000Z",
  },
  demo_restaurant: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Restaurant Démo TOK",
    city: "Genève",
    cuisine_type: "Suisse",
    is_demo: true,
  },
  catalog_items: [],
  order: {
    id: "33333333-3333-4333-8333-333333333333",
    order_number: "DEMO-42",
    status: "preparing",
    version: 3,
    customer_name: "Sophie Martin",
    delivery_address: "18 rue de la Démonstration, Genève",
    items: [{ name: "Menu signature", quantity: 2, unit_amount_cents: 2450 }],
    total_amount_cents: 4900,
    payment_status: "test_paid",
    created_at: "2026-07-15T10:00:00.000Z",
  },
  mission: null,
  reservations: [{
    id: "44444444-4444-4444-8444-444444444444",
    reference: "RESA-DEMO-ABCDEF1234",
    reservation_date: "2026-07-15",
    reservation_time: "19:30:00",
    party_size: 4,
    customer_name: "Sophie Martin",
    customer_phone: "+41 79 000 00 00",
    notes: "Table calme",
    status: "confirmed",
    version: 2,
    created_at: "2026-07-15T09:00:00.000Z",
    updated_at: "2026-07-15T09:05:00.000Z",
  }],
  active_features: ["dashboard-plan-salle", "dashboard-performances", "dashboard-crm", "dashboard-avis"],
  events: [],
  allowed_actions: [],
};

describe("commercial demo restaurant tool adapters", () => {
  it("derives KPI rows only from the isolated demo snapshot", () => {
    const rows = buildCommercialDemoPerformanceRows(snapshot);
    expect(rows.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ total_amount: 49, status: "preparing" }),
    ]));
    expect(rows.reservations).toEqual(expect.arrayContaining([
      expect.objectContaining({ party_size: 4, status: "confirmed" }),
    ]));
    expect(rows.orders[0]?.metadata).toMatchObject({ commercial_demo: true, payment_mode: "stripe_test" });
    expect(rows.reviews).toHaveLength(3);
    expect(rows.reviews.every((review) => Number(review.rating) > 0)).toBe(true);
  });

  it("separates demo customers and excludes unpaid orders from CRM totals", () => {
    const anotherReservation = {
      ...snapshot.reservations[0],
      id: "55555555-5555-4555-8555-555555555555",
      reference: "RESA-DEMO-OTHER",
      customer_name: "Luca Bernasconi",
      customer_phone: "+41 79 000 00 01",
    };
    const rows = buildCommercialDemoCrmRows({
      ...snapshot,
      reservations: [...snapshot.reservations, anotherReservation],
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.total_matching_count === 2)).toBe(true);
    expect(rows.find((row) => row.full_name === "Sophie Martin")).toMatchObject({ total_orders: 1, total_reservations: 1, total_spent: 49 });
    expect(rows.find((row) => row.full_name === "Luca Bernasconi")).toMatchObject({ total_orders: 0, total_reservations: 1, total_spent: 0 });

    const unpaidRows = buildCommercialDemoCrmRows({
      ...snapshot,
      order: snapshot.order ? { ...snapshot.order, payment_status: "pending" } : null,
      reservations: [],
    });
    expect(unpaidRows).toEqual([]);
  });

  it("generates a deterministic zero-cost review reply without claiming a fix", () => {
    const reply = buildCommercialDemoReviewReply({
      rating: 8,
      comment: "Très bon repas, livraison à préciser",
      brandTone: "chaleureux",
    });
    expect(reply).toContain("livraison");
    expect(reply).toContain("Au plaisir");
    expect(reply.toLowerCase()).not.toContain("problème corrigé");
  });

  it("builds the CRM profile from demo orders and reservations", () => {
    const rows = buildCommercialDemoCrmRows(snapshot);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      full_name: "Sophie Martin",
      total_orders: 1,
      total_reservations: 1,
      total_spent: 49,
      preferred_channel: "mixed",
    });
  });

  it("creates session-scoped review identifiers without a production id", () => {
    const reviews = buildCommercialDemoReviewSeeds(snapshot);
    expect(reviews).toHaveLength(3);
    expect(reviews.every((review) => review.id.includes(snapshot.session.id))).toBe(true);
    expect(reviews.every((review) => review.restaurant_id === snapshot.demo_restaurant.id)).toBe(true);
  });

  it("keeps accounting sub-routes and billing away from live data hooks in demo", () => {
    const inflow = readFileSync("src/pages/dashboard/DashboardFacturesInflow.tsx", "utf8");
    const outflow = readFileSync("src/pages/dashboard/DashboardFacturesOutflow.tsx", "utf8");
    const billing = readFileSync("src/pages/dashboard/DashboardAccountBilling.tsx", "utf8");

    expect(inflow).toContain("return <CommercialDemoAccounting />");
    expect(inflow.indexOf("return <CommercialDemoAccounting />")).toBeLessThan(inflow.indexOf("function LiveDashboardFacturesInflow"));
    expect(outflow).toContain("return <CommercialDemoAccounting />");
    expect(outflow.indexOf("return <CommercialDemoAccounting />")).toBeLessThan(outflow.indexOf("function LiveDashboardFacturesOutflow"));
    expect(billing).toContain("return <CommercialDemoAccountBilling />");
    expect(billing.indexOf("return <CommercialDemoAccountBilling />")).toBeLessThan(billing.indexOf("function LiveDashboardAccountBilling"));
  });

  it("guards every direct production read in the adapted KPI, CRM, reviews and floor-plan screens", () => {
    const performance = readFileSync("src/pages/dashboard/DashboardPerformances.tsx", "utf8");
    const crm = readFileSync("src/components/crm/CustomerCrmDashboard.tsx", "utf8");
    const reviews = readFileSync("src/pages/dashboard/DashboardAvis.tsx", "utf8");
    const floorPlan = readFileSync("src/pages/dashboard/DashboardPlanSalle.tsx", "utf8");
    const ownerRestaurants = readFileSync("src/pages/dashboard/useOwnerRestaurants.ts", "utf8");
    const app = readFileSync("src/App.tsx", "utf8");
    const serviceBoard = readFileSync("src/components/floor-plan/ServiceBoard.tsx", "utf8");
    const billing = readFileSync("src/pages/dashboard/DashboardAccountBilling.tsx", "utf8");

    expect(performance).toContain("if (isCommercialDemo && commercialDemoFrame)");
    expect(crm).toContain("buildCommercialDemoCrmRows(commercialDemoFrame.snapshot)");
    expect(reviews).toContain("buildCommercialDemoReviewSeeds(commercialDemoFrame.snapshot)");
    expect(floorPlan).toContain("commercialDemoFrame.snapshot.reservations.map");
    expect(floorPlan).toContain("writeCommercialDemoToolState(commercialDemoFrame.config.sessionId, \"floor-plan-tables\"");
    expect(floorPlan).toContain("buildCommercialDemoFloorPlanAiResult");
    expect(floorPlan).toContain("selectedId={isCommercialDemo ? null : selectedId}");
    expect(floorPlan).toContain("`floor-plan-overrides:${referenceDate}`");
    expect(floorPlan).toContain('"floor-plan-reservation-statuses"');
    expect(reviews.indexOf("if (isCommercialDemo && commercialDemoFrame)")).toBeLessThan(
      reviews.indexOf("const response = await runRestaurantAgent"),
    );
    expect(serviceBoard).toContain('const canConfirm = primaryStatus === "pending"');
    expect(serviceBoard).toContain('const canSeat = primaryStatus === "confirmed" || primaryStatus === "arrived"');
    expect(billing).toContain('feature: "ai_support_chat"');
    expect(billing).toContain("Désactivé par l'admin");
    expect(ownerRestaurants.indexOf("if (isCommercialDemoFrame && commercialDemoFrame && effectiveDemoRestaurantId)")).toBeLessThan(
      ownerRestaurants.indexOf("let restaurantQuery = (supabase.from as any)(\"restaurants\")"),
    );
    expect(ownerRestaurants).toContain("useQuery<OwnedRestaurant[]>");
    expect(ownerRestaurants).toContain("socialLinks: null");
    expect(app).toContain('commercialDemoFrame?.surface === "restaurant" ? <DashboardPlanSalle /> : <DashboardPlanSalleV2 />');
  });
});
