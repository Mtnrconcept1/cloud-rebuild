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
      launch_pack_id: "pack-1", subscription_plan_id: "plan-1", subscription_billing_period: "monthly",
      terms_accepted: "true", privacy_policy_accepted: "true",
    })).toBeNull();
  });

  it("refuse un restaurateur sans pack de lancement ni abonnement choisis", () => {
    const baseFields = {
      full_name: "Restaurateur Test",
      phone: "+41790000000",
      city: "Geneve",
      address: "Rue du Rhone 1",
      business_name: "Table Tok",
      legal_name: "Table Tok Sarl",
      business_registration_number: "CHE-123.456.789",
      restaurant_name: "La Table Tok",
      iban: "CH9300762011623852957",
      terms_accepted: "true",
      privacy_policy_accepted: "true",
    };

    expect(validateSubmissionFields("restaurateur", baseFields)).toMatch(/pack/i);

    expect(validateSubmissionFields("restaurateur", {
      ...baseFields,
      launch_pack_id: "pack-1",
      subscription_plan_id: "",
      subscription_billing_period: "monthly",
    })).toMatch(/abonnement/i);

    expect(validateSubmissionFields("restaurateur", {
      ...baseFields,
      launch_pack_id: "pack-1",
      subscription_plan_id: "plan-1",
      subscription_billing_period: "weekly",
    })).toMatch(/periode/i);

    expect(validateSubmissionFields("restaurateur", {
      ...baseFields,
      launch_pack_id: "pack-1",
      subscription_plan_id: "plan-1",
      subscription_billing_period: "monthly",
    })).toBeNull();
  });

  it("refuse un dossier sans acceptation des CGU et de la politique de confidentialite", () => {
    const baseFields = {
      full_name: "Restaurateur Test",
      phone: "+41790000000",
      city: "Geneve",
      address: "Rue du Rhone 1",
      business_name: "Table Tok",
      legal_name: "Table Tok Sarl",
      business_registration_number: "CHE-123.456.789",
      restaurant_name: "La Table Tok",
      iban: "CH9300762011623852957",
      launch_pack_id: "pack-1",
      subscription_plan_id: "plan-1",
      subscription_billing_period: "monthly",
    };

    expect(validateSubmissionFields("restaurateur", baseFields)).toMatch(/CGU/i);
    expect(validateSubmissionFields("restaurateur", {
      ...baseFields,
      terms_accepted: "true",
      privacy_policy_accepted: "",
    })).toMatch(/politique de confidentialite/i);
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
