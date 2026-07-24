export const PRIVACY_CONSENT_VERSION = "TOK-PRIVACY-2026-07-24-v1";
export const PRIVACY_CONSENT_STORAGE_KEY = "tok_privacy_consent_v1";
export const PRIVACY_ANONYMOUS_ID_STORAGE_KEY = "tok_privacy_anonymous_id_v1";
export const PRIVACY_CONSENT_CHANGE_EVENT = "tok:privacy-consent-change";
export const PRIVACY_CONSENT_OPEN_EVENT = "tok:privacy-consent-open";
export const PRIVACY_CONSENT_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;

export type OptionalPrivacyCategory =
  | "analytics"
  | "marketing"
  | "personalization"
  | "geolocation";

export type PrivacyConsentCategories = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
  geolocation: boolean;
};

export type PrivacyConsentAction =
  | "accept_all"
  | "reject_all"
  | "save_preferences"
  | "withdraw";

export type PrivacyConsentSource = "banner" | "settings" | "cookies_page" | "mobile";

export type StoredPrivacyConsent = {
  recordId: string;
  anonymousId: string;
  version: string;
  categories: PrivacyConsentCategories;
  action: PrivacyConsentAction;
  source: PrivacyConsentSource;
  clientRecordedAt: string;
  expiresAt: string;
  pendingSync: boolean;
  serverRecordedAt?: string | null;
};

export type PrivacyTechnologyInventoryItem = {
  id: string;
  name: string;
  category: "necessary" | OptionalPrivacyCategory;
  provider: string;
  storage: string;
  purpose: string;
  duration: string;
  required: boolean;
};

export const DEFAULT_PRIVACY_CATEGORIES: PrivacyConsentCategories = {
  necessary: true,
  analytics: false,
  marketing: false,
  personalization: false,
  geolocation: false,
};

export const PRIVACY_TECHNOLOGY_INVENTORY: PrivacyTechnologyInventoryItem[] = [
  {
    id: "tok-consent",
    name: PRIVACY_CONSENT_STORAGE_KEY,
    category: "necessary",
    provider: "TOK",
    storage: "Stockage local du navigateur ou stockage sécurisé de l’application",
    purpose: "Mémoriser les choix de confidentialité, leur version et leur date afin de respecter un refus ou un retrait.",
    duration: "12 mois au maximum, jusqu’au retrait ou jusqu’à une nouvelle version du consentement.",
    required: true,
  },
  {
    id: "tok-anonymous-id",
    name: PRIVACY_ANONYMOUS_ID_STORAGE_KEY,
    category: "necessary",
    provider: "TOK",
    storage: "Stockage local du navigateur ou stockage sécurisé de l’application",
    purpose: "Rattacher les modifications successives de consentement sans identifier directement un visiteur non connecté.",
    duration: "12 mois au maximum, puis renouvelé si une nouvelle décision est enregistrée.",
    required: true,
  },
  {
    id: "supabase-session",
    name: "sb-<projet>-auth-token",
    category: "necessary",
    provider: "Supabase pour TOK",
    storage: "Stockage local web; stockage sécurisé sur l’application native",
    purpose: "Authentification, renouvellement de session, séparation des rôles et protection des espaces privés.",
    duration: "Jusqu’à l’expiration ou au renouvellement du jeton, à la déconnexion ou à la suppression locale de la session.",
    required: true,
  },
  {
    id: "tok-theme",
    name: "theme",
    category: "necessary",
    provider: "TOK",
    storage: "Stockage local",
    purpose: "Conserver le choix d’affichage clair ou sombre.",
    duration: "Jusqu’au changement du réglage ou à la suppression du stockage local.",
    required: true,
  },
  {
    id: "tok-analytics-viewer",
    name: "miamz-analytics-viewer-v1",
    category: "analytics",
    provider: "TOK / Supabase",
    storage: "Stockage local et événements serveur de mesure",
    purpose: "Dédupliquer les mesures d’audience et comprendre l’utilisation des pages et fonctionnalités.",
    duration: "Aucun dépôt en cas de refus; 12 mois au maximum dans le navigateur lorsque la mesure est acceptée.",
    required: false,
  },
  {
    id: "tok-sponsored-attribution",
    name: "miamz-sponsored-attribution-v1",
    category: "marketing",
    provider: "TOK",
    storage: "Stockage local",
    purpose: "Attribuer une commande ou une réservation à un contenu sponsorisé précédemment cliqué.",
    duration: "24 heures après le clic, puis suppression automatique ou lors du retrait du consentement.",
    required: false,
  },
  {
    id: "tok-sponsored-rotation",
    name: "miamz-sponsored-rotation-v1 / miamz-sponsored-placement-selection-v1",
    category: "marketing",
    provider: "TOK",
    storage: "Stockage local",
    purpose: "Limiter les répétitions, répartir les emplacements sponsorisés et éviter les doublons d’affichage.",
    duration: "15 minutes pour la sélection d’emplacement; au plus tard jusqu’au retrait ou à l’expiration annuelle du consentement pour l’état de rotation.",
    required: false,
  },
  {
    id: "tok-personalization",
    name: "Signaux de personnalisation TOK",
    category: "personalization",
    provider: "TOK / Supabase",
    storage: "Compte utilisateur et traitement serveur; aucun cookie tiers publicitaire",
    purpose: "Adapter l’ordre des contenus, restaurants et recommandations aux préférences et interactions autorisées.",
    duration: "Aucun usage de personnalisation en cas de refus; jusqu’au retrait, à la suppression du compte ou à l’anonymisation prévue par la politique de conservation.",
    required: false,
  },
  {
    id: "tok-geolocation",
    name: "Autorisation de localisation du navigateur ou du système",
    category: "geolocation",
    provider: "Navigateur, système mobile et TOK",
    storage: "Permission système; aucune position stockée dans un cookie",
    purpose: "Afficher des restaurants proches, calculer une distance ou préremplir une zone uniquement après accord explicite.",
    duration: "Pour la demande en cours, ou selon la permission choisie dans le navigateur ou le système; révocable à tout moment.",
    required: false,
  },
];

