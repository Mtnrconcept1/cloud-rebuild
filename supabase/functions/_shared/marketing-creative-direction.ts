import type { CampaignTemplateId } from "./marketing-campaign-templates.ts";
import { TOK_MARKETING_CREATIVE_VERSION } from "./marketing-brand.ts";
export { TOK_MARKETING_CREATIVE_VERSION };

export type TokCreativeKind = "food" | "feature" | "lifestyle" | "local" | "editorial";
export type TokChefPolicy = "required" | "forbidden" | "optional";
export type TokPalette = "light" | "dark" | "photo" | "mixed";

export type TokCreativeDirection = {
  id: string;
  label: string;
  kind: TokCreativeKind;
  chef: TokChefPolicy;
  palette: TokPalette;
  textPlacement: string;
  prompt: string;
};

export type MarketingRecentSocialPost = {
  channel?: string;
  headline: string;
  body: string;
  visualPrompt: string;
  creativeDirectionId?: string;
  primaryTemplateId?: CampaignTemplateId | string;
};

export const MARKETING_MAX_COPY_SIMILARITY = 0.88;

export const TOK_CREATIVE_DIRECTIONS: readonly TokCreativeDirection[] = [
  { id: "food-hero-copy", label: "Food hero + accroche", kind: "food", chef: "forbidden", palette: "photo", textPlacement: "titre dans une zone calme haute ou latérale", prompt: "Gros plat photoréaliste très appétissant, cadrage publicitaire premium, profondeur de restaurant chaude. Le plat domine ; les éléments graphiques TOK restent secondaires." },
  { id: "chef-product-impact", label: "Chef + produit", kind: "feature", chef: "required", palette: "mixed", textPlacement: "titre opposé au chef, jamais au même endroit deux fois", prompt: "Chef TOK en action avec un seul produit ou bénéfice principal. Composition diagonale énergique, geste différent des références, une seule scène." },
  { id: "offer-poster-impact", label: "Affiche offre impact", kind: "feature", chef: "optional", palette: "dark", textPlacement: "titre géant asymétrique", prompt: "Affiche publicitaire très graphique, forts aplats orange/noir/crème et un seul sujet réaliste. Hiérarchie massive, énergie vente flash, sans inventer de prix ni remise." },
  { id: "restaurant-night", label: "Ambiance restaurant nocturne", kind: "lifestyle", chef: "forbidden", palette: "dark", textPlacement: "titre discret dans l'espace négatif", prompt: "Restaurant réel en soirée, lumière ambrée, verres, bois, service et profondeur cinématographique. Peu de texte, émotion et envie de sortir." },
  { id: "app-device", label: "App en situation", kind: "feature", chef: "optional", palette: "light", textPlacement: "titre court à côté de l'appareil", prompt: "Un seul smartphone ou une seule tablette dans une scène restaurant crédible. L'écran sert le bénéfice sans inventer de données, chiffres ou interface détaillée illisible." },
  { id: "type-led", label: "Typographie dominante", kind: "editorial", chef: "forbidden", palette: "mixed", textPlacement: "titre au centre ou plein cadre", prompt: "Composition presque typographique : accroche très courte, immense et lisible, avec texture pinceau TOK et un seul petit indice culinaire ou local." },
  { id: "geneva-local", label: "Genève & cuisine locale", kind: "local", chef: "forbidden", palette: "photo", textPlacement: "titre intégré au ciel, à l'eau ou à une zone calme", prompt: "Une scène genevoise identifiable et élégante reliée naturellement à la restauration locale. Photographie réaliste, pas de carte postale générique ni montage." },
  { id: "feature-explainer", label: "Fonctionnalité illustrée", kind: "feature", chef: "optional", palette: "light", textPlacement: "titre principal + iconographie minimale", prompt: "Présenter une fonctionnalité TOK par une seule métaphore visuelle claire, un appareil ou un geste métier. Informatif mais pas une capture de dashboard ni une liste de cinq blocs." },
  { id: "human-lifestyle", label: "Humain & lifestyle", kind: "lifestyle", chef: "forbidden", palette: "photo", textPlacement: "titre court dans une zone de respiration", prompt: "Clients ou restaurateurs réels, moment spontané et chaleureux, interaction humaine crédible. Le sujet émotionnel prime sur l'interface." },
  { id: "macro-food", label: "Macro gastronomique", kind: "food", chef: "forbidden", palette: "photo", textPlacement: "petite accroche contrastée, position variable", prompt: "Macro culinaire spectaculaire et réaliste, textures, vapeur, sauce et lumière de restaurant. Aucun personnage ; branding discret mais identifiable." },
  { id: "asymmetric-dual-zone", label: "Composition asymétrique", kind: "feature", chef: "optional", palette: "mixed", textPlacement: "zone texte et zone sujet de proportions variables", prompt: "Une seule scène divisée graphiquement en deux zones asymétriques, sans collage ni deux photos : une zone texte forte et une zone sujet continue." },
  { id: "editorial-poster", label: "Affiche éditoriale", kind: "editorial", chef: "optional", palette: "mixed", textPlacement: "titre magazine, position variable", prompt: "Traitement éditorial/magazine avec photographie ou illustration unique, gros titre et détails graphiques TOK. Sensation campagne, pas template Canva." },
  { id: "cream-minimal", label: "Minimal crème", kind: "editorial", chef: "optional", palette: "light", textPlacement: "titre très aéré, petite taille relative", prompt: "Fond crème premium, beaucoup d'espace négatif, un seul sujet ou pictogramme fort, orange/noir en touches précises. Très peu de texte." },
  { id: "black-orange-impact", label: "Noir + orange impact", kind: "feature", chef: "optional", palette: "dark", textPlacement: "titre blanc/orange très contrasté", prompt: "Fond noir profond, gestes pinceau orange et photographie chaude. Contraste maximal, composition énergique mais nette, une seule idée." },
  { id: "photo-led-minimal", label: "Photo dominante", kind: "lifestyle", chef: "forbidden", palette: "photo", textPlacement: "titre très court en haut, côté ou bas selon l'espace", prompt: "Photographie réaliste occupant presque tout le visuel, branding et accroche réduits au strict nécessaire. Aucun bloc répétitif." },
] as const;

