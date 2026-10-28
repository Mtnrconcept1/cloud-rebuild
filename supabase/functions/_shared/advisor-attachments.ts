import { HttpError } from "./auth.ts";
import { assertOpenAIModerationPassed } from "./openai.ts";

// Fail-closed moderation uses OpenAI model "omni-moderation-latest" and raises "attachment_content_rejected" for flagged content.

export const MAX_ADVISOR_ATTACHMENTS = 3;
export const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_CRM_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_CRM_CONTACTS = 500;

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ATTACHMENT_ID = /^[A-Za-z0-9_-]{1,120}$/;
// eslint-disable-next-line no-control-regex -- reject ASCII control characters in user-supplied filenames.
const SAFE_FILE_NAME = /^[^/\\\u0000-\u001f\u007f]{1,180}$/;
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_SPREADSHEET_MIMES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const SENSITIVE_FILE_NAME = /(?:private[_ -]?key|secret|password|mot[_ -]?de[_ -]?passe|seed[_ -]?phrase|mnemonic|api[_ -]?key|service[_ -]?role|token|identit[eé]|passeport|carte[_ -]?bancaire|medical|m[eé]dical)/i;
const ACTIVE_PDF_MARKERS = ["/JavaScript", "/JS", "/Launch", "/EmbeddedFile", "/RichMedia", "/XFA", "/OpenAction"];

export type AdvisorAttachmentKind = "image" | "pdf" | "crm_contacts";

export type AdvisorCrmContact = {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
};

export type ValidatedAdvisorAttachment = {
  attachmentId: string;
  kind: AdvisorAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  declaredSha256: string;
  contentSha256: string;
  dataUrl?: string;
  bytes?: Uint8Array;
  contacts?: AdvisorCrmContact[];
  warnings: string[];
};

export type AdvisorAttachmentManifestEntry = {
  attachmentId: string;
  kind: AdvisorAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentSha256: string;
  contactCount: number;
};

type InputRecord = Record<string, unknown>;

function object(value: unknown): value is InputRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number, required = false) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new HttpError(422, "attachment_invalid_text");
    return null;
  }
  if (typeof value !== "string") throw new HttpError(422, "attachment_invalid_text");
  const clean = value
    // eslint-disable-next-line no-control-regex -- intentionally strip ASCII control characters from uploaded contact fields.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if ((!clean && required) || clean.length > maxLength) throw new HttpError(422, "attachment_invalid_text");
  return clean || null;
}

function isSpreadsheetFormula(value: unknown, allowInternationalPhone = false) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (/^[=@]/.test(trimmed)) return true;
  if (!/^[+-]/.test(trimmed)) return false;
  if (allowInternationalPhone && /^\+\d[\d().\s-]{6,39}$/.test(trimmed)) return false;
  return true;
}

function normalizeEmail(value: unknown) {
  const email = cleanText(value, 254);
  if (!email) return null;
  const normalized = email.toLowerCase();
  const parts = normalized.split("@");
  if (parts.length !== 2) throw new HttpError(422, "attachment_invalid_contact");
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")
    || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) throw new HttpError(422, "attachment_invalid_contact");
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) {
    throw new HttpError(422, "attachment_invalid_contact");
  }
  return normalized;
}

function normalizePhone(value: unknown) {
  const phone = cleanText(value, 40);
  if (!phone) return null;
  const compact = phone.replace(/[().\s-]/g, "");
  const normalized = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  if (!/^\+?\d{7,20}$/.test(normalized)) throw new HttpError(422, "attachment_invalid_contact");
  return phone;
}

function validateContact(value: unknown): AdvisorCrmContact {
  if (!object(value)) throw new HttpError(422, "attachment_invalid_contact");
  for (const [field, entry] of Object.entries(value)) {
    if (isSpreadsheetFormula(entry, field === "phone")) throw new HttpError(422, "attachment_formula_rejected");
  }
  const email = normalizeEmail(value.email);
  const phone = normalizePhone(value.phone);
  if (!email && !phone) throw new HttpError(422, "attachment_invalid_contact");
  const firstName = cleanText(value.firstName, 120);
  const lastName = cleanText(value.lastName, 120);
  const explicitFullName = cleanText(value.fullName, 240);
  return {
    fullName: explicitFullName || [firstName, lastName].filter(Boolean).join(" ") || null,
    firstName,
    lastName,
    email,
    phone,
    city: cleanText(value.city, 160),
    address: cleanText(value.address, 300),
    notes: cleanText(value.notes, 500),
  };
}

