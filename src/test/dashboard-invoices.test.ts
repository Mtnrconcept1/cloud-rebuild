import { describe, expect, it } from "vitest";

import { isInvoicePaid, splitInvoicesByPaymentState } from "@/lib/dashboardInvoices";

const INVOICES = [
  { id: "pending-1", status: "pending", amount_ttc: 25 },
  { id: "draft-1", status: "draft", amount_ttc: 10 },
  { id: "overdue-1", status: "overdue", amount_ttc: 18 },
  { id: "paid-1", status: "paid", amount_ttc: 40 },
  { id: "paid-2", status: "PAID", amount_ttc: 12 },
] as const;

describe("isInvoicePaid", () => {
  it("matches paid status case-insensitively", () => {
    expect(isInvoicePaid("paid")).toBe(true);
    expect(isInvoicePaid("PAID")).toBe(true);
    expect(isInvoicePaid(" pending ")).toBe(false);
    expect(isInvoicePaid(null)).toBe(false);
  });
});

describe("splitInvoicesByPaymentState", () => {
  it("keeps only unpaid invoices in actionable and moves paid invoices to history", () => {
    expect(splitInvoicesByPaymentState(INVOICES)).toEqual({
      actionable: [
        { id: "pending-1", status: "pending", amount_ttc: 25 },
        { id: "draft-1", status: "draft", amount_ttc: 10 },
        { id: "overdue-1", status: "overdue", amount_ttc: 18 },
      ],
      history: [
        { id: "paid-1", status: "paid", amount_ttc: 40 },
        { id: "paid-2", status: "PAID", amount_ttc: 12 },
      ],
    });
  });

  it("treats missing statuses as actionable", () => {
    expect(splitInvoicesByPaymentState([{ id: "x", status: null }])).toEqual({
      actionable: [{ id: "x", status: null }],
      history: [],
    });
  });
});
