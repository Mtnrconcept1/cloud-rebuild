import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 3;
const MAX_ERROR_LENGTH = 500;
const MAX_HTML_CHARACTERS = 1_200_000;
const MAX_ROBOTS_CHARACTERS = 200_000;
const MAX_PAGES_PER_SITE = 4;
const MAX_DISCOVERY_CANDIDATES = 4;
const MAX_ASSIGNMENTS = 12;
const MIN_CATALOG_SITE_SCORE = 4;
const MIN_EMAIL_SITE_SCORE = 6;
const MIN_GUESSED_SITE_SCORE = 8;
const FETCH_TIMEOUT_MS = 6_000;
const DEFAULT_CRAWL_DELAY_MS = 300;
const USER_AGENT = "TOK-Directory-Scraper/1.0 (+https://www.thetok.ch)";

const REJECTED_SITE_HOSTS = [
  "thefork.ch",
  "thefork.com",
  "tripadvisor.ch",
  "tripadvisor.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "local.ch",
  "search.ch",
  "google.com",
  "google.ch",
  "bing.com",
  "yelp.com",
  "ubereats.com",
  "just-eat.ch",
  "smood.ch",
];

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "live.com",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "bluewin.ch",
  "sunrise.ch",
  "hispeed.ch",
  "gmx.ch",
  "gmx.com",
]);

const GENERIC_NAME_TOKENS = new Set([
  "restaurant",
  "restaurants",
  "cafe",
  "bar",
  "brasserie",
  "auberge",
  "geneve",
  "sarl",
  "sa",
  "gmbh",
  "ag",
  "sagl",
  "ltd",
]);

const PAGE_LINK_KEYWORDS = [
  "menu",
  "carte",
  "food",
  "restaurant",
  "cuisine",
  "brunch",
  "about",
  "a-propos",
  "concept",
];

const COMMON_PAGE_PATHS = ["/menu", "/carte", "/restaurant"];

type RestaurantRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  directory_source_reference: string | null;
  is_directory_listing: boolean;
};

type LeadHints = {
  website: string | null;
  email: string | null;
};

type WebsiteCandidate = {
  url: string;
  method: "catalog_website" | "business_email_domain" | "domain_guess";
};

type CrawledPage = {
  url: string;
  html: string;
  identityScore: number;
  discoveryMethod: WebsiteCandidate["method"];
};

type RobotsRule = { allow: boolean; path: string };
type RobotsPolicy = { rules: RobotsRule[]; crawlDelayMs: number; denyAll: boolean };

type CuisineRule = {
  slug: string;
  label: string;
  phrases: string[];
};

type CuisineAssignment = {
  slug: string;
  label: string;
  confidence: number;
  evidence: {
    extraction_method: "jsonld_serves_cuisine" | "official_page_phrase";
    matched_phrase: string;
    excerpt: string;
  };
};

