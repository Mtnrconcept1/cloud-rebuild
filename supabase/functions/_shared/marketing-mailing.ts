/** Shared, provider-free contract for the mailing UI, BFF and Edge function. */
export const MAILING_FIELDS = {
  canton: "Cantons", city: "Villes", commune: "Communes", postal_code: "Codes postaux",
  category: "Cuisines / catégories", branch: "Types d’établissement", company_size: "Tailles d’entreprise",
  locale: "Langues", source_system: "Sources des contacts", lifecycle_status: "Statuts des contacts",
} as const;
export type MailingField = keyof typeof MAILING_FIELDS;
export type MailingSelections = Partial<Record<MailingField, string[]>>;
export type MailingImageMode = "generated" | "manual";
export const MAILING_MAX_RECIPIENTS = 500;
export type MailingOptions = {
  selections: MailingSelections;
  emailCount: number;
  cadence: "daily" | "every_other_day" | "twice_weekly" | "weekly" | "biweekly";
  /** Omitted by legacy callers; generated remains their default. */
  imageMode?: MailingImageMode;
  /** When present, this is the complete and exclusive audience. */
  recipientEmails?: string[];
};
export type MailingFacetPage = { items: Array<{ value: string; count: number }>; next: string | null };
export class MailingInputError extends Error {}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** ASCII mailbox contract shared with the import UI and the database. */
export function isValidMailingRecipientEmail(value: string): boolean {
  if (!value || value.length > 254 || !/^[\x21-\x7e]+$/.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..") ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => label.length > 0 && label.length <= 63 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}

export function normalizeMailingRecipientEmail(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 256 || /[\r\n]/.test(value)) return null;
  const email = value.trim().toLowerCase();
  return isValidMailingRecipientEmail(email) ? email : null;
}

/** Never coerce, discard, or turn an explicit empty/invalid list into "all". */
export function parseMailingRecipientEmails(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAILING_MAX_RECIPIENTS) {
    throw new MailingInputError(`Renseignez entre 1 et ${MAILING_MAX_RECIPIENTS} adresses e-mail.`);
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const email = normalizeMailingRecipientEmail(entry);
    if (!email) throw new MailingInputError("Adresse e-mail invalide.");
    if (!seen.has(email)) { seen.add(email); normalized.push(email); }
  }
  return normalized;
}

/** Missing field = all values, including unknowns. Empty list = none, NEVER all. */
export function parseMailingSelections(value: unknown): MailingSelections {
  if (!object(value) || Object.keys(value).some((key) => !Object.prototype.hasOwnProperty.call(MAILING_FIELDS, key))) throw new MailingInputError("Critère de ciblage inconnu.");
  const result: MailingSelections = {};
  for (const [field, values] of Object.entries(value)) {
    if (!Array.isArray(values) || values.length > 100 || values.some((entry) => typeof entry !== "string" || !entry.trim() || entry.length > 240)) {
      throw new MailingInputError("Sélection invalide : maximum 100 valeurs par rubrique.");
    }
    result[field as MailingField] = [...new Set(values.map((entry: string) => entry.trim()))];
  }
  return result;
}

export function parseMailingOptions(value: unknown): MailingOptions | undefined {
  if (value === undefined) return undefined;
  if (!object(value) || Object.keys(value).some((key) => !["selections", "emailCount", "cadence", "imageMode", "recipientEmails"].includes(key))) throw new MailingInputError("Configuration mailing invalide.");
  const selections = parseMailingSelections(value.selections);
  if (Object.values(selections).some((values) => !values.length)) throw new MailingInputError("Cochez une valeur ou « Tous » dans chaque rubrique.");
  if (typeof value.emailCount !== "number" || !Number.isInteger(value.emailCount) || value.emailCount < 1 || value.emailCount > 12) throw new MailingInputError("Choisissez entre 1 et 12 e-mails.");
  if (!["daily", "every_other_day", "twice_weekly", "weekly", "biweekly"].includes(String(value.cadence))) throw new MailingInputError("Fréquence invalide.");
  if (value.imageMode !== undefined && value.imageMode !== "generated" && value.imageMode !== "manual") throw new MailingInputError("Choisissez « Image générée » ou « Import manuel ».");
  const recipientEmails = Object.prototype.hasOwnProperty.call(value, "recipientEmails")
    ? parseMailingRecipientEmails(value.recipientEmails) : undefined;
  if (recipientEmails && Object.keys(selections).length > 0) throw new MailingInputError("Choisissez les filtres de restaurants ou une liste de destinataires.");
  return { selections, emailCount: value.emailCount, cadence: value.cadence as MailingOptions["cadence"],
    imageMode: value.imageMode === "manual" ? "manual" : "generated", ...(recipientEmails ? { recipientEmails } : {}) };
}

export function mailingAudience(selections: MailingSelections, recipientEmails?: string[]) {
  const parsed = parseMailingSelections(selections);
  if (recipientEmails !== undefined) {
    if (Object.keys(parsed).length > 0) throw new MailingInputError("La liste de destinataires ne peut pas être combinée avec des filtres.");
    return { audience_kind: "mixed", recipient_emails: parseMailingRecipientEmails(recipientEmails) };
  }
  return { audience_kind: "restaurant", selections: parsed };
}

export function mailingScheduleOptions(options: MailingOptions) {
  return { templateIds: [], postCount: options.emailCount, cadence: options.cadence, formatsByChannel: { email: ["16:9" as const] } };
}

export function mailingAudienceLabel(selections: MailingSelections, recipientEmails?: string[]): string {
  if (recipientEmails !== undefined) return `${parseMailingRecipientEmails(recipientEmails).length} destinataire(s) sélectionné(s)`;
  return Object.entries(selections).map(([field, values]) => `${MAILING_FIELDS[field as MailingField]} : ${values.join(", ")}`).join(" · ") || "Tous les restaurants";
}

/** Only a new mailing's native banner is mandatory; legacy email contracts stay unchanged. */
export function assertMailingReady(content: Record<string, unknown>) {
  if (content.mailing_version !== "tok-mailing-v1") return;
  let url: URL;
  try { url = new URL(String(content.visual_url || "")); } catch { throw new MailingInputError("Ajoutez une image générée ou importée avant validation."); }
  if (url.protocol !== "https:" || url.username || url.password || content.visual_status !== "ready" ||
    !["subject", "headline", "body", "call_to_action"].every((key) => typeof content[key] === "string" && String(content[key]).trim())) {
    throw new MailingInputError("Relisez et complétez le texte et la bannière TOK avant validation.");
  }
}
