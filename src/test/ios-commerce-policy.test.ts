import { describe, expect, it } from "vitest";

import {
  getTokOneIosProductId,
  isIosStripeCheckoutForbidden,
  TOK_ONE_IOS_MONTHLY_PRODUCT_ID,
  TOK_ONE_IOS_YEARLY_PRODUCT_ID,
} from "@/lib/iosCommerceFetch";

describe("iOS commerce policy", () => {
  it("routes Tok One periods to stable StoreKit product identifiers", () => {
    expect(getTokOneIosProductId("monthly")).toBe(TOK_ONE_IOS_MONTHLY_PRODUCT_ID);
    expect(getTokOneIosProductId("yearly")).toBe(TOK_ONE_IOS_YEARLY_PRODUCT_ID);
    expect(getTokOneIosProductId(undefined)).toBe(TOK_ONE_IOS_MONTHLY_PRODUCT_ID);
  });

  it.each([
    "restaurant-onboarding",
    "restaurant-subscription-upgrade",
    "restaurant-credit-pack",
    "campaign",
    "launch-pack",
  ])("blocks Stripe digital/SaaS checkout %s from native iOS", (kind) => {
    expect(isIosStripeCheckoutForbidden(kind)).toBe(true);
  });

  it.each([
    "order",
    "zero-attente",
    "chefs-table",
  ])("keeps physical-service checkout %s outside Apple IAP", (kind) => {
    expect(isIosStripeCheckoutForbidden(kind)).toBe(false);
  });
});