const CUISINE_RULES: CuisineRule[] = [
  { slug: "africain", label: "Africain", phrases: ["cuisine africaine", "african cuisine", "restaurant africain"] },
  { slug: "americain", label: "Americain", phrases: ["cuisine americaine", "american cuisine", "american food", "american diner"] },
  { slug: "argentin", label: "Argentin", phrases: ["cuisine argentine", "argentinian cuisine", "restaurant argentin"] },
  { slug: "asiatique", label: "Asiatique", phrases: ["cuisine asiatique", "asian cuisine", "asian food"] },
  { slug: "balkanique", label: "Balkanique", phrases: ["cuisine des balkans", "balkan cuisine", "cuisine balkanique"] },
  { slug: "bistro", label: "Bistro", phrases: ["bistro cuisine", "bistronomie", "bistronomique"] },
  { slug: "boulangerie", label: "Boulangerie", phrases: ["boulangerie artisanale", "artisan bakery", "bakery cafe"] },
  { slug: "bresilien", label: "Bresilien", phrases: ["cuisine bresilienne", "brazilian cuisine", "restaurant bresilien"] },
  { slug: "brunch", label: "Brunch", phrases: ["menu brunch", "brunch menu", "brunch du dimanche", "sunday brunch"] },
  { slug: "bubble-tea", label: "Bubble Tea", phrases: ["bubble tea", "boba tea"] },
  { slug: "burger", label: "Burger", phrases: ["smash burger", "gourmet burger", "burger maison", "burgers maison", "burger restaurant"] },
  { slug: "buvette", label: "Buvette", phrases: ["buvette restaurant", "buvette estivale"] },
  { slug: "cafe", label: "Cafe", phrases: ["coffee shop", "specialty coffee", "cafe restaurant", "cafe gourmand"] },
  { slug: "cafeteria", label: "Cafeteria", phrases: ["self service cafeteria", "cafeteria restaurant"] },
  { slug: "chinois", label: "Chinois", phrases: ["cuisine chinoise", "chinese cuisine", "restaurant chinois", "cuisine cantonaise", "cuisine sichuanaise"] },
  { slug: "coreen", label: "Coreen", phrases: ["cuisine coreenne", "korean cuisine", "korean food", "restaurant coreen"] },
  { slug: "crepes", label: "Crepes", phrases: ["creperie", "crepes et galettes", "galettes bretonnes"] },
  { slug: "desserts", label: "Desserts", phrases: ["dessert bar", "desserts maison", "dessert shop", "sweet treats"] },
  { slug: "erythreen", label: "Erythreen", phrases: ["cuisine erythreenne", "eritrean cuisine", "restaurant erythreen"] },
  { slug: "espagnol", label: "Espagnol", phrases: ["cuisine espagnole", "spanish cuisine", "restaurant espagnol"] },
  { slug: "ethiopien", label: "Ethiopien", phrases: ["cuisine ethiopienne", "ethiopian cuisine", "restaurant ethiopien"] },
  { slug: "europeen", label: "Europeen", phrases: ["cuisine europeenne", "european cuisine"] },
  { slug: "fine-dining", label: "Fine dining", phrases: ["restaurant gastronomique", "gastronomic restaurant", "fine dining", "haute cuisine"] },
  { slug: "francais", label: "Francais", phrases: ["cuisine francaise", "french cuisine", "restaurant francais"] },
  { slug: "fruits-de-mer", label: "Fruits de mer", phrases: ["restaurant de fruits de mer", "seafood restaurant", "fruits de mer et poissons"] },
  { slug: "fusion", label: "Fusion", phrases: ["cuisine fusion", "fusion cuisine", "fusion food"] },
  { slug: "georgien", label: "Georgien", phrases: ["cuisine georgienne", "georgian cuisine", "restaurant georgien"] },
  { slug: "glaces", label: "Glaces", phrases: ["glacier artisanal", "artisan ice cream", "gelateria", "ice cream shop"] },
  { slug: "grec", label: "Grec", phrases: ["cuisine grecque", "greek cuisine", "restaurant grec"] },
  { slug: "grillades", label: "Grillades", phrases: ["restaurant de grillades", "grill restaurant", "barbecue restaurant", "wood fired grill"] },
  { slug: "halal", label: "Halal", phrases: ["cuisine halal", "halal restaurant", "viande certifiee halal"] },
  { slug: "healthy", label: "Healthy", phrases: ["healthy food", "healthy cuisine", "alimentation saine"] },
  { slug: "indien", label: "Indien", phrases: ["cuisine indienne", "indian cuisine", "restaurant indien"] },
  { slug: "indonesien", label: "Indonesien", phrases: ["cuisine indonesienne", "indonesian cuisine", "restaurant indonesien"] },
  { slug: "international", label: "International", phrases: ["cuisine internationale", "international cuisine"] },
  { slug: "iranien", label: "Iranien", phrases: ["cuisine iranienne", "iranian cuisine", "persian cuisine", "cuisine persane"] },
  { slug: "italien", label: "Italien", phrases: ["cuisine italienne", "italian cuisine", "restaurant italien", "ristorante italiano", "trattoria italiana"] },
  { slug: "japonais", label: "Japonais", phrases: ["cuisine japonaise", "japanese cuisine", "restaurant japonais", "izakaya"] },
  { slug: "kebab", label: "Kebab", phrases: ["kebab restaurant", "doner kebab", "kebab maison"] },
  { slug: "libanais", label: "Libanais", phrases: ["cuisine libanaise", "lebanese cuisine", "restaurant libanais"] },
  { slug: "maghrebin", label: "Maghrebin", phrases: ["cuisine maghrebine", "maghrebi cuisine"] },
  { slug: "malaisien", label: "Malaisien", phrases: ["cuisine malaisienne", "malaysian cuisine", "restaurant malaisien"] },
  { slug: "marocain", label: "Marocain", phrases: ["cuisine marocaine", "moroccan cuisine", "restaurant marocain"] },
  { slug: "mediterraneen", label: "Mediterraneen", phrases: ["cuisine mediterraneenne", "mediterranean cuisine", "restaurant mediterraneen"] },
  { slug: "mexicain", label: "Mexicain", phrases: ["cuisine mexicaine", "mexican cuisine", "restaurant mexicain"] },
  { slug: "moyen-orient", label: "Moyen-Orient", phrases: ["cuisine du moyen orient", "middle eastern cuisine", "cuisine orientale"] },
  { slug: "nepalais", label: "Nepalais", phrases: ["cuisine nepalaise", "nepalese cuisine", "restaurant nepalais"] },
  { slug: "pakistanais", label: "Pakistanais", phrases: ["cuisine pakistanaise", "pakistani cuisine", "restaurant pakistanais"] },
  { slug: "pates", label: "Pates", phrases: ["pasta fresca", "pates fraiches maison", "fresh pasta"] },
  { slug: "patisserie", label: "Patisserie", phrases: ["patisserie artisanale", "artisan pastry", "pastry shop"] },
  { slug: "peruvien", label: "Peruvien", phrases: ["cuisine peruvienne", "peruvian cuisine", "restaurant peruvien"] },
  { slug: "petit-dejeuner", label: "Petit-dejeuner", phrases: ["menu petit dejeuner", "breakfast menu", "petit dejeuner servi"] },
  { slug: "pizza", label: "Pizza", phrases: ["pizzeria", "pizza napolitaine", "neapolitan pizza", "pizza au feu de bois"] },
  { slug: "poke", label: "Poke", phrases: ["poke bowl", "poke bowls", "hawaiian poke"] },
  { slug: "portugais", label: "Portugais", phrases: ["cuisine portugaise", "portuguese cuisine", "restaurant portugais"] },
  { slug: "ramen", label: "Ramen", phrases: ["ramen shop", "ramen restaurant", "ramen bar"] },
  { slug: "salades", label: "Salades", phrases: ["salad bar", "salades composees", "salades gourmandes"] },
  { slug: "salon-de-the", label: "Salon de the", phrases: ["salon de the", "tea room", "tearoom"] },
  { slug: "sandwich", label: "Sandwich", phrases: ["sandwiches maison", "sandwich shop", "sandwicherie"] },
  { slug: "steakhouse", label: "Steakhouse", phrases: ["steakhouse", "steak house"] },
  { slug: "street-food", label: "Street Food", phrases: ["street food", "cuisine de rue"] },
  { slug: "suisse", label: "Suisse", phrases: ["cuisine suisse", "swiss cuisine", "specialites suisses"] },
  { slug: "sushi", label: "Sushi", phrases: ["sushi bar", "sushi restaurant", "sushis maison"] },
  { slug: "syrien", label: "Syrien", phrases: ["cuisine syrienne", "syrian cuisine", "restaurant syrien"] },
  { slug: "tacos", label: "Tacos", phrases: ["tacos restaurant", "french tacos", "tacos mexicains"] },
  { slug: "tapas", label: "Tapas", phrases: ["bar a tapas", "tapas bar", "tapas espagnoles"] },
  { slug: "thai", label: "Thai", phrases: ["cuisine thailandaise", "thai cuisine", "thai food", "restaurant thai"] },
  { slug: "traiteur", label: "Traiteur", phrases: ["service traiteur", "traiteur evenementiel", "catering service"] },
  { slug: "tunisien", label: "Tunisien", phrases: ["cuisine tunisienne", "tunisian cuisine", "restaurant tunisien"] },
  { slug: "turc", label: "Turc", phrases: ["cuisine turque", "turkish cuisine", "restaurant turc"] },
  { slug: "vegan", label: "Vegan", phrases: ["cuisine vegan", "vegan restaurant", "menu vegan", "plant based menu"] },
  { slug: "vegetarien", label: "Vegetarien", phrases: ["cuisine vegetarienne", "vegetarian restaurant", "menu vegetarien", "vegetarian menu"] },
  { slug: "venezuelien", label: "Venezuelien", phrases: ["cuisine venezuelienne", "venezuelan cuisine", "restaurant venezuelien"] },
  { slug: "vietnamien", label: "Vietnamien", phrases: ["cuisine vietnamienne", "vietnamese cuisine", "restaurant vietnamien"] },
];

