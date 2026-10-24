import { CAMPAIGN_TEMPLATES, type CampaignTemplateId } from "./marketing-campaign-templates.ts";
import { MarketingPlanError, type MarketingChannel, type MarketingPlan, type MarketingPlanItem } from "./marketing-ai-plan.ts";
import { composeMetaCaption } from "./meta-publishing.ts";

export const SOCIAL_EDITORIAL_VERSION = "tok-social-20261013-v1";
export const TOK_PUBLIC_HOME = "https://www.thetok.ch/";
/** Curated business vocabulary; these are not measured trends or performance claims. */
export const SOCIAL_EDITORIAL_CATALOG: Record<CampaignTemplateId, { url: string; hashtags: readonly string[] }> = {
  last_minute: { url: TOK_PUBLIC_HOME, hashtags: ["ReservationRestaurant", "SortieRestaurant", "Restauration"] },
  discovery: { url: `${TOK_PUBLIC_HOME}recherche`, hashtags: ["DecouverteRestaurant", "CuisineLocale", "Restaurant"] },
  zero_attente: { url: `${TOK_PUBLIC_HOME}zero-attente`, hashtags: ["ZeroAttente", "ReservationRestaurant", "Precommande"] },
  anti_gaspi: { url: `${TOK_PUBLIC_HOME}anti-gaspi`, hashtags: ["AntiGaspi", "GaspillageAlimentaire", "CuisineResponsable"] },
  vente_flash: { url: `${TOK_PUBLIC_HOME}ventes-flash`, hashtags: ["VenteFlash", "OffresRestaurant", "Restaurant"] },
  reservation: { url: TOK_PUBLIC_HOME, hashtags: ["ReservationRestaurant", "TableAuRestaurant", "SortieRestaurant"] },
  livraison: { url: `${TOK_PUBLIC_HOME}recherche?delivery=true`, hashtags: ["LivraisonRepas", "CommandeRestaurant", "Restauration"] },
  fidelite: { url: TOK_PUBLIC_HOME, hashtags: ["FideliteClient", "Miamz", "Restaurant"] },
  tables_5_chf: { url: `${TOK_PUBLIC_HOME}restaurateurs/alternative-commission-couvert`, hashtags: ["Restaurateurs", "ReservationRestaurant", "GestionRestaurant"] },
  studio_marketing: { url: TOK_PUBLIC_HOME, hashtags: ["MarketingRestaurant", "CommunicationRestaurant", "Restaurateurs"] },
  photo_pro: { url: TOK_PUBLIC_HOME, hashtags: ["PhotographieCulinaire", "PhotoRestaurant", "Restaurateurs"] },
  plan_salle: { url: TOK_PUBLIC_HOME, hashtags: ["PlanDeSalle", "GestionRestaurant", "Restaurateurs"] },
  a_emporter: { url: TOK_PUBLIC_HOME, hashtags: ["AEmporter", "CommandeRestaurant", "CuisineLocale"] },
  cadeaux_miamz: { url: TOK_PUBLIC_HOME, hashtags: ["Miamz", "Cadeaux", "FideliteClient"] },
  tok_one: { url: `${TOK_PUBLIC_HOME}tok-one`, hashtags: ["TOKOne", "Abonnement", "Restaurant"] },
  menu_digital: { url: TOK_PUBLIC_HOME, hashtags: ["MenuDigital", "CarteRestaurant", "Restaurateurs"] },
  offres_formules: { url: TOK_PUBLIC_HOME, hashtags: ["MenuRestaurant", "FormuleRestaurant", "Restaurateurs"] },
  avis_clients: { url: TOK_PUBLIC_HOME, hashtags: ["AvisClients", "RelationClient", "Restaurateurs"] },
  pilotage_restaurant: { url: TOK_PUBLIC_HOME, hashtags: ["GestionRestaurant", "Restaurateurs", "ReservationRestaurant"] },
  actualites_restaurant: { url: TOK_PUBLIC_HOME, hashtags: ["ActualitesRestaurant", "CommunicationRestaurant", "Restaurateurs"] },
};

