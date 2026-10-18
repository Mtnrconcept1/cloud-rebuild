/** Shared, provider-free contract for the mailing UI, BFF and Edge function. */
export const MAILING_FIELDS = {
  canton: "Cantons", city: "Villes", commune: "Communes", postal_code: "Codes postaux",
  category: "Cuisines / catégories", branch: "Types d’établissement", company_size: "Tailles d’entreprise",
  locale: "Langues", source_system: "Sources des contacts", lifecycle_status: "Statuts des contacts",
} as const;
export type MailingField = keyof typeof MAILING_FIELDS;
export type MailingSelections = Partial<Record<MailingField, string[]>>;
export type MailingOptions = {
  selections: MailingSelections;
  emailCount: number;
  cadence: "daily" | "every_other_day" | "twice_weekly" | "weekly" | "biweekly";
};
export type MailingFacetPage = { items: Array<{ value: string; count: number }>; next: string | null };
export class MailingInputError extends Error {}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

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
  if (!object(value) || Object.keys(value).some((key) => !["selections", "emailCount", "cadence"].includes(key))) throw new MailingInputError("Configuration mailing invalide.");
  const selections = parseMailingSelections(value.selections);
  if (Object.values(selections).some((values) => !values.length)) throw new MailingInputError("Cochez une valeur ou « Tous » dans chaque rubrique.");
  if (typeof value.emailCount !== "number" || !Number.isInteger(value.emailCount) || value.emailCount < 1 || value.emailCount > 12) throw new MailingInputError("Choisissez entre 1 et 12 e-mails.");
  if (!["daily", "every_other_day", "twice_weekly", "weekly", "biweekly"].includes(String(value.cadence))) throw new MailingInputError("Fréquence invalide.");
  return { selections, emailCount: value.emailCount, cadence: value.cadence as MailingOptions["cadence"] };
}

export function mailingAudience(selections: MailingSelections) {
  return { audience_kind: "restaurant", selections: parseMailingSelections(selections) };
}

export function mailingScheduleOptions(options: MailingOptions) {
  return { templateIds: [], postCount: options.emailCount, cadence: options.cadence, formatsByChannel: { email: ["16:9" as const] } };
}

export function mailingAudienceLabel(selections: MailingSelections): string {
  return Object.entries(selections).map(([field, values]) => `${MAILING_FIELDS[field as MailingField]} : ${values.join(", ")}`).join(" · ") || "Tous les restaurants";
}

/** Only a new mailing's native banner is mandatory; legacy email contracts stay unchanged. */
export function assertMailingReady(content: Record<string, unknown>) {
  if (content.mailing_version !== "tok-mailing-v1") return;
  let url: URL;
  try { url = new URL(String(content.visual_url || "")); } catch { throw new MailingInputError("La bannière TOK doit être générée avant validation."); }
  if (url.protocol !== "https:" || url.username || url.password || content.visual_status !== "ready" ||
    !["subject", "headline", "body", "call_to_action"].every((key) => typeof content[key] === "string" && String(content[key]).trim())) {
    throw new MailingInputError("Relisez et complétez le texte et la bannière TOK avant validation.");
  }
}
