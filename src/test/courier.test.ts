import { describe, expect, it } from "vitest";

import {
  buildCourierDeliveryVerificationPayload,
  getNextCourierJobAction,
  getOfferExpiresAt,
  mapCourierEarningTypeLabel,
} from "@/lib/courier";

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

  it("builds the delivery proof payload expected by the courier portal", () => {
    expect(buildCourierDeliveryVerificationPayload("job-1", {
      proofCode: "123456",
      verificationMethod: "qr",
    })).toEqual({
      dispatch_job_id: "job-1",
      proof_code: "123456",
      signature_data_url: "",
      verification_method: "qr",
    });

    expect(buildCourierDeliveryVerificationPayload("job-2", {
      signatureDataUrl: "data:image/png;base64,signature",
      verificationMethod: "manual_signature",
    })).toEqual({
      dispatch_job_id: "job-2",
      proof_code: "",
      signature_data_url: "data:image/png;base64,signature",
      verification_method: "manual_signature",
    });
  });
});
