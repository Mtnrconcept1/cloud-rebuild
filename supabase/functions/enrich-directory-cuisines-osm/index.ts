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
const USER_AGENT = "TOK-Restaurant-Cuisine-Verifier/1.0 (+https://www.thetok.ch)";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
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

type MatchResult = {
  element: OsmElement;
  distanceMeters: number;
  score: number;
  signals: string[];
};

type CuisineAssignment = {
  slug: string;
  label: string;
  confidence: number;
  evidence: Record<string, unknown>;
};

type CuisineMapValue = readonly [slug: string, label: string, confidence: number];

const OSM_CUISINE_MAP: Record<string, readonly CuisineMapValue[]> = {
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
  regional: [["suisse", "Suisse", 0.90]],
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

const VERIFIED_NAME_RULES: Array<{
  slug: string;
  label: string;
  pattern: RegExp;
}> = [
  { slug: "pizza", label: "Pizza", pattern: /\b(pizza|pizzeria|pizzas)\b/ },
  { slug: "sushi", label: "Sushi", pattern: /\bsushi\b/ },
  { slug: "japonais", label: "Japonais", pattern: /\b(japon|japanese|izakaya)\b/ },
  { slug: "ramen", label: "Ramen", pattern: /\bramen\b/ },
  { slug: "thai", label: "Thai", pattern: /\b(thai|thailand)\b/ },
  { slug: "chinois", label: "Chinois", pattern: /\b(chinois|chinese|sichuan|canton)\b/ },
  { slug: "coreen", label: "Coreen", pattern: /\b(coreen|korean)\b/ },
  { slug: "indien", label: "Indien", pattern: /\b(india|indien|indian|tandoori|biryani)\b/ },
  { slug: "libanais", label: "Libanais", pattern: /\b(liban|libanais|lebanese)\b/ },
  { slug: "marocain", label: "Marocain", pattern: /\b(maroc|marocain|moroccan)\b/ },
  { slug: "mexicain", label: "Mexicain", pattern: /\b(mexic|mexican)\b/ },
  { slug: "kebab", label: "Kebab", pattern: /\b(kebab|doner)\b/ },
  { slug: "poke", label: "Poke", pattern: /\bpoke\b/ },
  { slug: "burger", label: "Burger", pattern: /\b(burger|burgers)\b/ },
  { slug: "tacos", label: "Tacos", pattern: /\btacos?\b/ },
  { slug: "crepes", label: "Crepes", pattern: /\b(crepe|creperie|galette)\b/ },
  { slug: "glaces", label: "Glaces", pattern: /\b(glacier|gelateria|gelato)\b/ },
  { slug: "cafe", label: "Cafe", pattern: /\b(cafe|coffee)\b/ },
  { slug: "salon-de-the", label: "Salon de the", pattern: /\b(tea room|tearoom|salon de the)\b/ },
  { slug: "brunch", label: "Brunch", pattern: /\bbrunch\b/ },
  { slug: "portugais", label: "Portugais", pattern: /\b(portugal|portugais|portuguese)\b/ },
  { slug: "grec", label: "Grec", pattern: /\b(grec|greek)\b/ },
  { slug: "ethiopien", label: "Ethiopien", pattern: /\b(ethiop|ethiopian)\b/ },
  { slug: "erythreen", label: "Erythreen", pattern: /\b(erythre|eritrea|eritrean)\b/ },
  { slug: "iranien", label: "Iranien", pattern: /\b(iran|iranien|persian|persan)\b/ },
  { slug: "turc", label: "Turc", pattern: /\b(turc|turkish)\b/ },
  { slug: "vietnamien", label: "Vietnamien", pattern: /\b(vietnam|vietnamese)\b/ },
];

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
  const candidateStreet = streetTokens(tags["addr:street"] || "");
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
        await response.body?.cancel().catch(() => undefined);
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

function cuisineTokens(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .split(/[;,|/]+/)
    .map((token) => normalizeText(token).replace(/\s+/g, "_"))
    .filter(Boolean);
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

function assignmentsFromOsm(restaurant: RestaurantRow, match: MatchResult) {
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
      addAssignment(assignments, slug, label, confidence, {
        ...baseEvidence,
        matched_osm_value: token,
      });
    }
  }

  const amenity = normalizeText(tags.amenity).replace(/\s+/g, "_");
  if (amenity === "cafe") {
    addAssignment(assignments, "cafe", "Cafe", 0.94, {
      ...baseEvidence,
      extraction_method: "osm_amenity",
      matched_osm_value: "cafe",
    });
  }
  if (amenity === "bar" || amenity === "pub") {
    addAssignment(assignments, "bar", "Bar", 0.94, {
      ...baseEvidence,
      extraction_method: "osm_amenity",
      matched_osm_value: amenity,
    });
  }
  if (amenity === "ice_cream") {
    addAssignment(assignments, "glaces", "Glaces", 0.97, {
      ...baseEvidence,
      extraction_method: "osm_amenity",
      matched_osm_value: "ice_cream",
    });
  }

  const yesLike = (value: unknown) => ["yes", "only", "main"].includes(normalizeText(value));
  if (yesLike(tags["diet:vegan"])) {
    addAssignment(assignments, "vegan", "Vegan", 0.95, {
      ...baseEvidence,
      extraction_method: "osm_diet_tag",
      matched_osm_value: "diet:vegan",
    });
  }
  if (yesLike(tags["diet:vegetarian"])) {
    addAssignment(assignments, "vegetarien", "Vegetarien", 0.95, {
      ...baseEvidence,
      extraction_method: "osm_diet_tag",
      matched_osm_value: "diet:vegetarian",
    });
  }
  if (yesLike(tags["diet:halal"])) {
    addAssignment(assignments, "halal", "Halal", 0.95, {
      ...baseEvidence,
      extraction_method: "osm_diet_tag",
      matched_osm_value: "diet:halal",
    });
  }
  if (yesLike(tags.breakfast)) {
    addAssignment(assignments, "petit-dejeuner", "Petit-dejeuner", 0.91, {
      ...baseEvidence,
      extraction_method: "osm_meal_tag",
      matched_osm_value: "breakfast",
    });
  }

  // Name-based inference is deliberately limited to verified public names and
  // explicit culinary words. It is only used after the OSM identity match.
  if (restaurant.directory_public_name_verified === true) {
    const verifiedName = normalizeText(`${restaurant.name} ${tags.name || ""}`);
    for (const rule of VERIFIED_NAME_RULES) {
      if (!rule.pattern.test(verifiedName)) continue;
      addAssignment(assignments, rule.slug, rule.label, 0.90, {
        ...baseEvidence,
        extraction_method: "verified_matched_name_inference",
        matched_name: tags.name || restaurant.name,
      });
    }
  }

  return [...assignments.values()]
    .sort((left, right) => right.confidence - left.confidence || left.slug.localeCompare(right.slug))
    .slice(0, 12);
}

