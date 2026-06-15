import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPayableInvoiceGroups,
  type PayableInvoiceLine,
} from "@/lib/payableInvoice";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const match = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  expect(match, `No migration contains ${pattern}`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, match || ""), "utf8");
}

describe("restaurant paid TOK purchase invoices", () => {
  it("records paid launch packs, subscriptions and credit packs as paid TOK payable invoices", () => {
    const webhook = read("supabase/functions/stripe-webhook/index.ts");

    expect(webhook).toContain("recordRestaurantTokPurchaseInvoiceIfMissing");
    expect(webhook).toContain('itemKind: "launch_pack"');
    expect(webhook).toContain('itemKind: "restaurant_subscription"');
    expect(webhook).toContain('itemKind: "credit_pack"');
    expect(webhook).toContain('status: "paid"');
    expect(webhook).toContain("stripe_checkout_session_id: session.id");
    expect(webhook).toContain("restaurant_invoices");
    expect(webhook).toContain("restaurant_invoice_line_items");
  });

  it("allows paid TOK purchase line kinds in restaurant invoice line items", () => {
    const migration = latestMigrationContaining(/launch_pack[\s\S]*restaurant_subscription[\s\S]*credit_pack/);

    expect(migration).toContain("restaurant_invoice_line_items_kind_check");
    expect(migration).toContain("'launch_pack'");
    expect(migration).toContain("'restaurant_subscription'");
    expect(migration).toContain("'credit_pack'");
    expect(migration).toContain("ALTER TABLE public.restaurant_invoice_line_items");
  });

  it("renders launch pack and restaurant subscription paid invoices in the payable invoice document", () => {
    const lines: PayableInvoiceLine[] = [
      {
        lineId: "line-launch-pack",
        itemKind: "launch_pack" as PayableInvoiceLine["itemKind"],
        sourceTable: "restaurant_launch_packs",
        sourceId: "restaurant-launch-pack-id",
        sourceLabel: "Pack de lancement TOK",
        occurredAt: "2026-06-15T10:00:00.000Z",
        quantity: 1,
        unitAmount: 490,
        baseAmount: 490,
        rateLabel: "Montant paye",
        rateValue: null,
        amountHt: 490,
        amountTva: 0,
        amountTtc: 490,
        metadata: { paid_to: "TOK" },
      },
      {
        lineId: "line-subscription",
        itemKind: "restaurant_subscription" as PayableInvoiceLine["itemKind"],
        sourceTable: "restaurant_ai_subscriptions",
        sourceId: "restaurant-subscription-id",
        sourceLabel: "Abonnement restaurateur TOK - pro",
        occurredAt: "2026-06-15T10:00:00.000Z",
        quantity: 1,
        unitAmount: 89,
        baseAmount: 89,
        rateLabel: "Montant paye",
        rateValue: null,
        amountHt: 89,
        amountTva: 0,
        amountTtc: 89,
        metadata: { paid_to: "TOK" },
      },
    ];

    expect(buildPayableInvoiceGroups(lines)).toEqual([
      expect.objectContaining({
        kind: "launch_pack",
        title: "Pack de lancement",
        baseLabel: "490,00 CHF",
        commissionLabel: "Montant paye",
        amountTtc: 490,
      }),
      expect.objectContaining({
        kind: "restaurant_subscription",
        title: "Abonnement restaurateur",
        baseLabel: "89,00 CHF",
        commissionLabel: "Montant paye",
        amountTtc: 89,
      }),
    ]);
  });

  it("keeps the payable invoice preview loadable when a legacy line kind is not recognized", () => {
    const lines = [
      {
        lineId: "line-legacy",
        itemKind: "legacy_payment_line",
        sourceTable: "payment_transactions",
        sourceId: "legacy-payment-id",
        sourceLabel: "Ancienne ligne de paiement TOK",
        occurredAt: "2026-06-15T10:00:00.000Z",
        quantity: 1,
        unitAmount: 89,
        baseAmount: 89,
        rateLabel: "Montant paye",
        rateValue: null,
        amountHt: 89,
        amountTva: 0,
        amountTtc: 89,
        metadata: { paid_to: "TOK" },
      },
    ] as unknown as PayableInvoiceLine[];

    expect(buildPayableInvoiceGroups(lines)).toEqual([
      expect.objectContaining({
        kind: "manual_adjustment",
        title: "Ajustements",
        quantityLabel: "1 ligne",
        baseLabel: "89,00 CHF",
        amountTtc: 89,
      }),
    ]);
  });
});
