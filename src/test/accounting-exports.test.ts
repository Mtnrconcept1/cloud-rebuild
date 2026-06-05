import { describe, expect, it } from "vitest";

import {
  buildAccountingCsvRows,
  buildAccountingExportEntries,
  buildAccountingPeriodRange,
  buildAccountingStatementSummary,
} from "@/lib/accountingExports";

describe("accounting export helpers", () => {
  it("builds predefined accounting periods including since-registration", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");

    expect(buildAccountingPeriodRange("current_month", now)).toEqual({
      preset: "current_month",
      label: "Mois courant",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });

    expect(buildAccountingPeriodRange("current_quarter", now)).toEqual({
      preset: "current_quarter",
      label: "Trimestre courant",
      startDate: "2026-04-01",
      endDate: "2026-06-30",
    });

    expect(buildAccountingPeriodRange("since_registration", now)).toEqual({
      preset: "since_registration",
      label: "Depuis inscription",
      startDate: null,
      endDate: "2026-06-15",
    });
  });

  it("exports every accounting movement as a flat CSV journal for admin and restaurant views", () => {
    const sources = {
      orders: [
        {
          id: "order-1",
          created_at: "2026-06-10T10:00:00.000Z",
          total_amount: 100,
          payment_status: "paid",
          refunded_amount_chf: 10,
          refund_status: "refunded",
          refunded_at: "2026-06-12T10:00:00.000Z",
          status: "confirmed",
          order_number: "CMD-1",
          metadata: { type: "delivery", points_discount_amount: 5 },
          restaurant_id: "restaurant-1",
          restaurants: { name: "Bistro Test" },
        },
      ],
      reservations: [
        {
          id: "reservation-1",
          created_at: "2026-06-11T10:00:00.000Z",
          date: "2026-06-12",
          feature: "zero-attente",
          metadata: {},
          total_amount: 50,
          refunded_amount_chf: 0,
          refund_status: null,
          refunded_at: null,
          status: "confirmed",
          restaurant_id: "restaurant-1",
          restaurants: { name: "Bistro Test" },
        },
      ],
      reservationFees: [
        {
          id: "reservation-fee-1",
          restaurant_id: "restaurant-1",
          confirmed_at: "2026-06-11T11:00:00.000Z",
          billing_fee_chf: 6,
          cancelled_by: null,
          reservation_fee_invoice_id: null,
          restaurants: { name: "Bistro Test" },
        },
      ],
      paidCampaigns: [
        {
          id: "campaign-1",
          restaurant_id: "restaurant-1",
          created_at: "2026-06-13T10:00:00.000Z",
          payment_status: "paid",
          paid_amount: 20,
          total_budget: 25,
          title: "Campagne ete",
          restaurants: { name: "Bistro Test" },
        },
      ],
      invoices: [
        {
          id: "invoice-payout-1",
          restaurant_id: "restaurant-1",
          invoice_number: "PAYOUT-1",
          period_start: "2026-06-01",
          period_end: "2026-06-30",
          amount_ttc: 81,
          status: "pending",
          created_at: "2026-06-30T10:00:00.000Z",
          invoice_type: "payout",
          restaurants: { name: "Bistro Test" },
        },
        {
          id: "invoice-payable-1",
          restaurant_id: "restaurant-1",
          invoice_number: "TOK-1",
          period_start: "2026-06-01",
          period_end: "2026-06-30",
          amount_ttc: 15,
          status: "paid",
          created_at: "2026-06-30T11:00:00.000Z",
          invoice_type: "payable",
          restaurants: { name: "Bistro Test" },
        },
      ],
    };

    const adminEntries = buildAccountingExportEntries({
      perspective: "admin",
      sources,
    });
    const restaurantEntries = buildAccountingExportEntries({
      perspective: "restaurant",
      sources,
    });

    expect(adminEntries.map((entry) => [entry.direction, entry.category, entry.amount])).toEqual([
      ["inflow", "Commission commande", 9.5],
      ["outflow", "Reversement commande", 85.5],
      ["outflow", "Miamz pris en charge", 5],
      ["outflow", "Remboursement commande", 10],
      ["inflow", "Commission reservation", 5],
      ["outflow", "Reversement reservation", 45],
      ["inflow", "Frais reservation", 6],
      ["inflow", "Campagne publicitaire", 20],
      ["outflow", "Facture de reversement", 81],
      ["inflow", "Facture TOK", 15],
    ]);

    expect(restaurantEntries.map((entry) => [entry.direction, entry.category, entry.amount])).toContainEqual([
      "inflow",
      "Reversement commande",
      85.5,
    ]);
    expect(restaurantEntries.map((entry) => [entry.direction, entry.category, entry.amount])).toContainEqual([
      "outflow",
      "Commission commande",
      9.5,
    ]);

    const csvRows = buildAccountingCsvRows(adminEntries);
    expect(csvRows[0]).toEqual([
      "Date",
      "Sens",
      "Categorie",
      "Libelle",
      "Restaurant",
      "Reference",
      "Montant CHF",
      "Statut",
      "Source",
    ]);
    expect(csvRows).toContainEqual([
      "2026-06-10",
      "Entree",
      "Commission commande",
      "Commission TOK 10% - Commandes",
      "Bistro Test",
      "CMD-1",
      "9.50",
      "confirmed",
      "orders",
    ]);
  });

  it("builds balance sheet and income statement figures from the same entries", () => {
    const entries = [
      {
        date: "2026-06-01",
        direction: "inflow" as const,
        category: "Commission commande",
        label: "Commission TOK",
        restaurantName: "Bistro Test",
        reference: "CMD-1",
        amount: 10,
        status: "confirmed",
        source: "orders",
        statementClass: "income" as const,
      },
      {
        date: "2026-06-01",
        direction: "outflow" as const,
        category: "Reversement commande",
        label: "Part restaurant",
        restaurantName: "Bistro Test",
        reference: "CMD-1",
        amount: 90,
        status: "confirmed",
        source: "orders",
        statementClass: "expense" as const,
      },
      {
        date: "2026-06-30",
        direction: "inflow" as const,
        category: "Facture TOK",
        label: "Facture TOK",
        restaurantName: "Bistro Test",
        reference: "TOK-1",
        amount: 20,
        status: "pending",
        source: "restaurant_invoices",
        statementClass: "asset" as const,
      },
      {
        date: "2026-06-30",
        direction: "outflow" as const,
        category: "Facture de reversement",
        label: "Facture de reversement",
        restaurantName: "Bistro Test",
        reference: "PAYOUT-1",
        amount: 50,
        status: "paid",
        source: "restaurant_invoices",
        statementClass: "liability" as const,
      },
    ];

    expect(buildAccountingStatementSummary(entries)).toEqual({
      incomeTotal: 10,
      expenseTotal: 90,
      resultTotal: -80,
      openReceivableTotal: 20,
      openPayableTotal: 0,
      balanceNetTotal: 20,
    });
  });
});
