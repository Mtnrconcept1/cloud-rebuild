import type { GenevaCommercialProspect } from "@/data/genevaCommercialProspects";
import { decompressBzip2 } from "@/lib/bzip2Decompress";
import payloadPart00 from "../../scripts/.tmp/thefork-geneva-520.part-00?raw";
import payloadPart01 from "../../scripts/.tmp/thefork-geneva-520.part-01?raw";
import payloadPart02 from "../../scripts/.tmp/thefork-geneva-520.part-02?raw";

const THEFORK_PAYLOAD_BASE64 = [payloadPart00, payloadPart01, payloadPart02].join("");
const EXPECTED_RESTAURANT_COUNT = 520;
const THEFORK_SOURCE_OBJECT_ID_BASE = 2_600_000_000;
const GOLDEN_ANGLE = 2.399963229728653;

export type TheForkCommercialSourceRow = {
  index?: string;
  restaurant_name?: string;
  adresse_complete?: string;
  rue?: string;
  code_postal?: string;
  ville?: string;
  canton?: string;
  pays?: string;
  telephone?: string;
  email?: string;
  site_web?: string;
  latitude?: string;
  longitude?: string;
  cuisine?: string;
  url_thefork?: string;
  source_thefork?: string;
  source_contact?: string;
  confiance_contact?: string;
};

const POSTCODE_CENTERS: Record<string, readonly [number, number]> = {
  "1201": [46.2105, 6.1422], "1202": [46.2205, 6.1385], "1203": [46.2104, 6.124],
  "1204": [46.2016, 6.1483], "1205": [46.195, 6.1434], "1206": [46.1918, 6.156],
  "1207": [46.201, 6.1694], "1208": [46.1956, 6.1658], "1209": [46.224, 6.118],
  "1211": [46.2044, 6.1432], "1212": [46.178, 6.1225], "1213": [46.1835, 6.104],
  "1214": [46.218, 6.083], "1215": [46.236, 6.11], "1216": [46.2215, 6.107],
  "1217": [46.234, 6.08], "1218": [46.232, 6.123], "1219": [46.203, 6.095],
  "1220": [46.222, 6.101], "1222": [46.239, 6.197], "1223": [46.218, 6.183],
  "1224": [46.198, 6.186], "1225": [46.195, 6.195], "1226": [46.1885, 6.202],
  "1227": [46.188, 6.138], "1228": [46.1675, 6.116], "1232": [46.174, 6.084],
  "1233": [46.176, 6.075], "1234": [46.166, 6.183], "1236": [46.174, 6.02],
  "1239": [46.277, 6.123], "1241": [46.2095, 6.2315], "1242": [46.214, 6.035],
  "1245": [46.257, 6.206], "1246": [46.262, 6.213], "1247": [46.277, 6.225],
  "1248": [46.301, 6.243], "1253": [46.217, 6.201], "1255": [46.166, 6.183],
  "1256": [46.1645, 6.148], "1257": [46.145, 6.13], "1281": [46.188, 5.982],
  "1286": [46.143, 6.042], "1288": [46.19, 5.996], "1290": [46.283, 6.166],
  "1292": [46.242, 6.143], "1293": [46.256, 6.154], "1295": [46.308, 6.177],
  "1297": [46.332, 6.193],
};

