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
};

const COMMERCIAL_PROSPECTS_URL = "/data/geneva-commercial-prospects.json";

type UniquePositionMap = Map<string, number | null>;

type ProspectIndexes = {
  bySourceObjectId: Map<number, number>;
  byVenue: UniquePositionMap;
  byNamePostcode: UniquePositionMap;
  byNamedContact: UniquePositionMap;
  byTheForkUrl: UniquePositionMap;
};

function isValidProspect(value: GenevaCommercialProspect) {
  return (
    Number.isFinite(value.sourceObjectId)
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && Number.isFinite(value.latitude)
    && Number.isFinite(value.longitude)
  );
}

function normalizeComparableValue(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:sa|sarl|snc|sagl|ltd|ag|gmbh|restaurant|cafe|bar|hotel|bistrot|brasserie)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePhone(value: string | null | undefined) {
  return String(value || "")
    .replace(/\D+/g, "")
    .replace(/^(?:0041|41|0)/, "");
}

function normalizeWebsiteHost(value: string | null | undefined) {
  if (!value) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function prospectVenueKey(prospect: GenevaCommercialProspect) {
  return [
    normalizeComparableValue(prospect.name),
    normalizeComparableValue(prospect.address),
    normalizeComparableValue(prospect.postalCode),
  ].join("|");
}

function prospectNamePostcodeKey(prospect: GenevaCommercialProspect) {
  return [
    normalizeComparableValue(prospect.name),
    normalizeComparableValue(prospect.postalCode),
  ].join("|");
}

function prospectNamedContactKeys(prospect: GenevaCommercialProspect) {
  const name = normalizeComparableValue(prospect.name);
  if (!name) return [];

  return [
    prospect.email ? `email:${name}|${prospect.email.trim().toLowerCase()}` : "",
    prospect.phone ? `phone:${name}|${normalizePhone(prospect.phone)}` : "",
    prospect.website ? `website:${name}|${normalizeWebsiteHost(prospect.website)}` : "",
  ].filter((value) => value && !value.endsWith("|"));
}

function setUniquePosition(index: UniquePositionMap, key: string, position: number) {
  if (!key || key.endsWith("|")) return;
  if (!index.has(key)) {
    index.set(key, position);
    return;
  }
  if (index.get(key) !== position) index.set(key, null);
}

function indexProspect(
  prospect: GenevaCommercialProspect,
  position: number,
  indexes: ProspectIndexes,
) {
  indexes.bySourceObjectId.set(prospect.sourceObjectId, position);
  setUniquePosition(indexes.byVenue, prospectVenueKey(prospect), position);
  setUniquePosition(indexes.byNamePostcode, prospectNamePostcodeKey(prospect), position);

  for (const key of prospectNamedContactKeys(prospect)) {
    setUniquePosition(indexes.byNamedContact, key, position);
  }

  if (prospect.theForkDirectUrl) {
    setUniquePosition(
      indexes.byTheForkUrl,
      prospect.theForkDirectUrl.trim().toLowerCase(),
      position,
    );
  }
}

function readUniquePosition(index: UniquePositionMap, key: string) {
  const position = index.get(key);
  return typeof position === "number" ? position : undefined;
}

function findExistingProspectPosition(
  incoming: GenevaCommercialProspect,
  indexes: ProspectIndexes,
) {
  const bySourceObjectId = indexes.bySourceObjectId.get(incoming.sourceObjectId);
  if (bySourceObjectId !== undefined) return { position: bySourceObjectId, reason: "source_object_id" };

  const directUrl = incoming.theForkDirectUrl?.trim().toLowerCase() || "";
  const byTheForkUrl = directUrl
    ? readUniquePosition(indexes.byTheForkUrl, directUrl)
    : undefined;
  if (byTheForkUrl !== undefined) return { position: byTheForkUrl, reason: "thefork_url" };

  const byVenue = readUniquePosition(indexes.byVenue, prospectVenueKey(incoming));
  if (byVenue !== undefined) return { position: byVenue, reason: "name_address_postcode" };

  const byNamePostcode = readUniquePosition(
    indexes.byNamePostcode,
    prospectNamePostcodeKey(incoming),
  );
  if (byNamePostcode !== undefined) return { position: byNamePostcode, reason: "name_postcode" };

  for (const key of prospectNamedContactKeys(incoming)) {
    const byContact = readUniquePosition(indexes.byNamedContact, key);
    if (byContact !== undefined) return { position: byContact, reason: "named_contact" };
  }

  return null;
}

function mergeMatchedProspect(
  previous: GenevaCommercialProspect,
  incoming: GenevaCommercialProspect,
  reason: string,
) {
  return {
    ...previous,
    ...incoming,
    sourceObjectId: previous.sourceObjectId,
    legalName: previous.legalName || incoming.legalName,
    registryType: previous.registryType || incoming.registryType,
    category: incoming.category || previous.category,
    branch: incoming.branch || previous.branch,
    activityDetail: incoming.activityDetail || previous.activityDetail,
    address: incoming.address || previous.address,
    postalCode: incoming.postalCode || previous.postalCode,
    locality: incoming.locality || previous.locality,
    commune: incoming.commune || previous.commune,
    phone: incoming.phone || previous.phone,
    email: incoming.email || previous.email,
    website: incoming.website || previous.website,
    companySize: previous.companySize || incoming.companySize,
    localType: previous.localType || incoming.localType,
    establishmentId: previous.establishmentId || incoming.establishmentId,
    companyId: previous.companyId || incoming.companyId,
    ideNumber: previous.ideNumber || incoming.ideNumber,
    latitude: previous.latitude,
    longitude: previous.longitude,
    source: [previous.source, incoming.source].filter(Boolean).join(" + ") || null,
    isTheFork: true,
    coordinateSource: "existing_commercial_map",
    coordinatePrecision: "matched_existing_prospect",
    coordinateLabel: previous.coordinateLabel || incoming.coordinateLabel,
    sourceContact: incoming.sourceContact || previous.sourceContact,
    contactConfidence: Math.max(
      Number(previous.contactConfidence || 0),
      Number(incoming.contactConfidence || 0),
    ),
    baseMatchReason: reason,
    baseMatchScore: incoming.baseMatchScore,
  } satisfies GenevaCommercialProspect;
}

export function mergeGenevaCommercialProspects(
  registryProspects: GenevaCommercialProspect[],
  theForkProspects: GenevaCommercialProspect[],
) {
  const merged = registryProspects.filter(isValidProspect).map((prospect) => ({ ...prospect }));
  const indexes: ProspectIndexes = {
    bySourceObjectId: new Map<number, number>(),
    byVenue: new Map<string, number | null>(),
    byNamePostcode: new Map<string, number | null>(),
    byNamedContact: new Map<string, number | null>(),
    byTheForkUrl: new Map<string, number | null>(),
  };

  merged.forEach((prospect, position) => indexProspect(prospect, position, indexes));

  for (const incoming of theForkProspects.filter(isValidProspect)) {
    const existing = findExistingProspectPosition(incoming, indexes);

    if (existing) {
      merged[existing.position] = mergeMatchedProspect(
        merged[existing.position],
        incoming,
        existing.reason,
      );
      indexProspect(merged[existing.position], existing.position, indexes);
      continue;
    }

    const nextPosition = merged.length;
    merged.push({ ...incoming, isTheFork: true });
    indexProspect(merged[nextPosition], nextPosition, indexes);
  }

  return merged;
}

async function fetchCommercialProspectSource(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

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

  return mergeGenevaCommercialProspects(registryProspects, theForkProspects);
}
