import { HttpError } from "./auth.ts";
import { applyCampaignOptions, CAMPAIGN_TEMPLATES, type CampaignOptions } from "./marketing-campaign-options.ts";
import { normalizeLegacySocialPlan, socialEditorialPrompt } from "./marketing-social-editorial.ts";
import {
  createOpenAIResponse,
  estimateOpenAITextCostChf,
  extractUsage,
  parseStructuredOutput,
  selectTokAiModel,
} from "./openai.ts";
import {
  MarketingPlanError,
  buildPlanSchema,
  buildGuidedPlanSchema,
  validatePlan,
  validateGuidedPlan,
  type MarketingPlan,
  type MarketingPostFormat,
} from "./marketing-ai-plan.ts";

export {
  MARKETING_CHANNELS,
  slugifyCampaignName,
  stripEmptySelectors,
  toBundlePayload,
  type MarketingChannel,
  type MarketingPlan,
  type MarketingPlanItem,
  type MarketingPostFormat,
} from "./marketing-ai-plan.ts";

export { generateCampaignVisual } from "./marketing-visual.ts";

export type MarketingBriefContext = {
  objective: string;
  allowedChannels: readonly string[];
  connectedChannels: readonly string[];
  audienceHint: string;
  startsAt: string;
  endsAt: string;
  itemCount: number;
  locale: string;
  campaignOptions?: CampaignOptions;
  formats?: Partial<Record<string, MarketingPostFormat>>;
};

function buildSystemPrompt(context: MarketingBriefContext) {
  const blocked = context.allowedChannels.filter((c) => !context.connectedChannels.includes(c));

  return [
    "Tu es le planificateur marketing de Tok, une plateforme suisse de restauration.",
    "Tu produis un plan de campagne complet, prêt à être relu par un administrateur humain.",
    "",
    "Règles absolues :",
    "- Écris tout le contenu destiné au public en français de Suisse romande.",
    "- Les montants sont en CHF, les horaires en Europe/Zurich.",
    "- N'invente jamais de promotion, de prix, de partenariat ou de chiffre que le brief ne fournit pas.",
    "- Reste sobre : pas de superlatif creux, pas de promesse que l'entreprise ne peut pas tenir.",
    "- Chaque élément doit cibler une audience cohérente avec son canal.",
    "",
    `Canaux autorisés : ${context.allowedChannels.join(", ") || "aucun"}.`,
    blocked.length > 0
      ? `Attention, ces canaux n'ont pas d'intégration connectée et resteront bloqués tant qu'un administrateur ne les aura pas configurés : ${blocked.join(", ")}. Tu peux les planifier, mais privilégie les canaux connectés.`
      : "Tous les canaux autorisés disposent d'une intégration connectée.",
    "",
    "Sélecteurs d'audience disponibles : audience_kind (restaurant, client, mixed), canton (code à deux lettres), city, category, contact_type.",
    "Au moins un sélecteur doit être renseigné ; mets null pour ceux qui ne s'appliquent pas.",
    "",
    `Produis exactement ${context.itemCount} élément(s) de calendrier, répartis entre ${context.startsAt} et ${context.endsAt}.`,
    ...(context.campaignOptions ? [
      "Thèmes sélectionnés et contraintes éditoriales (couvre ces thèmes sans inventer d'offre) :",
      "Les fonctionnalités dépendent de leur activation et de l'éligibilité de la formule. N'invente ni prix, ni quota, ni promotion. Distingue toujours l'audience client de l'audience restaurateur.",
      ...CAMPAIGN_TEMPLATES.filter((template) => context.campaignOptions!.templateIds.includes(template.id)).map((template) => `${template.label} — audience ${template.audience} : ${template.guidance}`),
      "Chaque élément correspond à un post éditorial avec ses variantes par réseau. Ne duplique pas les éléments pour les formats : le serveur les décline.",
      "Renseigne obligatoirement visual_prompt pour chaque post, partagé par les réseaux ; n'y inscris ni URL ni mention. La cadence et les formats seront fixés par le serveur.",
      ...socialEditorialPrompt(context.campaignOptions.templateIds, context.audienceHint),
    ] : socialEditorialPrompt(CAMPAIGN_TEMPLATES.map((template) => template.id), context.audienceHint, false)),
    `Formats visuels demandés par canal : ${JSON.stringify(context.campaignOptions?.formatsByChannel || context.formats || {})}. Compose chaque visuel pour son format sans placer de texte important près des bords.`,
    ...(!context.campaignOptions ? ["Renseigne visual_prompt uniquement pour les canaux où une image a du sens (réseaux sociaux, e-mail), sinon null."] : []),
    "Le champ subject n'est renseigné que pour le canal email.",
  ].join("\n");
}

export async function generateMarketingPlan(context: MarketingBriefContext) {
  const model = selectTokAiModel("strategy");

  const response = await createOpenAIResponse({
    model,
    input: [
      { role: "system", content: buildSystemPrompt(context) },
      {
        role: "user",
        content: [
          `Objectif de la campagne : ${context.objective}`,
          context.audienceHint ? `Audience visée : ${context.audienceHint}` : "",
          `Fenêtre : du ${context.startsAt} au ${context.endsAt}.`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    jsonSchema: context.campaignOptions ? buildGuidedPlanSchema(context.allowedChannels, context.campaignOptions.templateIds) : buildPlanSchema(context.allowedChannels),
    maxOutputTokens: context.campaignOptions ? 12000 : 8000,
    timeoutMs: 90_000,
  });

  const usage = extractUsage(response);
  let plan: MarketingPlan;
  try {
    const output = parseStructuredOutput<MarketingPlan>(response);
    plan = context.campaignOptions
      ? validateGuidedPlan(output, context.allowedChannels, context.campaignOptions.templateIds, context.itemCount)
      : validatePlan(output, context.allowedChannels);
    if (plan.items.length !== context.itemCount) throw new MarketingPlanError("item_count_mismatch");
    if (context.campaignOptions) {
      plan = applyCampaignOptions(plan, context.campaignOptions, context.allowedChannels, context.startsAt, context.endsAt, context.audienceHint);
    } else {
      plan = normalizeLegacySocialPlan(plan, context.objective, context.audienceHint);
    }
  } catch (error) {
    // A rejected plan is a provider-quality problem, not a caller mistake; the
    // reason travels into the audit log without carrying any generated content.
    if (error instanceof MarketingPlanError) {
      throw new HttpError(502, "ai_invalid_plan", { reason: error.reason, ...error.details });
    }
    throw error;
  }

  return {
    plan,
    model,
    usage,
    estimatedCostChf: estimateOpenAITextCostChf(
      model,
      usage.input_tokens || 0,
      usage.output_tokens || 0,
    ),
  };
}
