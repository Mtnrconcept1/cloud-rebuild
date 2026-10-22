import { buildCampaignSlots } from "./marketing-campaign-request.ts";
import { MarketingPlanError, type MarketingPlan } from "./marketing-ai-plan.ts";
import { MAILING_FIELDS, mailingAudience, mailingAudienceLabel, mailingScheduleOptions, parseMailingOptions, type MailingField, type MailingOptions, type MailingFacetPage } from "./marketing-mailing.ts";
import { createOpenAIResponse, parseStructuredOutput, selectTokAiModel } from "./openai.ts";

export function applyMailingOptions(plan: MarketingPlan, options: MailingOptions, startsAt: string, endsAt: string): MarketingPlan {
  const slots = buildCampaignSlots(mailingScheduleOptions(options), ["email"], startsAt);
  if (plan.items.length !== options.emailCount || slots.some((slot) => Date.parse(slot.scheduledAt) > Date.parse(endsAt))) throw new MarketingPlanError("mailing_count_or_window_invalid");
  const target = mailingAudience(options.selections, options.recipientEmails);
  const audienceName = mailingAudienceLabel(options.selections, options.recipientEmails).slice(0, 160);
  const imageMode = options.imageMode === "manual" ? "manual" : "generated";
  if (imageMode === "generated" && plan.items.some((item) => !item.visual_prompt?.trim())) throw new MarketingPlanError("missing_mailing_banner");
  const subjects = new Set<string>();
  const bodies = new Set<string>();
  for (const item of plan.items) {
    const subject = item.content.subject?.trim();
    const body = item.content.body?.trim();
    if (item.channel !== "email" || !subject || subject.length > 200 || !body || body.length > 20000 ||
      !item.content.headline?.trim() || !item.content.call_to_action?.trim() || subjects.has(subject.toLowerCase()) || bodies.has(body.toLowerCase())) {
      throw new MarketingPlanError("mailing_copy_invalid");
    }
    subjects.add(subject.toLowerCase()); bodies.add(body.toLowerCase());
  }
  return {
    campaign: { ...plan.campaign, channels: ["email"], starts_at: startsAt, ends_at: endsAt, audience_definition: target, audience_name: audienceName },
    items: plan.items.map((item, index) => ({ ...item, channel: "email", scheduled_at: slots[index].scheduledAt,
      targeting: target, audience_name: audienceName, visual_format: "16:9", visual_prompt: imageMode === "manual" ? null : item.visual_prompt?.trim() || null,
      content: { ...item.content, hashtags: [] }, mailing_version: "tok-mailing-v1", mailing_image_mode: imageMode })),
  };
}

type Facets = Record<MailingField, MailingFacetPage>;
/** Provider suggestions can only refer to known facet values. Unresolved criteria stay visible. */
export function validateMailingInterpretation(raw: unknown, facets: Facets) {
  const value = raw as { selections?: unknown; emailCount?: unknown; cadence?: unknown; unresolved?: unknown; summary?: unknown };
  const options = parseMailingOptions({ selections: value?.selections, emailCount: value?.emailCount, cadence: value?.cadence })!;
  for (const [field, values] of Object.entries(options.selections)) {
    if (values.some((entry) => !facets[field as MailingField].items.some((item) => item.value === entry))) throw new MarketingPlanError("unknown_mailing_selection");
  }
  if (!Array.isArray(value.unresolved) || value.unresolved.length > 20 || value.unresolved.some((entry) => typeof entry !== "string" || entry.length > 500) ||
    typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 1000) throw new MarketingPlanError("mailing_interpretation_invalid");
  return { mailingOptions: options, unresolved: value.unresolved as string[], summary: value.summary };
}

export async function interpretMailingBrief(prompt: string, facets: Facets) {
  const fields = Object.keys(MAILING_FIELDS) as MailingField[];
  const response = await createOpenAIResponse({
    model: selectTokAiModel("strategy"), timeoutMs: 60_000, maxOutputTokens: 3000,
    input: [{ role: "system", content: [
      "Interprète un brief de campagne e-mail TOK visant des restaurants. Tu ne génères ni image ni envoi.",
      "Extrais le nombre d’e-mails (1 à 12) et la fréquence. Par défaut : 4 e-mails, weekly. Un mois à un e-mail/semaine = 4 e-mails.",
      "Sélections : utilise uniquement les valeurs exactes du catalogue fourni. null = tous ; ne choisis aucun critère non demandé. Les rubriques se croisent par ET, les valeurs par OU.",
      "Genève sans précision de canton désigne la ville. Pizzeria ne signifie pas tous les restaurants italiens. Inclure les valeurs équivalentes explicites (Pizzeria et italian_pizza si disponibles).",
      "Tout critère absent du catalogue, ambigu, contradictoire ou non pris en charge DOIT figurer dans unresolved. Ne prétends jamais que la cible demandée a été trouvée dans ce cas. Une limite dépassée doit aussi figurer dans unresolved.",
      "Le catalogue peut être partiel (next non null). N’invente aucune valeur manquante. Réponds en français.",
      JSON.stringify(facets),
    ].join("\n") }, { role: "user", content: prompt }],
    jsonSchema: { name: "tok_mailing_brief", strict: true, schema: {
      type: "object", additionalProperties: false, required: ["selections", "emailCount", "cadence", "unresolved", "summary"],
      properties: {
        selections: { type: "object", additionalProperties: false, required: fields,
          // Keep the schema bounded as catalogs grow. Exact catalog membership
          // is enforced by validateMailingInterpretation before returning values.
          properties: Object.fromEntries(fields.map((field) => [field, { anyOf: [{ type: "null" }, { type: "array", items: { type: "string" } }] }])) },
        emailCount: { type: "integer", minimum: 1, maximum: 12 },
        cadence: { type: "string", enum: ["daily", "every_other_day", "twice_weekly", "weekly", "biweekly"] },
        unresolved: { type: "array", items: { type: "string" } }, summary: { type: "string" },
      },
    } },
  });
  const raw = parseStructuredOutput<Record<string, unknown>>(response);
  if (raw.selections && typeof raw.selections === "object" && !Array.isArray(raw.selections)) {
    raw.selections = Object.fromEntries(Object.entries(raw.selections).filter(([, value]) => value !== null));
  }
  return validateMailingInterpretation(raw, facets);
}
