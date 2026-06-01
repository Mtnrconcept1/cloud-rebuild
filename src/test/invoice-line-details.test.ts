import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildMonthOptions,
  getInvoiceDetailSourcePresentation,
  getPayoutInvoiceLinesTotal,
  getPayoutInvoiceOrderSubtotal,
  getPayoutInvoiceRoundingDelta,
  getPayoutInvoiceReservationSubtotal,
  getReservationFeeInvoiceLinesTotal,
} from "@/pages/admin/adminComptaShared";

describe("invoice line detail helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes payout subtotals, total, and rounding delta", () => {
    const lines = [
      {
        lineId: "reservation-1",
        lineType: "reservation" as const,
        source: "zero_attente" as const,
        reference: "RES-1",
        label: "Reservation Zero Attente",
        occurredAt: "2026-04-10T10:00:00.000Z",
        grossAmount: 50,
        rateApplied: 0.9,
        invoicedAmount: 45,
        tokCoveredMiamzAmount: 0,
      },
      {
        lineId: "order-1",
        lineType: "order" as const,
        source: "orders" as const,
        reference: "CMD-1",
        label: "Commande 1",
        occurredAt: "2026-04-11T10:00:00.000Z",
        grossAmount: 20,
        rateApplied: 0.9,
        invoicedAmount: 18,
        tokCoveredMiamzAmount: 0,
      },
    ];

    expect(getPayoutInvoiceReservationSubtotal(lines)).toBe(45);
    expect(getPayoutInvoiceOrderSubtotal(lines)).toBe(18);
    expect(getPayoutInvoiceLinesTotal(lines)).toBe(63);
    expect(getPayoutInvoiceRoundingDelta(64, lines)).toBe(1);
  });

  it("sums reservation-fee invoice lines", () => {
    const lines = [
      {
        reservationId: "res-1",
        reservationDate: "2026-04-02",
        reservationTime: "18:30:00",
        partySize: 2,
        status: "confirmed",
        cancelledBy: null,
        cancellationReasonCode: null,
        billingFeeChf: 5,
      },
      {
        reservationId: "res-2",
        reservationDate: "2026-04-03",
        reservationTime: "19:00:00",
        partySize: 4,
        status: "confirmed",
        cancelledBy: null,
        cancellationReasonCode: null,
        billingFeeChf: 7.5,
      },
    ];

    expect(getReservationFeeInvoiceLinesTotal(lines)).toBe(12.5);
  });

  it("exposes presentation labels for all invoice detail sources", () => {
    expect(getInvoiceDetailSourcePresentation("orders")).toMatchObject({ label: "Commande" });
    expect(getInvoiceDetailSourcePresentation("zero_attente")).toMatchObject({ label: "Zéro attente" });
    expect(getInvoiceDetailSourcePresentation("chefs_table")).toMatchObject({ label: "La Table du Chef" });
    expect(getInvoiceDetailSourcePresentation("flash_sales")).toMatchObject({ label: "Vente flash" });
    expect(getInvoiceDetailSourcePresentation("anti_gaspi")).toMatchObject({ label: "Anti-gaspi" });
    expect(getInvoiceDetailSourcePresentation("other")).toMatchObject({ label: "Autre" });
  });

  it("keeps month options anchored at the first day of the current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));

    expect(buildMonthOptions().map((option) => option.value)).toEqual([
      "2026-03",
      "2026-02",
      "2026-01",
      "2025-12",
      "2025-11",
      "2025-10",
    ]);
  });
});
