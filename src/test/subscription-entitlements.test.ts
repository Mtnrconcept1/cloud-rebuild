import { describe, expect, it } from "vitest";

import {
  TOK_ONE_DEFAULT_BENEFITS,
  buildSubscriptionBenefitRows,
  buildTokOneEntitlements,
  type SubscriptionBenefitInput,
} from "@/lib/subscriptionEntitlements";
import {
  resolveTokOneFreeDeliveryMinOrderForContext,
  type TokOneBenefit,
  type TokOnePlan,
} from "@/hooks/useTokOne";

describe("subscriptionEntitlements", () => {
  it("uses app-copy defaults when no subscription benefits are configured", () => {
    const entitlements = buildTokOneEntitlements({ plan: null, benefits: [] });

    expect(entitlements.discountPercent).toBe(20);
    expect(entitlements.freeDeliveryMinOrder).toBe(0);
    expect(entitlements.flags.chefTablePriority).toBe(true);
    expect(entitlements.flags.flashEarlyAccess).toBe(true);
    expect(entitlements.flags.prioritySupport).toBe(true);
    expect(entitlements.displayBenefits.map((benefit) => benefit.id)).toEqual(
      TOK_ONE_DEFAULT_BENEFITS.map((benefit) => benefit.id),
    );
  });

  it("uses configured financial benefits over defaults", () => {
    const benefits: SubscriptionBenefitInput[] = [
      { benefit_type: "discount_percentage", value: { percentage: 12 } },
      { benefit_type: "free_delivery", value: { min_order: 30 } },
    ];

    const entitlements = buildTokOneEntitlements({
      plan: { free_delivery_min_order: 15 },
      benefits,
    });

    expect(entitlements.discountPercent).toBe(12);
    expect(entitlements.freeDeliveryMinOrder).toBe(30);
  });

  it("turns off a non-financial entitlement when explicitly disabled", () => {
    const entitlements = buildTokOneEntitlements({
      plan: null,
      benefits: [{ benefit_type: "priority_support", value: { enabled: false } }],
    });

    expect(entitlements.flags.prioritySupport).toBe(false);
    expect(entitlements.displayBenefits.find((benefit) => benefit.id === "priority_support")?.enabled).toBe(false);
  });

  it("builds subscription benefit rows for admin saves", () => {
    expect(
      buildSubscriptionBenefitRows("plan-1", {
        discountPercent: 15,
        freeDeliveryMinOrder: 25,
        chefTablePriority: true,
        flashEarlyAccess: true,
        prioritySupport: false,
        surpriseOffers: true,
      }),
    ).toEqual([
      { plan_id: "plan-1", benefit_type: "discount_percentage", value: { percentage: 15 } },
      { plan_id: "plan-1", benefit_type: "free_delivery", value: { min_order: 25 } },
      { plan_id: "plan-1", benefit_type: "chef_table_priority", value: { enabled: true } },
      { plan_id: "plan-1", benefit_type: "flash_early_access", value: { enabled: true } },
      { plan_id: "plan-1", benefit_type: "priority_support", value: { enabled: false } },
      { plan_id: "plan-1", benefit_type: "surprise_offers", value: { enabled: true } },
    ]);
  });

  it("treats explicit Tok One free delivery threshold 0 as immediate eligibility", () => {
    const plan = { free_delivery_min_order: 25 } as TokOnePlan;
    const benefits = [
      {
        id: "benefit-1",
        plan_id: "plan-1",
        benefit_type: "free_delivery",
        value: { min_order: 0 },
      },
    ] as TokOneBenefit[];

    expect(
      resolveTokOneFreeDeliveryMinOrderForContext(plan, benefits, {
        restaurantId: "restaurant-1",
        journey: "delivery",
      }),
    ).toBe(0);
  });
});
