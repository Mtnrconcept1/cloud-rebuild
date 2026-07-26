import type { GenevaCommercialProspect } from "@/data/genevaCommercialProspects";

// Static dataset served from public/. The rows were recovered from the
// versioned TheFork Geneva export of 2026-07-24; identifiers stay inside the
// server-authorized commercial_prospect_catalog block (2600000001..2600000520)
// so the scoped follow-up RPCs keep accepting every pin on the map.
const THEFORK_PROSPECTS_URL = "/data/thefork-geneva-commercial-prospects.json";
const THEFORK_SOURCE_OBJECT_ID_BASE = 2_600_000_000;
const THEFORK_MAX_AUTHORIZED_INDEX = 520;
const THEFORK_URL_PATTERN = /^https:\/\/www\.thefork\.(?:ch|com)\//i;

function isAuthorizedTheForkProspect(value: GenevaCommercialProspect) {
  const index = Number(value.sourceObjectId) - THEFORK_SOURCE_OBJECT_ID_BASE;
  return Number.isInteger(index)
    && index >= 1
    && index <= THEFORK_MAX_AUTHORIZED_INDEX
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && Number.isFinite(value.latitude)
    && Number.isFinite(value.longitude)
    && value.latitude >= 45
    && value.latitude <= 48.2
    && value.longitude >= 5
    && value.longitude <= 11
    && typeof value.theForkUrl === "string"
    && THEFORK_URL_PATTERN.test(value.theForkUrl);
}

let theForkProspectsPromise: Promise<GenevaCommercialProspect[]> | null = null;

export function fetchTheForkCommercialProspects() {
  if (theForkProspectsPromise) return theForkProspectsPromise;

  theForkProspectsPromise = (async () => {
    const response = await fetch(THEFORK_PROSPECTS_URL, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Restaurants TheFork indisponibles (${response.status}).`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("Le fichier des restaurants TheFork est invalide.");
    }

    const seenSourceObjectIds = new Set<number>();
    const prospects = (payload as GenevaCommercialProspect[])
      .filter((prospect) => {
        if (!isAuthorizedTheForkProspect(prospect)) return false;
        if (seenSourceObjectIds.has(prospect.sourceObjectId)) return false;
        seenSourceObjectIds.add(prospect.sourceObjectId);
        return true;
      })
      .map((prospect) => ({
        ...prospect,
        isTheFork: true,
        theForkDirectUrl: prospect.theForkDirectUrl && /\/restaurant\//i.test(prospect.theForkDirectUrl)
          ? prospect.theForkDirectUrl
          : null,
      }));

    if (prospects.length === 0) {
      throw new Error("Aucun restaurant TheFork exploitable dans la source.");
    }

    return prospects;
  })().catch((error) => {
    theForkProspectsPromise = null;
    throw error;
  });

  return theForkProspectsPromise;
}
