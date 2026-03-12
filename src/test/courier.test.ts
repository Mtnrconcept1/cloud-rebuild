import { describe, expect, it } from "vitest";

import { getNextCourierJobAction, getOfferExpiresAt, mapCourierEarningTypeLabel } from "@/lib/courier";

describe("courier helpers", () => {
  it("returns the next courier action for a live job status", () => {
    expect(getNextCourierJobAction("accepted")).toEqual({
      nextStatus: "arriving_pickup",
      label: "Je pars au restaurant",
    });
    expect(getNextCourierJobAction("arriving_dropoff")).toEqual({
      nextStatus: "delivered",
      label: "Confirmer la livraison",
    });
  });

  it("computes an offer expiry from the offered time", () => {
    const expiry = getOfferExpiresAt("2026-03-12T10:00:00.000Z", 45);
    expect(expiry.toISOString()).toBe("2026-03-12T10:00:45.000Z");
  });

  it("maps earning types to readable labels", () => {
    expect(mapCourierEarningTypeLabel("delivery")).toBe("Course");
    expect(mapCourierEarningTypeLabel("tip")).toBe("Pourboire");
  });
});