const dnsSafetyCache = new Map<string, Promise<boolean>>();
const robotsCache = new Map<string, Promise<RobotsPolicy>>();
const lastRequestAt = new Map<string, number>();

function boundedBatchSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(parsed), MAX_BATCH_SIZE);
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulNameTokens(name: string) {
  return normalizeText(name)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token));
}

function hostOf(value: string | null | undefined) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeHttpUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function isRejectedSiteHost(host: string) {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return REJECTED_SITE_HOSTS.some((blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`));
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function attributesOf(tag: string) {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function resolvePageUrl(value: string, pageUrl: string) {
  try {
    const resolved = new URL(value, pageUrl);
    if (!/^https?:$/.test(resolved.protocol)) return null;
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIpv6(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice("::ffff:".length));
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc")
    || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9")
    || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("2001:db8:");
}

function isIpLiteral(value: string) {
  const normalized = value.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) || normalized.includes(":");
}

async function hostIsPublic(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIpLiteral(host)) return host.includes(":") ? !isPrivateIpv6(host) : !isPrivateIpv4(host);

  if (!dnsSafetyCache.has(host)) {
    dnsSafetyCache.set(host, (async () => {
      const records: string[] = [];
      const [ipv4, ipv6] = await Promise.allSettled([Deno.resolveDns(host, "A"), Deno.resolveDns(host, "AAAA")]);
      if (ipv4.status === "fulfilled") records.push(...ipv4.value);
      if (ipv6.status === "fulfilled") records.push(...ipv6.value);
      return records.length > 0
        && records.every((address) => address.includes(":") ? !isPrivateIpv6(address) : !isPrivateIpv4(address));
    })());
  }
  return await dnsSafetyCache.get(host)!;
}

async function assertPublicUrl(url: URL) {
  if (!/^https?:$/.test(url.protocol)) throw new Error("unsafe_protocol");
  if (!await hostIsPublic(url.hostname)) throw new Error("unsafe_or_private_host");
}

async function fetchPublic(input: string | URL, timeoutMs = FETCH_TIMEOUT_MS) {
  let current = input instanceof URL ? new URL(input) : new URL(input);
  for (let redirect = 0; redirect <= 3; redirect++) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirect === 3) throw new Error("redirect_limit");
      current = new URL(location, current);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error("redirect_limit");
}

async function responseTextLimited(response: Response, maxCharacters: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  try {
    while (body.length < maxCharacters) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return body.slice(0, maxCharacters);
}

function parseRobotsPolicy(text: string): RobotsPolicy {
  type Group = { agents: string[]; rules: RobotsRule[]; crawlDelayMs: number };
  const groups: Group[] = [];
  let current: Group = { agents: [], rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS };
  let sawDirective = false;
  const flush = () => {
    if (current.agents.length > 0) groups.push(current);
    current = { agents: [], rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS };
    sawDirective = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (!line || separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (sawDirective) flush();
      current.agents.push(value.toLowerCase());
    } else if (current.agents.length > 0 && (key === "allow" || key === "disallow")) {
      sawDirective = true;
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else if (current.agents.length > 0 && key === "crawl-delay") {
      sawDirective = true;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.crawlDelayMs = Math.min(2_000, Math.max(DEFAULT_CRAWL_DELAY_MS, Math.round(seconds * 1_000)));
      }
    }
  }
  flush();
  const exact = groups.filter((group) => group.agents.some((value) => value !== "*" && "tok-directory-scraper".includes(value)));
  const selected = exact.length > 0 ? exact : groups.filter((group) => group.agents.includes("*"));
  return {
    rules: selected.flatMap((group) => group.rules),
    crawlDelayMs: Math.max(DEFAULT_CRAWL_DELAY_MS, ...selected.map((group) => group.crawlDelayMs)),
    denyAll: false,
  };
}

function robotsAllows(policy: RobotsPolicy, url: URL) {
  if (policy.denyAll) return false;
  const target = `${url.pathname}${url.search}` || "/";
  const matching = policy.rules
    .filter((rule) => target.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow));
  return matching.length === 0 || matching[0].allow;
}

async function getRobotsPolicy(url: URL) {
  if (!robotsCache.has(url.origin)) {
    robotsCache.set(url.origin, (async () => {
      try {
        const { response } = await fetchPublic(new URL("/robots.txt", url.origin), 4_000);
        if (response.status === 404) {
          await response.body?.cancel().catch(() => undefined);
          return { rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS, denyAll: false };
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          return { rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS, denyAll: true };
        }
        return parseRobotsPolicy(await responseTextLimited(response, MAX_ROBOTS_CHARACTERS));
      } catch {
        return { rules: [], crawlDelayMs: DEFAULT_CRAWL_DELAY_MS, denyAll: true };
      }
    })());
  }
  return await robotsCache.get(url.origin)!;
}

async function respectCrawlDelay(url: URL, delayMs: number) {
  const waitMs = Math.max(0, delayMs - (Date.now() - (lastRequestAt.get(url.origin) || 0)));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt.set(url.origin, Date.now());
}

async function fetchHtmlPage(input: string | URL) {
  const initialUrl = input instanceof URL ? new URL(input) : new URL(input);
  const policy = await getRobotsPolicy(initialUrl);
  if (!robotsAllows(policy, initialUrl)) return null;
  await respectCrawlDelay(initialUrl, policy.crawlDelayMs);

  try {
    const { response, finalUrl } = await fetchPublic(initialUrl);
    const finalPolicy = finalUrl.origin === initialUrl.origin ? policy : await getRobotsPolicy(finalUrl);
    if (!robotsAllows(finalPolicy, finalUrl)) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok || (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    return { url: finalUrl.toString(), html: await responseTextLimited(response, MAX_HTML_CHARACTERS) };
  } catch {
    return null;
  }
}

function scoreSiteIdentity(restaurant: RestaurantRow, html: string, pageUrl: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const blob = normalizeText(`${title} ${stripHtml(html).slice(0, 120_000)} ${pageUrl}`);
  const normalizedName = normalizeText(restaurant.name);
  const tokens = meaningfulNameTokens(restaurant.name);
  const normalizedCity = normalizeText(restaurant.city);
  const addressTokens = normalizeText(restaurant.address).split(" ").filter((token) => token.length >= 4).slice(0, 5);
  let score = 0;
  if (normalizedName && blob.includes(normalizedName)) score += 6;
  if (tokens.length > 0) {
    const ratio = tokens.filter((token) => blob.includes(token)).length / tokens.length;
    if (ratio >= 0.75) score += 4;
    else if (ratio >= 0.5) score += 2;
  }
  if (normalizedCity && blob.includes(normalizedCity)) score += 2;
  if (addressTokens.some((token) => blob.includes(token))) score += 3;
  return score;
}

async function getLeadHints(supabase: any, sourceReference: string | null): Promise<LeadHints> {
  if (!sourceReference) return { website: null, email: null };
  const lookup = async (column: "source_reference" | "source_objectid", value: string | number) => {
    const result = await supabase
      .from("marketing_contacts")
      .select("website, email")
      .eq("source_system", "commercial_prospect_catalog")
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    return !result.error && result.data ? result.data : null;
  };
  const hint = await lookup("source_reference", sourceReference)
    || (/^\d+$/.test(sourceReference) ? await lookup("source_objectid", Number(sourceReference)) : null);
  return {
    website: String(hint?.website || "").trim() || null,
    email: String(hint?.email || "").trim() || null,
  };
}

function businessEmailDomain(email: string | null) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  return !domain || FREE_EMAIL_DOMAINS.has(domain) || isRejectedSiteHost(domain) ? null : domain;
}

function guessedDomains(name: string, city: string | null) {
  const base = meaningfulNameTokens(name).join("-").slice(0, 55);
  if (!base) return [];
  const compact = base.replace(/-/g, "");
  const citySlug = normalizeText(city).replace(/\s+/g, "-");
  return [`${base}.ch`, compact !== base ? `${compact}.ch` : "", citySlug ? `${base}-${citySlug}.ch` : "", `${base}.com`]
    .filter(Boolean)
    .slice(0, 3);
}

function websiteCandidates(restaurant: RestaurantRow, hints: LeadHints) {
  const candidates: WebsiteCandidate[] = [];
  const seen = new Set<string>();
  const add = (value: string | null, method: WebsiteCandidate["method"]) => {
    const url = normalizeHttpUrl(value);
    const host = hostOf(url?.toString());
    if (!url || !host || isRejectedSiteHost(host) || seen.has(host)) return;
    seen.add(host);
    candidates.push({ url: url.toString(), method });
  };
  add(hints.website, "catalog_website");
  add(businessEmailDomain(hints.email), "business_email_domain");
  for (const domain of guessedDomains(restaurant.name, restaurant.city)) add(domain, "domain_guess");
  return candidates.slice(0, MAX_DISCOVERY_CANDIDATES);
}

async function discoverWebsite(restaurant: RestaurantRow, hints: LeadHints): Promise<CrawledPage | null> {
  for (const candidate of websiteCandidates(restaurant, hints)) {
    const candidates = [candidate.url, candidate.url.startsWith("https://") ? candidate.url.replace(/^https:/, "http:") : ""];
    for (const value of candidates) {
      if (!value) continue;
      const page = await fetchHtmlPage(value);
      if (!page) continue;
      const identityScore = scoreSiteIdentity(restaurant, page.html, page.url);
      const required = candidate.method === "catalog_website"
        ? MIN_CATALOG_SITE_SCORE
        : candidate.method === "business_email_domain" ? MIN_EMAIL_SITE_SCORE : MIN_GUESSED_SITE_SCORE;
      if (identityScore >= required) return { ...page, identityScore, discoveryMethod: candidate.method };
    }
  }
  return null;
}

function extractInternalLinks(pageUrl: string, html: string) {
  const pageHost = hostOf(pageUrl);
  const ranked: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = attributesOf(`<a ${match[1]}>`);
    const resolved = attrs.href ? resolvePageUrl(attrs.href, pageUrl) : null;
    if (!resolved || hostOf(resolved) !== pageHost) continue;
    const url = new URL(resolved);
    if (url.search) continue;
    const blob = normalizeText(`${url.pathname} ${stripHtml(match[2])}`);
    const score = PAGE_LINK_KEYWORDS.reduce((total, keyword) => total + Number(blob.includes(keyword)), 0);
    if (score === 0) continue;
    const canonical = `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    ranked.push({ url: canonical, score });
  }
  ranked.sort((left, right) => right.score - left.score || left.url.length - right.url.length);
  const output = ranked.map((item) => item.url);
  for (const path of COMMON_PAGE_PATHS) {
    if (output.length >= MAX_PAGES_PER_SITE - 1) break;
    const guessed = new URL(path, pageUrl).toString();
    if (!seen.has(guessed)) output.push(guessed);
  }
  return output.slice(0, MAX_PAGES_PER_SITE - 1);
}

function collectServesCuisine(node: unknown, output: string[], depth = 0) {
  if (depth > 8 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectServesCuisine(item, output, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const rawTypes = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
  const types = rawTypes.map(normalizeText);
  const isFoodBusiness = types.some((type) => [
    "restaurant", "foodestablishment", "bakery", "cafeorcoffeeshop", "barorpub", "icecreamshop",
  ].includes(type));
  if (isFoodBusiness && record.servesCuisine != null) {
    const values = Array.isArray(record.servesCuisine) ? record.servesCuisine : [record.servesCuisine];
    for (const value of values) if (typeof value === "string") output.push(value);
  }
  for (const value of Object.values(record)) collectServesCuisine(value, output, depth + 1);
}

function excerptAround(text: string, phrase: string) {
  const index = text.indexOf(phrase);
  if (index < 0) return text.slice(0, 260);
  return text.slice(Math.max(0, index - 100), Math.min(text.length, index + phrase.length + 160));
}

function matchCuisineRules(value: string) {
  const normalized = normalizeText(value);
  return CUISINE_RULES.flatMap((rule) => {
    const phrase = rule.phrases.find((candidate) => {
      const normalizedCandidate = normalizeText(candidate);
      return normalized.includes(normalizedCandidate)
        || normalizedCandidate.startsWith(`${normalized} `)
        || normalizedCandidate.endsWith(` ${normalized}`);
    });
    return phrase ? [{ rule, phrase: normalized }] : [];
  });
}

function extractCuisineAssignments(page: CrawledPage) {
  const assignments = new Map<string, CuisineAssignment>();
  const add = (rule: CuisineRule, phrase: string, method: CuisineAssignment["evidence"]["extraction_method"], text: string) => {
    const confidence = method === "jsonld_serves_cuisine" ? 0.98 : 0.94;
    const current = assignments.get(rule.slug);
    if (current && current.confidence >= confidence) return;
    assignments.set(rule.slug, {
      slug: rule.slug,
      label: rule.label,
      confidence,
      evidence: {
        extraction_method: method,
        matched_phrase: phrase,
        excerpt: excerptAround(text, phrase).slice(0, 320),
      },
    });
  };

  for (const match of page.html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const values: string[] = [];
      collectServesCuisine(JSON.parse(match[1]), values);
      for (const value of values) {
        const normalized = normalizeText(value);
        for (const { rule, phrase } of matchCuisineRules(value)) add(rule, phrase, "jsonld_serves_cuisine", normalized);
      }
    } catch {
      // Invalid publisher JSON-LD is ignored; the official page text remains available.
    }
  }

  const pageText = normalizeText(stripHtml(page.html).slice(0, 250_000));
  for (const rule of CUISINE_RULES) {
    const phrase = rule.phrases.map(normalizeText).find((candidate) => pageText.includes(candidate));
    if (phrase) add(rule, phrase, "official_page_phrase", pageText);
  }
  return [...assignments.values()];
}

async function findCuisines(supabase: any, restaurant: RestaurantRow) {
  const homepage = await discoverWebsite(restaurant, await getLeadHints(supabase, restaurant.directory_source_reference));
  if (!homepage) return null;
  const pages: CrawledPage[] = [homepage];
  for (const link of extractInternalLinks(homepage.url, homepage.html)) {
    const crawled = await fetchHtmlPage(link);
    if (!crawled) continue;
    const identityScore = Math.max(homepage.identityScore, scoreSiteIdentity(restaurant, crawled.html, crawled.url));
    if (identityScore < MIN_CATALOG_SITE_SCORE) continue;
    pages.push({ ...crawled, identityScore, discoveryMethod: homepage.discoveryMethod });
    if (pages.length >= MAX_PAGES_PER_SITE) break;
  }

  const assignments = new Map<string, CuisineAssignment>();
  for (const page of pages) {
    for (const assignment of extractCuisineAssignments(page)) {
      const current = assignments.get(assignment.slug);
      if (!current || assignment.confidence > current.confidence) assignments.set(assignment.slug, assignment);
    }
  }
  return {
    sourceUrl: homepage.url,
    assignments: [...assignments.values()]
      .sort((left, right) => right.confidence - left.confidence || left.slug.localeCompare(right.slug))
      .slice(0, MAX_ASSIGNMENTS),
  };
}

function retryDelayIso(kind: "not_found" | "error") {
  const delayMs = kind === "not_found" ? 30 * 24 * 60 * 60 * 1_000 : 6 * 60 * 60 * 1_000;
  return new Date(Date.now() + delayMs).toISOString();
}

async function updateJob(supabase: any, restaurantId: string, values: Record<string, unknown>) {
  const { error } = await supabase
    .from("restaurant_directory_cuisine_jobs")
    .update({ ...values, locked_at: null, updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId);
  if (error) throw new Error(`cuisine_job_update_failed:${error.message}`);
}

async function getStatus(supabase: any) {
  const statuses = ["pending", "processing", "success", "not_found", "error"] as const;
  const entries = await Promise.all(statuses.map(async (status) => {
    const { count, error } = await supabase
      .from("restaurant_directory_cuisine_jobs")
      .select("restaurant_id", { count: "exact", head: true })
      .eq("status", status);
    if (error) throw new Error(error.message);
    return [status, count || 0] as const;
  }));
  return Object.fromEntries(entries);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  const log = makeLogger("enrich-directory-cuisines");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    requireRole(actor, ["admin"]);
    const supabase = actor.adminClient;
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const mode = String(body?.mode || "process_batch");
    if (mode === "status") return jsonResponse({ success: true, jobs: await getStatus(supabase) }, 200, corsHeaders);
    if (mode !== "process_batch") throw new HttpError(400, "Invalid mode");

    const { data: claimed, error: claimError } = await supabase.rpc("service_claim_directory_cuisine_jobs", {
      p_limit: boundedBatchSize(body?.limit),
    });
    if (claimError) throw new Error(`cuisine_claim_failed:${claimError.message}`);

    const restaurantIds = (claimed || []).map((row: { restaurant_id: string }) => row.restaurant_id);
    let resolved = 0;
    let notFound = 0;
    let errors = 0;

    for (const restaurantId of restaurantIds) {
      try {
        const { data: restaurant, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id,name,address,city,directory_source_reference,is_directory_listing")
          .eq("id", restaurantId)
          .maybeSingle();
        if (restaurantError) throw new Error(restaurantError.message);
        if (!restaurant || restaurant.is_directory_listing !== true) {
          await updateJob(supabase, restaurantId, { status: "error", next_attempt_at: null, last_error: "directory_listing_missing" });
          errors++;
          continue;
        }

        const result = await findCuisines(supabase, restaurant as RestaurantRow);
        if (!result || result.assignments.length === 0) {
          await updateJob(supabase, restaurantId, {
            status: "not_found",
            next_attempt_at: retryDelayIso("not_found"),
            source_page_url: result?.sourceUrl || null,
            last_error: result ? "no_verified_cuisine_on_official_site" : "official_site_not_verified",
          });
          notFound++;
          continue;
        }

        const { data: evidenceCount, error: applyError } = await supabase.rpc("service_apply_directory_cuisine_evidence", {
          p_restaurant_id: restaurantId,
          p_source_url: result.sourceUrl,
          p_assignments: result.assignments,
        });
        if (applyError) throw new Error(`cuisine_apply_failed:${applyError.message}`);
        if (Number(evidenceCount || 0) <= 0) throw new Error("cuisine_apply_returned_no_evidence");
        resolved++;
      } catch (error) {
        errors++;
        const message = (error instanceof Error ? error.message : "unknown").slice(0, MAX_ERROR_LENGTH);
        try {
          await updateJob(supabase, restaurantId, {
            status: "error",
            next_attempt_at: retryDelayIso("error"),
            last_error: message,
          });
        } catch (jobError) {
          log.error("cuisine_job_failure_persist_failed", {
            restaurant_id: restaurantId,
            message: jobError instanceof Error ? jobError.message : "unknown",
          });
        }
        log.warn("directory_cuisine_enrichment_failed", { restaurant_id: restaurantId, message });
      }
    }

    const result = {
      success: true,
      engine: "native_official_site_cuisine_verifier",
      claimed: restaurantIds.length,
      resolved,
      not_found: notFound,
      errors,
      jobs: await getStatus(supabase),
    };
    await writeAuditLog({
      adminClient: supabase,
      actor,
      request: req,
      functionName: "enrich-directory-cuisines",
      action: "directory_cuisine_enrichment_batch",
      status: "success",
      targetEntityType: "restaurants",
      metadata: {
        source: String(body?.source || "manual"),
        claimed: restaurantIds.length,
        resolved,
        not_found: notFound,
        errors,
      },
    });
    return jsonResponse(result, 200, corsHeaders);
  } catch (error) {
    log.error("request_failed", { message: error instanceof Error ? error.message : "unknown" });
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      error instanceof HttpError ? error.status : 500,
      corsHeaders,
    );
  }
});