const PROTECTED_STORAGE_KEYS: Record<string, OptionalPrivacyCategory> = {
  "miamz-analytics-viewer-v1": "analytics",
  "miamz-sponsored-attribution-v1": "marketing",
  "miamz-sponsored-rotation-v1": "marketing",
  "miamz-sponsored-placement-selection-v1": "marketing",
};

let storageGuardInstalled = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function randomUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function normalizeCategories(value: unknown): PrivacyConsentCategories | null {
  if (!isRecord(value)) return null;
  if (
    value.necessary !== true
    || !isBoolean(value.analytics)
    || !isBoolean(value.marketing)
    || !isBoolean(value.personalization)
    || !isBoolean(value.geolocation)
  ) {
    return null;
  }

  return {
    necessary: true,
    analytics: value.analytics,
    marketing: value.marketing,
    personalization: value.personalization,
    geolocation: value.geolocation,
  };
}

export function getPrivacyAnonymousId(storage: Storage | null = typeof window === "undefined" ? null : window.localStorage) {
  if (!storage) return randomUuid();
  const existing = storage.getItem(PRIVACY_ANONYMOUS_ID_STORAGE_KEY)?.trim();
  if (existing) return existing;
  const created = randomUuid();
  storage.setItem(PRIVACY_ANONYMOUS_ID_STORAGE_KEY, created);
  return created;
}

export function readPrivacyConsent(
  storage: Storage | null = typeof window === "undefined" ? null : window.localStorage,
  now = Date.now(),
): StoredPrivacyConsent | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(PRIVACY_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== PRIVACY_CONSENT_VERSION) return null;
    const categories = normalizeCategories(parsed.categories);
    if (!categories) return null;
    const expiresAt = typeof parsed.expiresAt === "string" ? Date.parse(parsed.expiresAt) : Number.NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
    if (
      typeof parsed.recordId !== "string"
      || typeof parsed.anonymousId !== "string"
      || typeof parsed.clientRecordedAt !== "string"
      || typeof parsed.action !== "string"
      || typeof parsed.source !== "string"
    ) {
      return null;
    }

    return {
      recordId: parsed.recordId,
      anonymousId: parsed.anonymousId,
      version: PRIVACY_CONSENT_VERSION,
      categories,
      action: parsed.action as PrivacyConsentAction,
      source: parsed.source as PrivacyConsentSource,
      clientRecordedAt: parsed.clientRecordedAt,
      expiresAt: parsed.expiresAt as string,
      pendingSync: parsed.pendingSync !== false,
      serverRecordedAt: typeof parsed.serverRecordedAt === "string" ? parsed.serverRecordedAt : null,
    };
  } catch {
    return null;
  }
}

export function isPrivacyCategoryAllowed(
  category: "necessary" | OptionalPrivacyCategory,
  storage?: Storage | null,
) {
  if (category === "necessary") return true;
  return readPrivacyConsent(storage)?.categories[category] === true;
}

