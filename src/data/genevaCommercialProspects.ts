import { fetchTheForkCommercialProspects } from "@/data/theForkCommercialProspects";

export type GenevaCommercialProspect = {
  sourceObjectId: number;
  name: string;
  legalName: string | null;
  registryType: string | null;
  category: string | null;
  branch: string | null;
  activityDetail: string | null;
  address: string | null;
  postalCode: string | null;
  locality: string | null;
  commune: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  companySize: string | null;
  localType: string | null;
  establishmentId: string | null;
  companyId: string | null;
  ideNumber: string | null;
  latitude: number;
  longitude: number;
  source: string | null;
  collectedAt: string | null;
  isTheFork?: boolean;
  theForkUrl?: string | null;
  theForkDirectUrl?: string | null;
  coordinateSource?: string | null;
  coordinatePrecision?: string | null;
  coordinateLabel?: string | null;
  sourceContact?: string | null;
  contactConfidence?: number | null;
  baseMatchReason?: string | null;
  baseMatchScore?: number | null;
  dataOrigin?: "registry" | "thefork" | "registry+thefork" | string | null;
};

export type CommercialProspectMergeReport = {
  baseCount: number;
  theForkCount: number;
  matchedExisting: number;
  addedNew: number;
  finalCount: number;
  reusedExistingSourceIds: number[];
  fallbackCoordinateCount: number;
};

const COMMERCIAL_PROSPECTS_URL = "/data/geneva-commercial-prospects.json";
const GENERIC_NAME_TOKENS = new Set([
  "bar",
  "bistrot",
  "brasserie",
  "cafe",
  "coffee",
  "geneve",
  "hotel",
  "restaurant",
  "resto",
  "the",
]);
const STREET_TOKEN_ALIASES: Record<string, string> = {
  av: "avenue",
  bd: "boulevard",
  ch: "chemin",
  chem: "chemin",
  pl: "place",
  rte: "route",
  st: "saint",
  ste: "sainte",
};

type ProspectCandidate = {
  index: number;
  prospect: GenevaCommercialProspect;
};

function isValidProspect(value: GenevaCommercialProspect) {
  return (
    Number.isSafeInteger(value.sourceObjectId)
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && Number.isFinite(value.latitude)
    && Number.isFinite(value.longitude)
  );
}

export function normalizeCommercialProspectText(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePostalCode(value: string | null | undefined) {
  return normalizeCommercialProspectText(value).replace(/^ch\s*/, "");
}

function normalizePhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("0041")) return digits.slice(2);
  if (digits.startsWith("0")) return `41${digits.slice(1)}`;
  return digits;
}

function normalizeWebsiteHost(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return normalizeCommercialProspectText(raw).replace(/\s+/g, "");
  }
}

function normalizedNameTokens(value: string | null | undefined) {
  return normalizeCommercialProspectText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !GENERIC_NAME_TOKENS.has(token));
}

function nameKey(value: string | null | undefined) {
  return normalizedNameTokens(value).join(" ");
}

function normalizeAddressTokens(value: string | null | undefined) {
  return normalizeCommercialProspectText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => STREET_TOKEN_ALIASES[token] || token)
    .sort()
    .join(" ");
}

function addressKey(prospect: Pick<GenevaCommercialProspect, "address" | "postalCode">) {
  const postalCode = normalizePostalCode(prospect.postalCode);
  const address = normalizeAddressTokens(prospect.address);
  return postalCode && address ? `${postalCode}|${address}` : "";
}

function namePostalKey(prospect: Pick<GenevaCommercialProspect, "name" | "postalCode">) {
  const name = nameKey(prospect.name);
  const postalCode = normalizePostalCode(prospect.postalCode);
  return name && postalCode ? `${postalCode}|${name}` : "";
}

function nameLocalityKey(prospect: Pick<GenevaCommercialProspect, "name" | "locality" | "commune">) {
  const name = nameKey(prospect.name);
  const locality = normalizeCommercialProspectText(prospect.locality || prospect.commune);
  return name && locality ? `${locality}|${name}` : "";
}

export function commercialProspectIdentityKey(
  prospect: Pick<GenevaCommercialProspect, "name" | "address" | "postalCode" | "locality">,
) {
  return [
    nameKey(prospect.name),
    normalizeAddressTokens(prospect.address),
    normalizePostalCode(prospect.postalCode),
    normalizeCommercialProspectText(prospect.locality),
  ].join("|");
}

function tokenSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = new Set(normalizedNameTokens(left));
  const rightTokens = new Set(normalizedNameTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
}

function candidateScore(existing: GenevaCommercialProspect, incoming: GenevaCommercialProspect) {
  const existingName = nameKey(existing.name);
  const incomingName = nameKey(incoming.name);
  const exactName = Boolean(existingName && existingName === incomingName);
  const containsName = Boolean(
    existingName && incomingName && (existingName.includes(incomingName) || incomingName.includes(existingName)),
  );
  const similarity = tokenSimilarity(existing.name, incoming.name);
  const establishmentBoost = normalizeCommercialProspectText(existing.registryType).includes("etablissement") ? 8 : 0;
  const restaurantBoost = normalizeCommercialProspectText(
    `${existing.category || ""} ${existing.branch || ""}`,
  ).includes("restaurant") ? 4 : 0;

  return (exactName ? 100 : 0)
    + (containsName ? 55 : 0)
    + (similarity * 70)
    + establishmentBoost
    + restaurantBoost;
}

function addToIndex(index: Map<string, ProspectCandidate[]>, key: string, candidate: ProspectCandidate) {
  if (!key) return;
  index.set(key, [...(index.get(key) || []), candidate]);
}

function selectBestCandidate(
  candidates: ProspectCandidate[],
  incoming: GenevaCommercialProspect,
  minimumScore: number,
) {
  if (candidates.length === 0) return null;
  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: candidateScore(candidate.prospect, incoming) }))
    .sort((left, right) => right.score - left.score);
  return ranked[0].score >= minimumScore ? ranked[0] : null;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0) || null;
}

function mergeMatchedProspect(
  existing: GenevaCommercialProspect,
  incoming: GenevaCommercialProspect,
  matchReason: string,
  matchScore: number,
) {
  return {
    ...existing,
    name: incoming.name,
    legalName: firstNonEmpty(existing.legalName, existing.name),
    category: firstNonEmpty(incoming.category, existing.category),
    branch: firstNonEmpty(existing.branch, incoming.branch),
    activityDetail: firstNonEmpty(existing.activityDetail, incoming.activityDetail),
    address: firstNonEmpty(existing.address, incoming.address),
    postalCode: firstNonEmpty(existing.postalCode, incoming.postalCode),
    locality: firstNonEmpty(existing.locality, incoming.locality),
    commune: firstNonEmpty(existing.commune, incoming.commune),
    phone: firstNonEmpty(existing.phone, incoming.phone),
    email: firstNonEmpty(existing.email, incoming.email),
    website: firstNonEmpty(existing.website, incoming.website),
    source: Array.from(new Set([existing.source, incoming.source].filter(Boolean))).join(" + ") || null,
    collectedAt: incoming.collectedAt || existing.collectedAt,
    isTheFork: true,
    theForkUrl: incoming.theForkUrl || existing.theForkUrl || null,
    theForkDirectUrl: incoming.theForkDirectUrl || existing.theForkDirectUrl || null,
    coordinateSource: "existing_commercial_map",
    coordinatePrecision: "matched_existing_prospect",
    coordinateLabel: existing.coordinateLabel || incoming.coordinateLabel || null,
    sourceContact: incoming.sourceContact || existing.sourceContact || null,
    contactConfidence: Math.max(
      Number(existing.contactConfidence || 0),
      Number(incoming.contactConfidence || 0),
    ),
    baseMatchReason: matchReason,
    baseMatchScore: matchScore,
    dataOrigin: "registry+thefork",
  } satisfies GenevaCommercialProspect;
}

