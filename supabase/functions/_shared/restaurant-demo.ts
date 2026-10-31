import { normalizeAcquisitionTouch, type AcquisitionTouch } from "./marketing-utm.ts";

/**
 * Public restaurant demo leads: parse only explicit, bounded structured fields.
 * A marketing checkbox is stored as unverified evidence until a controlled
 * consent-sync operation confirms eligibility. Never infer consent from a demo request.
 */
export const RESTAURANT_DEMO_SUBJECT = "Demande de démo restaurateur TOK Genève";
export const RESTAURANT_DEMO_CONSENT_VERSION = "restaurant_demo_optin_2026_10";

export type RestaurantDemoInput = {
  requestId: string;
  city: string;
  phone: string;
  tableCount: number | null;
  primaryNeed: string;
  marketingConsent: boolean;
  /** User-declared visit source; never proof of conversion or consent. */
  acquisitionTouch: Pick<AcquisitionTouch, "utm" | "referrerHost" | "touchedAt"> | null;
};

export function parseRestaurantDemoInput(raw: unknown): RestaurantDemoInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("invalid_restaurant_demo_details");
  }
  const row = raw as Record<string, unknown>;
  const requestId = row.requestId;
  const city = row.city;
  const phone = row.phone;
  const primaryNeed = row.primaryNeed;
  const tableCount = row.tableCount;
  const consent = row.marketingConsent;

  if (
    typeof requestId !== "string" ||
    !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(requestId) ||
    typeof city !== "string" || city.trim().length < 2 || city.trim().length > 120 ||
    typeof phone !== "string" || phone.trim().length < 6 || phone.trim().length > 64 ||
    (typeof primaryNeed !== "string") || primaryNeed.length > 160 ||
    !(tableCount === null || (typeof tableCount === "number" && Number.isInteger(tableCount) &&
      tableCount >= 0 && tableCount <= 10000)) ||
    typeof consent !== "boolean"
  ) {
    throw new Error("invalid_restaurant_demo_details");
  }
  const touch = row.marketingTrackingConsent === true
    ? normalizeAcquisitionTouch(row.acquisitionTouch)
    : null;
  const touchedAtAge = touch ? Date.now() - Date.parse(touch.touchedAt) : Number.NaN;
  // Never persist arbitrary navigation paths, query strings, user identifiers or stale sources.
  const acquisitionTouch = touch && touchedAtAge >= -300_000 && touchedAtAge <= 90 * 86_400_000
    ? { utm: touch.utm, referrerHost: touch.referrerHost, touchedAt: touch.touchedAt }
    : null;
  return {
    requestId,
    city: city.trim(),
    phone: phone.trim(),
    tableCount,
    primaryNeed: primaryNeed.trim(),
    marketingConsent: consent,
    acquisitionTouch,
  };
}
