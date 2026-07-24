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
const THEFORK_COMMERCIAL_PROSPECTS_URL = "/data/geneva-thefork-commercial-prospects.json";

function isValidProspect(value: GenevaCommercialProspect) {
  return (
    Number.isFinite(value.sourceObjectId) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude)
  );
}

function normalizeComparableValue(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
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

function prospectNamedContactKeys(prospect: GenevaCommercialProspect) {
  const name = normalizeComparableValue(prospect.name);
  if (!name) return [];

  return [
    prospect.email ? `email:${name}|${prospect.email.trim().toLowerCase()}` : "",
    prospect.phone ? `phone:${name}|${normalizePhone(prospect.phone)}` : "",
    prospect.website ? `website:${name}|${normalizeWebsiteHost(prospect.website)}` : "",
  ].filter((value) => !value.endsWith("|"));
}

function indexProspect(
  prospect: GenevaCommercialProspect,
  position: number,
  indexes: {
    bySourceObjectId: Map<number, number>;
    byVenue: Map<string, number>;
    byNamedContact: Map<string, number>;
    byTheForkUrl: Map<string, number>;
  },
) {
  indexes.bySourceObjectId.set(prospect.sourceObjectId, position);

  const venueKey = prospectVenueKey(prospect);
  if (!venueKey.endsWith("||")) indexes.byVenue.set(venueKey, position);

  for (const key of prospectNamedContactKeys(prospect)) {
    indexes.byNamedContact.set(key, position);
  }

  if (prospect.theForkDirectUrl) {
    indexes.byTheForkUrl.set(prospect.theForkDirectUrl.trim().toLowerCase(), position);
  }
}

export function mergeGenevaCommercialProspects(
  registryProspects: GenevaCommercialProspect[],
  theForkProspects: GenevaCommercialProspect[],
) {
  const merged = registryProspects.filter(isValidProspect).map((prospect) => ({ ...prospect }));
  const indexes = {
    bySourceObjectId: new Map<number, number>(),
    byVenue: new Map<string, number>(),
    byNamedContact: new Map<string, number>(),
    byTheForkUrl: new Map<string, number>(),
  };

  merged.forEach((prospect, position) => indexProspect(prospect, position, indexes));

  for (const incoming of theForkProspects.filter(isValidProspect)) {
    const directTheForkUrl = incoming.theForkDirectUrl?.trim().toLowerCase() || "";
    const venueKey = prospectVenueKey(incoming);
    const contactPositions = prospectNamedContactKeys(incoming)
      .map((key) => indexes.byNamedContact.get(key))
      .filter((position): position is number => position !== undefined);

    const position = indexes.bySourceObjectId.get(incoming.sourceObjectId)
      ?? (directTheForkUrl ? indexes.byTheForkUrl.get(directTheForkUrl) : undefined)
      ?? indexes.byVenue.get(venueKey)
      ?? contactPositions[0];

    if (position !== undefined) {
      const previous = merged[position];
      merged[position] = {
        ...previous,
        ...incoming,
        sourceObjectId: previous.sourceObjectId,
        legalName: incoming.legalName || previous.legalName,
        registryType: incoming.registryType || previous.registryType,
        companySize: incoming.companySize || previous.companySize,
        localType: incoming.localType || previous.localType,
        establishmentId: incoming.establishmentId || previous.establishmentId,
        companyId: incoming.companyId || previous.companyId,
        ideNumber: incoming.ideNumber || previous.ideNumber,
        isTheFork: true,
      };
      indexProspect(merged[position], position, indexes);
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
    fetchCommercialProspectSource(THEFORK_COMMERCIAL_PROSPECTS_URL),
  ]);

  return mergeGenevaCommercialProspects(registryProspects, theForkProspects);
}
