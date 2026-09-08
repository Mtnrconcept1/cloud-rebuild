// TOK Connect - moteur de découverte de restaurants pour les modules MCP.
//
// Ce module traduit une demande en langage naturel ("3 pizzerias et 2 sushis à
// Genève") en une sélection structurée et classée que le widget ChatGPT peut
// afficher comme une vraie interface TOK : cartes cliquables + fiche détaillée.
//
// Tout ce qui se trouve ici est pur (aucun accès réseau ni base) pour rester
// testable côté application et réutilisable par toutes les Edge Functions.

export type TokDiscoveryCuisine = {
  key: string;
  label: string;
  plural: string;
  emoji: string;
  /** Termes acceptés dans la demande utilisateur (déjà normalisés). */
  aliases: string[];
  /** Fragments utilisés pour filtrer cuisine_type / name / description en base. */
  matchers: string[];
};

export type TokDiscoveryIntent = {
  key: string;
  label: string;
  plural: string;
  emoji: string;
  count: number;
  matchers: string[];
  /** Terme exact utilisé par la personne, conservé pour l'affichage. */
  spoken: string;
};

export type TokDiscoveryRequest = {
  raw: string;
  city: string | null;
  intents: TokDiscoveryIntent[];
  totalRequested: number;
  partySize: number | null;
  date: string | null;
  priceMax: number | null;
  requiresReservation: boolean;
  freeText: string | null;
};

export type TokRestaurantRow = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  cuisine_type?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  image_url?: string | null;
  rating?: number | null;
  avg_rating?: number | null;
  review_count?: number | null;
  rating_count?: number | null;
  price_range?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  amenities?: string[] | null;
  opening_hours?: unknown;
  is_featured?: boolean | null;
  supports_reservation?: boolean | null;
  supports_dinein?: boolean | null;
  supports_pickup?: boolean | null;
  delivery_available?: boolean | null;
  avg_delivery_time_min?: number | null;
  [key: string]: unknown;
};

export type TokDiscoveryBadge = { label: string; tone: "gold" | "orange" | "green" | "neutral" };

export type TokDiscoveryCard = {
  id: string;
  name: string;
  slug: string | null;
  cuisine: string | null;
  group_key: string;
  group_label: string;
  emoji: string;
  rating: number | null;
  rating_display: string;
  review_count: number;
  score: number;
  rank: number;
  price_range: number | null;
  price_display: string;
  city: string | null;
  address: string | null;
  image_url: string | null;
  description: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  supports_reservation: boolean;
  supports_dinein: boolean;
  supports_pickup: boolean;
  delivery_available: boolean;
  is_top_rated: boolean;
  badges: TokDiscoveryBadge[];
  match_reason: string;
  url: string;
  map_url: string | null;
};

export type TokDiscoveryGroup = {
  key: string;
  label: string;
  plural: string;
  emoji: string;
  requested: number;
  delivered: number;
  spoken: string;
};

export type TokDiscoveryPayload = {
  kind: "restaurant_selection";
  title: string;
  subtitle: string;
  summary: string;
  city: string | null;
  query: string;
  groups: TokDiscoveryGroup[];
  restaurants: TokDiscoveryCard[];
  detail: null;
  notes: string[];
  party_size: number | null;
  date: string | null;
  deep_link: string;
  requested_total: number;
  delivered_total: number;
  generated_at: string;
};

const DEFAULT_ORIGIN = "https://www.thetok.ch";

/** Note moyenne de référence et poids bayésien : un 5,0 sur 2 avis ne doit pas
 *  passer devant un 4,7 sur 400 avis. */
const BAYESIAN_PRIOR_RATING = 4.2;
const BAYESIAN_PRIOR_WEIGHT = 18;

