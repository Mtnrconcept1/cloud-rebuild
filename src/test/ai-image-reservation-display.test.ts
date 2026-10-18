import { describe, expect, it } from "vitest";
import { getTokImageReservationDisplay } from "@/lib/tokCredits";
import { formatAiImageGenerationError } from "@/lib/publicErrorMessages";

describe("credit reservation display", () => {
  it("labels a reservation without changing its charged amount", () => {
    const entry = { source_table: "ai_usage_logs", description: "image_credit_reservation", credit_amount: 12, metadata: null };
    expect(getTokImageReservationDisplay(entry)?.label).toBe("Crédits réservés pour une image");
    expect(entry.credit_amount).toBe(12);
    expect(getTokImageReservationDisplay({ source_table: "ai_usage_logs", metadata: { billing_phase: "reserved", image_operation_id: "synthetic" } })?.label)
      .toBe("Crédits réservés pour une image");
  });
  it("keeps unrelated and completed ledger entries unchanged", () => {
    expect(getTokImageReservationDisplay({ source_table: "ai_usage_logs", description: "image_generation", metadata: { state: "completed" } })).toBeNull();
    expect(getTokImageReservationDisplay({ source_table: "payments", description: "image_credit_reservation" })).toBeNull();
    expect(getTokImageReservationDisplay({ source_table: "ai_usage_logs", description: "image_credit_reservation", metadata: { billing_phase: "released" } })).toBeNull();
  });
  it("describes an uncertain request without claiming a refund or a delivered image", () => {
    const message = formatAiImageGenerationError(new Error("image_operation_pending"));
    expect(message).toContain("crédits restent réservés");
    expect(message).not.toMatch(/rembours|livrée/);
  });
});
