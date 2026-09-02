import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

const DEFAULT_BATCH_SIZE = 18;
const MAX_BATCH_SIZE = 24;
const OSM_RADIUS_METERS = 140;
const MAX_ERROR_LENGTH = 500;
const OVERPASS_TIMEOUT_MS = 12_000;
const WEBSITE_TIMEOUT_MS = 6_000;
const MAX_SITE_CHARACTERS = 900_000;
const MAX_SITE_PAGES = 3;
const USER_AGENT = "TOK-Restaurant-Cuisine-Verifier/1.0 (+https://www.thetok.ch)";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const REJECTED_SITE_HOSTS = [
  "google.com",
  "google.ch",
  "bing.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "tripadvisor.com",
  "tripadvisor.ch",
  "thefork.com",
  "thefork.ch",
  "local.ch",
  "search.ch",
  "yelp.com",
  "ubereats.com",
  "just-eat.ch",
  "smood.ch",
];

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

const STREET_STOPWORDS = new Set([
  "rue",
  "route",
  "avenue",
  "av",
  "boulevard",
  "bd",
  "chemin",
  "ch",
  "place",
  "pl",
  "quai",
  "passage",
  "allee",
  "impasse",
  "de",
  "du",
  "des",
  "la",
  "le",
]);

type RestaurantRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  directory_source_reference: string | null;
  directory_public_name_verified: boolean | null;
  is_directory_listing: boolean;
};

type LeadHint = {
  source_reference: string | null;
  website: string | null;
  phone: string | null;
};

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type CuisineAssignment = {
  slug: string;
  label: string;
  confidence: number;
  evidence: Record<string, unknown>;
};

type MatchResult = {
  element: OsmElement;
  distanceMeters: number;
  score: number;
  signals: string[];
};

type SiteRule = {
  slug: string;
  label: string;
  phrases: string[];
};

const OSM_CUISINE_MAP: Record<string, Array<[string, string, number]>> = {
  african: [["africain", "Africain", 0.95]],
  american: [["americain", "Americain", 0.95]],
  argentinian: [["argentin", "Argentin", 0.96]],
  asian: [["asiatique", "Asiatique", 0.94]],
  balkan: [["balkanique", "Balkanique", 0.94]],
  bakery: [["boulangerie", "Boulangerie", 0.94]],
  brazilian: [["bresilien", "Bresilien", 0.96]],
  brunch: [["brunch", "Brunch", 0.95]],
  bubble_tea: [["bubble-tea", "Bubble Tea", 0.98]],
  burger: [["burger", "Burger", 0.98]],
  coffee_shop: [["cafe", "Cafe", 0.96]],
  chinese: [["chinois", "Chinois", 0.98]],
  cantonese: [["chinois", "Chinois", 0.97]],
  sichuan: [["chinois", "Chinois", 0.97]],
  korean: [["coreen", "Coreen", 0.98]],
  crepe: [["crepes", "Crepes", 0.96]],
  dessert: [["desserts", "Desserts", 0.94]],
  donut: [["desserts", "Desserts", 0.91]],
  eritrean: [["erythreen", "Erythreen", 0.98]],
  spanish: [["espagnol", "Espagnol", 0.98]],
  ethiopian: [["ethiopien", "Ethiopien", 0.98]],
  french: [["francais", "Francais", 0.98]],
  seafood: [["fruits-de-mer", "Fruits de mer", 0.98]],
  fish: [["fruits-de-mer", "Fruits de mer", 0.92]],
  fish_and_chips: [["fruits-de-mer", "Fruits de mer", 0.94]],
  fusion: [["fusion", "Fusion", 0.97]],
  georgian: [["georgien", "Georgien", 0.98]],
  ice_cream: [["glaces", "Glaces", 0.99]],
  gelato: [["glaces", "Glaces", 0.99]],
  greek: [["grec", "Grec", 0.98]],
  grill: [["grillades", "Grillades", 0.95]],
  barbecue: [["grillades", "Grillades", 0.95]],
  indian: [["indien", "Indien", 0.98]],
  indonesian: [["indonesien", "Indonesien", 0.98]],
  international: [["international", "International", 0.95]],
  iranian: [["iranien", "Iranien", 0.98]],
  persian: [["iranien", "Iranien", 0.98]],
  italian: [["italien", "Italien", 0.98]],
  japanese: [["japonais", "Japonais", 0.98]],
  kebab: [["kebab", "Kebab", 0.98]],
  lebanese: [["libanais", "Libanais", 0.98]],
  moroccan: [["marocain", "Marocain", 0.98]],
  mediterranean: [["mediterraneen", "Mediterraneen", 0.97]],
  mexican: [["mexicain", "Mexicain", 0.98]],
  middle_eastern: [["moyen-orient", "Moyen-Orient", 0.97]],
  nepalese: [["nepalais", "Nepalais", 0.98]],
  pakistani: [["pakistanais", "Pakistanais", 0.98]],
  pasta: [["pates", "Pates", 0.95]],
  peruvian: [["peruvien", "Peruvien", 0.98]],
  pizza: [["pizza", "Pizza", 0.99]],
  poke: [["poke", "Poke", 0.99]],
  portuguese: [["portugais", "Portugais", 0.98]],
  chicken: [["poulet", "Poulet", 0.94]],
  fried_chicken: [["poulet", "Poulet", 0.97], ["americain", "Americain", 0.88]],
  ramen: [["ramen", "Ramen", 0.99], ["japonais", "Japonais", 0.94]],
  russian: [["russe", "Russe", 0.98]],
  sandwich: [["sandwich", "Sandwich", 0.98]],
  steak: [["steakhouse", "Steakhouse", 0.95]],
  sushi: [["sushi", "Sushi", 0.99], ["japonais", "Japonais", 0.95]],
  syrian: [["syrien", "Syrien", 0.98]],
  tacos: [["tacos", "Tacos", 0.98]],
  taiwanese: [["taiwanais", "Taiwanais", 0.98]],
  tapas: [["tapas", "Tapas", 0.98]],
  thai: [["thai", "Thai", 0.99]],
  tunisian: [["tunisien", "Tunisien", 0.98]],
  turkish: [["turc", "Turc", 0.98]],
  venezuelan: [["venezuelien", "Venezuelien", 0.98]],
  vietnamese: [["vietnamien", "Vietnamien", 0.99]],
  swiss: [["suisse", "Suisse", 0.99]],
};

