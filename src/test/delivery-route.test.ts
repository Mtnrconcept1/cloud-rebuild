import { describe, expect, it } from "vitest";

import { buildDeliveryRouteSteps, normalizeDeliveryRouteSteps } from "@/lib/deliveryRoute";

describe("deliveryRoute", () => {
  it("normalizes route geometry steps in order", () => {
    const steps = normalizeDeliveryRouteSteps({
      steps: [
        { id: "dropoff", type: "dropoff", label: "Livraison", address: "Rue 3", latitude: 46.5, longitude: 6.6, step_index: 3 },
        { id: "pickup-1", type: "pickup", label: "Retrait 1", address: "Rue 1", latitude: 46.51, longitude: 6.61, step_index: 1 },
      ],
    });

    expect(steps).toHaveLength(2);
    expect(steps[0].id).toBe("pickup-1");
    expect(steps[1].type).toBe("dropoff");
  });

  it("builds fallback route steps from sibling orders", () => {
    const steps = buildDeliveryRouteSteps({
      orders: [
        {
          id: "order-2",
          order_number: "REF-2",
          created_at: "2026-03-12T12:05:00Z",
          metadata: {},
          restaurants: { id: "resto-2", name: "B", address: "Rue B", latitude: 46.53, longitude: 6.65 },
        },
        {
          id: "order-1",
          order_number: "REF-1",
          created_at: "2026-03-12T12:00:00Z",
          metadata: { delivery_lat: 46.54, delivery_lng: 6.66 },
          delivery_address: "Rue Client",
          restaurants: { id: "resto-1", name: "A", address: "Rue A", latitude: 46.52, longitude: 6.64 },
        },
      ],
    });

    expect(steps).toHaveLength(3);
    expect(steps[0].restaurantName).toBe("A");
    expect(steps[1].restaurantName).toBe("B");
    expect(steps[2].type).toBe("dropoff");
  });
});
