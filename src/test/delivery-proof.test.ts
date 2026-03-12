import { describe, expect, it } from "vitest";

import {
  buildDeliveryProofQrImageUrl,
  formatDeliveryProofCode,
  isValidDeliveryProofCode,
  normalizeDeliveryProofCode,
} from "@/lib/deliveryProof";

describe("delivery proof helpers", () => {
  it("normalizes proof codes to six digits", () => {
    expect(normalizeDeliveryProofCode("12 34-56")).toBe("123456");
    expect(normalizeDeliveryProofCode("123456789")).toBe("123456");
  });

  it("formats the fallback code for display", () => {
    expect(formatDeliveryProofCode("123456")).toBe("123 456");
  });

  it("validates complete proof codes only", () => {
    expect(isValidDeliveryProofCode("123456")).toBe(true);
    expect(isValidDeliveryProofCode("1234")).toBe(false);
  });

  it("builds a QR image URL from the proof code", () => {
    expect(buildDeliveryProofQrImageUrl("123456")).toContain("data=123456");
  });
});
