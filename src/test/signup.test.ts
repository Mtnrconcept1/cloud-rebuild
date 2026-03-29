import { describe, expect, it } from "vitest";

import {
  getMissingSignupDocuments,
  getRequiredSignupDocuments,
  getSignupDocumentLabel,
  getSignupStatusMeta,
} from "@/lib/signup";

describe("getRequiredSignupDocuments", () => {
  it("returns the role-specific requirements for restaurateurs", () => {
    expect(getRequiredSignupDocuments("restaurateur").map((item) => item.type)).toEqual([
      "identity_document",
      "business_registration",
      "iban_proof",
    ]);
  });

  it("adds vehicle registration for motorized couriers", () => {
    expect(getRequiredSignupDocuments("courier", "scooter").map((item) => item.type)).toContain(
      "vehicle_registration",
    );
    expect(getRequiredSignupDocuments("courier", "bicycle").map((item) => item.type)).not.toContain(
      "vehicle_registration",
    );
  });
});

describe("getMissingSignupDocuments", () => {
  it("detects missing files against the required documents", () => {
    const requirements = getRequiredSignupDocuments("client");
    const fakeFile = new File(["proof"], "identity.pdf", { type: "application/pdf" });

    expect(getMissingSignupDocuments(requirements, {})).toHaveLength(1);
    expect(
      getMissingSignupDocuments(requirements, {
        identity_document: fakeFile,
      }),
    ).toHaveLength(0);
  });
});

describe("signup presentation helpers", () => {
  it("returns consistent labels and statuses", () => {
    expect(getSignupDocumentLabel("vehicle_registration")).toBe("Immatriculation du vehicule");
    expect(getSignupStatusMeta("needs_changes").label).toBe("Corrections demandees");
  });
});
