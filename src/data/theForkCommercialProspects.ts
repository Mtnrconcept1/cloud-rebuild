import type { GenevaCommercialProspect } from "@/data/genevaCommercialProspects";

const THEFORK_MANIFEST_URL = "/data/thefork-geneva-commercial-prospects/manifest.json";
const EXPECTED_RESTAURANT_COUNT = 520;
const EXPECTED_PART_COUNT = 8;
const EXPECTED_VERSION = "2026-07-24";

type TheForkCommercialProspectRow = [
  sourceObjectId: number,
  name: string,
  address: string | null,
  postalCode: string | null,
  locality: string | null,
  phone: string | null,
  email: string | null,
  website: string | null,
  latitude: number,
  longitude: number,
  cuisine: string | null,
  sourceUrl: string | null,
  coordinatePrecision: "exact" | "locality_fallback",
  contactConfidence: string | null,
];

type TheForkCommercialProspectPart = {
  version: string;
  rows: TheForkCommercialProspectRow[];
};

type TheForkCommercialProspectManifest = {
  version: string;
  count: number;
  parts: string[];
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeDirectTheForkUrl(value: string | null) {
  if (!value) return null;
  return /\/restaurant\//i.test(value) ? value : null;
}

function validateManifest(value: unknown): asserts value is TheForkCommercialProspectManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Le manifeste TheFork est invalide.");
  }

  const manifest = value as Partial<TheForkCommercialProspectManifest>;
  const uniqueParts = new Set(manifest.parts || []);
  const safeParts = (manifest.parts || []).every((part) => /^part-\d{2}\.json$/.test(part));

  if (
    manifest.version !== EXPECTED_VERSION
    || manifest.count !== EXPECTED_RESTAURANT_COUNT
    || !Array.isArray(manifest.parts)
    || manifest.parts.length !== EXPECTED_PART_COUNT
    || uniqueParts.size !== EXPECTED_PART_COUNT
    || !safeParts
  ) {
    throw new Error("Le manifeste TheFork est incomplet ou incohérent.");
  }
}

function validatePart(value: unknown, expectedVersion: string): asserts value is TheForkCommercialProspectPart {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Un segment TheFork est invalide.");
  }

  const part = value as Partial<TheForkCommercialProspectPart>;
  if (part.version !== expectedVersion || !Array.isArray(part.rows)) {
    throw new Error("Un segment TheFork est incompatible avec le manifeste.");
  }
}

function decodeRow(row: TheForkCommercialProspectRow, version: string): GenevaCommercialProspect {
  const [
    sourceObjectId,
    rawName,
    address,
    postalCode,
    locality,
    phone,
    email,
    website,
    latitude,
    longitude,
    cuisine,
    sourceUrl,
    coordinatePrecision,
    contactConfidence,
  ] = row;
  const name = String(rawName || "").trim();

  if (
    !Number.isSafeInteger(sourceObjectId)
    || sourceObjectId < 2_000_000_000
    || !name
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < 45
    || latitude > 48.2
    || longitude < 5
    || longitude > 11
  ) {
    throw new Error(`Restaurant TheFork invalide : ${name || sourceObjectId}.`);
  }

  const normalizedSourceUrl = normalizeText(sourceUrl);
  if (!normalizedSourceUrl || !/^https:\/\/www\.thefork\.(?:ch|com)\//i.test(normalizedSourceUrl)) {
    throw new Error(`Source TheFork invalide pour ${name}.`);
  }

  const confidence = Number(contactConfidence);

  return {
    sourceObjectId,
    name,
    legalName: null,
    registryType: "TheFork",
    category: normalizeText(cuisine) || "Restaurant TheFork",
    branch: "Restaurant référencé sur TheFork",
    activityDetail: normalizeText(cuisine),
    address: normalizeText(address),
    postalCode: normalizeText(postalCode),
    locality: normalizeText(locality),
    commune: normalizeText(locality),
    phone: normalizeText(phone),
    email: normalizeText(email),
    website: normalizeText(website),
    companySize: null,
    localType: "Restaurant",
    establishmentId: `thefork:${sourceObjectId}`,
    companyId: null,
    ideNumber: null,
    latitude,
    longitude,
    source: `TheFork Genève · export vérifié ${version}`,
    collectedAt: version,
    isTheFork: true,
    theForkUrl: normalizedSourceUrl,
    theForkDirectUrl: normalizeDirectTheForkUrl(normalizedSourceUrl),
    coordinateSource: coordinatePrecision === "exact" ? "verified_public_source" : "locality_reference_point",
    coordinatePrecision,
    coordinateLabel: coordinatePrecision === "exact" ? "Coordonnée vérifiée" : "Position indicative dans la localité",
    sourceContact: normalizedSourceUrl,
    contactConfidence: Number.isFinite(confidence) ? confidence : 0,
    baseMatchReason: null,
    baseMatchScore: null,
    dataOrigin: "thefork",
  };
}

export function decodeTheForkCommercialProspectParts(
  manifest: TheForkCommercialProspectManifest,
  parts: TheForkCommercialProspectPart[],
) {
  validateManifest(manifest);
  if (parts.length !== manifest.parts.length) {
    throw new Error("Tous les segments TheFork n'ont pas été chargés.");
  }

  parts.forEach((part) => validatePart(part, manifest.version));
  const prospects = parts.flatMap((part) => part.rows.map((row) => decodeRow(row, part.version)));

  if (prospects.length !== manifest.count) {
    throw new Error(`Source TheFork incomplète : ${prospects.length}/${manifest.count}.`);
  }

  const sourceIds = new Set<number>();
  const identities = new Set<string>();
  for (const prospect of prospects) {
    const identity = [
      prospect.name.toLowerCase(),
      prospect.address?.toLowerCase() || "",
      prospect.postalCode || "",
      prospect.locality?.toLowerCase() || "",
    ].join("|");

    if (sourceIds.has(prospect.sourceObjectId) || identities.has(identity)) {
      throw new Error(`Doublon TheFork détecté : ${prospect.name}.`);
    }
    sourceIds.add(prospect.sourceObjectId);
    identities.add(identity);
  }

  return prospects;
}

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Source TheFork indisponible (${response.status}, ${url}).`);
  }
  return response.json() as Promise<unknown>;
}

let theForkProspectsPromise: Promise<GenevaCommercialProspect[]> | null = null;

export function fetchTheForkCommercialProspects() {
  if (theForkProspectsPromise) return theForkProspectsPromise;

  theForkProspectsPromise = fetchJson(THEFORK_MANIFEST_URL)
    .then(async (manifestValue) => {
      validateManifest(manifestValue);
      const manifest = manifestValue;
      const baseUrl = THEFORK_MANIFEST_URL.replace(/\/manifest\.json$/, "");
      const partValues = await Promise.all(
        manifest.parts.map((part) => fetchJson(`${baseUrl}/${part}`)),
      );
      const parts = partValues.map((partValue) => {
        validatePart(partValue, manifest.version);
        return partValue;
      });
      return decodeTheForkCommercialProspectParts(manifest, parts);
    })
    .catch((error) => {
      theForkProspectsPromise = null;
      throw error;
    });

  return theForkProspectsPromise;
}

export type {
  TheForkCommercialProspectManifest,
  TheForkCommercialProspectPart,
  TheForkCommercialProspectRow,
};
