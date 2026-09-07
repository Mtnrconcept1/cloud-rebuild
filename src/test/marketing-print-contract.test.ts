import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function projectPath(path: string) {
  return resolve(root, path);
}

function readRequired(path: string) {
  const absolute = projectPath(path);
  expect(existsSync(absolute), `${path} must exist`).toBe(true);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

function readExisting(path: string) {
  return readFileSync(projectPath(path), "utf8");
}

describe("TheTok Print foundation contracts", () => {
  it("ships one additive print migration with durable commerce, fulfillment and provider-event tables", () => {
    const migration = readRequired(
      "supabase/migrations/20260907023000_marketing_print_foundation.sql",
    );

    for (const table of [
      "print_products",
      "print_provider_products",
      "print_documents",
      "print_exports",
      "print_quotes",
      "print_orders",
      "print_order_items",
      "print_order_events",
      "print_provider_events",
      "print_fulfillment_jobs",
    ]) {
      expect(migration).toContain(`public.${table}`);
    }

    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("print-production-files");
    expect(migration).toContain("provider_reference");
    expect(migration).toContain("provider_event_id");
    expect(migration).toContain("UNIQUE");
    expect(migration).toContain("next_attempt_at");
    expect(migration).toContain("lease_token");
    expect(migration).toContain("approved_at");
    expect(migration).toContain("sha256");
    expect(migration).toContain("md5");
  });

  it("keeps provider credentials and wholesale economics server-only", () => {
    const cloudprinter = readRequired("supabase/functions/_shared/print/cloudprinter.ts");
    const pricing = readRequired("supabase/functions/_shared/print/pricing.ts");
    const secretWriter = readExisting("scripts/write-supabase-secrets-env.mjs");
    const workflow = readExisting(".github/workflows/deploy-production.yml");

    expect(cloudprinter).toContain('Deno.env.get("CLOUDPRINTER_API_KEY")');
    expect(cloudprinter).not.toContain("VITE_CLOUDPRINTER");
    expect(pricing).toContain("customer");
    expect(pricing).toContain("provider");
    expect(secretWriter).toContain('"CLOUDPRINTER_API_KEY"');
    expect(secretWriter).toContain('"CLOUDPRINTER_WEBHOOK_API_KEY"');
    expect(secretWriter).toContain('"CLOUDPRINTER_MODE"');
    expect(workflow).toContain("CLOUDPRINTER_API_KEY: ${{ secrets.CLOUDPRINTER_API_KEY }}");
    expect(workflow).toContain(
      "CLOUDPRINTER_WEBHOOK_API_KEY: ${{ secrets.CLOUDPRINTER_WEBHOOK_API_KEY }}",
    );
    expect(workflow).not.toContain("VITE_CLOUDPRINTER_API_KEY");
  });

  it("uses a provider-neutral print interface rather than Cloudprinter logic in React", () => {
    const provider = readRequired("supabase/functions/_shared/print/provider.ts");
    const studio = readExisting("src/components/dashboard/TokAiMarketingStudio.tsx");
    const composer = readRequired(
      "src/components/dashboard/marketing-print/PrintComposerDialog.tsx",
    );

    for (const operation of [
      "getProducts",
      "getProduct",
      "getPrice",
      "getQuote",
      "createOrder",
      "getOrder",
      "cancelOrder",
      "reorder",
    ]) {
      expect(provider).toContain(operation);
    }

    expect(studio).toContain("PrintComposerDialog");
    expect(studio).not.toContain("api.cloudprinter.com");
    expect(studio).not.toContain("CLOUDPRINTER_API_KEY");
    expect(composer).not.toContain("api.cloudprinter.com");
  });

  it("keeps print composition structured and validates it before checkout", () => {
    const document = readRequired("src/lib/print/document.ts");
    const preflight = readRequired("src/lib/print/preflight.ts");
    const proof = readRequired("src/components/dashboard/marketing-print/PrintProof.tsx");

    expect(document).toContain("MarketingPrintDocument");
    for (const field of ["background", "logo", "texts", "qr", "layout"] ) {
      expect(document).toContain(field);
    }
    expect(preflight).toContain("runPrintPreflight");
    expect(preflight).toContain("blocking");
    expect(preflight).toContain("bleed");
    expect(preflight).toContain("safe");
    expect(preflight).toContain("resolution");
    expect(proof).toContain("approved");
  });

  it("generates immutable server-side print exports with physical PDF boxes and file hashes", () => {
    const exportFn = readRequired("supabase/functions/print-export/index.ts");
    const pdf = readRequired("supabase/functions/_shared/print/pdf.ts");

    expect(exportFn).toContain("requireRestaurantAccess");
    expect(exportFn).toContain("print_exports");
    expect(exportFn).toContain("sha256");
    expect(exportFn).toContain("md5");
    expect(pdf).toContain("MediaBox");
    expect(pdf).toContain("TrimBox");
    expect(pdf).toContain("BleedBox");
    expect(pdf).toContain("CropBox");
  });

  it("recalculates Cloudprinter quote and retail CHF price on the server", () => {
    const quoteFn = readRequired("supabase/functions/print-quote/index.ts");
    const pricing = readRequired("supabase/functions/_shared/print/pricing.ts");

    expect(quoteFn).toContain("requireRestaurantAccess");
    expect(quoteFn).toContain("getQuote");
    expect(quoteFn).toContain("print_quotes");
    expect(quoteFn).not.toContain("body.total");
    expect(pricing).toContain("CHF");
    expect(pricing).toContain("margin");
    expect(pricing).toContain("provider");
  });

  it("reuses payment_attempts and never fulfills a print order before Stripe finalizes it", () => {
    const checkout = readRequired("supabase/functions/print-checkout/index.ts");
    const orchestrator = readRequired("supabase/functions/print-orchestrator/index.ts");
    const stripeWebhook = readExisting("supabase/functions/stripe-webhook/index.ts");

    expect(checkout).toContain("acquirePaymentAttempt");
    expect(checkout).toContain('kind: "marketing_print_order"');
    expect(checkout).toContain("sealPaymentAttemptRequest");
    expect(checkout).toContain("bindPaymentAttemptStripe");
    expect(checkout).not.toContain("orders/add");

    expect(stripeWebhook).toContain('"marketing_print_order"');
    expect(stripeWebhook).toContain("print_fulfillment_jobs");

    expect(orchestrator).toContain("print_fulfillment_jobs");
    expect(orchestrator).toContain("assertProductionFlowAllowed");
    expect(orchestrator).toContain('payment_status');
    expect(orchestrator).toContain('"paid"');
  });

  it("reconciles an ambiguous Cloudprinter create timeout before any create retry", () => {
    const provider = readRequired("supabase/functions/_shared/print/cloudprinter.ts");
    const orchestrator = readRequired("supabase/functions/print-orchestrator/index.ts");

    expect(provider).toContain("/orders/add");
    expect(provider).toContain("/orders/info");
    expect(orchestrator).toContain("getOrder");
    expect(orchestrator).toContain("createOrder");
    expect(orchestrator.indexOf("getOrder")).toBeLessThan(orchestrator.lastIndexOf("createOrder"));
    expect(orchestrator).toContain("TOKP_");
  });

  it("authenticates and deduplicates CloudSignal before advancing a monotonic order state", () => {
    const webhook = readRequired("supabase/functions/cloudprinter-webhook/index.ts");

    expect(webhook).toContain("CLOUDPRINTER_WEBHOOK_API_KEY");
    expect(webhook).toContain("print_provider_events");
    expect(webhook).toContain("provider_event_id");
    expect(webhook).toContain("ItemShipped");
    expect(webhook).toContain("ItemDeliveryCompleted");
    expect(webhook).toContain("tracking");
    expect(webhook).toContain("monotonic");
  });

  it("blocks demo identities and supports bounded reconciliation, cancel and reorder", () => {
    const orchestrator = readRequired("supabase/functions/print-orchestrator/index.ts");
    const reconcile = readRequired("supabase/functions/print-reconcile/index.ts");
    const action = readRequired("supabase/functions/print-order-action/index.ts");

    expect(orchestrator).toContain("assertProductionFlowAllowed");
    expect(reconcile).toContain("limit");
    expect(reconcile).toContain("getOrder");
    expect(action).toContain("cancelOrder");
    expect(action).toContain("reorder");
    expect(action).toContain("requireRestaurantAccess");
  });

  it("exposes restaurant tracking and an admin-only operational console", () => {
    const orders = readRequired(
      "src/components/dashboard/marketing-print/PrintOrdersPanel.tsx",
    );
    const details = readRequired(
      "src/components/dashboard/marketing-print/PrintOrderDetails.tsx",
    );
    const admin = readRequired("src/pages/admin/AdminPrintOrders.tsx");
    const adminFn = readRequired("supabase/functions/print-admin/index.ts");

    expect(orders).toContain("Mes impressions");
    expect(orders).toContain("pagination");
    expect(details).toContain("tracking");
    expect(details).toContain("annulation");
    expect(adminFn).toContain("requireRole");
    expect(adminFn).toContain('"admin"');
    expect(adminFn).toContain("writeAuditLog");
    expect(admin).toContain("Print");
  });

  it("registers every print Edge Function with handler-owned authentication", () => {
    const config = readExisting("supabase/config.toml");

    for (const name of [
      "print-catalog",
      "print-export",
      "print-quote",
      "print-checkout",
      "print-orchestrator",
      "cloudprinter-webhook",
      "print-reconcile",
      "print-order-action",
      "print-admin",
    ]) {
      expect(config).toContain(`[functions.${name}]`);
      expect(config).toContain(`[functions.${name}]\nverify_jwt = false`);
    }
  });
});
