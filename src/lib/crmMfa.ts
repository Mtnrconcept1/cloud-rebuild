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

// Marketing uses a separate authenticator and must not replace a recovered CRM factor.
const OTHER_WORKSPACE_MFA_FACTOR_NAMES = new Set(["TheTOK Marketing"]);

export function sanitizeCrmMfaNumericCode(value: string, digits: 6 | 8) {
  return value.replace(/\D/g, "").slice(0, digits);
}

export function isValidCrmTotpCode(value: string) {
  return /^\d{6}$/.test(value);
}

export function isValidCrmRecoveryCode(value: string) {
  return /^\d{8}$/.test(value);
}

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

  return verifiedFactors.find(isCrmMfaFactor)
    // Preserve generic legacy factors, but never fall back to Marketing's factor.
    || verifiedFactors.find((candidate) => !OTHER_WORKSPACE_MFA_FACTOR_NAMES.has(candidate.friendly_name?.trim() || ""))
    || null;
}

export function findPendingCrmMfaFactor(factors?: CrmMfaFactorList | null) {
  const availableFactors = getUniqueFactors(factors).filter(isTotpFactor);
  return availableFactors.find((candidate) => (
    candidate.status !== "verified" && candidate.friendly_name === CRM_MFA_FRIENDLY_NAME
  )) || null;
}
