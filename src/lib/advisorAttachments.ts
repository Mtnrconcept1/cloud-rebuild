import { normalizeMailingRecipientEmail } from "../../supabase/functions/_shared/marketing-mailing";
import {
  parseBoundedSpreadsheetFile,
  type SafeSpreadsheetCell,
  type SafeSpreadsheetTable,
} from "@/marketing/mailingRecipients";
import { assertSafeFileUpload } from "@/lib/uploadSecurity";

export const ADVISOR_MAX_ATTACHMENTS = 3;
export const ADVISOR_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
export const ADVISOR_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ADVISOR_MAX_PDF_BYTES = 5 * 1024 * 1024;
export const ADVISOR_MAX_SPREADSHEET_BYTES = 2 * 1024 * 1024;
export const MAX_CRM_CONTACTS = 500;

const IMAGE_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const PDF_MIME_TYPES: Record<string, string> = { "application/pdf": "pdf" };
const SPREADSHEET_MIME_TYPES: Record<string, string> = {
  "text/csv": "csv",
  "application/csv": "csv",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
const SENSITIVE_FILE_NAME = /(?:private[_ -]?key|secret|password|mot[_ -]?de[_ -]?passe|seed[_ -]?phrase|mnemonic|api[_ -]?key|service[_ -]?role|token|identit[eé]|passeport|carte[_ -]?bancaire|medical|m[eé]dical)/i;

export const ADVISOR_ATTACHMENT_ACCEPT = [
  ...Object.keys(IMAGE_MIME_TYPES),
  ...Object.keys(PDF_MIME_TYPES),
  ...Object.keys(SPREADSHEET_MIME_TYPES),
  ".csv",
  ".xls",
  ".xlsx",
].join(",");

export type AdvisorAttachmentKind = "image" | "pdf" | "crm_contacts";

export type AdvisorCrmContact = {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  notes?: string | null;
};

export type AdvisorCrmContactsReport = {
  contacts: AdvisorCrmContact[];
  duplicateCount: number;
  rejectedCount: number;
  totalRows: number;
  warnings: string[];
};

export type AdvisorPreparedAttachment = {
  id: string;
  kind: AdvisorAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  dataUrl?: string;
  contacts?: AdvisorCrmContact[];
  warnings: string[];
};

export type AdvisorAttachmentPlanPayload = {
  attachmentId: string;
  kind: AdvisorAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  dataUrl?: string;
  contacts?: AdvisorCrmContact[];
  warnings?: string[];
};

export type AdvisorAttachmentModelSummary = {
  attachmentId: string;
  kind: AdvisorAttachmentKind;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  contactCount?: number;
};

type PartialPreparedAttachment = Omit<AdvisorPreparedAttachment, "sha256"> & { sha256?: string };

type CrmColumn = keyof Pick<
  AdvisorCrmContact,
  "fullName" | "firstName" | "lastName" | "email" | "phone" | "city" | "address" | "notes"
>;

const CRM_HEADER_ALIASES: Record<string, CrmColumn> = {
  nomcomplet: "fullName",
  fullname: "fullName",
  name: "fullName",
  client: "fullName",
  customer: "fullName",
  contact: "fullName",
  prenom: "firstName",
  firstname: "firstName",
  nom: "lastName",
  lastname: "lastName",
  surname: "lastName",
  email: "email",
  emails: "email",
  emailaddress: "email",
  adresseemail: "email",
  courriel: "email",
  mail: "email",
  telephone: "phone",
  tel: "phone",
  phone: "phone",
  mobile: "phone",
  portable: "phone",
  ville: "city",
  city: "city",
  localite: "city",
  adresse: "address",
  address: "address",
  rue: "address",
  notes: "notes",
  note: "notes",
  commentaire: "notes",
  commentaires: "notes",
};

function headerKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function fileExtension(fileName: string) {
  return fileName.includes(".") ? fileName.split(".").pop()?.trim().toLowerCase() || "" : "";
}

function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(reader.result)
      : reject(new Error("La pièce jointe ne peut pas être lue."));
    reader.onerror = () => reject(new Error("La pièce jointe ne peut pas être lue."));
    reader.readAsArrayBuffer(file);
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function toDataUrl(bytes: Uint8Array, mimeType: string) {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

async function sha256(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) throw new Error("Votre navigateur ne permet pas de vérifier l’intégrité du fichier.");
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function isWebp(bytes: Uint8Array) {
  return bytes.length >= 12
    && new TextDecoder("ascii").decode(bytes.subarray(0, 4)) === "RIFF"
    && new TextDecoder("ascii").decode(bytes.subarray(8, 12)) === "WEBP";
}

function isPdf(bytes: Uint8Array) {
  if (bytes.length < 8 || new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-") return false;
  const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  return tail.includes("%%EOF");
}

function assertMagicBytes(kind: AdvisorAttachmentKind, mimeType: string, bytes: Uint8Array) {
  const valid = kind === "pdf"
    ? isPdf(bytes)
    : mimeType === "image/jpeg"
      ? isJpeg(bytes)
      : mimeType === "image/png"
        ? isPng(bytes)
        : mimeType === "image/webp" && isWebp(bytes);
  if (!valid) throw new Error("Le contenu réel du fichier ne correspond pas au format annoncé.");
}

function inferKind(file: File): AdvisorAttachmentKind {
  const extension = fileExtension(file.name);
  if (IMAGE_MIME_TYPES[file.type]) return "image";
  if (PDF_MIME_TYPES[file.type]) return "pdf";
  if (SPREADSHEET_MIME_TYPES[file.type] || ["csv", "xls", "xlsx"].includes(extension)) return "crm_contacts";
  throw new Error("Format non autorisé. Utilisez JPEG, PNG, WebP, PDF, CSV, XLS ou XLSX.");
}

function maxBytesForKind(kind: AdvisorAttachmentKind) {
  if (kind === "image") return ADVISOR_MAX_IMAGE_BYTES;
  if (kind === "pdf") return ADVISOR_MAX_PDF_BYTES;
  return ADVISOR_MAX_SPREADSHEET_BYTES;
}

function allowedTypesForKind(kind: AdvisorAttachmentKind) {
  if (kind === "image") return IMAGE_MIME_TYPES;
  if (kind === "pdf") return PDF_MIME_TYPES;
  return SPREADSHEET_MIME_TYPES;
}

function cleanText(value: string, maxLength: number) {
  const trimmed = value
    // eslint-disable-next-line no-control-regex -- intentionally strip ASCII control characters from uploaded data.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function isSpreadsheetFormula(value: string, allowInternationalPhone = false) {
  const trimmed = value.trim();
  if (/^[=@]/.test(trimmed)) return true;
  if (!/^[+-]/.test(trimmed)) return false;
  if (allowInternationalPhone && /^\+\d[\d().\s-]{6,39}$/.test(trimmed)) return false;
  return true;
}

function normalizePhone(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  if (isSpreadsheetFormula(clean, true) || /[\r\n]/.test(clean) || clean.length > 40) return null;
  const compact = clean.replace(/[().\s-]/g, "");
  const normalized = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  if (!/^\+?\d{7,20}$/.test(normalized)) return null;
  return clean.slice(0, 40);
}

function locateCrmColumns(table: SafeSpreadsheetTable) {
  const firstContentRow = table.rows.findIndex((row) => row.some((cell) => cell.value.trim() || cell.formula));
  if (firstContentRow < 0) return null;
  const header = table.rows[firstContentRow];
  const columns = new Map<CrmColumn, number>();
  header.forEach((cell, index) => {
    if (cell.formula) return;
    const column = CRM_HEADER_ALIASES[headerKey(cell.value)];
    if (column && !columns.has(column)) columns.set(column, index);
  });
  if (!columns.has("email") && !columns.has("phone")) return null;
  return { firstContentRow, columns };
}

function valueAt(row: SafeSpreadsheetCell[], columns: Map<CrmColumn, number>, field: CrmColumn) {
  const index = columns.get(field);
  return index === undefined ? undefined : row[index];
}

function contactFromRow(row: SafeSpreadsheetCell[], columns: Map<CrmColumn, number>) {
  const referenced = [...columns.values()].map((index) => row[index]).filter(Boolean);
  if (!referenced.some((cell) => cell.value.trim() || cell.formula)) return { contact: null, rejected: false };
  const containsFormula = [...columns.entries()].some(([field, index]) => {
    const cell = row[index];
    return Boolean(cell && (cell.formula || isSpreadsheetFormula(cell.value, field === "phone")));
  });
  if (containsFormula) return { contact: null, rejected: true, reason: "formule ignorée" };

  const rawEmail = valueAt(row, columns, "email")?.value || "";
  const rawPhone = valueAt(row, columns, "phone")?.value || "";
  const email = rawEmail ? normalizeMailingRecipientEmail(rawEmail) : null;
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if ((rawEmail && !email) || (rawPhone && !phone) || (!email && !phone)) {
    return { contact: null, rejected: true, reason: "contact sans e-mail ou téléphone valide" };
  }

  const firstName = cleanText(valueAt(row, columns, "firstName")?.value || "", 120);
  const lastName = cleanText(valueAt(row, columns, "lastName")?.value || "", 120);
  const explicitFullName = cleanText(valueAt(row, columns, "fullName")?.value || "", 240);
  const fullName = explicitFullName || cleanText([firstName, lastName].filter(Boolean).join(" "), 240);
  const contact: AdvisorCrmContact = {
    fullName,
    firstName,
    lastName,
    email,
    phone,
    city: cleanText(valueAt(row, columns, "city")?.value || "", 160),
    address: cleanText(valueAt(row, columns, "address")?.value || "", 300),
    notes: cleanText(valueAt(row, columns, "notes")?.value || "", 500),
  };
  return { contact, rejected: false };
}

export async function parseAdvisorCrmContactsFile(file: File): Promise<AdvisorCrmContactsReport> {
  assertSafeFileUpload(file, {
    allowedMimeTypes: SPREADSHEET_MIME_TYPES,
    maxBytes: ADVISOR_MAX_SPREADSHEET_BYTES,
    label: "Fichier CRM",
  });
  const { tables, warnings: parserWarnings } = await parseBoundedSpreadsheetFile(file);
  const contacts: AdvisorCrmContact[] = [];
  const seen = new Set<string>();
  const warnings = [...parserWarnings];
  let duplicateCount = 0;
  let rejectedCount = 0;
  let totalRows = 0;
  let recognizedTable = false;

  for (const table of tables) {
    const located = locateCrmColumns(table);
    if (!located) {
      warnings.push(`${table.name} : aucune colonne Email ou Téléphone reconnue, feuille ignorée.`);
      continue;
    }
    recognizedTable = true;
    for (let index = located.firstContentRow + 1; index < table.rows.length; index += 1) {
      const result = contactFromRow(table.rows[index], located.columns);
      if (!result.contact && !result.rejected) continue;
      totalRows += 1;
      if (result.rejected || !result.contact) {
        rejectedCount += 1;
        if (warnings.length < 30) warnings.push(`${table.name}, ligne ${index + 1} : ${result.reason || "ligne ignorée"}.`);
        continue;
      }
      const dedupeKey = result.contact.email ? `email:${result.contact.email}` : `phone:${result.contact.phone?.replace(/\D/g, "")}`;
      if (seen.has(dedupeKey)) {
        duplicateCount += 1;
        continue;
      }
      if (contacts.length >= MAX_CRM_CONTACTS) throw new Error(`Importez au maximum ${MAX_CRM_CONTACTS} contacts distincts à la fois.`);
      seen.add(dedupeKey);
      contacts.push(result.contact);
    }
  }

  if (!recognizedTable) throw new Error("Aucune feuille ne contient une colonne Email ou Téléphone reconnue.");
  if (!contacts.length) throw new Error("Aucun contact CRM valide n’a été trouvé dans ce fichier.");
  return { contacts, duplicateCount, rejectedCount, totalRows, warnings };
}

export function buildAdvisorAttachmentModelSummary(
  attachment: {
    id: string;
    kind: AdvisorAttachmentKind;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256?: string;
    contacts?: AdvisorCrmContact[];
    warnings?: string[];
  },
): AdvisorAttachmentModelSummary {
  return {
    attachmentId: attachment.id,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    ...(attachment.sha256 ? { sha256: attachment.sha256 } : {}),
    ...(attachment.kind === "crm_contacts" ? { contactCount: attachment.contacts?.length || 0 } : {}),
  };
}

export function toAdvisorAttachmentPlanPayload(attachment: AdvisorPreparedAttachment): AdvisorAttachmentPlanPayload {
  return {
    attachmentId: attachment.id,
    kind: attachment.kind,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    sha256: attachment.sha256,
    ...(attachment.dataUrl ? { dataUrl: attachment.dataUrl } : {}),
    ...(attachment.contacts ? { contacts: attachment.contacts } : {}),
    ...(attachment.warnings.length ? { warnings: attachment.warnings } : {}),
  };
}

async function prepareSingleAttachment(file: File): Promise<PartialPreparedAttachment> {
  if (SENSITIVE_FILE_NAME.test(file.name)) {
    throw new Error("Le nom du fichier semble contenir une donnée sensible. Renommez-le et vérifiez son contenu avant de le joindre.");
  }
  const kind = inferKind(file);
  const allowedMimeTypes = allowedTypesForKind(kind);
  if (kind === "crm_contacts" && !allowedMimeTypes[file.type]) {
    const extension = fileExtension(file.name);
    const fallbackType = extension === "csv"
      ? "text/csv"
      : extension === "xls"
        ? "application/vnd.ms-excel"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    file = new File([await readFileBytes(file)], file.name, { type: fallbackType, lastModified: file.lastModified });
  }
  assertSafeFileUpload(file, {
    allowedMimeTypes,
    maxBytes: maxBytesForKind(kind),
    label: "Pièce jointe",
  });

  const id = globalThis.crypto?.randomUUID?.() || `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (kind === "crm_contacts") {
    const report = await parseAdvisorCrmContactsFile(file);
    const bytes = new Uint8Array(await readFileBytes(file));
    return {
      id,
      kind,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      sha256: await sha256(bytes),
      contacts: report.contacts,
      warnings: report.warnings,
    };
  }

  const bytes = new Uint8Array(await readFileBytes(file));
  assertMagicBytes(kind, file.type, bytes);
  return {
    id,
    kind,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    sha256: await sha256(bytes),
    dataUrl: toDataUrl(bytes, file.type),
    warnings: [],
  };
}

export async function prepareAdvisorAttachmentFiles(files: File[] | FileList): Promise<AdvisorPreparedAttachment[]> {
  const list = Array.from(files);
  if (!list.length) return [];
  if (list.length > ADVISOR_MAX_ATTACHMENTS) throw new Error(`Joignez au maximum ${ADVISOR_MAX_ATTACHMENTS} fichiers à la fois.`);
  const totalBytes = list.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > ADVISOR_MAX_TOTAL_BYTES) throw new Error("Les pièces jointes dépassent 8 Mo au total.");
  const prepared = await Promise.all(list.map(prepareSingleAttachment));
  const crmFiles = prepared.filter((attachment) => attachment.kind === "crm_contacts");
  if (crmFiles.length > 1) throw new Error("Importez une seule liste CRM à la fois.");
  return prepared as AdvisorPreparedAttachment[];
}

/** Keep vague image/PDF submissions out of the mutation planner until an action is specified. */
export function needsAdvisorAttachmentInstruction(
  attachments: Array<Pick<AdvisorPreparedAttachment, "kind">>,
  instruction: string,
): boolean {
  return attachments.some((attachment) => attachment.kind === "image" || attachment.kind === "pdf")
    && instruction.trim().length < 5;
}

/** Show actionable copy instead of exposing internal attachment rejection codes. */
export function getAdvisorEditErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("attachment_content_rejected")) {
    return "Le fichier semble contenir des données sensibles ou ne correspond pas à une activité du restaurant. Pour une carte ou un menu, joignez une photo lisible sans informations personnelles et précisez la modification souhaitée.";
  }
  if (message.includes("attachment_hash_mismatch")) {
    return "La pièce jointe a changé depuis la proposition. Retirez-la, joignez-la à nouveau et recommencez.";
  }
  if (message.includes("Plat non identifié") || message.includes("Élément introuvable dans ce restaurant")) {
    return "Aucun plat existant n'a pu être identifié avec certitude. Précisez le nom exact du plat enregistré dans votre menu et la modification souhaitée. Rien n'a été modifié.";
  }
  if (message.includes("ai_empty_response") || message.includes("ai_invalid_response")) {
    return "L'analyse IA n'a pas produit de proposition exploitable. Réessayez avec une instruction précise, par exemple le plat à modifier. Rien n'a été modifié.";
  }
  return message || "La modification n'a pas pu être préparée.";
}