function validateContacts(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_CRM_CONTACTS) {
    throw new HttpError(422, "attachment_invalid_contacts");
  }
  const contacts: AdvisorCrmContact[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const contact = validateContact(entry);
    const key = contact.email ? `email:${contact.email}` : `phone:${contact.phone?.replace(/\D/g, "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push(contact);
  }
  if (!contacts.length || contacts.length > MAX_CRM_CONTACTS) throw new HttpError(422, "attachment_invalid_contacts");
  return contacts;
}

function decodeBase64(base64: string, maxBytes: number) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length > Math.ceil(maxBytes / 3) * 4 + 8) {
    throw new HttpError(413, "attachment_too_large");
  }
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new HttpError(422, "attachment_invalid_encoding");
  }
  if (!binary.length || binary.length > maxBytes) throw new HttpError(413, "attachment_too_large");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeDataUrl(value: unknown, expectedMime: string, maxBytes: number) {
  if (typeof value !== "string" || value.length > Math.ceil(maxBytes / 3) * 4 + 200) {
    throw new HttpError(422, "attachment_data_required");
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || match[1].toLowerCase() !== expectedMime.toLowerCase()) throw new HttpError(422, "attachment_invalid_encoding");
  return { dataUrl: value, bytes: decodeBase64(match[2], maxBytes) };
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
function isPng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}
function ascii(bytes: Uint8Array, start: number, length: number) {
  return new TextDecoder("ascii").decode(bytes.subarray(start, start + length));
}
function isWebp(bytes: Uint8Array) {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
}
function assertImageMagic(mime: string, bytes: Uint8Array) {
  const valid = mime === "image/jpeg" ? isJpeg(bytes) : mime === "image/png" ? isPng(bytes) : mime === "image/webp" && isWebp(bytes);
  if (!valid) throw new HttpError(422, "attachment_mime_mismatch");
}
function assertPdf(bytes: Uint8Array) {
  if (bytes.length < 8 || ascii(bytes, 0, 5) !== "%PDF-") throw new HttpError(422, "attachment_mime_mismatch");
  const text = new TextDecoder("latin1").decode(bytes);
  if (!text.slice(-2048).includes("%%EOF") || /\/Encrypt\b/.test(text) || ACTIVE_PDF_MARKERS.some((marker) => text.includes(marker))) {
    throw new HttpError(422, "attachment_pdf_rejected");
  }
}

export async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Canonical(value: unknown) {
  return await sha256Bytes(new TextEncoder().encode(JSON.stringify(value)));
}

function readIdentity(value: InputRecord) {
  const attachmentId = cleanText(value.attachmentId, 120, true)!;
  const fileName = cleanText(value.fileName, 180, true)!;
  const mimeType = cleanText(value.mimeType, 120, true)!;
  const declaredSha256 = cleanText(value.sha256, 64, true)!;
  const sizeBytes = Number(value.sizeBytes);
  if (!SAFE_ATTACHMENT_ID.test(attachmentId) || !SAFE_FILE_NAME.test(fileName) || SENSITIVE_FILE_NAME.test(fileName) || !SHA256.test(declaredSha256)
    || !Number.isInteger(sizeBytes) || sizeBytes <= 0) throw new HttpError(422, "attachment_invalid_metadata");
  return { attachmentId, fileName, mimeType, declaredSha256, sizeBytes };
}

function warnings(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) throw new HttpError(422, "attachment_invalid_metadata");
  return value.map((entry) => cleanText(entry, 240, true)!);
}

async function validateOne(raw: unknown): Promise<ValidatedAdvisorAttachment> {
  if (!object(raw)) throw new HttpError(422, "attachment_invalid");
  const identity = readIdentity(raw);
  const kind = raw.kind;
  if (kind !== "image" && kind !== "pdf" && kind !== "crm_contacts") throw new HttpError(422, "attachment_kind_invalid");

  if (kind === "crm_contacts") {
    if (!ALLOWED_SPREADSHEET_MIMES.has(identity.mimeType) || identity.sizeBytes > MAX_CRM_FILE_BYTES) throw new HttpError(413, "attachment_too_large");
    const contacts = validateContacts(raw.contacts);
    const contentSha256 = await sha256Canonical({ declaredSha256: identity.declaredSha256, contacts });
    return { ...identity, kind, contentSha256, contacts, warnings: warnings(raw.warnings) };
  }

  const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
  if (identity.sizeBytes > maxBytes) throw new HttpError(413, "attachment_too_large");
  if (kind === "image" && !ALLOWED_IMAGE_MIMES.has(identity.mimeType)) throw new HttpError(422, "attachment_mime_rejected");
  if (kind === "pdf" && identity.mimeType !== "application/pdf") throw new HttpError(422, "attachment_mime_rejected");
  const decoded = decodeDataUrl(raw.dataUrl, identity.mimeType, maxBytes);
  if (decoded.bytes.length !== identity.sizeBytes) throw new HttpError(422, "attachment_size_mismatch");
  if (kind === "image") assertImageMagic(identity.mimeType, decoded.bytes);
  else assertPdf(decoded.bytes);
  const contentSha256 = await sha256Bytes(decoded.bytes);
  if (contentSha256 !== identity.declaredSha256) throw new HttpError(409, "attachment_hash_mismatch");
  return { ...identity, kind, contentSha256, dataUrl: decoded.dataUrl, bytes: decoded.bytes, warnings: warnings(raw.warnings) };
}

export async function validateAdvisorAttachments(raw: unknown): Promise<ValidatedAdvisorAttachment[]> {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_ADVISOR_ATTACHMENTS) throw new HttpError(422, "attachments_invalid");
  const attachments: ValidatedAdvisorAttachment[] = [];
  const ids = new Set<string>();
  let totalBytes = 0;
  for (const entry of raw) {
    const attachment = await validateOne(entry);
    if (ids.has(attachment.attachmentId)) throw new HttpError(422, "attachment_duplicate_id");
    ids.add(attachment.attachmentId);
    totalBytes += attachment.sizeBytes;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) throw new HttpError(413, "attachments_too_large");
    attachments.push(attachment);
  }
  if (attachments.filter((entry) => entry.kind === "crm_contacts").length > 1) throw new HttpError(422, "attachments_invalid");
  return attachments;
}

export function buildAdvisorAttachmentManifest(attachments: ValidatedAdvisorAttachment[]): AdvisorAttachmentManifestEntry[] {
  return attachments.map((attachment) => ({
    attachmentId: attachment.attachmentId,
    kind: attachment.kind,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    contentSha256: attachment.contentSha256,
    contactCount: attachment.contacts?.length || 0,
  }));
}

export function sameAdvisorAttachmentManifest(left: unknown, right: AdvisorAttachmentManifestEntry[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildAdvisorAttachmentModelSummaries(attachments: ValidatedAdvisorAttachment[]) {
  return attachments.map((attachment) => ({
    attachmentId: attachment.attachmentId,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    contentSha256: attachment.contentSha256,
    ...(attachment.kind === "crm_contacts" ? { contactCount: attachment.contacts?.length || 0 } : {}),
  }));
}

export function buildAdvisorOpenAIContent(
  prompt: string,
  context: unknown,
  attachments: ValidatedAdvisorAttachment[],
): Array<Record<string, unknown>> {
  const summaries = buildAdvisorAttachmentModelSummaries(attachments);
  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: JSON.stringify({ prompt, context, attachments: summaries }),
  }];
  for (const [index, attachment] of attachments.entries()) {
    if (attachment.kind === "image" && attachment.dataUrl) {
      content.push({ type: "input_image", image_url: attachment.dataUrl, detail: "auto" });
    } else if (attachment.kind === "pdf" && attachment.dataUrl) {
      content.push({ type: "input_file", filename: `restaurant-reference-${index + 1}.pdf`, file_data: attachment.dataUrl });
    }
  }
  return content;
}

export async function moderateAdvisorAttachments(prompt: string, attachments: ValidatedAdvisorAttachment[]) {
  await assertOpenAIModerationPassed(prompt);
  for (const attachment of attachments) {
    if (attachment.kind !== "image" || !attachment.dataUrl) continue;
    await assertOpenAIModerationPassed([
      { type: "text", text: "Image fournie par un restaurateur pour modifier sa page ou son menu." },
      { type: "image_url", image_url: { url: attachment.dataUrl } },
    ]);
  }
}

export function imageExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  throw new HttpError(422, "attachment_mime_rejected");
}
