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
};

const COMMERCIAL_PROSPECTS_URL = "/data/geneva-commercial-prospects.json";

function isValidProspect(value: GenevaCommercialProspect) {
  return (
    Number.isFinite(value.sourceObjectId) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude)
  );
}

export async function fetchGenevaCommercialProspects(): Promise<GenevaCommercialProspect[]> {
  const response = await fetch(COMMERCIAL_PROSPECTS_URL, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Prospects commerciaux indisponibles (${response.status}).`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Le fichier de prospects commerciaux est invalide.");
  }

  return (payload as GenevaCommercialProspect[]).filter(isValidProspect);
}
