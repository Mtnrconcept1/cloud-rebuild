import { getSupabase } from "@/integrations/supabase/client";
import { CONSENT_EVENT, CONSENT_VERSION, readConsent } from "@/lib/consent";
import {
  normalizeAcquisitionTouch,
  normalizeLandingPath,
  normalizeReferrerHost,
  readUtmFromSearch,
  type AcquisitionTouch,
} from "../../supabase/functions/_shared/marketing-utm";

export const FIRST_TOUCH_STORAGE_KEY = "tok_first_touch_v1";
/** A withdrawal made while signed out, honored server-side at the next sign-in. */
export const FIRST_TOUCH_FORGET_STORAGE_KEY = "tok_first_touch_forget_v1";
/** The server refuses older touches, so the browser forgets them too. */
export const FIRST_TOUCH_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_BOUND_ACCOUNTS = 5;
const MAX_TRACKED_PATHS = 200;
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returning from TOK itself, a payment page or a sign-in provider is navigation,
// not acquisition, and must never become someone's first touch.
const NON_ACQUISITION_REFERRERS = [
  /(^|\.)thetok\.ch$/,
  /(^|\.)stripe\.com$/,
  /(^|\.)supabase\.co$/,
  /^accounts\.google\.[a-z.]+$/,
  /^appleid\.apple\.com$/,
];

type StoredFirstTouch = AcquisitionTouch & { boundUserIds: string[] };

// Read before React renders: a redirect may later drop the landing query.
const bootLocation = typeof window === "undefined"
  ? null
  : { href: window.location.href, referrer: typeof document === "undefined" ? "" : document.referrer };

let initialized = false;
let currentUserId: string | null = null;
let marketingConsented = false;
let landingTouch: AcquisitionTouch | null = null;
let landingReported = false;
// Held in memory only while the visitor has not answered the consent banner.
let pendingTouch: AcquisitionTouch | null = null;
let pendingPageView: string | null = null;
const trackedPaths = new Set<string>();
const bindingsInFlight = new Set<string>();

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hasMarketingConsent() {
  return readConsent()?.preferences.marketing === true;
}

/** UTM and external referrer host of a landing URL; a direct visit is not a touch. */
export function captureAcquisitionTouch(input: { href: string; referrer?: string | null; now?: number }) {
  let url: URL;
  try {
    url = new URL(input.href);
  } catch {
    return null;
  }
  const referrerHost = normalizeReferrerHost(input.referrer);
  const external = referrerHost
    && referrerHost !== url.hostname.toLowerCase()
    && !NON_ACQUISITION_REFERRERS.some((pattern) => pattern.test(referrerHost))
    ? referrerHost
    : null;
  return normalizeAcquisitionTouch({
    utm: readUtmFromSearch(url.searchParams),
    referrerHost: external,
    landingPath: url.pathname,
    touchedAt: new Date(input.now ?? Date.now()).toISOString(),
  });
}

export function readStoredFirstTouch(storage = browserStorage(), now = Date.now()): StoredFirstTouch | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FIRST_TOUCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const touch = normalizeAcquisitionTouch(parsed);
    if (!touch) return null;
    const age = now - Date.parse(touch.touchedAt);
    if (age > FIRST_TOUCH_MAX_AGE_MS || age < -CLOCK_SKEW_MS) return null;
    const boundUserIds = Array.isArray(parsed.boundUserIds)
      ? parsed.boundUserIds.filter((id): id is string => typeof id === "string" && ACCOUNT_ID_PATTERN.test(id))
      : [];
    return { ...touch, boundUserIds: boundUserIds.slice(-MAX_BOUND_ACCOUNTS) };
  } catch {
    return null;
  }
}

function writeStoredFirstTouch(value: StoredFirstTouch, storage = browserStorage()) {
  try {
    storage?.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable: attribution is best effort.
  }
}

export function clearStoredFirstTouch(storage = browserStorage()) {
  try {
    storage?.removeItem(FIRST_TOUCH_STORAGE_KEY);
  } catch {
    // Storage unavailable.
  }
}

/** The first touch wins until it expires; nothing is stored without marketing consent. */
export function rememberFirstTouch(touch: AcquisitionTouch, storage = browserStorage(), now = Date.now()) {
  if (!storage || !hasMarketingConsent() || readStoredFirstTouch(storage, now)) return false;
  writeStoredFirstTouch({ ...touch, boundUserIds: [] }, storage);
  return true;
}