export function createPrivacyConsentRecord(input: {
  categories: Omit<PrivacyConsentCategories, "necessary"> & { necessary?: true };
  action: PrivacyConsentAction;
  source: PrivacyConsentSource;
  storage?: Storage | null;
  now?: Date;
}): StoredPrivacyConsent {
  const storage = input.storage === undefined
    ? (typeof window === "undefined" ? null : window.localStorage)
    : input.storage;
  const now = input.now || new Date();
  return {
    recordId: randomUuid(),
    anonymousId: getPrivacyAnonymousId(storage),
    version: PRIVACY_CONSENT_VERSION,
    categories: {
      necessary: true,
      analytics: Boolean(input.categories.analytics),
      marketing: Boolean(input.categories.marketing),
      personalization: Boolean(input.categories.personalization),
      geolocation: Boolean(input.categories.geolocation),
    },
    action: input.action,
    source: input.source,
    clientRecordedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PRIVACY_CONSENT_VALIDITY_MS).toISOString(),
    pendingSync: true,
    serverRecordedAt: null,
  };
}

export function writePrivacyConsent(
  record: StoredPrivacyConsent,
  storage: Storage | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return;
  storage.setItem(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(record));
}

export function markPrivacyConsentSynced(
  recordId: string,
  serverRecordedAt: string,
  storage: Storage | null = typeof window === "undefined" ? null : window.localStorage,
) {
  const current = readPrivacyConsent(storage);
  if (!current || current.recordId !== recordId || !storage) return current;
  const updated: StoredPrivacyConsent = {
    ...current,
    pendingSync: false,
    serverRecordedAt,
  };
  writePrivacyConsent(updated, storage);
  return updated;
}

export function clearDisallowedPrivacyStorage(
  storage: Storage | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return;
  const consent = readPrivacyConsent(storage);
  for (const [key, category] of Object.entries(PROTECTED_STORAGE_KEYS)) {
    if (!consent?.categories[category]) storage.removeItem(key);
  }
}

export function dispatchPrivacyConsentChanged(record: StoredPrivacyConsent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_CHANGE_EVENT, { detail: record }));
}

export function openPrivacyConsentSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_OPEN_EVENT));
}

export function installPrivacyStorageGuard() {
  if (storageGuardInstalled || typeof window === "undefined" || typeof Storage === "undefined") return;
  storageGuardInstalled = true;

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.getItem = function privacyAwareGetItem(key: string) {
    const category = PROTECTED_STORAGE_KEYS[key];
    if (category && !isPrivacyCategoryAllowed(category, window.localStorage)) return null;
    return originalGetItem.call(this, key);
  };

  Storage.prototype.setItem = function privacyAwareSetItem(key: string, value: string) {
    const category = PROTECTED_STORAGE_KEYS[key];
    if (category && !isPrivacyCategoryAllowed(category, window.localStorage)) {
      originalRemoveItem.call(this, key);
      return;
    }
    originalSetItem.call(this, key, value);
  };

  clearDisallowedPrivacyStorage(window.localStorage);
  window.addEventListener(PRIVACY_CONSENT_CHANGE_EVENT, () => {
    clearDisallowedPrivacyStorage(window.localStorage);
  });
}

function parseRequestBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function isMarketingAnalyticsPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Array.isArray(value.events)) return value.events.some(isMarketingAnalyticsPayload);
  const source = typeof value.source === "string" ? value.source.toLowerCase() : "";
  const entityType = typeof value.entityType === "string" ? value.entityType.toLowerCase() : "";
  const eventName = typeof value.eventName === "string" ? value.eventName.toLowerCase() : "";
  return entityType === "ad" || source.includes("sponsor") || source.includes("campaign") || eventName.includes("sponsor");
}

function ignoredFunctionResponse(payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function privacyAwareFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (url.includes("/functions/v1/track-analytics")) {
    if (!isPrivacyCategoryAllowed("analytics")) {
      return Promise.resolve(ignoredFunctionResponse({ recorded: false, count: 0, ignored: true }));
    }
    if (!isPrivacyCategoryAllowed("marketing") && isMarketingAnalyticsPayload(parseRequestBody(init?.body))) {
      return Promise.resolve(ignoredFunctionResponse({ recorded: false, count: 0, ignored: true }));
    }
  }

  if (url.includes("/functions/v1/track-sponsored-event") && !isPrivacyCategoryAllowed("marketing")) {
    return Promise.resolve(ignoredFunctionResponse({ recorded: false, deduped: false, ignored: true }));
  }

  return globalThis.fetch(input, init);
}