async function loadLeadHints(supabase: any, restaurants: RestaurantRow[]) {
  const references = restaurants
    .map((restaurant) => restaurant.directory_source_reference)
    .filter(Boolean) as string[];
  if (references.length === 0) return new Map<string, LeadHint>();

  const { data, error } = await supabase
    .from("marketing_contacts")
    .select("source_reference,website,phone")
    .eq("source_system", "commercial_prospect_catalog")
    .in("source_reference", [...new Set(references)]);
  if (error) throw new Error(`lead_hints_failed:${error.message}`);

  return new Map(
    (data || []).map((row: LeadHint) => [String(row.source_reference || ""), row]),
  );
}

function retryIso(input: { days?: number; hours?: number }) {
  const milliseconds = (input.days || 0) * 86_400_000 + (input.hours || 0) * 3_600_000;
  return new Date(Date.now() + milliseconds).toISOString();
}

async function updateJob(supabase: any, restaurantId: string, values: Record<string, unknown>) {
  const { error } = await supabase
    .from("restaurant_directory_cuisine_osm_jobs")
    .update({ ...values, locked_at: null, updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId);
  if (error) throw new Error(`osm_job_update_failed:${error.message}`);
}

async function getStatus(supabase: any) {
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
    actor = await authenticateRequest(req, {
      allowServiceRole: true,
      allowSchedulerSecret: true,
    });
    requireRole(actor, ["admin"]);
    const supabase = actor.adminClient;
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const mode = String(body?.mode || "process_batch");

    if (mode === "status") {
      return jsonResponse({ success: true, jobs: await getStatus(supabase) }, 200, corsHeaders);
    }
    if (mode !== "process_batch") throw new HttpError(400, "Invalid mode");

    const { data: claimed, error: claimError } = await supabase.rpc(
      "service_claim_directory_cuisine_osm_jobs",
      { p_limit: boundedBatchSize(body?.limit) },
    );
    if (claimError) throw new Error(`osm_claim_failed:${claimError.message}`);

    const restaurantIds = (claimed || []).map((row: { restaurant_id: string }) => row.restaurant_id);
    if (restaurantIds.length === 0) {
      return jsonResponse({
        success: true,
        engine: "osm_overpass_verified_cuisine",
        claimed: 0,
        resolved: 0,
        not_found: 0,
        errors: 0,
        jobs: await getStatus(supabase),
      }, 200, corsHeaders);
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
      if (
        !restaurant
        || restaurant.is_directory_listing !== true
        || restaurant.latitude == null
        || restaurant.longitude == null
      ) {
        await updateJob(supabase, restaurantId, {
          status: "error",
          next_attempt_at: null,
          last_error: "directory_restaurant_or_coordinates_missing",
        });
        errors++;
        continue;
      }

      try {
        const lead = leadHints.get(String(restaurant.directory_source_reference || "")) || null;
        const match = selectBestOsmMatch(restaurant, elements, lead);
        if (!match) {
          await updateJob(supabase, restaurantId, {
            status: "not_found",
            next_attempt_at: retryIso({ days: 14 }),
            last_error: "no_verified_osm_match",
          });
          notFound++;
          continue;
        }

        const sourceUrl = `https://www.openstreetmap.org/${match.element.type}/${match.element.id}`;
        const assignments = assignmentsFromOsm(restaurant, match);
        if (assignments.length === 0) {
          await updateJob(supabase, restaurantId, {
            status: "not_found",
            next_attempt_at: retryIso({ days: 14 }),
            source_page_url: sourceUrl,
            last_error: "verified_osm_match_without_cuisine_evidence",
          });
          notFound++;
          continue;
        }

        const { data: evidenceCount, error: applyError } = await supabase.rpc(
          "service_apply_directory_cuisine_osm_evidence",
          {
            p_restaurant_id: restaurantId,
            p_source_url: sourceUrl,
            p_assignments: assignments,
          },
        );
        if (applyError) throw new Error(`osm_apply_failed:${applyError.message}`);

        await updateJob(supabase, restaurantId, {
          status: "success",
          next_attempt_at: null,
          source_page_url: sourceUrl,
          evidence_count: Number(evidenceCount || assignments.length),
          last_error: null,
        });
        resolved++;
      } catch (error) {
        errors++;
        const message = (error instanceof Error ? error.message : "unknown").slice(0, MAX_ERROR_LENGTH);
        await updateJob(supabase, restaurantId, {
          status: "error",
          next_attempt_at: retryIso({ hours: 6 }),
          last_error: message,
        }).catch(() => undefined);
        log.warn("osm_cuisine_enrichment_failed", {
          restaurant_id: restaurantId,
          message,
        });
      }
    }

    const result = {
      success: true,
      engine: "osm_overpass_verified_cuisine",
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
    log.error("request_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      error instanceof HttpError ? error.status : 500,
      corsHeaders,
    );
  }
});
