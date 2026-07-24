import { getSupabase } from "@/integrations/supabase/client";

export const CONSENT_VERSION = "2026-07-24-v2";
export const CONSENT_STORAGE_KEY = `tok_consent_${CONSENT_VERSION}`;
export const CONSENT_EVENT = "tok:consent-change";

export type ConsentCategory = "necessary" | "analytics" | "marketing" | "personalization" | "geolocation";
export type ConsentPreferences = Record<ConsentCategory, boolean>;

export type ConsentReceipt = {
  version: string;
  preferences: ConsentPreferences;
  recordedAt: string;
  source: "banner" | "settings" | "migration";
};

export const DEFAULT_CONSENT: ConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  personalization: false,
  geolocation: false,
};

function isPreferences(value: unknown): value is ConsentPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ConsentPreferences>;
  return candidate.necessary === true
    && typeof candidate.analytics === "boolean"
    && typeof candidate.marketing === "boolean"
    && typeof candidate.personalization === "boolean"
    && typeof candidate.geolocation === "boolean";
}

export function readConsent(): ConsentReceipt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentReceipt>;
    if (parsed.version !== CONSENT_VERSION || !isPreferences(parsed.preferences) || !parsed.recordedAt) return null;
    return parsed as ConsentReceipt;
  } catch {
    return null;
  }
}

async function persistReceipt(receipt: ConsentReceipt) {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getUser();
    await (supabase as unknown as {
      from: (table: string) => { insert: (payload: Record<string, unknown>) => Promise<unknown> };
    }).from("consent_receipts").insert({
      user_id: data.user?.id ?? null,
      consent_version: receipt.version,
      necessary: true,
      analytics: receipt.preferences.analytics,
      marketing: receipt.preferences.marketing,
      personalization: receipt.preferences.personalization,
      geolocation: receipt.preferences.geolocation,
      source: receipt.source,
      user_agent: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 500),
      recorded_at: receipt.recordedAt,
    });
  } catch {
    // Browser state remains effective if the audit endpoint is temporarily unavailable.
  }
}

export async function saveConsent(
  preferences: Partial<ConsentPreferences>,
  source: ConsentReceipt["source"] = "settings",
) {
  const receipt: ConsentReceipt = {
    version: CONSENT_VERSION,
    preferences: { ...DEFAULT_CONSENT, ...preferences, necessary: true },
    recordedAt: new Date().toISOString(),
    source,
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(receipt));
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: receipt }));
  }
  await persistReceipt(receipt);
  return receipt;
}

export function hasConsent(category: Exclude<ConsentCategory, "necessary">) {
  return readConsent()?.preferences[category] === true;
}

export function openConsentSettings() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tok:open-consent-settings"));
  }
}
