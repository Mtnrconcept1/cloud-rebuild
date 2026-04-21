import { describe, expect, it } from "vitest";

import { buildAuthRedirectTarget, parseStripeReturnSearch } from "@/lib/stripeReturn";

describe("parseStripeReturnSearch", () => {
  it("detects successful Stripe returns with a checkout session", () => {
    expect(parseStripeReturnSearch("?session_id=cs_test_123&status=success")).toEqual({
      status: "success",
      sessionId: "cs_test_123",
      isStripeReturn: true,
    });
  });

  it("detects cancelled Stripe returns without requiring a checkout session", () => {
    expect(parseStripeReturnSearch("?status=cancelled")).toEqual({
      status: "cancelled",
      sessionId: null,
      isStripeReturn: true,
    });
  });

  it("ignores unrelated query strings", () => {
    expect(parseStripeReturnSearch("?tab=history")).toEqual({
      status: null,
      sessionId: null,
      isStripeReturn: false,
    });
  });
});

describe("buildAuthRedirectTarget", () => {
  it("preserves the full return path through auth", () => {
    expect(buildAuthRedirectTarget("/commandes", "?session_id=cs_test_123&status=success")).toBe(
      "/auth?redirect=%2Fcommandes%3Fsession_id%3Dcs_test_123%26status%3Dsuccess",
    );
  });
});