export const SOCIAL_EDITORIAL_VARIETY_PATTERNS = [
  "punchline très courte en une phrase",
  "bénéfice concret puis explication en deux phrases",
  "micro-scène vécue au restaurant",
  "fonctionnalité TOK expliquée sans slogan",
  "question courte suivie d'une réponse utile",
  "contraste avant/après sans chiffre ni promesse",
] as const;

export function normalizeEditorialSimilarityText(value: string): string {
  return cleanGeneratedPublicText(value, 5000).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr-CH")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function editorialBigrams(value: string): Set<string> {
  const tokens = normalizeEditorialSimilarityText(value).split(" ").filter((token) => token.length > 1);
  if (tokens.length < 6) return new Set();
  return new Set(tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`));
}

/**
 * Exact duplicates are rejected separately. This catches the common failure
 * mode where only one or two words change while the whole caption remains the
 * same. The denominator is the shorter text so a copied caption with one added
 * sentence is still considered near-duplicate.
 */
export function isNearDuplicateEditorialCopy(left: string, right: string, threshold = 0.72): boolean {
  const leftPairs = editorialBigrams(left);
  const rightPairs = editorialBigrams(right);
  if (leftPairs.size < 5 || rightPairs.size < 5) return false;
  let shared = 0;
  for (const pair of leftPairs) if (rightPairs.has(pair)) shared += 1;
  return shared / Math.min(leftPairs.size, rightPairs.size) >= threshold;
}

export function editorialHashtagPool(templateId: CampaignTemplateId, audienceHint = ""): string[] {
  const local: string[] = [];
  if (/\bgen[eè]ve\b/iu.test(audienceHint)) local.push("Geneve");
  if (/\blausanne\b/iu.test(audienceHint)) local.push("Lausanne");
  if (/\bsuisse\s+romande\b/iu.test(audienceHint)) local.push("SuisseRomande");
  return [...SOCIAL_EDITORIAL_CATALOG[templateId].hashtags, ...local, "TOK"];
}

/** Only newly generated strings enter this normalizer. Historical/manual posts never do. */
export function cleanGeneratedPublicText(value: string, maximum = 1600): string {
  const cleaned = value.normalize("NFKC").replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu, "")
    // Captions are plain text. Remove delimiters directly so malformed nested
    // markup cannot reconstruct a tag when a partial tag is stripped.
    .replace(/[<>]/gu, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/(?:[a-z][a-z\d+.-]*:\/\/|(?:mailto|javascript|data|tel):|www\.)[^\s<>]+/giu, "")
    .replace(/\b[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?\.[\p{L}]{2,63}(?:[/:?#][^\s<>]*)?/giu, "")
    .replace(/(^|[\s("'[{])\/[^\s)\]}"']+/gu, "$1")
    .replace(/[@#][\p{L}\p{N}_.-]+/gu, "")
    .replace(/(?:cliquez\s+sur\s+)?(?:le\s+)?lien\s+(?:en|dans\s+la)\s+bio/giu, "le site TOK")
    .replace(/lien\s+cliquable/giu, "adresse du site TOK")
    .replace(/[\t ]+/gu, " ").replace(/ *\n */gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
  if (cleaned.length > maximum) throw new MarketingPlanError("editorial_content_too_long");
  return cleaned;
}

export function normalizeEditorialHashtags(values: readonly string[], channel: MarketingChannel, templateId: CampaignTemplateId, audienceHint = ""): string[] {
  const pool = editorialHashtagPool(templateId, audienceHint);
  return hashtagsFromPool(values, channel, pool);
}

function hashtagsFromPool(values: readonly string[], channel: MarketingChannel, pool: readonly string[]): string[] {
  const byKey = new Map(pool.map((tag) => [tag.toLocaleLowerCase("fr-CH"), tag]));
  const maximum = channel === "instagram" ? 5 : channel === "facebook" || channel === "google_business" ? 2 : channel === "tok_news" ? 0 : 3;
  const selected: string[] = [];
  for (const value of values.slice(0, 20)) {
    const raw = value.normalize("NFKC").trim().replace(/^#/, "");
    if (!/^[\p{L}][\p{L}\p{N}_]{1,39}$/u.test(raw)) continue;
    const canonical = byKey.get(raw.toLocaleLowerCase("fr-CH"));
    if (canonical && !selected.includes(canonical)) selected.push(canonical);
  }
  if (channel === "instagram") for (const tag of pool) { if (selected.length >= 3) break; if (!selected.includes(tag)) selected.push(tag); }
  return selected.slice(0, maximum).map((tag) => `#${tag}`);
}

export function normalizeGeneratedEditorial(content: MarketingPlanItem["content"], channel: MarketingChannel, templateId: CampaignTemplateId, audienceHint = "") {
  return normalizeEditorialContent(content, channel, SOCIAL_EDITORIAL_CATALOG[templateId].url, editorialHashtagPool(templateId, audienceHint));
}

function normalizeEditorialContent(content: MarketingPlanItem["content"], channel: MarketingChannel, url: string, pool: readonly string[]) {
  const mentionsTok = channel === "instagram" && /(?:^|\s)@tok_suisse(?![\p{L}\p{N}_]|\.[\p{L}\p{N}_])/iu.test(content.body);
  const body = cleanGeneratedPublicText(content.body, channel === "facebook" ? 700 : 1400);
  const normalized = {
    subject: null,
    headline: cleanGeneratedPublicText(content.headline, 120),
    body: `${body}${mentionsTok ? "\n@tok_suisse" : ""}`,
    call_to_action: channel === "instagram" ? `À consulter : ${url}` : `Découvrez la fonctionnalité : ${url}`,
    hashtags: hashtagsFromPool(content.hashtags, channel, pool),
  };
  if (composeMetaCaption(normalized).length > (channel === "instagram" ? 2200 : 3000)) throw new MarketingPlanError("editorial_caption_too_long");
  return normalized;
}

/** Legacy free briefs keep their schema; new social copy still obeys link/mention/tag controls. */
export function normalizeLegacySocialPlan(plan: MarketingPlan, objective: string, audienceHint: string): MarketingPlan {
  const socialChannels = new Set(["instagram", "facebook", "linkedin", "tok_news", "google_business"]);
  const fold = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const publicUrls = new Set(Object.values(SOCIAL_EDITORIAL_CATALOG).map((entry) => entry.url));
  return { ...plan, items: plan.items.map((item) => {
    if (!socialChannels.has(item.channel)) return item;
    const aliases: Partial<Record<CampaignTemplateId, RegExp>> = {
      studio_marketing: /studio marketing/u, plan_salle: /plan de salle/u, photo_pro: /photo pro/u,
      pilotage_restaurant: /pilotage (?:du )?restaurant/u, actualites_restaurant: /actualites (?:du )?restaurant/u,
      zero_attente: /zero[- ]attente/u,
    };
    const identify = (value: string) => {
      const text = fold(value);
      const matches = CAMPAIGN_TEMPLATES.filter((template) => text.includes(fold(template.label)) || text.includes(template.id) || aliases[template.id]?.test(text));
      // "Réservations" also appears naturally when describing a more specific feature.
      return matches.some((template) => template.id !== "reservation") ? matches.filter((template) => template.id !== "reservation") : matches;
    };
    const itemTopics = identify(`${item.title} ${item.content.headline} ${item.content.body}`);
    const identified = itemTopics.length ? itemTopics : identify(objective);
    const protectedTopic = identified.find((template) => SOCIAL_EDITORIAL_CATALOG[template.id].url === TOK_PUBLIC_HOME);
    const primary = protectedTopic || (identified.length === 1 ? identified[0] : undefined);
    const proposedUrls = item.content.call_to_action.match(/https?:\/\/[^\s<>]+/giu) || [];
    const verifiedUrl = proposedUrls.map((url) => url.replace(/[),.;!]+$/gu, "")).find((url) => publicUrls.has(url));
    const url = primary ? SOCIAL_EDITORIAL_CATALOG[primary.id].url : verifiedUrl || TOK_PUBLIC_HOME;
    const pool = primary ? editorialHashtagPool(primary.id, audienceHint)
      : [...new Set(["TOK", "Restaurant", "Restauration", ...CAMPAIGN_TEMPLATES.flatMap((template) => editorialHashtagPool(template.id, audienceHint))])];
    const content = normalizeEditorialContent(item.content, item.channel, url, pool);
    if (!cleanGeneratedPublicText(content.body)) throw new MarketingPlanError("empty_editorial_content");
    return { ...item, title: cleanGeneratedPublicText(item.title, 200), content,
      visual_prompt: item.visual_prompt ? cleanGeneratedPublicText(item.visual_prompt, 4000) : null,
    };
  }) };
}

