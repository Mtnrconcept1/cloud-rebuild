/** A field signature records consent, not identity or mailbox verification. */
export type ConsentDocument = {
  version: string;
  controller: string;
  address: string;
  contact: string;
  text: string;
  privacy: string;
};
export type ConsentSummary = {
  receipt_id: string;
  signed_at: string;
  email: string;
  email_eligible: boolean;
  withdrawn: boolean;
};
export type ConsentContext = {
  document: ConsentDocument | null;
  document_hash: string | null;
  is_admin: boolean;
  latest: ConsentSummary | null;
};
export type ConsentReceipt = ConsentSummary & {
  source_objectid: number;
  restaurant_name: string;
  signer_name: string;
  signer_role: string;
  document: ConsentDocument;
  document_hash: string;
  proof_hash: string;
  signature_data: string;
  approval_method: "restaurateur_signature_in_person";
  email_verified: false;
  evidence_quality: "system_event";
};
export type ConsentFields = {
  email: string;
  emailAgain: string;
  signerName: string;
  signerRole: string;
  signature: string | null;
  consented: boolean;
};
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hasControls = (value: string) => Array.from(value).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
const clean = (value: string) => value.normalize("NFC").trim();
export const normalizeConsentEmail = (value: string) => clean(value).toLowerCase();
export function validConsentEmail(value: string): boolean {
  const email = normalizeConsentEmail(value);
  const [local, domain, extra] = email.split("@");
  return email.length <= 254 && !!local && local.length <= 64 && !!domain && extra === undefined
    && /^[a-z0-9._%+-]+$/.test(local) && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..")
    && domain.includes(".") && /\.[a-z]{2,}$/.test(domain)
    && domain.split(".").every(part => part.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part));
}
export function validateConsentFields(fields: ConsentFields): string | null {
  if (!validConsentEmail(fields.email)) return "Renseignez une adresse e-mail valide.";
  if (normalizeConsentEmail(fields.email) !== normalizeConsentEmail(fields.emailAgain)) return "Les deux adresses e-mail doivent être identiques.";
  if (clean(fields.signerName).length < 2 || clean(fields.signerName).length > 160 || hasControls(fields.signerName)) return "Renseignez votre prénom et votre nom.";
  if (clean(fields.signerRole).length < 2 || clean(fields.signerRole).length > 100 || hasControls(fields.signerRole)) return "Renseignez votre fonction au restaurant.";
  if (fields.consented !== true) return "Votre accord explicite est nécessaire pour enregistrer ce consentement.";
  if (!fields.signature || fields.signature.length < 200 || fields.signature.length > 180000 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(fields.signature)) return "Veuillez tracer votre signature dans la zone prévue.";
  return null;
}
const ERROR_MESSAGES: Record<string, string> = {
  consent_document_changed: "Le texte d’autorisation a changé. Rechargez-le et faites-le relire avant une nouvelle signature.",
  consent_controller_missing: "L’administrateur doit renseigner l’identité professionnelle de TOK avant la première signature.",
  consent_admin_mfa_required: "La configuration exige un compte administrateur TOK avec une double authentification validée.",
  commercial_access_required: "Cette action exige un compte commercial actif ou administrateur TOK.",
  commercial_account_inactive: "Ce compte commercial est inactif. Contactez un administrateur.",
  prospect_owned_by_another_commercial: "Ce prospect est attribué à un autre commercial.",
  unknown_prospect: "Ce prospect n’est plus disponible. Rechargez la fiche.",
  invalid_or_unsigned_consent: "Vérifiez les coordonnées, la case d’accord et la signature du restaurateur.",
  contact_suppressed_reconsent_requires_independent_verification: "Cette adresse fait l’objet d’une opposition ou d’une suppression. Aucun droit d’envoi n’a été réactivé.",
  consent_request_conflict: "Cette tentative correspond à un autre contenu. Fermez le formulaire et faites signer une nouvelle autorisation.",
  consent_receipt_not_found: "Cette preuve n’est pas accessible depuis votre compte.",
  consent_rate_limited: "Trop de signatures ont été demandées sur ce compte. Réessayez plus tard.",
};
export function consentErrorMessage(error: unknown): string {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  for (const [code, label] of Object.entries(ERROR_MESSAGES)) if (message === code) return label;
  if (message.includes("schema cache") || message.includes("Could not find the function")) return "Le module de consentement n’est pas encore activé sur le serveur. Aucune signature n’a été enregistrée.";
  return "L’enregistrement n’a pas pu être confirmé. Conservez ce formulaire et réessayez ; une même tentative ne crée pas de doublon.";
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("consent_response_invalid");
  return value as Record<string, unknown>;
}
function parseDocument(value: unknown): ConsentDocument {
  const v = record(value);
  for (const key of ["version", "controller", "address", "contact", "text", "privacy"]) if (typeof v[key] !== "string" || !(v[key] as string).trim()) throw new Error("consent_response_invalid");
  return v as ConsentDocument;
}
function parseSummary(value: unknown): ConsentSummary {
  const v = record(value);
  if (typeof v.receipt_id !== "string" || !UUID.test(v.receipt_id) || typeof v.signed_at !== "string" || !Number.isFinite(Date.parse(v.signed_at)) || typeof v.email !== "string" || typeof v.email_eligible !== "boolean" || typeof v.withdrawn !== "boolean") throw new Error("consent_response_invalid");
  return v as ConsentSummary;
}
export function parseConsentContext(value: unknown): ConsentContext {
  const v = record(value);
  if (typeof v.is_admin !== "boolean" || !(v.document === null ? v.document_hash === null : typeof v.document_hash === "string" && HASH.test(v.document_hash))) throw new Error("consent_response_invalid");
  return { document: v.document === null ? null : parseDocument(v.document), document_hash: v.document_hash as string | null, is_admin: v.is_admin, latest: v.latest === null ? null : parseSummary(v.latest) };
}
export function parseConsentReceipt(value: unknown): ConsentReceipt {
  const v = record(value);
  const summary = parseSummary(value);
  if (!Number.isSafeInteger(v.source_objectid) || Number(v.source_objectid) <= 0 || v.email_verified !== false || v.approval_method !== "restaurateur_signature_in_person" || v.evidence_quality !== "system_event" || typeof v.document_hash !== "string" || !HASH.test(v.document_hash) || typeof v.proof_hash !== "string" || !HASH.test(v.proof_hash)) throw new Error("consent_response_invalid");
  for (const key of ["restaurant_name", "signer_name", "signer_role", "signature_data"]) if (typeof v[key] !== "string" || !(v[key] as string).length) throw new Error("consent_response_invalid");
  if (!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(v.signature_data as string)) throw new Error("consent_response_invalid");
  return { ...v, ...summary, document: parseDocument(v.document) } as ConsentReceipt;
}