const LOCALITY_CENTERS: Record<string, readonly [number, number]> = {
  geneve: [46.2044, 6.1432], carouge: [46.1834, 6.1391], lancy: [46.189, 6.1144],
  onex: [46.1839, 6.1006], "petit lancy": [46.188, 6.108], vernier: [46.217, 6.085],
  "grand saconnex": [46.2319, 6.1225], meyrin: [46.234, 6.08], cointrin: [46.2215, 6.107],
  "le lignon": [46.203, 6.095], vesenaz: [46.239, 6.197], cologny: [46.218, 6.183],
  "chene bougeries": [46.198, 6.186], "chene bourg": [46.195, 6.195], thonex: [46.1885, 6.202],
  "les acacias": [46.188, 6.138], "plan les ouates": [46.1675, 6.116], confignon: [46.174, 6.084],
  bernex: [46.176, 6.075], veyrier: [46.166, 6.183], cartigny: [46.174, 6.02],
  "collex bossy": [46.277, 6.123], puplinge: [46.2095, 6.2315], satigny: [46.214, 6.035],
  "collonge bellerive": [46.257, 6.206], corsier: [46.262, 6.213], anieres: [46.277, 6.225],
  hermance: [46.301, 6.243], vandoeuvres: [46.217, 6.201], troinex: [46.1645, 6.148],
  "la croix de rozon": [46.145, 6.13], russin: [46.188, 5.982], soral: [46.143, 6.042],
  "aire la ville": [46.19, 5.996], versoix: [46.283, 6.166], chambesy: [46.242, 6.143],
  bellevue: [46.256, 6.154], tannay: [46.308, 6.177], founex: [46.332, 6.193],
};

const VERIFIED_COORDINATE_OVERRIDES: Record<number, readonly [number, number]> = {
  162: [46.1836574, 6.1452307],
  310: [46.2048264, 6.1768912],
  353: [46.2032701, 6.1422852],
  402: [46.2069392, 6.1462427],
};