export function socialEditorialPrompt(templateIds: readonly CampaignTemplateId[], audienceHint: string, guided = true): string[] {
  return [
    guided ? "Pour chaque post, choisis UN primary_template_id parmi les thèmes sélectionnés et fournis channel_variants avec exactement une version originale par réseau demandé. Les formats d'un même réseau partageront cette version."
      : "Adapte chaque publication à son réseau et varie réellement les accroches et les textes entre les posts. Conserve le schéma de calendrier demandé.",
    "Rédige en français suisse clair : accroche concrète, bénéfice utile lié à la fonctionnalité, termes métier recherchables naturellement intégrés, un seul appel à l'action.",
    `VARIATION OBLIGATOIRE : fais tourner les structures suivantes dans l'ordre sans reprendre deux fois la même avant d'avoir parcouru la liste : ${SOCIAL_EDITORIAL_VARIETY_PATTERNS.join(" ; ")}. Pour une campagne de 4 posts ou plus, utilise au moins 4 structures différentes.`,
    "Deux posts ne doivent jamais avoir le même headline, la même légende, la même première formulation ou une légende seulement paraphrasée. Change réellement le rythme, la longueur, le vocabulaire d'ouverture et l'angle. Instagram et Facebook d'un même post doivent aussi avoir des textes nettement différents.",
    ...(guided ? ["Si le nombre de posts permet de couvrir tous les thèmes sélectionnés, utilise chacun au moins une fois comme primary_template_id. Sinon, privilégie des thèmes principaux différents et une diversité d'angles."] : []),
    "Instagram : alterne volontairement les formats, d'une punchline autonome en 1 phrase à un texte développé de 2 à 4 phrases ; body maximum 1400 caractères, headline maximum 120 caractères, 3 à 5 hashtags pertinents maximum. Une adresse en légende est textuelle : ne dis jamais lien cliquable ou lien en bio.",
    "Facebook : bénéfice immédiatement lisible, texte plus direct et court (1 à 3 phrases), body maximum 700 caractères, headline maximum 120 caractères, 0 à 2 hashtags utiles. Autres réseaux : body maximum 1400 caractères. LinkedIn : angle professionnel ; Actualités TOK : information claire sans hashtags.",
    guided ? "N'insère aucune URL dans headline, body ou visual_prompt. Le serveur ajoutera l'unique URL vérifiée en call_to_action. N'ajoute aucun autre appel à cliquer, réserver, partager ou commenter dans le corps."
      : "Choisis uniquement la destination vérifiée du thème concerné dans le catalogue ci-dessous et insère-la une seule fois dans call_to_action. Si le sujet n'est pas identifié ou implique une connexion, utilise https://www.thetok.ch/. Jamais de lien /auth, de dashboard ou de partenaire inventé. Aucun autre lien ou appel à l'action dans le corps.",
    "Mentions facultatives : seul @tok_suisse est confirmé sur Instagram, uniquement si le compte TOK apporte un contexte utile. Aucune mention sur Facebook, aucun compte partenaire ou compte local supposé. Il est préférable d'omettre une mention inutile.",
    "N'affirme aucune tendance, portée, popularité, métrique ou performance non mesurée. N'utilise pas #viral, #fyp, #followforfollow ni de hashtags sans lien avec le thème.",
    ...templateIds.map((id) => `${id} : destination ${SOCIAL_EDITORIAL_CATALOG[id].url} ; hashtags autorisés ${editorialHashtagPool(id, audienceHint).map((tag) => `#${tag}`).join(" ")}.`),
  ];
}
