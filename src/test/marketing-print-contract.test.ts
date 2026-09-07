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
  it("ships additive durable print commerce, SAV and fulfillment state", () => {
    const foundation = readRequired("supabase/migrations/20260907023000_marketing_print_foundation.sql");
    const operations = readRequired("supabase/migrations/20260907023100_marketing_print_operations.sql");

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
      "print_settings",
    ]) {
      expect(foundation).toContain(`public.${table}`);
    }

    expect(operations).toContain("public.print_reorders");
    expect(foundation).toContain("ENABLE ROW LEVEL SECURITY");
    expect(operations).toContain("ENABLE ROW LEVEL SECURITY");
    expect(foundation).toContain("print-production-files");
    expect(foundation).toContain("provider_reference");
    expect(foundation).toContain("provider_event_id");
    expect(foundation).toContain("next_attempt_at");
    expect(foundation).toContain("lease_token");
    expect(foundation).toContain("approved_at");
    expect(foundation).toContain("sha256");
    expect(foundation).toContain("md5");
    expect(foundation).toContain("finalize_paid_print_order");
    expect(operations).toContain("thetok-print-orchestrator");
    expect(operations).toContain("thetok-print-reconcile");
  });

  it("keeps provider credentials and wholesale economics server-only and fail-closed", () => {
    const cloudprinter = readRequired("supabase/functions/_shared/print/cloudprinter.ts");
    const pricing = readRequired("supabase/functions/_shared/print/pricing.ts");
    const secretWriter = readExisting("scripts/write-supabase-secrets-env.mjs");
    const workflow = readRequired(".github/workflows/sync-cloudprinter-secrets.yml");
    const vite = readExisting("vite.config.ts");

    expect(cloudprinter).toContain('Deno.env.get("CLOUDPRINTER_API_KEY")');
    expect(cloudprinter).toContain("CLOUDPRINTER_MODE");
    expect(cloudprinter).not.toContain("VITE_CLOUDPRINTER");
    expect(pricing).toContain("customerCurrency");
    expect(pricing).toContain("providerCostCents");
    expect(pricing).toContain("productVatCents");
    expect(secretWriter).toContain('"CLOUDPRINTER_API_KEY"');
    expect(secretWriter).toContain('"CLOUDPRINTER_WEBHOOK_API_KEY"');
    expect(secretWriter).toContain('"CLOUDPRINTER_MODE"');
    expect(secretWriter).toContain('ensureDefault(entries, "CLOUDPRINTER_MODE", "disabled")');
    expect(workflow).toContain("CLOUDPRINTER_API_KEY: ${{ secrets.CLOUDPRINTER_API_KEY }}");
    expect(workflow).toContain("CLOUDPRINTER_WEBHOOK_API_KEY: ${{ secrets.CLOUDPRINTER_WEBHOOK_API_KEY }}");
    expect(workflow).toContain("sandbox");
    expect(workflow).toContain("live");
    expect(workflow).not.toContain("VITE_CLOUDPRINTER_API_KEY");
    expect(vite).not.toContain("CLOUDPRINTER_API_KEY");
  });

  it("uses a provider-neutral print interface rather than Cloudprinter logic in React", () => {
    const provider = readRequired("supabase/functions/_shared/print/provider.ts");
    const shell = readRequired("src/components/dashboard/TokAiMarketingStudioPrintShell.tsx");
    const studio = readExisting("src/components/dashboard/TokAiMarketingStudio.tsx");
    const composer = readRequired("src/components/dashboard/marketing-print/PrintComposerDialog.tsx");
    const vite = readExisting("vite.config.ts");

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

    expect(shell).toContain("PrintComposerDialog");
    expect(shell).toContain("PrintOrdersPanel");
    expect(shell).toContain('from "./TokAiMarketingStudio"');
    expect(vite).toContain("TokAiMarketingStudioPrintShell.tsx");
    expect(studio).not.toContain("api.cloudprinter.com");
    expect(studio).not.toContain("CLOUDPRINTER_API_KEY");
    expect(composer).not.toContain("api.cloudprinter.com");
  });

  it("keeps print composition structured and validates it before checkout", () => {
    const document = readRequired("src/lib/print/document.ts");
    const preflight = readRequired("src/lib/print/preflight.ts");
    const proof = readRequired("src/components/dashboard/marketing-print/PrintProof.tsx");

    expect(document).toContain("MarketingPrintDocument");
    for (const field of ["background", "logo", "texts", "qr", "layout"]) {
      expect(document).toContain(field);
    }
    expect(preflight).toContain("runPrintPreflight");
    expect(preflight).toContain("blocking");
    expect(preflight).toContain("bleed");
    expect(preflight).toContain("safe");
    expect(preflight).toContain("resolution");
    expect(proof).toContain("approved");
    expect(proof).toContain("Ligne de coupe");
    expect(proof).toContain("Zone de sécurité");
  });

  it("generates immutable server-side print exports with physical PDF boxes, SSRF guard and hashes", () => {
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
    expect(pdf).toContain("PRINT_ASSET_MUST_BE_PERSISTED");
    expect(pdf).toContain("SUPABASE_URL");
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
    expect(pricing).toContain("providerCostCents");
    expect(pricing).toContain("productVatCents");
    expect(pricing).not.toContain("shippingVatCents +");
  });

  it("reuses payment_attempts and never submits Cloudprinter before Stripe finalizes", () => {
    const checkout = readRequired("supabase/functions/print-checkout/index.ts");
    const orchestrator = readRequired("supabase/functions/print-orchestrator/index.ts");
    const foundation = readRequired("supabase/migrations/20260907023000_marketing_print_foundation.sql");

    expect(checkout).toContain("acquirePaymentAttempt");
    expect(checkout).toContain('kind: "marketing_print_order"');
    expect(checkout).toContain("sealPaymentAttemptRequest");
    expect(checkout).toContain("bindPaymentAttemptStripe");
    expect(checkout).not.toContain("orders/add");
    expect(checkout).not.toContain("createOrder(");

    expect(orchestrator).toContain("payment_attempts");
    expect(orchestrator).toContain('row.kind === "marketing_print_order"');
    expect(orchestrator).toContain('row.state === "finalized"');
    expect(orchestrator).toContain("finalize_paid_print_order");
    expect(orchestrator).toContain("print_fulfillment_jobs");
    expect(orchestrator).toContain("assertProductionFlowAllowed");
    expect(orchestrator).toContain('order.payment_status !== "paid"');
    expect(foundation).toContain("v_attempt.kind <> 'marketing_print_order'");
    expect(foundation).toContain("v_attempt.state <> 'finalized'");
  });

  it("reconciles an ambiguous Cloudprinter create timeout before any create retry", () => {
    const provider = readRequired("supabase/functions/_shared/print/cloudprinter.ts");
    const orchestrator = readRequired("supabase/functions/print-orchestrator/index.ts");
    const reconcileInstruction = "const existing = await provider.getOrder(providerReference);";
    const createInstruction = "const createOrder = () => provider.createOrder({";

    expect(provider).toContain("/orders/add");
    expect(provider).toContain("/orders/info");
    expect(provider).toContain("Deliberately no automatic retry");
    expect(orchestrator).toContain(reconcileInstruction);
    expect(orchestrator).toContain(createInstruction);
    expect(orchestrator.indexOf(reconcileInstruction)).toBeLessThan(orchestrator.indexOf(createInstruction));
    expect(orchestrator).toContain("reconciled_after_ambiguous_create");
    expect(orchestrator).toContain("TOKP_");
  });

  it("authenticates and deduplicates CloudSignal before advancing a monotonic state", () => {
    const webhook = readRequired("supabase/functions/cloudprinter-webhook/index.ts");
    const foundation = readRequired("supabase/migrations/20260907023000_marketing_print_foundation.sql");

    expect(webhook).toContain("CLOUDPRINTER_WEBHOOK_API_KEY");
    expect(webhook).toContain("verifyCloudprinterWebhookApiKey");
    expect(webhook).toContain("record_print_provider_event");
    expect(webhook).toContain("provider_event_id");
    expect(webhook).toContain("ItemShipped");
    expect(webhook).toContain("ItemDeliveryCompleted");
    expect(webhook).toContain("tracking");
    expect(webhook).toContain("monotonic");
    expect(foundation).toContain("record_print_provider_event");
    expect(foundation).toContain("v_next_rank >= v_current_rank");
  });

  it("blocks demo identities and separates restaurant SAV intake from provider-cost reorders", () => {
    const orchestrator = readRequired("supabase/functions/print-orchestrator/index.ts");
    const reconcile = readRequired("supabase/functions/print-reconcile/index.ts");
    const action = readRequired("supabase/functions/print-order-action/index.ts");
    const admin = readRequired("supabase/functions/print-admin/index.ts");

    expect(orchestrator).toContain("assertProductionFlowAllowed");
    expect(reconcile).toContain("limit");
    expect(reconcile).toContain("getOrder");
    expect(action).toContain("cancelOrder");
    expect(action).toContain("reorder_requested");
    expect(action).not.toContain("provider.reorder(");
    expect(action).toContain("requireRestaurantAccess");
    expect(admin).toContain("getPrintProvider().cancelOrder");
    expect(admin).toContain("provider.reorder");
    expect(admin).toContain("print_reorders");
  });

  it("exposes restaurant tracking and an admin-only operational console", () => {
    const orders = readRequired("src/components/dashboard/marketing-print/PrintOrdersPanel.tsx");
    const details = readRequired("src/components/dashboard/marketing-print/PrintOrderDetails.tsx");
    const admin = readRequired("src/pages/admin/AdminPrintOrders.tsx");
    const adminShell = readRequired("src/pages/admin/AdminComptaPrintShell.tsx");
    const adminFn = readRequired("supabase/functions/print-admin/index.ts");
    const vite = readExisting("vite.config.ts");

    expect(orders).toContain("Mes impressions");
    expect(orders).toContain("pagination");
    expect(details).toContain("tracking");
    expect(details).toContain("annulation");
    expect(adminFn).toContain("requireRole");
    expect(adminFn).toContain('["admin"]');
    expect(adminFn).toContain("writeAuditLog");
    expect(admin).toContain("TheTok Print");
    expect(adminShell).toContain("AdminPrintOrders");
    expect(vite).toContain("AdminComptaPrintShell.tsx");
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
