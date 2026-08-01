import { KeychainAccess, SecureStorage } from "@aparajita/capacitor-secure-storage";

import { isNative } from "@/lib/platform";

const AUTH_STORAGE_PREFIX = "tok_auth_";

type AuthStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

const SHARED_AUTH_COOKIE_PREFIX = "tok_shared_auth_";
const SHARED_AUTH_COOKIE_DOMAIN = ".thetok.ch";
const SHARED_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const SHARED_AUTH_COOKIE_CHUNK_SIZE = 3_000;
const SHARED_AUTH_COOKIE_MAX_CHUNKS = 8;
const MARKETING_AUTH_HOST = "marketing.thetok.ch";

let secureStorageReady: Promise<void> | null = null;

async function ensureSecureStorageReady() {
  if (!secureStorageReady) {
    secureStorageReady = (async () => {
      await SecureStorage.setKeyPrefix(AUTH_STORAGE_PREFIX);
      await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
    })();
  }

  return secureStorageReady;
}

function canUseSharedAuthCookies() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname.toLowerCase().replace(/\.$/, "");
  return hostname === "thetok.ch" || hostname.endsWith(".thetok.ch");
}

function mustIsolateMarketingSession() {
  if (typeof window === "undefined") return false;
  return window.location.hostname.toLowerCase().replace(/\.$/, "") === MARKETING_AUTH_HOST;
}

function sharedCookieBaseName(key: string) {
  return `${SHARED_AUTH_COOKIE_PREFIX}${key.replace(/[^a-z0-9_-]/gi, "_")}`;
}

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(";")) {
    const candidate = part.trim();
    if (candidate.startsWith(prefix)) {
      return decodeURIComponent(candidate.slice(prefix.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Domain=${SHARED_AUTH_COOKIE_DOMAIN}; Max-Age=${SHARED_AUTH_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax; Secure`;
}

function deleteCookie(name: string) {
  const encodedName = encodeURIComponent(name);
  document.cookie = `${encodedName}=; Path=/; Domain=${SHARED_AUTH_COOKIE_DOMAIN}; Max-Age=0; SameSite=Lax; Secure`;
  document.cookie = `${encodedName}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

function encodeStorageValue(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeStorageValue(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function removeSharedCookieValue(key: string) {
  const baseName = sharedCookieBaseName(key);
  deleteCookie(`${baseName}_count`);
  for (let index = 0; index < SHARED_AUTH_COOKIE_MAX_CHUNKS; index += 1) {
    deleteCookie(`${baseName}_${index}`);
  }
}

function writeSharedCookieValue(key: string, value: string) {
  removeSharedCookieValue(key);
  const encoded = encodeStorageValue(value);
  const chunks = Array.from(
    { length: Math.max(1, Math.ceil(encoded.length / SHARED_AUTH_COOKIE_CHUNK_SIZE)) },
    (_, index) => encoded.slice(
      index * SHARED_AUTH_COOKIE_CHUNK_SIZE,
      (index + 1) * SHARED_AUTH_COOKIE_CHUNK_SIZE,
    ),
  );
  if (chunks.length > SHARED_AUTH_COOKIE_MAX_CHUNKS) {
    throw new Error("La session TOK dépasse la capacité du stockage partagé.");
  }
  chunks.forEach((chunk, index) => writeCookie(`${sharedCookieBaseName(key)}_${index}`, chunk));
  writeCookie(`${sharedCookieBaseName(key)}_count`, String(chunks.length));
}

function readSharedCookieValue(key: string) {
  const baseName = sharedCookieBaseName(key);
  const count = Number(readCookie(`${baseName}_count`));
  if (!Number.isInteger(count) || count < 1 || count > SHARED_AUTH_COOKIE_MAX_CHUNKS) {
    return null;
  }

  const chunks: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const chunk = readCookie(`${baseName}_${index}`);
    if (chunk === null) return null;
    chunks.push(chunk);
  }

  try {
    return decodeStorageValue(chunks.join(""));
  } catch {
    removeSharedCookieValue(key);
    return null;
  }
}

const webAuthStorage: AuthStorage = {
  getItem(key) {
    if (!canUseSharedAuthCookies()) return localStorage.getItem(key);

    const sharedValue = readSharedCookieValue(key);
    if (sharedValue !== null) {
      localStorage.removeItem(key);
      return sharedValue;
    }

    // Seamlessly migrate sessions created before the unified www.thetok.ch
    // login flow. The legacy value is removed once the shared copy exists.
    const legacyValue = localStorage.getItem(key);
    if (legacyValue !== null) {
      writeSharedCookieValue(key, legacyValue);
      localStorage.removeItem(key);
    }
    return legacyValue;
  },
  setItem(key, value) {
    if (!canUseSharedAuthCookies()) {
      localStorage.setItem(key, value);
      return;
    }
    writeSharedCookieValue(key, value);
    localStorage.removeItem(key);
  },
  removeItem(key) {
    if (canUseSharedAuthCookies()) removeSharedCookieValue(key);
    localStorage.removeItem(key);
  },
};

// The marketing console never persists a Supabase bearer token in browser
// storage. Its only credential is an opaque, host-only, HttpOnly BFF cookie.
// Keeping this adapter fail-closed also prevents a future generic AuthProvider
// mount from silently reintroducing a JavaScript-readable admin session.
const isolatedMarketingAuthStorage: AuthStorage = {
  getItem(key) {
    localStorage.removeItem(key);
    localStorage.removeItem(`tok_marketing_auth_${key}`);
    return null;
  },
  setItem(key, _value) {
    localStorage.removeItem(key);
    localStorage.removeItem(`tok_marketing_auth_${key}`);
  },
  removeItem(key) {
    localStorage.removeItem(key);
    localStorage.removeItem(`tok_marketing_auth_${key}`);
  },
};

const nativeAuthStorage: AuthStorage = {
  async getItem(key) {
    await ensureSecureStorageReady();

    const secureValue = await SecureStorage.getItem(key);
    if (secureValue !== null) {
      return secureValue;
    }

    const legacyValue = localStorage.getItem(key);
    if (legacyValue === null) {
      return null;
    }

    await SecureStorage.setItem(key, legacyValue);
    localStorage.removeItem(key);
    return legacyValue;
  },

  async setItem(key, value) {
    await ensureSecureStorageReady();
    await SecureStorage.setItem(key, value);
    localStorage.removeItem(key);
  },

  async removeItem(key) {
    await ensureSecureStorageReady();
    await SecureStorage.removeItem(key);
    localStorage.removeItem(key);
  },
};

export const authStorage: AuthStorage = isNative()
  ? nativeAuthStorage
  : mustIsolateMarketingSession()
    ? isolatedMarketingAuthStorage
    : webAuthStorage;