/** Sends the stored touch once per account; the server reads the account from the JWT. */
export async function bindFirstTouch(userId: string | null) {
  if (!userId || !hasMarketingConsent() || bindingsInFlight.has(userId)) return false;
  const storage = browserStorage();
  const stored = readStoredFirstTouch(storage);
  if (!stored || stored.boundUserIds.includes(userId)) return false;
  bindingsInFlight.add(userId);
  try {
    const { error } = await getSupabase().functions.invoke("track-analytics", {
      body: {
        kind: "acquisition",
        consentVersion: CONSENT_VERSION,
        marketingConsent: true,
        touch: {
          utm: stored.utm,
          referrerHost: stored.referrerHost,
          landingPath: stored.landingPath,
          touchedAt: stored.touchedAt,
        },
      },
    });
    if (error) {
      // A touch the server rejects will not become valid by retrying.
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 400) clearStoredFirstTouch(storage);
      return false;
    }
    const latest = readStoredFirstTouch(storage) ?? stored;
    writeStoredFirstTouch({
      ...latest,
      boundUserIds: [...latest.boundUserIds.filter((id) => id !== userId), userId].slice(-MAX_BOUND_ACCOUNTS),
    }, storage);
    return true;
  } catch {
    return false;
  } finally {
    bindingsInFlight.delete(userId);
  }
}

function setPendingForget(pending: boolean, storage = browserStorage()) {
  try {
    if (pending) storage?.setItem(FIRST_TOUCH_FORGET_STORAGE_KEY, "1");
    else storage?.removeItem(FIRST_TOUCH_FORGET_STORAGE_KEY);
  } catch {
    // Storage unavailable.
  }
}

function hasPendingForget(storage = browserStorage()) {
  try {
    return storage?.getItem(FIRST_TOUCH_FORGET_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

async function forgetFirstTouch() {
  try {
    const { error } = await getSupabase().functions.invoke("track-analytics", { body: { kind: "acquisition_forget" } });
    if (error) return false;
    setPendingForget(false);
    return true;
  } catch {
    return false;
  }
}

/** A pending erasure always runs before a new touch can be bound. */
async function syncSignedInAccount(userId: string) {
  if (hasPendingForget() && !await forgetFirstTouch()) return;
  await bindFirstTouch(userId);
}

/** Counted only with analytics consent; campaign fields only with marketing consent. */
export function trackPageView(pathname: string) {
  const path = normalizeLandingPath(pathname);
  if (!path || trackedPaths.has(path)) return;
  const receipt = readConsent();
  if (!receipt) {
    pendingPageView ??= path;
    return;
  }
  if (!receipt.preferences.analytics || trackedPaths.size >= MAX_TRACKED_PATHS) return;
  trackedPaths.add(path);
  const campaign = !landingReported && landingTouch && receipt.preferences.marketing
    ? { referrerHost: landingTouch.referrerHost, utm: landingTouch.utm }
    : {};
  landingReported = true;
  void getSupabase().functions
    .invoke("track-analytics", { body: { kind: "page_view", path, ...campaign } })
    .catch(() => undefined);
}

function handleConsentChange() {
  const receipt = readConsent();
  if (!receipt) return;
  const marketing = receipt.preferences.marketing;
  if (marketing) {
    if (pendingTouch) rememberFirstTouch(pendingTouch);
    if (currentUserId) void bindFirstTouch(currentUserId);
  } else {
    clearStoredFirstTouch();
    if (marketingConsented) {
      setPendingForget(true);
      if (currentUserId) void forgetFirstTouch();
    }
  }
  pendingTouch = null;
  marketingConsented = marketing;
  if (pendingPageView) {
    const path = pendingPageView;
    pendingPageView = null;
    trackPageView(path);
  }
}

/** Idempotent; mounted by the public client shell only. */
export function initAcquisitionAttribution(landing: { href: string; referrer?: string | null } | null = bootLocation) {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  marketingConsented = hasMarketingConsent();
  landingTouch = landing ? captureAcquisitionTouch(landing) : null;
  if (landingTouch) {
    if (!readConsent()) pendingTouch = landingTouch;
    else rememberFirstTouch(landingTouch);
  }
  window.addEventListener(CONSENT_EVENT, handleConsentChange);
  getSupabase().auth.onAuthStateChange((_event, session) => {
    currentUserId = session?.user?.id ?? null;
    const userId = currentUserId;
    // Leave the auth callback before invoking a function that reads the session.
    if (userId) window.setTimeout(() => void syncSignedInAccount(userId), 0);
  });
}

/** Test seam: module state otherwise lives for the page lifetime. */
export function resetAcquisitionAttributionForTests() {
  initialized = false;
  currentUserId = null;
  marketingConsented = false;
  landingTouch = null;
  landingReported = false;
  pendingTouch = null;
  pendingPageView = null;
  trackedPaths.clear();
  bindingsInFlight.clear();
  if (typeof window !== "undefined") window.removeEventListener(CONSENT_EVENT, handleConsentChange);
}