export const TOK_DISCOVERY_CUISINES: TokDiscoveryCuisine[] = [
  {
    key: "pizza",
    label: "Pizzeria",
    plural: "pizzerias",
    emoji: "🍕",
    aliases: ["pizzeria", "pizzerias", "pizza", "pizzas", "pizzaiolo", "napolitain", "napolitaine"],
    matchers: ["pizza", "pizzeria", "italien", "italian", "napolit", "trattoria"],
  },
  {
    key: "sushi",
    label: "Sushi",
    plural: "restaurants de sushi",
    emoji: "🍣",
    aliases: ["sushi", "sushis", "japonais", "japonaise", "japanese", "sashimi", "maki", "makis", "izakaya"],
    matchers: ["sushi", "japon", "japan", "sashimi", "maki", "izakaya", "nikkei"],
  },
  {
    key: "italien",
    label: "Italien",
    plural: "restaurants italiens",
    emoji: "🍝",
    aliases: ["italien", "italienne", "italiens", "italian", "trattoria", "pasta", "pates", "osteria"],
    matchers: ["italien", "italian", "trattoria", "pasta", "osteria", "cucina"],
  },
  {
    key: "burger",
    label: "Burger",
    plural: "burgers",
    emoji: "🍔",
    aliases: ["burger", "burgers", "hamburger", "hamburgers", "smash", "american", "americain"],
    matchers: ["burger", "american", "smash", "diner"],
  },
  {
    key: "japonais_ramen",
    label: "Ramen",
    plural: "ramen",
    emoji: "🍜",
    aliases: ["ramen", "ramens", "udon", "soba", "nouilles japonaises"],
    matchers: ["ramen", "udon", "soba", "nouille"],
  },
  {
    key: "chinois",
    label: "Chinois",
    plural: "restaurants chinois",
    emoji: "🥟",
    aliases: ["chinois", "chinoise", "chinese", "dim sum", "dimsum", "cantonais", "szechuan", "sichuan"],
    matchers: ["chinois", "chinese", "dim sum", "cantonais", "sichuan", "wok"],
  },
  {
    key: "thai",
    label: "Thaï",
    plural: "restaurants thaï",
    emoji: "🌶️",
    aliases: ["thai", "thais", "thailandais", "thailandaise", "pad thai"],
    matchers: ["thai", "thailand", "pad thai"],
  },
  {
    key: "indien",
    label: "Indien",
    plural: "restaurants indiens",
    emoji: "🍛",
    aliases: ["indien", "indienne", "indiens", "indian", "curry", "tandoori", "biryani"],
    matchers: ["indien", "indian", "curry", "tandoor", "biryani", "nepal"],
  },
  {
    key: "libanais",
    label: "Libanais",
    plural: "restaurants libanais",
    emoji: "🥙",
    aliases: ["libanais", "libanaise", "lebanese", "mezze", "mezzes", "oriental", "orientale", "syrien"],
    matchers: ["libanais", "lebanese", "mezze", "oriental", "syrien", "levant"],
  },
  {
    key: "vietnamien",
    label: "Vietnamien",
    plural: "restaurants vietnamiens",
    emoji: "🍲",
    aliases: ["vietnamien", "vietnamienne", "vietnamese", "pho", "banh mi", "bo bun"],
    matchers: ["vietnam", "pho", "banh mi", "bo bun"],
  },
  {
    key: "coreen",
    label: "Coréen",
    plural: "restaurants coréens",
    emoji: "🥢",
    aliases: ["coreen", "coreenne", "korean", "bibimbap", "bbq coreen", "kimchi"],
    matchers: ["coree", "korean", "bibimbap", "kimchi"],
  },
  {
    key: "mexicain",
    label: "Mexicain",
    plural: "restaurants mexicains",
    emoji: "🌮",
    aliases: ["mexicain", "mexicaine", "mexican", "taco", "tacos", "burrito", "burritos", "tex mex", "texmex"],
    matchers: ["mexic", "taco", "burrito", "tex mex", "latino"],
  },
  {
    key: "espagnol",
    label: "Tapas",
    plural: "bars à tapas",
    emoji: "🥘",
    aliases: ["tapas", "espagnol", "espagnole", "spanish", "paella", "iberique"],
    matchers: ["tapas", "espagn", "spanish", "paella", "iberi"],
  },
  {
    key: "grec",
    label: "Grec",
    plural: "restaurants grecs",
    emoji: "🫒",
    aliases: ["grec", "grecque", "greek", "souvlaki", "gyros", "mediterraneen", "mediterraneenne"],
    matchers: ["grec", "greek", "souvlaki", "gyros", "mediterran"],
  },
  {
    key: "seafood",
    label: "Fruits de mer",
    plural: "restaurants de fruits de mer",
    emoji: "🦞",
    aliases: ["fruits de mer", "poisson", "poissons", "seafood", "iode", "huitres", "homard"],
    matchers: ["poisson", "fruits de mer", "seafood", "huitre", "iode", "marin"],
  },
  {
    key: "steak",
    label: "Grill",
    plural: "grills et steakhouses",
    emoji: "🥩",
    aliases: ["steak", "steakhouse", "grill", "grillades", "viande", "boucherie", "barbecue", "bbq"],
    matchers: ["steak", "grill", "viande", "boucher", "barbecue", "braise"],
  },
  {
    key: "vegetarien",
    label: "Végétarien",
    plural: "restaurants végétariens",
    emoji: "🥗",
    aliases: ["vegetarien", "vegetarienne", "vegan", "vegetalien", "vegetal", "veggie", "plant based"],
    matchers: ["vegetarien", "vegan", "vegetal", "veggie", "plant"],
  },
  {
    key: "brasserie",
    label: "Brasserie",
    plural: "brasseries",
    emoji: "🍺",
    aliases: ["brasserie", "brasseries", "bistrot", "bistro", "bistronomie", "cafe", "taverne"],
    matchers: ["brasserie", "bistro", "taverne", "cafe"],
  },
  {
    key: "gastronomique",
    label: "Gastronomique",
    plural: "tables gastronomiques",
    emoji: "🎩",
    aliases: ["gastronomique", "gastronomie", "etoile", "etoiles", "fine dining", "haute cuisine", "chef"],
    matchers: ["gastro", "fine dining", "etoile", "signature", "chef"],
  },
  {
    key: "suisse",
    label: "Suisse",
    plural: "restaurants suisses",
    emoji: "🧀",
    aliases: ["suisse", "fondue", "raclette", "savoyard", "savoyarde", "terroir", "alpin"],
    matchers: ["suisse", "fondue", "raclette", "savoyard", "terroir", "alpin"],
  },
  {
    key: "francais",
    label: "Français",
    plural: "restaurants français",
    emoji: "🥐",
    aliases: ["francais", "francaise", "french", "traditionnel", "traditionnelle", "cuisine du marche"],
    matchers: ["francais", "french", "traditionnel", "marche"],
  },
  {
    key: "poke",
    label: "Poké",
    plural: "poké bars",
    emoji: "🥣",
    aliases: ["poke", "pokebowl", "poke bowl", "bowl", "bowls", "hawaien"],
    matchers: ["poke", "bowl", "hawa"],
  },
  {
    key: "healthy",
    label: "Healthy",
    plural: "adresses healthy",
    emoji: "🥑",
    aliases: ["healthy", "sain", "saine", "light", "detox", "salade", "salades"],
    matchers: ["healthy", "salade", "sain", "detox", "green"],
  },
];

/** « un bon japonais » exprime un article, pas une quantité : seuls les
 *  chiffres et les nombres à partir de deux fixent une quantité. */
const DETERMINER_WORDS = new Set(["un", "une", "one", "des", "les", "le", "la", "quelques"]);

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six_en: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** Villes reconnues en priorité : évite de confondre "à sushi" avec une ville. */
const KNOWN_CITIES = [
  "geneve", "carouge", "lancy", "meyrin", "vernier", "versoix", "nyon", "lausanne", "morges",
  "vevey", "montreux", "sion", "sierre", "martigny", "fribourg", "bulle", "neuchatel",
  "yverdon", "bienne", "berne", "bern", "bale", "basel", "zurich", "zug", "lucerne", "luzern",
  "lugano", "locarno", "bellinzone", "coire", "chur", "saint-gall", "st-gall", "gstaad",
  "verbier", "zermatt", "davos", "crans-montana", "annecy", "annemasse", "ferney-voltaire",
  "thonon", "evian", "divonne", "gex", "lyon", "paris", "marseille", "bordeaux", "lille",
  "nice", "toulouse", "nantes", "strasbourg", "bruxelles", "brussels", "luxembourg", "milan",
  "turin", "londres", "london", "madrid", "barcelone", "barcelona", "monaco",
];

const CITY_DISPLAY: Record<string, string> = {
  geneve: "Genève",
  neuchatel: "Neuchâtel",
  bale: "Bâle",
  zurich: "Zurich",
  berne: "Berne",
  bern: "Berne",
  basel: "Bâle",
  luzern: "Lucerne",
  bruxelles: "Bruxelles",
  brussels: "Bruxelles",
  london: "Londres",
  barcelona: "Barcelone",
  "st-gall": "Saint-Gall",
};

const CITY_STOP_WORDS = new Set([
  "midi", "soir", "ce", "cette", "demain", "aujourdhui", "table", "diner", "dejeuner", "manger",
  "emporter", "livraison", "deux", "trois", "quatre", "cinq", "personnes", "personne", "moi",
  "nous", "toi", "vous", "prix", "chf", "euros", "proximite", "cote", "pied", "partir",
]);