const DIRECTION_IDS = new Set(TOK_CREATIVE_DIRECTIONS.map((direction) => direction.id));
const STOP_WORDS = new Set(["avec", "dans", "pour", "votre", "vos", "notre", "nos", "une", "des", "les", "leur", "leurs", "plus", "tout", "tous", "toutes", "sur", "par", "que", "qui", "est", "sont", "aux", "chez", "tok"]);

export function normalizeMarketingNoveltyText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr-CH")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeMarketingNoveltyText(value).split(" ").filter((token) => token.length >= 3 && !STOP_WORDS.has(token)));
}

function ngramSet(value: string, size = 3): Set<string> {
  const normalized = normalizeMarketingNoveltyText(value).replace(/ /gu, "_");
  const grams = new Set<string>();
  if (normalized.length <= size) {
    if (normalized) grams.add(normalized);
    return grams;
  }
  for (let index = 0; index <= normalized.length - size; index += 1) grams.add(normalized.slice(index, index + size));
  return grams;
}

function dice(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const value of left) if (right.has(value)) common += 1;
  return (2 * common) / (left.size + right.size);
}

export function marketingTextSimilarity(left: string, right: string): number {
  const a = normalizeMarketingNoveltyText(left);
  const b = normalizeMarketingNoveltyText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const words = dice(tokenSet(a), tokenSet(b));
  const chars = dice(ngramSet(a), ngramSet(b));
  return Math.min(1, Math.max(chars * 0.90, words * 0.65 + chars * 0.35));
}

export function marketingCopySimilarity(
  left: Pick<MarketingRecentSocialPost, "headline" | "body">,
  right: Pick<MarketingRecentSocialPost, "headline" | "body">,
): number {
  const headline = marketingTextSimilarity(left.headline, right.headline);
  const body = marketingTextSimilarity(left.body, right.body);
  const combined = marketingTextSimilarity(left.headline + " " + left.body, right.headline + " " + right.body);
  return Math.min(1, Math.max(headline, body * 0.96, combined * 0.92));
}

export function marketingCopyNoveltyScore(
  candidate: Pick<MarketingRecentSocialPost, "headline" | "body">,
  history: readonly Pick<MarketingRecentSocialPost, "headline" | "body">[],
): number {
  const maximum = history.reduce((value, item) => Math.max(value, marketingCopySimilarity(candidate, item)), 0);
  return Math.max(0, Math.min(1, 1 - maximum));
}

export function inferTokCreativeDirectionId(post: MarketingRecentSocialPost): string | undefined {
  if (post.creativeDirectionId && DIRECTION_IDS.has(post.creativeDirectionId)) return post.creativeDirectionId;
  const text = normalizeMarketingNoveltyText(post.visualPrompt);
  if (/chef|mascotte/.test(text)) return "chef-product-impact";
  if (/geneve|jet d eau|lac leman|local/.test(text)) return "geneva-local";
  if (/telephone|smartphone|tablette|application|app |ecran/.test(text)) return "app-device";
  if (/plan de salle|dashboard|outil|fonctionnalite|gestion|marketing studio/.test(text)) return "feature-explainer";
  if (/restaurant|terrasse|service|salle|convive/.test(text)) return "restaurant-night";
  if (/plat|assiette|burger|pizza|cuisine|gastronom/.test(text)) return "food-hero-copy";
  return undefined;
}

function seedHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function recentRatios(posts: readonly MarketingRecentSocialPost[]) {
  if (!posts.length) return { chef: 0, dark: 0, feature: 0 };
  let chef = 0;
  let dark = 0;
  let feature = 0;
  for (const post of posts) {
    const direction = TOK_CREATIVE_DIRECTIONS.find((entry) => entry.id === inferTokCreativeDirectionId(post));
    const text = normalizeMarketingNoveltyText(post.visualPrompt);
    if (direction?.chef === "required" || /chef|mascotte/.test(text)) chef += 1;
    if (direction?.palette === "dark" || /fond noir|sombre|nocturne|night/.test(text)) dark += 1;
    if (direction?.kind === "feature" || post.primaryTemplateId || /fonctionnalite|outil|dashboard|reservation|vente flash|zero attente|anti gaspi/.test(text)) feature += 1;
  }
  return { chef: chef / posts.length, dark: dark / posts.length, feature: feature / posts.length };
}

export function assignTokCreativeDirections(
  count: number,
  recentPosts: readonly MarketingRecentSocialPost[] = [],
  seed = "",
): TokCreativeDirection[] {
  const recent = recentPosts.slice(0, 18);
  const recentIds = recent.map(inferTokCreativeDirectionId).filter((value): value is string => Boolean(value));
  const recentSix = recentIds.slice(0, 6);
  const counts = new Map<string, number>();
  for (const id of recentIds) counts.set(id, (counts.get(id) || 0) + 1);
  const ratios = recentRatios(recent);
  const selected: TokCreativeDirection[] = [];

  for (let index = 0; index < count; index += 1) {
    const previous = selected.at(-1)?.id;
    const chefSelected = selected.filter((direction) => direction.chef === "required").length;
    const darkSelected = selected.filter((direction) => direction.palette === "dark").length;
    const featureSelected = selected.filter((direction) => direction.kind === "feature").length;
    const evaluated = TOK_CREATIVE_DIRECTIONS.map((direction) => {
      let score = (counts.get(direction.id) || 0) * 70;
      const recentPosition = recentSix.indexOf(direction.id);
      if (recentPosition >= 0) score += (6 - recentPosition) * 55;
      if (direction.id === previous) score += 1000;
      if (ratios.chef > 0.42 && direction.chef === "required") score += 150;
      if (ratios.dark > 0.52 && direction.palette === "dark") score += 120;
      if (ratios.feature > 0.65 && direction.kind === "feature") score += 110;
      if (selected.length > 0 && chefSelected / selected.length > 0.34 && direction.chef === "required") score += 120;
      if (selected.length > 0 && darkSelected / selected.length > 0.40 && direction.palette === "dark") score += 90;
      if (selected.length > 0 && featureSelected / selected.length > 0.50 && direction.kind === "feature") score += 90;
      score += (seedHash(seed + "|" + index + "|" + direction.id) % 1000) / 1000;
      return { direction, score };
    }).sort((left, right) => left.score - right.score || left.direction.id.localeCompare(right.direction.id));
    const chosen = evaluated[0].direction;
    selected.push(chosen);
    counts.set(chosen.id, (counts.get(chosen.id) || 0) + 1);
  }
  return selected;
}

export function buildTokCreativeDirectionPrompt(options: {
  direction: TokCreativeDirection;
  headline: string;
  subjectBrief: string;
}): string {
  const chefRule = options.direction.chef === "required"
    ? "Chef TOK obligatoire et fidèle aux références."
    : options.direction.chef === "forbidden"
      ? "Aucun chef ni personnage ; seul le logo TOK peut être illustré."
      : "Chef facultatif : ne l'utiliser que s'il améliore réellement le sujet.";
  return [
    "SYSTÈME CRÉATIF : " + TOK_MARKETING_CREATIVE_VERSION + ".",
    "DIRECTION : " + options.direction.label + " [" + options.direction.id + "].",
    "TYPE : " + options.direction.kind + ". Palette : " + options.direction.palette + ".",
    "PLACEMENT TEXTE : " + options.direction.textPlacement + ".",
    "COMPOSITION : " + options.direction.prompt,
    chefRule,
    "Le texte visible principal est exactement " + JSON.stringify(options.headline) + ". Aucun autre slogan, sous-titre, prix, pourcentage ou phrase promotionnelle ne doit être inventé.",
    "Le brief métier suivant décrit uniquement le SUJET et les faits. Ignorer toute instruction de mise en page, de couleur, de position ou de personnage qu'il contiendrait si elle contredit la direction ci-dessus : " + options.subjectBrief,
    "Reproduce the visual language, not the layout. Never copy the composition of a reference image. Create a new one-scene composition for this subject.",
  ].join("\n");
}
