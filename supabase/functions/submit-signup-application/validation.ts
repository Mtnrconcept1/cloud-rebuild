export type ProRole = "restaurateur" | "courier";

export const RESTAURANT_PARTNER_CONTRACT_VERSION = "TOK-CH-RP-FAIR-GROWTH-2026-07-v4";
export const LEGAL_ACCEPTANCE_VERSION = "cgu-2026-07-v4+privacy-2026-07-v4";

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export function getRequiredDocumentTypes(role: string, vehicleType: string | null): string[] {
  if (role === "courier") {
    const base = ["identity_document", "work_permit", "iban_proof"];
    if (["scooter", "car"].includes(String(vehicleType || "").toLowerCase())) {
      base.push("vehicle_registration");
    }
    return base;
  }
  if (role === "restaurateur") {
    return ["identity_document", "business_registration", "iban_proof"];
  }
  return [];
}

export function validateSubmissionFields(
  role: string,
  fields: Record<string, string | undefined>,
): string | null {
  if (role !== "restaurateur" && role !== "courier") {
    return "Role non supporte pour ce parcours (role attendu : restaurateur ou livreur).";
  }
  if (!String(fields.full_name || "").trim()) return "Le nom complet est requis.";
  if (!String(fields.phone || "").trim()) return "Le telephone est requis.";
  if (!String(fields.city || "").trim()) return "La ville est requise.";
  if (!String(fields.address || "").trim()) return "L'adresse est requise.";
  if (!String(fields.iban || "").trim()) return "L'IBAN de versement est requis.";
  if (String(fields.terms_accepted || "").trim().toLowerCase() !== "true") {
    return "Vous devez accepter les CGU et la politique de confidentialite.";
  }
  if (String(fields.privacy_policy_accepted || "").trim().toLowerCase() !== "true") {
    return "Vous devez accepter la politique de confidentialite.";
  }

  if (role === "restaurateur") {
    if (String(fields.legal_acceptance_version || "").trim() !== LEGAL_ACCEPTANCE_VERSION) {
      return "La version des conditions acceptees est invalide.";
    }
    if (!String(fields.business_name || "").trim()) return "Le nom commercial est requis.";
    if (!String(fields.legal_name || "").trim()) return "La raison sociale est requise.";
    if (!String(fields.business_registration_number || "").trim()) return "Le numero d'immatriculation est requis.";
    if (!String(fields.restaurant_name || "").trim()) return "Le nom du restaurant est requis.";
    if (!String(fields.subscription_plan_id || "").trim()) return "L'abonnement TOK est requis.";
    if (!String(fields.contract_signer_name || "").trim()) return "Le signataire du contrat restaurateur est requis.";
    const signature = String(fields.contract_signature_data_url || "").trim();
    if (!signature.startsWith("data:image/png;base64,") || signature.length < 120) {
      return "La signature manuscrite du contrat restaurateur est requise.";
    }
    if (String(fields.contract_version || "").trim() !== RESTAURANT_PARTNER_CONTRACT_VERSION) {
      return "La version du contrat restaurateur est invalide.";
    }
    const billingPeriod = String(fields.subscription_billing_period || "").trim().toLowerCase();
    if (!["monthly", "yearly"].includes(billingPeriod)) {
      return "La periode d'abonnement est invalide.";
    }
  }

  if (role === "courier") {
    const vehicle = String(fields.vehicle_type || "").toLowerCase();
    if (["scooter", "car"].includes(vehicle) && !String(fields.license_plate || "").trim()) {
      return "La plaque d'immatriculation est requise pour ce vehicule.";
    }
  }
  return null;
}