export function mergeGenevaCommercialProspectsWithReport(
  registryProspects: GenevaCommercialProspect[],
  theForkProspects: GenevaCommercialProspect[],
) {
  const merged = registryProspects.filter(isValidProspect).map((prospect) => ({
    ...prospect,
    dataOrigin: prospect.dataOrigin || "registry",
  }));
  const addressIndex = new Map<string, ProspectCandidate[]>();
  const namePostalIndex = new Map<string, ProspectCandidate[]>();
  const nameLocalityIndex = new Map<string, ProspectCandidate[]>();
  const phoneIndex = new Map<string, ProspectCandidate[]>();
  const websiteIndex = new Map<string, ProspectCandidate[]>();
  const identityIndex = new Map<string, ProspectCandidate>();

  merged.forEach((prospect, index) => {
    const candidate = { index, prospect };
    addToIndex(addressIndex, addressKey(prospect), candidate);
    addToIndex(namePostalIndex, namePostalKey(prospect), candidate);
    addToIndex(nameLocalityIndex, nameLocalityKey(prospect), candidate);
    addToIndex(phoneIndex, normalizePhone(prospect.phone), candidate);
    addToIndex(websiteIndex, normalizeWebsiteHost(prospect.website), candidate);
    const identity = commercialProspectIdentityKey(prospect);
    if (identity && !identityIndex.has(identity)) identityIndex.set(identity, candidate);
  });

  const reusedExistingSourceIds = new Set<number>();
  let matchedExisting = 0;
  let addedNew = 0;

  for (const incoming of theForkProspects.filter(isValidProspect)) {
    const identity = commercialProspectIdentityKey(incoming);
    const exactIdentity = identityIndex.get(identity) || null;
    const byNamePostal = selectBestCandidate(namePostalIndex.get(namePostalKey(incoming)) || [], incoming, 80);
    const byNameLocality = selectBestCandidate(nameLocalityIndex.get(nameLocalityKey(incoming)) || [], incoming, 80);
    const byPhone = normalizePhone(incoming.phone)
      ? selectBestCandidate(phoneIndex.get(normalizePhone(incoming.phone)) || [], incoming, 32)
      : null;
    const byWebsite = normalizeWebsiteHost(incoming.website)
      ? selectBestCandidate(websiteIndex.get(normalizeWebsiteHost(incoming.website)) || [], incoming, 32)
      : null;
    const byAddress = selectBestCandidate(addressIndex.get(addressKey(incoming)) || [], incoming, 38);
    const match = exactIdentity || byNamePostal || byNameLocality || byPhone || byWebsite || byAddress;

    if (match && !reusedExistingSourceIds.has(match.prospect.sourceObjectId)) {
      const score = "score" in match && typeof match.score === "number"
        ? match.score
        : candidateScore(match.prospect, incoming);
      const reason = exactIdentity
        ? "name_address_postcode_locality"
        : byNamePostal === match
          ? "name_postcode"
          : byNameLocality === match
            ? "name_locality"
            : byPhone === match
              ? "phone_name"
              : byWebsite === match
                ? "website_name"
                : "address_name";
      const nextProspect = mergeMatchedProspect(merged[match.index], incoming, reason, score);
      merged[match.index] = nextProspect;
      reusedExistingSourceIds.add(match.prospect.sourceObjectId);
      matchedExisting += 1;
      continue;
    }

    merged.push({ ...incoming, isTheFork: true, dataOrigin: "thefork" });
    addedNew += 1;
  }

  const seenSourceIds = new Set<number>();
  const prospects = merged.filter((prospect) => {
    if (seenSourceIds.has(prospect.sourceObjectId)) return false;
    seenSourceIds.add(prospect.sourceObjectId);
    return true;
  });

  const report: CommercialProspectMergeReport = {
    baseCount: registryProspects.filter(isValidProspect).length,
    theForkCount: theForkProspects.filter(isValidProspect).length,
    matchedExisting,
    addedNew,
    finalCount: prospects.length,
    reusedExistingSourceIds: [...reusedExistingSourceIds],
    fallbackCoordinateCount: theForkProspects.filter(
      (prospect) => prospect.coordinatePrecision === "locality_fallback",
    ).length,
  };

  return { prospects, report };
}

export function mergeGenevaCommercialProspects(
  registryProspects: GenevaCommercialProspect[],
  theForkProspects: GenevaCommercialProspect[],
) {
  return mergeGenevaCommercialProspectsWithReport(registryProspects, theForkProspects).prospects;
}

async function fetchCommercialProspectSource(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Prospects commerciaux indisponibles (${response.status}, ${url}).`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error(`Le fichier de prospects commerciaux est invalide (${url}).`);
  }
  return (payload as GenevaCommercialProspect[]).filter(isValidProspect);
}

export async function fetchGenevaCommercialProspects(): Promise<GenevaCommercialProspect[]> {
  const [registryProspects, theForkProspects] = await Promise.all([
    fetchCommercialProspectSource(COMMERCIAL_PROSPECTS_URL),
    fetchTheForkCommercialProspects(),
  ]);
  const { prospects, report } = mergeGenevaCommercialProspectsWithReport(
    registryProspects,
    theForkProspects,
  );
  console.info("[commercial-map-thefork]", report);
  return prospects;
}
