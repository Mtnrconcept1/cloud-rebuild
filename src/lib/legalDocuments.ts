export const LEGAL_EFFECTIVE_DATE_ISO = "2026-07-28";
export const LEGAL_EFFECTIVE_DATE_FR = "28 juillet 2026";

export const LEGAL_DOCUMENTS = {
  cgu: { version: "cgu-2026-07-v4", path: "/cgu" },
  privacy: { version: "privacy-2026-07-v4", path: "/politique-confidentialite" },
  cookies: { version: "cookies-2026-07-v3", path: "/cookies" },
  restaurantTerms: { version: "restaurant-terms-2026-07-v4", path: "/conditions-restaurateurs" },
} as const;

// Stored with every restaurant signup so the receipt identifies both documents,
// rather than merely recording an unversioned checkbox.
export const LEGAL_ACCEPTANCE_VERSION = `${LEGAL_DOCUMENTS.cgu.version}+${LEGAL_DOCUMENTS.privacy.version}`;
