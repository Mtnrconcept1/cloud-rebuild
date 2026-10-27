export const LEGAL_EFFECTIVE_DATE_ISO = "2026-10-27";
export const LEGAL_EFFECTIVE_DATE_FR = "27 octobre 2026";

export const LEGAL_DOCUMENTS = {
  cgu: { version: "cgu-2026-10-v7", path: "/cgu" },
  privacy: { version: "privacy-2026-10-v6", path: "/politique-confidentialite" },
  cookies: { version: "cookies-2026-10-v4", path: "/cookies" },
  restaurantTerms: { version: "restaurant-terms-2026-08-v5", path: "/conditions-restaurateurs", effectiveDateFr: "11 août 2026" },
} as const;

// Stored with every restaurant signup so the receipt identifies both documents,
// rather than merely recording an unversioned checkbox.
export const LEGAL_ACCEPTANCE_VERSION = `${LEGAL_DOCUMENTS.cgu.version}+${LEGAL_DOCUMENTS.privacy.version}`;

export function legalSectionId(title: string) {
  return `section-${title.match(/^\d+/)?.[0] || title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