export function normalizeDiscoveryText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-zA-Z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function titleCaseCity(normalized: string): string {
  if (CITY_DISPLAY[normalized]) return CITY_DISPLAY[normalized];
  return normalized
    .split(/[\s-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(normalized.includes("-") ? "-" : " ");
}

function parseQuantity(token: string, allowDeterminer = true): number | null {
  const digits = token.match(/^\d{1,2}$/);
  if (digits) {
    const value = Number(digits[0]);
    return value >= 1 && value <= 20 ? value : null;
  }
  if (!allowDeterminer && DETERMINER_WORDS.has(token)) return null;
  const word = NUMBER_WORDS[token];
  return typeof word === "number" ? word : null;
}

/** Cherche une quantité juste avant la mention de cuisine ("3 pizzerias",
 *  "deux restaurants de sushi"). Retourne null si la personne n'a rien chiffré. */
function quantityBefore(normalized: string, index: number): number | null {
  const window = normalized.slice(Math.max(0, index - 42), index);
  const tokens = window.split(" ").filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const quantity = parseQuantity(tokens[i], false);
    if (quantity !== null) return quantity;
    // On ne franchit pas une autre demande chiffrée ("3 pizzerias et sushi").
    if (tokens[i] === "et" || tokens[i] === "plus" || tokens[i] === "and" || tokens[i] === "puis") continue;
  }
  return null;
}

export function findDiscoveryCuisine(term: string): TokDiscoveryCuisine | null {
  const normalized = normalizeDiscoveryText(term);
  if (!normalized) return null;
  for (const cuisine of TOK_DISCOVERY_CUISINES) {
    if (cuisine.key === normalized) return cuisine;
    if (cuisine.aliases.includes(normalized)) return cuisine;
  }
  for (const cuisine of TOK_DISCOVERY_CUISINES) {
    if (cuisine.aliases.some((alias) => normalized.includes(alias))) return cuisine;
  }
  return null;
}

export function extractDiscoveryCity(raw: string): string | null {
  const normalized = normalizeDiscoveryText(raw);
  if (!normalized) return null;

  for (const city of KNOWN_CITIES) {
    const pattern = new RegExp(`(^|\\s)${city.replace(/[-]/g, "[- ]")}(\\s|$)`);
    if (pattern.test(normalized)) return titleCaseCity(city);
  }

  const prepositions = /(?:^|\s)(?:a|au|aux|en|sur|dans|vers|pres de|proche de|autour de|cote de|in|near|around|at)\s+([a-z][a-z-]{2,}(?:\s[a-z][a-z-]{2,})?)/g;
  let match: RegExpExecArray | null;
  while ((match = prepositions.exec(normalized)) !== null) {
    const candidate = match[1].trim();
    const head = candidate.split(" ")[0];
    if (CITY_STOP_WORDS.has(head)) continue;
    if (findDiscoveryCuisine(head)) continue;
    if (NUMBER_WORDS[head] !== undefined) continue;
    return titleCaseCity(candidate);
  }
  return null;
}

function extractPartySize(normalized: string): number | null {
  const match = normalized.match(/(?:pour|table de|a|party of|for)\s+(\d{1,2}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(?:personnes?|convives?|couverts?|people|guests?|pax)/);
  if (!match) return null;
  const value = parseQuantity(match[1]);
  return value && value >= 1 && value <= 20 ? value : null;
}

function extractPriceMax(normalized: string): number | null {
  const match = normalized.match(/(?:moins de|max|maximum|budget|under|jusqu a)\s+(\d{1,4})\s*(?:chf|francs?|eur|euros?|balles)?/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isoDate(offsetDays: number, today: Date): string {
  const date = new Date(today.getTime());
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function extractDiscoveryDate(raw: string, today = new Date()): string | null {
  const normalized = normalizeDiscoveryText(raw);
  const explicit = normalized.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (explicit) return `${explicit[1]}-${explicit[2]}-${explicit[3]}`;
  const european = normalized.match(/(?:^|\s)(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?(?:\s|$)/);
  if (european) {
    const day = european[1].padStart(2, "0");
    const month = european[2].padStart(2, "0");
    const yearToken = european[3];
    const year = yearToken
      ? (yearToken.length === 2 ? `20${yearToken}` : yearToken)
      : String(today.getUTCFullYear());
    return `${year}-${month}-${day}`;
  }
  if (/\b(ce soir|ce midi|aujourd hui|aujourdhui|tonight|today)\b/.test(normalized)) return isoDate(0, today);
  if (/\b(demain|tomorrow)\b/.test(normalized)) return isoDate(1, today);
  if (/\b(apres demain)\b/.test(normalized)) return isoDate(2, today);
  const weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  for (let index = 0; index < weekdays.length; index += 1) {
    if (new RegExp(`\\b${weekdays[index]}\\b`).test(normalized)) {
      const current = today.getUTCDay();
      const delta = (index - current + 7) % 7 || 7;
      return isoDate(delta, today);
    }
  }
  return null;
}

/**
 * Traduit une demande libre en intentions chiffrées.
 * "3 pizzerias et 2 restaurants de sushi à Genève" =>
 *   [{ pizza, 3 }, { sushi, 2 }], ville "Genève".
 */
export function parseTokDiscoveryRequest(raw: string, today = new Date()): TokDiscoveryRequest {
  const text = String(raw || "");
  const normalized = normalizeDiscoveryText(text);
  const intents: TokDiscoveryIntent[] = [];
  const seen = new Map<string, TokDiscoveryIntent>();

  type Hit = { cuisine: TokDiscoveryCuisine; alias: string; index: number };
  const hits: Hit[] = [];

  for (const cuisine of TOK_DISCOVERY_CUISINES) {
    // Les alias les plus longs d'abord : "poke bowl" avant "bowl".
    const aliases = [...cuisine.aliases].sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
      const pattern = new RegExp(`(^|\\s)${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(s?)(\\s|$)`, "g");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(normalized)) !== null) {
        const index = match.index + match[1].length;
        if (hits.some((hit) => Math.abs(hit.index - index) < alias.length && hit.cuisine.key === cuisine.key)) continue;
        hits.push({ cuisine, alias, index });
        break;
      }
      if (hits.some((hit) => hit.cuisine.key === cuisine.key)) break;
    }
  }

  hits.sort((a, b) => a.index - b.index);

  for (const hit of hits) {
    const quantity = quantityBefore(normalized, hit.index);
    const existing = seen.get(hit.cuisine.key);
    if (existing) {
      if (quantity && quantity > existing.count) existing.count = quantity;
      continue;
    }
    const intent: TokDiscoveryIntent = {
      key: hit.cuisine.key,
      label: hit.cuisine.label,
      plural: hit.cuisine.plural,
      emoji: hit.cuisine.emoji,
      count: quantity || 0,
      matchers: hit.cuisine.matchers,
      spoken: hit.alias,
    };
    seen.set(hit.cuisine.key, intent);
    intents.push(intent);
  }

  // Aucune quantité explicite : on répartit un total raisonnable.
  const explicitTotal = intents.reduce((total, intent) => total + intent.count, 0);
  if (intents.length > 0 && explicitTotal === 0) {
    const perIntent = intents.length === 1 ? 5 : Math.max(2, Math.floor(6 / intents.length));
    for (const intent of intents) intent.count = perIntent;
  } else {
    for (const intent of intents) {
      if (intent.count === 0) intent.count = Math.max(1, Math.round(explicitTotal / Math.max(1, intents.length)));
    }
  }

  const city = extractDiscoveryCity(text);
  const totalRequested = intents.reduce((total, intent) => total + intent.count, 0);

  return {
    raw: text,
    city,
    intents,
    totalRequested: totalRequested || 6,
    partySize: extractPartySize(normalized),
    date: extractDiscoveryDate(text, today),
    priceMax: extractPriceMax(normalized),
    requiresReservation: /\b(reserv|table|book|booking)\b/.test(normalized),
    freeText: text.trim() || null,
  };
}

export function bayesianRating(rating: number | null | undefined, reviewCount: number | null | undefined): number {
  const value = typeof rating === "number" && Number.isFinite(rating) ? rating : 0;
  const votes = typeof reviewCount === "number" && Number.isFinite(reviewCount) ? Math.max(0, reviewCount) : 0;
  if (!value) return 0;
  return (votes * value + BAYESIAN_PRIOR_WEIGHT * BAYESIAN_PRIOR_RATING) / (votes + BAYESIAN_PRIOR_WEIGHT);
}

export function rowRating(row: TokRestaurantRow): number | null {
  const candidates = [row.rating, row.avg_rating];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return null;
}

export function rowReviewCount(row: TokRestaurantRow): number {
  const candidates = [row.review_count, row.rating_count];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) return Math.round(candidate);
  }
  return 0;
}

/** Pertinence texte : la cuisine déclarée compte plus que le nom, qui compte
 *  plus que la description. */
/** "pizza" doit reconnaître "pizzeria", "italien" doit reconnaître
 *  "italienne" : on compare sur un radical plutôt que sur le mot entier. */
export function discoveryStem(term: string): string {
  const normalized = normalizeDiscoveryText(term);
  // Une expression en plusieurs mots (« dim sum », « poke bowl ») se cherche
  // telle quelle : seul un mot unique est réduit à son radical.
  if (normalized.includes(" ") || normalized.length <= 4) return normalized;
  return normalized.slice(0, Math.max(4, normalized.length - 2));
}

function fieldMatchesMatcher(field: string, matcher: string): boolean {
  if (!field || !matcher) return false;
  if (field.includes(matcher)) return true;
  const stem = discoveryStem(matcher);
  if (stem.length < 4) return false;
  return field.includes(stem);
}

export function cuisineAffinity(row: TokRestaurantRow, matchers: string[]): number {
  if (!matchers.length) return 0;
  const cuisine = normalizeDiscoveryText(String(row.cuisine_type || ""));
  const name = normalizeDiscoveryText(String(row.name || ""));
  const description = normalizeDiscoveryText(String(row.description || ""));
  let affinity = 0;
  for (const matcher of matchers) {
    const needle = normalizeDiscoveryText(matcher);
    if (!needle) continue;
    if (fieldMatchesMatcher(cuisine, needle)) affinity = Math.max(affinity, 1);
    else if (fieldMatchesMatcher(name, needle)) affinity = Math.max(affinity, 0.75);
    else if (fieldMatchesMatcher(description, needle)) affinity = Math.max(affinity, 0.4);
  }
  return affinity;
}

export function scoreDiscoveryCandidate(row: TokRestaurantRow, matchers: string[] = []): number {
  const rating = rowRating(row);
  const reviews = rowReviewCount(row);
  const ranked = bayesianRating(rating, reviews);
  const popularity = Math.log10(1 + reviews) / 3;
  const affinity = cuisineAffinity(row, matchers);
  const featured = row.is_featured === true ? 0.2 : 0;
  const bookable = row.supports_reservation === true ? 0.2 : 0;
  const illustrated = typeof row.image_url === "string" && row.image_url.trim() ? 0.15 : 0;
  const score = ranked * 1.6 + popularity * 1.1 + affinity * 1.4 + featured + bookable + illustrated;
  return Math.round(score * 1000) / 1000;
}

export function priceDisplay(priceRange: number | null | undefined): string {
  const value = typeof priceRange === "number" && Number.isFinite(priceRange) ? Math.round(priceRange) : 0;
  if (value <= 0) return "";
  return Array.from({ length: Math.min(4, value) }, () => "$").join("");
}

function ratingDisplay(rating: number | null): string {
  if (rating === null) return "Nouveau";
  return rating.toFixed(1).replace(".", ",");
}

export function buildDiscoveryBadges(row: TokRestaurantRow, isTopRated: boolean): TokDiscoveryBadge[] {
  const badges: TokDiscoveryBadge[] = [];
  if (isTopRated) badges.push({ label: "Top noté", tone: "gold" });
  if (row.is_featured === true) badges.push({ label: "Coup de cœur TOK", tone: "orange" });
  if (row.supports_reservation === true) badges.push({ label: "Réservation", tone: "green" });
  if (row.supports_dinein === true) badges.push({ label: "Sur place", tone: "neutral" });
  if (row.supports_pickup === true) badges.push({ label: "À emporter", tone: "neutral" });
  if (row.delivery_available === true) badges.push({ label: "Livraison", tone: "neutral" });
  return badges.slice(0, 4);
}

export function mapRestaurantToCard(
  row: TokRestaurantRow,
  options: {
    origin?: string;
    group?: { key: string; label: string; emoji: string };
    rank?: number;
    reason?: string;
  } = {},
): TokDiscoveryCard {
  const origin = (options.origin || DEFAULT_ORIGIN).replace(/\/$/, "");
  const id = String(row.id || "");
  const rating = rowRating(row);
  const reviews = rowReviewCount(row);
  const isTopRated = (rating || 0) >= 4.5 && reviews >= 20;
  const latitude = typeof row.latitude === "number" ? row.latitude : null;
  const longitude = typeof row.longitude === "number" ? row.longitude : null;
  const addressLine = [row.address, row.city].filter(Boolean).join(", ");

  return {
    id,
    name: String(row.name || "Restaurant TOK"),
    slug: typeof row.slug === "string" && row.slug ? row.slug : null,
    cuisine: typeof row.cuisine_type === "string" && row.cuisine_type ? row.cuisine_type : null,
    group_key: options.group?.key || "selection",
    group_label: options.group?.label || "Sélection TOK",
    emoji: options.group?.emoji || "🍽️",
    rating,
    rating_display: ratingDisplay(rating),
    review_count: reviews,
    score: scoreDiscoveryCandidate(row),
    rank: options.rank || 0,
    price_range: typeof row.price_range === "number" ? row.price_range : null,
    price_display: priceDisplay(row.price_range),
    city: typeof row.city === "string" && row.city ? row.city : null,
    address: typeof row.address === "string" && row.address ? row.address : null,
    image_url: typeof row.image_url === "string" && /^https?:\/\//i.test(row.image_url) ? row.image_url : null,
    description: typeof row.description === "string" && row.description ? row.description : null,
    phone: typeof row.phone === "string" && row.phone ? row.phone : null,
    latitude,
    longitude,
    supports_reservation: row.supports_reservation === true,
    supports_dinein: row.supports_dinein === true,
    supports_pickup: row.supports_pickup === true,
    delivery_available: row.delivery_available === true,
    is_top_rated: isTopRated,
    badges: buildDiscoveryBadges(row, isTopRated),
    match_reason: options.reason || "",
    url: `${origin}/restaurant/${encodeURIComponent(id)}`,
    map_url: addressLine
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine)}`
      : latitude !== null && longitude !== null
        ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
        : null,
  };
}

/**
 * Assemble la sélection finale : chaque intention reçoit ses meilleures
 * adresses, sans doublon entre les groupes, puis le tout est classé.
 */
export function buildDiscoverySelection(input: {
  request: TokDiscoveryRequest;
  rowsByIntent: Array<{ intent: TokDiscoveryIntent; rows: TokRestaurantRow[] }>;
  fallbackRows?: TokRestaurantRow[];
  origin?: string;
}): { cards: TokDiscoveryCard[]; groups: TokDiscoveryGroup[]; notes: string[] } {
  const origin = (input.origin || DEFAULT_ORIGIN).replace(/\/$/, "");
  const used = new Set<string>();
  const cards: TokDiscoveryCard[] = [];
  const groups: TokDiscoveryGroup[] = [];
  const notes: string[] = [];

  for (const bucket of input.rowsByIntent) {
    const { intent, rows } = bucket;
    const ranked = [...rows]
      .filter((row) => row && typeof row.id === "string" && row.id)
      .map((row) => ({ row, score: scoreDiscoveryCandidate(row, intent.matchers) }))
      .sort((a, b) => b.score - a.score);

    let delivered = 0;
    for (const candidate of ranked) {
      if (delivered >= intent.count) break;
      const id = String(candidate.row.id);
      if (used.has(id)) continue;
      used.add(id);
      delivered += 1;
      cards.push(mapRestaurantToCard(candidate.row, {
        origin,
        group: { key: intent.key, label: intent.label, emoji: intent.emoji },
        reason: `Sélectionné pour « ${intent.spoken || intent.label} »`,
      }));
    }

    groups.push({
      key: intent.key,
      label: intent.label,
      plural: intent.plural,
      emoji: intent.emoji,
      requested: intent.count,
      delivered,
      spoken: intent.spoken || intent.label,
    });

    if (delivered < intent.count) {
      notes.push(
        delivered === 0
          ? `Aucune adresse ${intent.label.toLowerCase()} active sur TOK pour cette recherche.`
          : `${delivered} adresse${delivered > 1 ? "s" : ""} ${intent.label.toLowerCase()} disponible${delivered > 1 ? "s" : ""} sur ${intent.count} demandée${intent.count > 1 ? "s" : ""}.`,
      );
    }
  }

  const missing = input.request.totalRequested - cards.length;
  if (missing > 0 && Array.isArray(input.fallbackRows) && input.fallbackRows.length) {
    const ranked = [...input.fallbackRows]
      .filter((row) => row && typeof row.id === "string" && row.id && !used.has(String(row.id)))
      .map((row) => ({ row, score: scoreDiscoveryCandidate(row) }))
      .sort((a, b) => b.score - a.score);
    for (const candidate of ranked.slice(0, missing)) {
      used.add(String(candidate.row.id));
      cards.push(mapRestaurantToCard(candidate.row, {
        origin,
        group: { key: "selection", label: "Sélection TOK", emoji: "🍽️" },
        reason: "Complément TOK le mieux noté",
      }));
    }
    if (ranked.length) notes.push("La sélection a été complétée par les meilleures tables TOK à proximité.");
  }

  const ordered = cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => (b.card.score - a.card.score) || (a.index - b.index))
    .map((entry, index) => ({ ...entry.card, rank: index + 1 }));

  return { cards: ordered, groups, notes };
}

function joinHumanList(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

export function describeDiscoverySelection(groups: TokDiscoveryGroup[], city: string | null): string {
  const parts = groups
    .filter((group) => group.delivered > 0)
    .map((group) => `${group.delivered} ${group.delivered > 1 ? group.plural : group.label.toLowerCase()}`);
  const base = parts.length ? joinHumanList(parts) : "une sélection de restaurants";
  return city ? `${base} à ${city}` : base;
}

export function buildDiscoveryPayload(input: {
  request: TokDiscoveryRequest;
  cards: TokDiscoveryCard[];
  groups: TokDiscoveryGroup[];
  notes: string[];
  origin?: string;
  now?: Date;
}): TokDiscoveryPayload {
  const origin = (input.origin || DEFAULT_ORIGIN).replace(/\/$/, "");
  const city = input.request.city;
  const summary = describeDiscoverySelection(input.groups, city);
  const title = summary.charAt(0).toUpperCase() + summary.slice(1);
  const deepLink = city
    ? `${origin}/restaurants?city=${encodeURIComponent(city)}`
    : `${origin}/restaurants`;

  return {
    kind: "restaurant_selection",
    title,
    subtitle: input.cards.length
      ? "Sélection TOK · classées par note et fiabilité des avis"
      : "Aucune adresse TOK ne correspond encore à cette demande",
    summary,
    city,
    query: input.request.raw,
    groups: input.groups,
    restaurants: input.cards,
    detail: null,
    notes: input.notes,
    party_size: input.request.partySize,
    date: input.request.date,
    deep_link: deepLink,
    requested_total: input.request.totalRequested,
    delivered_total: input.cards.length,
    generated_at: (input.now || new Date()).toISOString(),
  };
}

const WEEKDAY_LABELS: Array<{ keys: string[]; label: string }> = [
  { keys: ["monday", "lundi", "mon", "lun"], label: "Lundi" },
  { keys: ["tuesday", "mardi", "tue", "mar"], label: "Mardi" },
  { keys: ["wednesday", "mercredi", "wed", "mer"], label: "Mercredi" },
  { keys: ["thursday", "jeudi", "thu", "jeu"], label: "Jeudi" },
  { keys: ["friday", "vendredi", "fri", "ven"], label: "Vendredi" },
  { keys: ["saturday", "samedi", "sat", "sam"], label: "Samedi" },
  { keys: ["sunday", "dimanche", "sun", "dim"], label: "Dimanche" },
];

function formatHoursValue(value: unknown): string {
  if (!value) return "Fermé";
  if (typeof value === "string") return value.trim() || "Fermé";
  if (Array.isArray(value)) {
    const ranges = value
      .map((entry) => formatHoursValue(entry))
      .filter((entry) => entry && entry !== "Fermé");
    return ranges.length ? ranges.join(" · ") : "Fermé";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.closed === true) return "Fermé";
    const open = record.open ?? record.from ?? record.start ?? record.opens;
    const close = record.close ?? record.to ?? record.end ?? record.closes;
    if (open && close) return `${String(open)} – ${String(close)}`;
    if (open) return `dès ${String(open)}`;
  }
  return "Fermé";
}

/** Normalise `opening_hours` (JSON libre en base) en 7 lignes affichables. */
export function normalizeOpeningHours(value: unknown): Array<{ day: string; hours: string }> {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const rows: Array<{ day: string; hours: string }> = [];
  for (const weekday of WEEKDAY_LABELS) {
    const key = Object.keys(record).find((candidate) => weekday.keys.includes(candidate.toLowerCase()));
    if (!key) continue;
    rows.push({ day: weekday.label, hours: formatHoursValue(record[key]) });
  }
  return rows;
}

export function todayOpeningHours(
  rows: Array<{ day: string; hours: string }>,
  today = new Date(),
): { day: string; hours: string } | null {
  if (!rows.length) return null;
  const index = (today.getUTCDay() + 6) % 7;
  const label = WEEKDAY_LABELS[index]?.label;
  return rows.find((row) => row.day === label) || null;
}

export type TokDiscoveryDetail = TokDiscoveryCard & {
  kind: "restaurant_detail";
  amenities: string[];
  opening_hours: Array<{ day: string; hours: string }>;
  today_hours: { day: string; hours: string } | null;
  menu_highlights: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string;
    category: string | null;
    image_url: string | null;
  }>;
  availability: { date: string | null; slots: Array<{ time: string; service: string | null; remaining: number | null; available: boolean }> };
  reservation_hint: string;
};

export function mapRestaurantToDetail(
  row: TokRestaurantRow,
  options: {
    origin?: string;
    menuItems?: Array<Record<string, unknown>>;
    availability?: { date?: string | null; slots?: Array<Record<string, unknown>> } | null;
    now?: Date;
  } = {},
): TokDiscoveryDetail {
  const card = mapRestaurantToCard(row, { origin: options.origin });
  const openingHours = normalizeOpeningHours(row.opening_hours);
  const menuItems = Array.isArray(options.menuItems) ? options.menuItems : [];
  const rawSlots = Array.isArray(options.availability?.slots) ? options.availability?.slots || [] : [];

  return {
    ...card,
    kind: "restaurant_detail",
    amenities: Array.isArray(row.amenities) ? row.amenities.filter((item) => typeof item === "string").slice(0, 12) : [],
    opening_hours: openingHours,
    today_hours: todayOpeningHours(openingHours, options.now || new Date()),
    menu_highlights: menuItems.slice(0, 8).map((item, index) => ({
      id: String(item.id || `menu-${index}`),
      name: String(item.name || "Plat TOK"),
      description: typeof item.description === "string" && item.description ? item.description : null,
      price: typeof item.price === "number" && Number.isFinite(item.price) ? item.price : null,
      currency: typeof item.currency === "string" && item.currency ? item.currency : "CHF",
      category: typeof item.category === "string" && item.category ? item.category : null,
      image_url: typeof item.image_url === "string" && /^https?:\/\//i.test(item.image_url) ? item.image_url : null,
    })),
    availability: {
      date: options.availability?.date ? String(options.availability.date) : null,
      slots: rawSlots
        .map((slot) => ({
          time: String(slot.slot_time || slot.time || "").slice(0, 5),
          service: typeof slot.service === "string" && slot.service ? slot.service : null,
          remaining: typeof slot.remaining_tables === "number"
            ? slot.remaining_tables
            : typeof slot.remaining === "number"
              ? slot.remaining
              : null,
          available: slot.available !== false,
        }))
        .filter((slot) => slot.time)
        .slice(0, 18),
    },
    reservation_hint: card.supports_reservation
      ? "Réservation TOK disponible : la confirmation reste explicite côté client."
      : "Cette adresse ne prend pas encore de réservation via TOK.",
  };
}

/* ------------------------------------------------------------------------ *
 * Exécution : la même orchestration sert le MCP canonique et les tests.     *
 * Le client est décrit par sa forme (PostgREST) plutôt que par son type     *
 * Supabase, pour rester utilisable côté application comme côté Edge.        *
 * ------------------------------------------------------------------------ */

export type TokDiscoveryQuery = PromiseLike<{ data: unknown; error: { message?: string } | null }> & {
  select: (columns: string) => TokDiscoveryQuery;
  eq: (column: string, value: unknown) => TokDiscoveryQuery;
  ilike: (column: string, pattern: string) => TokDiscoveryQuery;
  or: (filter: string) => TokDiscoveryQuery;
  order: (column: string, options?: Record<string, unknown>) => TokDiscoveryQuery;
  limit: (count: number) => TokDiscoveryQuery;
  maybeSingle: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export type TokDiscoveryClient = {
  from: (table: string) => TokDiscoveryQuery;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export class TokDiscoveryError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TokDiscoveryError";
    this.status = status;
  }
}

export const RESTAURANT_DISCOVERY_SELECT =
  "id, name, slug, description, cuisine_type, address, city, phone, image_url, rating, review_count, rating_count, price_range, latitude, longitude, amenities, opening_hours, is_featured, supports_reservation, supports_dinein, supports_pickup, delivery_available";

/** PostgREST utilise `*` comme joker dans les filtres logiques ; on retire
 *  aussi les séparateurs qui casseraient l'expression `or(...)`. */
export function sanitizeDiscoveryMatcher(value: string): string {
  return String(value || "")
    .replace(/[,()*%\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export function buildDiscoveryOrFilter(matchers: string[]): string | null {
  const clauses: string[] = [];
  const seen = new Set<string>();
  for (const matcher of matchers) {
    // On filtre sur le radical (« pizz ») pour que « pizza » ramène aussi
    // « pizzeria » ; le score affine ensuite le classement.
    const safe = sanitizeDiscoveryMatcher(discoveryStem(matcher));
    if (safe.length < 3 || seen.has(safe)) continue;
    seen.add(safe);
    clauses.push(`cuisine_type.ilike.*${safe}*`);
    clauses.push(`name.ilike.*${safe}*`);
    clauses.push(`description.ilike.*${safe}*`);
  }
  return clauses.length ? clauses.join(",") : null;
}

/** Texte à analyser : la demande brute, complétée par les indices structurés. */
export function discoveryRequestText(args: Record<string, unknown>): string {
  return [
    typeof args.request === "string" ? args.request : "",
    typeof args.query === "string" ? args.query : "",
    typeof args.cuisine === "string" ? args.cuisine : "",
    typeof args.city === "string" ? args.city : "",
  ].filter(Boolean).join(" ").trim();
}

/** Les `selections` explicites du modèle priment sur l'analyse du texte libre. */
export function resolveDiscoveryIntents(
  request: TokDiscoveryRequest,
  args: Record<string, unknown>,
): TokDiscoveryIntent[] {
  const explicit = Array.isArray(args.selections) ? args.selections : [];
  const intents: TokDiscoveryIntent[] = [];

  for (const entry of explicit) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const spoken = String(record.cuisine || "").trim();
    if (!spoken) continue;
    const count = Number(record.count);
    const cuisine = findDiscoveryCuisine(spoken);
    intents.push({
      key: cuisine?.key || normalizeDiscoveryText(spoken).slice(0, 40) || "selection",
      label: cuisine?.label || spoken.charAt(0).toUpperCase() + spoken.slice(1),
      plural: cuisine?.plural || `restaurants ${spoken}`,
      emoji: cuisine?.emoji || "🍽️",
      count: Number.isFinite(count) && count > 0 ? Math.min(10, Math.round(count)) : 3,
      matchers: cuisine?.matchers || [spoken],
      spoken,
    });
  }

  if (intents.length) return intents;
  if (request.intents.length) return request.intents;

  const limit = Number(args.limit);
  return [{
    key: "selection",
    label: "Sélection TOK",
    plural: "tables TOK",
    emoji: "🍽️",
    count: Number.isFinite(limit) && limit > 0 ? Math.min(20, Math.round(limit)) : 6,
    matchers: [],
    spoken: "sélection TOK",
  }];
}

/** Ramène le total demandé sous la limite explicite, sans vider un groupe. */
export function scaleDiscoveryIntents(intents: TokDiscoveryIntent[], cap: number): TokDiscoveryIntent[] {
  const total = intents.reduce((sum, intent) => sum + intent.count, 0);
  if (!total || total <= cap) return intents;
  const scaled = intents.map((intent) => ({
    ...intent,
    count: Math.max(1, Math.floor((intent.count / total) * cap)),
  }));
  let overflow = scaled.reduce((sum, intent) => sum + intent.count, 0) - cap;
  for (let index = scaled.length - 1; index >= 0 && overflow > 0; index -= 1) {
    const reducible = Math.min(overflow, scaled[index].count - 1);
    scaled[index].count -= reducible;
    overflow -= reducible;
  }
  return scaled;
}

/** Candidats bruts pour un besoin : la base filtre, le score classe ensuite. */
export async function fetchDiscoveryCandidates(
  client: TokDiscoveryClient,
  options: { city?: string | null; matchers?: string[]; limit: number; requiresReservation?: boolean },
): Promise<TokRestaurantRow[]> {
  let query = client
    .from("restaurants")
    .select(RESTAURANT_DISCOVERY_SELECT)
    .eq("is_active", true)
    .order("rating", { ascending: false, nullsFirst: false })
    .order("review_count", { ascending: false, nullsFirst: false })
    .limit(Math.min(60, Math.max(options.limit * 5, 12)));

  if (options.city && options.city.trim()) {
    query = query.ilike("city", `%${options.city.trim().slice(0, 80)}%`);
  }
  if (options.requiresReservation) {
    query = query.eq("supports_reservation", true);
  }
  const orFilter = buildDiscoveryOrFilter(options.matchers || []);
  if (orFilter) query = query.or(orFilter);

  const { data, error } = await query;
  if (error) throw new TokDiscoveryError(500, error.message || "discovery_query_failed");
  return (Array.isArray(data) ? data : []) as TokRestaurantRow[];
}

/** Point d'entrée de l'outil `discover_restaurants`. */
export async function runTokDiscovery(input: {
  client: TokDiscoveryClient;
  args: Record<string, unknown>;
  origin?: string;
  now?: Date;
}): Promise<TokDiscoveryPayload> {
  const origin = (input.origin || DEFAULT_ORIGIN).replace(/\/$/, "");
  const args = input.args || {};
  const now = input.now || new Date();

  const parsed = parseTokDiscoveryRequest(discoveryRequestText(args), now);
  const intents = resolveDiscoveryIntents(parsed, args);
  const city = typeof args.city === "string" && args.city.trim() ? args.city.trim() : parsed.city;
  const limit = Number(args.limit);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(20, Math.round(limit)) : 0;
  const requiresReservation = args.requires_reservation === true;
  const partySize = Number(args.party_size);

  const scaled = cap > 0 ? scaleDiscoveryIntents(intents, cap) : intents;
  const request: TokDiscoveryRequest = {
    ...parsed,
    city,
    intents: scaled,
    totalRequested: scaled.reduce((total, intent) => total + intent.count, 0),
    partySize: Number.isFinite(partySize) && partySize > 0 ? Math.round(partySize) : parsed.partySize,
    date: typeof args.date === "string" && args.date ? args.date : parsed.date,
    requiresReservation: requiresReservation || parsed.requiresReservation,
  };

  const buckets = await Promise.all(scaled.map(async (intent) => ({
    intent,
    rows: await fetchDiscoveryCandidates(input.client, {
      city,
      matchers: intent.matchers,
      limit: intent.count,
      requiresReservation,
    }),
  })));

  const delivered = buckets.reduce(
    (total, bucket) => total + Math.min(bucket.rows.length, bucket.intent.count),
    0,
  );
  const fallbackRows = delivered < request.totalRequested
    ? await fetchDiscoveryCandidates(input.client, {
      city,
      matchers: [],
      limit: request.totalRequested,
      requiresReservation,
    })
    : [];

  const selection = buildDiscoverySelection({ request, rowsByIntent: buckets, fallbackRows, origin });
  return buildDiscoveryPayload({
    request,
    cards: selection.cards,
    groups: selection.groups,
    notes: selection.notes,
    origin,
    now,
  });
}

/** Point d'entrée de l'outil `get_restaurant_details`. */
export async function runTokRestaurantDetail(input: {
  client: TokDiscoveryClient;
  args: Record<string, unknown>;
  origin?: string;
  now?: Date;
}): Promise<TokDiscoveryDetail> {
  const origin = (input.origin || DEFAULT_ORIGIN).replace(/\/$/, "");
  const args = input.args || {};
  const now = input.now || new Date();
  const restaurantId = String(args.restaurant_id || "");
  if (!restaurantId) throw new TokDiscoveryError(400, "restaurant_id_required");

  const { data, error } = await input.client
    .from("restaurants")
    .select(RESTAURANT_DISCOVERY_SELECT)
    .eq("id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new TokDiscoveryError(500, error.message || "restaurant_query_failed");
  if (!data) throw new TokDiscoveryError(404, "restaurant_not_found");
  const row = data as TokRestaurantRow;

  let menuItems: Array<Record<string, unknown>> = [];
  if (args.include_menu !== false) {
    const menu = await input.client
      .from("menu_items")
      .select("id, name, description, price, category, image_url")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true })
      .limit(8);
    if (!menu.error && Array.isArray(menu.data)) menuItems = menu.data as Array<Record<string, unknown>>;
  }

  // Les créneaux restent facultatifs : une adresse sans convention de
  // réservation affiche sa fiche complète, simplement sans horaires libres.
  let availability: { date: string; slots: Array<Record<string, unknown>> } | null = null;
  if (args.include_availability !== false && row.supports_reservation === true) {
    const date = typeof args.date === "string" && args.date ? args.date : now.toISOString().slice(0, 10);
    const slots = await input.client.rpc("get_restaurant_reservation_slot_availability", {
      p_restaurant_id: restaurantId,
      p_date: date,
    });
    if (!slots.error && Array.isArray(slots.data)) {
      availability = { date, slots: slots.data as Array<Record<string, unknown>> };
    }
  }

  return mapRestaurantToDetail(row, { origin, menuItems, availability, now });
}

/* ---------------------- Environnement sandbox TOK ------------------------ */

export const TOK_SANDBOX_DISCOVERY_ROWS: TokRestaurantRow[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "TOK Sandbox Pizzeria Vesuvio",
    cuisine_type: "Pizzeria napolitaine",
    city: "Genève",
    address: "Rue du Rhône 12",
    description: "Pâte maturée 48 h, four à bois, burrata des Pouilles.",
    rating: 4.8,
    review_count: 412,
    price_range: 2,
    supports_reservation: true,
    supports_dinein: true,
    is_featured: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "TOK Sandbox Trattoria Carouge",
    cuisine_type: "Italien · Pizza",
    city: "Genève",
    address: "Place du Marché 4",
    description: "Trattoria de quartier, pizzas au feu de bois et antipasti.",
    rating: 4.6,
    review_count: 268,
    price_range: 2,
    supports_reservation: true,
    supports_dinein: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    name: "TOK Sandbox Forno Pâquis",
    cuisine_type: "Pizza",
    city: "Genève",
    address: "Rue de Berne 27",
    description: "Pizzas romaines fines, service continu jusqu'à minuit.",
    rating: 4.5,
    review_count: 191,
    price_range: 1,
    supports_reservation: true,
    supports_pickup: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    name: "TOK Sandbox Sakura Sushi",
    cuisine_type: "Japonais · Sushi",
    city: "Genève",
    address: "Quai des Bergues 9",
    description: "Omakase de saison, poissons livrés chaque matin.",
    rating: 4.9,
    review_count: 356,
    price_range: 3,
    supports_reservation: true,
    supports_dinein: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000105",
    name: "TOK Sandbox Kaiten Eaux-Vives",
    cuisine_type: "Sushi",
    city: "Genève",
    address: "Rue Versonnex 3",
    description: "Sushi bar tapis roulant, makis signature et pokés.",
    rating: 4.6,
    review_count: 224,
    price_range: 2,
    supports_reservation: true,
    supports_pickup: true,
  },
];

export function buildSandboxDiscoveryPayload(
  args: Record<string, unknown>,
  origin?: string,
  now?: Date,
): TokDiscoveryPayload {
  const at = now || new Date();
  const parsed = parseTokDiscoveryRequest(discoveryRequestText(args), at);
  const intents = resolveDiscoveryIntents(parsed, args);
  const request: TokDiscoveryRequest = {
    ...parsed,
    intents,
    city: parsed.city || (typeof args.city === "string" && args.city ? args.city : "Genève"),
    totalRequested: intents.reduce((total, intent) => total + intent.count, 0),
  };
  const selection = buildDiscoverySelection({
    request,
    rowsByIntent: intents.map((intent) => ({
      intent,
      rows: TOK_SANDBOX_DISCOVERY_ROWS.filter((row) => cuisineAffinity(row, intent.matchers) > 0 || !intent.matchers.length),
    })),
    fallbackRows: TOK_SANDBOX_DISCOVERY_ROWS,
    origin,
  });
  return buildDiscoveryPayload({
    request,
    cards: selection.cards,
    groups: selection.groups,
    notes: [...selection.notes, "Environnement sandbox TOK : données de démonstration."],
    origin,
    now: at,
  });
}

export function buildSandboxRestaurantDetail(
  args: Record<string, unknown>,
  origin?: string,
  now?: Date,
): TokDiscoveryDetail {
  const at = now || new Date();
  const restaurantId = String(args.restaurant_id || "");
  const row = TOK_SANDBOX_DISCOVERY_ROWS.find((entry) => entry.id === restaurantId) || TOK_SANDBOX_DISCOVERY_ROWS[0];
  return mapRestaurantToDetail(row, {
    origin,
    now: at,
    menuItems: [
      { id: "sandbox-menu-1", name: "Margherita DOP", description: "San Marzano, fior di latte, basilic", price: 21, currency: "CHF" },
      { id: "sandbox-menu-2", name: "Menu découverte TOK", description: "Entrée, plat, dessert du marché", price: 48, currency: "CHF" },
    ],
    availability: {
      date: typeof args.date === "string" && args.date ? args.date : at.toISOString().slice(0, 10),
      slots: [
        { slot_time: "12:00", service: "lunch", remaining_tables: 4, available: true },
        { slot_time: "19:30", service: "dinner", remaining_tables: 2, available: true },
        { slot_time: "21:00", service: "dinner", remaining_tables: 0, available: false },
      ],
    },
  });
}
