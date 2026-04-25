import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  getRemainingRefundAmount,
  getStripeRefundReason,
  normalizeRefundTargetType,
  pickFirstNonEmptyString,
} from "./refund-utils.ts";

Deno.test("normalizeRefundTargetType only accepts supported targets", () => {
  assertEquals(normalizeRefundTargetType("order"), "order");
  assertEquals(normalizeRefundTargetType("reservation"), "reservation");
  assertEquals(normalizeRefundTargetType(" campaign "), null);
});

Deno.test("getRemainingRefundAmount never returns a negative amount", () => {
  assertEquals(getRemainingRefundAmount(42, 0), 42);
  assertEquals(getRemainingRefundAmount("42", "7.5"), 34.5);
  assertEquals(getRemainingRefundAmount(10, 12), 0);
});

Deno.test("getStripeRefundReason only maps customer cancellations", () => {
  assertEquals(getStripeRefundReason("customer"), "requested_by_customer");
  assertEquals(getStripeRefundReason("restaurant"), undefined);
});

Deno.test("pickFirstNonEmptyString returns the first non-empty trimmed string", () => {
  assertEquals(pickFirstNonEmptyString(null, "  ", " reason "), "reason");
  assertEquals(pickFirstNonEmptyString(undefined, false, 1), null);
});