function optionalText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeComparableValue(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePostcode(value: unknown) {
  return String(value ?? "").replace(/^CH-/i, "").replace(/\.0$/, "").trim();
}

function finiteNumber(value: unknown) {
  const normalized = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : null;
}

function validCoordinates(latitude: number | null, longitude: number | null) {
  return latitude !== null
    && longitude !== null
    && latitude >= 45
    && latitude <= 48.2
    && longitude >= 5
    && longitude <= 11;
}

function deterministicHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getReferenceCoordinates(
  row: TheForkCommercialSourceRow,
  rowIndex: number,
  postcodePosition: number,
) {
  const providedLatitude = finiteNumber(row.latitude);
  const providedLongitude = finiteNumber(row.longitude);
  if (validCoordinates(providedLatitude, providedLongitude)) {
    return {
      latitude: providedLatitude as number,
      longitude: providedLongitude as number,
      source: "csv_verified",
      precision: "provided",
    };
  }

  const verifiedOverride = VERIFIED_COORDINATE_OVERRIDES[rowIndex];
  if (verifiedOverride) {
    return {
      latitude: verifiedOverride[0],
      longitude: verifiedOverride[1],
      source: "tok_restaurant_contact_dataset",
      precision: "matched_venue",
    };
  }

  const postcode = normalizePostcode(row.code_postal);
  const locality = normalizeComparableValue(row.ville);
  const center = POSTCODE_CENTERS[postcode]
    || LOCALITY_CENTERS[locality]
    || LOCALITY_CENTERS.geneve;
  const hashPhase = (deterministicHash(`${rowIndex}|${row.restaurant_name}|${row.rue}`) / 0xffffffff)
    * 2
    * Math.PI;
  const angle = hashPhase + (GOLDEN_ANGLE * postcodePosition);
  const radius = 0.00018 * Math.sqrt(postcodePosition + 1);
  const longitudeScale = Math.max(Math.cos((center[0] * Math.PI) / 180), 0.68);

  return {
    latitude: center[0] + (Math.sin(angle) * radius),
    longitude: center[1] + ((Math.cos(angle) * radius) / longitudeScale),
    source: "postcode_reference_point",
    precision: "postal_centroid",
  };
}

export function buildTheForkCommercialProspectsFromRows(rows: TheForkCommercialSourceRow[]) {
  if (rows.length !== EXPECTED_RESTAURANT_COUNT) {
    throw new Error(`Source TheFork incomplète : ${rows.length}/${EXPECTED_RESTAURANT_COUNT}.`);
  }

  const sortedRows = [...rows].sort((left, right) => (
    Number(left.index || 0) - Number(right.index || 0)
  ));
  const postcodePositions = new Map<number, number>();
  const postcodeCounts = new Map<string, number>();

  for (const row of sortedRows) {
    const index = Number(row.index);
    const postcode = normalizePostcode(row.code_postal);
    postcodePositions.set(index, postcodeCounts.get(postcode) || 0);
    postcodeCounts.set(postcode, (postcodeCounts.get(postcode) || 0) + 1);
  }

  const prospects = sortedRows.map<GenevaCommercialProspect>((row) => {
    const index = Number(row.index);
    if (!Number.isInteger(index) || index < 1 || index > EXPECTED_RESTAURANT_COUNT) {
      throw new Error(`Index TheFork invalide : ${String(row.index)}.`);
    }

    const name = String(row.restaurant_name || "").trim();
    const theForkUrl = optionalText(row.url_thefork) || optionalText(row.source_thefork);
    if (!name || !theForkUrl || !/^https:\/\/www\.thefork\.(?:ch|com)\//i.test(theForkUrl)) {
      throw new Error(`Restaurant TheFork invalide à l'index ${index}.`);
    }

    const coordinates = getReferenceCoordinates(
      row,
      index,
      postcodePositions.get(index) || 0,
    );

    return {
      sourceObjectId: THEFORK_SOURCE_OBJECT_ID_BASE + index,
      name,
      legalName: null,
      registryType: "TheFork",
      category: optionalText(row.cuisine) || "Restaurant TheFork",
      branch: "Restaurant référencé sur TheFork",
      activityDetail: optionalText(row.cuisine),
      address: optionalText(row.rue) || optionalText(row.adresse_complete),
      postalCode: normalizePostcode(row.code_postal) || null,
      locality: optionalText(row.ville),
      commune: optionalText(row.ville),
      phone: optionalText(row.telephone),
      email: optionalText(row.email),
      website: optionalText(row.site_web),
      companySize: null,
      localType: null,
      establishmentId: null,
      companyId: null,
      ideNumber: null,
      latitude: Number(coordinates.latitude.toFixed(7)),
      longitude: Number(coordinates.longitude.toFixed(7)),
      source: "TheFork Genève 2026-07-24 + coordonnées professionnelles publiques",
      collectedAt: "2026-07-24",
      isTheFork: true,
      theForkUrl,
      theForkDirectUrl: optionalText(row.url_thefork),
      coordinateSource: coordinates.source,
      coordinatePrecision: coordinates.precision,
      coordinateLabel: null,
      sourceContact: optionalText(row.source_contact),
      contactConfidence: finiteNumber(row.confiance_contact) || 0,
      baseMatchReason: null,
      baseMatchScore: null,
    };
  });

  const sourceObjectIds = new Set(prospects.map((prospect) => prospect.sourceObjectId));
  const venueKeys = new Set(prospects.map((prospect) => [
    normalizeComparableValue(prospect.name),
    normalizeComparableValue(prospect.address),
    prospect.postalCode,
  ].join("|")));
  const coordinateKeys = new Set(prospects.map((prospect) => (
    `${prospect.latitude.toFixed(7)}:${prospect.longitude.toFixed(7)}`
  )));

  if (
    sourceObjectIds.size !== EXPECTED_RESTAURANT_COUNT
    || venueKeys.size !== EXPECTED_RESTAURANT_COUNT
    || coordinateKeys.size !== EXPECTED_RESTAURANT_COUNT
  ) {
    throw new Error("La source TheFork contient un doublon ou une coordonnée réutilisée.");
  }

  return prospects;
}

let theForkProspectsPromise: Promise<GenevaCommercialProspect[]> | null = null;

export function fetchTheForkCommercialProspects() {
  if (theForkProspectsPromise) return theForkProspectsPromise;

  theForkProspectsPromise = Promise.resolve().then(() => {
    const compressed = decodeBase64(THEFORK_PAYLOAD_BASE64);
    const decoded = new TextDecoder().decode(decompressBzip2(compressed));
    const payload = JSON.parse(decoded) as unknown;
    if (!Array.isArray(payload)) throw new Error("Le corpus TheFork est invalide.");
    return buildTheForkCommercialProspectsFromRows(payload as TheForkCommercialSourceRow[]);
  }).catch((error) => {
    theForkProspectsPromise = null;
    throw error;
  });

  return theForkProspectsPromise;
}
