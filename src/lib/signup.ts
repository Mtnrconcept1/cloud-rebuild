import { getSupabase } from "@/integrations/supabase/client";

import type { UserRole } from "@/lib/auth-context";
import {
  DOCUMENT_MIME_EXTENSIONS,
  MAX_DOCUMENT_UPLOAD_BYTES,
  assertSafeFileUpload,
  getSafeUploadExtension,
} from "@/lib/uploadSecurity";

export type SignupRole = Extract<UserRole, "client" | "restaurateur" | "courier" | "commercial">;
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

export type SignupSubscriptionBillingPeriod = "monthly" | "yearly";

export type SignupRestaurateurOnboardingSelection = {
  subscriptionPlanId: string;
  subscriptionBillingPeriod: SignupSubscriptionBillingPeriod;
  onboardingPaymentStatus: string;
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
    description: "Créer un compte en quelques secondes pour commander et réserver. Adresse et paiement plus tard.",
  },
  restaurateur: {
    label: "Restaurateur",
    description: "Déclarer votre enseigne, vos coordonnées et vos justificatifs d'exploitation.",
  },
  courier: {
    label: "Livreur",
    description: "Renseigner votre profil de course, vos documents et vos informations de paiement.",
  },
  commercial: {
    label: "Commercial",
    description: "Créer un accès de prospection terrain pour suivre les visites restaurants.",
  },
};

const BASE_REQUIREMENTS: SignupDocumentRequirement[] = [
  {
    type: "identity_document",
    label: "Pièce d'identité",
    description: "Carte d'identité, passeport ou permis de séjour en cours de validité.",
    accept: ".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif",
  },
];

const RESTAURATEUR_REQUIREMENTS: SignupDocumentRequirement[] = [
  ...BASE_REQUIREMENTS,
  {
    type: "business_registration",
    label: "Extrait d'immatriculation",
    description: "Document officiel prouvant l'existence de l'entreprise ou de l'établissement.",
    accept: ".pdf,.png,.jpg,.jpeg,.heic,.heif",
  },
  {
    type: "iban_proof",
    label: "Justificatif bancaire",
    description: "RIB, IBAN ou attestation bancaire pour les versements.",
    accept: ".pdf,.png,.jpg,.jpeg,.heic,.heif",
  },
];

const CLIENT_REQUIREMENTS: SignupDocumentRequirement[] = [];

function getCourierRequirements(vehicleType: string | null | undefined): SignupDocumentRequirement[] {
  const requirements: SignupDocumentRequirement[] = [
    ...BASE_REQUIREMENTS,
    {
      type: "work_permit",
      label: "Permis de travail / séjour",
      description: "Autorisation de travail ou document de residence si nécessaire.",
      accept: ".pdf,.png,.jpg,.jpeg,.heic,.heif",
    },
    {
      type: "iban_proof",
      label: "Justificatif IBAN",
      description: "Preuve du compte bancaire ou postal à utiliser pour les virements.",
      accept: ".pdf,.png,.jpg,.jpeg,.heic,.heif",
    },
  ];

  if (["scooter", "car"].includes(String(vehicleType || "").toLowerCase())) {
    requirements.push({
      type: "vehicle_registration",
      label: "Immatriculation du véhicule",
      description: "Carte grise ou document d'assurance pour le véhicule déclaré.",
      accept: ".pdf,.png,.jpg,.jpeg,.heic,.heif",
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
        label: "Approuvé",
        tone: "bg-emerald-100 text-emerald-700",
        description: "Votre dossier est valide. Les contrôles documentaires sont terminés.",
      };
    case "needs_changes":
      return {
        label: "Corrections demandées",
        tone: "bg-amber-100 text-amber-700",
        description: "Des ajustements ou des documents complémentaires sont nécessaires.",
      };
    case "rejected":
      return {
        label: "Refusé",
        tone: "bg-red-100 text-red-700",
        description: "Le dossier a été refusé. Consultez la note de revue pour corriger la demande.",
      };
    default:
      return {
        label: "En revue",
        tone: "bg-sky-100 text-sky-700",
        description: "Les justificatifs ont été reçus et sont en cours de vérification.",
      };
  }
}

export function normalizeSignupSubscriptionBillingPeriod(value: unknown): SignupSubscriptionBillingPeriod {
  return value === "yearly" ? "yearly" : "monthly";
}

function getMetadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function getSignupRestaurateurOnboardingSelection(
  application: Pick<SignupApplication, "requested_role" | "metadata"> | null | undefined,
): SignupRestaurateurOnboardingSelection | null {
  if (!application || application.requested_role !== "restaurateur") return null;
  const metadata = application.metadata || {};
  const subscriptionPlanId = getMetadataString(metadata, "selected_subscription_plan_id");
  const subscriptionBillingPeriod = normalizeSignupSubscriptionBillingPeriod(
    getMetadataString(metadata, "selected_subscription_billing_period"),
  );
  const onboardingPaymentStatus = getMetadataString(metadata, "onboarding_payment_status");

  if (!subscriptionPlanId) return null;
  return {
    subscriptionPlanId,
    subscriptionBillingPeriod,
    onboardingPaymentStatus: onboardingPaymentStatus || "payment_method_required",
  };
}

export function isSignupRestaurateurOnboardingPaymentReady(
  application: Pick<SignupApplication, "requested_role" | "metadata"> | null | undefined,
) {
  const selection = getSignupRestaurateurOnboardingSelection(application);
  if (!selection) return application?.requested_role !== "restaurateur";
  return ["payment_method_ready", "paid", "active", "trialing"].includes(
    selection.onboardingPaymentStatus,
  );
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
        label: "À revoir",
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
  uploadId?: string;
}) {
  assertSafeFileUpload(input.file, {
    allowedMimeTypes: DOCUMENT_MIME_EXTENSIONS,
    maxBytes: MAX_DOCUMENT_UPLOAD_BYTES,
    label: "Document",
  });
  const extension = getSafeUploadExtension(input.file, DOCUMENT_MIME_EXTENSIONS);
  const safeExtension = sanitizeFileSegment(extension) || "bin";
  const safeDocumentType = sanitizeFileSegment(input.documentType) || "document";
  const safeRole = sanitizeFileSegment(input.role) || "signup";
  const safeUploadId = sanitizeFileSegment(input.uploadId || crypto.randomUUID()) || crypto.randomUUID();
  const filePath = `${input.userId}/${safeRole}/${safeDocumentType}-${safeUploadId}.${safeExtension}`;

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
