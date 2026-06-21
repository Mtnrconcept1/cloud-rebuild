import { describe, expect, it } from "vitest";
import {
  ACCEPTED_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  RESTAURANT_PARTNER_CONTRACT_VERSION,
  getRequiredDocumentTypes,
  validateSubmissionFields,
} from "../../supabase/functions/submit-signup-application/validation";

const VALID_SIGNATURE_DATA_URL = "data:image/png;base64,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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
      subscription_plan_id: "plan-1", subscription_billing_period: "monthly",
      terms_accepted: "true", privacy_policy_accepted: "true",
      contract_signer_name: "Marie Dupont", contract_signature_data_url: VALID_SIGNATURE_DATA_URL, contract_version: RESTAURANT_PARTNER_CONTRACT_VERSION,
    })).toBeNull();
  });

  it("refuse un restaurateur sans abonnement choisi", () => {
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
      contract_signer_name: "Marie Dupont",
      contract_signature_data_url: VALID_SIGNATURE_DATA_URL,
      contract_version: RESTAURANT_PARTNER_CONTRACT_VERSION,
    };

    expect(validateSubmissionFields("restaurateur", baseFields)).toMatch(/abonnement/i);

    expect(validateSubmissionFields("restaurateur", {
      ...baseFields,

      subscription_plan_id: "",
      subscription_billing_period: "monthly",
    })).toMatch(/abonnement/i);

    expect(validateSubmissionFields("restaurateur", {
      ...baseFields,

      subscription_plan_id: "plan-1",
      subscription_billing_period: "weekly",
    })).toMatch(/periode/i);

    expect(validateSubmissionFields("restaurateur", {
      ...baseFields,

      subscription_plan_id: "plan-1",
      subscription_billing_period: "monthly",
    })).toBeNull();
  });

  it("refuse une version de contrat restaurateur inconnue", () => {
    expect(validateSubmissionFields("restaurateur", {
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
      subscription_plan_id: "plan-1",
      subscription_billing_period: "monthly",
      contract_signer_name: "Marie Dupont",
      contract_signature_data_url: VALID_SIGNATURE_DATA_URL,
      contract_version: "TOK-CH-RP-2026-06-v1",
    })).toMatch(/version du contrat restaurateur/i);
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
