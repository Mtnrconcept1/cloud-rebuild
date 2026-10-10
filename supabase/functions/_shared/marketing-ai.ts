import { normalizeMarketingDestination, type MarketingCampaignPurpose } from "./marketing-campaign-validation.ts";
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
  destinationUrl?: string;
  purpose?: MarketingCampaignPurpose;
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
    "- Les filtres targeting de chaque élément et audience_definition de la campagne doivent être strictement identiques ; ne change jamais restaurant_prospect en restaurant_lead.",
    "- Conserve exactement la fenêtre demandée. Aucun contenu avant le début, après la fin ou dans le passé. Les contacts individuels restent entre 08:00 et 20:00 Europe/Zurich.",
    "- Utilise chacun des canaux demandés au moins une fois, sans ajouter de canal. Les contenus ont des angles distincts, pas des répétitions.",
    "- Renseigne strategy : progression éditoriale, objectif de conversion, mesure des clics et demandes, hypothèses à vérifier. Ne présente jamais une mesure non implémentée comme opérationnelle.",
    "- Fais progresser les prises de parole : problème, comparaison, objections, conversion ; associe à chaque élément son stage. Ne force pas toutes les étapes quand peu de contenus sont demandés.",
    "- Une comparaison au couvert concerne uniquement les plateformes qui facturent par couvert, pas tous les concurrents. Sans tarif vérifié dans le brief, utilise une formule ou invite à comparer le contrat, jamais un tarif inventé.",
    "- Distingue la commission par table et l'abonnement. Ne transforme jamais une commission de 5 CHF en coût total sans autre frais, ni en économie garantie.",
    "- Une publication organique Facebook/Instagram ne cible pas les contacts CRM ou automatiquement les restaurateurs genevois. Aucun budget publicitaire n'est autorisé, aucun volume de prospects ou retour sur investissement ne peut être inventé.",
    "- Pour une acquisition, ne propose pas de notification interne à des prospects sans compte TOK. Les messages individuels exigent une éligibilité et un consentement contrôlés par TOK.",
    "- Les appels à l'action doivent nommer une action concrète : comparer, demander une démonstration ou consulter une offre. Le serveur ajoute la destination validée ; n'invente aucune autre URL.",
    "- Les visuels doivent servir l'argument commercial : composition claire, texte français lisible, aucun logo concurrent ou logo TOK inventé. Décris explicitement toute réserve graphique à relire.",
    "- Chaque texte Instagram, hashtags et URL inclus, doit rester sous 2200 caractères.",
    "Type de campagne : " + (context.purpose || "awareness") + ".",
    "Page de conversion validée : " + normalizeMarketingDestination(context.destinationUrl) + ".",
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
    timeoutMs: 60_000,
  });

  const usage = extractUsage(response);
  let plan: MarketingPlan;
  try {
    plan = validatePlan(parseStructuredOutput<MarketingPlan>(response), context.allowedChannels, {
      now: Date.now(), startsAt: context.startsAt, endsAt: context.endsAt, itemCount: context.itemCount,
      destinationUrl: context.destinationUrl, purpose: context.purpose,
    });
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
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(options.timeoutMs ?? 20_000, 20_000)));
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
    clearTimeout(timeout);
  }

  const first = (payload as { data?: Array<{ b64_json?: string }> })?.data?.[0];
  if (typeof first?.b64_json !== "string" || first.b64_json.length > 12_000_000) return null;

  const path = `marketing-ai/${options.campaignSlug}/${Date.now()}-${options.index}.jpg`;
  try {
    const bytes = bytesFromBase64(first.b64_json);
    if (bytes.length < 4 || bytes.length > 8_000_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
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
