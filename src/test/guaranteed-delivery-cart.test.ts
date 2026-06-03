import { describe, expect, it } from "vitest";

import {
  buildGuaranteedDeliveryOrderMetadata,
  getGuaranteedDeliveryCartContext,
} from "@/lib/guaranteedDeliveryCart";

describe("guaranteed delivery cart context", () => {
  it("hydrates a scheduled delivery slot from cart metadata", () => {
    const context = getGuaranteedDeliveryCartContext({
      feature: "creneaux-garantis",
      is_guaranteed_delivery_slot: true,
      delivery_schedule_mode: "scheduled",
      delivery_date: "2026-06-08",
      delivery_time: "19:45",
      scheduled_delivery_label: "8 juin 2026 a 19:45",
      guaranteed_delivery_window: "19:30 - 20:00",
      guaranteed_delivery_level_label: "Premium",
      guaranteed_delivery_window_minutes: 30,
      guaranteed_delivery_compensation: "10 CHF",
      guaranteed_delivery_premium: 2.5,
    }, []);

    expect(context).toEqual({
      deliveryScheduleMode: "scheduled",
      deliveryDate: "2026-06-08",
      deliveryTime: "19:45",
      deliveryService: "dinner",
      scheduledDeliveryLabel: "8 juin 2026 a 19:45",
      guaranteedDeliveryWindow: "19:30 - 20:00",
      guaranteedDeliveryLevelId: null,
      guaranteedDeliveryLevelLabel: "Premium",
      guaranteedDeliveryWindowMinutes: 30,
      guaranteedDeliveryCompensation: "10 CHF",
      guaranteedDeliveryPremium: 2.5,
    });
  });

  it("falls back to item metadata when the cart metadata is incomplete", () => {
    const context = getGuaranteedDeliveryCartContext({}, [{
      metadata: {
        feature: "creneaux-garantis",
        delivery_date: "2026-06-09",
        delivery_time: "12:15:00",
      },
    }]);

    expect(context).toMatchObject({
      deliveryDate: "2026-06-09",
      deliveryTime: "12:15",
      deliveryService: "lunch",
    });
  });

  it("builds checkout metadata that preserves the guaranteed slot promise", () => {
    const context = getGuaranteedDeliveryCartContext({
      feature: "creneaux-garantis",
      delivery_date: "2026-06-08",
      delivery_time: "19:45",
      scheduled_delivery_label: "8 juin 2026 a 19:45",
    }, []);

    expect(buildGuaranteedDeliveryOrderMetadata(context)).toMatchObject({
      feature: "creneaux-garantis",
      is_guaranteed_delivery_slot: true,
      delivery_schedule_mode: "scheduled",
      delivery_date: "2026-06-08",
      delivery_time: "19:45",
      delivery_service: "dinner",
      scheduled_delivery_label: "8 juin 2026 a 19:45",
    });
  });
});
