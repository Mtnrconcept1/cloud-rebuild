export type CrmMfaFactor = {
  id?: string;
  factor_id?: string;
  status?: string;
  factor_type?: string;
  friendly_name?: string | null;
};

export type CrmMfaFactorList = {
  all?: CrmMfaFactor[];
  totp?: CrmMfaFactor[];
};

export const CRM_MFA_FRIENDLY_NAME = "TOK CRM";

export function getCrmMfaFactorId(factor: CrmMfaFactor | null) {
  return factor?.id || factor?.factor_id || "";
}

function isTotpFactor(factor: CrmMfaFactor) {
  return factor.factor_type === "totp" || !factor.factor_type;
}

export function isCrmMfaFactor(factor: CrmMfaFactor | null) {
  return Boolean(
    factor
      && isTotpFactor(factor)
      && factor.friendly_name === CRM_MFA_FRIENDLY_NAME,
  );
}

function getUniqueFactors(factors?: CrmMfaFactorList | null) {
  const uniqueFactors = new Map<string, CrmMfaFactor>();
  for (const factor of [...(factors?.totp || []), ...(factors?.all || [])]) {
    const factorId = getCrmMfaFactorId(factor);
    if (!factorId) continue;
    uniqueFactors.set(factorId, factor);
  }
  return [...uniqueFactors.values()];
}

export function findVerifiedCrmMfaFactor(factors?: CrmMfaFactorList | null) {
  const verifiedFactors = getUniqueFactors(factors)
    .filter(isTotpFactor)
    .filter((candidate) => candidate.status === "verified");

  return verifiedFactors.find(isCrmMfaFactor) || verifiedFactors[0] || null;
}

export function findPendingCrmMfaFactor(factors?: CrmMfaFactorList | null) {
  const availableFactors = getUniqueFactors(factors).filter(isTotpFactor);
  return availableFactors.find((candidate) => (
    candidate.status !== "verified" && candidate.friendly_name === CRM_MFA_FRIENDLY_NAME
  )) || null;
}
