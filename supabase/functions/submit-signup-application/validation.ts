export type ProRole = "restaurateur" | "courier";

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

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

  if (role === "restaurateur") {
    if (!String(fields.business_name || "").trim()) return "Le nom commercial est requis.";
    if (!String(fields.legal_name || "").trim()) return "La raison sociale est requise.";
    if (!String(fields.business_registration_number || "").trim()) return "Le numero d'immatriculation est requis.";
    if (!String(fields.restaurant_name || "").trim()) return "Le nom du restaurant est requis.";
  }

  if (role === "courier") {
    const vehicle = String(fields.vehicle_type || "").toLowerCase();
    if (["scooter", "car"].includes(vehicle) && !String(fields.license_plate || "").trim()) {
      return "La plaque d'immatriculation est requise pour ce vehicule.";
    }
  }
  return null;
}
