import { getSupabase } from "@/integrations/supabase/client";

import type { UserRole } from "@/lib/auth";

export type SignupRole = Extract<UserRole, "client" | "restaurateur" | "courier">;
export type SignupApplicationStatus = "pending_review" | "approved" | "needs_changes" | "rejected";
export type SignupDocumentStatus = "pending" | "approved" | "rejected";
export type SignupDocumentType =
  | "identity_document"
  | "business_registration"
  | "work_permit"
  | "iban_proof"
  | "vehicle_registration";

export type SignupDocumentRequirement = {
  type: SignupDocumentType;
  label: string;
  description: string;
  accept: string;
  optional?: boolean;
};

export type UploadedSignupDocument = {
  document_type: SignupDocumentType;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
};

export type SignupApplicationDocument = {
  id: string;
  application_id: string;
  user_id: string;
  document_type: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type SignupApplication = {
  id: string;
  user_id: string;
  requested_role: string;
  status: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  legal_name: string | null;
  business_name: string | null;
  business_registration_number: string | null;
  tax_id: string | null;
  restaurant_name: string | null;
  restaurant_description: string | null;
  vehicle_type: string | null;
  license_plate: string | null;
  iban: string | null;
  metadata: Record<string, unknown> | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  signup_application_documents?: SignupApplicationDocument[];
};

export const SIGNUP_ROLE_META: Record<
  SignupRole,
  {
    label: string;
    description: string;
  }
> = {
  client: {
    label: "Client",
    description: "Creer un compte en quelques secondes pour commander et reserver. Adresse et paiement plus tard.",
  },
  restaurateur: {
    label: "Restaurateur",
    description: "Declarer votre enseigne, vos coordonnees et vos justificatifs d'exploitation.",
  },
  courier: {
    label: "Livreur",
    description: "Renseigner votre profil de course, vos documents et vos informations de paiement.",
  },
};

const BASE_REQUIREMENTS: SignupDocumentRequirement[] = [
  {
    type: "identity_document",
    label: "Piece d'identite",
    description: "Carte d'identite, passeport ou permis de sejour en cours de validite.",
    accept: ".pdf,.png,.jpg,.jpeg,.webp",
  },
];

const RESTAURATEUR_REQUIREMENTS: SignupDocumentRequirement[] = [
  ...BASE_REQUIREMENTS,
  {
    type: "business_registration",
    label: "Extrait d'immatriculation",
    description: "Document officiel prouvant l'existence de l'entreprise ou de l'etablissement.",
    accept: ".pdf,.png,.jpg,.jpeg",
  },
  {
    type: "iban_proof",
    label: "Justificatif bancaire",
    description: "RIB, IBAN ou attestation bancaire pour les versements.",
    accept: ".pdf,.png,.jpg,.jpeg",
  },
];

const CLIENT_REQUIREMENTS: SignupDocumentRequirement[] = [];

function getCourierRequirements(vehicleType: string | null | undefined): SignupDocumentRequirement[] {
  const requirements: SignupDocumentRequirement[] = [
    ...BASE_REQUIREMENTS,
    {
      type: "work_permit",
      label: "Permis de travail / sejour",
      description: "Autorisation de travail ou document de residence si necessaire.",
      accept: ".pdf,.png,.jpg,.jpeg",
    },
    {
      type: "iban_proof",
      label: "Justificatif IBAN",
      description: "Preuve du compte bancaire ou postal a utiliser pour les virements.",
      accept: ".pdf,.png,.jpg,.jpeg",
    },
  ];

  if (["scooter", "car"].includes(String(vehicleType || "").toLowerCase())) {
    requirements.push({
      type: "vehicle_registration",
      label: "Immatriculation du vehicule",
      description: "Carte grise ou document d'assurance pour le vehicule declare.",
      accept: ".pdf,.png,.jpg,.jpeg",
    });
  }

  return requirements;
}

export function getRequiredSignupDocuments(role: SignupRole, vehicleType?: string | null) {
  if (role === "courier") {
    return getCourierRequirements(vehicleType);
  }

  if (role === "restaurateur") {
    return RESTAURATEUR_REQUIREMENTS;
  }

  return CLIENT_REQUIREMENTS;
}

export function getSignupRoleLabel(role: string | null | undefined) {
  return SIGNUP_ROLE_META[String(role || "") as SignupRole]?.label || role || "Profil";
}

export function getSignupDocumentLabel(type: string | null | undefined) {
  return (
    [...CLIENT_REQUIREMENTS, ...RESTAURATEUR_REQUIREMENTS, ...getCourierRequirements("car")]
      .find((item) => item.type === type)?.label
    || type
    || "Document"
  );
}

export function getSignupStatusMeta(status: string | null | undefined) {
  switch (String(status || "").toLowerCase()) {
    case "approved":
      return {
        label: "Approuve",
        tone: "bg-emerald-100 text-emerald-700",
        description: "Votre dossier est valide. Les controles documentaires sont termines.",
      };
    case "needs_changes":
      return {
        label: "Corrections demandees",
        tone: "bg-amber-100 text-amber-700",
        description: "Des ajustements ou des documents complementaires sont necessaires.",
      };
    case "rejected":
      return {
        label: "Refuse",
        tone: "bg-red-100 text-red-700",
        description: "Le dossier a ete refuse. Consultez la note de revue pour corriger la demande.",
      };
    default:
      return {
        label: "En revue",
        tone: "bg-sky-100 text-sky-700",
        description: "Les justificatifs ont ete recus et sont en cours de verification.",
      };
  }
}

export function getSignupDocumentStatusMeta(status: string | null | undefined) {
  switch (String(status || "").toLowerCase()) {
    case "approved":
      return {
        label: "Valide",
        tone: "bg-emerald-100 text-emerald-700",
      };
    case "rejected":
      return {
        label: "A revoir",
        tone: "bg-red-100 text-red-700",
      };
    default:
      return {
        label: "En attente",
        tone: "bg-amber-100 text-amber-700",
      };
  }
}

export function getMissingSignupDocuments(
  requirements: SignupDocumentRequirement[],
  files: Partial<Record<SignupDocumentType, File | null>>,
) {
  return requirements.filter((requirement) => !files[requirement.type]);
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

export async function uploadVerificationDocument(input: {
  userId: string;
  role: SignupRole;
  documentType: SignupDocumentType;
  file: File;
}) {
  const extension = input.file.name.includes(".")
    ? input.file.name.split(".").pop() || "bin"
    : "bin";
  const safeExtension = sanitizeFileSegment(extension) || "bin";
  const safeDocumentType = sanitizeFileSegment(input.documentType) || "document";
  const safeRole = sanitizeFileSegment(input.role) || "signup";
  const filePath = `${input.userId}/${safeRole}/${safeDocumentType}-${crypto.randomUUID()}.${safeExtension}`;

  const { error } = await getSupabase().storage
    .from("verification-documents")
    .upload(filePath, input.file, {
      upsert: true,
      cacheControl: "3600",
      contentType: input.file.type || undefined,
    });

  if (error) {
    throw error;
  }

  return {
    document_type: input.documentType,
    file_path: filePath,
    file_name: input.file.name,
    mime_type: input.file.type || null,
    file_size_bytes: Number.isFinite(input.file.size) ? input.file.size : null,
  } satisfies UploadedSignupDocument;
}

export async function getVerificationDocumentUrl(filePath: string, expiresInSeconds = 3600) {
  const { data, error } = await getSupabase().storage
    .from("verification-documents")
    .createSignedUrl(filePath, expiresInSeconds);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
