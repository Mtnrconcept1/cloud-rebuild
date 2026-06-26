import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  getDefaultAdminHistoryFilters,
  normalizeOrderHistoryRow,
  normalizeReservationHistoryRow,
  orderMatchesSearchTerm,
  reservationMatchesSearchTerm,
} from "@/pages/admin/adminOrdersReservationsShared";

describe("admin orders and reservations helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes orders and matches search by item, client, and restaurant", () => {
    const order = normalizeOrderHistoryRow({
      id: "order-1",
      order_number: "CMD-2026-001",
      created_at: "2026-04-22T10:30:00.000Z",
      status: "paid",
      payment_status: "paid",
      total_amount: 42,
      delivery_address: "Rue Centrale 12, Lausanne",
      notes: "Sans oignons",
      restaurant_id: "resto-1",
      user_id: "user-1",
      metadata: { feature: "anti-gaspi" },
      restaurants: { id: "resto-1", name: "Chez Mario" },
      customer: {
        user_id: "user-1",
        full_name: "Alice Martin",
        phone: "+41790000000",
        city: "Lausanne",
        address: "Rue Centrale 12",
      },
      order_items: [
        {
          id: "item-1",
          quantity: 2,
          unit_price: 10,
          total_price: 20,
          metadata: { name: "Box antigaspi" },
          order_item_modifiers: [{ name: "Sauce piquante", quantity: 1, unit_price: 0 }],
        },
      ],
    });

    expect(order.customer.displayName).toBe("Alice Martin");
    expect(order.items[0].name).toBe("Box antigaspi");
    expect(order.orderType).toBe("anti_gaspi");
    expect(orderMatchesSearchTerm(order, "mario")).toBe(true);
    expect(orderMatchesSearchTerm(order, "sauce")).toBe(true);
    expect(orderMatchesSearchTerm(order, "alice")).toBe(true);
  });

  it("normalizes reservations with preorder fallback from metadata", () => {
    const profileMap = new Map([
      ["user-2", {
        id: "profile-2",
        user_id: "user-2",
        full_name: "Nadia Dupont",
        phone: "+41791111111",
        city: "Geneve",
        address: "Rue du Lac 3",
        avatar_url: null,
        created_at: "2026-04-01T00:00:00.000Z",
        current_tier: null,
        loyalty_points: 0,
        updated_at: "2026-04-01T00:00:00.000Z",
      }],
    ]);

    const reservation = normalizeReservationHistoryRow({
      id: "reservation-1",
      created_at: "2026-04-21T08:00:00.000Z",
      date: "2026-04-25",
      time: "19:00:00",
      reservation_time: "19:15:00",
      status: "confirmed",
      feature: "zero-attente",
      total_amount: 60,
      party_size: 3,
      notes: "Table pres de la fenetre",
      special_requests: "Anniversaire",
      order_reference: "RES-2026-001",
      payment_method: "card",
      billing_fee_chf: 5,
      metadata: {
        arrival_time: "19:30:00",
        preorder_items: [
          { name: "Menu degustation", quantity: 3, unit_price: 20, total_price: 60 },
        ],
      },
      preorder_items: [],
      restaurant_id: "resto-2",
      user_id: "user-2",
      restaurants: { id: "resto-2", name: "Le Jardin" },
    }, profileMap);

    expect(reservation.customer.displayName).toBe("Nadia Dupont");
    expect(reservation.displayTime).toBe("19:30:00");
    expect(reservation.preorderItems).toHaveLength(1);
    expect(reservation.preorderItems[0].name).toBe("Menu degustation");
    expect(reservationMatchesSearchTerm(reservation, "jardin")).toBe(true);
    expect(reservationMatchesSearchTerm(reservation, "anniversaire")).toBe(true);
  });

  it("builds the default 30-day date range in local date values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T10:00:00.000Z"));

    expect(getDefaultAdminHistoryFilters()).toEqual({
      startDate: "2026-03-24",
      endDate: "2026-04-22",
    });
  });

  it("uses the canonical reservations relation for reservation slot inventory", () => {
    const page = readFileSync("src/pages/admin/AdminOrdersReservations.tsx", "utf8");

    expect(page).toContain("reservations (");
    expect(page).not.toContain("réservations (");
  });
});
