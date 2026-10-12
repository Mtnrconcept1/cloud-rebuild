/** Canton-specific home art, using the images committed on Photoacceuil. */
export const SWISS_CANTON_CODES = [
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE",
  "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH",
] as const;

export type SwissCantonCode = (typeof SWISS_CANTON_CODES)[number];

const CANTON_SET: ReadonlySet<string> = new Set(SWISS_CANTON_CODES);

const CANTON_NAMES: Record<SwissCantonCode, string[]> = {
  AG: ["Argovie", "Aargau", "Aarau", "Baden", "Wettingen"],
  AI: ["Appenzell Rhodes-Intérieures", "Appenzell Innerrhoden", "Appenzell"],
  AR: ["Appenzell Rhodes-Extérieures", "Appenzell Ausserrhoden", "Herisau", "Trogen"],
  BE: ["Berne", "Bern", "Biel", "Bienne", "Thun", "Thoune", "Interlaken"],
  BL: ["Bâle-Campagne", "Basel Landschaft", "Liestal", "Reinach", "Allschwil"],
  BS: ["Bâle-Ville", "Basel-Stadt", "Bâle", "Basel", "Riehen"],
  FR: ["Fribourg", "Freiburg", "Bulle", "Morat", "Murten"],
  GE: ["Genève", "Geneva", "Carouge", "Vernier", "Meyrin", "Lancy", "Thônex", "Puplinge", "Bernex", "Onex", "Cologny", "Chêne-Bourg", "Chêne-Bougeries", "Perly-Certoux", "Aire-la-Ville", "Vandœuvres", "Veyrier", "Plan-les-Ouates", "Versoix"],
  GL: ["Glaris", "Glarus"],
  GR: ["Grisons", "Graubünden", "Grischun", "Coire", "Chur", "Davos", "Saint-Moritz", "St. Moritz"],
  JU: ["Jura", "Delémont", "Porrentruy", "Saignelégier"],
  LU: ["Lucerne", "Luzern", "Kriens", "Emmen"],
  NE: ["Neuchâtel", "La Chaux-de-Fonds", "Le Locle", "Val-de-Ruz"],
  NW: ["Nidwald", "Nidwalden", "Stans", "Stansstad"],
  OW: ["Obwald", "Obwalden", "Sarnen", "Engelberg"],
  SG: ["Saint-Gall", "Sankt Gallen", "St. Gallen", "Rapperswil", "Wil"],
  SH: ["Schaffhouse", "Schaffhausen", "Neuhausen"],
  SO: ["Soleure", "Solothurn", "Olten", "Grenchen"],
  SZ: ["Schwytz", "Schwyz", "Einsiedeln", "Lachen"],
  TG: ["Thurgovie", "Thurgau", "Frauenfeld", "Kreuzlingen", "Weinfelden"],
  TI: ["Tessin", "Ticino", "Lugano", "Bellinzone", "Bellinzona", "Locarno", "Mendrisio"],
  UR: ["Uri", "Altdorf", "Andermatt"],
  VD: ["Vaud", "Lausanne", "Montreux", "Nyon", "Morges", "Vevey", "Yverdon-les-Bains", "Rolle", "Renens", "Pully", "Aubonne"],
  VS: ["Valais", "Wallis", "Sion", "Sitten", "Sierre", "Martigny", "Brigue", "Brig", "Zermatt"],
  ZG: ["Zoug", "Zug", "Baar", "Cham"],
  ZH: ["Zurich", "Zürich", "Zurigo", "Winterthur", "Winterthour", "Uster", "Dübendorf"],
};

const CANTON_ALIASES: ReadonlyMap<string, SwissCantonCode> = new Map(
  Object.entries(CANTON_NAMES).flatMap(([code, aliases]) =>
    aliases.map((alias) => [simplifyPlace(alias), code as SwissCantonCode] as const),
  ),
);

function simplifyPlace(value: string): string {
  return value
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function cantonFromPlaceName(place: string | null | undefined): SwissCantonCode | null {
  if (!place?.trim()) return null;
  const normalized = simplifyPlace(place.split(",")[0]);
  const exactCode = normalized.toUpperCase();
  if (CANTON_SET.has(exactCode)) return exactCode as SwissCantonCode;
  const withoutCountry = normalized.replace(/^ch /, "");
  const trailingCode = withoutCountry.match(/(?:^| )([a-z]{2})$/);
  if (trailingCode && CANTON_SET.has(trailingCode[1].toUpperCase())) {
    return trailingCode[1].toUpperCase() as SwissCantonCode;
  }
  return CANTON_ALIASES.get(withoutCountry) ?? null;
}

export function cantonHeroSrc(canton: SwissCantonCode): string {
  return "/desig%20app/tok-ch-" + canton.toLowerCase() + ".webp";
}

/** Official swisstopo municipality boundaries return the canton code for GPS coordinates. */
export async function cantonAtCoordinates(
  coords: { latitude: number; longitude: number },
  fetcher: typeof fetch = fetch,
): Promise<SwissCantonCode | null> {
  const { latitude, longitude } = coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < 45.7 || latitude > 48.0 || longitude < 5.8 || longitude > 10.7) {
    return null;
  }
  const url = new URL("https://api3.geo.admin.ch/rest/services/ech/MapServer/identify");
  url.search = new URLSearchParams({
    geometry: String(longitude) + "," + String(latitude),
    geometryType: "esriGeometryPoint",
    layers: "all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill",
    tolerance: "0",
    sr: "4326",
    returnGeometry: "false",
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(url.toString(), { signal: controller.signal });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      results?: Array<{ layerBodId?: string; attributes?: { kanton?: unknown }; properties?: { kanton?: unknown } }>;
    };
    if (!Array.isArray(payload?.results)) return null;
    for (const feature of payload.results) {
      if (feature.layerBodId !== "ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill") continue;
      const candidate = feature.attributes?.kanton ?? feature.properties?.kanton;
      if (typeof candidate === "string" && CANTON_SET.has(candidate.toUpperCase())) {
        return candidate.toUpperCase() as SwissCantonCode;
      }
    }
    return null;
  } catch {
    // When the mapping service is unavailable, retain the known/fallback image.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
