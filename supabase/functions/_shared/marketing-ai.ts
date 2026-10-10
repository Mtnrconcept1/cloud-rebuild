import { HttpError } from "./auth.ts";
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
  validatePlan,
  validateGenerationWindow,
  MARKETING_DESTINATION_PATHS,
  type MarketingPlan,
} from "./marketing-ai-plan.ts";

export {
  MARKETING_CHANNELS,
  slugifyCampaignName,
  stripEmptySelectors,
  toBundlePayload,
  type MarketingChannel,
  type MarketingPlan,
  type MarketingPlanItem,
} from "./marketing-ai-plan.ts";

const VISUAL_BUCKET = "social-post-media";
const IMAGE_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_MODEL = "gpt-image-2";

export type MarketingBriefContext = {
  objective: string;
  allowedChannels: readonly string[];
  connectedChannels: readonly string[];
  audienceHint: string;
  startsAt: string;
  endsAt: string;
  itemCount: number;
  locale: string;
};

export function buildSystemPrompt(context: MarketingBriefContext) {
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
    "- Le targeting de chaque élément doit être strictement identique à audience_definition de la campagne, valeurs nulles comprises. Ne remplace jamais restaurant_prospect par restaurant_lead.",
    "- Utilise chaque canal sélectionné au moins une fois. in_app et push concernent des comptes inscrits, jamais une audience restaurant_prospect ou restaurant_lead sans compte.",
    "- Une publication organique ne garantit aucune portée géographique ni aucun nombre de prospects atteints. Ne présente pas les filtres de ciblage comme un achat publicitaire.",
    "- Construis une progression : découverte du problème, comparaison documentée, réponse aux objections, puis conversion. Ne répète pas le même texte sur un même canal.",
    "- Renseigne strategy : conversion_goal concret, measurement_plan fondé sur visites et demandes réellement observées, comparison_basis limité aux faits fournis.",
    "- Si le brief donne 5 CHF par table, parle de commission par table réservée selon les conditions de l’offre. Cela ne signifie ni absence d’abonnement, ni absence de tout autre frais.",
    "- Pour une comparaison par couvert, utilise le tarif réel du contrat du restaurateur ou une formule symbolique. Aucun tarif concurrent inventé, aucune économie garantie, aucune généralisation à tous les concurrents.",
    `- Choisis destination_url sur https://www.thetok.ch parmi : ${MARKETING_DESTINATION_PATHS.join(", ")}. La page alternative-commission-couvert convient à une comparaison. call_to_action contient uniquement le libellé, sans URL : l’application ajoute son lien tracé.`,
    "- Pour Instagram, n’affirme pas qu’un lien en légende est cliquable. Ne prétends pas avoir configuré le lien en bio.",
    "- Les visuels doivent porter le message principal du brief, avoir une hiérarchie lisible et une palette TOK orange/crème. N’invente pas de logo ou de partenariat.",

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
    "Renseigne visual_prompt uniquement pour les canaux où une image a du sens (réseaux sociaux, e-mail), sinon null.",
    "Le champ subject n'est renseigné que pour le canal email.",
  ].join("\n");
}

export async function generateMarketingPlan(context: MarketingBriefContext) {
  validateGenerationWindow(context.startsAt, context.endsAt);
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
    jsonSchema: buildPlanSchema(context.allowedChannels),
    maxOutputTokens: 8000,
    timeoutMs: 90_000,
  });

  const usage = extractUsage(response);
  let plan: MarketingPlan;
  try {
    plan = validatePlan(parseStructuredOutput<MarketingPlan>(response), context.allowedChannels, { now: Date.now(), startsAt: context.startsAt, endsAt: context.endsAt, itemCount: context.itemCount, requireConversion: true });
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

function bytesFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Visuals are a convenience, never a precondition. A campaign whose image
 * generation fails is still a usable campaign, so callers treat a null result
 * as "no image" rather than as an error — the same lesson the oversized TOTP QR
 * code taught on the authentication path.
 */
export async function generateCampaignVisual(
  adminClient: {
    storage: {
      from: (bucket: string) => {
        upload: (
          path: string,
          body: Uint8Array,
          options: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
        getPublicUrl: (path: string) => { data: { publicUrl: string } };
      };
    };
  },
  options: { prompt: string; campaignSlug: string; index: number; apiKey: string; timeoutMs?: number },
): Promise<string | null> {
  if (!options.apiKey || !options.prompt.trim()) return null;

  let payload: unknown;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(60_000, Math.max(1, options.timeoutMs ?? 60_000)));
  try {
    const response = await fetch(IMAGE_GENERATIONS_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: options.prompt.slice(0, 4000),
        size: "1024x1024",
        output_format: "jpeg",
        output_compression: 90,
        n: 1,
      }),
    });
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const first = (payload as { data?: Array<{ b64_json?: string }> })?.data?.[0];
  if (typeof first?.b64_json !== "string" || first.b64_json.length > 11_000_000) return null;

  const path = `marketing-ai/${options.campaignSlug}/${Date.now()}-${options.index}.jpg`;
  try {
    const bytes = bytesFromBase64(first.b64_json);
    if (bytes.length > 8 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return null;
    const { error } = await adminClient.storage.from(VISUAL_BUCKET).upload(
      path,
      bytes,
      { contentType: "image/jpeg", upsert: false },
    );
    if (error) return null;
    return adminClient.storage.from(VISUAL_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}
