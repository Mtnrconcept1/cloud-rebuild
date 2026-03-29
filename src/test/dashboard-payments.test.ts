import { describe, expect, it } from "vitest";

import {
  buildRestaurantPaymentSummary,
  filterRestaurantPaymentEvents,
  formatRestaurantPaymentMethod,
  getRestaurantPaymentSignedAmount,
  matchesRestaurantPaymentStatusFilter,
  type RestaurantPaymentEvent,
} from "@/lib/dashboardPayments";

const EVENTS: RestaurantPaymentEvent[] = [
  {
    event_id: "charge-1",
    event_kind: "order_charge",
    direction: "received",
    occurred_at: "2026-03-28T10:00:00.000Z",
    amount: 42,
    currency: "chf",
    status: "succeeded",
    title: "Commande payee",
    subtitle: "TOK-1001",
    payment_method: "visa **** 4242",
    order_id: "order-1",
    campaign_id: null,
    invoice_id: null,
  },
  {
    event_id: "refund-1",
    event_kind: "order_refund",
    direction: "received",
    occurred_at: "2026-03-28T11:00:00.000Z",
    amount: 12,
    currency: "chf",
    status: "succeeded",
    title: "Remboursement client",
    subtitle: "TOK-1001",
    payment_method: "visa **** 4242",
    order_id: "order-1",
    campaign_id: null,
    invoice_id: null,
  },
  {
    event_id: "campaign-1",
    event_kind: "campaign_payment",
    direction: "issued",
    occurred_at: "2026-03-27T09:00:00.000Z",
    amount: 30,
    currency: "chf",
    status: "processing",
    title: "Campagne payee",
    subtitle: "Printemps",
    payment_method: "apple_pay",
    order_id: null,
    campaign_id: "campaign-1",
    invoice_id: null,
  },
  {
    event_id: "invoice-1",
    event_kind: "invoice_payment",
    direction: "issued",
    occurred_at: "2026-03-26T09:00:00.000Z",
    amount: 18,
    currency: "chf",
    status: "succeeded",
    title: "Facture reglee",
    subtitle: "FAC-2026-03-001",
    payment_method: null,
    order_id: null,
    campaign_id: null,
    invoice_id: "invoice-1",
  },
];

describe("buildRestaurantPaymentSummary", () => {
  it("computes totals from succeeded events only", () => {
    expect(buildRestaurantPaymentSummary(EVENTS)).toEqual({
      receivedCharges: 42,
      refunds: 12,
      issuedPayments: 18,
      netPlatform: 12,
    });
  });
});

describe("filterRestaurantPaymentEvents", () => {
  it("filters by direction and groups processing under pending", () => {
    expect(filterRestaurantPaymentEvents(EVENTS, "issued", "pending")).toHaveLength(1);
    expect(filterRestaurantPaymentEvents(EVENTS, "received", "succeeded")).toHaveLength(2);
  });
});

describe("payment helpers", () => {
  it("returns negative signed amounts for refunds and issued events", () => {
    expect(getRestaurantPaymentSignedAmount(EVENTS[0])).toBe(42);
    expect(getRestaurantPaymentSignedAmount(EVENTS[1])).toBe(-12);
    expect(getRestaurantPaymentSignedAmount(EVENTS[3])).toBe(-18);
  });

  it("formats payment methods and status filters", () => {
    expect(formatRestaurantPaymentMethod("apple_pay")).toBe("Apple Pay");
    expect(formatRestaurantPaymentMethod("visa **** 4242")).toBe("visa **** 4242");
    expect(matchesRestaurantPaymentStatusFilter("processing", "pending")).toBe(true);
  });
});