const SITE_RULES: SiteRule[] = [
  { slug: "italien", label: "Italien", phrases: ["cuisine italienne", "italian cuisine", "ristorante italiano", "trattoria italiana"] },
  { slug: "pizza", label: "Pizza", phrases: ["pizzeria", "pizza napolitaine", "pizza au feu de bois", "neapolitan pizza"] },
  { slug: "francais", label: "Francais", phrases: ["cuisine francaise", "french cuisine", "cuisine du marche"] },
  { slug: "suisse", label: "Suisse", phrases: ["cuisine suisse", "swiss cuisine", "fondue", "raclette", "rosti"] },
  { slug: "japonais", label: "Japonais", phrases: ["cuisine japonaise", "japanese cuisine", "izakaya"] },
  { slug: "sushi", label: "Sushi", phrases: ["sushi", "sashimi", "nigiri"] },
  { slug: "ramen", label: "Ramen", phrases: ["ramen"] },
  { slug: "chinois", label: "Chinois", phrases: ["cuisine chinoise", "chinese cuisine", "dim sum", "sichuan", "cantonaise"] },
  { slug: "thai", label: "Thai", phrases: ["cuisine thailandaise", "thai cuisine", "pad thai", "tom yum"] },
  { slug: "vietnamien", label: "Vietnamien", phrases: ["cuisine vietnamienne", "vietnamese cuisine", "pho bo", "banh mi"] },
  { slug: "coreen", label: "Coreen", phrases: ["cuisine coreenne", "korean cuisine", "bibimbap", "bulgogi"] },
  { slug: "indien", label: "Indien", phrases: ["cuisine indienne", "indian cuisine", "tandoori", "biryani", "naan"] },
  { slug: "libanais", label: "Libanais", phrases: ["cuisine libanaise", "lebanese cuisine", "mezze libanais"] },
  { slug: "moyen-orient", label: "Moyen-Orient", phrases: ["middle eastern cuisine", "cuisine du moyen orient", "falafel", "hummus"] },
  { slug: "marocain", label: "Marocain", phrases: ["cuisine marocaine", "moroccan cuisine", "tajine", "couscous marocain"] },
  { slug: "espagnol", label: "Espagnol", phrases: ["cuisine espagnole", "spanish cuisine", "paella"] },
  { slug: "tapas", label: "Tapas", phrases: ["tapas", "bar a tapas"] },
  { slug: "portugais", label: "Portugais", phrases: ["cuisine portugaise", "portuguese cuisine", "bacalhau"] },
  { slug: "grec", label: "Grec", phrases: ["cuisine grecque", "greek cuisine", "moussaka"] },
  { slug: "mexicain", label: "Mexicain", phrases: ["cuisine mexicaine", "mexican cuisine", "tacos mexicains", "quesadilla"] },
  { slug: "peruvien", label: "Peruvien", phrases: ["cuisine peruvienne", "peruvian cuisine", "ceviche"] },
  { slug: "venezuelien", label: "Venezuelien", phrases: ["cuisine venezuelienne", "venezuelan cuisine", "arepa"] },
  { slug: "erythreen", label: "Erythreen", phrases: ["cuisine erythreenne", "eritrean cuisine"] },
  { slug: "ethiopien", label: "Ethiopien", phrases: ["cuisine ethiopienne", "ethiopian cuisine", "injera"] },
  { slug: "turc", label: "Turc", phrases: ["cuisine turque", "turkish cuisine"] },
  { slug: "kebab", label: "Kebab", phrases: ["kebab", "doner"] },
  { slug: "burger", label: "Burger", phrases: ["smash burger", "burger maison", "gourmet burger"] },
  { slug: "americain", label: "Americain", phrases: ["american cuisine", "american diner", "fried chicken"] },
  { slug: "brunch", label: "Brunch", phrases: ["brunch", "sunday brunch"] },
  { slug: "cafe", label: "Cafe", phrases: ["coffee shop", "specialty coffee", "cafe restaurant"] },
  { slug: "salon-de-the", label: "Salon de the", phrases: ["tea room", "tearoom", "salon de the"] },
  { slug: "glaces", label: "Glaces", phrases: ["gelateria", "glacier artisanal", "ice cream shop"] },
  { slug: "fruits-de-mer", label: "Fruits de mer", phrases: ["seafood restaurant", "fruits de mer", "poissons et fruits de mer"] },
  { slug: "grillades", label: "Grillades", phrases: ["grill restaurant", "restaurant de grillades", "barbecue"] },
  { slug: "steakhouse", label: "Steakhouse", phrases: ["steakhouse", "steak house"] },
  { slug: "mediterraneen", label: "Mediterraneen", phrases: ["cuisine mediterraneenne", "mediterranean cuisine"] },
  { slug: "vegetarien", label: "Vegetarien", phrases: ["vegetarian restaurant", "cuisine vegetarienne"] },
  { slug: "vegan", label: "Vegan", phrases: ["vegan restaurant", "cuisine vegan", "plant based menu"] },
  { slug: "halal", label: "Halal", phrases: ["halal restaurant", "viande certifiee halal"] },
  { slug: "poke", label: "Poke", phrases: ["poke bowl", "poke bowls"] },
  { slug: "bubble-tea", label: "Bubble Tea", phrases: ["bubble tea", "boba tea"] },
];

