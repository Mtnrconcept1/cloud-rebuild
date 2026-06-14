import { describe, expect, it } from "vitest";
import {
  ACCEPTED_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  getRequiredDocumentTypes,
  validateSubmissionFields,
} from "../../supabase/functions/submit-signup-application/validation";

describe("submit-signup-application validation", () => {
  it("exige la carte grise pour scooter/voiture", () => {
    expect(getRequiredDocumentTypes("courier", "car")).toContain("vehicle_registration");
    expect(getRequiredDocumentTypes("courier", "bicycle")).not.toContain("vehicle_registration");
    expect(getRequiredDocumentTypes("restaurateur", null)).toEqual([
      "identity_document", "business_registration", "iban_proof",
    ]);
  });

  it("refuse un restaurateur sans IBAN ni immatriculation", () => {
    expect(validateSubmissionFields("restaurateur", {
      full_name: "A",
      legal_name: "y",
      restaurant_name: "z",
      business_name: "x",
      phone: "1",
      city: "c",
      address: "a",
      iban: "",
      business_registration_number: "",
    })).toMatch(/IBAN|immatriculation/i);

    expect(validateSubmissionFields("restaurateur", {
      full_name: "A", iban: "CH..", business_registration_number: "CHE..", business_name: "x",
      legal_name: "y", restaurant_name: "z", phone: "1", city: "c", address: "a",
    })).toBeNull();
  });

  it("rejette les roles non pro", () => {
    expect(validateSubmissionFields("client", { full_name: "A" })).toMatch(/role/i);
  });

  it("expose les limites MIME/taille", () => {
    expect(ACCEPTED_MIME_TYPES).toContain("application/pdf");
    expect(ACCEPTED_MIME_TYPES).toContain("image/heic");
    expect(ACCEPTED_MIME_TYPES).toContain("image/heif");
    expect(MAX_DOCUMENT_BYTES).toBe(15 * 1024 * 1024);
  });
});
