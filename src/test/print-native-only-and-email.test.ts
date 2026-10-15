import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TheTok Print native-image output", () => {
  it("has no after-generation title, subtitle, price, CTA, or QR entry fields", () => {
    const composer = source("src/components/dashboard/marketing-print/PrintComposerDialog.tsx");
    for (const field of ["setTitle", "setSubtitle", "setPrice", "setCta", "setQrUrl"]) {
      expect(composer).not.toContain(field);
    }
    expect(composer).not.toContain('kind: "title"');
    expect(composer).not.toContain('kind: "price"');
    expect(composer).toContain("createMarketingPrintDocument");
    expect(composer).toContain("retouche de l'image par prompt");
  });

  it("rejects any added text, logo, or QR at the authoritative server renderer", () => {
    const pdf = source("supabase/functions/_shared/print/pdf.ts");
    expect(pdf).toContain("PRINT_NATIVE_IMAGE_ONLY");
    expect(pdf).toContain("record.texts != null && (!Array.isArray(record.texts) || record.texts.length !== 0)");
    expect(pdf).not.toContain("page.drawText(");
    expect(pdf).not.toContain("QRCode.create");
    expect(pdf).toContain("page.drawImage(background, { x: 0, y: 0");
    for (const box of ["TrimBox", "MediaBox", "BleedBox", "ArtBox"]) {
      expect(pdf).toContain(box);
    }
  });

  it("displays guides scaled independently to physical width and height", () => {
    const proof = source("src/components/dashboard/marketing-print/PrintProof.tsx");
    expect(proof).toContain("mediaWidthMm = product.widthMm + 2 * product.bleedMm");
    expect(proof).toContain("mediaHeightMm = product.heightMm + 2 * product.bleedMm");
    expect(proof).toContain("trimX");
    expect(proof).toContain("trimY");
    expect(proof).toContain("safeX");
    expect(proof).toContain("safeY");
    expect(proof).not.toContain("document.texts");
    expect(proof).not.toContain("document.qr");
  });

  it("passes generated imagery as an editing source and instructs model about bleed and safe zones", () => {
    const studio = source("src/components/dashboard/TokAiMarketingStudio.tsx");
    const generator = source("supabase/functions/ai-image-enhance/index.ts");
    expect(studio).toContain("sourceImageUrl: retouchSourceUrl || undefined");
    expect(studio).toContain("Retoucher cette image par prompt");
    expect(generator).toContain("printSafeMarginMm");
    expect(generator).toContain("marketingOutputFormat.bleedMm + printSafeMarginMm");
    expect(generator).toContain("sourceImageUrl ? [sourceImageUrl, ...referenceImageUrls]");
    expect(generator).toContain("MODE RETOUCHE");
  });
});

describe("TheTok Print payment-confirmed merchant documents", () => {
  it("queues both confirmation and itemized invoice once, including non-fiscal test orders", () => {
    const sql = source("supabase/migrations/20261015073400_print_order_receipts_and_invoices.sql");
    const orchestrator = source("supabase/functions/print-orchestrator/index.ts");
    const sandbox = source("supabase/functions/print-sandbox-complete/index.ts");
    expect(sql).toContain("ux_email_queue_print_order_email_key");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).toContain("print_email_retry_attempts");
    expect(sql).toContain("print_email_retry_after");
    expect(sql).toContain("queued_email.status = 'failed'");
    expect(sql).toContain("payment_status = 'paid'");
    expect(sql).toContain("u.email_confirmed_at IS NOT NULL");
    expect(sql).toContain("print_order_items");
    expect(sql).toContain("v_invoice_number");
    expect(sql).toContain("document sans valeur fiscale");
    expect(sql).toContain("CASE WHEN v_sandbox THEN 0 ELSE v_order.customer_amount_cents END");
    expect(sql).toContain("':confirmation'");
    expect(sql).toContain("':invoice'");
    expect(orchestrator).toContain('adminClient.rpc("queue_print_order_emails"');
    expect(sandbox).toContain('adminClient.rpc("queue_print_order_emails"');
    expect(orchestrator).toContain("email_queue_scan_failed");
    expect(sandbox).toContain("merchant_emails_queued");
  });
});