const dnsSafetyCache = new Map<string, Promise<boolean>>();

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

function meaningfulNameTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token));
}

function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits.length >= 8 ? digits.slice(-9) : "";
}

function hostOf(value: unknown) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeHttpUrl(value: unknown) {
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

function restaurantHouseNumber(address: string | null) {
  return normalizeText(address).match(/\b\d{1,4}[a-z]?\b/)?.[0] || "";
}

function streetTokens(value: string | null) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !STREET_STOPWORDS.has(token) && !/^\d+$/.test(token));
}

function tokenSimilarity(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadius = 6_371_000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function elementCoordinates(element: OsmElement) {
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function osmAddress(element: OsmElement) {
  const tags = element.tags || {};
  return `${tags["addr:street"] || ""} ${tags["addr:housenumber"] || ""}`.trim();
}

function scoreOsmMatch(restaurant: RestaurantRow, element: OsmElement, lead: LeadHint | null) {
  if (restaurant.latitude == null || restaurant.longitude == null) return null;
  const coordinates = elementCoordinates(element);
  if (!coordinates) return null;
  const distanceMeters = haversineMeters(restaurant.latitude, restaurant.longitude, coordinates.lat, coordinates.lon);
  if (distanceMeters > OSM_RADIUS_METERS) return null;

  const tags = element.tags || {};
  const candidateName = String(tags.name || tags.brand || tags.operator || "").trim();
  const normalizedRestaurantName = normalizeText(restaurant.name);
  const normalizedCandidateName = normalizeText(candidateName);
  const restaurantTokens = meaningfulNameTokens(restaurant.name);
  const candidateTokens = meaningfulNameTokens(candidateName);
  const similarity = tokenSimilarity(restaurantTokens, candidateTokens);
  const restaurantPhone = normalizePhone(restaurant.phone || lead?.phone);
  const candidatePhone = normalizePhone(tags.phone || tags["contact:phone"]);
  const restaurantWebsite = hostOf(lead?.website);
  const candidateWebsite = hostOf(tags.website || tags["contact:website"]);
  const restaurantNumber = restaurantHouseNumber(restaurant.address);
  const candidateNumber = normalizeText(tags["addr:housenumber"] || "");
  const restaurantStreet = streetTokens(restaurant.address);
  const candidateStreet = streetTokens(tags["addr:street"] || osmAddress(element));
  const streetSimilarity = tokenSimilarity(restaurantStreet, candidateStreet);

  let score = 0;
  const signals: string[] = [];
  if (normalizedRestaurantName && normalizedCandidateName && normalizedRestaurantName === normalizedCandidateName) {
    score += 12;
    signals.push("exact_name");
  } else if (
    normalizedRestaurantName.length >= 5
    && normalizedCandidateName.length >= 5
    && (normalizedRestaurantName.includes(normalizedCandidateName) || normalizedCandidateName.includes(normalizedRestaurantName))
  ) {
    score += 8;
    signals.push("contained_name");
  } else if (similarity >= 0.8) {
    score += 7;
    signals.push("name_similarity_080");
  } else if (similarity >= 0.6) {
    score += 5;
    signals.push("name_similarity_060");
  } else if (similarity >= 0.4) {
    score += 2;
    signals.push("name_similarity_040");
  }

  if (restaurantPhone && candidatePhone && restaurantPhone === candidatePhone) {
    score += 12;
    signals.push("same_phone");
  }
  if (restaurantWebsite && candidateWebsite && restaurantWebsite === candidateWebsite) {
    score += 12;
    signals.push("same_website");
  }
  if (restaurantNumber && candidateNumber && restaurantNumber === candidateNumber) {
    score += 4;
    signals.push("same_house_number");
  }
  if (streetSimilarity >= 0.66) {
    score += 4;
    signals.push("street_similarity");
  }
  if (distanceMeters <= 15) {
    score += 5;
    signals.push("distance_15m");
  } else if (distanceMeters <= 35) {
    score += 4;
    signals.push("distance_35m");
  } else if (distanceMeters <= 70) {
    score += 2;
    signals.push("distance_70m");
  }

  return { element, distanceMeters, score, signals } satisfies MatchResult;
}

function selectBestOsmMatch(restaurant: RestaurantRow, elements: OsmElement[], lead: LeadHint | null) {
  const candidates = elements
    .map((element) => scoreOsmMatch(restaurant, element, lead))
    .filter((value): value is MatchResult => Boolean(value))
    .sort((left, right) => right.score - left.score || left.distanceMeters - right.distanceMeters);
  const best = candidates[0];
  if (!best) return null;

  const strongIdentity = best.signals.some((signal) => [
    "exact_name",
    "contained_name",
    "same_phone",
    "same_website",
    "name_similarity_080",
  ].includes(signal));
  const exactAddress = best.signals.includes("same_house_number") && best.signals.includes("street_similarity");
  const uniqueVeryNear = candidates.filter((candidate) => candidate.distanceMeters <= 30).length === 1;

  if (restaurant.directory_public_name_verified === true) {
    return best.score >= 10 && (strongIdentity || exactAddress) ? best : null;
  }
  return best.score >= 12 && (
    best.signals.includes("same_phone")
    || best.signals.includes("same_website")
    || (strongIdentity && best.distanceMeters <= 45)
    || (exactAddress && uniqueVeryNear && best.distanceMeters <= 30)
  ) ? best : null;
}

function buildOverpassQuery(restaurants: RestaurantRow[]) {
  const arounds = restaurants
    .filter((restaurant) => restaurant.latitude != null && restaurant.longitude != null)
    .map((restaurant) => `nwr(around:${OSM_RADIUS_METERS},${restaurant.latitude},${restaurant.longitude})["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream)$"];`)
    .join("\n");
  return `[out:json][timeout:18];\n(\n${arounds}\n);\nout center tags;`;
}

async function fetchOverpassElements(restaurants: RestaurantRow[]) {
  const query = buildOverpassQuery(restaurants);
  let lastError = "overpass_unavailable";
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) {
        lastError = `overpass_http_${response.status}`;
        continue;
      }
      const payload = await response.json() as { elements?: OsmElement[] };
      const seen = new Set<string>();
      return (payload.elements || []).filter((element) => {
        const key = `${element.type}:${element.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "overpass_failed";
    }
  }
  throw new Error(lastError);
}

function addAssignment(
  assignments: Map<string, CuisineAssignment>,
  slug: string,
  label: string,
  confidence: number,
  evidence: Record<string, unknown>,
) {
  const current = assignments.get(slug);
  if (current && current.confidence >= confidence) return;
  assignments.set(slug, { slug, label, confidence, evidence });
}

function cuisineTokens(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .split(/[;,|/]+/)
    .map((token) => token.trim().replace(/[\s-]+/g, "_"))
    .filter(Boolean);
}

function assignmentsFromOsm(match: MatchResult) {
  const tags = match.element.tags || {};
  const assignments = new Map<string, CuisineAssignment>();
  const rawCuisine = String(tags.cuisine || "").trim();
  const baseEvidence = {
    extraction_method: "osm_cuisine_tag",
    osm_id: `${match.element.type}:${match.element.id}`,
    osm_name: tags.name || null,
    osm_cuisine: rawCuisine || null,
    osm_amenity: tags.amenity || null,
    distance_meters: Number(match.distanceMeters.toFixed(1)),
    match_score: match.score,
    match_signals: match.signals,
  };

  for (const token of cuisineTokens(rawCuisine)) {
    for (const [slug, label, confidence] of OSM_CUISINE_MAP[token] || []) {
      addAssignment(assignments, slug, label, confidence, { ...baseEvidence, matched_osm_value: token });
    }
  }

  const amenity = normalizeText(tags.amenity).replace(/\s+/g, "_");
  if (amenity === "cafe") addAssignment(assignments, "cafe", "Cafe", 0.94, { ...baseEvidence, extraction_method: "osm_amenity", matched_osm_value: "cafe" });
  if (amenity === "bar" || amenity === "pub") addAssignment(assignments, "bar", "Bar", 0.94, { ...baseEvidence, extraction_method: "osm_amenity", matched_osm_value: amenity });
  if (amenity === "ice_cream") addAssignment(assignments, "glaces", "Glaces", 0.97, { ...baseEvidence, extraction_method: "osm_amenity", matched_osm_value: "ice_cream" });

  const yesLike = (value: unknown) => ["yes", "only", "main"].includes(normalizeText(value));
  if (yesLike(tags["diet:vegan"])) addAssignment(assignments, "vegan", "Vegan", 0.95, { ...baseEvidence, extraction_method: "osm_diet_tag", matched_osm_value: "diet:vegan" });
  if (yesLike(tags["diet:vegetarian"])) addAssignment(assignments, "vegetarien", "Vegetarien", 0.95, { ...baseEvidence, extraction_method: "osm_diet_tag", matched_osm_value: "diet:vegetarian" });
  if (yesLike(tags["diet:halal"])) addAssignment(assignments, "halal", "Halal", 0.95, { ...baseEvidence, extraction_method: "osm_diet_tag", matched_osm_value: "diet:halal" });
  if (yesLike(tags.breakfast)) addAssignment(assignments, "petit-dejeuner", "Petit-dejeuner", 0.91, { ...baseEvidence, extraction_method: "osm_meal_tag", matched_osm_value: "breakfast" });

  return [...assignments.values()].slice(0, 12);
}

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224;
}

function isPrivateIpv6(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice("::ffff:".length));
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc")
    || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9")
    || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("2001:db8:");
}

async function hostIsPublic(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return !isPrivateIpv4(host);
  if (host.includes(":")) return !isPrivateIpv6(host);
  if (!dnsSafetyCache.has(host)) {
    dnsSafetyCache.set(host, (async () => {
      const records: string[] = [];
      const [ipv4, ipv6] = await Promise.allSettled([Deno.resolveDns(host, "A"), Deno.resolveDns(host, "AAAA")]);
      if (ipv4.status === "fulfilled") records.push(...ipv4.value);
      if (ipv6.status === "fulfilled") records.push(...ipv6.value);
      return records.length > 0 && records.every((address) => address.includes(":") ? !isPrivateIpv6(address) : !isPrivateIpv4(address));
    })());
  }
  return await dnsSafetyCache.get(host)!;
}

async function fetchText(url: URL, timeoutMs = WEBSITE_TIMEOUT_MS) {
  if (!/^https?:$/.test(url.protocol) || isRejectedSiteHost(url.hostname) || !await hostIsPublic(url.hostname)) return null;
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" },
  });
  const finalUrl = new URL(response.url || url.toString());
  if (!/^https?:$/.test(finalUrl.protocol) || isRejectedSiteHost(finalUrl.hostname) || !await hostIsPublic(finalUrl.hostname)) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!response.ok || !contentType.includes("text/html")) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const text = (await response.text()).slice(0, MAX_SITE_CHARACTERS);
  return { url: finalUrl.toString(), html: text };
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|nbsp);/gi, " ")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
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
  const foodBusiness = types.some((type) => ["restaurant", "foodestablishment", "bakery", "cafeorcoffeeshop", "barorpub", "icecreamshop"].includes(type));
  if (foodBusiness && record.servesCuisine != null) {
    const values = Array.isArray(record.servesCuisine) ? record.servesCuisine : [record.servesCuisine];
    for (const value of values) if (typeof value === "string") output.push(value);
  }
  for (const value of Object.values(record)) collectServesCuisine(value, output, depth + 1);
}

function siteAssignments(html: string, sourceUrl: string) {
  const assignments = new Map<string, CuisineAssignment>();
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const values: string[] = [];
      collectServesCuisine(JSON.parse(match[1]), values);
      for (const value of values) {
        for (const token of cuisineTokens(value)) {
          for (const [slug, label, confidence] of OSM_CUISINE_MAP[token] || []) {
            addAssignment(assignments, slug, label, Math.max(confidence, 0.98), {
              extraction_method: "jsonld_serves_cuisine",
              source_url: sourceUrl,
              matched_phrase: value,
            });
          }
        }
      }
    } catch {
      // Publisher JSON-LD can be invalid; verified visible text remains usable.
    }
  }

  const text = normalizeText(stripHtml(html).slice(0, 260_000));
  for (const rule of SITE_RULES) {
    const phrase = rule.phrases.map(normalizeText).find((candidate) => text.includes(candidate));
    if (!phrase) continue;
    const index = text.indexOf(phrase);
    addAssignment(assignments, rule.slug, rule.label, 0.94, {
      extraction_method: "official_page_phrase",
      source_url: sourceUrl,
      matched_phrase: phrase,
      excerpt: text.slice(Math.max(0, index - 100), Math.min(text.length, index + phrase.length + 180)),
    });
  }
  return [...assignments.values()].slice(0, 12);
}

function extractUsefulLinks(pageUrl: string, html: string) {
  const output: string[] = [];
  const host = hostOf(pageUrl);
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1], pageUrl);
      if (!/^https?:$/.test(url.protocol) || hostOf(url.toString()) !== host) continue;
      const blob = normalizeText(`${url.pathname} ${stripHtml(match[2])}`);
      if (!/(menu|carte|cuisine|food|restaurant|brunch)/.test(blob)) continue;
      url.hash = "";
      const canonical = `${url.origin}${url.pathname}`;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      output.push(canonical);
      if (output.length >= MAX_SITE_PAGES - 1) break;
    } catch {
      // Ignore invalid publisher links.
    }
  }
  return output;
}

async function assignmentsFromVerifiedWebsite(element: OsmElement) {
  const tags = element.tags || {};
  const website = normalizeHttpUrl(tags.website || tags["contact:website"]);
  if (!website || isRejectedSiteHost(website.hostname)) return null;
  try {
    const root = await fetchText(website);
    if (!root) return null;
    const assignments = new Map<string, CuisineAssignment>();
    for (const assignment of siteAssignments(root.html, root.url)) assignments.set(assignment.slug, assignment);
    if (assignments.size === 0) {
      for (const link of extractUsefulLinks(root.url, root.html)) {
        const page = await fetchText(new URL(link));
        if (!page) continue;
        for (const assignment of siteAssignments(page.html, page.url)) {
          const current = assignments.get(assignment.slug);
          if (!current || assignment.confidence > current.confidence) assignments.set(assignment.slug, assignment);
        }
        if (assignments.size > 0) break;
      }
    }
    return { sourceUrl: root.url, assignments: [...assignments.values()].slice(0, 12) };
  } catch {
    return null;
  }
}

async function loadLeadHints(supabase: any, restaurants: RestaurantRow[]) {
  const references = restaurants.map((restaurant) => restaurant.directory_source_reference).filter(Boolean) as string[];
  if (references.length === 0) return new Map<string, LeadHint>();
  const { data, error } = await supabase
    .from("marketing_contacts")
    .select("source_reference,website,phone")
    .eq("source_system", "commercial_prospect_catalog")
    .in("source_reference", [...new Set(references)]);
  if (error) throw new Error(`lead_hints_failed:${error.message}`);
  return new Map((data || []).map((row: LeadHint) => [String(row.source_reference || ""), row]));
}

function retryIso(daysOrHours: { days?: number; hours?: number }) {
  const milliseconds = (daysOrHours.days || 0) * 86_400_000 + (daysOrHours.hours || 0) * 3_600_000;
  return new Date(Date.now() + milliseconds).toISOString();
}

async function updateOsmJob(supabase: any, restaurantId: string, values: Record<string, unknown>) {
  const { error } = await supabase
    .from("restaurant_directory_cuisine_osm_jobs")
    .update({ ...values, locked_at: null, updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId);
  if (error) throw new Error(`osm_job_update_failed:${error.message}`);
}

async function statusSnapshot(supabase: any) {
  const statuses = ["pending", "processing", "success", "not_found", "error"] as const;
  const rows = await Promise.all(statuses.map(async (status) => {
    const { count, error } = await supabase
      .from("restaurant_directory_cuisine_osm_jobs")
      .select("restaurant_id", { count: "exact", head: true })
      .eq("status", status);
    if (error) throw new Error(error.message);
    return [status, count || 0] as const;
  }));
  return Object.fromEntries(rows);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  const log = makeLogger("enrich-directory-cuisines-osm");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    requireRole(actor, ["admin"]);
    const supabase = actor.adminClient;
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const mode = String(body?.mode || "process_batch");
    if (mode === "status") return jsonResponse({ success: true, jobs: await statusSnapshot(supabase) }, 200, corsHeaders);
    if (mode !== "process_batch") throw new HttpError(400, "Invalid mode");

    const { data: claimed, error: claimError } = await supabase.rpc("service_claim_directory_cuisine_osm_jobs", {
      p_limit: boundedBatchSize(body?.limit),
    });
    if (claimError) throw new Error(`osm_claim_failed:${claimError.message}`);
    const restaurantIds = (claimed || []).map((row: { restaurant_id: string }) => row.restaurant_id);
    if (restaurantIds.length === 0) {
      return jsonResponse({ success: true, claimed: 0, resolved: 0, not_found: 0, errors: 0, jobs: await statusSnapshot(supabase) }, 200, corsHeaders);
    }

    const { data: restaurantRows, error: restaurantsError } = await supabase
      .from("restaurants")
      .select("id,name,address,city,phone,latitude,longitude,directory_source_reference,directory_public_name_verified,is_directory_listing")
      .in("id", restaurantIds);
    if (restaurantsError) throw new Error(`restaurant_load_failed:${restaurantsError.message}`);
    const restaurants = (restaurantRows || []) as RestaurantRow[];
    const leadHints = await loadLeadHints(supabase, restaurants);
    const elements = await fetchOverpassElements(restaurants);

    let resolved = 0;
    let notFound = 0;
    let errors = 0;

    for (const restaurantId of restaurantIds) {
      const restaurant = restaurants.find((row) => row.id === restaurantId);
      if (!restaurant || restaurant.is_directory_listing !== true || restaurant.latitude == null || restaurant.longitude == null) {
        await updateOsmJob(supabase, restaurantId, { status: "error", next_attempt_at: null, last_error: "directory_restaurant_or_coordinates_missing" });
        errors++;
        continue;
      }

      try {
        const lead = leadHints.get(String(restaurant.directory_source_reference || "")) || null;
        const match = selectBestOsmMatch(restaurant, elements, lead);
        if (!match) {
          await updateOsmJob(supabase, restaurantId, {
            status: "not_found",
            next_attempt_at: retryIso({ days: 14 }),
            last_error: "no_verified_osm_match",
          });
          notFound++;
          continue;
        }

        const sourceUrl = `https://www.openstreetmap.org/${match.element.type}/${match.element.id}`;
        const osmAssignments = assignmentsFromOsm(match);
        if (osmAssignments.length > 0) {
          const { data: evidenceCount, error: applyError } = await supabase.rpc("service_apply_directory_cuisine_osm_evidence", {
            p_restaurant_id: restaurantId,
            p_source_url: sourceUrl,
            p_assignments: osmAssignments,
          });
          if (applyError) throw new Error(`osm_apply_failed:${applyError.message}`);
          await updateOsmJob(supabase, restaurantId, {
            status: "success",
            next_attempt_at: null,
            source_page_url: sourceUrl,
            evidence_count: Number(evidenceCount || osmAssignments.length),
            last_error: null,
          });
          resolved++;
          continue;
        }

        const websiteResult = await assignmentsFromVerifiedWebsite(match.element);
        if (websiteResult && websiteResult.assignments.length > 0) {
          const { data: evidenceCount, error: applyError } = await supabase.rpc("service_apply_directory_cuisine_evidence", {
            p_restaurant_id: restaurantId,
            p_source_url: websiteResult.sourceUrl,
            p_assignments: websiteResult.assignments,
          });
          if (applyError) throw new Error(`official_site_apply_failed:${applyError.message}`);
          await updateOsmJob(supabase, restaurantId, {
            status: "success",
            next_attempt_at: null,
            source_page_url: websiteResult.sourceUrl,
            evidence_count: Number(evidenceCount || websiteResult.assignments.length),
            last_error: null,
          });
          resolved++;
          continue;
        }

        await updateOsmJob(supabase, restaurantId, {
          status: "not_found",
          next_attempt_at: retryIso({ days: 14 }),
          source_page_url: sourceUrl,
          last_error: "verified_osm_match_without_cuisine_evidence",
        });
        notFound++;
      } catch (error) {
        errors++;
        const message = (error instanceof Error ? error.message : "unknown").slice(0, MAX_ERROR_LENGTH);
        await updateOsmJob(supabase, restaurantId, {
          status: "error",
          next_attempt_at: retryIso({ hours: 6 }),
          last_error: message,
        }).catch(() => undefined);
        log.warn("osm_cuisine_enrichment_failed", { restaurant_id: restaurantId, message });
      }
    }

    const result = {
      success: true,
      engine: "osm_overpass_plus_official_site",
      claimed: restaurantIds.length,
      resolved,
      not_found: notFound,
      errors,
      jobs: await statusSnapshot(supabase),
    };
    await writeAuditLog({
      adminClient: supabase,
      actor,
      request: req,
      functionName: "enrich-directory-cuisines-osm",
      action: "directory_cuisine_osm_enrichment_batch",
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
